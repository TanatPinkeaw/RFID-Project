import os
from ctypes import *
from uhf.conf import ERROR_CODE
from uhf.error import UhfException
from ctypes import c_int, c_void_p, POINTER
from uhf.struct import GetDeviceInfo as GDI_Struct


class Api:
    def __init__(self):
        # โหลด DLL จากโฟลเดอร์เดียวกับไฟล์ handle.py
        dll_path = os.path.join(os.path.dirname(__file__), 'C:\\Users\\dYflyTaxi\\Desktop\\RFID\\backend\\UHFPrimeReader.dll')
        self.lib = cdll.LoadLibrary(dll_path)

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
        self.lib.GetDeviceInfo.restype  = c_int



    def OpenDevice(self, hComm, port, Baudrate):
        res = self.lib.OpenDevice(byref(hComm), port, Baudrate)
        return res

    def OpenNetConnection(self, hCom, ip, port, timeoutMs):
        res = self.lib.OpenNetConnection(byref(hCom), ip, port, timeoutMs)
        return res

    def CloseDevice(self, hComm):
        res = self.lib.CloseDevice(hComm)
        return res
    
    def GetDevicePara(self, hComm, para_ptr):
        # para_ptr ต้องเป็น pointer (byref(para))
        res = self.lib.GetDevicePara(hComm, para_ptr)
        if res != 0:
            raise UhfException(f"GetDevicePara error: {res}")
        return res

    def SetDevicePara(self, hComm, param):
        res = self.lib.SetDevicePara(hComm, param)
        if res != 0:
            raise UhfException(ERROR_CODE[res])
        return res

    def SetRFPower(self, hComm, power, reserved):
        res = self.lib.SetRFPower(hComm, power, reserved)
        return res

    def Close_Relay(self, hComm, time):
        res = self.lib.Close_Relay(hComm, time)
        if res != 0:
            raise UhfException(ERROR_CODE[res])
        return res

    def Release_Relay(self, hComm, time):
        res = self.lib.Release_Relay(hComm, time)
        if res != 0:
            raise UhfException(ERROR_CODE[res])
        return res

    def GetTagUii(self, hComm, tagInfo, timeout):
        res = self.lib.GetTagUii(hComm, byref(tagInfo), timeout)
        if res in (-241, -238):
            raise UhfException(str(res))
        if res == -249:
            return res
        if res != 0:
            #print(f"GetTagUii error code: {res}")  # เพิ่มบรรทัดนี้
            raise UhfException(ERROR_CODE.get(res, f"Unknown error code: {res}"))
        return res

    def InventoryContinue(self, hComm, invCount, invParam):
        res = self.lib.InventoryContinue(hComm, invCount, invParam)
        if res != 0:
            raise UhfException(ERROR_CODE[res])
        return res

    def InventoryStop(self, hComm, timeout):
        res = self.lib.InventoryStop(hComm, timeout)
        return 0

    def GetDeviceInfo(self, hComm, devInfoPtr):
        return self.lib.GetDeviceInfo(hComm, devInfoPtr)
