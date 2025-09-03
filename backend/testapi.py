from ctypes import c_void_p, c_char_p, c_byte, byref, pointer
from uhf.handle import Api
from uhf.struct import TagInfo, DeviceFullInfo,GetDeviceInfo as GDI_Struct
import logging
import time

# ตั้งค่า logging
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)

def normalize_tag_id(uii_hex: str) -> str:
    """Normalize tag ID เป็น uppercase hex"""
    return uii_hex.upper()

def scan_once_inventory(api, hComm, duration: float = 0.5):
    """สแกนด้วยวิธี InventoryContinue + GetTagUii แบบเดียวกับ scan.py"""
    scanned_tags = {}
    
    try:
        # เริ่ม inventory
        res = api.InventoryContinue(hComm, 0, None)
        if res != 0:
            logging.error(f"InventoryContinue failed: {res}")
            return scanned_tags
        
        # สแกนเป็นเวลาที่กำหนด
        scan_start_time = time.time()
        
        while time.time() - scan_start_time < duration:
            try:
                tagInfo = TagInfo()
                res = api.GetTagUii(hComm, tagInfo, 50)
                
                if res == 0:  # ได้ tag
                    if 1 <= tagInfo.m_ant <= 4:
                        length = tagInfo.m_len
                        raw = list(tagInfo.m_code)[:length]
                        code = ''.join(f"{b:02X}" for b in raw)
                        scanned_tags[code] = True
                        logging.debug(f"Found tag: {code}")
                
                elif res == -232:  # CRC error - ปกติ
                    continue
                elif res == -249:  # End of inventory
                    break
                elif res in [-255, -236, -238, -239, -233]:  # Connection errors
                    logging.warning(f"Connection error during scan: {res}")
                    break
                    
            except Exception as e:
                logging.debug(f"GetTagUii exception: {e}")
                continue
        
        # หยุด inventory
        try:
            stop_res = api.InventoryStop(hComm, 100)
            if stop_res != 0:
                logging.debug(f"InventoryStop warning: {stop_res}")
        except Exception as e:
            logging.debug(f"InventoryStop exception: {e}")
            
    except Exception as e:
        logging.error(f"Scan error: {e}")
    
    return scanned_tags

def connect_serial(api, com_port="COM7", baud_rate=115200):
    """เชื่อมต่อผ่าน COM port"""
    h = c_void_p()
    
    # แปลง COM port เป็น bytes
    port_bytes = com_port.encode('ascii')
    
    # ใช้ baud rate code ตาม API documentation
    # 0x00: 9600, 0x01: 19200, 0x02: 38400, 0x03: 57600, 0x04: 115200
    baud_code = 0x04  # 115200 baud
    
    res = api.OpenDevice(h, port_bytes, c_byte(baud_code))
    
    if res != 0:
        logging.error(f"OpenDevice failed: {res}")
        return None
    
    logging.info(f"Connected to {com_port} at {baud_rate} baud, handle={h.value}")
    
    # ตรวจสอบการเชื่อมต่อ
    if h.value == 0:
        logging.error("Invalid handle received")
        return None
        
    return h

def connect_network(api, ip="10.10.100.254", port=8899, timeout=5000):
    """เชื่อมต่อผ่าง Network"""
    h = c_void_p()
    ip_bytes = ip.encode('ascii')
    
    res = api.OpenNetConnection(h, ip_bytes, port, timeout)
    
    if res != 0:
        logging.error(f"OpenNetConnection failed: {res}")
        return None
        
    logging.info(f"Connected to {ip}:{port}, handle={h.value}")
    
    # ตรวจสอบการเชื่อมต่อ
    if h.value == 0:
        logging.error("Invalid handle received")
        return None
        
    return h

def test_device_info(api, h):
    """ทดสอบการติดต่อกับ device"""
    try:
        logging.info("Testing device connection...")
        
        # ลองใช้ function ง่ายๆ ก่อน
        try:
            # ลองเรียก InventoryContinue เพื่อทดสอบการสื่อสาร
            res = api.InventoryContinue(h, 0, None)
            if res == 0:
                # หยุด inventory ทันที
                api.InventoryStop(h, 100)
                logging.info("Device communication test successful")
                return True
            else:
                logging.warning(f"InventoryContinue test failed: {res}")
        except Exception as e:
            logging.warning(f"InventoryContinue test exception: {e}")
        
        # ลองใช้ GetDevicePara
        try:
            info = DeviceFullInfo()
            res = api.GetDevicePara(h, pointer(info))
            
            if res == 0:
                logging.info("GetDevicePara test successful")
                return True
            else:
                logging.warning(f"GetDevicePara test failed: {res}")
        except Exception as e:
            logging.warning(f"GetDevicePara test exception: {e}")
            
        return False
            
    except Exception as e:
        logging.error(f"Device test failed: {e}")
        return False

def get_device_sn(api, h):
    """ดึงค่า DeviceSN โดยใช้ GetDeviceInfo - ถ้าอ่านไม่ได้จะ return None"""
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            if attempt > 0:
                time.sleep(1.0)
                
            # ใช้ GetDeviceInfo
            dev_info = GDI_Struct()
            res = api.GetDeviceInfo(h, pointer(dev_info))
            
            if res != 0:
                logging.warning(f"GetDeviceInfo failed (attempt {attempt + 1}): {res}")
                continue
            
            # ตรวจสอบค่าที่ dev_info.DeviceSN
            if all(b == 0 for b in dev_info.DeviceSN):
                logging.warning(f"DeviceSN is all zeros (attempt {attempt + 1})")
                continue
            
            # ดึงค่า DeviceSN และแปลงเป็น string
            device_sn = ''.join(f"{b:02X}" for b in dev_info.DeviceSN)
            logging.info(f"DeviceSN: {device_sn}")
            return device_sn
        
        except Exception as e:
            logging.error(f"Error retrieving DeviceSN (attempt {attempt + 1}): {e}")
            continue
    
    # ⭐ ไม่ใช้ fake SN - return None เมื่ออ่านไม่ได้
    logging.error("❌ Failed to get valid DeviceSN from device - connection will be rejected")
    return None

def get_device_info(api, h):
    """ดึงข้อมูล device - ไม่ใช้ fake SN"""
    dev = GDI_Struct()
    res = api.GetDeviceInfo(h, pointer(dev))
    if res != 0:
        logging.error(f"GetDeviceInfo failed: {res}")
        return None

    # ตรวจสอบว่า DeviceSN ไม่ใช่ all zeros
    if all(b == 0 for b in dev.DeviceSN):
        logging.error("❌ DeviceSN is all zeros - device not valid")
        return None

    # แปลง DeviceSN
    sn = ''.join(f"{b:02X}" for b in dev.DeviceSN)
    logging.info(f"✅ Valid DeviceSN: {sn}")
    return sn

def main():
    api = Api()
    
    CONNECTION_TYPE = "COM"  # เปลี่ยนเป็น "NETWORK" สำหรับ network connection
    
    if CONNECTION_TYPE == "COM":
        h = connect_serial(api, com_port="COM7", baud_rate=115200)
    else:
        h = connect_network(api, ip="10.10.100.254", port=8899)
    
    if h is None:
        logging.error("Failed to connect to reader")
        return

    # ดึงค่า DeviceSN
    device_sn = get_device_info(api, h)
    if device_sn is not None:
        logging.info(f"📋 DeviceSN Retrieved: {device_sn}")

    # ทดสอบการเชื่อมต่อ (อาจข้ามได้ถ้าไม่ผ่าน)
    if not test_device_info(api, h):
        logging.warning("Device connection test failed, but continuing anyway...")
        # ไม่ return ให้ลองสแกนต่อไป

    scanned = set()      # สะสม tags ข้ามรอบ
    scan_duration = 0.5  # ใช้เวลาสแกนสั้นๆ แบบ scan.py
    loop_interval = 0.2  # เว้นช่วงสั้นๆ

    try:
        logging.info("Starting RFID scanning...")
        while True:
            logging.debug("=== Starting new scan cycle ===")
            
            # ใช้วิธีสแกนแบบเดียวกับ scan.py
            scanned_tags = scan_once_inventory(api, h, duration=scan_duration)
            
            # Debug: แสดงข้อมูล raw ที่ได้
            logging.debug(f"Raw scan result: {scanned_tags}")
            
            # ประมวลผล tags
            if scanned_tags:
                new_tags = []
                
                for tid in scanned_tags.keys():
                    try:
                        normalized_tid = normalize_tag_id(tid)
                        
                        if normalized_tid not in scanned:
                            scanned.add(normalized_tid)
                            new_tags.append(normalized_tid)
                            
                    except Exception as e:
                        logging.error(f"Error processing tag {tid}: {e}")
                        continue
                
                # แสดงผล tags ใหม่
                if new_tags:
                    logging.info(f"📡 New tags found: {new_tags}")
                else:
                    logging.debug("No new tags in this cycle")
            else:
                logging.debug("No tags detected")

            # แสดงสรุป tags ทั้งหมด
            if scanned:
                logging.info(f"Total scanned: {len(scanned)} tags - {[t[:8]+'...' for t in sorted(scanned)]}")
            
            time.sleep(loop_interval)

    except KeyboardInterrupt:
        logging.info("Interrupted by user, stopping scan")

    finally:
        try:
            api.CloseDevice(h)
            logging.info("Disconnected")
        except Exception as e:
            logging.error(f"Error closing device: {e}")

if __name__ == "__main__":
    main()