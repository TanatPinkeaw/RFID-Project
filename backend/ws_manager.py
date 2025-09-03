"""
WebSocket Manager - จัดการการเชื่อมต่อ WebSocket
===============================================

ไฟล์นี้จัดการการเชื่อมต่อ WebSocket สำหรับการส่งข้อมูล real-time
ไปยัง client ต่างๆ เช่น การแจ้งเตือน, สถานะการสแกน, ข้อมูลสินทรัพย์

คุณสมบัติหลัก:
- จัดการการเชื่อมต่อหลาย client พร้อมกัน
- ส่งข้อความไปยัง client ทั้งหมดหรือเฉพาะกลุ่ม
- จัดการการตัดการเชื่อมต่ออัตโนมัติ
- Background task สำหรับส่งข้อมูลตามเวลา

การใช้งาน:
- import manager จากไฟล์นี้
- ใช้ manager.broadcast() เพื่อส่งข้อความไปทุก client
- ใช้ manager.send_to_client() เพื่อส่งไปยัง client เฉพาะ
"""

import asyncio
import json
import logging
from typing import List, Dict, Any
from fastapi import WebSocket
from datetime import datetime

logger = logging.getLogger(__name__)

class WebSocketManager:
    """
    จัดการการเชื่อมต่อ WebSocket และการส่งข้อความ
    
    Attributes:
        connections (List[WebSocket]): รายการการเชื่อมต่อที่ active
        client_info (Dict): ข้อมูลเพิ่มเติมของ client แต่ละตัว
        background_task: Background task สำหรับการทำงานประจำ
    """
    
    def __init__(self):
        """
        สร้าง WebSocketManager ใหม่
        """
        self.connections: List[WebSocket] = []  # รายการการเชื่อมต่อ active
        self.client_info: Dict[str, Dict] = {}  # ข้อมูล client (key = client_id)
        self.background_task = None  # Background task instance
        logger.info("WebSocketManager initialized")

    async def connect(self, websocket: WebSocket, client_id: str = None):
        """
        เพิ่มการเชื่อมต่อ WebSocket ใหม่
        
        Args:
            websocket (WebSocket): WebSocket connection object
            client_id (str, optional): ID ของ client (auto-generate ถ้าไม่ระบุ)
        """
        try:
            # รับการเชื่อมต่อ
            await websocket.accept()
            
            # เพิ่มเข้ารายการ
            self.connections.append(websocket)
            
            # สร้าง client_id ถ้าไม่มี
            if not client_id:
                client_id = f"client_{len(self.connections)}_{datetime.now().strftime('%H%M%S')}"
            
            # เก็บข้อมูล client
            self.client_info[client_id] = {
                'websocket': websocket,
                'connected_at': datetime.now(),
                'client_address': websocket.client.host if websocket.client else 'unknown'
            }
            
            # Log การเชื่อมต่อ
            client_address = websocket.client.host if websocket.client else 'unknown'
            logger.info(f"WebSocket connected (client={client_address}). Total connections: {len(self.connections)}")
            
            # ส่งข้อความต้อนรับ
            await self.send_to_websocket(websocket, {
                'type': 'connection_established',
                'client_id': client_id,
                'message': 'Connected to RFID Management System',
                'server_time': datetime.now().isoformat()
            })
            
            # เริ่ม background task ถ้ายังไม่มี
            if not self.background_task:
                self.background_task = asyncio.create_task(self._background_task())
                logger.info("WebSocket background task started")
                
        except Exception as e:
            logger.error(f"Failed to connect WebSocket: {e}")
            if websocket in self.connections:
                self.connections.remove(websocket)

    def disconnect(self, websocket: WebSocket):
        """
        ตัดการเชื่อมต่อ WebSocket
        
        Args:
            websocket (WebSocket): WebSocket connection ที่จะตัด
        """
        try:
            # ลบจากรายการ
            if websocket in self.connections:
                self.connections.remove(websocket)
            
            # ลบจากข้อมูล client
            client_id_to_remove = None
            for client_id, info in self.client_info.items():
                if info['websocket'] == websocket:
                    client_id_to_remove = client_id
                    break
            
            if client_id_to_remove:
                del self.client_info[client_id_to_remove]
            
            # Log การตัดการเชื่อมต่อ
            logger.info(f"WebSocket disconnected. Remaining connections: {len(self.connections)}")
            
            # หยุด background task ถ้าไม่มี connection แล้ว
            if len(self.connections) == 0 and self.background_task:
                self.background_task.cancel()
                self.background_task = None
                logger.info("WebSocket background task stopped")
                
        except Exception as e:
            logger.error(f"Error during WebSocket disconnect: {e}")

    async def send_to_websocket(self, websocket: WebSocket, data: Dict[Any, Any]):
        """
        ส่งข้อความไปยัง WebSocket เฉพาะตัว
        
        Args:
            websocket (WebSocket): WebSocket ที่จะส่งข้อความไป
            data (Dict): ข้อมูลที่จะส่ง
        """
        try:
            # เพิ่ม timestamp
            data['timestamp'] = datetime.now().isoformat()
            
            # ส่งข้อความ
            await websocket.send_text(json.dumps(data, ensure_ascii=False))
            
        except Exception as e:
            logger.error(f"Failed to send message to WebSocket: {e}")
            # ลบ connection ที่เสีย
            if websocket in self.connections:
                self.disconnect(websocket)

    async def broadcast(self, data: Dict[Any, Any]):
        """
        ส่งข้อความไปยัง client ทั้งหมด
        
        Args:
            data (Dict): ข้อมูลที่จะส่งไปทุก client
        """
        if not self.connections:
            logger.debug("No WebSocket connections to broadcast to")
            return
        
        logger.debug(f"Broadcasting to {len(self.connections)} connections")
        
        # ส่งไปทุก connection
        disconnected_websockets = []
        for websocket in self.connections:
            try:
                await self.send_to_websocket(websocket, data)
            except Exception as e:
                logger.error(f"Failed to broadcast to a connection: {e}")
                disconnected_websockets.append(websocket)
        
        # ลบ connection ที่เสีย
        for websocket in disconnected_websockets:
            self.disconnect(websocket)

    async def send_notification(self, notification_data: Dict[Any, Any]):
        """
        ส่งการแจ้งเตือนไปยัง client ทั้งหมด
        
        Args:
            notification_data (Dict): ข้อมูลการแจ้งเตือน
        """
        message = {
            'type': 'notification',
            'data': notification_data
        }
        await self.broadcast(message)

    async def send_scan_result(self, scan_data: Dict[Any, Any]):
        """
        ส่งผลการสแกน RFID ไปยัง client ทั้งหมด
        
        Args:
            scan_data (Dict): ข้อมูลผลการสแกน
        """
        message = {
            'type': 'scan_result',
            'data': scan_data
        }
        await self.broadcast(message)

    async def send_asset_update(self, asset_data: Dict[Any, Any]):
        """
        ส่งการอัปเดตข้อมูลสินทรัพย์
        
        Args:
            asset_data (Dict): ข้อมูลสินทรัพย์ที่อัปเดต
        """
        message = {
            'type': 'asset_update',
            'data': asset_data
        }
        await self.broadcast(message)

    async def send_system_status(self, status_data: Dict[Any, Any]):
        """
        ส่งสถานะระบบ
        
        Args:
            status_data (Dict): ข้อมูลสถานะระบบ
        """
        message = {
            'type': 'system_status',
            'data': status_data
        }
        await self.broadcast(message)

    def get_connection_count(self) -> int:
        """
        ดึงจำนวนการเชื่อมต่อปัจจุบัน
        
        Returns:
            int: จำนวน connection ที่ active
        """
        return len(self.connections)

    def get_client_info(self) -> Dict[str, Dict]:
        """
        ดึงข้อมูล client ทั้งหมด
        
        Returns:
            Dict: ข้อมูล client ทั้งหมด
        """
        return self.client_info.copy()

    async def _background_task(self):
        """
        Background task สำหรับการทำงานประจำ
        เช่น การส่ง heartbeat, การเช็คสถานะ
        """
        logger.info("WebSocket background task started")
        
        try:
            while True:
                # ส่ง heartbeat ทุก 30 วินาที
                if self.connections:
                    heartbeat_data = {
                        'type': 'heartbeat',
                        'server_time': datetime.now().isoformat(),
                        'active_connections': len(self.connections)
                    }
                    await self.broadcast(heartbeat_data)
                
                # รอ 30 วินาที
                await asyncio.sleep(30)
                
        except asyncio.CancelledError:
            logger.info("WebSocket background task cancelled")
        except Exception as e:
            logger.error(f"Error in WebSocket background task: {e}")

# สร้าง global instance
manager = WebSocketManager()