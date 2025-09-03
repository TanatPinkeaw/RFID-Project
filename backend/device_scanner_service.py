"""
RFID Device Scanner Service - บริการสแกน RFID แบบ Standalone
================================================================

ไฟล์นี้จัดการการสแกน RFID ของอุปกรณ์หนึ่งเครื่องใน subprocess แยกต่างหาก
เพื่อให้สามารถจัดการหลายเครื่องพร้อมกันได้

โครงสร้างการทำงาน:
1. DeviceScannerService: คลาสหลักที่จัดการการเชื่อมต่อและการสแกน
2. run_device_scanner(): Entry point สำหรับการรัน subprocess
3. การสื่อสารระหว่าง process ผ่าน Queue

คุณสมบัติหลัก:
- เชื่อมต่อผ่าน COM port หรือ Network
- สแกน RFID tags อย่างต่อเนื่อง
- ส่งผลลัพธ์กลับไป main process ผ่าน Queue
- รองรับการรับคำสั่งจาก main process
- ดึง Serial Number จริงของอุปกรณ์

การใช้งาน:
- ถูกเรียกใช้จาก main process ผ่าน multiprocessing
- แต่ละอุปกรณ์จะมี process แยกกัน
- สื่อสารผ่าน result_queue และ cmd_queue
"""

import sys
import time
import json
import logging
from multiprocessing import Queue, Process
from uhf.handle import Api
from uhf.struct import TagInfo, GetDeviceInfo as GDI_Struct
from ctypes import c_void_p, c_byte, pointer
import argparse
import queue as _queue

logger = logging.getLogger(__name__)

class DeviceScannerService:
    """
    คลาสสำหรับจัดการการสแกน RFID ของอุปกรณ์หนึ่งเครื่อง
    
    Attributes:
        device_id: ID ของอุปกรณ์ในฐานข้อมูล
        location_id: ID สถานที่ที่อุปกรณ์ติดตั้ง
        connection_type: ประเภทการเชื่อมต่อ ('com' หรือ 'network')
        connection_info: ข้อมูลการเชื่อมต่อ (COM7@115200 หรือ IP:Port)
        api: Object สำหรับเรียกใช้ UHF API
        hComm: Handle ของการเชื่อมต่อ
        is_connected: สถานะการเชื่อมต่อ
        running: สถานะการทำงานของ service
        scan_interval: ช่วงเวลาระหว่างการสแกน (วินาที)
        db_update_interval: ช่วงเวลาการอัพเดตฐานข้อมูล (วินาที)
    """
    
    def __init__(self, device_config):
        """
        สร้าง instance ของ DeviceScannerService
        
        Args:
            device_config (dict): การตั้งค่าอุปกรณ์
                - device_id: ID ของอุปกรณ์
                - location_id: ID สถานที่
                - connection_type: 'com' หรือ 'network'
                - connection_info: ข้อมูลการเชื่อมต่อ
                - scan_interval: ช่วงเวลาสแกน (optional)
                - db_update_interval: ช่วงเวลาอัพเดต DB (optional)
        """
        self.device_id = device_config['device_id']
        self.location_id = device_config['location_id']
        self.connection_type = device_config['connection_type']
        self.connection_info = device_config['connection_info']
        self.api = Api()
        self.hComm = None
        self.is_connected = False
        self.running = True
        # อ่านค่าที่ส่งมาจาก main process (ถ้ามี)
        self.scan_interval = float(device_config.get('scan_interval', 0.3))
        self.db_update_interval = float(device_config.get('db_update_interval', 1.0))
        self.result_queue = None
        self.cmd_queue = None

    def get_device_sn_internal(self):
        """
        ดึง Serial Number จริงของอุปกรณ์จากฮาร์ดแวร์
        
        Returns:
            str: Serial Number ในรูปแบบ hex string หรือ None ถ้าล้มเหลว
            
        Note:
            - ลองดึงข้อมูลสูงสุด 3 ครั้ง
            - ใช้ GetDeviceInfo API เพื่ออ่าน DeviceSN
            - แปลงจาก byte array เป็น hex string
        """
        max_retries = 3
        
        for attempt in range(max_retries):
            try:
                if attempt > 0:
                    time.sleep(1.0)
                    
                # ใช้ GetDeviceInfo แทน GetDevicePara
                dev_info = GDI_Struct()
                res = self.api.GetDeviceInfo(self.hComm, pointer(dev_info))
                
                if res != 0:
                    logger.warning(f"GetDeviceInfo failed (attempt {attempt + 1}): {res}")
                    continue
                
                # ตรวจสอบค่าที่ dev_info.DeviceSN
                if all(b == 0 for b in dev_info.DeviceSN):
                    logger.warning(f"DeviceSN is all zeros (attempt {attempt + 1})")
                    if attempt == max_retries - 1:
                        return None
                    continue
                
                # ดึงค่า DeviceSN และแปลงเป็น string
                device_sn = ''.join(f"{b:02X}" for b in dev_info.DeviceSN)
                logger.info(f"Device {self.device_id} real SN: {device_sn}")
                return device_sn
            
            except Exception as e:
                logger.error(f"Error retrieving DeviceSN (attempt {attempt + 1}): {e}")
                if attempt == max_retries - 1:
                    return None
                continue
        
        return None
        
    def connect(self):
        """
        เชื่อมต่อกับอุปกรณ์ RFID
        
        Returns:
            bool: True ถ้าเชื่อมต่อสำเร็จ, False ถ้าล้มเหลว
            
        Process:
            1. สร้าง handle ใหม่
            2. เชื่อมต่อตาม connection_type
               - COM: ใช้ OpenDevice() กับ baud rate
               - Network: ใช้ OpenNetConnection() กับ IP:Port
            3. ดึง Serial Number จริงจากอุปกรณ์
            4. ตั้งสถานะ is_connected
        """
        try:
            h = c_void_p()
            
            if self.connection_type == "com":
                com_port, baud_rate = self.connection_info.split('@')
                baud_rate = int(baud_rate)
                port_bytes = com_port.encode('ascii')
                baud_code_map = {9600: 0x00, 19200: 0x01, 38400: 0x02, 57600: 0x03, 115200: 0x04}
                baud_code = baud_code_map.get(baud_rate, 0x04)
                res = self.api.OpenDevice(h, port_bytes, c_byte(baud_code))
            else:
                ip, port = self.connection_info.split(':')
                port = int(port)
                ip_bytes = ip.encode('ascii')
                res = self.api.OpenNetConnection(h, ip_bytes, port, 5000)
            
            if res == 0 and h.value:
                self.hComm = h
                self.is_connected = True
                
                # ดึง SN จริงจากเครื่อง
                try:
                    real_sn = self.get_device_sn_internal()
                    if real_sn:
                        self.real_sn = str(real_sn)
                    else:
                        self.real_sn = None
                except Exception as e:
                    logger.error(f"Device {self.device_id} SN detection failed: {e}")
                    self.real_sn = None
                
                logger.info(f"Device {self.device_id} connected successfully")
                return True
            else:
                logger.error(f"Device {self.device_id} connection failed: {res}")
                return False
                
        except Exception as e:
            logger.error(f"Device {self.device_id} connection error: {e}")
            return False
    
    def scan_loop(self, result_queue, cmd_queue):
        """
        Loop หลักสำหรับการสแกน RFID tags อย่างต่อเนื่อง
        
        Args:
            result_queue: Queue สำหรับส่งผลลัพธ์กลับ main process
            cmd_queue: Queue สำหรับรับคำสั่งจาก main process
            
        Process:
            1. ตรวจสอบคำสั่งจาก main process (non-blocking)
            2. ประมวลผลคำสั่ง (เช่น get_params)
            3. เริ่ม inventory operation
            4. อ่าน tags ภายในช่วงเวลา read_window
            5. รวบรวม tag IDs ที่ไม่ซ้ำกัน
            6. หยุด inventory operation
            7. ส่งผลลัพธ์ผ่าน result_queue
            8. รอตาม scan_interval แล้วทำซ้ำ
            
        Commands รองรับ:
            - get_params: ขอข้อมูลพารามิเตอร์ปัจจุบันของอุปกรณ์
            
        Result Format:
            {
                'device_id': int,
                'location_id': int,
                'tags': list[str],  # Tag IDs in hex format
                'timestamp': float,
                'real_sn': str      # Device serial number
            }
        """
        self.result_queue = result_queue
        self.cmd_queue = cmd_queue
        
        while self.running and self.is_connected:
            try:
                # ตรวจสอบคำสั่งจาก parent (non-blocking) - ย้ายมาด้านบน
                cmd = None
                try:
                    # เช็คคำสั่งก่อนทำ scan หลัก
                    cmd = self.cmd_queue.get_nowait()
                except _queue.Empty:
                    cmd = None
                except Exception as e:
                    logger.debug(f"Device {self.device_id} cmd_queue error: {e}")
                    cmd = None

                if cmd:
                    #logger.info(f"Device {self.device_id} received command: {cmd}")
                    if isinstance(cmd, dict) and cmd.get('cmd') == 'get_params':
                        # อ่านพารามิเตอร์ปัจจุบันจากอุปกรณ์แล้วส่งกลับ
                        try:
                            #logger.info(f"Device {self.device_id} processing get_params...")
                            from uhf.struct import DeviceFullInfo
                            from ctypes import byref
                            info = DeviceFullInfo()
                            res = self.api.GetDevicePara(self.hComm, byref(info))
                            if res == 0:
                                params = {
                                    'WORKMODE': info.WORKMODE,
                                    'REGION': info.REGION,
                                    'RFIDPOWER': info.RFIDPOWER,
                                    'ANT': info.ANT,
                                    'QVALUE': info.QVALUE,
                                    'SESSION': info.SESSION,
                                    'INTERFACE': hex(info.INTERFACE),
                                    'BAUDRATE': info.BAUDRATE,
                                    'FILTERTIME': info.FILTERTIME,
                                    'BUZZERTIME': info.BUZZERTIME
                                }
                                response = {'cmd': 'params', 'device_id': self.device_id, 'params': params, 'timestamp': time.time()}
                                self.result_queue.put(response, timeout=1.0)
                                #logger.info(f"Device {self.device_id} sent params response: {len(params)} parameters")
                            else:
                                response = {'cmd': 'params', 'device_id': self.device_id, 'error': f'GetDevicePara failed: {res}', 'timestamp': time.time()}
                                self.result_queue.put(response, timeout=1.0)
                                logger.error(f"Device {self.device_id} GetDevicePara failed: {res}")
                        except Exception as e:
                            response = {'cmd': 'params', 'device_id': self.device_id, 'error': str(e), 'timestamp': time.time()}
                            self.result_queue.put(response, timeout=1.0)
                            logger.error(f"Device {self.device_id} get_params exception: {e}")
                        # หลังจากตอบคำสั่งแล้ว ให้สานงานสแกนต่อ (ไม่หยุด subprocess)
                        continue  # ข้ามการสแกนรอบนี้ ให้ตอบคำสั่งก่อน

                # --- existing scanning logic ---
                collected = set()
                # เริ่ม inventory
                res = self.api.InventoryContinue(self.hComm, 0, None)
                if res != 0:
                    logger.debug(f"Device {self.device_id} InventoryContinue failed: {res}")
                    time.sleep(0.1)
                    continue
                # อ่าน tags — เวลาการอ่านใช้ scan_interval (หรือ cap ที่เล็กสุดถ้าต้องการ)
                scan_start = time.time()
                read_window = max(0.05, min(self.scan_interval, 0.5))
                while time.time() - scan_start < read_window:
                    try:
                        tagInfo = TagInfo()
                        r = self.api.GetTagUii(self.hComm, tagInfo, 20)
                        if r == 0:
                            if 1 <= tagInfo.m_ant <= 4:
                                length = tagInfo.m_len
                                raw = list(tagInfo.m_code)[:length]
                                code = ''.join(f"{b:02X}" for b in raw)
                                collected.add(code.upper())
                        elif r == -249:
                            break
                        elif r == -238:
                            continue
                        else:
                            continue
                    except Exception:
                        break
                # หยุด inventory
                try:
                    self.api.InventoryStop(self.hComm, 50)
                except:
                    pass
                if collected:
                    try:
                        result_data = {
                            'device_id': self.device_id,
                            'location_id': self.location_id,
                            'tags': list(collected),
                            'timestamp': time.time(),
                            'real_sn': getattr(self, 'real_sn', None)
                        }
                        result_queue.put(result_data, timeout=0.1)
                    except:
                        pass
                # ใช้ scan_interval เป็น delay ระหว่างรอบ
                time.sleep(self.scan_interval)
            except Exception as e:
                logger.error(f"Device {self.device_id} scan error: {e}")
                time.sleep(1.0)
    
    def disconnect(self):
        """
        ตัดการเชื่อมต่อและปิด service
        
        Process:
            1. ตั้ง running = False เพื่อหยุด scan loop
            2. ปิด device handle ผ่าน CloseDevice()
            3. ตั้ง is_connected = False
        """
        self.running = False
        if self.hComm and self.hComm.value:
            try:
                self.api.CloseDevice(self.hComm)
            except:
                pass
        self.is_connected = False

def run_device_scanner(device_config, result_queue, cmd_queue):
    """
    Entry point สำหรับรัน scanner service ใน subprocess
    
    Args:
        device_config (dict): การตั้งค่าอุปกรณ์
        result_queue: Queue สำหรับส่งผลลัพธ์
        cmd_queue: Queue สำหรับรับคำสั่ง
        
    Process:
        1. ตั้งค่า logging
        2. สร้าง DeviceScannerService instance
        3. ลองเชื่อมต่ออุปกรณ์
        4. ส่งสถานะการเชื่อมต่อกลับ main process
        5. เริ่ม scan loop ถ้าเชื่อมต่อสำเร็จ
        6. ปิดการเชื่อมต่อเมื่อเสร็จสิ้น
        
    Status Messages:
        - 'connected': เชื่อมต่อสำเร็จ พร้อม real_sn
        - 'connection_failed': เชื่อมต่อล้มเหลว
    """
    logging.basicConfig(level=logging.INFO)
    logger.info(f"Starting scanner service for device {device_config['device_id']}")
    
    service = DeviceScannerService(device_config)
    
    # ส่งสถานะการเชื่อมต่อกลับไป main process
    if service.connect():
        # ส่งสัญญาณว่าเชื่อมต่อสำเร็จ
        result_queue.put({
            'device_id': service.device_id,
            'status': 'connected',
            'real_sn': getattr(service, 'real_sn', None),
            'timestamp': time.time()
        })
        
        # เริ่มสแกน (ส่ง cmd_queue เข้าไปด้วย)
        service.scan_loop(result_queue, cmd_queue)
    else:
        # ส่งสัญญาณว่าเชื่อมต่อล้มเหลว
        result_queue.put({
            'device_id': service.device_id,
            'status': 'connection_failed',
            'timestamp': time.time()
        })
    
    service.disconnect()

# Standalone Testing Section
if __name__ == "__main__":
    """
    โหมดทดสอบ standalone - รัน scanner เครื่องเดียวโดยตรง
    
    Usage:
        python device_scanner_service.py \
            --device-id 1 \
            --location-id 1 \
            --connection-type com \
            --connection-info COM7@115200
            
    หรือ:
        python device_scanner_service.py \
            --device-id 2 \
            --location-id 2 \
            --connection-type network \
            --connection-info 192.168.1.100:8899
    """
    parser = argparse.ArgumentParser()
    parser.add_argument('--device-id', type=int, required=True)
    parser.add_argument('--location-id', type=int, required=True)
    parser.add_argument('--connection-type', required=True)
    parser.add_argument('--connection-info', required=True)
    args = parser.parse_args()
    
    config = {
        'device_id': args.device_id,
        'location_id': args.location_id,
        'connection_type': args.connection_type,
        'connection_info': args.connection_info
    }
    
    from multiprocessing import Queue
    q = Queue()
    cmdq = Queue()
    run_device_scanner(config, q, cmdq)