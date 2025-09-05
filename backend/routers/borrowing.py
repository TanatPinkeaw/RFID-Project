from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from datetime import datetime, timedelta
from config.database import get_db_connection
from pydantic import BaseModel
from routers.notifications import create_notification
from ws_manager import manager
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/borrowing", tags=["borrowing"])

EXIT_LOCATION_ID = 3

class BorrowRequest(BaseModel):
    tag_id: str
    asset_id: Optional[int] = None
    borrower_name: str
    borrower_contact: Optional[str] = None
    expected_return_days: int = 7
    notes: Optional[str] = None

class ReturnRequest(BaseModel):
    borrow_id: int
    return_location_id: Optional[int] = None
    return_notes: Optional[str] = None

def _row_to_borrow(row):
    if not row:
        return None
    
    # คำนวณ days_borrowed และ days_remaining ใหม่
    borrow_date = row.get("borrow_date")
    expected_return_date = row.get("expected_return_date")
    return_date = row.get("return_date")
    now = datetime.utcnow()
    
    if borrow_date:
        if return_date:
            # คืนแล้ว - ใช้วันที่คืนจริง
            days_borrowed = (return_date - borrow_date).days
            days_remaining = 0
            is_overdue = return_date > expected_return_date if expected_return_date else False
            overdue_days = (return_date - expected_return_date).days if is_overdue else 0
        else:
            # ยังไม่คืน - ใช้วันปัจจุบัน
            days_borrowed = (now - borrow_date).days
            days_remaining = (expected_return_date - now).days if expected_return_date else 0
            is_overdue = now > expected_return_date if expected_return_date else False
            overdue_days = (now - expected_return_date).days if is_overdue else 0
    else:
        days_borrowed = row.get("actual_days") or 0
        days_remaining = 0
        is_overdue = bool(row.get("is_overdue"))
        overdue_days = row.get("overdue_days") or 0

    return {
        "id": row["id"],
        "tag_id": row["tag_id"],
        "asset_id": row.get("asset_id"),
        "asset_name": row.get("asset_name"),
        "borrower_name": row.get("borrower_name"),
        "borrower_contact": row.get("borrower_contact"),
        "borrow_date": borrow_date,
        "expected_return_date": expected_return_date,
        "return_date": return_date,
        "expected_return_days": row.get("expected_return_days"),
        "actual_days": row.get("actual_days"),
        "days_borrowed": max(0, days_borrowed),
        "days_remaining": max(0, days_remaining),
        "is_overdue": is_overdue,
        "overdue_days": max(0, overdue_days),
        "notes": row.get("notes"),
        "return_notes": row.get("return_notes"),
        "status": row.get("status"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at")
    }

@router.post("/borrow")
def borrow_item(req: BorrowRequest):
    """ยืมทรัพย์สิน"""
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    now = datetime.utcnow()
    expected = now + timedelta(days=req.expected_return_days or 7)
    
    try:
        # ตรวจสอบว่า tag ยังไม่ถูกยืมอยู่
        cur.execute("""
            SELECT id FROM borrowing_records 
            WHERE tag_id = %s AND status = 'borrowed' AND (return_date IS NULL OR return_date = '')
        """, (req.tag_id,))
        
        existing = cur.fetchone()
        if existing:
            raise HTTPException(status_code=400, detail=f"Tag {req.tag_id} ถูกยืมอยู่แล้ว")

        # insert record
        cur.execute("""
            INSERT INTO borrowing_records
            (tag_id, asset_id, borrower_name, borrower_contact, borrow_date, expected_return_date, expected_return_days, notes, status, created_at, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'borrowed',%s,%s)
        """, (req.tag_id, req.asset_id, req.borrower_name, req.borrower_contact, now, expected, req.expected_return_days, req.notes, now, now))
        
        borrow_id = cur.lastrowid
        conn.commit()

        # fetch full record
        cur.execute("""
            SELECT br.*, a.name AS asset_name 
            FROM borrowing_records br 
            LEFT JOIN assets a ON a.asset_id=br.asset_id 
            WHERE br.id=%s
        """, (borrow_id,))
        
        row = cur.fetchone()
        borrow = _row_to_borrow(row)

        # create notification
        try:
            create_notification(
                type="borrow",
                title="มีการยืมทรัพย์สิน",
                message=f"ยืม {borrow.get('asset_name') or borrow.get('tag_id')} โดย {borrow['borrower_name']}",
                asset_id=borrow.get("asset_id"),
                location_id=None,
                related_id=borrow_id
            )
        except Exception:
            logger.exception("notification failed")

        # broadcast borrowing_update
        try:
            manager.queue_message({
                "type": "borrowing_update", 
                "action": "borrow", 
                "data": borrow,  # เปลี่ยนจาก "borrow" เป็น "data"
                "timestamp": datetime.now().isoformat()
            })
        except Exception:
            logger.exception("Failed to queue borrowing_update (borrow)")

        # broadcast tag_update
        try:
            manager.queue_message({
                "type": "tag_update",
                "data": {  # เปลี่ยนจาก "tag" เป็น "data"
                    "tag_id": borrow["tag_id"],
                    "asset_id": borrow.get("asset_id"),
                    "authorized": 1,
                    "status": "borrowed",
                    "current_location_id": None,
                    "last_seen": borrow["borrow_date"].isoformat() if hasattr(borrow["borrow_date"], 'isoformat') else str(borrow["borrow_date"])
                },
                "action": "status_change"
            })
        except Exception:
            logger.exception("Failed to queue tag_update (borrow)")

        return {
            "success": True, 
            "message": f"บันทึกการยืม {borrow.get('asset_name') or borrow['tag_id']} สำเร็จ",
            "borrow_id": borrow_id, 
            "borrow": borrow
        }
        
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.exception("borrow failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@router.post("/return")
def return_item(req: ReturnRequest):
    """คืนทรัพย์สิน"""
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    now = datetime.utcnow()
    
    try:
        # find record
        cur.execute("SELECT * FROM borrowing_records WHERE id=%s", (req.borrow_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="ไม่พบรายการยืม")
            
        if row.get("status") == "returned":
            raise HTTPException(status_code=400, detail="รายการนี้ถูกคืนแล้ว")

        # compute actual days / overdue
        borrow_date = row["borrow_date"]
        expected = row["expected_return_date"]
        actual_days = (now - borrow_date).days if borrow_date else 0
        is_overdue = 1 if (expected and now > expected) else 0
        overdue_days = (now - expected).days if is_overdue else 0

        # update record
        cur.execute("""
            UPDATE borrowing_records
            SET return_date=%s, actual_days=%s, is_overdue=%s, overdue_days=%s, 
                return_notes=%s, status='returned', updated_at=%s
            WHERE id=%s
        """, (now, actual_days, is_overdue, overdue_days, req.return_notes, now, req.borrow_id))
        
        conn.commit()

        # fetch updated record
        cur.execute("""
            SELECT br.*, a.name AS asset_name 
            FROM borrowing_records br 
            LEFT JOIN assets a ON a.asset_id=br.asset_id 
            WHERE br.id=%s
        """, (req.borrow_id,))
        
        row2 = cur.fetchone()
        borrow = _row_to_borrow(row2)

        # create notification
        try:
            create_notification(
                type="return",
                title="มีการคืนทรัพย์สิน",
                message=f"คืน {borrow.get('asset_name') or borrow['tag_id']} โดย {borrow['borrower_name']}",
                asset_id=borrow.get("asset_id"),
                location_id=req.return_location_id,
                related_id=req.borrow_id
            )
        except Exception:
            logger.exception("notification failed")

        # broadcast borrowing_update
        try:
            manager.queue_message({
                "type": "borrowing_update", 
                "action": "return", 
                "data": borrow,  # เปลี่ยนจาก "borrow" เป็น "data"
                "timestamp": datetime.now().isoformat()
            })
        except Exception:
            logger.exception("Failed to queue borrowing_update (return)")

        # broadcast tag_update
        try:
            manager.queue_message({
                "type": "tag_update",
                "data": {  # เปลี่ยนจาก "tag" เป็น "data"
                    "tag_id": borrow["tag_id"],
                    "asset_id": borrow.get("asset_id"),
                    "authorized": 0,
                    "status": "idle",
                    "current_location_id": req.return_location_id,
                    "last_seen": now.isoformat()
                },
                "action": "status_change"
            })
        except Exception:
            logger.exception("Failed to queue tag_update (return)")

        return {
            "success": True,
            "message": f"คืน {borrow.get('asset_name') or borrow['tag_id']} สำเร็จ",
            "borrow_id": req.borrow_id, 
            "borrow": borrow
        }
        
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.exception("return failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@router.get("/active")
def get_active_borrows():
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("""
            SELECT br.*, a.name as asset_name
            FROM borrowing_records br
            LEFT JOIN assets a ON br.asset_id = a.asset_id
            WHERE br.status = 'borrowed' AND (br.return_date IS NULL OR br.return_date = '')
            ORDER BY br.borrow_date DESC
        """)
        rows = cur.fetchall() or []
        return [_row_to_borrow(r) for r in rows]
    except Exception:
        logger.exception("get_active_borrows failed")
        raise HTTPException(status_code=500, detail="Failed to query active borrows")
    finally:
        cur.close()
        conn.close()

@router.get("/overdue")
def get_overdue_borrows():
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        # หา overdue โดยเช็ค expected_return_date vs now
        cur.execute("""
            SELECT br.*, a.name as asset_name
            FROM borrowing_records br
            LEFT JOIN assets a ON br.asset_id = a.asset_id
            WHERE br.status = 'borrowed' 
            AND (br.return_date IS NULL OR br.return_date = '')
            AND br.expected_return_date < NOW()
            ORDER BY br.expected_return_date ASC
        """)
        rows = cur.fetchall() or []
        return [_row_to_borrow(r) for r in rows]
    except Exception:
        logger.exception("get_overdue_borrows failed")
        raise HTTPException(status_code=500, detail="Failed to query overdue borrows")
    finally:
        cur.close()
        conn.close()

@router.get("/history")
def get_borrow_history(limit: int = Query(50, ge=1, le=1000)):
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("""
            SELECT br.*, a.name as asset_name
            FROM borrowing_records br
            LEFT JOIN assets a ON br.asset_id = a.asset_id
            ORDER BY br.borrow_date DESC
            LIMIT %s
        """, (limit,))
        rows = cur.fetchall() or []
        return [_row_to_borrow(r) for r in rows]
    except Exception:
        logger.exception("get_borrow_history failed")
        raise HTTPException(status_code=500, detail="Failed to query history")
    finally:
        cur.close()
        conn.close()

@router.get("/stats")
def get_borrowing_stats():
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        # active
        cur.execute("""
            SELECT COUNT(*) AS cnt FROM borrowing_records
            WHERE status = 'borrowed' AND (return_date IS NULL OR return_date = '')
        """)
        total_active = cur.fetchone().get("cnt", 0)

        # overdue
        cur.execute("""
            SELECT COUNT(*) AS cnt FROM borrowing_records
            WHERE status = 'borrowed' 
            AND (return_date IS NULL OR return_date = '')
            AND expected_return_date < NOW()
        """)
        total_overdue = cur.fetchone().get("cnt", 0)

        # returned
        cur.execute("""
            SELECT COUNT(*) AS cnt FROM borrowing_records
            WHERE status = 'returned' OR (return_date IS NOT NULL AND return_date != '')
        """)
        total_returned = cur.fetchone().get("cnt", 0)

        # average days
        cur.execute("""
            SELECT AVG(actual_days) AS avg_days
            FROM borrowing_records
            WHERE actual_days IS NOT NULL AND actual_days >= 0
        """)
        row = cur.fetchone() or {}
        avg_days = int(row.get("avg_days") or 0)

        return {
            "totalActive": int(total_active),
            "totalOverdue": int(total_overdue),
            "totalReturned": int(total_returned),
            "avgBorrowDays": int(avg_days)
        }
    except Exception:
        logger.exception("get_borrowing_stats failed")
        raise HTTPException(status_code=500, detail="Failed to query borrowing stats")
    finally:
        cur.close()
        conn.close()

@router.get("/tag-status/{tag_id}")
def tag_status(tag_id: str):
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        # current borrow
        cur.execute("""
            SELECT br.*, a.name as asset_name
            FROM borrowing_records br
            LEFT JOIN assets a ON br.asset_id = a.asset_id
            WHERE br.tag_id = %s AND br.status = 'borrowed' 
            AND (br.return_date IS NULL OR br.return_date = '')
            ORDER BY br.borrow_date DESC
            LIMIT 1
        """, (tag_id,))
        current_borrow = cur.fetchone()

        return {
            "current_borrow": _row_to_borrow(current_borrow) if current_borrow else None
        }
    except Exception:
        logger.exception("tag_status failed")
        raise HTTPException(status_code=500, detail="Failed to query tag status")
    finally:
        cur.close()
        conn.close()

@router.get("/locations")
def get_return_locations():
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("""
            SELECT location_id, name, description 
            FROM locations 
            WHERE location_id != %s 
            ORDER BY location_id
        """, (EXIT_LOCATION_ID,))
        return cur.fetchall()
    except Exception as e:
        logger.error(f"Error in get_return_locations: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        cur.close()
        conn.close()

@router.get("/available-tags")
def get_available_tags():
    """
    ดึงรายการ Tags ที่มี Asset และพร้อมให้ยืม
    โดยใช้ข้อมูลจาก tag_bindings และตรวจสอบสถานะการยืม
    """
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    
    try:
        # ดึง Tags ที่มี Asset และยังไม่ถูกยืมอยู่ (ปรับเงื่อนไข asset status)
        cur.execute("""
            SELECT DISTINCT
                tb.tag_id,
                tb.asset_id,
                a.name as asset_name,
                a.type as asset_type,
                l.name as location_name,
                t.current_location_id,
                t.last_seen,
                t.status as tag_status,
                a.status as asset_status
            FROM tag_bindings tb
            INNER JOIN assets a ON tb.asset_id = a.asset_id
            LEFT JOIN tags t ON tb.tag_id = t.tag_id
            LEFT JOIN locations l ON t.current_location_id = l.location_id
            LEFT JOIN borrowing_records br ON (
                tb.tag_id = br.tag_id 
                AND br.status = 'borrowed' 
                AND (br.return_date IS NULL OR br.return_date = '')
            )
            WHERE br.id IS NULL  -- ไม่มีการยืมอยู่
            AND a.status NOT IN ('maintenance', 'broken', 'disposed')  -- ไม่ใช่ status ที่ไม่สามารถยืมได้
            AND (t.status IS NULL OR t.status NOT IN ('removed', 'broken'))  -- Tag ไม่ใช่ status ที่ไม่สามารถใช้ได้
            ORDER BY a.name ASC, tb.tag_id ASC
        """)
        
        tags = cur.fetchall() or []
        logger.info(f"Available tags found: {len(tags)}")
        
        # แสดงตัวอย่างข้อมูลใน log
        if tags:
            logger.info(f"Sample available tag: {tags[0]}")
        
        # ปรับปรุงข้อมูลเพิ่มเติม
        result = []
        for tag in tags:
            result.append({
                "tag_id": tag["tag_id"],
                "asset_id": tag["asset_id"],
                "asset_name": tag["asset_name"],
                "asset_type": tag["asset_type"],
                "location_name": tag["location_name"],
                "current_location_id": tag["current_location_id"],
                "last_seen": tag["last_seen"],
                "tag_status": tag["tag_status"] or "idle",
                "asset_status": tag["asset_status"],
                "is_available": True
            })
        
        return result
        
    except Exception as e:
        logger.error(f"Error in get_available_tags: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        cur.close()
        conn.close()

# เพิ่ม debug endpoint เพื่อดูข้อมูลในตาราง
@router.get("/debug-data")
def debug_data():
    """
    Debug endpoint เพื่อดูข้อมูลในตารางต่างๆ
    """
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    
    try:
        result = {}
        
        # 1. tag_bindings
        cur.execute("SELECT * FROM tag_bindings")
        result["tag_bindings"] = cur.fetchall()
        
        # 2. assets
        cur.execute("SELECT asset_id, name, type, status FROM assets")
        result["assets"] = cur.fetchall()
        
        # 3. tags
        cur.execute("SELECT tag_id, status, current_location_id FROM tags")
        result["tags"] = cur.fetchall()
        
        # 4. borrowing_records (active)
        cur.execute("""
            SELECT tag_id, asset_id, status, borrow_date, return_date 
            FROM borrowing_records 
            WHERE status = 'borrowed' AND (return_date IS NULL OR return_date = '')
        """)
        result["active_borrows"] = cur.fetchall()
        
        # 5. JOIN result
        cur.execute("""
            SELECT tb.tag_id, tb.asset_id, a.name, a.status as asset_status
            FROM tag_bindings tb
            INNER JOIN assets a ON tb.asset_id = a.asset_id
        """)
        result["joined_data"] = cur.fetchall()
        
        return result
        
    except Exception as e:
        logger.error(f"Error in debug_data: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        cur.close()
        conn.close()