"""
RFID Management System - Data Models
====================================

ไฟล์นี้ประกอบด้วย Pydantic models สำหรับ validation และ serialization ข้อมูล
ใช้สำหรับ API request/response และการตรวจสอบข้อมูลก่อนบันทึกลงฐานข้อมูล

โครงสร้างหลัก:
- User & Authentication Models: การจัดการผู้ใช้และล็อกอิน
- Asset Management Models: การจัดการสินทรัพย์
- Tag & RFID Models: การจัดการแท็ก RFID
- Location & Movement Models: การจัดการสถานที่และการเคลื่อนไหว
- Notification Models: การแจ้งเตือน
- System Configuration Models: การตั้งค่าระบบ
"""

from datetime import datetime, date
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel
from config import Base  # นำเข้า SQLAlchemy Base จาก config package

# ----------------------------
# User & Authentication Models
# ----------------------------

class UserCreate(BaseModel):
    """
    Model สำหรับสร้างผู้ใช้ใหม่
    ใช้ในการรับข้อมูลจาก API เมื่อมีการลงทะเบียนผู้ใช้ใหม่
    """
    username: str              # ชื่อผู้ใช้ (ต้องไม่ซ้ำ)
    password: str              # รหัสผ่าน (จะถูก hash ก่อนบันทึก)
    full_name: Optional[str] = None    # ชื่อเต็ม (ไม่บังคับ)
    email: Optional[str] = None        # อีเมล (ไม่บังคับ)

class User(BaseModel):
    """
    Model สำหรับข้อมูลผู้ใช้ที่ส่งกลับ
    ไม่รวมรหัสผ่านเพื่อความปลอดภัย
    """
    user_id: Optional[int]             # ID ของผู้ใช้
    username: str                      # ชื่อผู้ใช้
    full_name: Optional[str] = None    # ชื่อเต็ม
    email: Optional[str] = None        # อีเมล
    created_at: Optional[datetime] = None      # วันที่สร้าง
    updated_at: Optional[datetime] = None      # วันที่แก้ไขล่าสุด

class UserLogin(BaseModel):
    """
    Model สำหรับการล็อกอิน
    ใช้รับข้อมูลจาก API เมื่อผู้ใช้ต้องการเข้าสู่ระบบ
    """
    username: str      # ชื่อผู้ใช้
    password: str      # รหัสผ่าน

class Token(BaseModel):
    """
    Model สำหรับ Token ที่ส่งกลับหลังจากล็อกอินสำเร็จ
    ในการใช้งานจริงควรใช้ JWT (JSON Web Token)
    """
    access_token: str          # Token สำหรับการยืนยันตัวตน
    token_type: str = "bearer" # ประเภทของ token

# ----------------------------
# Scan & RFID Operation Models
# ----------------------------

class ScanResult(BaseModel):
    """
    Model สำหรับผลลัพธ์การสแกน RFID
    ใช้ส่งกลับสรุปผลการสแกนและการเปลี่ยนแปลงของแท็ก
    """
    status: str                # สถานะการสแกน (success/error)
    tags_found: List[str]      # รายการแท็กที่พบ
    tags_added: List[str]      # รายการแท็กที่เพิ่มใหม่
    tags_removed: List[str]    # รายการแท็กที่หายไป

# ----------------------------
# Enum Definitions - ค่าคงที่สำหรับสถานะต่างๆ
# ----------------------------

class TagStatus(str, Enum):
    """สถานะของแท็ก RFID"""
    idle = "idle"              # ไม่ได้ใช้งาน
    available = "available"    # พร้อมใช้งาน
    in_use = "in_use"         # กำลังใช้งาน
    borrowed = "borrowed"      # ถูกยืม
    removed = "removed"        # ถูกนำออก

class AssetStatus(str, Enum):
    """สถานะของสินทรัพย์"""
    idle = "idle"              # ไม่ได้ใช้งาน
    in_use = "in_use"         # กำลังใช้งาน
    borrowed = "borrowed"      # ถูกยืม
    maintenance = "maintenance" # อยู่ระหว่างซ่อมบำรุง

class NotificationStatus(str, Enum):
    """สถานะของการแจ้งเตือน"""
    new = "new"    # ใหม่ (ยังไม่ได้อ่าน)
    read = "read"  # อ่านแล้ว
    ack = "ack"    # รับทราบแล้ว

class MovementEvent(str, Enum):
    """ประเภทของการเคลื่อนไหว"""
    enter = "enter"     # เข้าพื้นที่
    exit = "exit"       # ออกจากพื้นที่
    move = "move"       # ย้ายสถานที่
    borrow = "borrow"   # ยืม
    return_ = "return"  # คืน

class LocationDirection(str, Enum):
    """ทิศทางของสถานที่"""
    in_ = "in"     # ทางเข้า
    out = "out"    # ทางออก
    gate = "gate"  # ประตู/จุดผ่าน

# ----------------------------
# Asset Management Models
# ----------------------------

class AssetCreate(BaseModel):
    """
    Model สำหรับสร้างสินทรัพย์ใหม่
    ใช้เมื่อต้องการเพิ่มสินทรัพย์เข้าสู่ระบบ
    """
    name: str              # ชื่อสินทรัพย์
    type: str              # ประเภทของสินทรัพย์
    status: str = "idle"   # สถานะเริ่มต้น

class Asset(BaseModel):
    """
    Model หลักสำหรับสินทรัพย์
    ใช้แสดงข้อมูลสินทรัพย์ในระบบ
    """
    asset_id: int                      # ID ของสินทรัพย์
    name: str                          # ชื่อสินทรัพย์
    type: str                          # ประเภท (เช่น อุปกรณ์คอมพิวเตอร์, เครื่องจักร)
    status: str                        # สถานะปัจจุบัน
    created_at: datetime               # วันที่สร้าง
    updated_at: Optional[datetime] = None      # วันที่แก้ไขล่าสุด
    
    class Config:
        from_attributes = True  # อนุญาตให้แปลงจาก SQLAlchemy objects

class AssetDetail(Asset):
    """
    Model สำหรับข้อมูลสินทรัพย์แบบละเอียด
    รวมข้อมูลแท็กและประวัติการเคลื่อนไหวที่เกี่ยวข้อง
    """
    tags: List["Tag"] = []          # รายการแท็กที่ผูกกับสินทรัพย์นี้
    movements: List["Movement"] = [] # ประวัติการเคลื่อนไหว

# ----------------------------
# Tag & RFID Models
# ----------------------------

class Tag(BaseModel):
    """
    Model หลักสำหรับแท็ก RFID
    เก็บข้อมูลแท็กและสถานะการใช้งาน
    """
    tag_id: str                            # ID ของแท็ก (จากการสแกน RFID)
    status: Optional[str] = None           # สถานะของแท็ก
    asset_id: Optional[int] = None         # ID ของสินทรัพย์ที่ผูกกับแท็กนี้
    current_location_id: Optional[int] = None  # สถานที่ปัจจุบัน
    last_seen: Optional[datetime] = None   # วันเวลาที่เจอล่าสุด
    authorized: Optional[bool] = False     # ได้รับอนุญาตหรือไม่
    created_at: Optional[datetime] = None  # วันที่สร้าง
    updated_at: Optional[datetime] = None  # วันที่แก้ไขล่าสุด

class TagOp(BaseModel):
    """
    Model สำหรับการดำเนินการกับแท็ก
    ใช้สำหรับการลงทะเบียน, ยืม, คืน แท็ก
    """
    tag_id: str                            # ID ของแท็ก
    action: str                            # การดำเนินการ (register|borrow|return)
    asset_id: Optional[int]                # ID ของสินทรัพย์ (ใช้ตอน register)
    borrower: Optional[str] = None         # ชื่อผู้ยืม (บังคับเมื่อ action='borrow')
    operator: Optional[str] = None         # ชื่อผู้ดำเนินการ
    timestamp: Optional[datetime] = None   # เวลาที่ดำเนินการ

class BindModel(BaseModel):
    """
    Model สำหรับการผูกแท็กกับสินทรัพย์
    ใช้เมื่อต้องการเชื่อมโยงแท็ก RFID กับสินทรัพย์
    """
    asset_id: int  # ID ของสินทรัพย์ที่จะผูก

class ScanModel(BaseModel):
    """
    Model สำหรับข้อมูลการสแกนจากอุปกรณ์มือถือ
    ใช้เมื่อมีการสแกนแท็กด้วยเครื่องสแกนพกพา
    """
    tag_id: str                            # ID ของแท็กที่สแกน
    operator: Optional[str]                # ผู้ดำเนินการสแกน
    timestamp: Optional[datetime]          # เวลาที่สแกน

# ----------------------------
# Location & Movement Models
# ----------------------------

class Location(BaseModel):
    """
    Model สำหรับสถานที่ในระบบ
    เก็บข้อมูลสถานที่ต่างๆ ที่มีเครื่องสแกน RFID
    """
    location_id: int                   # ID ของสถานที่
    name: str                          # ชื่อสถานที่
    description: Optional[str]         # คำอธิบาย
    direction: LocationDirection       # ทิศทางของสถานที่
    ip_address: Optional[str]          # IP address ของเครื่องสแกน (ถ้าเชื่อมต่อผ่าน network)
    port: Optional[int]                # Port ของเครื่องสแกน
    timeout: Optional[int]             # Timeout การเชื่อมต่อ

class LocationRead(BaseModel):
    """
    Model สำหรับการอ่านข้อมูลสถานที่
    ใช้แสดงข้อมูลสถานที่ในรูปแบบที่เหมาะสมกับการแสดงผล
    """
    id: int                                # ID ของสถานที่
    name: str                              # ชื่อสถานที่
    description: Optional[str] = None      # คำอธิบาย
    active: bool = True                    # สถานะการใช้งาน
    created_at: datetime                   # วันที่สร้าง
    updated_at: Optional[datetime] = None  # วันที่แก้ไขล่าสุด

    class Config:
        from_attributes = True

class Movement(BaseModel):
    """
    Model สำหรับบันทึกการเคลื่อนไหวของสินทรัพย์
    เก็บประวัติการย้ายสถานที่ของสินทรัพย์
    """
    movement_id: Optional[int]             # ID ของการเคลื่อนไหว
    asset_id: int                          # ID ของสินทรัพย์
    from_location_id: Optional[int]        # สถานที่ต้นทาง
    to_location_id: Optional[int]          # สถานที่ปลายทาง
    timestamp: datetime                    # เวลาที่เกิดการเคลื่อนไหว
    operator: Optional[str]                # ผู้ดำเนินการ
    event_type: MovementEvent              # ประเภทของการเคลื่อนไหว

# ----------------------------
# Notification Models
# ----------------------------

class Notification(BaseModel):
    """
    Model หลักสำหรับการแจ้งเตือน
    ใช้เก็บข้อมูลการแจ้งเตือนต่างๆ ในระบบ
    """
    notif_id: Optional[int]            # ID ของการแจ้งเตือน
    tag_id: str                        # ID ของแท็กที่เกี่ยวข้อง
    message: str                       # ข้อความแจ้งเตือน
    status: NotificationStatus = NotificationStatus.new  # สถานะการแจ้งเตือน
    timestamp: datetime                # เวลาที่เกิดการแจ้งเตือน

class NotificationResponse(BaseModel):
    """
    Model สำหรับการตอบกลับข้อมูลการแจ้งเตือน
    ใช้ส่งข้อมูลการแจ้งเตือนแบบละเอียดกลับไปยัง API client
    """
    notif_id: int                              # ID ของการแจ้งเตือน
    type: str                                  # ประเภทการแจ้งเตือน
    title: str                                 # หัวข้อการแจ้งเตือน
    message: str                               # ข้อความแจ้งเตือน
    asset_id: int                              # ID ของสินทรัพย์ที่เกี่ยวข้อง
    user_id: int                               # ID ของผู้ใช้ที่เกี่ยวข้อง
    location_id: int                           # ID ของสถานที่ที่เกี่ยวข้อง
    is_read: bool                              # อ่านแล้วหรือยัง
    is_acknowledged: bool                      # รับทราบแล้วหรือยัง
    timestamp: datetime                        # เวลาที่เกิดการแจ้งเตือน
    read_at: Optional[datetime] = None         # เวลาที่อ่าน
    acknowledged_at: Optional[datetime] = None # เวลาที่รับทราบ
    tag_id: str                                # ID ของแท็กที่เกี่ยวข้อง

    class Config:
        from_attributes = True

class AckModel(BaseModel):
    """
    Model สำหรับการรับทราบการแจ้งเตือน
    ใช้เมื่อผู้ใช้ต้องการรับทราบการแจ้งเตือน
    """
    operator: str  # ชื่อผู้รับทราบ

# ----------------------------
# System Configuration Models
# ----------------------------

class SystemConfig(BaseModel):
    """
    Model สำหรับการตั้งค่าระบบ
    เก็บค่าการตั้งค่าต่างๆ ของระบบที่สามารถปรับแต่งได้
    """
    key: str                       # คีย์ของการตั้งค่า
    value: str                     # ค่าของการตั้งค่า
    description: Optional[str]     # คำอธิบายการตั้งค่า

class ScannerConfig(BaseModel):
    """
    Model สำหรับการตั้งค่าเครื่องสแกน RFID
    เก็บพารามิเตอร์การทำงานของเครื่องสแกน
    """
    key: str                       # คีย์ของการตั้งค่า
    value: str                     # ค่าของการตั้งค่า
    description: Optional[str]     # คำอธิบายการตั้งค่า

# ----------------------------
# Device Connection Models
# ----------------------------

class ConnectNetworkRequest(BaseModel):
    """
    Model สำหรับการเชื่อมต่อเครื่องสแกนผ่าน Network
    ใช้เมื่อต้องการเชื่อมต่อเครื่องสแกน RFID ผ่าน TCP/IP
    """
    ip: str = "10.10.100.254"     # IP Address ของเครื่องสแกน
    port: int = 8899              # Port ของเครื่องสแกน
    timeout: int = 5000           # Timeout การเชื่อมต่อ (มิลลิวินาที)

class ConnectSerialRequest(BaseModel):
    """
    Model สำหรับการเชื่อมต่อเครื่องสแกนผ่าน Serial Port
    ใช้เมื่อต้องการเชื่อมต่อเครื่องสแกน RFID ผ่าง COM Port
    """
    port: str = "COM1"            # COM Port
    baudrate: int = 115200        # Baud Rate

class SetLocationRequest(BaseModel):
    """
    Model สำหรับการกำหนดสถานที่
    ใช้เมื่อต้องการกำหนดสถานที่ให้กับเครื่องสแกน
    """
    location_id: int  # ID ของสถานที่

class ChangeLocationRequest(BaseModel):
    """
    Model สำหรับการเปลี่ยนสถานที่
    ใช้เมื่อต้องการเปลี่ยนสถานที่ของเครื่องสแกน
    """
    location_id: int  # ID ของสถานที่ใหม่

# ----------------------------
# Borrowing System Models
# ----------------------------

class AvailableTag(BaseModel):
    """
    Model สำหรับแท็กที่พร้อมให้ยืม
    แสดงข้อมูลแท็กและสินทรัพย์ที่สามารถยืมได้
    """
    tag_id: str                                # ID ของแท็ก
    asset_id: int                              # ID ของสินทรัพย์
    asset_name: str                            # ชื่อสินทรัพย์
    asset_type: Optional[str] = None           # ประเภทสินทรัพย์
    location_name: Optional[str] = None        # ชื่อสถานที่ปัจจุบัน
    current_location_id: Optional[int] = None  # ID ของสถานที่ปัจจุบัน
    last_seen: Optional[datetime] = None       # วันเวลาที่เจอล่าสุด
    tag_status: str = "idle"                   # สถานะของแท็ก
    asset_status: str = "idle"                 # สถานะของสินทรัพย์
    is_available: bool = True                  # สามารถยืมได้หรือไม่

    class Config:
        from_attributes = True

# ----------------------------
# Report Models
# ----------------------------

class ReportSummary(BaseModel):
    """
    Model สำหรับสรุปรายงาน
    ใช้แสดงข้อมูลสรุปการใช้งานแท็กและสถานที่
    """
    status: TagStatus              # สถานะของแท็ก
    location_id: Optional[int]     # ID ของสถานที่
    location_name: str             # ชื่อสถานที่
    cnt: int                       # จำนวน

class ReportHistory(BaseModel):
    """
    Model สำหรับรายงานประวัติ
    ใช้แสดงข้อมูลประวัติการใช้งานตามช่วงเวลา
    """
    period: str    # ช่วงเวลา
    cnt: int       # จำนวน

# อัพเดต forward references สำหรับ models ที่อ้างอิงกัน
AssetDetail.update_forward_refs()