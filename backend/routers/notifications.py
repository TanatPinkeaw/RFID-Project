import logging
from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from config.database import get_db_connection  # ✅ แก้ไข import
from pydantic import BaseModel
from ws_manager import manager
import asyncio
import threading
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/notifications", tags=["notifications"])

def _open_dict_cursor():
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    return conn, cur

def create_notification(type: str, title: str, message: str, asset_id=None, user_id=None, location_id=None, related_id=None, priority="normal"):
    """สร้าง notification ใหม่และ broadcast ผ่าน WebSocket
       ป้องกันการสร้าง alert ที่ไม่เกี่ยวกับ unauthorized/overdue ด้วย heuristic
    """
    try:
        conn, cur = _open_dict_cursor()
        try:
            # หากเป็น alert ให้ตรวจสอบข้อความ / related_id ว่าเป็น unauthorized หรือ overdue เท่านั้น
            if type == "alert":
                msg_l = (message or "").lower()
                allowed_keywords = [
                    "unauthor", "unauthorized", "ไม่ได้รับอนุญาต", "ไม่รับอนุญาต",
                    "overdue", "เกินกำหนด", "เกินกำหนดคืน", "เกินกำหนด คืน", "เกินกำหนดคืน"
                ]
                if related_id is None and not any(k in msg_l for k in allowed_keywords):
                    # ไม่สร้าง alert ถ้าไม่ตรงเงื่อนไข — ปรับเป็น movement เพื่อไม่ให้หายไปเลย (optional)
                    # คุณสามารถเปลี่ยนเป็น `return None` เพื่อข้ามการสร้างได้
                    type = "movement"

            # ป้องกัน duplicate (simple): message ช่วงแรกภายใน cooldown ไม่สร้างซ้ำ
            cooldown_seconds = 30 if type == "alert" else 5
            cur.execute("""
                SELECT id FROM notifications
                WHERE type = %s AND message LIKE %s AND created_at >= (NOW() - INTERVAL %s SECOND)
                LIMIT 1
            """, (type, f"%{(message or '')[:60]}%", cooldown_seconds))
            if cur.fetchone():
                logger.debug("Skipping duplicate notification insert (type=%s, msg=%s)", type, (message or "")[:60])
                return None

            cur.execute("""
                INSERT INTO notifications
                (type, title, message, asset_id, user_id, location_id, related_id, priority, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
            """, (type, title, message, asset_id, user_id, location_id, related_id, priority))
            conn.commit()
            notif_id = cur.lastrowid

            # อ่าน row ที่เพิ่งสร้าง สำหรับ broadcast
            cur.execute("SELECT id as notif_id, type, title, message, asset_id, user_id, location_id, related_id, is_read, is_acknowledged, priority, created_at FROM notifications WHERE id = %s", (notif_id,))
            row = cur.fetchone()
            if row:
                payload = {
                    "notif_id": row.get("notif_id"),
                    "type": row.get("type"),
                    "title": row.get("title"),
                    "message": row.get("message"),
                    "asset_id": row.get("asset_id"),
                    "user_id": row.get("user_id"),
                    "location_id": row.get("location_id"),
                    "related_id": row.get("related_id"),
                    "is_read": bool(row.get("is_read")),
                    "is_acknowledged": bool(row.get("is_acknowledged")),
                    "priority": row.get("priority"),
                    "timestamp": row.get("created_at").isoformat() if row.get("created_at") else None
                }
                try:
                    manager.queue_message(payload)
                except Exception:
                    logger.exception("Failed to queue websocket broadcast")
            return notif_id
        finally:
            cur.close()
            conn.close()
    except Exception as e:
        logger.exception("create_notification failed")
        return None

@router.get("/debug/ping")
def ping_notifications():
    """ทดสอบว่า notifications router ทำงาน"""
    return {
        "message": "Notifications router is working",
        "router_prefix": "/api/notifications",
        "available_endpoints": [
            "GET /api/notifications",
            "GET /api/notifications/stats", 
            "POST /api/notifications/test-data",
            "POST /api/notifications/acknowledge-all",
            "DELETE /api/notifications/bulk-delete"
        ]
    }

@router.get("/debug/table")
def debug_table():
    """ตรวจสอบสถานะ table และแก้ไขหากจำเป็น"""
    try:
        
        conn, cur = _open_dict_cursor()
        try:
            # ตรวจสอบ table structure
            cur.execute("DESCRIBE notifications")
            columns = cur.fetchall()
            
            # นับจำนวนข้อมูล
            cur.execute("SELECT COUNT(*) as count FROM notifications")
            count = cur.fetchone()['count']
            
            # ดูข้อมูล 5 รายการล่าสุด
            cur.execute("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 5")
            recent = cur.fetchall()
            
            return {
                "table_exists": True,
                "columns": [{"name": col["Field"], "type": col["Type"], "null": col["Null"]} for col in columns],
                "total_count": count,
                "recent_notifications": recent
            }
        finally:
            cur.close()
            conn.close()
    except Exception as e:
        logger.error(f"Debug table error: {e}")
        return {
            "table_exists": False,
            "error": str(e)
        }

@router.get("")
def get_notifications(
    limit: int = Query(50, ge=1, le=100),
    type: Optional[str] = Query(None),
    unread_only: bool = Query(False)
):
    try:
        conn, cur = _open_dict_cursor()
        try:
            where_conditions = []
            params = []
            
            if type and type.strip() and type.lower() != "all":
                where_conditions.append("type = %s")
                params.append(type.lower())
            
            if unread_only:
                where_conditions.append("is_acknowledged = FALSE")
            
            where_clause = " WHERE " + " AND ".join(where_conditions) if where_conditions else ""
            
            query = f"""
                SELECT id as notif_id, type, title, message, 
                       COALESCE(asset_id, 0) as asset_id,
                       COALESCE(user_id, 0) as user_id, 
                       COALESCE(location_id, 0) as location_id,
                       COALESCE(related_id, 0) as related_id,
                       is_read, is_acknowledged, priority,
                       created_at as timestamp,
                       read_at, acknowledged_at,
                       CONCAT('NOTIF_', id) as tag_id
                FROM notifications
                {where_clause}
                ORDER BY created_at DESC
                LIMIT %s
            """
            params.append(limit)
            
            cur.execute(query, params)
            results = cur.fetchall()
            
            # แปลง datetime objects เป็น string
            for result in results:
                if result['timestamp']:
                    result['timestamp'] = result['timestamp'].isoformat()
                if result['read_at']:
                    result['read_at'] = result['read_at'].isoformat()
                if result['acknowledged_at']:
                    result['acknowledged_at'] = result['acknowledged_at'].isoformat()
            
            return results
        finally:
            cur.close()
            conn.close()
    except Exception as e:
        logger.error(f"Error in get_notifications: {e}")
        return []

@router.get("/stats")
def get_notification_stats():
    """GET /api/notifications/stats - สถิติการแจ้งเตือน"""
    try:
        conn, cur = _open_dict_cursor()
        try:
            # นับทั้งหมด
            cur.execute("SELECT COUNT(*) as total FROM notifications")
            total = cur.fetchone()['total']
            
            # นับที่ยังไม่ acknowledge
            cur.execute("SELECT COUNT(*) as unread FROM notifications WHERE is_acknowledged = FALSE")
            unread = cur.fetchone()['unread']
            
            # นับตาม type (ยังไม่ acknowledge)
            cur.execute("""
                SELECT type, COUNT(*) as count 
                FROM notifications 
                WHERE is_acknowledged = FALSE
                GROUP BY type
                ORDER BY count DESC
            """)
            by_type_unread = {row['type']: row['count'] for row in cur.fetchall()}
            
            # นับทั้งหมดตาม type
            cur.execute("""
                SELECT type, COUNT(*) as count 
                FROM notifications 
                GROUP BY type
                ORDER BY count DESC
            """)
            by_type_total = {row['type']: row['count'] for row in cur.fetchall()}
            
            return {
                "total": total,
                "unread": unread,
                "by_type": by_type_unread,
                "total_by_type": by_type_total
            }
        finally:
            cur.close()
            conn.close()
    except Exception as e:
        logger.error(f"Error getting notification stats: {e}")
        return {"total": 0, "unread": 0, "by_type": {}, "total_by_type": {}}

@router.post("/test-data")
def create_test_notifications():
    """สร้างข้อมูลทดสอบ (แบบ force create)"""
    try:
        logger.info("Starting test notifications creation...")
        
        test_notifications = [
            {
                "type": "scan", 
                "title": "🔍 การสแกนใหม่", 
                "message": "ตรวจพบ RFID Tag ใหม่ในห้องประชุม", 
                "asset_id": 1, 
                "location_id": 1,
                "priority": "normal"
            },
            {
                "type": "borrow", 
                "title": "📤 การยืมอุปกรณ์", 
                "message": "มีการยืมโน๊ตบุ๊คจากห้องไอที", 
                "asset_id": 2, 
                "user_id": 1,
                "priority": "normal"
            },
            {
                "type": "return", 
                "title": "📥 การคืนอุปกรณ์", 
                "message": "มีการคืนโปรเจคเตอร์ที่ห้องไอที", 
                "asset_id": 3, 
                "user_id": 2,
                "priority": "normal"
            },
            {
                "type": "movement", 
                "title": "🚚 การเคลื่อนย้าย", 
                "message": "ตรวจพบการเคลื่อนย้ายคอมพิวเตอร์ไปห้องใหม่", 
                "asset_id": 4, 
                "location_id": 2,
                "priority": "normal"
            },
            {
                "type": "alert", 
                "title": "⚠️ การเตือน", 
                "message": "ตรวจพบอุปกรณ์หายออกจากระบบ", 
                "asset_id": 5, 
                "location_id": 1,
                "priority": "high"
            },
            {
                "type": "overdue", 
                "title": "🚨 เกินกำหนด", 
                "message": "อุปกรณ์เกินกำหนดคืน 3 วัน", 
                "asset_id": 2, 
                "related_id": 1,
                "priority": "critical"
            }
        ]
        
        created_count = 0
        errors = []
        
        # ใช้ direct SQL แทน function เพื่อให้แน่ใจ
        conn, cur = _open_dict_cursor()
        try:
            for i, notif in enumerate(test_notifications):
                try:
                    cur.execute("""
                        INSERT INTO notifications 
                        (type, title, message, asset_id, user_id, location_id, related_id, priority, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    """, (
                        notif['type'],
                        notif['title'], 
                        notif['message'],
                        notif.get('asset_id'),
                        notif.get('user_id'),
                        notif.get('location_id'),
                        notif.get('related_id'),
                        notif.get('priority', 'normal')
                    ))
                    created_count += 1
                    logger.info(f"✅ Created test notification {i+1}: {notif['title']}")
                except Exception as e:
                    error_msg = f"❌ Error creating notification {i+1}: {str(e)}"
                    errors.append(error_msg)
                    logger.error(error_msg)
            
            conn.commit()
            
        finally:
            cur.close()
            conn.close()
        
        logger.info(f"🎉 Created {created_count} test notifications successfully")
        
        return {
            "success": True,
            "message": f"สร้างข้อมูลทดสอบ {created_count} รายการเรียบร้อยแล้ว",
            "count": created_count,
            "errors": errors if errors else None
        }
        
    except Exception as e:
        logger.error(f"❌ Error in create_test_notifications: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to create test notifications: {str(e)}")

@router.post("/{notification_id}/acknowledge")
def acknowledge_notification(notification_id: int):
    try:
        conn, cur = _open_dict_cursor()
        try:
            cur.execute("""
                UPDATE notifications 
                SET is_read = TRUE, is_acknowledged = TRUE, 
                    read_at = COALESCE(read_at, NOW()),
                    acknowledged_at = NOW()
                WHERE id = %s AND is_acknowledged = FALSE
            """, (notification_id,))
            
            if cur.rowcount == 0:
                cur.execute("SELECT id FROM notifications WHERE id = %s", (notification_id,))
                if cur.fetchone():
                    return {"message": "Notification already acknowledged"}
                else:
                    raise HTTPException(status_code=404, detail="Notification not found")
            
            conn.commit()
            return {"message": "Notification acknowledged successfully"}
        finally:
            cur.close()
            conn.close()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error acknowledging notification {notification_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to acknowledge notification: {str(e)}")

@router.delete("/{notification_id}")
def delete_notification(notification_id: int):
    try:
        conn, cur = _open_dict_cursor()
        try:
            cur.execute("DELETE FROM notifications WHERE id = %s", (notification_id,))
            
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Notification not found")
            
            conn.commit()
            return {"message": "Notification deleted successfully"}
        finally:
            cur.close()
            conn.close()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting notification {notification_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete notification: {str(e)}")

@router.post("/acknowledge-all")
def acknowledge_all_notifications():
    """ทำเครื่องหมายการแจ้งเตือนทั้งหมดเป็น acknowledged"""
    try:
        conn, cur = _open_dict_cursor()
        try:
            cur.execute("""
                UPDATE notifications 
                SET is_read = TRUE, is_acknowledged = TRUE, 
                    read_at = COALESCE(read_at, NOW()),
                    acknowledged_at = NOW()
                WHERE is_acknowledged = FALSE
            """)
            
            affected_rows = cur.rowcount
            conn.commit()
            
            return {
                "success": True,
                "message": f"อ่านการแจ้งเตือน {affected_rows} รายการเรียบร้อยแล้ว",
                "count": affected_rows
            }
        finally:
            cur.close()
            conn.close()
    except Exception as e:
        logger.error(f"Error acknowledging all notifications: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to acknowledge all notifications: {str(e)}")

# เพิ่ม model สำหรับ bulk delete request
class BulkDeleteRequest(BaseModel):
    type: Optional[str] = None
    unread_only: bool = False

@router.post("/bulk-delete")
def bulk_delete_notifications_post(request: BulkDeleteRequest):
    """ลบการแจ้งเตือนหลายรายการ (POST method)"""
    try:
        logger.info(f"Bulk delete POST request - type: '{request.type}', unread_only: {request.unread_only}")
        
        conn, cur = _open_dict_cursor()
        try:
            where_conditions = []
            params = []
            
            # ตรวจสอบ type parameter
            if request.type and str(request.type).strip() and str(request.type).lower() != "all":
                valid_types = ['borrow', 'return', 'movement', 'scan', 'alert', 'overdue']
                type_lower = str(request.type).lower().strip()
                
                if type_lower in valid_types:
                    where_conditions.append("type = %s")
                    params.append(type_lower)
                    logger.info(f"Added type filter: {type_lower}")
                else:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"ประเภทการแจ้งเตือนไม่ถูกต้อง: {request.type}"
                    )
            
            # ตรวจสอบ unread_only parameter
            if request.unread_only:
                where_conditions.append("is_acknowledged = FALSE")
                logger.info("Added unread_only filter")
            
            # สร้าง WHERE clause
            where_clause = ""
            if where_conditions:
                where_clause = " WHERE " + " AND ".join(where_conditions)
            
            # นับก่อนลบ
            count_query = f"SELECT COUNT(*) as count FROM notifications{where_clause}"
            cur.execute(count_query, params)
            count_before = cur.fetchone()['count']
            
            if count_before == 0:
                return {
                    "success": True,
                    "message": "ไม่พบการแจ้งเตือนที่จะลบ",
                    "count": 0
                }
            
            # ลบจริง
            delete_query = f"DELETE FROM notifications{where_clause}"
            cur.execute(delete_query, params)
            affected_rows = cur.rowcount
            conn.commit()
            
            # สร้างข้อความอธิบาย
            filter_desc = []
            if request.type and str(request.type).strip() and str(request.type).lower() != "all":
                filter_desc.append(f"ประเภท '{request.type}'")
            if request.unread_only:
                filter_desc.append("ที่ยังไม่อ่าน")
            
            filter_text = " (" + ", ".join(filter_desc) + ")" if filter_desc else " ทั้งหมด"
            
            logger.info(f"Successfully deleted {affected_rows} notifications{filter_text}")
            
            return {
                "success": True,
                "message": f"ลบการแจ้งเตือน {affected_rows} รายการ{filter_text} เรียบร้อยแล้ว",
                "count": affected_rows
            }
            
        finally:
            cur.close()
            conn.close()
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error bulk deleting notifications: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to bulk delete notifications: {str(e)}")

# เพิ่ม test endpoint
@router.post("/test-realtime")
async def test_realtime():
    """ทดสอบการส่ง notification แบบ real-time"""
    import random
    from datetime import datetime
    
    test_notification = {
        "notif_id": random.randint(10000, 99999),
        "type": "alert",
        "title": "🔥 ทดสอบ Real-time",
        "message": f"ข้อความทดสอบเวลา {datetime.now().strftime('%H:%M:%S')}",
        "asset_id": None,
        "user_id": None,
        "location_id": 1,
        "related_id": None,
        "is_read": False,
        "is_acknowledged": False,
        "priority": "high",
        "timestamp": datetime.now().isoformat()
    }
    
    await manager.broadcast_json(test_notification)
    
    return {
        "success": True,
        "message": "ส่งข้อความทดสอบแล้ว",
        "payload": test_notification
    }