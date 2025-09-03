from ctypes import *
from threading import Thread
from uhf.error import UhfException

from uhf.handle import Api
from uhf.struct import TagInfo

api = Api()

class InventoryThread(Thread):
    def __init__(self, hComm, timeout): 
        super(InventoryThread, self).__init__()
        self.info = {}
        self.hComm = hComm
        self.timeout = timeout
        self.flag = False
        self.error_occurred = False
        self.error_message = ""
        self.consecutive_232_errors = 0
        self.max_232_errors = 50  # เพิ่มจาก 20 เป็น 50

    def run(self):
        # เริ่ม continuous inventory รอบแรก
        try:
            res = api.InventoryContinue(self.hComm, 0, None)
            if res != 0:
                self.error_message = f"InventoryContinue failed: {res}"
                # ปิด print
                # print(self.error_message)
                if res in [-255, -236, -238, -239]:
                    self.error_occurred = True
                return
        except Exception as e:
            self.error_message = f"InventoryContinue error: {e}"
            # ปิด print
            # print(self.error_message)
            if any(code in str(e) for code in ['-236', '-238', '-255', 'handle', 'parameter']):
                self.error_occurred = True
            return
            
        try:
            unique_tags = set()  # ใช้ set แทนการนับ tags_found
            scan_cycles = 0
            
            while not self.flag:
                try:
                    scan_cycles += 1
                    
                    # ตรวจสอบ handle ก่อนใช้
                    if not self.hComm or not self.hComm.value:
                        self.error_message = "Invalid handle in InventoryThread"
                        # ปิด print
                        # print(self.error_message)
                        self.error_occurred = True
                        break
                        
                    self.tagInfo = TagInfo()
                    res = api.GetTagUii(self.hComm, self.tagInfo, self.timeout)

                    # จัดการ error -232 แบบ smart
                    if res == -232:
                        self.consecutive_232_errors += 1
                        
                        # ถ้า error -232 มากเกินไป และไม่เจอ tags เลย
                        if (self.consecutive_232_errors >= self.max_232_errors and 
                            len(unique_tags) == 0 and scan_cycles > 20):  # เพิ่ม cycles
                            self.error_message = f"Too many consecutive -232 errors"
                            # ปิด print
                            # print(f"INFO: {self.error_message} - stopping scan cycle")
                            break
                        
                        # ถ้าเคยเจอ tags แล้ว ให้ continue ต่อไป (ปิด debug print)
                        continue

                    # สัญญาณ end-of-inventory ให้วนใหม่
                    if res == -249:
                        # รีเซ็ต error counter เมื่อจบรอบ (ปิด debug print)
                        self.consecutive_232_errors = 0
                        continue

                    # Handle connection errors
                    if res in [-255, -236, -238, -239]:
                        self.error_message = f"Connection error in InventoryThread: {res}"
                        # ปิด print
                        # print(self.error_message)
                        self.error_occurred = True
                        break

                    # ถ้าได้ Tag สำเร็จ รีเซ็ต error counter
                    if res == 0:
                        self.consecutive_232_errors = 0

                    # กรอง antenna (1–4)
                    if not (1 <= self.tagInfo.m_ant <= 4):
                        continue

                    # แปลง code เป็น HEX string
                    length = self.tagInfo.m_len
                    raw = list(self.tagInfo.m_code)[:length]
                    code = ''.join(f"{b:02X}" for b in raw)
                    
                    # เพิ่มเข้า unique set
                    unique_tags.add(code)

                    # เก็บข้อมูลลง self.info
                    info = self.info.setdefault(code, {
                        "m_no":     self.tagInfo.m_no,
                        "m_rssi":   self.tagInfo.m_rssi/10,
                        "m_counts": [0,0,0,0],
                        "m_channel":self.tagInfo.m_channel,
                        "m_crc":    list(self.tagInfo.m_crc),
                        "m_pc":     list(self.tagInfo.m_pc),
                    })
                    info["m_counts"][self.tagInfo.m_ant-1] += 1
                    info["m_rssi"]   = self.tagInfo.m_rssi/10
                    info["m_channel"]= self.tagInfo.m_channel

                except UhfException as e:
                    msg = str(e)
                    
                    # จัดการ CRC check error (-232) แบบ smart
                    if "crc" in msg.lower() or msg.strip() == "-232":
                        self.consecutive_232_errors += 1
                        
                        # ถ้า error มากเกินไปและไม่เจอ tags
                        if (self.consecutive_232_errors >= self.max_232_errors and 
                            len(unique_tags) == 0 and scan_cycles > 20):
                            self.error_message = f"Too many CRC errors with no tags found"
                            # ปิด print
                            # print(f"INFO: {self.error_message}")
                            break
                        continue
                        
                    # retry also for these codes
                    if msg.strip() in ("-241", "-238"):
                        continue
                        
                    # Handle connection errors
                    if "handle" in msg.lower() or "parameter" in msg.lower() or any(code in msg for code in ['-236', '-238', '-255']):
                        self.error_message = f"Handle error in InventoryThread: {msg}"
                        # ปิด print
                        # print(self.error_message)
                        self.error_occurred = True
                        break
                        
                    # ปิด print สำหรับ UhfException อื่นๆ
                    # print(f"InventoryThread UhfException: {msg}")
                    continue
                
                except Exception as e:
                    self.error_message = f"InventoryThread unexpected error: {e}"
                    # ปิด print
                    # print(self.error_message)
                    continue
                
        finally:
            # หยุด inventory เสมอ
            try:
                api.InventoryStop(self.hComm, self.timeout)
                # ปิด INFO logger ที่ทำให้ช้า
                # print(f"INFO: InventoryThread finished - Tags found: {len(unique_tags)}, Scan cycles: {scan_cycles}")
            except Exception as e:
                # ปิด error print
                # print(f"InventoryStop error: {e}")
                pass

    def terminate(self):
        self.flag = True