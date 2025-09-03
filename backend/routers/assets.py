from fastapi import APIRouter, HTTPException
from typing import List
from config.database import get_db_connection
from models import Asset, AssetDetail, AssetCreate
from routers.notifications import create_notification
from ws_manager import manager
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/assets", tags=["assets"])

# ---------- Helpers ----------
def _open_dict_cursor():
    """เปิด connection + dictionary cursor (ผู้เรียกต้องปิดเอง)"""
    conn = get_db_connection()
    return conn, conn.cursor(dictionary=True)

def _get_asset_or_404(asset_id: int):
    """ดึง asset เดี่ยว ไม่พบให้ 404"""
    conn, cur = _open_dict_cursor()
    try:
        cur.execute(
            "SELECT asset_id, name, type, status, created_at, updated_at "
            "FROM assets WHERE asset_id=%s",
            (asset_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Asset not found")
        return row
    finally:
        cur.close(); conn.close()

# ---------- Endpoints ----------
@router.get("", response_model=List[Asset])
def list_assets():
    """GET /api/assets – ดึงรายการทรัพย์สิน พร้อม filter (type, สถานะ, วันที่)"""
    conn, cur = _open_dict_cursor()
    try:
        cur.execute(
            "SELECT asset_id, name, type, status, created_at, updated_at "
            "FROM assets ORDER BY asset_id DESC"
        )
        return cur.fetchall()
    finally:
        cur.close(); conn.close()

@router.post("", response_model=Asset)
def create_asset(a: AssetCreate):
    """POST /api/assets – ลงทะเบียนทรัพย์สินใหม่"""
    # Pydantic validation happens before this function; AssetCreate should match frontend payload
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # defensive: ensure required fields exist (Pydantic normally guarantees this)
        name = getattr(a, "name", None)
        asset_type = getattr(a, "type", None)
        status = getattr(a, "status", "active")
        if not name or not asset_type:
            raise HTTPException(status_code=400, detail="Missing required fields: name and type")

        cur.execute(
            "INSERT INTO assets (name, type, status, created_at) "
            "VALUES (%s, %s, %s, NOW())",
            (name, asset_type, status),
        )
        conn.commit()
        new_id = cur.lastrowid

        # สร้าง notification
        create_notification(
            type="scan",
            title="ลงทะเบียนทรัพย์สินใหม่",
            message=f"ลงทะเบียนทรัพย์สิน '{name}' (ID: {new_id}) ประเภท {asset_type}",
            asset_id=new_id
        )

        # Broadcast asset create (ส่งข้อมูล asset ที่เพิ่งสร้างให้ clients)
        try:
            created = _get_asset_or_404(new_id)
            logger.info("assets.py: broadcasting asset_create id=%s", new_id)
            manager.queue_message({"type": "asset_update", "action": "create", "asset": created})
        except Exception:
            logger.exception("assets.py: broadcast failed")

    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        logger.exception("create_asset failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close(); conn.close()

    return _get_asset_or_404(new_id)

@router.get("/{asset_id}", response_model=AssetDetail)
def get_asset(asset_id: int):
    """GET /api/assets/{asset_id} – ดึงรายละเอียด Asset โดยรวมข้อมูล RFID tag, ประวัติการ movement"""
    # 1) asset หลัก
    asset = _get_asset_or_404(asset_id)

    # 2) tags ที่ผูกกับ asset
    conn, cur = _open_dict_cursor()
    try:
        cur.execute(
            "SELECT tag_id, status, asset_id, current_location_id, last_seen "
            "FROM tags WHERE asset_id=%s",
            (asset_id,),
        )
        tags = cur.fetchall()

        # 3) ประวัติการเคลื่อนย้าย
        cur.execute(
            "SELECT movement_id, asset_id, from_location_id, to_location_id, "
            "timestamp, operator, event_type "
            "FROM movements WHERE asset_id=%s ORDER BY timestamp DESC",
            (asset_id,),
        )
        movements = cur.fetchall()
        return {**asset, "tags": tags, "movements": movements}
    finally:
        cur.close(); conn.close()

@router.put("/{asset_id}", response_model=Asset)
def update_asset(asset_id: int, asset_data: AssetCreate):
    """PUT /api/assets/{asset_id} – แก้ไข asset"""
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        # ตรวจสอบว่า asset มีอยู่หรือไม่
        cur.execute("SELECT * FROM assets WHERE asset_id = %s", (asset_id,))
        existing_asset = cur.fetchone()
        if not existing_asset:
            raise HTTPException(status_code=404, detail="Asset not found")
        
        # อัพเดท asset
        cur.execute("""
            UPDATE assets 
            SET name = %s, type = %s, status = %s, updated_at = NOW()
            WHERE asset_id = %s
        """, (asset_data.name, asset_data.type, asset_data.status, asset_id))
        
        conn.commit()
        
        # ดึงข้อมูลที่อัพเดทแล้ว
        cur.execute("SELECT * FROM assets WHERE asset_id = %s", (asset_id,))
        updated_asset = cur.fetchone()
        # Broadcast asset update
        try:
            logger.info("assets.py: broadcasting asset_update id=%s", asset_id)   # <-- เพิ่ม (ใน update endpoint)
            manager.queue_message({"type": "asset_update", "action": "update", "asset": updated_asset})
        except Exception:
            logger.exception("assets.py: broadcast failed")
        
        return updated_asset
        
    finally:
        cur.close()
        conn.close()

@router.delete("/{asset_id}", status_code=204)
def delete_asset(asset_id: int):
    """DELETE /api/assets/{asset_id} – ลบทรัพย์สิน"""
    conn = get_db_connection(); cur = conn.cursor()
    try:
        cur.execute("DELETE FROM assets WHERE asset_id=%s", (asset_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Asset not found")
        conn.commit()
        
        # สร้าง notification
        create_notification(
            type="alert",
            title="ลบทรัพย์สิน",
            message=f"ลบทรัพย์สิน ID {asset_id} ออกจากระบบ",
            asset_id=asset_id
        )
        # Broadcast delete
        try:
            logger.info("assets.py: broadcasting asset_delete id=%s", asset_id)   # <-- เพิ่ม (in delete)
            manager.queue_message({"type": "asset_update", "action": "delete", "asset_id": asset_id})
        except Exception:
            logger.exception("assets.py: broadcast failed")
    finally:
        cur.close(); conn.close()