from fastapi import APIRouter, HTTPException
from typing import List
from ctypes import byref, c_void_p
import sys
import logging
from uhf.handle import Api
from uhf.struct import DeviceFullInfo
from models import ScannerConfig

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scanner-config", tags=["scanner_config"])

def _get_scan_module():
    """ดึง scan module และตัวแปรที่ต้องใช้"""
    try:
        if 'routers.scan' in sys.modules:
            scan_mod = sys.modules['routers.scan']
            return (
                scan_mod,
                getattr(scan_mod, 'api_dev', None),
                getattr(scan_mod, 'device_lock', None),
                getattr(scan_mod, 'hComm', None),
                getattr(scan_mod, 'is_connected', False)
            )
        else:
            from routers import scan
            return (
                scan,
                getattr(scan, 'api_dev', None),
                getattr(scan, 'device_lock', None),
                getattr(scan, 'hComm', None),
                getattr(scan, 'is_connected', False)
            )
    except Exception as e:
        logger.error(f"Failed to get scan module: {e}")
        return None, None, None, None, False

# =============== API ENDPOINTS ===============

@router.get("", response_model=List[ScannerConfig])
def get_scanner_config():
    """ดึงค่ากำหนด Parameter โดยหยุด scanning ชั่วคราว"""
    try:
        #logger.info("Reading device config with thread pause...")
        
        # ✅ ใช้ฟังก์ชัน pause แทน lock
        device_configs = _read_device_config_with_pause()
        
        # แปลงเป็น format ที่ frontend ต้องการ
        configs = []
        config_order = [
            "WorkMode", "FreqBand", "FreqStart", "FreqEnd", "StepFreq", 
            "ANT", "RfPower", "QValue", "Session", "INTERFACE", "BAUDRATE",
            "InventoryArea", "FilterTime", "TriggleTime", "BuzzerTime"
        ]
        
        # เรียงตาม order ที่กำหนด
        for key in config_order:
            if key in device_configs:
                configs.append({
                    "key": key,
                    "value": device_configs[key]["value"],
                    "description": device_configs[key]["description"] + " (หยุดและเริ่มสแกนใหม่)"
                })
        
        # เพิ่มที่เหลือ (เช่น Error)
        for key, config in device_configs.items():
            if key not in config_order:
                configs.append({
                    "key": key,
                    "value": config["value"],
                    "description": config["description"]
                })
        
        logger.info(f"Retrieved {len(configs)} configurations with thread pause")
        return configs
        
    except Exception as e:
        logger.error(f"Error in get_scanner_config: {e}")
        return [{
            "key": "Error",
            "value": str(e),
            "description": f"เกิดข้อผิดพลาด: {str(e)}"
        }]

@router.put("", response_model=ScannerConfig)
def set_scanner_config(cfg: ScannerConfig):
    """ตั้งค่าพารามิเตอร์โดยหยุด scanning ชั่วคราว"""
    try:
        key, val = cfg.key, cfg.value
        
        if not key or val is None:
            raise HTTPException(status_code=400, detail="Both key and value are required")
        
        # ตรวจสอบค่า
        validation_rules = {
            "WorkMode": ([0, 1, 2], None, "Work Mode must be 0 (Answer), 1 (Active), or 2 (Trigger)"),
            "RfPower": (0, 33, "RF Power must be between 0-33 dBm"),
            "ANT": (1, 16, "Antenna count must be between 1-16"),
            "QValue": (0, 15, "Q-Value must be between 0-15"),
            "Session": (0, 3, "Session must be between 0-3")
        }
        
        if key in validation_rules:
            rule = validation_rules[key]
            try:
                if isinstance(rule[0], list):
                    if int(val) not in rule[0]:
                        raise HTTPException(status_code=400, detail=rule[2])
                else:
                    if not (rule[0] <= int(val) <= rule[1]):
                        raise HTTPException(status_code=400, detail=rule[2])
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid value format for {key}")
        
        # ✅ ใช้ฟังก์ชัน pause แทน lock
        result = _write_device_config_with_pause(key, str(val))
        
        if not result["success"]:
            raise HTTPException(status_code=503, detail=f"Failed to set {key}: {result['message']}")
        
        logger.info(f"Successfully set {key} = {val} with thread pause")
        
        return {
            "key": key,
            "value": str(val),
            "description": f"✅ {result['message']} (หยุดและเริ่มสแกนใหม่)"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in set_scanner_config: {e}")
        raise HTTPException(status_code=503, detail=f"Failed to set scanner config: {str(e)}")

@router.post("/refresh")
def refresh_config():
    """รีเฟรชการตั้งค่าจากเครื่อง โดยหยุด scanning ชั่วคราว"""
    try:
        # ✅ ใช้ฟังก์ชัน pause แทน lock
        device_configs = _read_device_config_with_pause()
        
        config_count = len([k for k in device_configs.keys() if not k.endswith('Error')])
        
        logger.info(f"Refreshed {config_count} configurations with thread pause")
        
        return {
            "message": f"Successfully refreshed {config_count} configurations (หยุดและเริ่มสแกนใหม่)",
            "count": config_count
        }
        
    except Exception as e:
        logger.error(f"Error in refresh_config: {e}")
        raise HTTPException(status_code=503, detail=f"Failed to refresh configuration: {str(e)}")

def _read_device_config_with_pause():
    """อ่านค่าการตั้งค่าโดยหยุด scanning threads ชั่วคราว"""
    try:
        scan_mod, api_dev, device_lock, hComm, is_connected = _get_scan_module()
        
        if not scan_mod or not api_dev or not device_lock:
            raise Exception("Scanner module, API, or device lock not available")
        
        configs = {}
        
        #logger.info("Pausing scanning threads for config reading...")
        
        # หยุด scanning threads ชั่วคราว
        original_thread_stop = getattr(scan_mod, 'thread_stop', None)
        scan_thread = getattr(scan_mod, 'scan_thread', None)
        db_thread = getattr(scan_mod, 'db_thread', None)
        
        if original_thread_stop and scan_thread and db_thread:
            # สั่งหยุด threads
            original_thread_stop.set()
            #logger.info("Stopping scanning threads...")
            
            # รอให้ threads หยุดจริงๆ
            if scan_thread.is_alive():
                scan_thread.join(timeout=3.0)
                #logger.info(f"Scan thread stopped: {not scan_thread.is_alive()}")
            
            if db_thread.is_alive():
                db_thread.join(timeout=1.0)
                logger.info(f"DB thread stopped: {not db_thread.is_alive()}")
            
            # รอให้ reader ว่างจาก operations ที่ค้างอยู่
            import time
            time.sleep(2.0)
            #logger.info("All threads stopped, reader should be free")
        
        # ตอนนี้ reader ควรจะว่างแล้ว - อ่านค่าได้เลย
        if hComm and hComm.value and is_connected:
            try:
                # หยุด inventory operations ที่อาจเหลืออยู่
                for i in range(3):
                    try:
                        stop_res = api_dev.InventoryStop(hComm, 1000)
                        #logger.info(f"Final InventoryStop {i+1}: {stop_res}")
                        if stop_res in [0, -249]:
                            break
                        time.sleep(0.5)
                    except Exception as e:
                        logger.warning(f"Final InventoryStop {i+1} failed: {e}")
                
                # รอสักครู่
                time.sleep(1.0)
                
                # อ่านค่าการตั้งค่า
                #logger.info("Reading device configuration...")
                info = DeviceFullInfo()
                res = api_dev.GetDevicePara(hComm, byref(info))
                
                if res == 0:
                    configs = {
                        "WorkMode": {
                            "value": str(info.WORKMODE),
                            "description": "โหมดการทำงานของเครื่องอ่าน RFID (0=Answer, 1=Active, 2=Trigger)"
                        },
                        "FreqBand": {
                            "value": str(info.REGION),
                            "description": "ย่านความถี่ที่ใช้งาน (Region Code)"
                        },
                        "FreqStart": {
                            "value": str(info.STRATFREI[0]),
                            "description": "จุดเริ่มต้นความถี่ (MHz) - Byte ที่ 0"
                        },
                        "FreqEnd": {
                            "value": str(info.STRATFRED[0]),
                            "description": "จุดสิ้นสุดความถี่ (MHz) - Byte ที่ 0"
                        },
                        "StepFreq": {
                            "value": str(info.STEPFRE[0]),
                            "description": "ขนาดช่วงความถี่ (MHz) - Byte ที่ 0"
                        },
                        "ANT": {
                            "value": str(info.ANT),
                            "description": "จำนวนเสาอากาศที่เปิดใช้งาน"
                        },
                        "INTERFACE": {
                            "value": str(hex(info.INTERFACE)),
                            "description": "ประเภทการเชื่อมต่อกับเครื่องอ่าน (Hex)"
                        },
                        "BAUDRATE": {
                            "value": str(info.BAUDRATE),
                            "description": "ความเร็วสื่อสาร (baud)"
                        },
                        "RfPower": {
                            "value": str(info.RFIDPOWER),
                            "description": "กำลังส่งสัญญาณ RFID (dBm)"
                        },
                        "QValue": {
                            "value": str(info.QVALUE),
                            "description": "Q-Value สำหรับ Anti-collision Algorithm"
                        },
                        "Session": {
                            "value": str(info.SESSION),
                            "description": "Session ที่ใช้ในการอ่าน Tag"
                        },
                        "InventoryArea": {
                            "value": str(info.INVENTORYAREA),
                            "description": "พื้นที่การอ่าน Tag"
                        },
                        "FilterTime": {
                            "value": str(info.FILTERTIME),
                            "description": "เวลาการกรอง (ms)"
                        },
                        "TriggleTime": {
                            "value": str(info.TRIGGLETIME),
                            "description": "เวลา Trigger (ms)"
                        },
                        "BuzzerTime": {
                            "value": str(info.BUZZERTIME),
                            "description": "เวลาเสียงบีป (ms)"
                        }
                    }
                    
                    #logger.info(f"Successfully read {len(configs)} configurations")
                    
                else:
                    logger.error(f"GetDevicePara failed: {res}")
                    configs = {
                        "GetDeviceParaError": {
                            "value": str(res),
                            "description": f"GetDevicePara failed: {res}"
                        }
                    }
                    
            except Exception as e:
                logger.error(f"Exception reading config: {e}")
                configs = {
                    "ReadException": {
                        "value": str(e),
                        "description": f"Exception: {str(e)}"
                    }
                }
        else:
            configs = {
                "NotConnectedError": {
                    "value": "not_connected",
                    "description": "เครื่อง Scanner ไม่ได้เชื่อมต่อ"
                }
            }
        
        # เริ่ม threads ใหม่
        if original_thread_stop and scan_mod:
            #logger.info("Restarting scanning threads...")
            _restart_scanning_threads(scan_mod)
        
        return configs
        
    except Exception as e:
        logger.error(f"Failed to read device config: {e}")
        return {
            "Error": {
                "value": str(e),
                "description": f"เกิดข้อผิดพลาด: {str(e)}"
            }
        }

def _write_device_config_with_pause(key: str, value: str):
    """เขียนค่าการตั้งค่าโดยหยุด scanning threads ชั่วคราว"""
    try:
        scan_mod, api_dev, device_lock, hComm, is_connected = _get_scan_module()
        
        if not scan_mod or not api_dev or not device_lock:
            return {"success": False, "message": "Scanner module not available"}
        
        logger.info("Pausing scanning threads for config writing...")
        
        # หยุด scanning threads ชั่วคราว
        original_thread_stop = getattr(scan_mod, 'thread_stop', None)
        scan_thread = getattr(scan_mod, 'scan_thread', None)
        db_thread = getattr(scan_mod, 'db_thread', None)
        
        if original_thread_stop and scan_thread and db_thread:
            # สั่งหยุด threads
            original_thread_stop.set()
            logger.info("Stopping scanning threads...")
            
            # รอให้ threads หยุดจริงๆ
            if scan_thread.is_alive():
                scan_thread.join(timeout=5.0)
                logger.info(f"Scan thread stopped: {not scan_thread.is_alive()}")
            
            if db_thread.is_alive():
                db_thread.join(timeout=2.0)
                logger.info(f"DB thread stopped: {not db_thread.is_alive()}")
            
            # รอให้ reader ว่างจาก operations ที่ค้างอยู่
            import time
            time.sleep(3.0)
            logger.info("All threads stopped, reader should be completely free")
        
        # ตอนนี้ reader ควรจะว่างแล้ว - ตั้งค่าได้เลย
        if hComm and hComm.value and is_connected:
            try:
                # หยุด inventory operations ที่อาจเหลืออยู่
                for i in range(5):
                    try:
                        stop_res = api_dev.InventoryStop(hComm, 2000)
                        logger.info(f"Final InventoryStop {i+1}: {stop_res}")
                        if stop_res in [0, -249]:
                            break
                        time.sleep(0.5)
                    except Exception as e:
                        logger.warning(f"Final InventoryStop {i+1} failed: {e}")
                
                # รอให้แน่ใจ
                time.sleep(2.0)
                
                # อ่านพารามิเตอร์ปัจจุบัน
                logger.info("Reading current device parameters...")
                info = DeviceFullInfo()
                res = api_dev.GetDevicePara(hComm, byref(info))
                
                if res != 0:
                    return {"success": False, "message": f"GetDevicePara failed: {res}"}
                
                #logger.info("Successfully read current parameters")
                
                # อัปเดตค่าตาม key/value
                if key == "WorkMode":
                    mode_val = int(value)
                    if mode_val in [0, 1, 2]:
                        info.WORKMODE = mode_val
                        message = f"Work Mode set to {mode_val} ({'Answer' if mode_val == 0 else 'Active' if mode_val == 1 else 'Trigger'})"
                    else:
                        return {"success": False, "message": "Work Mode must be 0, 1, or 2"}
                        
                elif key == "FreqBand":
                    region_val = int(value, 16) if "x" in value else int(value)
                    info.REGION = region_val
                    message = f"Frequency Band (Region) set to {region_val}"
                    
                elif key == "RfPower":
                    power_val = int(value)
                    if 0 <= power_val <= 33:
                        info.RFIDPOWER = power_val
                        message = f"RF Power set to {power_val} dBm"
                    else:
                        return {"success": False, "message": "RF Power must be between 0-33 dBm"}
                        
                elif key == "ANT":
                    ant_val = int(value)
                    if 1 <= ant_val <= 16:
                        info.ANT = ant_val
                        message = f"Antenna count set to {ant_val}"
                    else:
                        return {"success": False, "message": "Antenna count must be between 1-16"}
                        
                elif key == "QValue":
                    q_val = int(value)
                    if 0 <= q_val <= 15:
                        info.QVALUE = q_val
                        message = f"Q-Value set to {q_val}"
                    else:
                        return {"success": False, "message": "Q-Value must be between 0-15"}
                        
                elif key == "Session":
                    session_val = int(value)
                    if 0 <= session_val <= 3:
                        info.SESSION = session_val
                        message = f"Session set to {session_val}"
                    else:
                        return {"success": False, "message": "Session must be between 0-3"}
                        
                else:
                    return {"success": False, "message": f"Unsupported parameter: {key}"}
                
                # ส่งพารามิเตอร์ไปยังเครื่อง
                logger.info(f"Setting {key} = {value} on device...")
                res = api_dev.SetDevicePara(hComm, info)
                
                if res == 0:
                    logger.info(f"Successfully set {key} = {value}")
                    
                    # รอให้เครื่องประมวลผล
                    time.sleep(1.0)
                    
                    # เริ่ม threads ใหม่
                    #logger.info("Restarting scanning threads...")
                    _restart_scanning_threads(scan_mod)
                    
                    return {"success": True, "message": message}
                else:
                    # เริ่ม threads ใหม่แม้ล้มเหลว
                    _restart_scanning_threads(scan_mod)
                    return {"success": False, "message": f"SetDevicePara failed: {res}"}
                    
            except ValueError as e:
                _restart_scanning_threads(scan_mod)
                return {"success": False, "message": f"Invalid value format: {value}"}
            except Exception as e:
                _restart_scanning_threads(scan_mod)
                return {"success": False, "message": f"Error setting {key}: {str(e)}"}
        else:
            _restart_scanning_threads(scan_mod)
            return {"success": False, "message": "Scanner not connected"}
            
    except Exception as e:
        return {"success": False, "message": f"Connection error: {str(e)}"}

def _restart_scanning_threads(scan_mod):
    """เริ่ม scanning threads ใหม่"""
    try:
        import threading
        
        # รีเซ็ท thread_stop
        thread_stop = getattr(scan_mod, 'thread_stop', None)
        if thread_stop:
            thread_stop.clear()
            #logger.info("Reset thread_stop event")
        
        # เริ่ม threads ใหม่
        if hasattr(scan_mod, 'scanning_loop') and hasattr(scan_mod, 'db_update_loop'):
            # สร้าง threads ใหม่
            new_scan_thread = threading.Thread(target=scan_mod.scanning_loop, daemon=True)
            new_db_thread = threading.Thread(target=scan_mod.db_update_loop, daemon=True)
            
            # เริ่ม threads
            new_scan_thread.start()
            new_db_thread.start()
            
            # อัปเดต references ใน module
            scan_mod.scan_thread = new_scan_thread
            scan_mod.db_thread = new_db_thread
            
            logger.info("Successfully restarted scanning threads")
        else:
            logger.error("Cannot find scanning functions")
            
    except Exception as e:
        logger.error(f"Failed to restart scanning threads: {e}")

# อัปเดต API endpoints
@router.get("", response_model=List[ScannerConfig])
def get_scanner_config():
    """ดึงค่ากำหนด Parameter โดยหยุด scanning ชั่วคราว"""
    try:
        logger.info("Reading device config with thread pause...")
        
        # ✅ ใช้ฟังก์ชัน pause แทน lock
        device_configs = _read_device_config_with_pause()
        
        # แปลงเป็น format ที่ frontend ต้องการ
        configs = []
        config_order = [
            "WorkMode", "FreqBand", "FreqStart", "FreqEnd", "StepFreq", 
            "ANT", "RfPower", "QValue", "Session", "INTERFACE", "BAUDRATE",
            "InventoryArea", "FilterTime", "TriggleTime", "BuzzerTime"
        ]
        
        # เรียงตาม order ที่กำหนด
        for key in config_order:
            if key in device_configs:
                configs.append({
                    "key": key,
                    "value": device_configs[key]["value"],
                    "description": device_configs[key]["description"] + " (หยุดและเริ่มสแกนใหม่)"
                })
        
        # เพิ่มที่เหลือ (เช่น Error)
        for key, config in device_configs.items():
            if key not in config_order:
                configs.append({
                    "key": key,
                    "value": config["value"],
                    "description": config["description"]
                })
        
        logger.info(f"Retrieved {len(configs)} configurations with thread pause")
        return configs
        
    except Exception as e:
        logger.error(f"Error in get_scanner_config: {e}")
        return [{
            "key": "Error",
            "value": str(e),
            "description": f"เกิดข้อผิดพลาด: {str(e)}"
        }]

@router.put("", response_model=ScannerConfig)
def set_scanner_config(cfg: ScannerConfig):
    """ตั้งค่าพารามิเตอร์โดยหยุด scanning ชั่วคราว"""
    try:
        key, val = cfg.key, cfg.value
        
        if not key or val is None:
            raise HTTPException(status_code=400, detail="Both key and value are required")
        
        # ตรวจสอบค่า
        validation_rules = {
            "WorkMode": ([0, 1, 2], None, "Work Mode must be 0 (Answer), 1 (Active), or 2 (Trigger)"),
            "RfPower": (0, 33, "RF Power must be between 0-33 dBm"),
            "ANT": (1, 16, "Antenna count must be between 1-16"),
            "QValue": (0, 15, "Q-Value must be between 0-15"),
            "Session": (0, 3, "Session must be between 0-3")
        }
        
        if key in validation_rules:
            rule = validation_rules[key]
            try:
                if isinstance(rule[0], list):
                    if int(val) not in rule[0]:
                        raise HTTPException(status_code=400, detail=rule[2])
                else:
                    if not (rule[0] <= int(val) <= rule[1]):
                        raise HTTPException(status_code=400, detail=rule[2])
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid value format for {key}")
        
        # ✅ ใช้ฟังก์ชัน pause แทน lock
        result = _write_device_config_with_pause(key, str(val))
        
        if not result["success"]:
            raise HTTPException(status_code=503, detail=f"Failed to set {key}: {result['message']}")
        
        logger.info(f"Successfully set {key} = {val} with thread pause")
        
        return {
            "key": key,
            "value": str(val),
            "description": f"✅ {result['message']} (หยุดและเริ่มสแกนใหม่)"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in set_scanner_config: {e}")
        raise HTTPException(status_code=503, detail=f"Failed to set scanner config: {str(e)}")

@router.post("/refresh")
def refresh_config():
    """รีเฟรชการตั้งค่าจากเครื่อง โดยหยุด scanning ชั่วคราว"""
    try:
        # ✅ ใช้ฟังก์ชัน pause แทน lock
        device_configs = _read_device_config_with_pause()
        
        config_count = len([k for k in device_configs.keys() if not k.endswith('Error')])
        
        logger.info(f"Refreshed {config_count} configurations with thread pause")
        
        return {
            "message": f"Successfully refreshed {config_count} configurations (หยุดและเริ่มสแกนใหม่)",
            "count": config_count
        }
        
    except Exception as e:
        logger.error(f"Error in refresh_config: {e}")
        raise HTTPException(status_code=503, detail=f"Failed to refresh configuration: {str(e)}")