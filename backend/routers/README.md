# 📡 RFID Management System - Routers Directory Documentation

> เอกสารอธิบายโครงสร้างและหน้าที่ของแต่ละ Router ในระบบ RFID Management System

## 🎯 ภาพรวม Routers Directory

โฟลเดอร์ `routers/` ประกอบด้วย FastAPI router modules ที่แยกการทำงานตาม domain
แต่ละไฟล์จัดการ API endpoints ที่เกี่ยวข้องกับหน้าที่เฉพาะด้าน

---

## 📂 โครงสร้างไฟล์ในโฟลเดอร์ routers/

### 🔧 **Core System Files**

#### 📄 `__init__.py`
```python
"""
Router package initialization
=============================

ไฟล์นี้ทำให้โฟลเดอร์ routers เป็น Python package
และรวบรวม router ทั้งหมดเพื่อ export ไปใช้ใน main.py

Features:
- Import และ export ทุก router
- Router configuration ส่วนกลาง
- Common middleware setup
- API versioning (ถ้ามี)

การใช้งาน:
from routers.users import router as users_router
from routers.assets import router as assets_router
"""
```

---

### 👤 **User Management Router**

#### 📄 `users.py`
```python
"""
User Management API Endpoints
=============================

จัดการผู้ใช้งานระบบ, การยืนยันตัวตน, และการควบคุมสิทธิ์

API Endpoints:
- POST   /api/users/register     - ลงทะเบียนผู้ใช้ใหม่
- POST   /api/users/login        - เข้าสู่ระบบ
- POST   /api/users/logout       - ออกจากระบบ
- GET    /api/users/profile      - ดูข้อมูลโปรไฟล์
- PUT    /api/users/profile      - แก้ไขโปรไฟล์
- POST   /api/users/change-password - เปลี่ยนรหัสผ่าน
- GET    /api/users              - ดูรายการผู้ใช้ (Admin)
- PUT    /api/users/{user_id}    - แก้ไขผู้ใช้ (Admin)
- DELETE /api/users/{user_id}    - ลบผู้ใช้ (Admin)

Features:
- JWT Token authentication
- Role-based access control (Admin, User, Viewer)
- Password hashing และ validation
- Session management
- User activity logging

Security:
- Password strength validation
- Rate limiting สำหรับ login
- Secure session handling
- Input sanitization
"""
```

---

### 📦 **Asset Management Router**

#### 📄 `assets.py`
```python
"""
Asset Management API Endpoints
==============================

จัดการสินทรัพย์ในระบบ รวมถึงการเพิ่ม แก้ไข ลบ และค้นหา

API Endpoints:
- GET    /api/assets             - ดูรายการสินทรัพย์ทั้งหมด
- POST   /api/assets             - เพิ่มสินทรัพย์ใหม่
- GET    /api/assets/{asset_id}  - ดูรายละเอียดสินทรัพย์
- PUT    /api/assets/{asset_id}  - แก้ไขข้อมูลสินทรัพย์
- DELETE /api/assets/{asset_id}  - ลบสินทรัพย์
- GET    /api/assets/search      - ค้นหาสินทรัพย์
- POST   /api/assets/bulk        - เพิ่มสินทรัพย์หลายรายการ
- GET    /api/assets/export      - Export ข้อมูลสินทรัพย์
- POST   /api/assets/import      - Import ข้อมูลสินทรัพย์

Features:
- CRUD operations สำหรับสินทรัพย์
- Advanced search และ filtering
- Asset categorization
- Status management (idle, in_use, maintenance, borrowed)
- Asset history tracking
- Bulk operations
- Import/Export functionality
- Asset image upload
- QR code generation

Business Logic:
- Asset validation rules
- Status transition rules
- Ownership tracking
- Depreciation calculation
- Maintenance scheduling
"""
```

---

### 🏷️ **RFID Tag Management Router**

#### 📄 `tags.py`
```python
"""
RFID Tag Management API Endpoints
=================================

จัดการ RFID tags, การผูกกับสินทรัพย์, และการติดตามสถานะ

API Endpoints:
- GET    /api/tags               - ดูรายการ RFID tags ทั้งหมด
- POST   /api/tags               - เพิ่ม RFID tag ใหม่
- GET    /api/tags/{tag_id}      - ดูรายละเอียด tag
- PUT    /api/tags/{tag_id}      - แก้ไขข้อมูล tag
- DELETE /api/tags/{tag_id}      - ลบ tag
- POST   /api/tags/bind          - ผูก tag กับสินทรัพย์
- DELETE /api/tags/{tag_id}/unbind - ยกเลิกการผูก tag
- GET    /api/tags/unbound       - ดู tags ที่ยังไม่ผูก
- GET    /api/tags/search        - ค้นหา tags
- POST   /api/tags/bulk-bind     - ผูก tags หลายตัว
- PUT    /api/tags/{tag_id}/authorize - อนุญาต/ห้าม tag

Features:
- Tag registration และ management
- Tag-Asset binding/unbinding
- Tag status monitoring (active, inactive, lost)
- Tag authorization control
- Bulk tag operations
- Tag history tracking
- Tag validation
- Duplicate detection

RFID Operations:
- Tag ID format validation
- EPC encoding/decoding
- Tag memory management
- Anti-collision algorithms
- Read/Write operations
"""
```

---

### 📍 **Location Management Router**

#### 📄 `locations.py`
```python
"""
Location Management API Endpoints
=================================

จัดการสถานที่ในระบบ, zones, และการควบคุมการเข้าถึง

API Endpoints:
- GET    /api/locations          - ดูรายการสถานที่ทั้งหมด
- POST   /api/locations          - เพิ่มสถานที่ใหม่
- GET    /api/locations/{loc_id} - ดูรายละเอียดสถานที่
- PUT    /api/locations/{loc_id} - แก้ไขข้อมูลสถานที่
- DELETE /api/locations/{loc_id} - ลบสถานที่
- GET    /api/locations/tree     - ดู location hierarchy
- POST   /api/locations/zone     - สร้าง zone ใหม่
- GET    /api/locations/{loc_id}/assets - ดูสินทรัพย์ในสถานที่
- POST   /api/locations/{loc_id}/access - ตั้งค่าการเข้าถึง

Features:
- Location hierarchy management
- Zone configuration
- Access control settings
- Location-based reporting
- GPS coordinates support
- Location mapping
- Entry/Exit point configuration

Location Types:
- Building (อาคาร)
- Floor (ชั้น)
- Room (ห้อง)
- Zone (โซน)
- Gate (ประตู)
- Warehouse (คลังสินค้า)
- Outside (พื้นที่ภายนอก)

Business Rules:
- Location access permissions
- Movement rules
- Alert zones
- Restricted areas
"""
```

---

### 🚶 **Movement Tracking Router**

#### 📄 `movements.py`
```python
"""
Movement Tracking API Endpoints
===============================

ติดตามการเคลื่อนไหวของสินทรัพย์และสร้างประวัติการเคลื่อนไหว

API Endpoints:
- GET    /api/movements          - ดูประวัติการเคลื่อนไหวทั้งหมด
- POST   /api/movements          - บันทึกการเคลื่อนไหวใหม่
- GET    /api/movements/{id}     - ดูรายละเอียดการเคลื่อนไหว
- GET    /api/movements/asset/{asset_id} - ประวัติการเคลื่อนไหวของสินทรัพย์
- GET    /api/movements/location/{loc_id} - การเคลื่อนไหวในสถานที่
- GET    /api/movements/recent   - การเคลื่อนไหวล่าสุด
- GET    /api/movements/timeline - Timeline การเคลื่อนไหว
- POST   /api/movements/manual   - บันทึกการเคลื่อนไหวด้วยตนเอง
- GET    /api/movements/analytics - วิเคราะห์การเคลื่อนไหว

Features:
- Real-time movement tracking
- Movement history และ timeline
- Movement pattern analysis
- Unauthorized movement detection
- Movement analytics และ reporting
- GPS tracking integration
- Route optimization
- Movement alerts

Event Types:
- ENTER: เข้าสู่พื้นที่
- EXIT: ออกจากพื้นที่
- MOVE: เคลื่อนที่ภายในพื้นที่
- DETECTED: ตรวจจับการมีอยู่
- LOST: สูญหาย/ไม่พบสัญญาณ

Business Logic:
- Movement validation rules
- Geofencing
- Unauthorized access alerts
- Movement reporting
- Audit trail
"""
```

---

### 🔔 **Notification System Router**

#### 📄 `notifications.py`
```python
"""
Notification System API Endpoints
=================================

จัดการระบบการแจ้งเตือนและการส่งข้อความไปยังผู้ใช้

API Endpoints:
- GET    /api/notifications      - ดูการแจ้งเตือนทั้งหมด
- POST   /api/notifications      - สร้างการแจ้งเตือนใหม่
- GET    /api/notifications/{id} - ดูรายละเอียดการแจ้งเตือน
- PUT    /api/notifications/{id}/read - ทำเครื่องหมายว่าอ่านแล้ว
- PUT    /api/notifications/{id}/ack - รับทราบการแจ้งเตือน
- DELETE /api/notifications/{id} - ลบการแจ้งเตือน
- GET    /api/notifications/unread - การแจ้งเตือนที่ยังไม่อ่าน
- POST   /api/notifications/broadcast - ส่งการแจ้งเตือนไปทุกคน
- GET    /api/notifications/settings - การตั้งค่าการแจ้งเตือน
- PUT    /api/notifications/settings - อัปเดตการตั้งค่า

Features:
- Real-time notification delivery
- Multiple notification channels (WebSocket, Email, SMS)
- Notification priority levels
- User notification preferences
- Notification history
- Bulk notification management
- Template-based notifications
- Notification scheduling

Notification Types:
- ASSET_MOVED: สินทรัพย์เคลื่อนที่
- ASSET_MISSING: สินทรัพย์หายไป
- UNAUTHORIZED_ACCESS: การเข้าถึงที่ไม่ได้รับอนุญาต
- SYSTEM_ALERT: การแจ้งเตือนระบบ
- MAINTENANCE_DUE: ถึงเวลาบำรุงรักษา
- OVERDUE_RETURN: เกินกำหนดคืน

Priority Levels:
- LOW: ข้อมูลทั่วไป
- NORMAL: การแจ้งเตือนปกติ
- HIGH: สำคัญ
- CRITICAL: วิกฤต/เร่งด่วน
"""
```

---

### 📋 **Borrowing System Router**

#### 📄 `borrowing.py`
```python
"""
Borrowing System API Endpoints
==============================

จัดการระบบยืม-คืนสินทรัพย์ และติดตามสถานะการยืม

API Endpoints:
- GET    /api/borrowing/records  - ดูบันทึกการยืมทั้งหมด
- POST   /api/borrowing/checkout - ยืมสินทรัพย์
- POST   /api/borrowing/checkin  - คืนสินทรัพย์
- GET    /api/borrowing/{id}     - ดูรายละเอียดการยืม
- PUT    /api/borrowing/{id}     - แก้ไขข้อมูลการยืม
- GET    /api/borrowing/active   - การยืมที่ยังไม่คืน
- GET    /api/borrowing/overdue  - การยืมที่เกินกำหนด
- GET    /api/borrowing/available - สินทรัพย์ที่สามารถยืมได้
- POST   /api/borrowing/extend   - ขยายเวลาการยืม
- GET    /api/borrowing/history/{user_id} - ประวัติการยืมของผู้ใช้

Features:
- Asset checkout/checkin process
- Borrower management
- Due date tracking
- Overdue notifications
- Borrowing history
- Asset availability checking
- Return condition assessment
- Borrowing reports

Borrowing Workflow:
1. Check asset availability
2. Verify borrower eligibility
3. Record borrowing details
4. Set due date
5. Monitor return status
6. Process return
7. Update asset status

Business Rules:
- Borrowing eligibility rules
- Asset availability rules
- Due date calculations
- Overdue penalty rules
- Return condition assessment
- Borrowing limits per user
"""
```

---

### 🔍 **RFID Scanning Router**

#### 📄 `scan.py`
```python
"""
RFID Scanning API Endpoints
===========================

จัดการการสแกน RFID tags และประมวลผลข้อมูลการสแกน

API Endpoints:
- POST   /api/scan/start         - เริ่มการสแกน
- POST   /api/scan/stop          - หยุดการสแกน
- GET    /api/scan/status        - สถานะการสแกน
- POST   /api/scan/manual        - สแกนด้วยตนเอง
- GET    /api/scan/results       - ผลการสแกนล่าสุด
- GET    /api/scan/history       - ประวัติการสแกน
- POST   /api/scan/bulk          - สแกนหลาย tags พร้อมกัน
- GET    /api/scan/performance   - ประสิทธิภาพการสแกน
- POST   /api/scan/validate      - ตรวจสอบความถูกต้องของการสแกน

Features:
- Real-time RFID scanning
- Manual scan operations
- Bulk scanning support
- Scan result validation
- Scan performance monitoring
- Scan history tracking
- Error handling และ recovery
- Multiple scanner support

Scanning Modes:
- CONTINUOUS: สแกนต่อเนื่อง
- SINGLE: สแกนครั้งเดียว
- INVENTORY: สแกนเพื่อนับสินค้า
- SEARCH: ค้นหา tag เฉพาะ
- VERIFICATION: ตรวจสอบ tag

Scan Results:
- Tag IDs detected
- Signal strength (RSSI)
- Antenna information
- Timestamp
- Location information
- Error codes (ถ้ามี)
"""
```

---

### 📡 **Scanner Configuration Router**

#### 📄 `scanner_config.py`
```python
"""
RFID Scanner Configuration API Endpoints
========================================

จัดการการตั้งค่าและการกำหนดค่าเครื่องสแกน RFID

API Endpoints:
- GET    /api/scanner-config     - ดูการตั้งค่าเครื่องสแกนทั้งหมด
- PUT    /api/scanner-config     - อัปเดตการตั้งค่า
- POST   /api/scanner-config/reset - รีเซ็ตการตั้งค่า
- GET    /api/scanner-config/devices - ดูอุปกรณ์สแกนที่เชื่อมต่อ
- POST   /api/scanner-config/connect - เชื่อมต่ออุปกรณ์
- POST   /api/scanner-config/disconnect - ตัดการเชื่อมต่อ
- GET    /api/scanner-config/status - สถานะอุปกรณ์
- POST   /api/scanner-config/test - ทดสอบการทำงาน
- GET    /api/scanner-config/params - พารามิเตอร์การทำงาน

Features:
- Device connection management
- Scanner parameter configuration
- Network และ serial connection setup
- Device status monitoring
- Performance tuning
- Firmware management
- Error diagnostics
- Configuration backup/restore

Configuration Parameters:
- WORKMODE: โหมดการทำงาน
- REGION: ภูมิภาค/ความถี่
- RFIDPOWER: กำลังส่งสัญญาณ
- ANT: การเลือกเสาอากาศ
- QVALUE: Q-factor สำหรับ anti-collision
- SESSION: Session การสแกน
- FILTERTIME: เวลา filter
- BUZZERTIME: เวลาเสียงแจ้งเตือน

Connection Types:
- Serial (COM Port)
- Network (TCP/IP)
- USB
- Bluetooth (ถ้ารองรับ)
"""
```

---

### ⚙️ **System Configuration Router**

#### 📄 `system_config.py`
```python
"""
System Configuration API Endpoints
==================================

จัดการการตั้งค่าระบบส่วนกลางและพารามิเตอร์การทำงาน

API Endpoints:
- GET    /api/system-config      - ดูการตั้งค่าระบบทั้งหมด
- PUT    /api/system-config      - อัปเดตการตั้งค่า
- POST   /api/system-config/reset - รีเซ็ตการตั้งค่าเริ่มต้น
- GET    /api/system-config/{key} - ดูการตั้งค่าเฉพาะ
- PUT    /api/system-config/{key} - อัปเดตการตั้งค่าเฉพาะ
- POST   /api/system-config/backup - สำรองการตั้งค่า
- POST   /api/system-config/restore - คืนค่าการตั้งค่า
- GET    /api/system-config/history - ประวัติการเปลี่ยนแปลง

Features:
- Global system settings management
- Configuration validation
- Settings backup และ restore
- Configuration versioning
- Settings change history
- Environment-specific settings
- Feature toggles
- Performance tuning parameters

Configuration Categories:
- DATABASE: การตั้งค่าฐานข้อมูล
- SCANNER: การตั้งค่าเครื่องสแกน
- NOTIFICATION: การตั้งค่าการแจ้งเตือน
- SECURITY: การตั้งค่าความปลอดภัย
- PERFORMANCE: การตั้งค่าประสิทธิภาพ
- INTEGRATION: การตั้งค่าการเชื่อมต่อภายนอก

Common Settings:
- CONNECTION_TIMEOUT: Timeout การเชื่อมต่อ
- SCAN_INTERVAL: ช่วงเวลาการสแกน
- DB_UPDATE_INTERVAL: ช่วงเวลาการอัปเดต DB
- DELAY_SECONDS: หน่วงเวลาป้องกันการประมวลผลซ้ำ
- MAX_RECONNECT_ATTEMPTS: จำนวนครั้งสูงสุดในการลอง reconnect
"""
```

---

### ⚠️ **Alert System Router**

#### 📄 `alerts.py`
```python
"""
Alert System API Endpoints
==========================

จัดการระบบ alerts และการแจ้งเตือนเหตุการณ์สำคัญ

API Endpoints:
- GET    /api/alerts             - ดู alerts ทั้งหมด
- POST   /api/alerts             - สร้าง alert ใหม่
- GET    /api/alerts/{id}        - ดูรายละเอียด alert
- PUT    /api/alerts/{id}        - แก้ไข alert
- DELETE /api/alerts/{id}        - ลบ alert
- POST   /api/alerts/{id}/acknowledge - รับทราบ alert
- GET    /api/alerts/active      - alerts ที่ยัง active
- GET    /api/alerts/rules       - กฎการ alert
- POST   /api/alerts/rules       - สร้างกฎใหม่
- PUT    /api/alerts/rules/{id}  - แก้ไขกฎ

Features:
- Real-time alert generation
- Alert rule configuration
- Alert severity levels
- Alert escalation
- Alert acknowledgment
- Alert history tracking
- Custom alert conditions
- Integration with notification system

Alert Types:
- ASSET_MISSING: สินทรัพย์หายไป
- UNAUTHORIZED_MOVEMENT: การเคลื่อนไหวที่ไม่ได้รับอนุญาต
- DEVICE_OFFLINE: อุปกรณ์ offline
- SYSTEM_ERROR: ข้อผิดพลาดระบบ
- MAINTENANCE_OVERDUE: เกินกำหนดบำรุงรักษา
- SECURITY_BREACH: การละเมิดความปลอดภัย

Alert Severity:
- INFO: ข้อมูลทั่วไป
- WARNING: คำเตือน
- ERROR: ข้อผิดพลาด
- CRITICAL: วิกฤต

Alert Conditions:
- Time-based conditions
- Location-based conditions
- Asset status conditions
- User activity conditions
- System performance conditions
"""
```

---

### 📊 **Reports และ Analytics Router**

#### 📄 `reports.py`
```python
"""
Reports และ Analytics API Endpoints
===================================

จัดการรายงานและการวิเคราะห์ข้อมูลของระบบ

API Endpoints:
- GET    /api/reports            - ดูรายงานทั้งหมด
- POST   /api/reports/generate   - สร้างรายงานใหม่
- GET    /api/reports/{id}       - ดูรายงานเฉพาะ
- GET    /api/reports/dashboard  - ข้อมูลสำหรับ dashboard
- GET    /api/reports/summary    - สรุปข้อมูลระบบ
- GET    /api/reports/assets     - รายงานสินทรัพย์
- GET    /api/reports/movements  - รายงานการเคลื่อนไหว
- GET    /api/reports/borrowing  - รายงานการยืม
- POST   /api/reports/export     - Export รายงาน
- GET    /api/reports/analytics  - การวิเคราะห์ข้อมูล

Features:
- Real-time dashboard data
- Custom report generation
- Data visualization support
- Export functionality (PDF, Excel, CSV)
- Scheduled reports
- Report templates
- Data analytics
- Performance metrics

Report Types:
- ASSET_INVENTORY: รายงานสินค้าคงคลัง
- MOVEMENT_HISTORY: รายงานประวัติการเคลื่อนไหว
- BORROWING_SUMMARY: สรุปการยืม
- SYSTEM_PERFORMANCE: ประสิทธิภาพระบบ
- USER_ACTIVITY: กิจกรรมผู้ใช้
- DEVICE_STATUS: สถานะอุปกรณ์

Analytics Features:
- Trend analysis
- Pattern recognition
- Predictive analytics
- Utilization reports
- Performance benchmarking
- ROI analysis

Export Formats:
- PDF: สำหรับการพิมพ์
- Excel: สำหรับการวิเคราะห์
- CSV: สำหรับการประมวลผลข้อมูล
- JSON: สำหรับ API integration
"""
```

---

## 🔄 **Router Integration Flow**

### การทำงานร่วมกันของ Routers:

```
1. Authentication Flow:
   users.py → JWT Token → Other Routers

2. Asset Management Flow:
   assets.py → tags.py → locations.py → movements.py

3. Scanning Flow:
   scan.py → scanner_config.py → tags.py → movements.py → notifications.py

4. Alert Flow:
   alerts.py → notifications.py → users.py (for delivery)

5. Reporting Flow:
   reports.py → (All other routers for data)
```

### Common Dependencies:
```python
# ทุก router ใช้:
from fastapi import APIRouter, HTTPException, Depends
from config.database import get_db_connection
from models import (relevant models)
import logging

# Authentication-required routers ใช้:
from middleware.auth import get_current_user
```

---

## 🛠️ **Development Guidelines สำหรับ Routers**

### การสร้าง Router ใหม่:
```python
# template สำหรับ router ใหม่
from fastapi import APIRouter, HTTPException
from typing import List
from models import YourModel
from config.database import get_db_connection

router = APIRouter(
    prefix="/api/your-endpoint",
    tags=["Your Category"],
    responses={404: {"description": "Not found"}}
)

@router.get("/")
async def list_items():
    """ดูรายการทั้งหมด"""
    pass

@router.post("/")
async def create_item(item: YourModel):
    """สร้างรายการใหม่"""
    pass

@router.get("/{item_id}")
async def get_item(item_id: int):
    """ดูรายการเฉพาะ"""
    pass

@router.put("/{item_id}")
async def update_item(item_id: int, item: YourModel):
    """แก้ไขรายการ"""
    pass

@router.delete("/{item_id}")
async def delete_item(item_id: int):
    """ลบรายการ"""
    pass
```

### Best Practices:
1. ✅ ใช้ meaningful endpoint names
2. ✅ เพิ่ม proper error handling
3. ✅ ใช้ Pydantic models สำหรับ validation
4. ✅ เพิ่ม docstrings และ comments
5. ✅ ใช้ async/await เมื่อเหมาะสม
6. ✅ เพิ่ม authentication เมื่อจำเป็น
7. ✅ ใช้ logging สำหรับ debugging
8. ✅ Handle database connections properly

---

## 🔒 **Security Considerations**

### Authentication & Authorization:
- JWT tokens สำหรับ authentication
- Role-based access control (RBAC)
- Route-level permission checking
- Input validation และ sanitization

### Data Protection:
- SQL injection prevention
- XSS protection
- Rate limiting
- Input size limits
- Secure error messages

---

## 📈 **Performance Tips**

### Database Operations:
- ใช้ connection pooling
- Optimize queries
- Use pagination สำหรับ large datasets
- Cache frequently accessed data

### API Response:
- Minimize response payload
- Use appropriate HTTP status codes
- Implement compression
- Use async operations

---

*เอกสารนี้อัปเดตล่าสุด: September 3, 2025*
*สำหรับข้อมูลเพิ่มเติม อ่านที่ PROJECT_STRUCTURE.md*
