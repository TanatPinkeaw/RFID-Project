import logging
from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from config.database import get_db_connection  # ✅ เปลี่ยนกลับเป็น config.database
from pydantic import BaseModel
from ws_manager import manager
import asyncio
import threading
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/notifications", tags=["notifications"])

def _open_dict_cursor():
    """เปิด cursor แบบ dictionary จาก config.database"""
    conn = get_db_connection()
    # ตรวจสอบว่าเป็น MySQL หรือ SQLite
    if hasattr(conn, 'cursor'):
        # MySQL
        cur = conn.cursor(dictionary=True)
    else:
        # SQLite หรือ database อื่น
        cur = conn.cursor()
        cur.row_factory = lambda cursor, row: {
            col[0]: row[idx] for idx, col in enumerate(cursor.description)
        }
    return conn, cur

def create_notification(type: str, title: str, message: str, asset_id=None, user_id=None, location_id=None, related_id=None, priority="normal"):
    """สร้าง notification ใหม่และ broadcast ผ่าน WebSocket (Thread-safe)"""
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
                    type = "movement"

            # ป้องกัน duplicate - แก้ไข SQL สำหรับ database ที่แตกต่างกัน
            cooldown_seconds = 30 if type == "alert" else 5
            
            # ตรวจสอบประเภทของ database
            db_type = getattr(conn, 'get_server_info', lambda: 'sqlite')()
            if 'mysql' in db_type.lower() or hasattr(conn, 'get_server_info'):
                # MySQL syntax
                cur.execute("""
                    SELECT id FROM notifications
                    WHERE type = %s AND message LIKE %s AND created_at >= (NOW() - INTERVAL %s SECOND)
                    LIMIT 1
                """, (type, f"%{(message or '')[:60]}%", cooldown_seconds))
            else:
                # SQLite syntax
                cur.execute("""
                    SELECT id FROM notifications
                    WHERE type = ? AND message LIKE ? AND created_at >= datetime('now', '-' || ? || ' seconds')
                    LIMIT 1
                """, (type, f"%{(message or '')[:60]}%", cooldown_seconds))
            
            if cur.fetchone():
                logger.debug("Skipping duplicate notification insert (type=%s, msg=%s)", type, (message or "")[:60])
                return None

            # Insert notification - แก้ไข SQL สำหรับ database ที่แตกต่างกัน
            if 'mysql' in db_type.lower() or hasattr(conn, 'get_server_info'):
                # MySQL syntax
                cur.execute("""
                    INSERT INTO notifications
                    (type, title, message, asset_id, user_id, location_id, related_id, priority, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                """, (type, title, message, asset_id, user_id, location_id, related_id, priority))
            else:
                # SQLite syntax
                cur.execute("""
                    INSERT INTO notifications
                    (type, title, message, asset_id, user_id, location_id, related_id, priority, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                """, (type, title, message, asset_id, user_id, location_id, related_id, priority))
            
            conn.commit()
            notif_id = cur.lastrowid

            # อ่าน row ที่เพิ่งสร้าง สำหรับ broadcast
            if 'mysql' in db_type.lower() or hasattr(conn, 'get_server_info'):
                # MySQL syntax
                placeholder = "%s"
            else:
                # SQLite syntax
                placeholder = "?"

            cur.execute(f"""
                SELECT id as notif_id, type, title, message, asset_id, user_id, location_id, 
                       related_id, is_read, is_acknowledged, priority, created_at 
                FROM notifications WHERE id = {placeholder}
            """, (notif_id,))
            row = cur.fetchone()
            
            if row:
                # แปลง datetime สำหรับ JSON serialization
                created_at = row.get("created_at")
                if created_at:
                    if hasattr(created_at, 'isoformat'):
                        timestamp = created_at.isoformat()
                    else:
                        timestamp = str(created_at)
                else:
                    timestamp = datetime.now().isoformat()
                
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
                    "timestamp": timestamp
                }
                
                # ✅ ใช้ queue_message (thread-safe)
                try:
                    manager.queue_message(payload)
                    logger.info(f"✅ Notification queued for broadcast: {payload['type']} - {payload['title']}")
                except Exception as e:
                    logger.exception(f"❌ Failed to queue websocket broadcast: {e}")
                    
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
        "database": "config.database",  # ✅ ระบุว่าใช้ config database
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
            # ตรวจสอบ database type
            db_type = getattr(conn, 'get_server_info', lambda: 'sqlite')()
            
            # ตรวจสอบ table structure
            if 'mysql' in db_type.lower() or hasattr(conn, 'get_server_info'):
                # MySQL syntax
                cur.execute("DESCRIBE notifications")
                columns = cur.fetchall()
                column_info = [{"name": col["Field"], "type": col["Type"], "null": col["Null"]} for col in columns]
            else:
                # SQLite syntax
                cur.execute("PRAGMA table_info(notifications)")
                columns = cur.fetchall()
                column_info = [{"name": col["name"], "type": col["type"], "null": "YES" if col["notnull"] == 0 else "NO"} for col in columns]
            
            # นับจำนวนข้อมูล
            cur.execute("SELECT COUNT(*) as count FROM notifications")
            count_result = cur.fetchone()
            count = count_result['count'] if count_result else 0
            
            # ดูข้อมูล 5 รายการล่าสุด
            cur.execute("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 5")
            recent = cur.fetchall()
            
            # แปลง datetime objects เป็น string สำหรับ JSON
            for item in recent:
                if isinstance(item, dict):
                    for key, value in item.items():
                        if hasattr(value, 'isoformat'):
                            item[key] = value.isoformat()
            
            return {
                "table_exists": True,
                "database_type": db_type,
                "columns": column_info,
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
            "database_type": "unknown",
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
            
            # ตรวจสอบ database type สำหรับ placeholder
            db_type = getattr(conn, 'get_server_info', lambda: 'sqlite')()
            placeholder = "%s" if 'mysql' in db_type.lower() or hasattr(conn, 'get_server_info') else "?"

            if type and type.strip() and type.lower() != "all":
                where_conditions.append(f"type = {placeholder}")
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
                       read_at, acknowledged_at
                FROM notifications
                {where_clause}
                ORDER BY created_at DESC
                LIMIT {placeholder}
            """
            params.append(limit)
            
            cur.execute(query, params)
            results = cur.fetchall()
            
            # แปลง datetime objects เป็น string
            for result in results:
                if isinstance(result, dict):
                    for key in ['timestamp', 'read_at', 'acknowledged_at']:
                        if result.get(key) and hasattr(result[key], 'isoformat'):
                            result[key] = result[key].isoformat()
                        elif result.get(key):
                            result[key] = str(result[key])
                
                # เพิ่ม tag_id สำหรับ compatibility
                result['tag_id'] = f"NOTIF_{result['notif_id']}"
            
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
            total_result = cur.fetchone()
            total = total_result['total'] if total_result else 0
            
            # นับที่ยังไม่ acknowledge
            cur.execute("SELECT COUNT(*) as unread FROM notifications WHERE is_acknowledged = FALSE")
            unread_result = cur.fetchone()
            unread = unread_result['unread'] if unread_result else 0
            
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
            # ตรวจสอบ database type
            db_type = getattr(conn, 'get_server_info', lambda: 'sqlite')()
            placeholder = "%s" if 'mysql' in db_type.lower() or hasattr(conn, 'get_server_info') else "?"

            for i, notif in enumerate(test_notifications):
                try:
                    if 'mysql' in db_type.lower() or hasattr(conn, 'get_server_info'):
                        # MySQL syntax
                        cur.execute(f"""
                            INSERT INTO notifications 
                            (type, title, message, asset_id, user_id, location_id, related_id, priority, created_at)
                            VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, NOW())
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
                    else:
                        # SQLite syntax
                        cur.execute(f"""
                            INSERT INTO notifications 
                            (type, title, message, asset_id, user_id, location_id, related_id, priority, created_at)
                            VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, datetime('now'))
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
                    
                    # ส่ง real-time notification
                    try:
                        manager.queue_message({
                            "notif_id": cur.lastrowid,
                            "type": notif['type'],
                            "title": notif['title'],
                            "message": notif['message'],
                            "asset_id": notif.get('asset_id'),
                            "user_id": notif.get('user_id'),
                            "location_id": notif.get('location_id'),
                            "related_id": notif.get('related_id'),
                            "is_read": False,
                            "is_acknowledged": False,
                            "priority": notif.get('priority', 'normal'),
                            "timestamp": datetime.now().isoformat()
                        })
                    except Exception as ws_e:
                        logger.warning(f"Failed to send real-time notification: {ws_e}")
                        
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
            # ตรวจสอบ database type
            db_type = getattr(conn, 'get_server_info', lambda: 'sqlite')()
            placeholder = "%s" if 'mysql' in db_type.lower() or hasattr(conn, 'get_server_info') else "?"

            if 'mysql' in db_type.lower() or hasattr(conn, 'get_server_info'):
                # MySQL syntax
                cur.execute(f"""
                    UPDATE notifications 
                    SET is_read = TRUE, is_acknowledged = TRUE, 
                        read_at = COALESCE(read_at, NOW()),
                        acknowledged_at = NOW()
                    WHERE id = {placeholder} AND is_acknowledged = FALSE
                """, (notification_id,))
            else:
                # SQLite syntax
                cur.execute(f"""
                    UPDATE notifications 
                    SET is_read = 1, is_acknowledged = 1, 
                        read_at = COALESCE(read_at, datetime('now')),
                        acknowledged_at = datetime('now')
                    WHERE id = {placeholder} AND is_acknowledged = 0
                """, (notification_id,))
            
            if cur.rowcount == 0:
                cur.execute(f"SELECT id FROM notifications WHERE id = {placeholder}", (notification_id,))
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
            # ตรวจสอบ database type
            db_type = getattr(conn, 'get_server_info', lambda: 'sqlite')()
            placeholder = "%s" if 'mysql' in db_type.lower() or hasattr(conn, 'get_server_info') else "?"

            cur.execute(f"DELETE FROM notifications WHERE id = {placeholder}", (notification_id,))
            
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
            # ตรวจสอบ database type
            db_type = getattr(conn, 'get_server_info', lambda: 'sqlite')()
            
            if 'mysql' in db_type.lower() or hasattr(conn, 'get_server_info'):
                # MySQL syntax
                cur.execute("""
                    UPDATE notifications 
                    SET is_read = TRUE, is_acknowledged = TRUE, 
                        read_at = COALESCE(read_at, NOW()),
                        acknowledged_at = NOW()
                    WHERE is_acknowledged = FALSE
                """)
            else:
                # SQLite syntax
                cur.execute("""
                    UPDATE notifications 
                    SET is_read = 1, is_acknowledged = 1, 
                        read_at = COALESCE(read_at, datetime('now')),
                        acknowledged_at = datetime('now')
                    WHERE is_acknowledged = 0
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
            # ตรวจสอบ database type
            db_type = getattr(conn, 'get_server_info', lambda: 'sqlite')()
            placeholder = "%s" if 'mysql' in db_type.lower() or hasattr(conn, 'get_server_info') else "?"

            where_conditions = []
            params = []
            
            # ตรวจสอบ type parameter
            if request.type and str(request.type).strip() and str(request.type).lower() != "all":
                valid_types = ['borrow', 'return', 'movement', 'scan', 'alert', 'overdue']
                type_lower = str(request.type).lower().strip()
                
                if type_lower in valid_types:
                    where_conditions.append(f"type = {placeholder}")
                    params.append(type_lower)
                    logger.info(f"Added type filter: {type_lower}")
                else:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"ประเภทการแจ้งเตือนไม่ถูกต้อง: {request.type}"
                    )
            
            # ตรวจสอบ unread_only parameter
            if request.unread_only:
                if 'mysql' in db_type.lower() or hasattr(conn, 'get_server_info'):
                    where_conditions.append("is_acknowledged = FALSE")
                else:
                    where_conditions.append("is_acknowledged = 0")
                logger.info("Added unread_only filter")
            
            # สร้าง WHERE clause
            where_clause = ""
            if where_conditions:
                where_clause = " WHERE " + " AND ".join(where_conditions)
            
            # นับก่อนลบ
            count_query = f"SELECT COUNT(*) as count FROM notifications{where_clause}"
            cur.execute(count_query, params)
            count_result = cur.fetchone()
            count_before = count_result['count'] if count_result else 0
            
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
    
    # ✅ ใช้ queue_message แทน broadcast_json
    try:
        manager.queue_message(test_notification)
        logger.info(f"✅ Test real-time notification queued: {test_notification}")
    except Exception as e:
        logger.error(f"❌ Failed to queue test notification: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send test notification: {str(e)}")
    
    return {
        "success": True,
        "message": "ส่งข้อความทดสอบแล้ว",
        "payload": test_notification,
        "database": "config.database"  # ✅ ระบุว่าใช้ config database
    }

# เพิ่ม endpoint ทดสอบการสร้าง notification
@router.post("/create-test")
def create_test_notification():
    """สร้าง notification ทดสอบผ่าน create_notification function"""
    notif_id = create_notification(
        type="scan",
        title="🔍 ทดสอบการสร้าง Notification",
        message=f"ทดสอบเวลา {datetime.now().strftime('%H:%M:%S')}",
        asset_id=1,
        location_id=1,
        priority="normal"
    )
    
    if notif_id:
        return {
            "success": True,
            "message": f"สร้าง notification สำเร็จ ID: {notif_id}",
            "notif_id": notif_id,
            "database": "config.database"  # ✅ ระบุว่าใช้ config database
        }
    else:
        return {
            "success": False,
            "message": "ไม่สามารถสร้าง notification ได้",
            "database": "config.database"
        }

# เพิ่ม endpoint ทดสอบการเชื่อมต่อ database
@router.get("/debug/connection")
def test_database_connection():
    """ทดสอบการเชื่อมต่อ config.database"""
    try:
        conn, cur = _open_dict_cursor()
        try:
            # ทดสอบ query พื้นฐาน
            cur.execute("SELECT 1 as test")
            result = cur.fetchone()
            
            # ตรวจสอบ database type
            db_type = getattr(conn, 'get_server_info', lambda: 'sqlite')()
            
            return {
                "success": True,
                "message": "การเชื่อมต่อ config.database สำเร็จ",
                "database_type": db_type,
                "test_query": result
            }
        finally:
            cur.close()
            conn.close()
    except Exception as e:
        logger.error(f"Database connection test failed: {e}")
        return {
            "success": False,
            "message": f"การเชื่อมต่อ config.database ล้มเหลว: {str(e)}",
            "error": str(e)
        }