# ⚙️ RFID Management System - Config Directory Documentation

> เอกสารอธิบายโครงสร้างและหน้าที่ของไฟล์ในโฟลเดอร์ config/
> สำหรับการจัดการการตั้งค่าและการเชื่อมต่อของระบบ

## 🎯 ภาพรวม Config Directory

โฟลเดอร์ `config/` เป็นหัวใจสำคัญของระบบที่จัดการการตั้งค่าทั้งหมด
รวมถึงการเชื่อมต่อฐานข้อมูล, environment variables, และการกำหนดค่าต่างๆ

---

## 📂 โครงสร้างไฟล์ในโฟลเดอร์ config/

### 🔧 **Package Initialization**

#### 📄 `__init__.py`
```python
"""
Config Package Initialization
=============================

ไฟล์นี้ทำให้โฟลเดอร์ config เป็น Python package
และ export ฟังก์ชันสำคัญให้ส่วนอื่นของระบบใช้งาน

Exports:
- settings: Global settings instance
- Settings: Settings class
- engine: Database engine
- SessionLocal: Database session factory
- Base: SQLAlchemy declarative base
- get_db: Database dependency for FastAPI
- get_db_connection: Direct database connection
- init_database: Database initialization function
- check_db_connection: Database health check

การใช้งาน:
from config import settings, get_db, engine
from config.database import init_database
from config.settings import Settings

Architecture Benefits:
- Centralized configuration management
- Clean import statements
- Dependency injection support
- Type safety with Pydantic
"""

# Import example:
from .settings import settings, Settings
from .database import (
    engine, SessionLocal, Base, get_db, get_db_connection,
    init_database, check_db_connection
)

__all__ = [
    'settings', 'Settings',
    'engine', 'SessionLocal', 'Base', 'get_db', 'get_db_connection',
    'init_database', 'check_db_connection'
]
```

---

### ⚙️ **Settings Management**

#### 📄 `settings.py`
```python
"""
Application Settings Management
===============================

ไฟล์นี้จัดการการตั้งค่าทั้งหมดของระบบ
ใช้ Pydantic BaseSettings เพื่อการจัดการ environment variables

Core Features:
- Environment variable validation
- Type conversion และ validation
- Default values management
- Configuration hierarchy
- Settings categorization
- Helper functions

Settings Categories:
==================

1. DATABASE SETTINGS:
   - database_url: Connection string หลัก
   - db_echo: SQLAlchemy query logging
   - db_pool_size: Connection pool size
   - db_max_overflow: Maximum overflow connections
   
2. MYSQL SPECIFIC SETTINGS:
   - mysql_host: MySQL server host
   - mysql_port: MySQL server port
   - mysql_user: MySQL username
   - mysql_password: MySQL password
   - mysql_database: Database name
   - mysql_charset: Character set (utf8mb4)

3. REDIS SETTINGS:
   - redis_url: Redis connection string
   - redis_timeout: Connection timeout
   - redis_max_connections: Maximum connections

4. WEBSOCKET SETTINGS:
   - ws_port: WebSocket server port
   - ws_host: WebSocket server host
   - ws_max_connections: Maximum concurrent connections

5. SECURITY SETTINGS:
   - secret_key: JWT token signing key
   - algorithm: JWT algorithm (HS256)
   - access_token_expire_minutes: Token expiration time

6. ENVIRONMENT SETTINGS:
   - environment: Current environment (development/production)
   - debug: Debug mode toggle
   - log_level: Logging verbosity
   - log_file: Log file path

7. RFID SCANNER SETTINGS:
   - scanner_port: COM port for RFID scanner
   - scanner_baudrate: Baud rate (115200)
   - scanner_timeout: Connection timeout
   - scanner_auto_reconnect: Auto reconnection

8. FILE STORAGE SETTINGS:
   - upload_dir: File upload directory
   - max_file_size: Maximum file size (10MB)
   - data_dir: Data storage directory
   - logs_dir: Logs directory

Helper Functions:
================

get_database_url():
   - Returns appropriate database URL based on environment
   - Handles testing environment with separate database

get_mysql_url():
   - Builds MySQL URL from individual components
   - Useful for dynamic connection string building

is_sqlite(), is_postgresql(), is_mysql():
   - Database type detection functions
   - Used for database-specific operations

ensure_directories():
   - Creates necessary directories if they don't exist
   - Called automatically on import

Configuration Validation:
========================
- Email format validation
- URL format validation
- Path existence validation
- Port range validation
- Required field validation

Environment File Support:
========================
- Reads from .env file automatically
- Supports different .env files per environment
- Case-insensitive environment variables
- UTF-8 encoding support

Security Best Practices:
=======================
- Sensitive data from environment variables
- Default values for non-sensitive settings
- Type validation for all inputs
- No hardcoded secrets in code
"""

class Settings(BaseSettings):
    # Database configuration
    database_url: str = "sqlite:///./rfid_system.db"
    db_echo: bool = False
    db_pool_size: int = 10
    db_max_overflow: int = 20
    
    # MySQL specific (สำหรับกรณีที่ไม่ใช้ DATABASE_URL)
    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3306
    mysql_user: str = "root"
    mysql_password: str = ""
    mysql_database: str = "rfid_system"
    mysql_charset: str = "utf8mb4"
    
    # Redis configuration
    redis_url: str = "redis://localhost:6379/0"
    redis_timeout: int = 5
    redis_max_connections: int = 10
    
    # WebSocket configuration
    ws_port: int = 8000
    ws_host: str = "0.0.0.0"
    ws_max_connections: int = 100
    
    # Security settings
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # Environment settings
    environment: str = "development"
    debug: bool = True
    log_level: str = "INFO"
    log_file: str = "logs/app.log"
    
    # RFID Scanner settings
    scanner_port: Optional[str] = "COM3"
    scanner_baudrate: int = 115200
    scanner_timeout: int = 5
    scanner_auto_reconnect: bool = True
    
    # File storage settings
    upload_dir: str = "uploads"
    max_file_size: int = 10485760  # 10MB
    data_dir: Path = Path("data")
    logs_dir: Path = Path("logs")
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
```

---

### 🗄️ **Database Management**

#### 📄 `database.py`
```python
"""
Database Connection Management
==============================

ไฟล์นี้จัดการการเชื่อมต่อฐานข้อมูลและ SQLAlchemy configuration
รองรับหลายประเภทฐานข้อมูลและการจัดการ connection pool

Core Components:
===============

1. ENGINE CREATION:
   - Database engine with optimized settings
   - Connection pooling configuration
   - Database-specific optimizations
   - SSL และ security settings

2. SESSION MANAGEMENT:
   - SQLAlchemy session factory
   - Session lifecycle management
   - Transaction handling
   - Connection cleanup

3. BASE MODEL:
   - SQLAlchemy declarative base
   - Model inheritance foundation
   - Metadata management

Database Support:
================

SQLite Configuration:
- Single file database
- Check same thread disabled
- Timeout settings
- Static pool for development

MySQL Configuration:
- Connection pooling
- Pool size และ overflow settings
- Pre-ping for connection validation
- Connection recycling
- Character set handling

PostgreSQL Configuration:
- Advanced connection pooling
- Connection optimization
- Async support preparation
- Performance tuning

Oracle Configuration:
- Enterprise features
- Connection management
- Transaction isolation
- Performance optimization

Connection Functions:
====================

create_db_engine():
   - Creates appropriate engine based on DATABASE_URL
   - Applies database-specific configurations
   - Handles connection parameters

get_db():
   - FastAPI dependency for database sessions
   - Automatic session management
   - Proper cleanup in finally block
   - Exception handling

get_db_connection():
   - Direct database connection for legacy code
   - Support for different database types
   - Raw connection management
   - Manual transaction control

Database Operations:
===================

init_database():
   - Creates all tables from models
   - Handles schema migrations
   - Error handling และ rollback
   - Initial data seeding

check_db_connection():
   - Health check for database connectivity
   - Simple query execution test
   - Connection validation
   - Error reporting

Performance Features:
====================

Connection Pooling:
- Optimized pool sizes per database type
- Connection reuse
- Overflow management
- Pool monitoring

Query Optimization:
- Echo mode for development
- Query logging
- Performance monitoring
- Slow query detection

Error Handling:
- Connection retry logic
- Graceful degradation
- Error logging
- Recovery strategies

Security Features:
=================
- SQL injection prevention through ORM
- Connection encryption
- Authentication handling
- Privilege management

Migration Support:
=================
- Schema evolution
- Version tracking
- Rollback capabilities
- Data migration tools

Monitoring และ Debugging:
========================
- Connection pool monitoring
- Query performance tracking
- Error logging
- Health check endpoints
"""

def create_db_engine():
    """
    Creates database engine with appropriate configuration
    
    Returns:
        Engine: SQLAlchemy engine instance
        
    Features:
        - Database type detection
        - Optimized settings per database
        - Connection pooling
        - Error handling
    """

def get_db():
    """
    FastAPI dependency for database sessions
    
    Yields:
        Session: Database session
        
    Features:
        - Automatic session management
        - Proper cleanup
        - Exception handling
        - Transaction support
    """

def get_db_connection():
    """
    Direct database connection for legacy compatibility
    
    Returns:
        Connection: Raw database connection
        
    Support:
        - SQLite connections
        - MySQL connections
        - PostgreSQL connections
        - Connection parameter handling
    """

def init_database():
    """
    Initialize database schema
    
    Returns:
        bool: Success status
        
    Process:
        - Import all models
        - Create tables
        - Setup indexes
        - Handle errors
    """

def check_db_connection():
    """
    Check database connectivity
    
    Returns:
        bool: Connection status
        
    Test:
        - Basic query execution
        - Connection validation
        - Error detection
        - Health reporting
    """
```

---

### 🔧 **Legacy Configuration**

#### 📄 `config.py`
```python
"""
Legacy Configuration Module
===========================

ไฟล์นี้เป็น legacy configuration module ที่อาจจะมีการตั้งค่าเพิ่มเติม
หรือ backward compatibility สำหรับโค้ดเก่า

Note: ในปัจจุบันการตั้งค่าหลักอยู่ใน settings.py
ไฟล์นี้อาจจะใช้สำหรับ:

1. LEGACY SUPPORT:
   - รองรับโค้ดเก่าที่อ้างอิงไฟล์นี้
   - Backward compatibility
   - Migration period support

2. ADDITIONAL CONFIGURATIONS:
   - การตั้งค่าเฉพาะที่ไม่อยู่ใน settings.py
   - Constants และ enums
   - Feature flags

3. DERIVED CONFIGURATIONS:
   - การตั้งค่าที่คำนวณจาก settings หลัก
   - Complex configuration logic
   - Environment-specific overrides

Deprecation Notice:
==================
ไฟล์นี้อาจจะถูก deprecated ในอนาคต
แนะนำให้ใช้ settings.py สำหรับการตั้งค่าใหม่

Migration Path:
==============
1. ตรวจสอบการใช้งานของไฟล์นี้
2. ย้ายการตั้งค่าไปยัง settings.py
3. อัปเดต import statements
4. ทดสอบการทำงาน
5. ลบไฟล์เมื่อไม่ใช้แล้ว

Usage Guidelines:
================
- หลีกเลี่ยงการเพิ่มการตั้งค่าใหม่ในไฟล์นี้
- ใช้ settings.py สำหรับการตั้งค่าใหม่
- Document การใช้งานที่ยังเหลืออยู่
- วางแผน migration timeline
"""

# Legacy imports และ configurations
# TODO: Migrate to settings.py
```

---

## 🔄 **Configuration Flow Architecture**

### การทำงานของ Config System:

```
1. Environment Loading:
   .env file → settings.py → Settings class validation

2. Database Connection:
   settings.py → database.py → Engine creation

3. Application Usage:
   main.py → import config → Use settings และ database

4. Runtime Configuration:
   API calls → system_config router → Update settings
```

### Dependency Chain:
```python
# Core dependencies
.env → settings.py → database.py → __init__.py → main.py

# Router dependencies  
config → routers/*.py → API endpoints

# Service dependencies
config → services → background tasks
```

---

## 🛠️ **Development Guidelines**

### การเพิ่มการตั้งค่าใหม่:

```python
# 1. เพิ่มใน settings.py
class Settings(BaseSettings):
    new_setting: str = "default_value"
    new_number: int = 42
    new_flag: bool = False

# 2. เพิ่มใน .env.template
NEW_SETTING=your_value
NEW_NUMBER=42
NEW_FLAG=true

# 3. อัปเดต __init__.py ถ้าจำเป็น
# 4. ใช้ในโค้ดอื่น
from config import settings
print(settings.new_setting)
```

### การเปลี่ยนฐานข้อมูล:

```python
# 1. แก้ไข .env
DATABASE_URL=postgresql://user:pass@localhost/dbname

# 2. ติดตั้ง driver
pip install psycopg2-binary

# 3. อัปเดต database.py ถ้าจำเป็น
# 4. รัน migration
python manage.py init-db
```

---

## 🔒 **Security Best Practices**

### Environment Variables:
```bash
# ✅ ดี - ใช้ environment variables
SECRET_KEY=your-secret-key
DATABASE_PASSWORD=your-password

# ❌ ไม่ดี - hardcode ในโค้ด
SECRET_KEY="hardcoded-key"  # อันตราย!
```

### Sensitive Data Handling:
```python
# ✅ ดี - ไม่ log sensitive data
logger.info(f"Connecting to database at {settings.mysql_host}")

# ❌ ไม่ดี - log password
logger.info(f"Password: {settings.mysql_password}")  # อันตราย!
```

### Production Settings:
```env
# Production .env
ENVIRONMENT=production
DEBUG=false
SECRET_KEY=very-strong-secret-key-here
DATABASE_URL=postgresql://secure_user:strong_password@localhost/prod_db
```

---

## 📈 **Performance Considerations**

### Database Connection Pooling:
```python
# การตั้งค่า connection pool
DB_POOL_SIZE=20          # จำนวน connection พื้นฐาน
DB_MAX_OVERFLOW=30       # การเพิ่ม connection สูงสุด
DB_POOL_TIMEOUT=30       # Timeout การรอ connection
DB_POOL_RECYCLE=3600     # การสร้าง connection ใหม่ (วินาที)
```

### Environment-specific Optimization:
```python
# Development settings
DEBUG=true
DB_ECHO=true             # แสดง SQL queries
LOG_LEVEL=DEBUG

# Production settings  
DEBUG=false
DB_ECHO=false            # ซ่อน SQL queries
LOG_LEVEL=WARNING
```

---

## 🧪 **Testing Configuration**

### Test Environment Setup:
```python
# pytest fixtures
@pytest.fixture
def test_settings():
    return Settings(
        database_url="sqlite:///./test.db",
        environment="testing",
        debug=True
    )

# การใช้งาน
def test_database_connection(test_settings):
    engine = create_db_engine(test_settings)
    assert engine is not None
```

### Configuration Validation:
```python
def test_settings_validation():
    # Test required fields
    with pytest.raises(ValidationError):
        Settings(database_url="")
    
    # Test type conversion
    settings = Settings(db_pool_size="10")
    assert settings.db_pool_size == 10
    assert isinstance(settings.db_pool_size, int)
```

---

## 🔧 **Troubleshooting Common Issues**

### Configuration Loading Problems:
```python
# Problem: .env file not found
# Solution: Check file path และ working directory

# Problem: Environment variables not loaded
# Solution: Check case sensitivity และ encoding

# Problem: Type conversion errors
# Solution: Validate data types ใน .env
```

### Database Connection Issues:
```python
# Problem: Connection refused
# Solution: Check database server status

# Problem: Authentication failed  
# Solution: Verify credentials ใน .env

# Problem: Pool exhaustion
# Solution: Increase pool size หรือ fix connection leaks
```

---

## 📋 **Configuration Checklist**

### Development Setup:
- [ ] `.env` file created from template
- [ ] Database credentials configured
- [ ] Scanner port settings verified
- [ ] Log directories created
- [ ] Upload directories created

### Production Deployment:
- [ ] Strong secret key generated
- [ ] Production database configured
- [ ] SSL/TLS settings enabled
- [ ] Log rotation configured
- [ ] Backup strategies implemented
- [ ] Monitoring endpoints enabled

### Security Audit:
- [ ] No secrets in code
- [ ] Environment variables encrypted
- [ ] Database permissions restricted
- [ ] CORS settings configured
- [ ] Rate limiting enabled

---

*เอกสารนี้อัปเดตล่าสุด: September 3, 2025*
*สำหรับข้อมูลเพิ่มเติม อ่านที่ PROJECT_STRUCTURE.md และ routers/README.md*
