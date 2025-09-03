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
        self.error_occurred = False  # เพิ่มบรรทัดนี้

    def run(self):
        # เริ่ม continuous inventory รอบแรก
        try:
            res = api.InventoryContinue(self.hComm, 0, None)
            if res != 0:
                print(f"InventoryContinue failed: {res}")
                if res in [-255, -236, -238, -239]:
                    self.error_occurred = True
                return
        except Exception as e:
            print(f"InventoryContinue error: {e}")
            if any(code in str(e) for code in ['-236', '-238', '-255', 'handle', 'parameter']):
                self.error_occurred = True
            return
            
        try:
            while not self.flag:
                try:
                    # ตรวจสอบ handle ก่อนใช้
                    if not self.hComm or not self.hComm.value:
                        print("Invalid handle in InventoryThread")
                        self.error_occurred = True
                        break
                        
                    self.tagInfo = TagInfo()
                    res = api.GetTagUii(self.hComm, self.tagInfo, self.timeout)

                    # สัญญาณ end-of-inventory ให้วนใหม่
                    if res == -249:
                        continue

                    # Handle connection errors
                    if res in [-255, -236, -238, -239]:
                        print(f"Connection error in InventoryThread: {res}")
                        self.error_occurred = True
                        break

                    # กรอง antenna (1–4)
                    if not (1 <= self.tagInfo.m_ant <= 4):
                        continue

                    # แปลง code เป็น HEX string
                    length = self.tagInfo.m_len
                    raw = list(self.tagInfo.m_code)[:length]
                    code = ''.join(f"{b:02X}" for b in raw)

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
                    # suppress CRC check error (-232) and retry
                    msg = str(e)
                    if "crc" in msg.lower() or msg.strip() == "-232":
                        continue
                    # retry also for these codes
                    if msg.strip() in ("-241", "-238"):
                        continue
                    # Handle connection errors
                    if "handle" in msg.lower() or "parameter" in msg.lower() or any(code in msg for code in ['-236', '-238', '-255']):
                        print(f"Handle error in InventoryThread: {msg}")
                        self.error_occurred = True
                        break
                    # otherwise propagate
                    print(f"InventoryThread UhfException: {msg}")
                    continue
                
                except Exception as e:
                    print(f"InventoryThread unexpected error: {e}")
                    self.error_occurred = True
                    break
                
        finally:
            # หยุด inventory เสมอ
            try:
                api.InventoryStop(self.hComm, self.timeout)
            except Exception as e:
                print(f"InventoryStop error: {e}")

    def terminate(self):
        self.flag = True
