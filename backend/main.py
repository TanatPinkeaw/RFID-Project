"""
RFID Management System - Main Application
========================================

ไฟล์หลักของระบบ RFID Management System
ใช้ FastAPI เป็น web framework สำหรับสร้าง REST API

ฟีเจอร์หลัก:
- Asset Management: จัดการสินทรัพย์
- Tag Tracking: ติดตามแท็ก RFID
- Location Management: จัดการสถานที่
- Real-time Updates: อัพเดตแบบ real-time ผ่าน WebSocket
- Notification System: ระบบแจ้งเตือน
- Borrowing System: ระบบยืม-คืนสินทรัพย์

การใช้งาน:
    python main.py

หรือ:
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from config import settings
from config import get_db
import logging
import asyncio
from datetime import datetime
from fastapi.websockets import WebSocket, WebSocketDisconnect
from ws_manager import manager
import json

# นำเข้า routers ทั้งหมด - แต่ละ router จัดการ endpoint ที่เกี่ยวข้อง
from routers.users import router as users_router           # จัดการผู้ใช้และ authentication
from routers.assets import router as assets_router         # จัดการสินทรัพย์
from routers.tags import router as tags_router             # จัดการแท็ก RFID
from routers.locations import router as locations_router   # จัดการสถานที่
from routers.movements import router as movements_router   # จัดการประวัติการเคลื่อนไหว
from routers.reports import router as reports_router       # จัดการรายงาน
from routers.notifications import router as notifications_router  # จัดการการแจ้งเตือน
from routers.system_config import router as system_config_router  # จัดการการตั้งค่าระบบ
from routers.scanner_config import router as scanner_config_router  # จัดการการตั้งค่าเครื่องสแกน
from routers.scan import router as scan_router             # จัดการการสแกน RFID
from routers.borrowing import router as borrowing_router   # จัดการระบบยืม-คืน

# ตั้งค่า logging ระบบ
logging.basicConfig(
    level=getattr(logging, settings.log_level),  # ระดับการ log จาก settings
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(settings.log_file),  # บันทึกลงไฟล์
        logging.StreamHandler()                  # แสดงบน console
    ]
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    จัดการ lifecycle ของแอปพลิเคชัน
    ทำงานเมื่อ startup และ shutdown
    
    Startup: เริ่มต้นระบบ, เชื่อมต่อฐานข้อมูล, เริ่มต้นบริการต่างๆ
    Shutdown: ปิดการเชื่อมต่อ, ล้างทรัพยากร
    """
    # === STARTUP ===
    logger.info(f"🚀 RFID Management System starting up")
    logger.info(f"   Environment: {settings.environment}")
    logger.info(f"   Database: {settings.database_url}")
    logger.info(f"   Debug Mode: {settings.debug}")
    
    # TODO: เพิ่มการเริ่มต้น background tasks, database connections, etc.
    
    yield  # ระบบทำงาน
    
    # === SHUTDOWN ===
    logger.info("🛑 RFID Management System shutting down")
    # TODO: ปิดการเชื่อมต่อฐานข้อมูล, ล้างทรัพยากร

# สร้าง FastAPI application instance
app = FastAPI(
    title="RFID Management System",
    description="ระบบจัดการ RFID Scanner และ Tag Tracking สำหรับติดตามสินทรัพย์",
    version="1.0.0",
    debug=settings.debug,
    lifespan=lifespan,  # ใช้ lifespan แทน on_event (FastAPI v0.93+)
    
    # การตั้งค่า OpenAPI/Swagger
    docs_url="/docs",           # Swagger UI
    redoc_url="/redoc",         # ReDoc
    openapi_url="/openapi.json" # OpenAPI schema
)

# CORS Middleware - อนุญาตให้ frontend เรียกใช้ API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # ใน production ควรระบุ domain ที่อนุญาต เช่น ["https://mydomain.com"]
    allow_credentials=True,     # อนุญาต cookies และ credentials
    allow_methods=["*"],        # อนุญาตทุก HTTP methods (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"],        # อนุญาตทุก headers
)

# =====================
# Health Check Endpoints
# =====================

@app.get("/health")
def health_check():
    """
    Health check endpoint สำหรับตรวจสอบสถานะระบบ
    ใช้โดย load balancer, monitoring tools, หรือ DevOps
    
    Returns:
        dict: สถานะของระบบและข้อมูลเวอร์ชัน
    """
    return {
        "status": "healthy",
        "message": "RFID Management System is running",
        "timestamp": datetime.now().isoformat(),
        "environment": settings.environment,
        "version": "1.0.0"
    }

@app.get("/api/test")
def test_api():
    """
    API test endpoint สำหรับทดสอบการเชื่อมต่อ
    ใช้ทดสอบว่า API ทำงานได้ปกติ
    
    Returns:
        dict: ข้อมูลการทดสอบและ configuration
    """
    return {
        "status": "OK", 
        "message": "API is working",
        "timestamp": datetime.now().isoformat(),
        "config": {
            "environment": settings.environment,
            "debug": settings.debug,
            "database_type": "mysql" if settings.database_url.startswith("mysql") else "sqlite"
        }
    }

# ⭐ เพิ่ม WebSocket status endpoint
@app.get("/api/websocket/status")
def websocket_status():
    """
    ดูสถานะการเชื่อมต่อ WebSocket
    ใช้สำหรับตรวจสอบว่ามี client เชื่อมต่ออยู่กี่ตัว
    """
    return {
        "active_connections": manager.get_connection_count(),
        "client_info": {
            client_id: {
                "connected_at": info["connected_at"].isoformat(),
                "client_address": info["client_address"]
            }
            for client_id, info in manager.get_client_info().items()
        },
        "status": "running" if manager.get_connection_count() > 0 else "idle"
    }

# ⭐ เพิ่ม test broadcast endpoint
@app.post("/api/websocket/test-broadcast")
async def test_broadcast():
    """
    ทดสอบการส่งข้อความไปยัง WebSocket clients ทั้งหมด
    ใช้สำหรับทดสอบการทำงานของ WebSocket
    """
    if manager.get_connection_count() == 0:
        raise HTTPException(status_code=400, detail="No WebSocket connections available")
    
    test_message = {
        "type": "test_notification",
        "title": "ทดสอบระบบ",
        "message": "นี่คือข้อความทดสอบจากเซิร์ฟเวอร์",
        "timestamp": datetime.now().isoformat()
    }
    
    await manager.broadcast(test_message)
    
    return {
        "status": "success",
        "message": "Test message broadcasted",
        "sent_to_connections": manager.get_connection_count()
    }

# =====================
# API Routes Registration
# =====================

# ลงทะเบียน routers ทั้งหมด - แต่ละ router จัดการ endpoints ที่เกี่ยวข้อง
app.include_router(users_router)           # /api/users/* - จัดการผู้ใช้
app.include_router(assets_router)          # /api/assets/* - จัดการสินทรัพย์
app.include_router(tags_router)            # /api/tags/* - จัดการแท็ก RFID
app.include_router(locations_router)       # /api/locations/* - จัดการสถานที่
app.include_router(movements_router)       # /api/movements/* - จัดการการเคลื่อนไหว
app.include_router(reports_router)         # /api/reports/* - จัดการรายงาน
app.include_router(notifications_router)  # /api/notifications/* - จัดการการแจ้งเตือน
app.include_router(system_config_router)  # /api/system-config/* - จัดการการตั้งค่าระบบ
app.include_router(scanner_config_router) # /api/scanner-config/* - จัดการการตั้งค่าเครื่องสแกน
app.include_router(scan_router)           # /api/scan/* - จัดการการสแกน RFID
app.include_router(borrowing_router)      # /api/borrowing/* - จัดการระบบยืม-คืน

# =====================
# Main Endpoints
# =====================

@app.get("/")
def read_root():
    """
    Root endpoint - แสดงข้อมูลหลักของ API
    
    Returns:
        dict: ข้อมูลพื้นฐานของ API
    """
    return {
        "message": "RFID Asset Management API",
        "version": "1.0.0",
        "environment": settings.environment,
        "docs_url": "/docs",
        "health_check": "/health"
    }

# =====================
# Debug Endpoints (Development Only)
# =====================

@app.get("/debug/routes")
def list_routes():
    """
    Debug endpoint สำหรับดู available routes
    ใช้ได้เฉพาะใน development environment
    
    Returns:
        dict: รายการ routes ทั้งหมดในระบบ
    
    Raises:
        HTTPException: ถ้าไม่ใช่ development environment
    """
    if settings.environment != "development":
        raise HTTPException(status_code=404, detail="Not found")
    
    routes = []
    for route in app.routes:
        if hasattr(route, 'methods') and hasattr(route, 'path'):
            routes.append({
                "path": route.path,
                "methods": list(route.methods),
                "name": getattr(route, 'name', 'unknown')
            })
    return {"routes": routes}

# =====================
# WebSocket for Real-time Updates
# =====================

# WebSocket endpoint for real-time updates
@app.websocket("/ws/realtime")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint สำหรับการอัปเดตแบบ real-time
    
    การทำงาน:
    1. รับการเชื่อมต่อจาก client
    2. เพิ่มเข้าในรายการ active connections
    3. รอรับข้อความจาก client (optional)
    4. จัดการการตัดการเชื่อมต่อเมื่อ client ปิด
    
    Message Types ที่ส่งไปยัง client:
    - connection_established: ยืนยันการเชื่อมต่อ
    - heartbeat: สัญญาณว่าเซิร์ฟเวอร์ยังทำงาน
    - notification: การแจ้งเตือนต่างๆ
    - scan_result: ผลการสแกน RFID
    - asset_update: การอัปเดตข้อมูลสินทรัพย์
    - system_status: สถานะระบบ
    """
    client_address = websocket.client.host if websocket.client else 'unknown'
    client_id = f"client_{client_address}_{datetime.now().strftime('%H%M%S')}"
    
    try:
        # เชื่อมต่อ WebSocket
        await manager.connect(websocket, client_id)
        
        # รอรับข้อความจาก client
        while True:
            try:
                # รอรับข้อความจาก client
                data = await websocket.receive_text()
                
                # ประมวลผลข้อความจาก client (ถ้าต้องการ)
                try:
                    message = json.loads(data)
                    message_type = message.get('type', 'unknown')
                    
                    logger.debug(f"Received WebSocket message from {client_id}: {message_type}")
                    
                    # ตอบกลับข้อความ (ถ้าต้องการ)
                    if message_type == 'ping':
                        await manager.send_to_websocket(websocket, {
                            'type': 'pong',
                            'message': 'Server is alive'
                        })
                    
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON from {client_id}: {data}")
                    
            except WebSocketDisconnect:
                logger.info(f"Client {client_id} disconnected normally")
                break
            except Exception as e:
                logger.error(f"Error handling WebSocket message from {client_id}: {e}")
                await asyncio.sleep(1)  # หน่วงเวลาเล็กน้อยเพื่อป้องกัน busy loop
                
    except WebSocketDisconnect:
        logger.info(f"Client {client_id} disconnected during connection")
    except Exception as e:
        logger.error(f"WebSocket error for client {client_id}: {e}")
    finally:
        # ตัดการเชื่อมต่อ
        manager.disconnect(websocket)
        logger.info(f"WebSocket connection cleaned up for {client_id}")

# =====================
# Application Entry Point
# =====================

if __name__ == "__main__":
    """
    Entry point เมื่อรันไฟล์โดยตรง
    
    วิธีการรัน:
    1. Development: python main.py
    2. Production: uvicorn main:app --host 0.0.0.0 --port 8000
    3. With SSL: uvicorn main:app --host 0.0.0.0 --port 8000 --ssl-keyfile key.pem --ssl-certfile cert.pem
    """
    import uvicorn
    
    # ใช้ import string แทน app object เพื่อให้ reload ทำงานได้ถูกต้อง
    uvicorn.run(
        "main:app",                    # import string format
        host=settings.ws_host,         # host จาก settings
        port=settings.ws_port,         # port จาก settings
        reload=settings.debug,         # auto-reload ใน debug mode
        log_level=settings.log_level.lower()  # log level
    )