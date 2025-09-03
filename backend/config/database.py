from sqlalchemy import create_engine, MetaData, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from .settings import settings, get_database_url, is_sqlite
import sqlite3
import mysql.connector
import logging

logger = logging.getLogger(__name__)

# Database URL
DATABASE_URL = get_database_url()

def create_db_engine():
    """Create database engine with appropriate configuration"""
    
    if is_sqlite():
        # SQLite configuration
        engine = create_engine(
            DATABASE_URL,
            echo=settings.db_echo,
            connect_args={
                "check_same_thread": False,
                "timeout": 30
            },
            poolclass=StaticPool,
        )
    else:
        # PostgreSQL/MySQL configuration
        engine = create_engine(
            DATABASE_URL,
            echo=settings.db_echo,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_pre_ping=True,
            pool_recycle=3600,
        )
    
    logger.info(f"Database engine created for: {DATABASE_URL}")
    return engine

# Create engine and session
engine = create_db_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

def get_db():
    """Database dependency for FastAPI"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_db_connection():
    """Get direct database connection (for legacy code compatibility)"""
    if is_sqlite():
        # SQLite connection
        db_path = settings.database_url.replace("sqlite:///", "")
        conn = sqlite3.connect(db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row  # Enable column access by name
        return conn
    
    elif settings.database_url.startswith("mysql"):
        # MySQL connection
        try:
            # Parse connection details from URL or use individual settings
            if hasattr(settings, 'mysql_host'):
                conn = mysql.connector.connect(
                    host=settings.mysql_host,
                    port=settings.mysql_port,
                    user=settings.mysql_user,
                    password=settings.mysql_password,
                    database=settings.mysql_database,
                    charset=settings.mysql_charset,
                    autocommit=False
                )
            else:
                # Parse from URL (more complex, fallback)
                import urllib.parse as urlparse
                parsed = urlparse.urlparse(settings.database_url)
                conn = mysql.connector.connect(
                    host=parsed.hostname,
                    port=parsed.port or 3306,
                    user=parsed.username,
                    password=parsed.password,
                    database=parsed.path.lstrip('/'),
                    charset='utf8mb4',
                    autocommit=False
                )
            return conn
        except mysql.connector.Error as e:
            logger.error(f"MySQL connection failed: {e}")
            raise
    
    else:
        raise NotImplementedError(f"Direct connection not implemented for: {settings.database_url}")

def init_database():
    """Initialize database tables"""
    try:
        # Import models to register them
        import models
        
        Base.metadata.create_all(bind=engine)
        logger.info(f"Database initialized successfully with {DATABASE_URL}")
        return True
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise

def check_db_connection():
    """Check database connection"""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Database connection successful")
        return True
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return False