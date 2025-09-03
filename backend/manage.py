#!/usr/bin/env python3
"""
RFID System Management CLI
=========================

Command Line Interface สำหรับจัดการระบบ RFID Management System
ใช้สำหรับการดูแลระบบ, การตั้งค่า, และการแก้ไขปัญหา

Available Commands:
- create-mysql-db: สร้างฐานข้อมูล MySQL
- init-db: สร้างตารางฐานข้อมูล
- check-db: ตรวจสอบการเชื่อมต่อฐานข้อมูล
- backup-db: สำรองฐานข้อมูล (SQLite only)
- reset-db: รีเซ็ตฐานข้อมูล (development only)
- config: แสดงการตั้งค่าปัจจุบัน
- create-env: สร้างไฟล์ .env จาก template
- check-scanner: ตรวจสอบการเชื่อมต่อ RFID scanner
- install-deps: ติดตั้ง Python dependencies
- structure: แสดงโครงสร้างโปรเจค

การใช้งาน:
    python manage.py [command]

ตัวอย่าง:
    python manage.py config
    python manage.py init-db
    python manage.py check-db
"""

import argparse
import sys
import os
import shutil
from datetime import datetime
from pathlib import Path

# นำเข้า configuration และ database functions
try:
    from config import settings
    from config.settings import ensure_directories
    from config.database import init_database, check_db_connection, engine
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("Please make sure all required files exist and dependencies are installed")
    print("Try running: pip install -r requirements.txt")
    sys.exit(1)

import logging

# ตั้งค่า logging
try:
    logging.basicConfig(level=getattr(logging, settings.log_level))
except:
    logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =====================
# Database Management Functions
# =====================

def create_mysql_database():
    """
    สร้างฐานข้อมูล MySQL ใหม่
    ใช้เมื่อต้องการสร้างฐานข้อมูลใน MySQL server
    
    Requirements:
    - MySQL server ต้องทำงานอยู่ (เช่น ผ่าน XAMPP)
    - ต้องมีสิทธิ์ในการสร้างฐานข้อมูล
    - การตั้งค่า MySQL ในไฟล์ .env ต้องถูกต้อง
    """
    # ตรวจสอบว่าใช้ MySQL หรือไม่
    if not settings.database_url.startswith("mysql"):
        print("❌ This command is only for MySQL databases")
        print(f"   Current database: {settings.database_url}")
        return
    
    print("🔧 Creating MySQL database...")
    try:
        import mysql.connector
        
        # เชื่อมต่อ MySQL server โดยไม่ระบุฐานข้อมูล
        print(f"   Connecting to MySQL server at {settings.mysql_host}:{settings.mysql_port}")
        conn = mysql.connector.connect(
            host=settings.mysql_host,
            port=settings.mysql_port,
            user=settings.mysql_user,
            password=settings.mysql_password,
            charset=settings.mysql_charset
        )
        
        cursor = conn.cursor()
        
        # สร้างฐานข้อมูลด้วย UTF-8 support
        create_db_sql = f"CREATE DATABASE IF NOT EXISTS {settings.mysql_database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        cursor.execute(create_db_sql)
        print(f"✅ Database '{settings.mysql_database}' created successfully")
        
        # ตรวจสอบว่าฐานข้อมูลถูกสร้างแล้ว
        cursor.execute("SHOW DATABASES")
        databases = [db[0] for db in cursor.fetchall()]
        
        if settings.mysql_database in databases:
            print(f"✅ Database '{settings.mysql_database}' exists and ready to use")
        
        cursor.close()
        conn.close()
        
    except mysql.connector.Error as e:
        print(f"❌ MySQL error: {e}")
        print("   Make sure MySQL server is running and credentials are correct")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Failed to create database: {e}")
        sys.exit(1)

def init_db():
    """
    สร้างตารางฐานข้อมูลทั้งหมด
    ใช้ SQLAlchemy models เพื่อสร้างโครงสร้างฐานข้อมูล
    
    Process:
    1. ตรวจสอบว่าฐานข้อมูลเชื่อมต่อได้
    2. สร้าง directories ที่จำเป็น
    3. สร้างตารางจาก models.py
    4. เพิ่มข้อมูลเริ่มต้น (ถ้ามี)
    """
    print("🔧 Initializing database...")
    try:
        # สร้าง directories ที่จำเป็น (logs, uploads, etc.)
        ensure_directories()
        
        # สร้างตารางฐานข้อมูล
        success = init_database()
        if success:
            print("✅ Database initialized successfully")
            print(f"   Database: {settings.database_url}")
            print("   All tables created successfully")
        else:
            print("❌ Database initialization failed")
            sys.exit(1)
            
    except Exception as e:
        print(f"❌ Database initialization failed: {e}")
        import traceback
        traceback.print_exc()
        print("\nTroubleshooting:")
        print("1. Check if database server is running")
        print("2. Verify database credentials in .env file")
        print("3. Make sure database exists (use create-mysql-db command)")
        sys.exit(1)

def check_db():
    """
    ตรวจสอบการเชื่อมต่อฐานข้อมูล
    ใช้เพื่อทดสอบว่าการตั้งค่าฐานข้อมูลถูกต้องหรือไม่
    """
    print("🔍 Checking database connection...")
    if check_db_connection():
        print("✅ Database connection successful")
        print(f"   Database: {settings.database_url}")
        print(f"   Environment: {settings.environment}")
    else:
        print("❌ Database connection failed")
        print("\nTroubleshooting:")
        print("1. Check if database server is running")
        print("2. Verify credentials in .env file")
        print("3. Test network connectivity")
        sys.exit(1)

def backup_db():
    """
    สำรองฐานข้อมูล
    ปัจจุบันรองรับเฉพาะ SQLite database
    
    สำหรับ MySQL ควรใช้ mysqldump:
    mysqldump -u root -p rfid_system > backup.sql
    """
    print("💾 Creating database backup...")
    try:
        if not settings.database_url.startswith("sqlite"):
            print("⚠️  Backup only supported for SQLite databases")
            print("   For MySQL, use: mysqldump -u root -p rfid_system > backup.sql")
            return
        
        # หา path ของ SQLite database
        db_path = settings.database_url.replace("sqlite:///", "")
        if not os.path.exists(db_path):
            print("❌ Database file not found")
            print(f"   Looking for: {db_path}")
            return
        
        # สร้างชื่อไฟล์ backup ด้วยวันที่และเวลา
        backup_name = f"{db_path}.backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        shutil.copy2(db_path, backup_name)
        print(f"✅ Database backed up to: {backup_name}")
        
    except Exception as e:
        print(f"❌ Backup failed: {e}")

def reset_db():
    """
    รีเซ็ตฐานข้อมูล - ลบข้อมูลทั้งหมดและสร้างใหม่
    ใช้ได้เฉพาะใน development environment เพื่อความปลอดภัย
    
    Warning: คำสั่งนี้จะลบข้อมูลทั้งหมด!
    """
    # ตรวจสอบ environment
    if settings.environment != "development":
        print("❌ Database reset only allowed in development environment")
        print(f"   Current environment: {settings.environment}")
        print("   Change ENVIRONMENT=development in .env to use this command")
        sys.exit(1)
    
    # ขอยืนยันจากผู้ใช้
    print("⚠️  WARNING: This will delete all data!")
    print("   This action cannot be undone.")
    confirm = input("Are you sure you want to reset the database? (type 'yes' to confirm): ")
    if confirm.lower() != 'yes':
        print("Reset cancelled")
        return
    
    print("🔄 Resetting database...")
    try:
        # สำรองข้อมูลก่อน (ถ้าเป็น SQLite)
        if settings.database_url.startswith("sqlite"):
            backup_db()
        
        # รีเซ็ตฐานข้อมูล
        try:
            from models import Base
        except ImportError:
            print("❌ Cannot import models. Make sure models.py exists.")
            sys.exit(1)
            
        # ลบตารางทั้งหมด
        print("   Dropping all tables...")
        Base.metadata.drop_all(bind=engine)
        
        # สร้างตารางใหม่
        print("   Creating tables...")
        Base.metadata.create_all(bind=engine)
        
        print("✅ Database reset completed")
        print("   All tables recreated successfully")
        
    except Exception as e:
        print(f"❌ Database reset failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

# =====================
# Configuration Functions
# =====================

def show_config():
    """
    แสดงการตั้งค่าปัจจุบันของระบบ
    ใช้เพื่อตรวจสอบการตั้งค่าต่างๆ
    """
    print("⚙️  Current Configuration:")
    print("=" * 50)
    print(f"   Environment: {settings.environment}")
    print(f"   Debug Mode: {settings.debug}")
    print(f"   Database: {settings.database_url}")
    print(f"   WebSocket: {settings.ws_host}:{settings.ws_port}")
    print(f"   Redis: {settings.redis_url}")
    print(f"   Scanner Port: {settings.scanner_port}")
    print(f"   Log Level: {settings.log_level}")
    print(f"   Log File: {settings.log_file}")
    print(f"   Upload Dir: {settings.upload_dir}")
    print("=" * 50)

def create_env():
    """
    สร้างไฟล์ .env จาก template
    ใช้เมื่อติดตั้งระบบครั้งแรก
    """
    template_file = Path(".env.template")
    env_file = Path(".env")
    
    if not template_file.exists():
        print("❌ .env.template file not found")
        print("   Make sure .env.template exists in the project root")
        sys.exit(1)
    
    if env_file.exists():
        print("⚠️  .env file already exists")
        confirm = input("Overwrite existing .env file? (yes/no): ")
        if confirm.lower() != 'yes':
            print("Operation cancelled")
            return
    
    try:
        shutil.copy2(template_file, env_file)
        print("✅ .env file created from template")
        print("   Please edit .env file with your specific configuration:")
        print("   - Database credentials")
        print("   - Scanner settings")
        print("   - Security keys")
    except Exception as e:
        print(f"❌ Failed to create .env file: {e}")

# =====================
# Hardware Functions
# =====================

def check_scanner():
    """
    ตรวจสอบการเชื่อมต่อ RFID scanner
    ใช้เพื่อทดสอบว่าเครื่องสแกนทำงานได้หรือไม่
    """
    print("📡 Checking RFID scanner connection...")
    try:
        from device_scanner_service import DeviceScannerService
        
        # สร้าง scanner service ด้วยการตั้งค่าเริ่มต้น
        scanner_config = {
            'device_id': 1,
            'location_id': 1,
            'connection_type': 'com',
            'connection_info': f'{settings.scanner_port}@{settings.scanner_baudrate}'
        }
        
        scanner = DeviceScannerService(scanner_config)
        if scanner.connect():
            print("✅ RFID scanner connected successfully")
            print(f"   Port: {settings.scanner_port}")
            print(f"   Baud Rate: {settings.scanner_baudrate}")
            scanner.disconnect()
        else:
            print("❌ RFID scanner connection failed")
            print(f"   Port: {settings.scanner_port}")
            print("   Troubleshooting:")
            print("   1. Check if scanner is powered on")
            print("   2. Verify COM port in Device Manager")
            print("   3. Check cable connections")
            
    except ImportError:
        print("❌ DeviceScannerService not found")
        print("   Check if device_scanner_service.py exists")
    except Exception as e:
        print(f"❌ Scanner check failed: {e}")

# =====================
# System Functions
# =====================

def install_deps():
    """
    ติดตั้ง Python dependencies จาก requirements.txt
    ใช้เมื่อตั้งค่าระบบครั้งแรกหรือมีการอัพเดต dependencies
    """
    print("📦 Installing dependencies...")
    try:
        import subprocess
        
        # รัน pip install
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", "requirements.txt"], 
            check=True, 
            capture_output=True, 
            text=True
        )
        
        print("✅ Dependencies installed successfully")
        if result.stdout:
            print("Installation output:")
            print(result.stdout)
            
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install dependencies: {e}")
        if e.stdout:
            print("STDOUT:", e.stdout)
        if e.stderr:
            print("STDERR:", e.stderr)
        print("\nTry running manually: pip install -r requirements.txt")
    except FileNotFoundError:
        print("❌ requirements.txt not found")
        print("   Make sure requirements.txt exists in the project root")

def show_structure():
    """
    แสดงโครงสร้างโปรเจค
    ใช้เพื่อตรวจสอบว่าไฟล์ต่างๆ อยู่ในตำแหน่งที่ถูกต้อง
    """
    print("📁 Current Project Structure:")
    print("=" * 50)
    
    def print_tree(directory, prefix="", max_depth=3, current_depth=0):
        """
        แสดงโครงสร้างแบบ tree
        
        Args:
            directory: โฟลเดอร์ที่จะแสดง
            prefix: prefix สำหรับการจัดรูปแบบ
            max_depth: ความลึกสูงสุด
            current_depth: ความลึกปัจจุบัน
        """
        if current_depth >= max_depth:
            return
            
        try:
            items = sorted(Path(directory).iterdir())
            for i, item in enumerate(items):
                # ข้าม hidden files และ cache
                if item.name.startswith('.') or item.name == '__pycache__':
                    continue
                    
                is_last = i == len(items) - 1
                current_prefix = "└── " if is_last else "├── "
                print(f"{prefix}{current_prefix}{item.name}")
                
                # แสดง subdirectories
                if item.is_dir() and current_depth < max_depth - 1:
                    extension = "    " if is_last else "│   "
                    print_tree(item, prefix + extension, max_depth, current_depth + 1)
                    
        except PermissionError:
            print(f"{prefix}    [Permission Denied]")
    
    print_tree(".", max_depth=3)
    print("=" * 50)

# =====================
# Main Function
# =====================

def main():
    """
    Main function สำหรับ CLI
    จัดการ command line arguments และเรียกใช้ฟังก์ชันที่เหมาะสม
    """
    parser = argparse.ArgumentParser(
        description='RFID System Management CLI',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python manage.py config           # Show current configuration
  python manage.py init-db          # Initialize database
  python manage.py check-db         # Check database connection
  python manage.py create-mysql-db  # Create MySQL database
        """
    )
    
    # เพิ่ม command choices
    parser.add_argument('command', choices=[
        'init-db', 'check-db', 'backup-db', 'reset-db', 'create-mysql-db',
        'config', 'create-env', 'check-scanner', 'install-deps', 'structure'
    ], help='Command to run')
    
    # ถ้าไม่มี arguments แสดง help
    if len(sys.argv) == 1:
        parser.print_help()
        sys.exit(1)
    
    args = parser.parse_args()
    
    # แสดง header
    print(f"🚀 RFID System Manager - {args.command}")
    print("=" * 50)
    
    try:
        # เรียกใช้ฟังก์ชันตาม command
        if args.command == 'create-mysql-db':
            create_mysql_database()
        elif args.command == 'init-db':
            init_db()
        elif args.command == 'check-db':
            check_db()
        elif args.command == 'backup-db':
            backup_db()
        elif args.command == 'reset-db':
            reset_db()
        elif args.command == 'config':
            show_config()
        elif args.command == 'create-env':
            create_env()
        elif args.command == 'check-scanner':
            check_scanner()
        elif args.command == 'install-deps':
            install_deps()
        elif args.command == 'structure':
            show_structure()
            
    except KeyboardInterrupt:
        print("\n⚠️  Operation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()