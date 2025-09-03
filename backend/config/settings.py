from pydantic_settings import BaseSettings
from typing import Optional
import os
from pathlib import Path

class Settings(BaseSettings):
    # Database
    database_url: str = "sqlite:///./rfid_system.db"
    db_echo: bool = False
    db_pool_size: int = 10
    db_max_overflow: int = 20
    
    # MySQL specific settings (ถ้าไม่ใช้ DATABASE_URL)
    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3306
    mysql_user: str = "root"
    mysql_password: str = ""
    mysql_database: str = "rfid_system"
    mysql_charset: str = "utf8mb4"
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    
    # WebSocket
    ws_port: int = 8000
    ws_host: str = "0.0.0.0"
    
    # Security
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # Environment
    environment: str = "development"
    debug: bool = True
    
    # RFID Scanner
    scanner_port: Optional[str] = "COM3"
    scanner_baudrate: int = 115200
    scanner_timeout: int = 5
    scanner_auto_reconnect: bool = True
    
    # Logging
    log_level: str = "INFO"
    log_file: str = "logs/app.log"
    
    # File Storage
    upload_dir: str = "uploads"
    max_file_size: int = 10485760  # 10MB
    
    # Paths
    base_dir: Path = Path(__file__).parent.parent
    data_dir: Path = base_dir / "data"
    logs_dir: Path = base_dir / "logs"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

# Global settings instance
settings = Settings()

# Helper functions
def get_database_url() -> str:
    """Get database URL with environment-specific defaults"""
    if settings.environment == "testing":
        return "sqlite:///./test_rfid.db"
    return settings.database_url

def get_mysql_url() -> str:
    """Build MySQL URL from components"""
    return f"mysql+mysqlconnector://{settings.mysql_user}:{settings.mysql_password}@{settings.mysql_host}:{settings.mysql_port}/{settings.mysql_database}?charset={settings.mysql_charset}"

def is_sqlite() -> bool:
    """Check if using SQLite database"""
    return settings.database_url.startswith("sqlite")

def is_postgresql() -> bool:
    """Check if using PostgreSQL database"""
    return settings.database_url.startswith("postgresql")

def is_mysql() -> bool:
    """Check if using MySQL database"""
    return settings.database_url.startswith("mysql")

def ensure_directories():
    """Create necessary directories"""
    directories = [
        settings.data_dir,
        settings.logs_dir,
        Path(settings.upload_dir)
    ]
    
    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)

# Initialize directories on import
ensure_directories()