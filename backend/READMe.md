# RFID Management System

ระบบจัดการ RFID Scanner และ Tag Tracking สำหรับการติดตามสินทรัพย์และการยืม-คืน

## 📋 สารบัญ

- [การติดตั้ง](#การติดตั้ง)
- [การกำหนดค่าฐานข้อมูล](#การกำหนดค่าฐานข้อมูล)
- [โครงสร้างฐานข้อมูล](#โครงสร้างฐานข้อมูล)
- [การใช้งาน](#การใช้งาน)
- [API Documentation](#api-documentation)
- [การแก้ไขปัญหา](#การแก้ไขปัญหา)

## 🚀 การติดตั้ง

### ความต้องการของระบบ

- Python 3.8+
- MySQL 8.0+ (หรือ SQLite)
- Node.js 16+ (สำหรับ Frontend)
- XAMPP/WAMP (สำหรับ MySQL local development)

### ขั้นตอนการติดตั้ง

1. **Clone โปรเจค**
```bash
git clone <repository-url>
cd RFID-Management-System
```

2. **ติดตั้ง Dependencies**
```bash
cd backend
pip install -r requirements.txt
```

3. **สร้างไฟล์ Environment**
```bash
python manage.py create-env
```

4. **แก้ไขการตั้งค่าในไฟล์ .env**
```bash
# ดูรายละเอียดใน section การกำหนดค่าฐานข้อมูล
```

5. **สร้างฐานข้อมูล**
```bash
# สำหรับ MySQL
python manage.py create-mysql-db
python manage.py init-db

# สำหรับ SQLite
python manage.py init-db
```

6. **รันระบบ**
```bash
python main.py
```

## 🗄️ การกำหนดค่าฐานข้อมูล

### MySQL Configuration

1. **ติดตั้ง XAMPP และเปิด MySQL**

2. **แก้ไขไฟล์ .env**
```env
# Database Configuration - MySQL
DATABASE_URL=mysql+mysqlconnector://root:@localhost:3306/rfid_system

# MySQL specific settings
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=rfid_system
MYSQL_CHARSET=utf8mb4
```

3. **สร้างฐานข้อมูล**
```bash
python manage.py create-mysql-db
python manage.py init-db
```

### SQLite Configuration

```env
# Database Configuration - SQLite
DATABASE_URL=sqlite:///./rfid_system.db
```

### PostgreSQL Configuration

```env
# Database Configuration - PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/rfid_system
```

## 📊 โครงสร้างฐานข้อมูล

### ตารางหลัก

#### 1. system_config - การตั้งค่าระบบ
```sql
CREATE TABLE system_config (
  `key` VARCHAR(100) PRIMARY KEY,
  `value` VARCHAR(500),
  `description` TEXT
);
```

**ข้อมูลเริ่มต้น:**
- `CONNECTION_TIMEOUT`: 5000 (มิลลิวินาที)
- `DB_UPDATE_INTERVAL`: 1 (วินาที)
- `DELAY_SECONDS`: 20 (วินาที)
- `HEALTH_CHECK_INTERVAL`: 30 (วินาที)
- `MAX_RECONNECT_ATTEMPTS`: 5
- `SCAN_INTERVAL`: 0.1 (วินาที)

#### 2. locations - สถานที่
```sql
CREATE TABLE locations (
  location_id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  direction ENUM('gate', 'in', 'out','both') DEFAULT 'gate',
  ip_address VARCHAR(50),
  port INT,
  timeout INT DEFAULT 5000,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### 3. assets - สินทรัพย์
```sql
CREATE TABLE assets (
  asset_id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(100),
  status ENUM('idle', 'in_use', 'maintenance','borrowed', 'retired') DEFAULT 'idle',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### 4. tags - แท็ก RFID
```sql
CREATE TABLE tags (
  tag_id VARCHAR(50) PRIMARY KEY,
  status ENUM('idle', 'in_use', 'maintenance') DEFAULT 'idle',
  authorized BOOLEAN DEFAULT TRUE,
  asset_id INT,
  current_location_id INT,
  device_id INT,
  first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE SET NULL,
  FOREIGN KEY (current_location_id) REFERENCES locations(location_id) ON DELETE SET NULL
);
```

#### 5. rfid_devices - อุปกรณ์ RFID
```sql
CREATE TABLE rfid_devices (
  device_id INT PRIMARY KEY AUTO_INCREMENT,
  device_sn VARCHAR(100) UNIQUE NOT NULL,
  location_id INT,
  device_name VARCHAR(100),
  connection_type ENUM('com', 'network') NOT NULL,
  connection_info VARCHAR(200),
  status ENUM('online', 'offline', 'error') DEFAULT 'offline',
  last_connected TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_disconnected TIMESTAMP NULL,
  FOREIGN KEY (location_id) REFERENCES locations(location_id) ON DELETE SET NULL
);
```

#### 6. movements - การเคลื่อนไหว
```sql
CREATE TABLE movements (
  movement_id INT PRIMARY KEY AUTO_INCREMENT,
  asset_id INT,
  tag_id VARCHAR(50),
  device_id VARCHAR(50),
  from_location_id INT,
  to_location_id INT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  operator VARCHAR(100) DEFAULT 'system',
  event_type ENUM('enter', 'exit') NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE SET NULL,
  FOREIGN KEY (from_location_id) REFERENCES locations(location_id) ON DELETE SET NULL,
  FOREIGN KEY (to_location_id) REFERENCES locations(location_id) ON DELETE SET NULL
);
```

#### 7. notifications - การแจ้งเตือน
```sql
CREATE TABLE notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT,
  asset_id INT,
  user_id INT,
  location_id INT,
  related_id INT,
  is_read BOOLEAN DEFAULT FALSE,
  is_acknowledged BOOLEAN DEFAULT FALSE,
  priority ENUM('low', 'normal', 'high','critical') DEFAULT 'normal',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  acknowledged_at TIMESTAMP NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE SET NULL,
  FOREIGN KEY (location_id) REFERENCES locations(location_id) ON DELETE SET NULL
);
```

#### 8. borrowing_records - บันทึกการยืม
```sql
CREATE TABLE borrowing_records (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tag_id VARCHAR(50),
  asset_id INT,
  borrower_name VARCHAR(200),
  borrower_contact VARCHAR(200),
  borrow_date DATE,
  expected_return_date DATE,
  return_date DATE,
  expected_return_days INT,
  actual_days INT,
  is_overdue BOOLEAN DEFAULT FALSE,
  overdue_days INT DEFAULT 0,
  notes TEXT,
  return_notes TEXT,
  status ENUM('borrowed', 'returned', 'overdue') DEFAULT 'borrowed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE SET NULL
);
```

### Views และ Stored Procedures

#### Views
- `view_asset_with_tags`: รวมข้อมูล assets, tags และ locations
- `view_device_status`: สถานะอุปกรณ์ RFID

#### Stored Procedures
- `GetAssetMovements(asset_id, days_back)`: ดึงประวัติการเคลื่อนไหว
- `GetOverdueItems()`: ดึงรายการที่เกินกำหนดคืน

## 🛠️ การใช้งาน

### คำสั่ง CLI

```bash
# ดูการตั้งค่าปัจจุบัน
python manage.py config

# ตรวจสอบการเชื่อมต่อฐานข้อมูล
python manage.py check-db

# สร้างฐานข้อมูล MySQL
python manage.py create-mysql-db

# สร้างตารางฐานข้อมูล
python manage.py init-db

# รีเซ็ตฐานข้อมูล (development only)
python manage.py reset-db

# สำรองฐานข้อมูล (SQLite only)
python manage.py backup-db

# ตรวจสอบ RFID scanner
python manage.py check-scanner

# ติดตั้ง dependencies
python manage.py install-deps

# ดูโครงสร้างโปรเจค
python manage.py structure

# สร้างไฟล์ .env
python manage.py create-env
```

### การเปลี่ยนฐานข้อมูล

#### จาก SQLite เป็น MySQL:

1. **แก้ไข .env**
```env
# เปลี่ยนจาก
DATABASE_URL=sqlite:///./rfid_system.db

# เป็น
DATABASE_URL=mysql+mysqlconnector://root:@localhost:3306/rfid_system
```

2. **สร้างฐานข้อมูล MySQL**
```bash
python manage.py create-mysql-db
python manage.py init-db
```

#### จาก MySQL เป็น PostgreSQL:

1. **แก้ไข .env**
```env
DATABASE_URL=postgresql://user:password@localhost:5432/rfid_system
```

2. **ติดตั้ง driver**
```bash
pip install psycopg2-binary
```

3. **สร้างฐานข้อมูล**
```bash
python manage.py init-db
```

### การรันระบบ

```bash
# Development mode
python main.py

# Production mode
uvicorn main:app --host 0.0.0.0 --port 8000

# With SSL
uvicorn main:app --host 0.0.0.0 --port 8000 --ssl-keyfile key.pem --ssl-certfile cert.pem
```

## 📡 API Documentation

### Health Check
- `GET /health` - ตรวจสอบสถานะระบบ
- `GET /api/test` - ทดสอบ API connection

### Assets Management
- `GET /api/assets` - ดึงรายการสินทรัพย์
- `POST /api/assets` - เพิ่มสินทรัพย์ใหม่
- `PUT /api/assets/{id}` - อัปเดตสินทรัพย์
- `DELETE /api/assets/{id}` - ลบสินทรัพย์

### Tags Management
- `GET /api/tags` - ดึงรายการแท็ก
- `POST /api/tags/bind` - ผูกแท็กกับสินทรัพย์
- `DELETE /api/tags/{tag_id}/unbind` - ยกเลิกการผูกแท็ก

### Locations Management
- `GET /api/locations` - ดึงรายการสถานที่
- `POST /api/locations` - เพิ่มสถานที่ใหม่
- `PUT /api/locations/{id}` - อัปเดตสถานที่

### Scanner Management
- `GET /api/scanner-config` - ดูการตั้งค่า scanner
- `PUT /api/scanner-config` - อัปเดตการตั้งค่า scanner
- `POST /api/scanner-config/refresh` - รีเฟรช scanner

### Real-time WebSocket
- `WS /ws/realtime` - การอัปเดตแบบ real-time

## 🔧 การแก้ไขปัญหา

### ปัญหาการเชื่อมต่อฐานข้อมูล

1. **MySQL Connection Error**
```bash
# ตรวจสอบว่า MySQL service ทำงาน
python manage.py check-db

# ตรวจสอบการตั้งค่า
python manage.py config
```

2. **Import Error**
```bash
# ติดตั้ง dependencies ใหม่
python manage.py install-deps

# หรือ
pip install -r requirements.txt
```

### ปัญหา RFID Scanner

1. **Scanner ไม่ตอบสนอง**
```bash
# ตรวจสอบ scanner
python manage.py check-scanner

# ตรวจสอบ COM port ใน Device Manager (Windows)
```

2. **Permission Error**
- Windows: รัน CMD as Administrator
- Linux: เพิ่ม user ใน dialout group

### การล้างข้อมูล

```bash
# รีเซ็ตฐานข้อมูล (development only)
python manage.py reset-db

# สำรองข้อมูลก่อนรีเซ็ต
python manage.py backup-db
```

### การตรวจสอบ Logs

```bash
# ดู logs แบบ real-time
tail -f logs/app.log

# Windows
type logs\app.log
```

## 📁 โครงสร้างโปรเจค

```
RFID-Management-System/
├── backend/
│   ├── config/
│   │   ├── __init__.py
│   │   ├── settings.py
│   │   └── database.py
│   ├── routers/
│   │   ├── assets.py
│   │   ├── tags.py
│   │   ├── locations.py
│   │   ├── movements.py
│   │   ├── notifications.py
│   │   ├── borrowing.py
│   │   └── ...
│   ├── uhf/
│   ├── logs/
│   ├── uploads/
│   ├── models.py
│   ├── main.py
│   ├── manage.py
│   ├── .env
│   ├── .env.template
│   └── requirements.txt
├── frontend/
│   └── src/
│       └── components/
└── README.md
```

## 🔐 การตั้งค่าความปลอดภัย

### Production Deployment

1. **แก้ไข SECRET_KEY**
```env
SECRET_KEY=your-very-strong-secret-key-here
```

2. **ตั้งค่า Environment**
```env
ENVIRONMENT=production
DEBUG=false
```

3. **จำกัด CORS Origins**
```python
# ใน main.py
allow_origins=["https://yourdomain.com"]  # แทน ["*"]
```

4. **ใช้ HTTPS**
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --ssl-keyfile key.pem --ssl-certfile cert.pem
```

## 📞 การสนับสนุน

- **เอกสาร API**: `/docs` (Swagger UI)
- **Health Check**: `/health`
- **Issues**: สร้าง issue ใน repository

---

## 📝 SQL Script สำหรับสร้างฐานข้อมูลเต็มรูปแบบ

```sql
-- สร้างฐานข้อมูล
CREATE DATABASE IF NOT EXISTS rfid_system 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE rfid_system;

-- ตาราง system_config (การตั้งค่าระบบ)
CREATE TABLE system_config (
  `key` VARCHAR(100) PRIMARY KEY,
  `value` VARCHAR(500),
  `description` TEXT
);

-- เพิ่มข้อมูลการตั้งค่าระบบ
INSERT INTO system_config (`key`, `value`, `description`) VALUES
('CONNECTION_TIMEOUT', '5000', 'Timeout สำหรับการเชื่อมต่อ (มิลลิวินาที)'),
('DB_UPDATE_INTERVAL', '1', 'ระยะเวลาระหว่างการอัปเดตฐานข้อมูล (วินาที)'),
('DELAY_SECONDS', '20', 'เวลา delay ก่อนประมวลผล tag ซ้ำ (วินาที)'),
('HEALTH_CHECK_INTERVAL', '30', 'ระยะเวลา health check อุปกรณ์ (วินาที)'),
('MAX_RECONNECT_ATTEMPTS', '5', 'จำนวนครั้งสูงสุดในการลอง reconnect'),
('SCAN_INTERVAL', '0.1', 'ระยะเวลาระหว่างการสแกน (วินาที)');

-- ตาราง locations (สถานที่)
CREATE TABLE locations (
  location_id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  direction ENUM('gate', 'in', 'out','both') DEFAULT 'gate',
  ip_address VARCHAR(50),
  port INT,
  timeout INT DEFAULT 5000,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- เพิ่มข้อมูลสถานที่
INSERT INTO locations (name, description, direction, ip_address, port, timeout) VALUES
('โรงงาน', 'โรงงาน', 'gate', NULL, NULL, 5000),
('ห้องข้าง', 'ห้องข้าง', 'gate', NULL, NULL, 5000),
('นอกพื้นที่', 'นอกพื้นที่', 'out', NULL, NULL, 5000);

-- ตาราง assets (สินทรัพย์)
CREATE TABLE assets (
  asset_id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(100),
  status ENUM('idle', 'in_use', 'maintenance','borrowed', 'retired') DEFAULT 'idle',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- เพิ่มข้อมูลสินทรัพย์
INSERT INTO assets (name, type, status) VALUES
('Pipe', 'PVC', 'idle'),
('PLC', 'Electronics', 'in_use'),
('เครื่องพิมพ์ HP LaserJet', 'Printer', 'idle'),
('จอคอมพิวเตอร์ Samsung 24"', 'Monitor', 'in_use'),
('เมาส์ไร้สาย Logitech', 'Accessory', 'in_use');

-- ตาราง tags (แท็ก RFID)
CREATE TABLE tags (
  tag_id VARCHAR(50) PRIMARY KEY,
  status ENUM('idle', 'in_use', 'maintenance') DEFAULT 'idle',
  authorized BOOLEAN DEFAULT TRUE,
  asset_id INT,
  current_location_id INT,
  device_id INT,
  first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE SET NULL,
  FOREIGN KEY (current_location_id) REFERENCES locations(location_id) ON DELETE SET NULL
);

-- เพิ่มข้อมูล tags ตัวอย่าง
INSERT INTO tags (tag_id, status, authorized, asset_id, current_location_id, device_id, first_seen, last_seen, created_at, updated_at) VALUES
('E2000020880400852770AF2', 'in_use', 1, 1, NULL, 1, '2025-08-29 14:00:09', '2025-08-29 16:23:05', '2025-08-29 14:00:09', '2025-08-30 20:00:02'),
('E20000208804014928007F42', 'in_use', 1, 5, NULL, 1, '2025-08-25 10:14:07', '2025-09-02 13:57:33', '2025-08-25 10:14:07', '2025-09-02 13:58:57'),
('E2004701C406023F5900111', 'in_use', 1, 4, NULL, 1, '2025-08-25 10:11:36', '2025-09-01 15:03:52', '2025-08-25 10:11:36', '2025-09-01 15:03:52'),
('E20470F7250682053EF010F', 'in_use', 0, 2, NULL, 1, '2025-08-29 13:54:13', '2025-09-02 09:06:28', '2025-08-29 13:54:13', '2025-09-02 09:06:28');

-- ตาราง rfid_devices (อุปกรณ์ RFID)
CREATE TABLE rfid_devices (
  device_id INT PRIMARY KEY AUTO_INCREMENT,
  device_sn VARCHAR(100) UNIQUE NOT NULL,
  location_id INT,
  device_name VARCHAR(100),
  connection_type ENUM('com', 'network') NOT NULL,
  connection_info VARCHAR(200),
  status ENUM('online', 'offline', 'error') DEFAULT 'offline',
  last_connected TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_disconnected TIMESTAMP NULL,
  FOREIGN KEY (location_id) REFERENCES locations(location_id) ON DELETE SET NULL
);

-- เพิ่มข้อมูลอุปกรณ์ RFID
INSERT INTO rfid_devices (device_id, device_sn, location_id, connection_type, connection_info, status, last_connected, created_at, updated_at, last_disconnected) VALUES
(1, '861237373632020038393632', 1, 'com', 'COM7@115200', 'offline', '2025-09-02 13:32:32', '2025-08-25 14:08:04', '2025-09-02 14:43:00', NULL),
(3, '4A1337373632020038393632', 2, 'network', '10.10.100.254:8899', 'offline', '2025-09-02 11:44:17', '2025-08-25 14:33:21', '2025-09-02 11:44:17', NULL);

-- ตาราง movements (การเคลื่อนไหว)
CREATE TABLE movements (
  movement_id INT PRIMARY KEY AUTO_INCREMENT,
  asset_id INT,
  tag_id VARCHAR(50),
  device_id VARCHAR(50),
  from_location_id INT,
  to_location_id INT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  operator VARCHAR(100) DEFAULT 'system',
  event_type ENUM('enter', 'exit') NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE SET NULL,
  FOREIGN KEY (from_location_id) REFERENCES locations(location_id) ON DELETE SET NULL,
  FOREIGN KEY (to_location_id) REFERENCES locations(location_id) ON DELETE SET NULL
);

-- ตาราง notifications (การแจ้งเตือน)
CREATE TABLE notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT,
  asset_id INT,
  user_id INT,
  location_id INT,
  related_id INT,
  is_read BOOLEAN DEFAULT FALSE,
  is_acknowledged BOOLEAN DEFAULT FALSE,
  priority ENUM('low', 'normal', 'high','critical') DEFAULT 'normal',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  acknowledged_at TIMESTAMP NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE SET NULL,
  FOREIGN KEY (location_id) REFERENCES locations(location_id) ON DELETE SET NULL
);

-- ตาราง borrowing_records (บันทึกการยืม)
CREATE TABLE borrowing_records (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tag_id VARCHAR(50),
  asset_id INT,
  borrower_name VARCHAR(200),
  borrower_contact VARCHAR(200),
  borrow_date DATE,
  expected_return_date DATE,
  return_date DATE,
  expected_return_days INT,
  actual_days INT,
  is_overdue BOOLEAN DEFAULT FALSE,
  overdue_days INT DEFAULT 0,
  notes TEXT,
  return_notes TEXT,
  status ENUM('borrowed', 'returned', 'overdue') DEFAULT 'borrowed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE SET NULL
);

-- ตาราง device_configs (การตั้งค่าอุปกรณ์)
CREATE TABLE device_configs (
  config_id INT PRIMARY KEY AUTO_INCREMENT,
  device_id INT NOT NULL,
  config_key VARCHAR(100) NOT NULL,
  config_value VARCHAR(500),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES rfid_devices(device_id) ON DELETE CASCADE,
  UNIQUE KEY unique_device_config (device_id, config_key)
);

-- สร้าง indexes สำหรับการค้นหาที่เร็วขึ้น
CREATE INDEX idx_tags_asset_id ON tags(asset_id);
CREATE INDEX idx_tags_location_id ON tags(current_location_id);
CREATE INDEX idx_movements_tag_id ON movements(tag_id);
CREATE INDEX idx_movements_timestamp ON movements(timestamp);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
CREATE INDEX idx_borrowing_records_status ON borrowing_records(status);
CREATE INDEX idx_borrowing_records_tag_id ON borrowing_records(tag_id);

-- สร้าง views สำหรับการดึงข้อมูลที่ซับซ้อน
CREATE VIEW view_asset_with_tags AS
SELECT 
  a.asset_id,
  a.name as asset_name,
  a.type,
  a.status,
  t.tag_id,
  t.current_location_id,
  l.name as location_name,
  t.last_seen,
  t.authorized
FROM assets a
LEFT JOIN tags t ON a.asset_id = t.asset_id
LEFT JOIN locations l ON t.current_location_id = l.location_id;

CREATE VIEW view_device_status AS
SELECT 
  d.device_id,
  d.device_sn,
  d.device_name,
  d.connection_type,
  d.connection_info,
  d.status,
  d.last_connected,
  l.name as location_name,
  l.location_id
FROM rfid_devices d
LEFT JOIN locations l ON d.location_id = l.location_id;

-- สร้าง stored procedures สำหรับการทำงานที่ซับซ้อน
DELIMITER $$

CREATE PROCEDURE GetAssetMovements(IN asset_id_param INT, IN days_back INT)
BEGIN
  SELECT 
    m.*,
    a.name as asset_name,
    l1.name as from_location_name,
    l2.name as to_location_name
  FROM movements m
  LEFT JOIN assets a ON m.asset_id = a.asset_id
  LEFT JOIN locations l1 ON m.from_location_id = l1.location_id
  LEFT JOIN locations l2 ON m.to_location_id = l2.location_id
  WHERE m.asset_id = asset_id_param
    AND m.timestamp >= DATE_SUB(NOW(), INTERVAL days_back DAY)
  ORDER BY m.timestamp DESC;
END$$

CREATE PROCEDURE GetOverdueItems()
BEGIN
  SELECT 
    br.*,
    a.name as asset_name,
    t.tag_id
  FROM borrowing_records br
  LEFT JOIN assets a ON br.asset_id = a.asset_id
  LEFT JOIN tags t ON a.asset_id = t.asset_id
  WHERE br.status = 'borrowed'
    AND br.expected_return_date < CURDATE()
  ORDER BY br.expected_return_date ASC;
END$$

DELIMITER ;

-- แสดงสถานะการสร้างฐานข้อมูล
SELECT 'RFID Management System database created successfully!' as status;
SELECT COUNT(*) as total_tables FROM information_schema.tables WHERE table_schema = 'rfid_system';
```

บันทึกเป็นไฟล์ `create_full_database.sql` และใช้คำสั่ง:

```bash
# Import ผ่าน MySQL command line
mysql -u root -p < create_full_database.sql