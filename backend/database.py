import mysql.connector
from mysql.connector import pooling
import logging
import time
import threading

logger = logging.getLogger(__name__)

# Configuration
DB_CONFIG = {
    "host": "127.0.0.1",
    "user": "root", 
    "password": "",
    "database": "rfid_system",
    "charset": "utf8mb4",
    "collation": "utf8mb4_unicode_ci",
}

_pool = None
_pool_lock = threading.Lock()

def create_connection_pool():
    """สร้าง connection pool ใหม่"""
    global _pool
    try:
        _pool = pooling.MySQLConnectionPool(
            pool_name="rfid_pool",
            pool_size=10,
            pool_reset_session=True,
            autocommit=False,
            **DB_CONFIG
        )
        logger.info("✅ Database connection pool created successfully")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to create database pool: {e}")
        return False

def get_db_connection(max_retries=5, retry_delay=2):
    """
    คืน MySQL connection พร้อม auto-reconnect
    จะพยายามเชื่อมต่อใหม่จนกว่าจะสำเร็จ
    """
    global _pool
    
    for attempt in range(max_retries):
        try:
            # ตรวจสอบว่ามี pool หรือไม่
            if _pool is None:
                with _pool_lock:
                    if _pool is None:  # Double-check locking
                        logger.warning(f"🔄 Database pool not found, creating new pool (attempt {attempt + 1})")
                        if not create_connection_pool():
                            raise mysql.connector.Error("Failed to create connection pool")
            
            # ลองดึง connection จาก pool
            conn = _pool.get_connection()
            
            # ทดสอบ connection
            if conn.is_connected():
                conn.autocommit = False
                #logger.debug(f"✅ Database connection obtained successfully")
                return conn
            else:
                conn.close()
                raise mysql.connector.Error("Connection is not active")
                
        except mysql.connector.Error as e:
            logger.warning(f"⚠️ Database connection attempt {attempt + 1} failed: {e}")
            
            # ถ้าเป็น connection pool error ให้สร้าง pool ใหม่
            if "pool" in str(e).lower() or "not connected" in str(e).lower():
                with _pool_lock:
                    _pool = None
            
            if attempt < max_retries - 1:
                logger.info(f"🔄 Retrying database connection in {retry_delay} seconds...")
                time.sleep(retry_delay)
                retry_delay *= 1.5  # Exponential backoff
            else:
                logger.error(f"❌ Database connection failed after {max_retries} attempts")
                raise
        
        except Exception as e:
            logger.error(f"❌ Unexpected database error: {e}")
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
                retry_delay *= 1.5
            else:
                raise

def execute_with_retry(query, params=None, fetch_one=False, fetch_all=False, commit=False):
    """
    Execute query พร้อม auto-retry เมื่อ connection หลุด
    """
    max_retries = 3
    
    for attempt in range(max_retries):
        conn = None
        cur = None
        try:
            conn = get_db_connection()
            cur = conn.cursor(dictionary=True)
            
            cur.execute(query, params)
            
            result = None
            if fetch_one:
                result = cur.fetchone()
            elif fetch_all:
                result = cur.fetchall()
            
            if commit:
                conn.commit()
                
            return result
            
        except mysql.connector.Error as e:
            logger.warning(f"⚠️ Database query attempt {attempt + 1} failed: {e}")
            if conn:
                try:
                    conn.rollback()
                except:
                    pass
            
            if attempt < max_retries - 1:
                time.sleep(1)
            else:
                raise
                
        except Exception as e:
            logger.error(f"❌ Unexpected error in execute_with_retry: {e}")
            if conn:
                try:
                    conn.rollback()
                except:
                    pass
            raise
            
        finally:
            try:
                if cur:
                    cur.close()
                if conn:
                    conn.close()
            except:
                pass

# Initialize pool on module load
create_connection_pool()