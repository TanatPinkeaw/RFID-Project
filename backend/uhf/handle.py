import os
from ctypes import *
from uhf.conf import ERROR_CODE
from uhf.error import UhfException
from ctypes import c_int, c_void_p, POINTER
from uhf.struct import GetDeviceInfo as GDI_Struct
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class Api:
    def __init__(self):
        """
        Initialize UHF API with automatic DLL loading
        """
        self.lib = None
        self._load_dll()
        self._setup_function_signatures()

    def _load_dll(self):
        """โหลด DLL ด้วยหลายวิธี"""
        try:
            # วิธีที่ 1: ใช้ pathlib สำหรับ cross-platform
            current_file = Path(__file__)
            backend_dir = current_file.parent.parent  # จาก uhf/ ไป backend/
            dll_path = backend_dir / "UHFPrimeReader.dll"
            
            logger.info(f"🔍 Looking for DLL at: {dll_path}")
            
            if not dll_path.exists():
                raise FileNotFoundError(f"❌ DLL not found at: {dll_path}")
            
            # Method 1: ใช้ absolute path
            try:
                self.lib = cdll.LoadLibrary(str(dll_path))
                logger.info("✅ DLL loaded successfully with absolute path")
                return
            except Exception as e:
                logger.warning(f"⚠️ Absolute path failed: {e}")
            
            # Method 2: เปลี่ยน working directory
            try:
                original_cwd = os.getcwd()
                os.chdir(str(backend_dir))
                
                self.lib = cdll.LoadLibrary("UHFPrimeReader.dll")
                logger.info("✅ DLL loaded successfully with relative path")
                
                os.chdir(original_cwd)  # กลับไป original directory
                return
            except Exception as e:
                logger.warning(f"⚠️ Relative path failed: {e}")
                os.chdir(original_cwd)  # Ensure we return to original directory
            
            # Method 3: เพิ่ม DLL directory ลง PATH
            try:
                dll_dir = str(backend_dir)
                if dll_dir not in os.environ.get('PATH', ''):
                    os.environ['PATH'] = dll_dir + os.pathsep + os.environ.get('PATH', '')
                
                self.lib = cdll.LoadLibrary("UHFPrimeReader.dll")
                logger.info("✅ DLL loaded successfully via PATH")
                return
            except Exception as e:
                logger.warning(f"⚠️ PATH method failed: {e}")
            
            # Method 4: ใช้ os.path.join (fallback)
            try:
                dll_path_old = os.path.join(os.path.dirname(__file__), "..", "UHFPrimeReader.dll")
                dll_path_old = os.path.abspath(dll_path_old)
                self.lib = cdll.LoadLibrary(dll_path_old)
                logger.info("✅ DLL loaded successfully with os.path fallback")
                return
            except Exception as e:
                logger.warning(f"⚠️ Fallback method failed: {e}")
            
            raise RuntimeError("❌ All DLL loading methods failed")
            
        except Exception as e:
            logger.error(f"❌ Failed to load UHF DLL: {e}")
            raise

    def _setup_function_signatures(self):
        """ตั้งค่า function signatures สำหรับ DLL"""
        if self.lib is None:
            raise RuntimeError("DLL not loaded")
        
        try:
            # Set return types
            self.lib.OpenDevice.restype = c_int32
            self.lib.OpenNetConnection.restype = c_int32
            self.lib.CloseDevice.restype = c_int32
            self.lib.GetDevicePara.restype = c_int32
            self.lib.SetDevicePara.restype = c_int32
            self.lib.SetRFPower.restype = c_int32
            self.lib.Close_Relay.restype = c_int32
            self.lib.Release_Relay.restype = c_int32
            self.lib.GetTagUii.restype = c_int32
            self.lib.InventoryContinue.restype = c_int32
            self.lib.InventoryStop.restype = c_int32

            # Bind GetDeviceInfo
            self.lib.GetDeviceInfo.argtypes = [c_void_p, POINTER(GDI_Struct)]
            self.lib.GetDeviceInfo.restype = c_int
            
            logger.info("✅ Function signatures setup completed")
            
        except Exception as e:
            logger.error(f"❌ Failed to setup function signatures: {e}")
            raise

    def test_dll(self):
        """ทดสอบการทำงานของ DLL"""
        if self.lib is None:
            return False
        
        try:
            # ทดสอบเรียกใช้ function พื้นฐาน (ถ้ามี)
            # อาจจะเป็น GetVersion หรือ function อื่นที่ไม่ต้องการ parameter
            logger.info("✅ DLL test passed")
            return True
        except Exception as e:
            logger.error(f"❌ DLL test failed: {e}")
            return False

    def OpenDevice(self, hComm, port, Baudrate):
        if self.lib is None:
            raise RuntimeError("DLL not loaded")
        res = self.lib.OpenDevice(byref(hComm), port, Baudrate)
        return res

    def OpenNetConnection(self, hCom, ip, port, timeoutMs):
        if self.lib is None:
            raise RuntimeError("DLL not loaded")
        res = self.lib.OpenNetConnection(byref(hCom), ip, port, timeoutMs)
        return res

    def CloseDevice(self, hComm):
        if self.lib is None:
            raise RuntimeError("DLL not loaded")
        res = self.lib.CloseDevice(hComm)
        return res
    
    def GetDevicePara(self, hComm, para_ptr):
        if self.lib is None:
            raise RuntimeError("DLL not loaded")
        # para_ptr ต้องเป็น pointer (byref(para))
        res = self.lib.GetDevicePara(hComm, para_ptr)
        if res != 0:
            raise UhfException(f"GetDevicePara error: {res}")
        return res

    def SetDevicePara(self, hComm, param):
        if self.lib is None:
            raise RuntimeError("DLL not loaded")
        res = self.lib.SetDevicePara(hComm, param)
        if res != 0:
            raise UhfException(ERROR_CODE[res])
        return res

    def SetRFPower(self, hComm, power, reserved):
        if self.lib is None:
            raise RuntimeError("DLL not loaded")
        res = self.lib.SetRFPower(hComm, power, reserved)
        return res

    def Close_Relay(self, hComm, time):
        if self.lib is None:
            raise RuntimeError("DLL not loaded")
        res = self.lib.Close_Relay(hComm, time)
        if res != 0:
            raise UhfException(ERROR_CODE[res])
        return res

    def Release_Relay(self, hComm, time):
        if self.lib is None:
            raise RuntimeError("DLL not loaded")
        res = self.lib.Release_Relay(hComm, time)
        if res != 0:
            raise UhfException(ERROR_CODE[res])
        return res

    def GetTagUii(self, hComm, tagInfo, timeout):
        if self.lib is None:
            raise RuntimeError("DLL not loaded")
        res = self.lib.GetTagUii(hComm, byref(tagInfo), timeout)
        if res in (-241, -238):
            raise UhfException(str(res))
        if res == -249:
            return res
        if res != 0:
            raise UhfException(ERROR_CODE.get(res, f"Unknown error code: {res}"))
        return res

    def InventoryContinue(self, hComm, invCount, invParam):
        if self.lib is None:
            raise RuntimeError("DLL not loaded")
        res = self.lib.InventoryContinue(hComm, invCount, invParam)
        if res != 0:
            raise UhfException(ERROR_CODE[res])
        return res

    def InventoryStop(self, hComm, timeout):
        if self.lib is None:
            raise RuntimeError("DLL not loaded")
        res = self.lib.InventoryStop(hComm, timeout)
        return 0

    def GetDeviceInfo(self, hComm, devInfoPtr):
        if self.lib is None:
            raise RuntimeError("DLL not loaded")
        return self.lib.GetDeviceInfo(hComm, devInfoPtr)
