from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ctypes import c_void_p, c_byte
from uhf.handle import Api
from uhf.struct import TagInfo
from datetime import datetime
from typing import Dict, Optional
from config.database import get_db_connection
from testapi import get_device_sn
from ws_manager import manager  # ⭐ เพิ่มบรรทัดนี้
import logging
import time
import threading
import queue
import multiprocessing
from multiprocessing import Queue, Process
from device_scanner_service import run_device_scanner
from routers.notifications import create_notification
from routers.alerts import check_unauthorized_movement

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scan", tags=["scan"])

# ⭐ Global lock สำหรับ UHF operations

class DeviceSession:
    def __init__(self):
        self.device_id = None
        self.device_sn = None
        self.process = None  # Process object แทน api
        self.result_queue = None  # Queue รับผลจาก subprocess
        self.cmd_queue = None     # <- NEW: command queue เพื่อสั่ง subprocess
        self.is_connected = False
        self.location_id = None
        self.connection_type = "network"
        self.connection_info = ""
        self.current_scanned_tags = set()
        self.last_db_update_time = {}
        self.db_thread = None
        self.thread_stop = threading.Event()
        self.device_lock = threading.Lock()
        # ค่า runtime ที่อ่านจากระบบ (จะถูกตั้งตอนสร้าง session)
        self.scan_interval = None
        self.db_update_interval = None

# เก็บ sessions ของแต่ละเครื่อง
device_sessions: Dict[int, DeviceSession] = {}
device_lock = threading.Lock()
uhf_global_lock = threading.Lock()   # <-- เพิ่ม global lock สำหรับการใช้งาน UHF ที่ต้องป้องกัน

# Pydantic models
class ConnectRequest(BaseModel):
    location_id: int
    connection_type: str = "network"
    ip: str = "10.10.100.254"
    port: int = 8899
    timeout: int = 5000
    com_port: str = "COM9"
    baud_rate: int = 115200

class DeviceConfigRequest(BaseModel):
    config_key: str
    config_value: str

# =============== CONFIGURATION ===============
def get_system_config(key: str, default_value=None):
    """ดึงค่าการตั้งค่าระบบจากฐานข้อมูล"""
    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT `value` FROM system_config WHERE `key` = %s", (key,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        if row:
            value = row['value']
            if default_value is not None:
                if isinstance(default_value, int):
                    return int(float(value))
                elif isinstance(default_value, float):
                    return float(value)
                else:
                    return str(value)
            return value
        else:
            return default_value
    except Exception as e:
        logger.error(f"Error getting system config {key}: {e}")
        return default_value

def get_device_config(device_id: int, config_key: str, default_value=None):
    """ดึงค่าการตั้งค่าของเครื่องจากฐานข้อมูล"""
    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT config_value FROM device_configs WHERE device_id = %s AND config_key = %s", 
            (device_id, config_key)
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        if row:
            value = row['config_value']
            if default_value is not None:
                if isinstance(default_value, int):
                    return int(float(value))
                elif isinstance(default_value, float):
                    return float(value)
                else:
                    return str(value)
            return value
        else:
            return get_system_config(config_key, default_value)
    except Exception as e:
        logger.error(f"Error getting device config {device_id}.{config_key}: {e}")
        return default_value

def set_device_config(device_id: int, config_key: str, config_value: str):
    """ตั้งค่าเฉพาะเครื่อง"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO device_configs (device_id, config_key, config_value)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE 
                config_value = VALUES(config_value),
                updated_at = NOW()
        """, (device_id, config_key, config_value))
        conn.commit()
        cur.close()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Error setting device config {device_id}.{config_key}: {e}")
        return False

def update_device_status(device_id: int, status: str):
    """อัพเดทสถานะ device ในฐานข้อมูล"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            UPDATE rfid_devices 
            SET status = %s, updated_at = NOW() 
            WHERE device_id = %s
        """, (status, device_id))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        logger.error(f"Error updating device status: {e}")

def create_device_session(device_id: int) -> DeviceSession:
    """สร้าง session ใหม่สำหรับ device"""
    session = DeviceSession()
    session.device_id = device_id
    # อ่านค่าการตั้งค่าจาก system_config ตอนสร้าง session
    try:
        session.scan_interval = float(get_system_config('SCAN_INTERVAL', 0.1))
    except Exception:
        session.scan_interval = 0.1
    try:
        session.db_update_interval = float(get_system_config('DB_UPDATE_INTERVAL', 1))
    except Exception:
        session.db_update_interval = 1.0

    # เพิ่ม flag ป้องกัน enqueue ซ้ำซ้อน (เดิมมีในไฟล์)
    session.scan_pending = threading.Event()  # set() = งานอยู่ในคิว/กำลังสแกน
    session.last_device_config = None  # <- NEW: เก็บค่าสุดท้ายที่อ่านจากเครื่อง (dict)
    with device_lock:
        device_sessions[device_id] = session
    return session

def get_device_session(device_id: int) -> Optional[DeviceSession]:
    """ดึง session ของ device"""
    with device_lock:
        return device_sessions.get(device_id)

def remove_device_session(device_id: int):
    """ลบ session และหยุด subprocess"""
    with device_lock:
        if device_id in device_sessions:
            session = device_sessions[device_id]
            session.thread_stop.set()
            session.is_connected = False
            
            # หยุด subprocess
            if session.process and session.process.is_alive():
                session.process.terminate()
                session.process.join(timeout=5.0)
                if session.process.is_alive():
                    session.process.kill()
            
            time.sleep(1)
            del device_sessions[device_id]

# =============== CONNECTION FUNCTIONS ===============
def connect_serial(api, com_port="COM9", baud_rate=115200):
    """เชื่อมต่อผ่าน COM port"""
    h = c_void_p()
    port_bytes = com_port.encode('ascii')
    
    baud_code_map = {
        9600: 0x00, 19200: 0x01, 38400: 0x02, 
        57600: 0x03, 115200: 0x04
    }
    baud_code = baud_code_map.get(baud_rate, 0x04)
    
    for attempt in range(3):
        res = api.OpenDevice(h, port_bytes, c_byte(baud_code))
        
        if res == 0:
            break
        elif res == -254 and attempt < 2:
            logger.warning(f"COM port {com_port} busy, retrying in 2 seconds...")
            time.sleep(2.0)
            continue
        else:
            logger.error(f"OpenDevice failed: {res}")
            return None, res
    
    logger.info(f"Connected to {com_port} at {baud_rate} baud, handle={h.value}")
    
    if h.value == 0:
        logger.error("Invalid handle received")
        return None, -1
        
    return h, 0

def connect_network(api, ip="10.10.100.254", port=8899, timeout=5000):
    """เชื่อมต่อผ่าง Network"""
    h = c_void_p()
    ip_bytes = ip.encode('ascii')
    
    res = api.OpenNetConnection(h, ip_bytes, port, timeout)
    
    if res != 0:
        logger.error(f"OpenNetConnection failed: {res}")
        return None, res
        
    logger.info(f"Connected to {ip}:{port}, handle={h.value}")
    
    if h.value == 0:
        logger.error("Invalid handle received")
        return None, -1
        
    return h, 0

def attempt_reconnect(session: DeviceSession):
    """พยายามเชื่อมต่อใหม่สำหรับ device ที่มีปัญหา"""
    try:
        logger.info(f"Attempting to reconnect device {session.device_id}")

        with uhf_global_lock:
            try:
                if session.hComm and session.hComm.value:
                    session.api.CloseDevice(session.hComm)
            except:
                pass

            time.sleep(1.0)

            if session.connection_type == "com":
                hComm, res = connect_serial(session.api, session.connection_info.split('@')[0], int(session.connection_info.split('@')[1]))
            else:
                hComm, res = connect_network(session.api, session.connection_info.split(':')[0], int(session.connection_info.split(':')[1]), 3000)

            if res == 0 and hComm and hComm.value:
                session.hComm = hComm
                session.is_connected = True
                logger.info(f"Device {session.device_id} reconnected successfully")
                return True
            else:
                logger.error(f"Device {session.device_id} reconnection failed: {res}")
                session.is_connected = False
                return False

    except Exception as e:
        logger.error(f"Device {session.device_id} reconnection exception: {e}")
        session.is_connected = False
        return False

# =============== SCANNING FUNCTIONS ===============
def create_movement_notification(cur, tag_id: str, from_location_id, to_location_id, event_type: str, device_id: str):
    """สร้าง notification สำหรับการเคลื่อนไหว และ broadcast ทันที"""
    try:
        # สร้างข้อความแจ้งเตือน
        from_name = get_location_name(from_location_id) if from_location_id else "ไม่ระบุ"
        to_name = get_location_name(to_location_id) if to_location_id else "ไม่ระบุ"
        
        if event_type == "enter":
            title = f"🔍 Tag เข้าพื้นที่"
            message = f"Tag {tag_id} เข้าสู่ {to_name}"
        elif event_type == "exit":
            title = f"📤 Tag ออกจากพื้นที่"
            message = f"Tag {tag_id} ออกจาก {from_name}"
        else:
            title = f"🚚 Tag เคลื่อนย้าย"
            message = f"Tag {tag_id} เคลื่อนย้ายจาก {from_name} ไป {to_name}"

        # บันทึกลง database
        cur.execute("""
            INSERT INTO notifications 
            (type, title, message, asset_id, location_id, related_id, priority, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
        """, ("movement", title, message, None, to_location_id, None, "normal"))
        
        notif_id = cur.lastrowid
        
        # ⭐ ส่ง WebSocket notification ทันที (แบบ complete notification object)
        try:
            notification_payload = {
                "notif_id": notif_id,
                "id": notif_id,  # เพิ่ม id field เพื่อความแน่ใจ
                "type": "movement",
                "title": title,
                "message": message,
                "asset_id": None,
                "user_id": None,
                "location_id": to_location_id,
                "related_id": None,
                "is_read": False,
                "is_acknowledged": False,
                "priority": "normal",
                "timestamp": datetime.now().isoformat(),
                "created_at": datetime.now().isoformat()
            }
            
            # Broadcast notification ผ่าน WebSocket
            manager.queue_message(notification_payload)
            logger.info(f"📡 Broadcasted movement notification for tag {tag_id}: {title}")
            
        except Exception as e:
            logger.error(f"Failed to broadcast movement notification: {e}")
            
        return notif_id
        
    except Exception as e:
        logger.error(f"Failed to create movement notification for tag {tag_id}: {e}")
        return None

def handle_tag_movement(session: DeviceSession, conn, cur, tid: str, row: dict) -> bool:
    """ประมวลผลการเคลื่อนไหวของ tag เดียว"""
    try:
        current_tag_location = row.get("current_location_id")
        current_status = row.get("status")

        from_loc = current_tag_location
        to_loc = None
        event_type = None
        new_status = current_status
        action = ""

        if session.location_id == 1:
            if current_tag_location == 1:
                to_loc = 3
                event_type = "exit"
                new_status = "idle"
                action = "EXIT"
            elif current_tag_location == 3:
                to_loc = 1
                event_type = "enter"
                new_status = "in_use" if current_status != "borrowed" else "borrowed"
                action = "ENTER"
        elif session.location_id == 2:
            if current_tag_location == 2:
                to_loc = 3
                event_type = "exit"
                new_status = "idle"
                action = "EXIT"
            elif current_tag_location == 3:
                to_loc = 2
                event_type = "enter"
                new_status = "in_use" if current_status != "borrowed" else "borrowed"
                action = "ENTER"
        elif session.location_id == 3:
            # กรณีเข้าโซนกลาง (to location = 3)
            cur.execute("""
                UPDATE tags 
                SET current_location_id = %s, status = 'idle', device_id = %s, last_seen = NOW(), updated_at = NOW() 
                WHERE tag_id = %s
            """, (3, session.device_id, tid))

            if current_tag_location != 3:
                cur.execute("""
                    INSERT INTO movements (tag_id, from_location_id, to_location_id, timestamp, operator, event_type)
                    VALUES (%s, %s, %s, NOW(), %s, %s)
                    ON DUPLICATE KEY UPDATE
                        to_location_id = VALUES(to_location_id),
                        timestamp = NOW(),
                        operator = %s,
                        event_type = %s
                """, (tid, current_tag_location, 3, "system", "enter", "system", "enter"))

                # ⭐ สร้าง notification และ broadcast ทันที
                try:
                    create_movement_notification(cur, tid, current_tag_location, 3, "enter", session.device_id)
                except Exception as e:
                    logger.error(f"Failed to create enter notification for {tid}: {e}")

            logger.info(f"Device {session.device_id}: Tag {tid[:8]}... UPDATE location 3")
            return True

        # ถ้ามีการย้ายจาก/ไป
        if to_loc is not None:
            cur.execute("""
                UPDATE tags
                SET current_location_id = %s,
                    status = %s,
                    device_id = %s,
                    last_seen = NOW(),
                    updated_at = NOW()
                WHERE tag_id = %s
            """, (to_loc, new_status, session.device_id, tid))

            cur.execute("""
                INSERT INTO movements (tag_id, from_location_id, to_location_id, timestamp, operator, event_type)
                VALUES (%s, %s, %s, NOW(), %s, %s)
                ON DUPLICATE KEY UPDATE
                    to_location_id = VALUES(to_location_id),
                    timestamp = NOW(),
                    operator = %s,
                    event_type = %s
            """, (tid, from_loc, to_loc, "system", event_type, "system", event_type))

            # ⭐ สร้าง notification และ broadcast ทันที
            try:
                create_movement_notification(cur, tid, from_loc, to_loc, event_type, session.device_id)
            except Exception as e:
                logger.error(f"Failed to create movement notification for {tid}: {e}")

            # ตรวจสอบ unauthorized movement เฉพาะเมื่อเป็น 'exit'
            try:
                if event_type == "exit":
                    check_unauthorized_movement(conn, cur, tid, to_loc, operator="system")
            except Exception as e:
                logger.error(f"check_unauthorized_movement failed for {tid}: {e}")

            logger.info(f"Device {session.device_id}: Tag {tid[:8]}... {action} - {from_loc}→{to_loc}")
            return True

        return False

    except Exception as e:
        logger.error(f"Error in handle_tag_movement for {tid}: {e}")
        return False

def process_tags_to_db(session: DeviceSession, to_process: set):
    """ประมวลผล tags สำหรับเครื่องที่ระบุ"""
    processed_tags = []
    delay_seconds = get_device_config(session.device_id, 'DELAY_SECONDS', 20)

    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        for tid in list(to_process):
            try:
                # ตรวจสอบ delay
                if tid in session.last_db_update_time:
                    time_diff = (datetime.now() - session.last_db_update_time[tid]).total_seconds()
                    if time_diff < delay_seconds:
                        continue

                # ประมวลผล tag
                cur.execute(
                    "SELECT current_location_id, status, asset_id, COALESCE(authorized,0) as authorized FROM tags WHERE tag_id = %s",
                    (tid,)
                )
                row = cur.fetchone()

                if not row:
                    # Tag ใหม่ - ENTER event
                    cur.execute("""
                        INSERT INTO tags
                            (tag_id, status, current_location_id, device_id, first_seen, last_seen, authorized)
                        VALUES (%s, %s, %s, %s, NOW(), NOW(), 0)
                    """, (tid, 'in_use', session.location_id, session.device_id))
                    
                    cur.execute("""
                        INSERT INTO movements (tag_id, from_location_id, to_location_id, timestamp, operator, event_type)
                        VALUES (%s, %s, %s, NOW(), %s, %s)
                        ON DUPLICATE KEY UPDATE
                            to_location_id = VALUES(to_location_id),
                            timestamp = NOW(),
                            operator = %s,
                            event_type = %s
                    """, (tid, None, session.location_id, "system", "enter", "system", "enter"))
                    
                    # ⭐ สร้าง notification และ broadcast ทันที
                    try:
                        create_movement_notification(cur, tid, None, session.location_id, "enter", session.device_id)
                    except Exception as e:
                        logger.error(f"Failed to create enter notification for {tid}: {e}")

                    logger.info(f"Device {session.device_id}: Tag {tid[:8]}... ENTER location {session.location_id}")
                    processed_tags.append(tid)
                else:
                    # Tag มีอยู่แล้ว - ตรวจสอบ movement
                    processed = handle_tag_movement(session, conn, cur, tid, row)
                    if processed:
                        processed_tags.append(tid)

                # อัปเดต last_db_update_time หลังจากประมวลผลเสร็จ
                session.last_db_update_time[tid] = datetime.now()

            except Exception as e:
                logger.error(f"Error processing tag {tid}: {e}")
                continue

        conn.commit()

    except Exception as e:
        logger.error(f"Database error in process_tags_to_db: {e}")
        if conn:
            conn.rollback()
    finally:
        try:
            if cur:
                cur.close()
            if conn:
                conn.close()
        except Exception as e:
            logger.error(f"Error closing database connection: {e}")

    return processed_tags

def get_real_device_sn(connection_type: str, connection_info: str) -> str:
    """ดึง SN จริงจากเครื่อง RFID โดยใช้ testapi.get_device_sn แบบปลอดภัย"""
    api = Api()
    h = None
    try:
        if connection_type == "com":
            com_port, baud_rate = connection_info.split('@')
            h, res = connect_serial(api, com_port, int(baud_rate))   # ใช้ฟังก์ชันท้องถิ่นที่คืน (h,res)
        else:
            ip, port = connection_info.split(':')
            h, res = connect_network(api, ip, int(port))
        if h is None or res != 0:
            logger.error(f"Failed to connect for SN detection: res={res}")
            return None
        # testapi.get_device_sn(api, h) ควรรับ (api, h)
        real_sn = None
        try:
            real_sn = get_device_sn(api, h)
            logger.info(f"Real DeviceSN detected: {real_sn}")
        except Exception as e:
            logger.error(f"get_device_sn failed: {e}")
        return real_sn
    finally:
        try:
            if h and getattr(h, "value", None):
                api.CloseDevice(h)
        except:
            pass

# =============== API ENDPOINTS ===============

@router.post("/connect")
def connect_scanner(request: ConnectRequest):
    """เชื่อมต่อ Scanner ด้วย subprocess"""
    try:
        logger.info(f"=== Connect Request ===")
        logger.info(f"Location: {request.location_id}")
        logger.info(f"Type: {request.connection_type}")
        logger.info(f"IP: {request.ip}:{request.port}")
        
        # ตรวจสอบ location ซ้ำ
        for device_id, session in device_sessions.items():
            if session.location_id == request.location_id and session.is_connected:
                return {
                    "status": "already_connected",
                    "device_id": device_id,
                    "device_sn": session.device_sn,
                    "message": f"มีเครื่องเชื่อมต่อ location {request.location_id} อยู่แล้ว"
                }
        
        # สร้าง connection info
        if request.connection_type == "com":
            connection_info = f"{request.com_port}@{request.baud_rate}"
        else:
            connection_info = f"{request.ip}:{request.port}"
        
        # ⭐ ทดสอบการเชื่อมต่อจริงก่อน
        logger.info("Testing actual connection...")
        real_sn = get_real_device_sn(request.connection_type, connection_info)
        
        if not real_sn:
            raise HTTPException(400, f"ไม่สามารถเชื่อมต่อกับ RFID Scanner ได้ ({connection_info})")
        
        sn = str(real_sn)
        logger.info(f"✅ Connection verified, Device SN: {sn}")
        
        # บันทึก DB
        conn = get_db_connection()
        cur = conn.cursor()
        try:
            cur.execute("""
                INSERT INTO rfid_devices 
                (device_sn, location_id, connection_type, connection_info, status, last_connected) 
                VALUES (%s, %s, %s, %s, 'online', NOW())
                ON DUPLICATE KEY UPDATE 
                    location_id = VALUES(location_id),
                    connection_type = VALUES(connection_type),
                    connection_info = VALUES(connection_info),
                    status = 'online',
                    last_connected = NOW(),
                    updated_at = NOW()
            """, (sn, request.location_id, request.connection_type, connection_info))
            
            if cur.lastrowid:
                device_id = cur.lastrowid
            else:
                cur.execute("SELECT device_id FROM rfid_devices WHERE device_sn = %s", (sn,))
                result = cur.fetchone()
                device_id = result[0] if result else None
            
            if not device_id:
                raise HTTPException(500, "ไม่สามารถได้ device_id จากฐานข้อมูล")
            
            conn.commit()
        finally:
            cur.close()
            conn.close()
        
        # สร้าง session และ subprocess
        session = create_device_session(device_id)
        session.device_sn = sn
        session.location_id = request.location_id
        session.connection_type = request.connection_type
        session.connection_info = connection_info
        
        # สร้าง subprocess สำหรับ device นี้
        session.result_queue = Queue()
        session.cmd_queue = Queue()  # <-- สร้าง command queue และส่งเข้า subprocess
        device_config = {
            'device_id': device_id,
            'location_id': request.location_id,
            'connection_type': request.connection_type,
            'connection_info': connection_info,
            # ส่งค่า scan/db interval ให้ subprocess ใช้
            'scan_interval': session.scan_interval,
            'db_update_interval': session.db_update_interval
        }
        
        session.process = Process(
            target=run_device_scanner, 
            args=(device_config, session.result_queue, session.cmd_queue),
            daemon=True
        )
        session.process.start()
        
        # ⭐ รอให้ subprocess เชื่อมต่อสำเร็จ
        logger.info("Waiting for subprocess to establish connection...")
        time.sleep(3.0)  # รอให้ subprocess connect
        
        # ตรวจสอบว่า subprocess ยังทำงานอยู่
        if not session.process.is_alive():
            session.is_connected = False
            remove_device_session(device_id)
            raise HTTPException(500, "Subprocess failed to start or crashed immediately")
        
        session.is_connected = True
        
        # เริ่ม DB thread (รับผลจาก queue)
        session.db_thread = threading.Thread(target=result_processor_loop, args=(session,), daemon=True)
        session.db_thread.start()
        
        logger.info(f"✅ Device {device_id} connected successfully: SN={sn}, Location={request.location_id}")
        
        return {
            "status": "connected",
            "device_id": device_id,
            "device_sn": sn,
            "location_id": request.location_id,
            "connection_type": request.connection_type,
            "connection_info": connection_info,
            "message": f"เชื่อมต่อสำเร็จ {connection_info}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in connect_scanner: {e}")
        raise HTTPException(500, f"เกิดข้อผิดพลาดในการเชื่อมต่อ: {str(e)}")

def result_processor_loop(session: DeviceSession):
    """Thread รับผลจาก subprocess และประมวลผล DB"""
    #logger.info(f"Result processor started for device {session.device_id}")
    
    # ค่า fallback ถ้าไม่กำหนด
    db_interval = float(session.db_update_interval or 1.0)
    
    while not session.thread_stop.is_set() and session.is_connected:
        try:
            # รับผลจาก subprocess (timeout ตาม DB_UPDATE_INTERVAL)
            if session.result_queue:
                try:
                    result_data = session.result_queue.get(timeout=max(0.1, db_interval))
                except queue.Empty:
                    # ไม่มีข้อมูลภายในช่วงเวลา ให้วน loop อีกครั้ง
                    continue
                
                # ถ้ามีสัญญาณสถานะจาก subprocess (เชื่อมต่อ/ล้มเหลว)
                if isinstance(result_data, dict) and result_data.get('status'):
                    status = result_data.get('status')
                    if status == 'connection_failed':
                        logger.error(f"Device {session.device_id} subprocess connection failed")
                        session.is_connected = False
                        break
                    elif status == 'connected':
                        logger.info(f"Device {session.device_id} subprocess connected successfully")
                        # ถ้า subprocess ส่ง real_sn ให้เก็บ
                        real_sn = result_data.get('real_sn')
                        if real_sn:
                            session.device_sn = real_sn
                        continue
                
                # ⭐ ถ้าเป็น params response ให้ข้าม - ปล่อยให้ get_scanner_config จัดการ
                if isinstance(result_data, dict) and result_data.get('cmd') == 'params':
                    # ไม่ประมวลผลที่นี่ - ปล่อยให้ get_scanner_config อ่านจาก queue
                    # แต่ต้องส่งกลับไปใน queue เพราะเราอ่านออกมาแล้ว
                    try:
                        session.result_queue.put(result_data, timeout=0.1)
                    except:
                        pass
                    continue
                
                # ปกติ: ประมวลผล tags
                if isinstance(result_data, dict) and 'tags' in result_data:
                    tags = set(result_data['tags'])
                    if tags:
                        with session.device_lock:
                            session.current_scanned_tags.update(tags)
                        # ประมวลผล DB (ใช้การคัดกรอง DELAY_SECONDS ภายใน)
                        process_tags_to_db(session, tags)
                else:
                    # ถ้า message รูปแบบอื่น ๆ ให้ข้าม
                    continue
            else:
                time.sleep(max(0.1, db_interval))
                
        except Exception as e:
            logger.error(f"Device {session.device_id} result processor error: {e}")
            time.sleep(1.0)
    
    logger.info(f"Result processor stopped for device {session.device_id}")

@router.post("/disconnect/{device_id}")
def disconnect_device(device_id: int):
    """ตัดการเชื่อมต่อเครื่องที่ระบุ"""
    session = get_device_session(device_id)
    if not session:
        raise HTTPException(404, f"ไม่พบ device {device_id}")
    
    try:
        session.is_connected = False
        session.thread_stop.set()
        
        update_device_status(device_id, 'offline')
        time.sleep(2.0)
        remove_device_session(device_id)
        
        return {
            "status": "disconnected",
            "device_id": device_id,
            "message": f"ตัดการเชื่อมต่อ device {device_id} เรียบร้อยแล้ว"
        }
    except Exception as e:
        logger.error(f"Error disconnecting device {device_id}: {e}")
        raise HTTPException(500, f"ไม่สามารถตัดการเชื่อมต่อได้: {str(e)}")

@router.get("/devices")
def list_devices():
    """ดึงรายการ devices ทั้งหมด"""
    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT d.*, l.name as location_name 
            FROM rfid_devices d 
            LEFT JOIN locations l ON d.location_id = l.location_id 
            ORDER BY d.last_connected DESC, d.created_at DESC
        """)
        devices = cur.fetchall()
        cur.close()
        conn.close()
        
        for device in devices:
            device_id = device['device_id']
            session = get_device_session(device_id)
            device['is_connected'] = session.is_connected if session else False
            device['current_tags_count'] = len(session.current_scanned_tags) if session else 0
        
        return {"devices": devices}
        
    except Exception as e:
        logger.error(f"Error listing devices: {e}")
        raise HTTPException(500, f"ไม่สามารถดึงรายการ devices ได้: {str(e)}")

@router.get("/status")
def get_overall_status():
    """ดึงสถานะรวมของระบบ"""
    device_status = []
    total_scanned = 0
    total_tracked = 0
    
    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)
        
        cur.execute("""
            SELECT 
                d.device_id,
                d.device_sn,
                d.location_id,
                d.status,
                d.connection_type,
                d.connection_info,
                l.name as location_name,
                COUNT(t.tag_id) as tracked_count
            FROM rfid_devices d
            LEFT JOIN locations l ON d.location_id = l.location_id
            LEFT JOIN tags t ON d.device_id = t.device_id
            GROUP BY d.device_id
            ORDER BY d.device_id
        """)
        
        db_devices = cur.fetchall()
        cur.close()
        conn.close()
        
        for db_device in db_devices:
            device_id = db_device['device_id']
            session = get_device_session(device_id)
            
            scanned_count = len(session.current_scanned_tags) if session else 0
            tracked_count = db_device['tracked_count'] or 0
            
            device_info = {
                "device_id": device_id,
                "device_sn": db_device['device_sn'],
                "location_id": db_device['location_id'],
                "location_name": db_device['location_name'],
                "is_connected": session.is_connected if session else False,
                "scanned_count": scanned_count,
                "tracked_count": tracked_count,
                "process_alive": session.process.is_alive() if session and session.process else False,
                "db_thread_alive": session.db_thread.is_alive() if session and session.db_thread else False,
                "connection_type": db_device['connection_type'],
                "connection_info": db_device['connection_info']
            }
            
            device_status.append(device_info)
            total_scanned += scanned_count
            total_tracked += tracked_count
        
    except Exception as e:
        logger.error(f"Error getting status from database: {e}")
        for device_id, session in device_sessions.items():
            scanned_count = len(session.current_scanned_tags)
            device_status.append({
                "device_id": device_id,
                "device_sn": session.device_sn,
                "location_id": session.location_id,
                "location_name": f"Location {session.location_id}",
                "is_connected": session.is_connected,
                "scanned_count": scanned_count,
                "tracked_count": 0,
                "process_alive": session.process.is_alive() if session.process else False,
                "db_thread_alive": session.db_thread.is_alive() if session.db_thread else False,
                "connection_type": session.connection_type,
                "connection_info": session.connection_info
            })
            total_scanned += scanned_count
    
    return {
        "connected_devices": len([d for d in device_status if d["is_connected"]]),
        "total_devices": len(device_status),
        "total_scanned_tags": total_scanned,
        "total_tracked_tags": total_tracked,
        "devices": device_status
    }

@router.get("/scanner-config/{device_id}")
def get_scanner_config(device_id: int):
    """ดึงการตั้งค่าของ scanner เฉพาะเครื่องที่ระบุ โดยไม่ restart ถ้าไม่มีการเปลี่ยนแปลง"""
    session = get_device_session(device_id)
    if not session:
        # เปลี่ยนจาก 404 -> 400 เพื่อสื่อว่าไม่มีการเชื่อมต่อ/ไม่มี session ที่ active
        raise HTTPException(400, "เครื่องไม่ได้เชื่อมต่อ")

    if not session.is_connected or not session.process or not session.process.is_alive():
        raise HTTPException(400, f"Device {device_id} ไม่ได้เชื่อมต่ออยู่")
    
    try:
        #logger.info(f"Requesting device params for device {device_id} via IPC...")
        
        # ส่งคำสั่งให้ subprocess อ่านพารามิเตอร์ (ไม่ต้อง kill)
        cmd = {'cmd': 'get_params', 'device_id': device_id}
        try:
            session.cmd_queue.put(cmd, timeout=1.0)
            #logger.info(f"Command sent to device {device_id}")
        except Exception as e:
            logger.error(f"Failed to send get_params command: {e}")
            raise HTTPException(500, "ไม่สามารถส่งคำสั่งไปยัง subprocess ได้")
        
        # รอผลจาก result_queue (กรอง message อื่น ๆ ที่มาจาก scan)
        timeout = 8.0
        start = time.time()
        params = None
        attempts = 0
        while time.time() - start < timeout:
            attempts += 1
            try:
                remaining_time = max(0.5, timeout - (time.time() - start))
                item = session.result_queue.get(timeout=remaining_time)
                #logger.debug(f"Device {device_id} received item (attempt {attempts}): {type(item)} - {item.get('cmd') if isinstance(item, dict) else 'not dict'}")
            except queue.Empty:
                #logger.warning(f"Device {device_id} queue timeout after {attempts} attempts")
                break
            if isinstance(item, dict) and item.get('cmd') == 'params' and item.get('device_id') == device_id:
                if 'error' in item:
                    logger.error(f"Device {device_id} params error: {item['error']}")
                    raise HTTPException(500, f"Device error: {item['error']}")
                params = item.get('params')
                #logger.info(f"Device {device_id} received params successfully")
                break
            else:
                # ส่งกลับ message ที่ไม่ใช่ params เพื่อให้ result_processor_loop ประมวลผล
                try:
                    session.result_queue.put(item, timeout=0.1)
                except:
                    pass
                continue
        
        if params is None:
            logger.error(f"Device {device_id} timeout waiting for params after {attempts} attempts")
            raise HTTPException(504, "Timeout waiting for device params")
        
        # แปลงเป็น list ตาม format เดิม
        configs = [
            {"key": "WorkMode", "value": str(params.get('WORKMODE')), "description": f"Device {device_id}: โหมดการทำงาน"},
            {"key": "FreqBand", "value": str(params.get('REGION')), "description": f"Device {device_id}: ย่านความถี่"},
            {"key": "RfPower", "value": str(params.get('RFIDPOWER')), "description": f"Device {device_id}: กำลังส่งสัญญาณ"},
            {"key": "ANT", "value": str(params.get('ANT')), "description": f"Device {device_id}: จำนวนเสา"},
            {"key": "QValue", "value": str(params.get('QVALUE')), "description": f"Device {device_id}: QValue"},
            {"key": "Session", "value": str(params.get('SESSION')), "description": f"Device {device_id}: Session"},
            {"key": "INTERFACE", "value": str(params.get('INTERFACE')), "description": f"Device {device_id}: Interface"},
            {"key": "BAUDRATE", "value": str(params.get('BAUDRATE')), "description": f"Device {device_id}: Baudrate"},
            {"key": "FilterTime", "value": str(params.get('FILTERTIME')), "description": f"Device {device_id}: FilterTime"},
            {"key": "BuzzerTime", "value": str(params.get('BUZZERTIME')), "description": f"Device {device_id}: BuzzerTime"}
        ]
        
        # เช็คว่ามีการเปลี่ยนแปลงเมื่อเทียบกับ cache ถ้าไม่มีการเปลี่ยนไม่ต้อง restart / ไม่ต้องทำอะไร
        if session.last_device_config is not None and session.last_device_config == params:
            #logger.info(f"No configuration change for device {device_id} -> skipping restart/refresh")
            return {"status": "no_change", "device_id": device_id, "configs": configs}
        
        # อัปเดต cache แล้ว return ค่า
        session.last_device_config = params
        #logger.info(f"Device {device_id} config updated (cache refreshed)")
        return configs
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting scanner config for device {device_id}: {e}")
        raise HTTPException(500, f"ไม่สามารถดึงการตั้งค่าได้: {str(e)}")

@router.post("/scanner-config/refresh/{device_id}")
def refresh_scanner_config(device_id: int):
    """รีเฟรชการตั้งค่าจาก scanner เฉพาะเครื่องที่ระบุ"""
    session = get_device_session(device_id)
    if not session:
        raise HTTPException(400, f"Device {device_id} ไม่ได้เชื่อมต่อ (no active session)")
    
    if not session.is_connected:
        raise HTTPException(400, f"Device {device_id} ไม่ได้เชื่อมต่ออยู่")
    
    try:
        #logger.info(f"Refreshing config for device {device_id}")
        
        # เรียกใช้ get_scanner_config เพื่อดึงค่าใหม่
        configs = get_scanner_config(device_id)
        
        return {
            "status": "refreshed",
            "device_id": device_id,
            "count": len(configs),
            "message": f"รีเฟรชการตั้งค่า device {device_id} สำเร็จ ({len(configs)} รายการ)"
        }
        
    except Exception as e:
        logger.error(f"Error refreshing scanner config for device {device_id}: {e}")
        raise HTTPException(500, f"ไม่สามารถรีเฟรชการตั้งค่าได้: {str(e)}")

@router.put("/scanner-config/{device_id}")
def update_scanner_config(device_id: int, config: DeviceConfigRequest):
    """อัปเดตการตั้งค่าของ scanner เฉพาะเครื่องที่ระบุ"""
    session = get_device_session(device_id)
    if not session:
        raise HTTPException(404, f"ไม่พบ device {device_id}")

    if not session.is_connected:
        raise HTTPException(400, f"Device {device_id} ไม่ได้เชื่อมต่ออยู่")

    try:
        key = config.config_key
        value = config.config_value
        #logger.info(f"Updating {key} = {value} for device {device_id}")

        # validation rules
        validation_rules = {
            "WorkMode": ([0, 1, 2], None, "Work Mode must be 0 (Answer), 1 (Active), or 2 (Trigger)"),
            "RfPower": (0, 33, "RF Power must be between 0-33 dBm"),
            "ANT": (1, 16, "Antenna count must be between 1-16"),
            "QValue": (0, 15, "Q-Value must be between 0-15"),
            "Session": (0, 3, "Session must be between 0-3"),
            "FreqBand": (0, 255, "FreqBand (region) must be 0-255 or hex like 0x80")
        }

        if key in validation_rules:
            rule = validation_rules[key]
            try:
                if isinstance(rule[0], list):
                    if int(value, 0) not in rule[0]:
                        raise HTTPException(400, rule[2])
                else:
                    if key == "FreqBand":
                        v = int(value, 0)
                    else:
                        v = int(value)
                    if not (rule[0] <= v <= rule[1]):
                        raise HTTPException(400, rule[2])
            except ValueError:
                raise HTTPException(400, f"Invalid value format for {key}")

        # stop subprocess & DB thread safely
        if session.process and session.process.is_alive():
            session.process.terminate()
            session.process.join(timeout=4.0)
            if session.process.is_alive():
                session.process.kill()
                session.process.join(timeout=2.0)

        if session.db_thread and session.db_thread.is_alive():
            session.thread_stop.set()
            session.db_thread.join(timeout=3.0)

        # give hardware time to free the port
        time.sleep(2.0)

        api = Api()
        h = None
        result_message = ""

        # do UHF operations under global lock
        with uhf_global_lock:
            # connect to device
            if session.connection_type == "com":
                com_port, baud_rate = session.connection_info.split('@')
                h, res = connect_serial(api, com_port, int(baud_rate))
            else:
                ip, port = session.connection_info.split(':')
                h, res = connect_network(api, ip, int(port))

            if h is None or res != 0:
                raise Exception(f"Failed to connect: {res}")

            # try to stop inventory (multiple attempts)
            for _ in range(5):
                try:
                    stop_res = api.InventoryStop(h, 1000)
                    if stop_res in [0, -249]:
                        break
                except Exception:
                    pass
                time.sleep(0.25)

            # short pause
            time.sleep(0.5)

            # read current params with retries
            from uhf.struct import DeviceFullInfo
            from ctypes import byref
            info = DeviceFullInfo()
            get_attempts = 3
            last_exc = None
            for attempt in range(get_attempts):
                try:
                    res = api.GetDevicePara(h, byref(info))
                    # If Api returns non-zero it should raise or we check res
                    if isinstance(res, int) and res != 0:
                        raise Exception(f"GetDevicePara returned {res}")
                    break
                except Exception as e:
                    last_exc = e
                    logger.warning(f"GetDevicePara attempt {attempt+1} failed: {e}. retrying...")
                    time.sleep(0.6)
            else:
                raise Exception(f"GetDevicePara failed after {get_attempts} attempts: {last_exc}")

            # update fields based on key
            if key == "WorkMode":
                mode_val = int(value)
                info.WORKMODE = mode_val
                result_message = f"Work Mode set to {mode_val}"
            elif key == "FreqBand":
                try:
                    region_val = int(value, 0)
                except ValueError:
                    raise Exception("Invalid FreqBand value format")
                if not (0 <= region_val <= 255):
                    raise Exception("FreqBand out of range (0-255)")
                info.REGION = region_val
                result_message = f"FreqBand (region) set to {region_val}"
            elif key == "RfPower":
                power_val = int(value)
                info.RFIDPOWER = power_val
                result_message = f"RF Power set to {power_val} dBm"
            elif key == "ANT":
                ant_val = int(value)
                info.ANT = ant_val
                result_message = f"Antenna count set to {ant_val}"
            elif key == "QValue":
                q_val = int(value)
                info.QVALUE = q_val
                result_message = f"Q-Value set to {q_val}"
            elif key == "Session":
                session_val = int(value)
                info.SESSION = session_val
                result_message = f"Session set to {session_val}"
            else:
                raise Exception(f"Unsupported parameter: {key}")

            # send updated params to device
            res = api.SetDevicePara(h, info)
            if isinstance(res, int) and res != 0:
                raise Exception(f"SetDevicePara failed: {res}")

        # after lock: persist and restart subprocess
        set_device_config(device_id, key, value)
        #logger.info(f"Successfully updated {key} = {value} for device {device_id}")

        # close temporary connection if open
        try:
            if h and getattr(h, 'value', None):
                api.CloseDevice(h)
        except:
            pass

        # restart subprocess so it picks up new config
        _restart_device_subprocess(session)

        return {
            "status": "success",
            "device_id": device_id,
            "key": key,
            "value": value,
            "message": f"Device {device_id}: {result_message}"
        }

    except HTTPException:
        raise
    except Exception as e:
        # try to restart subprocess even on error
        try:
            _restart_device_subprocess(session)
        except:
            pass
        #logger.error(f"Error updating scanner config for device {device_id}: {e}")
        raise HTTPException(500, f"ไม่สามารถอัปเดตการตั้งค่าได้: {str(e)}")

def _restart_device_subprocess(session: DeviceSession):
    """เริ่ม subprocess ของ device ใหม่หลังหยุดชั่วคราว"""
    try:
        # รีเซ็ทสถานะ
        session.thread_stop.clear()
        
        # สร้าง queue ใหม่
        session.result_queue = Queue()
        # ถ้าคำสั่งเก่าไม่มีหรือปิด ให้สร้างใหม่
        if not getattr(session, 'cmd_queue', None):
            session.cmd_queue = Queue()
        
        # สร้าง subprocess ใหม่
        device_config = {
            'device_id': session.device_id,
            'location_id': session.location_id,
            'connection_type': session.connection_type,
            'connection_info': session.connection_info,
            'scan_interval': session.scan_interval,
            'db_update_interval': session.db_update_interval
        }
        
        session.process = Process(
            target=run_device_scanner, 
            args=(device_config, session.result_queue, session.cmd_queue),
            daemon=True
        )
        session.process.start()
        
        # เริ่ม DB thread ใหม่
        session.db_thread = threading.Thread(target=result_processor_loop, args=(session,), daemon=True)
        session.db_thread.start()
        
        # รอให้ subprocess เชื่อมต่อ
        time.sleep(2.0)
        
        if session.process.is_alive():
            session.is_connected = True
            logger.info(f"Device {session.device_id} subprocess restarted successfully")
        else:
            session.is_connected = False
            logger.error(f"Device {session.device_id} subprocess failed to restart")
            
    except Exception as e:
        logger.error(f"Failed to restart subprocess for device {session.device_id}: {e}")
        session.is_connected = False

def get_location_name(location_id):
    """แปลง location_id เป็นชื่อ location"""
    if location_id is None:
        return "ไม่ระบุ"
    
    location_names = {
        1: "โรงงาน", 
        2: "ห้องช่าง",
        3: "นอกพื้นที่"
    }
    return location_names.get(location_id, f"Location {location_id}")