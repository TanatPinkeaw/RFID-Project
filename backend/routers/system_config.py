from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from config.database import get_db_connection  # ✅ แก้ไข import
from models import SystemConfig

router = APIRouter(prefix="/api/system-config", tags=["system_config"])

class SystemConfigUpdate(BaseModel):
    value: str
    description: str = None

@router.get("", response_model=List[SystemConfig])
def list_system_config():
    """GET /api/system-config – ดึงค่าการตั้งค่าระบบทั้งหมด"""
    conn = get_db_connection(); cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT `key`, `value`, `description` FROM system_config ORDER BY `key`")
        return cur.fetchall()
    finally:
        cur.close(); conn.close()

@router.get("/scan-settings")
def get_scan_settings():
    """ดึงค่าการตั้งค่าสำหรับการสแกนเท่านั้น"""
    conn = get_db_connection(); cur = conn.cursor(dictionary=True)
    try:
        cur.execute("""
            SELECT `key`, `value`, `description` 
            FROM system_config 
            WHERE `key` IN ('SCAN_INTERVAL', 'DB_UPDATE_INTERVAL', 'DELAY_SECONDS')
            ORDER BY `key`
        """)
        settings = cur.fetchall()
        
        # แปลงเป็น dictionary สำหรับใช้งานง่าย
        result = {}
        for setting in settings:
            result[setting['key']] = {
                'value': float(setting['value']) if setting['key'] in ['SCAN_INTERVAL', 'DB_UPDATE_INTERVAL'] else int(setting['value']),
                'description': setting['description']
            }
        
        return result
    finally:
        cur.close(); conn.close()

@router.put("/{key}", response_model=SystemConfig)
def update_system_config(key: str, cfg: SystemConfigUpdate):
    """PUT /api/system-config/{key} – อัปเดตค่าการตั้งค่าระบบ"""
    conn = get_db_connection(); cur = conn.cursor(dictionary=True)
    try:
        # ตรวจสอบว่า key มีอยู่หรือไม่
        cur.execute("SELECT `key` FROM system_config WHERE `key` = %s", (key,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Config key not found")
        
        # ตรวจสอบค่าที่ใส่เข้ามา
        if key in ['SCAN_INTERVAL', 'DB_UPDATE_INTERVAL']:
            try:
                value = float(cfg.value)
                if value <= 0:
                    raise ValueError("Value must be positive")
            except ValueError:
                raise HTTPException(status_code=400, detail=f"{key} must be a positive number")
        elif key == 'DELAY_SECONDS':
            try:
                value = int(cfg.value)
                if value < 0:
                    raise ValueError("Value must be non-negative")
            except ValueError:
                raise HTTPException(status_code=400, detail=f"{key} must be a non-negative integer")
        
        # อัปเดตค่า
        update_query = "UPDATE system_config SET `value`=%s WHERE `key`=%s"
        params = [cfg.value, key]
        
        if cfg.description is not None:
            update_query = "UPDATE system_config SET `value`=%s, description=%s WHERE `key`=%s"
            params = [cfg.value, cfg.description, key]
        
        cur.execute(update_query, params)
        conn.commit()
        
        # ดึงข้อมูลที่อัปเดตแล้ว
        cur.execute(
            "SELECT `key`, `value`, `description` FROM system_config WHERE `key`=%s",
            (key,)
        )
        return cur.fetchone()
    finally:
        cur.close(); conn.close()

@router.post("/reset-defaults")
def reset_to_defaults():
    """รีเซ็ตค่าการตั้งค่าการสแกนกลับเป็นค่าเริ่มต้น"""
    default_values = {
        'SCAN_INTERVAL': '0.1',
        'DB_UPDATE_INTERVAL': '1',
        'DELAY_SECONDS': '20'
    }
    
    conn = get_db_connection(); cur = conn.cursor()
    try:
        for key, value in default_values.items():
            cur.execute(
                "UPDATE system_config SET `value`=%s WHERE `key`=%s",
                (value, key)
            )
        conn.commit()
        return {"message": "Reset to default values successfully", "defaults": default_values}
    finally:
        cur.close(); conn.close()