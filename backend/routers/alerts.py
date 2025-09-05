from fastapi import APIRouter
from typing import Optional
from datetime import datetime, timedelta
from config.database import get_db_connection
from routers.notifications import create_notification  # ใช้ฟังก์ชันที่มีอยู่
from ws_manager import manager
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/alerts", tags=["alerts"])

# ถ้า alert เดิมถูกสร้างมาแล้วภายใน cooldown_seconds จะไม่สร้างซ้ำ
ALERT_COOLDOWN_SECONDS = 30

def _was_recently_alerted(conn, notif_type: str, message_like: str, cooldown_seconds: int = ALERT_COOLDOWN_SECONDS) -> bool:
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT 1 FROM notifications
            WHERE type = %s AND message LIKE %s AND created_at >= (NOW() - INTERVAL %s SECOND)
            LIMIT 1
        """, (notif_type, f"%{message_like}%", cooldown_seconds))
        return cur.fetchone() is not None
    finally:
        cur.close()

def check_unauthorized_movement(conn=None, cur=None, tag_id: str = None, to_location_id: Optional[int] = None, operator: Optional[str] = None):
    """
    ตรวจสอบว่า tag_id ยังไม่ได้รับอนุญาต (authorized == 0) หรือไม่
    - ถ้าไม่ได้รับอนุญาต จะสร้าง notification type='alert'
    - รับ conn/cur ที่เปิดอยู่มาใช้ได้ (ถ้ามี) เพื่อหลีกเลี่ยงการเปิด connection ซ้ำ
    - ฟังก์ชันนี้ไม่โยน exception ออกไป — จะจับไว้และ return False เมื่อมีปัญหา
    """
    own_conn = own_cur = None
    try:
        if not tag_id:
            return False

        if conn is None or cur is None:
            own_conn = get_db_connection()
            own_cur = own_conn.cursor(dictionary=True)
            cur_to_use = own_cur
            conn_to_use = own_conn
        else:
            cur_to_use = cur
            conn_to_use = conn

        # ดึงสถานะ authorized และชื่อ location (ถ้ามี)
        cur_to_use.execute("SELECT COALESCE(authorized,0) as authorized, current_location_id FROM tags WHERE tag_id=%s", (tag_id,))
        tag_row = cur_to_use.fetchone()
        if not tag_row:
            return False

        authorized = tag_row.get('authorized', 0)
        if authorized:  # 1 => authorized -> ไม่มี alert
            return False

        # สร้างข้อความแจ้งเตือน (simple)
        loc_text = f"Location ID {to_location_id}" if to_location_id else "unknown location"
        op_text = operator or "system"
        title = "⚠️ Tag เคลื่อนที่ที่ไม่ได้รับอนุญาต"
        message = f"Tag {tag_id} (unauthorized) เคลื่อนที่ไปยัง {loc_text} โดย {op_text}"

        # สร้าง notification แบบไม่ขัดขวาง flow
        try:
            create_notification(
                type="alert",
                title=title,
                message=message,
                asset_id=None,
                user_id=None,
                location_id=to_location_id,
                related_id=None,
                priority="high"
            )
            logger.info(f"Unauthorized movement alert created for tag {tag_id} -> {loc_text}")
        except Exception as e:
            logger.error(f"Failed to create unauthorized alert for {tag_id}: {e}")

        # ✅ เพิ่ม real-time broadcast สำหรับ unauthorized alert
        try:
            manager.broadcast_notification({
                "type": "alert", 
                "title": title,
                "message": message,
                "priority": "high",
                "tag_id": tag_id,
                "location_id": to_location_id,
                "timestamp": datetime.now().isoformat()
            })
            logger.info(f"✅ Unauthorized alert broadcasted for tag {tag_id}")
        except Exception as e:
            logger.error(f"❌ Failed to broadcast unauthorized alert: {e}")

        return True

    except Exception as e:
        logger.error(f"Error in check_unauthorized_movement: {e}")
        return False

    finally:
        if own_cur:
            own_cur.close()
        if own_conn:
            own_conn.close()

def notify_unauthorized_movement(tag_id: str, tag_epc: str, from_location: int, to_location: int, device_id: int):
    """
    เรียกเมื่อพบ movement ของ tag; สร้าง alert เฉพาะถ้า tag นี้ถือว่า 'unauthorized'
    (logic การตัดสิน unauthorized - ปรับตามฐานข้อมูลของคุณ)
    """
    conn = get_db_connection()
    try:
        # ตัวอย่าง logic: ดู binding ของ asset/tag ว่าต้องอยู่ที่ location ไหน
        cur = conn.cursor(dictionary=True)
        try:
            cur.execute("SELECT allowed_location_id FROM tag_bindings WHERE tag_id = %s LIMIT 1", (tag_id,))
            binding = cur.fetchone()
            allowed_loc = binding.get("allowed_location_id") if binding else None

            # ถ้าไม่มี allowed location ถือว่าไม่อนุญาตให้ออกนอกพื้นที่ (ปรับตาม schema จริง)
            unauthorized = False
            if allowed_loc is None:
                # ตัวอย่าง: ถ้าจาก location != to_location หรือ to_location ไม่เท่ากับ allowed_loc
                unauthorized = True
            else:
                unauthorized = (to_location != allowed_loc)

            if unauthorized:
                msg_short = f"Tag {tag_epc} เคลื่อนที่ที่ไม่ได้รับอนุญาต: {from_location}→{to_location}"
                # ป้องกัน duplicate
                if not _was_recently_alerted(conn, "alert", tag_epc):
                    create_notification(
                        type="alert",
                        title="Tag เคลื่อนที่ที่ไม่ได้รับอนุญาต",
                        message=msg_short,
                        asset_id=None,
                        user_id=None,
                        location_id=to_location,
                        related_id=None,
                        priority="high"
                    )
                    logger.info("Created unauthorized alert for tag %s", tag_epc)
                else:
                    logger.debug("Skipping duplicate unauthorized alert for %s", tag_epc)
        finally:
            cur.close()
    finally:
        conn.close()

@router.post("/check-overdue")
def check_overdue_returns(overdue_days: int = 0):
    """
    ค้นหา borrowing_records ที่ยังไม่คืนและ due_date < NOW()
    สร้าง alert เฉพาะกรณี overdue
    สามารถเรียกจาก scheduler หรือด้วยมือ
    """
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    created = 0
    try:
        # ตัวอย่าง schema: borrowing_records(tag_id, due_at, returned_at, user_id, asset_id)
        cur.execute("""
            SELECT br.id, br.tag_id, t.epc as tag_epc, br.due_at, br.asset_id
            FROM borrowing_records br
            JOIN tags t ON t.id = br.tag_id
            WHERE br.returned_at IS NULL AND br.due_at < NOW()
        """)
        rows = cur.fetchall()
        for r in rows:
            tag_epc = r["tag_epc"]
            msg_short = f"Tag {tag_epc} เกินกำหนดคืน (due {r['due_at']})"
            # ป้องกัน duplicate alert ก่อน insert
            if not _was_recently_alerted(conn, "alert", tag_epc, cooldown_seconds=3600):
                create_notification(
                    type="alert",
                    title="Tag เกินกำหนดคืน",
                    message=msg_short,
                    asset_id=r.get("asset_id"),
                    user_id=None,
                    location_id=None,
                    related_id=r.get("id"),
                    priority="high"
                )
                created += 1
        return {"created": created, "checked": len(rows)}
    finally:
        cur.close()
        conn.close()