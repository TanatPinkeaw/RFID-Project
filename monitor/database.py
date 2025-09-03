import mysql.connector
from datetime import datetime
import logging

# Database configuration
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',  # ใส่รหัสผ่านของคุณ
    'database': 'rfid_system'  # ชื่อฐานข้อมูลของคุณ
}

def get_db_connection():
    """สร้างการเชื่อมต่อฐานข้อมูล"""
    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        return connection
    except mysql.connector.Error as err:
        logging.error(f"Database connection error: {err}")
        return None

def test_database_connection():
    """ทดสอบการเชื่อมต่อฐานข้อมูล"""
    try:
        conn = get_db_connection()
        if conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            result = cursor.fetchone()
            cursor.close()
            conn.close()
            return True, "เชื่อมต่อฐานข้อมูลสำเร็จ"
    except Exception as e:
        return False, f"ไม่สามารถเชื่อมต่อฐานข้อมูลได้: {str(e)}"
    return False, "เชื่อมต่อฐานข้อมูลไม่สำเร็จ"

def get_recent_scanned_tags(limit=10):
    """ดึงข้อมูล tags ที่ถูกสแกนล่าสุด - ⭐ แก้ไขให้ใช้ข้อมูลจาก tags table"""
    conn = get_db_connection()
    if not conn:
        return []
    
    try:
        cursor = conn.cursor(dictionary=True)
        
        query = """
        SELECT 
            t.tag_id,
            t.last_seen,
            t.status,
            t.current_location_id,
            t.asset_id,
            a.name as asset_name,
            l.name as location_name
        FROM tags t
        LEFT JOIN assets a ON t.asset_id = a.asset_id
        LEFT JOIN locations l ON t.current_location_id = l.location_id
        ORDER BY t.last_seen DESC
        LIMIT %s
        """
        
        cursor.execute(query, (limit,))
        results = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        # แปลงเป็นรูปแบบที่ต้องการ
        formatted_results = []
        for row in results:
            formatted_results.append({
                'tag_id': row['tag_id'],
                'asset_name': row['asset_name'] or 'ไม่ได้ผูก',
                'last_seen': row['last_seen'],
                'status': row['status'],
                'current_location_id': row['current_location_id'],
                'location_name': row['location_name'] or f"Location {row['current_location_id']}",
                'asset_id': row['asset_id']
            })
        
        return formatted_results
        
    except Exception as e:
        logging.error(f"Error fetching recent tags: {e}")
        if conn:
            conn.close()
        return []

def get_locations():
    """ดึงรายการ locations ทั้งหมด"""
    conn = get_db_connection()
    if not conn:
        return []
    
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT location_id, name FROM locations ORDER BY location_id")
        results = cursor.fetchall()
        
        locations = []
        for row in results:
            locations.append({
                'location_id': row[0],
                'name': row[1]
            })
        
        cursor.close()
        conn.close()
        return locations
        
    except Exception as e:
        logging.error(f"Error fetching locations: {e}")
        conn.close()
        return []

def get_tag_movements(tag_id, limit=5):
    """ดึงประวัติการเคลื่อนไหวของ tag"""
    conn = get_db_connection()
    if not conn:
        return []
    
    try:
        cursor = conn.cursor()
        query = """
        SELECT 
            m.timestamp,
            m.event_type,
            m.from_location_id,
            l1.name as from_location_name,
            m.to_location_id,
            l2.name as to_location_name,
            m.operator
        FROM movements m
        LEFT JOIN locations l1 ON m.from_location_id = l1.location_id
        LEFT JOIN locations l2 ON m.to_location_id = l2.location_id
        WHERE m.tag_id = %s
        ORDER BY m.timestamp DESC
        LIMIT %s
        """
        cursor.execute(query, (tag_id, limit))
        results = cursor.fetchall()
        
        movements = []
        for row in results:
            movement = {
                'timestamp': row[0],
                'event_type': row[1],
                'from_location_id': row[2],
                'from_location_name': row[3],
                'to_location_id': row[4],
                'to_location_name': row[5],
                'operator': row[6]
            }
            movements.append(movement)
        
        cursor.close()
        conn.close()
        return movements
        
    except Exception as e:
        logging.error(f"Error fetching tag movements: {e}")
        conn.close()
        return []

def get_recent_scanned_tags_by_location(location_id, limit=10):
    """ดึงข้อมูล tags ที่เข้าออกจาก location นั้นๆ ตาม current_location_id"""
    conn = get_db_connection()
    if not conn:
        return []
    
    try:
        cursor = conn.cursor(dictionary=True)
        
        # ⭐ ดึงข้อมูลจาก tags table และแสดงการเข้าออกตาม current_location_id
        query = """
        SELECT 
            t.tag_id,
            t.last_seen,
            t.status,
            t.current_location_id,
            t.asset_id,
            a.name as asset_name,
            l.name as location_name,
            CASE 
                WHEN t.current_location_id = %s THEN 'เข้า'
                WHEN t.current_location_id = 3 THEN 'ออก'
                ELSE 'เคลื่อนไหว'
            END as movement_status
        FROM tags t
        LEFT JOIN assets a ON t.asset_id = a.asset_id
        LEFT JOIN locations l ON t.current_location_id = l.location_id
        WHERE (t.current_location_id = %s OR 
               (t.current_location_id = 3 AND %s IN (1, 2)))
        ORDER BY t.last_seen DESC
        LIMIT %s
        """
        
        cursor.execute(query, (location_id, location_id, location_id, limit))
        results = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        # ⭐ แปลงเป็นรูปแบบที่ monitor ต้องการ
        formatted_results = []
        for row in results:
            formatted_results.append({
                'tag_id': row['tag_id'],
                'asset_name': row['asset_name'] or 'ไม่ได้ผูก',
                'last_seen': row['last_seen'],
                'status': row['movement_status'],  # เข้า หรือ ออก
                'current_location_id': row['current_location_id'],
                'asset_id': row['asset_id']
            })
        
        #logging.info(f"Found {len(formatted_results)} tags for location {location_id}")
        return formatted_results
        
    except Exception as e:
        logging.error(f"Error fetching tags by location: {e}")
        if conn:
            conn.close()
        return []
