-- สร้างฐานข้อมูล RFID System

CREATE DATABASE IF NOT EXISTS rfid_system 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

-- สร้าง user (ถ้าต้องการ)
-- CREATE USER 'rfid_user'@'localhost' IDENTIFIED BY 'rfid_password';
-- GRANT ALL PRIVILEGES ON rfid_system.* TO 'rfid_user'@'localhost';
-- FLUSH PRIVILEGES;

USE rfid_system;

-- แสดงว่าฐานข้อมูลถูกสร้างแล้ว
SELECT 'Database rfid_system created successfully!' as message;