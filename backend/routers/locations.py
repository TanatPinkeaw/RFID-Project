from fastapi import APIRouter, HTTPException
from typing import List
from datetime import datetime
from config.database import get_db_connection
from models import Location, ScanModel, Movement, LocationRead
from routers.notifications import create_notification
from ws_manager import manager
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/locations", tags=["locations"])

# Helper: เปิด connection + dictionary cursor (ผู้เรียกต้องปิดเอง)
def _open_dict_cursor():
    conn = get_db_connection()
    return conn, conn.cursor(dictionary=True)

@router.get("", response_model=List[Location])
def list_locations():
    """GET /api/locations – ดึงสถานที่แหล่ง Gate/RFID reader ทั้งหมด"""
    conn, cur = _open_dict_cursor()
    try:
        cur.execute("""
            SELECT location_id, name, description, direction, ip_address, port, timeout
            FROM locations
            ORDER BY location_id
        """)
        return cur.fetchall()
    finally:
        cur.close(); conn.close()

@router.get("/", response_model=List[LocationRead])
def get_locations():
    """ดึงรายการ locations ทั้งหมด"""
    conn, cur = _open_dict_cursor()
    try:
        cur.execute("""
            SELECT location_id as id, name, description, 
                   CASE WHEN location_id = 3 THEN false ELSE true END as active,
                   NOW() as created_at,
                   NOW() as updated_at
            FROM locations
            ORDER BY location_id
        """)
        return cur.fetchall()
    finally:
        cur.close(); conn.close()

@router.get("/active", response_model=List[LocationRead])
def get_active_locations():
    """ดึงรายการ locations ที่ active เท่านั้น (ไม่รวม id = 3)"""
    conn, cur = _open_dict_cursor()
    try:
        cur.execute("""
            SELECT location_id as id, name, description, 
                   true as active,
                   NOW() as created_at,
                   NOW() as updated_at
            FROM locations
            WHERE location_id != 3
            ORDER BY location_id
        """)
        return cur.fetchall()
    finally:
        cur.close(); conn.close()

@router.post("/{location_id}/scan", response_model=Movement)
def scan_at_location(location_id: int, s: ScanModel):
    """POST /api/locations/{location_id}/scan – รับข้อมูล scan จาก Handheld Scanner (tagId, timestamp, operator)"""
    ts = s.timestamp or datetime.now()
    conn, cur = _open_dict_cursor()
    try:
        # 1) ตรวจว่ามี location นี้จริง
        cur.execute("SELECT 1 FROM locations WHERE location_id=%s", (location_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Location not found")

        # 2) หา asset ที่ผูกกับ tag
        cur.execute(
            "SELECT asset_id, current_location_id FROM tags WHERE tag_id=%s",
            (s.tag_id,),
        )
        row = cur.fetchone()
        if not row or not row.get("asset_id"):
            raise HTTPException(status_code=404, detail="Tag not bound to any asset")

        aid = row["asset_id"]
        prev_loc = row["current_location_id"]
        mov_id = None

        # 3) ถ้าตำแหน่งเปลี่ยน จึงบันทึก movement และอัปเดต tags
        if prev_loc != location_id:
            cur.execute(
                "INSERT INTO movements (asset_id, from_location_id, to_location_id, timestamp, operator, event_type) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (aid, prev_loc, location_id, ts, s.operator, "enter"),
            )
            mov_id = cur.lastrowid
            cur.execute(
                "UPDATE tags SET current_location_id=%s WHERE tag_id=%s",
                (location_id, s.tag_id),
            )
            conn.commit()
            
            # สร้าง notification
            create_notification(
                type="movement",
                title="ตรวจพบการเคลื่อนย้าย",
                message=f"Asset ID {aid} เคลื่อนย้ายจาก Location {prev_loc} ไปยัง Location {location_id}",
                asset_id=aid,
                location_id=location_id
            )

        # ✅ เพิ่ม real-time broadcast สำหรับ scan result
        try:
            manager.broadcast_scan_result({
                "tag_id": s.tag_id,
                "location_id": location_id,
                "asset_id": aid,
                "timestamp": ts.isoformat() if hasattr(ts, 'isoformat') else str(ts),
                "operator": s.operator,
                "status": "success",
                "movement_created": mov_id is not None
            })
            logger.info(f"✅ Scan result broadcasted: {s.tag_id} at location {location_id}")
        except Exception as e:
            logger.error(f"❌ Failed to broadcast scan result: {e}")
        
        # ✅ ถ้ามี movement ให้ broadcast movement update ด้วย
        if mov_id:
            try:
                manager.queue_message({
                    "type": "movement_update",
                    "data": {
                        "movement_id": mov_id,
                        "asset_id": aid,
                        "tag_id": s.tag_id,
                        "from_location_id": prev_loc,
                        "to_location_id": location_id,
                        "timestamp": ts.isoformat() if hasattr(ts, 'isoformat') else str(ts),
                        "operator": s.operator,
                        "event_type": "enter"
                    }
                })
            except Exception as e:
                logger.error(f"❌ Failed to broadcast movement update: {e}")
        
        # 4) คืนผลลัพธ์ (ถ้าไม่มี movement ใหม่ movement_id จะเป็น None)
        return Movement(
            movement_id=mov_id,
            asset_id=aid,
            from_location_id=prev_loc,
            to_location_id=location_id,
            timestamp=ts,
            operator=s.operator,
            event_type="enter",
        )
    finally:
        cur.close(); conn.close()