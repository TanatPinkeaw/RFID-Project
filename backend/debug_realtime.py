#!/usr/bin/env python3
"""
Debug Real-time WebSocket Connection
"""
import asyncio
import json
import logging
from datetime import datetime
import sys
from pathlib import Path

# เพิ่ม path
sys.path.insert(0, str(Path(__file__).parent))

from ws_manager import manager
from config.database import get_db_connection

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

async def test_websocket_manager():
    """ทดสอบ WebSocket Manager"""
    print("🔍 Testing WebSocket Manager...")
    
    # ทดสอบ broadcast without connections
    await manager.broadcast({
        "type": "test",
        "message": "Testing broadcast",
        "timestamp": datetime.now().isoformat()
    })
    
    print(f"Active connections: {manager.get_connection_count()}")
    return True

def test_database_connection():
    """ทดสอบการเชื่อมต่อฐานข้อมูล"""
    print("🔍 Testing Database Connection...")
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # ทดสอบ query
        cur.execute("SELECT COUNT(*) as count FROM tags")
        result = cur.fetchone()
        print(f"Tags count: {result}")
        
        cur.close()
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Database error: {e}")
        return False

async def simulate_real_time_data():
    """จำลองข้อมูล real-time"""
    print("🔍 Simulating real-time data...")
    
    # ทดสอบส่งข้อมูลต่าง ๆ
    test_data = [
        {
            "type": "scan_result",
            "data": {
                "tag_id": "TEST001",
                "epc": "E200001122334455",
                "location": "Test Location",
                "timestamp": datetime.now().isoformat()
            }
        },
        {
            "type": "notification",
            "data": {
                "title": "Test Alert",
                "message": "This is a test notification",
                "priority": "high"
            }
        },
        {
            "type": "asset_update",
            "data": {
                "asset_id": 1,
                "status": "active",
                "location": "Test Location"
            }
        }
    ]
    
    for data in test_data:
        print(f"Broadcasting: {data['type']}")
        await manager.broadcast(data)
        await asyncio.sleep(1)

async def main():
    """Main debug function"""
    print("🚀 Starting Real-time Debug...")
    
    # ทดสอบฐานข้อมูล
    db_ok = test_database_connection()
    
    # ทดสอบ WebSocket
    ws_ok = await test_websocket_manager()
    
    # จำลองข้อมูล
    await simulate_real_time_data()
    
    print(f"\n📊 Results:")
    print(f"Database: {'✅' if db_ok else '❌'}")
    print(f"WebSocket: {'✅' if ws_ok else '❌'}")

if __name__ == "__main__":
    asyncio.run(main())