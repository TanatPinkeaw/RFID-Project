from fastapi import APIRouter, HTTPException
from typing import List
from datetime import datetime
from config.database import get_db_connection
from models import Tag, TagOp, BindModel
from routers.notifications import create_notification
from routers.alerts import check_unauthorized_movement
from ws_manager import manager
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tags", tags=["tags"])

# ========================================
# HELPER FUNCTIONS
# ========================================

def _get_asset_id(cur, tag_id: str):
    """อ่าน asset_id ของ tag (ถ้าไม่มีให้คืน None)"""
    cur.execute("SELECT asset_id FROM tags WHERE tag_id=%s", (tag_id,))
    row = cur.fetchone()
    return row['asset_id'] if row and 'asset_id' in row else None


def _normalize_tag_row(row):
    """แปลงข้อมูล tag row ให้เป็นรูปแบบมาตรฐาน"""
    if not row:
        return None
    
    # ensure authorized is boolean
    auth = row.get("authorized", 0)
    try:
        auth_bool = bool(int(auth))
    except Exception:
        auth_bool = True if auth in (True, "true", "True") else False
    
    return {
        "tag_id": row.get("tag_id"),
        "status": row.get("status"),
        "asset_id": row.get("asset_id"),
        "current_location_id": row.get("current_location_id"),
        "last_seen": row.get("last_seen"),
        "authorized": auth_bool,
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _broadcast_tag_update(tag_obj):
    """Broadcast tag update ผ่าน WebSocket"""
    try:
        manager.queue_message({"type": "tag_update", "tag": tag_obj})
        logger.info(f"📡 Broadcasted tag update: {tag_obj.get('tag_id')}")
    except Exception as e:
        logger.error(f"Failed to broadcast tag update: {e}")


def _get_canonical_tag(cur, tag_id: str):
    """ดึงข้อมูล tag แบบครบถ้วนจาก database"""
    cur.execute("""
        SELECT tag_id, status, asset_id, current_location_id, last_seen, 
               COALESCE(authorized,0) as authorized, created_at, updated_at 
        FROM tags WHERE tag_id=%s
    """, (tag_id,))
    row = cur.fetchone()
    return _normalize_tag_row(row) if row else None


# ========================================
# MAIN ENDPOINTS
# ========================================

@router.get("", response_model=List[Tag])
def list_tags():
    """รายการ tags ทั้งหมด"""
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("""
            SELECT
                tag_id,
                status,
                asset_id,
                current_location_id,
                last_seen,
                COALESCE(authorized, 0) AS authorized,
                created_at,
                updated_at
            FROM tags
            ORDER BY last_seen DESC
        """)
        rows = cur.fetchall() or []
        return [_normalize_tag_row(r) for r in rows]
    finally:
        cur.close()
        conn.close()


@router.get("/stats")
def tags_stats():
    """สถิติของ tags"""
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT COUNT(*) AS cnt FROM tags")
        total_tags = cur.fetchone().get("cnt", 0)

        cur.execute("SELECT COUNT(*) AS cnt FROM tags WHERE asset_id IS NOT NULL")
        total_bound = cur.fetchone().get("cnt", 0)

        cur.execute("SELECT COUNT(*) AS cnt FROM tags WHERE status='in_use'")
        total_in_use = cur.fetchone().get("cnt", 0)

        cur.execute("SELECT COUNT(*) AS cnt FROM tags WHERE status='borrowed'")
        total_borrowed = cur.fetchone().get("cnt", 0)

        cur.execute("SELECT COUNT(*) AS cnt FROM tags WHERE COALESCE(authorized,0)=1")
        total_authorized = cur.fetchone().get("cnt", 0)

        return {
            "totalTags": int(total_tags),
            "totalBound": int(total_bound),
            "totalInUse": int(total_in_use),
            "totalBorrowed": int(total_borrowed),
            "totalAuthorized": int(total_authorized),
        }
    except Exception:
        logger.exception("tags_stats failed")
        raise HTTPException(status_code=500, detail="Failed to query tags stats")
    finally:
        cur.close()
        conn.close()


@router.get("/{tag_id}", response_model=Tag)
def get_tag(tag_id: str):
    """ดึงข้อมูล tag เดียว"""
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        tag_obj = _get_canonical_tag(cur, tag_id)
        if not tag_obj:
            raise HTTPException(status_code=404, detail="Tag not found")
        return tag_obj
    finally:
        cur.close()
        conn.close()


# ========================================
# TAG OPERATIONS
# ========================================

@router.post("", response_model=Tag)
def tag_operation(op: TagOp):
    """ดำเนินการต่าง ๆ กับ tag (register, borrow, return, bind, unbind)"""
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    ts = op.timestamp or datetime.now()
    action = (op.action or "").lower()

    try:
        if action == "register":
            cur.execute(
                "INSERT INTO tags (tag_id, status, asset_id, last_seen, created_at) VALUES (%s,%s,%s,%s,%s) "
                "ON DUPLICATE KEY UPDATE status=VALUES(status), asset_id=VALUES(asset_id), last_seen=VALUES(last_seen), updated_at=NOW()",
                (op.tag_id, "idle", op.asset_id, ts, ts),
            )

        elif action == "borrow":
            if not op.borrower:
                raise HTTPException(status_code=400, detail="Missing borrower name")
            
            aid = _get_asset_id(cur, op.tag_id)
            if not aid:
                raise HTTPException(status_code=404, detail="Tag not bound to any asset")
            
            cur.execute("UPDATE tags SET status='borrowed', last_seen=%s, authorized=1, updated_at=NOW() WHERE tag_id=%s", (ts, op.tag_id))
            cur.execute("UPDATE assets SET status='borrowed', updated_at=NOW() WHERE asset_id=%s", (aid,))
            cur.execute(
                "INSERT INTO movements(asset_id,from_location_id,to_location_id,timestamp,operator,event_type) "
                "VALUES (%s,%s,%s,%s,%s,%s)",
                (aid, None, None, ts, op.borrower, "borrow"),
            )

            create_notification(
                type="borrow",
                title="มีการยืมทรัพย์สิน",
                message=f"ผู้ใช้ {op.borrower} ยืมทรัพย์สิน Asset ID {aid}",
                asset_id=aid
            )

        elif action == "return":
            aid = _get_asset_id(cur, op.tag_id)
            if not aid:
                raise HTTPException(status_code=404, detail="Tag not bound to any asset")
            
            cur.execute("UPDATE tags SET status='idle', last_seen=%s, authorized=1, updated_at=NOW() WHERE tag_id=%s", (ts, op.tag_id))
            cur.execute("UPDATE assets SET status='idle', updated_at=NOW() WHERE asset_id=%s", (aid,))
            cur.execute(
                "INSERT INTO movements(asset_id,from_location_id,to_location_id,timestamp,operator,event_type) "
                "VALUES (%s,%s,%s,%s,%s,%s)",
                (aid, None, None, ts, (op.operator or "system"), "return"),
            )

            create_notification(
                type="return",
                title="มีการคืนทรัพย์สิน",
                message=f"คืนทรัพย์สิน Asset ID {aid} เรียบร้อยแล้ว",
                asset_id=aid
            )

        elif action == "bind":
            if not op.asset_id:
                raise HTTPException(status_code=400, detail="Missing asset_id for bind operation")
            
            # เช็คว่า asset มีอยู่จริง
            cur.execute("SELECT asset_id FROM assets WHERE asset_id=%s", (op.asset_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Asset not found")

            # upsert binding
            cur.execute(
                "INSERT INTO tag_bindings(tag_id, asset_id) VALUES(%s,%s) "
                "ON DUPLICATE KEY UPDATE asset_id=VALUES(asset_id)",
                (op.tag_id, op.asset_id),
            )
            cur.execute(
                "INSERT INTO tags (tag_id, asset_id, status, last_seen, authorized, created_at) VALUES (%s,%s,'in_use',%s,1,%s) "
                "ON DUPLICATE KEY UPDATE asset_id=VALUES(asset_id), status='in_use', last_seen=VALUES(last_seen), authorized=1, updated_at=NOW()",
                (op.tag_id, op.asset_id, ts, ts)
            )
            cur.execute("UPDATE assets SET status='in_use', updated_at=NOW() WHERE asset_id=%s", (op.asset_id,))

            create_notification(
                type="scan",
                title="ผูก RFID Tag ใหม่",
                message=f"ผูก Tag {op.tag_id} เข้ากับ Asset ID {op.asset_id}",
                asset_id=op.asset_id
            )

        elif action == "unbind":
            # เช็คว่า tag มีอยู่จริง
            cur.execute("SELECT asset_id FROM tags WHERE tag_id=%s", (op.tag_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Tag not found")
            
            aid = row["asset_id"] if row and row.get("asset_id") else None

            cur.execute("DELETE FROM tag_bindings WHERE tag_id=%s", (op.tag_id,))
            cur.execute("UPDATE tags SET asset_id=NULL, status='idle', last_seen=%s, authorized=0, updated_at=NOW() WHERE tag_id=%s", (ts, op.tag_id))
            if aid:
                cur.execute("UPDATE assets SET status='idle', updated_at=NOW() WHERE asset_id=%s", (aid,))

            create_notification(
                type="scan",
                title="ยกเลิกการผูก RFID Tag",
                message=f"ยกเลิกการผูก Tag {op.tag_id}" + (f" จาก Asset ID {aid}" if aid else ""),
                asset_id=aid
            )

            # ตรวจสอบ unauthorized movement
            cur.execute("SELECT current_location_id FROM tags WHERE tag_id=%s", (op.tag_id,))
            tag_location = cur.fetchone()
            if tag_location and tag_location.get('current_location_id') == 3:  # EXIT location
                try:
                    check_unauthorized_movement(conn, cur, op.tag_id, 3, operator="System")
                except Exception as e:
                    logger.error(f"check_unauthorized_movement failed: {e}")

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported action: {action}")

        conn.commit()

        # ดึงข้อมูล tag ล่าสุดและ broadcast
        tag_obj = _get_canonical_tag(cur, op.tag_id)
        if not tag_obj:
            raise HTTPException(status_code=500, detail="Failed to load tag after operation")

        _broadcast_tag_update(tag_obj)
        return tag_obj

    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        logger.exception("tag_operation failed")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        cur.close()
        conn.close()


# ========================================
# INDIVIDUAL TAG OPERATIONS
# ========================================

@router.post("/{tag_id}/bind", response_model=Tag)
def bind_tag(tag_id: str, b: BindModel):
    """ผูก tag เข้ากับ Asset"""
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    ts = datetime.now()
    try:
        # เช็คว่า asset มีอยู่จริง
        cur.execute("SELECT asset_id FROM assets WHERE asset_id=%s", (b.asset_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Asset not found")

        # upsert binding
        cur.execute(
            "INSERT INTO tag_bindings(tag_id, asset_id) VALUES(%s,%s) "
            "ON DUPLICATE KEY UPDATE asset_id=VALUES(asset_id)",
            (tag_id, b.asset_id),
        )
        cur.execute(
            "INSERT INTO tags (tag_id, asset_id, status, last_seen, authorized, created_at) VALUES (%s,%s,'in_use',%s,1,%s) "
            "ON DUPLICATE KEY UPDATE asset_id=VALUES(asset_id), status='in_use', last_seen=VALUES(last_seen), authorized=1, updated_at=NOW()",
            (tag_id, b.asset_id, ts, ts)
        )
        cur.execute("UPDATE assets SET status='in_use', updated_at=NOW() WHERE asset_id=%s", (b.asset_id,))
        conn.commit()
        
        create_notification(
            type="scan",
            title="ผูก RFID Tag ใหม่",
            message=f"ผูก Tag {tag_id} เข้ากับ Asset ID {b.asset_id}",
            asset_id=b.asset_id
        )

        # ดึงข้อมูลล่าสุดและ broadcast
        tag_obj = _get_canonical_tag(cur, tag_id)
        if not tag_obj:
            raise HTTPException(status_code=500, detail="Failed to create/update tag")
        
        _broadcast_tag_update(tag_obj)
        return tag_obj

    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        cur.close()
        conn.close()


@router.post("/{tag_id}/unbind", response_model=Tag)
def unbind_tag(tag_id: str):
    """ยกเลิกการผูก tag กับ Asset"""
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    ts = datetime.now()
    try:
        # เช็คว่า tag มีอยู่จริง
        cur.execute("SELECT asset_id FROM tags WHERE tag_id=%s", (tag_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Tag not found")
        
        aid = row["asset_id"] if row and row.get("asset_id") else None

        cur.execute("DELETE FROM tag_bindings WHERE tag_id=%s", (tag_id,))
        cur.execute("UPDATE tags SET asset_id=NULL, status='idle', last_seen=%s, authorized=0, updated_at=NOW() WHERE tag_id=%s", (ts, tag_id))
        if aid:
            cur.execute("UPDATE assets SET status='idle', updated_at=NOW() WHERE asset_id=%s", (aid,))
        conn.commit()
        
        create_notification(
            type="scan",
            title="ยกเลิกการผูก RFID Tag",
            message=f"ยกเลิกการผูก Tag {tag_id}" + (f" จาก Asset ID {aid}" if aid else ""),
            asset_id=aid
        )

        # ตรวจสอบ unauthorized movement
        cur.execute("SELECT current_location_id FROM tags WHERE tag_id=%s", (tag_id,))
        tag_location = cur.fetchone()
        if tag_location and tag_location.get('current_location_id') == 3:  # EXIT location
            try:
                check_unauthorized_movement(conn, cur, tag_id, 3, operator="System")
            except Exception as e:
                logger.error(f"check_unauthorized_movement failed: {e}")

        # ดึงข้อมูลล่าสุดและ broadcast
        tag_obj = _get_canonical_tag(cur, tag_id)
        if not tag_obj:
            raise HTTPException(status_code=404, detail="Tag not found after unbind")
        
        _broadcast_tag_update(tag_obj)
        return tag_obj

    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        logger.exception("unbind_tag failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.post("/{tag_id}/authorize")
def set_tag_authorized(tag_id: str, payload: dict):
    """ตั้งค่าสถานะการอนุญาตของ tag"""
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        # ตรวจสอบว่า tag มีอยู่จริง
        cur.execute("SELECT tag_id, status FROM tags WHERE tag_id=%s", (tag_id,))
        tag = cur.fetchone()
        if not tag:
            raise HTTPException(status_code=404, detail="Tag not found")

        # อ่านค่า authorized จาก payload
        auth = 1 if payload.get("authorized", True) else 0

        # อัปเดตสถานะ authorized
        cur.execute("UPDATE tags SET authorized=%s, updated_at=NOW() WHERE tag_id=%s", (auth, tag_id))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Failed to update tag authorization")

        conn.commit()

        # ดึงข้อมูล tag ล่าสุดและ broadcast
        tag_obj = _get_canonical_tag(cur, tag_id)
        if tag_obj:
            _broadcast_tag_update(tag_obj)

        # สร้าง notification
        status_text = "ได้รับอนุญาต" if auth else "ยกเลิกการอนุญาต"
        try:
            create_notification(
                type="movement",
                title="เปลี่ยนสถานะการอนุญาต Tag",
                message=f"Tag {tag_id} {status_text}",
                related_id=None,
                priority="normal",
            )
        except Exception as e:
            logger.error(f"Failed to create authorization notification: {e}")

        return {
            "success": True, 
            "tag_id": tag_id, 
            "authorized": bool(auth), 
            "message": f"Tag {tag_id} {status_text}แล้ว"
        }

    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Database error in set_tag_authorized: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        cur.close()
        conn.close()


@router.post("/{tag_id}/ops", response_model=Tag)
def tag_operations(tag_id: str, op: TagOp):
    """ดำเนินการต่าง ๆ กับ tag ตาม tag_id ใน URL"""
    # แทนที่ tag_id ใน operation object ด้วย tag_id จาก URL
    op.tag_id = tag_id
    return tag_operation(op)