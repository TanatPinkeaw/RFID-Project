from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from config.database import get_db_connection
from models import Movement
from routers.notifications import create_notification
from routers.alerts import check_unauthorized_movement
import logging
from ws_manager import manager

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

router = APIRouter(prefix="/api/movements", tags=["movements"])

# Helpers
def _open_dict_cursor():
    """เปิด connection + dictionary cursor (ผู้เรียกต้องปิดเอง)"""
    conn = get_db_connection()
    return conn, conn.cursor(dictionary=True)

def _create_notification(message: str, notif_type: str = "system", 
                        priority: str = "normal", tag_id: str = None, 
                        asset_id: str = None, related_id: int = None):
    """สร้างการแจ้งเตือน (ใช้ภายใน movements)"""
    try:
        # Import ภายในเพื่อหลีกเลี่ยง circular import
        from routers.notifications import create_notification
        return create_notification(message, notif_type, priority, tag_id, asset_id, None, related_id)
    except Exception as e:
        print(f"Failed to create notification: {e}")
        return None

@router.get("", response_model=List[Movement])
def list_movements(
    asset_id: Optional[int] = Query(None, description="Filter by asset_id"),
    skip: int = Query(0, ge=0, description="Offset"),
    limit: int = Query(100, ge=1, le=1000, description="Page size"),
):
    """GET /api/movements – ดึงประวัติการเข้า-ออก asset ทั้งหมด"""
    conn, cur = _open_dict_cursor()
    try:
        sql = """
            SELECT m.movement_id, m.asset_id, m.tag_id, m.from_location_id, m.to_location_id,
                   m.timestamp, m.operator, m.event_type,
                   a.name as asset_name,
                   fl.name as from_location_name,
                   tl.name as to_location_name
            FROM movements m
            LEFT JOIN assets a ON m.asset_id = a.asset_id
            LEFT JOIN locations fl ON m.from_location_id = fl.location_id
            LEFT JOIN locations tl ON m.to_location_id = tl.location_id
        """
        params: list = []
        if asset_id is not None:
            sql += " WHERE m.asset_id=%s"
            params.append(asset_id)
        sql += " ORDER BY m.timestamp DESC LIMIT %s OFFSET %s"
        params.extend([limit, skip])
        cur.execute(sql, tuple(params))
        return cur.fetchall()
    finally:
        cur.close(); conn.close()

@router.post("", response_model=Movement)
def create_movement(m: Movement):
    """POST /api/movements – บันทึก movement ใหม่ (โดยระบุบางการ scan)"""
    if m.asset_id is None:
        raise HTTPException(status_code=400, detail="asset_id is required")

    conn = get_db_connection(); cur = conn.cursor(dictionary=True)
    try:
        # ดึงข้อมูล asset และ location สำหรับสร้างการแจ้งเตือน
        cur.execute("""
            SELECT a.name as asset_name, a.asset_id,
                   fl.name as from_location_name,
                   tl.name as to_location_name
            FROM assets a
            LEFT JOIN locations fl ON %s = fl.location_id
            LEFT JOIN locations tl ON %s = tl.location_id
            WHERE a.asset_id = %s
        """, (m.from_location_id, m.to_location_id, m.asset_id))
        
        asset_info = cur.fetchone()
        
        cur.execute(
            "INSERT INTO movements "
            "(asset_id, tag_id, from_location_id, to_location_id, timestamp, operator, event_type) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (m.asset_id, m.tag_id, m.from_location_id, m.to_location_id, m.timestamp, m.operator, m.event_type),
        )
        new_id = cur.lastrowid
        conn.commit()
        
        # สร้าง notification
        create_notification(
            type="movement",
            title="ตรวจพบการเคลื่อนย้ายทรัพย์สิน",
            message=f"ทรัพย์สิน ID {m.asset_id} ถูกเคลื่อนย้ายไปยัง Location ID {m.to_location_id}",
            asset_id=m.asset_id,
            location_id=m.to_location_id
        )

        # ตรวจ tag ที่เกี่ยวข้อง: ถ้า tag ไม่ได้รับอนุญาต ให้สร้าง alert notification (ไม่ขัดการทำงาน)
        try:
            if m.tag_id:
                # ส่ง conn, cur ที่เปิดอยู่ลงไปเพื่อประหยัดการเชื่อมต่อ
                check_unauthorized_movement(conn, cur, m.tag_id, m.to_location_id, operator=m.operator)
        except Exception as e:
            # ป้องกันไม่ให้การสร้าง alert ทำให้ endpoint ล้ม
            print(f"Warning: check_unauthorized_movement failed: {e}")
        
        # ✅ เพิ่ม real-time broadcast
        try:
            manager.queue_message({
                "type": "movement_update",
                "data": {
                    "movement_id": new_id,
                    "asset_id": m.asset_id,
                    "tag_id": m.tag_id,
                    "from_location_id": m.from_location_id,
                    "to_location_id": m.to_location_id,
                    "timestamp": m.timestamp.isoformat() if m.timestamp else None,
                    "operator": m.operator,
                    "event_type": m.event_type,
                    "asset_name": asset_info.get("asset_name") if asset_info else None
                }
            })
            logger.info(f"✅ Movement update broadcasted: {new_id}")
        except Exception as e:
            logger.error(f"❌ Failed to broadcast movement update: {e}")
    finally:
        cur.close(); conn.close()

    # คืนข้อมูลจาก DB ให้ตรงกับ response_model
    conn2, cur2 = _open_dict_cursor()
    try:
        cur2.execute(
            "SELECT movement_id, asset_id, tag_id, from_location_id, to_location_id, timestamp, operator, event_type "
            "FROM movements WHERE movement_id=%s",
            (new_id,),
        )
        return cur2.fetchone()
    finally:
        cur2.close(); conn2.close()

@router.get("/{movementId}", response_model=Movement)
def get_movement(movementId: int):
    """GET /api/movements/{movementId} – ดูรายละเอียด movement entry"""
    conn, cur = _open_dict_cursor()
    try:
        cur.execute(
            "SELECT movement_id, asset_id, tag_id, from_location_id, to_location_id, timestamp, operator, event_type "
            "FROM movements WHERE movement_id=%s",
            (movementId,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Movement not found")
        return row
    finally:
        cur.close(); conn.close()