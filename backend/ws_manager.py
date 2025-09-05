"""
WebSocket Manager - Enhanced Real-time Support with Thread Safety
==============================================================
"""

import asyncio
import json
import logging
from typing import List, Dict, Any, Optional, Set
from fastapi import WebSocket
from datetime import datetime
import weakref
import threading
from fastapi.encoders import jsonable_encoder

logger = logging.getLogger(__name__)

class WebSocketManager:
    """Enhanced WebSocket Manager with better real-time support and thread safety"""
    
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.client_info: Dict[str, Dict] = {}
        self._queue: Optional[asyncio.Queue] = None
        self._bg_task: Optional[asyncio.Task] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._running = False
        self._send_timeout = 5.0  # seconds per client send
        logger.info("WebSocketManager initialized")

    async def connect(self, websocket: WebSocket, client_id: str = None):
        """เชื่อมต่อ WebSocket"""
        try:
            # Initialize queue/task on first connection using running loop
            if self._queue is None:
                self._loop = asyncio.get_running_loop()
                self._queue = asyncio.Queue()
                self._bg_task = self._loop.create_task(self._broadcast_loop())
                self._running = True
                logger.info("WebSocket background task started")
            
            await websocket.accept()
            self.active_connections.add(websocket)
            
            if not client_id:
                client_id = f"client_{len(self.active_connections)}_{datetime.now().strftime('%H%M%S')}"
            
            self.client_info[client_id] = {
                'websocket': websocket,
                'connected_at': datetime.now(),
                'client_address': websocket.client.host if websocket.client else 'unknown'
            }
            
            client_address = websocket.client.host if websocket.client else 'unknown'
            logger.info(f"WebSocket connected (client={client_address}). Total: {len(self.active_connections)}")
            
            # ส่งข้อความต้อนรับ
            await self.send_to_websocket(websocket, {
                'type': 'connection_established',
                'client_id': client_id,
                'message': 'Connected to RFID Management System',
                'server_time': datetime.now().isoformat()
            })
                
        except Exception as e:
            logger.error(f"Failed to connect WebSocket: {e}")
            if websocket in self.active_connections:
                self.active_connections.discard(websocket)

    def disconnect(self, websocket: WebSocket):
        """ตัดการเชื่อมต่อ WebSocket"""
        try:
            client = websocket.client if hasattr(websocket, "client") else None
            self.active_connections.discard(websocket)
            
            # ลบข้อมูล client
            client_id_to_remove = None
            for client_id, info in self.client_info.items():
                if info['websocket'] == websocket:
                    client_id_to_remove = client_id
                    break
            
            if client_id_to_remove:
                del self.client_info[client_id_to_remove]
            
            logger.info(f"WebSocket disconnected (client={client}). Remaining: {len(self.active_connections)}")
            
            # หยุด background task ถ้าไม่มี connection
            if len(self.active_connections) == 0:
                self._running = False
                if self._bg_task and not self._bg_task.done():
                    self._bg_task.cancel()
                logger.info("WebSocket background task stopped")
                
            # Ensure socket closed
            try:
                if hasattr(websocket, "close") and websocket.client_state:
                    asyncio.create_task(websocket.close())
            except Exception:
                pass
                
        except Exception as e:
            logger.error(f"Error during disconnect: {e}")

    async def send_to_websocket(self, websocket: WebSocket, data: Dict[Any, Any]):
        """ส่งข้อความไปยัง WebSocket เฉพาะตัว"""
        try:
            data['timestamp'] = datetime.now().isoformat()
            message = json.dumps(data, ensure_ascii=False, default=str)
            await websocket.send_text(message)
            
        except Exception as e:
            logger.error(f"Failed to send to WebSocket: {e}")
            self.disconnect(websocket)

    async def broadcast(self, data: Dict[Any, Any]):
        """ส่งข้อความไปยัง client ทั้งหมด (Async version)"""
        if not self.active_connections:
            logger.debug("No connections to broadcast to")
            return
        
        logger.debug(f"Broadcasting to {len(self.active_connections)} connections: {data.get('type', 'unknown')}")
        
        # เพิ่มเข้า queue สำหรับ background processing
        if self._queue:
            await self._queue.put(data.copy())

    def queue_message(self, payload: dict):
        """Thread-safe: schedule payload for broadcast on the manager's loop."""
        if not self._loop or not self._queue:
            logger.debug("queue_message: no running loop yet, skipping payload type=%s", 
                        payload.get("type", "<unknown>"))
            return
        try:
            self._loop.call_soon_threadsafe(self._queue.put_nowait, payload)
            logger.debug("queue_message: scheduled payload type=%s", payload.get("type", "<unknown>"))
        except Exception:
            logger.exception("Failed to schedule websocket broadcast")

    async def _broadcast_loop(self):
        """Background worker สำหรับประมวลผล messages"""
        logger.info("Background broadcast loop started")
        
        try:
            while self._running or not self._queue.empty():
                try:
                    # รอ message จาก queue
                    payload = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                    
                    try:
                        payload_type = payload.get("type") if isinstance(payload, dict) else str(type(payload))
                    except Exception:
                        payload_type = "<unknown>"
                    
                    logger.debug("ws_manager: dequeued payload type=%s", payload_type)

                    if not self.active_connections:
                        logger.debug("No WS clients, skipping broadcast (type=%s)", payload_type)
                        continue

                    # Make payload JSON-serializable
                    safe_payload = jsonable_encoder(payload)
                    text = json.dumps(safe_payload, ensure_ascii=False, separators=(",", ":"))

                    disconnected = []
                    success_count = 0
                    
                    # Send to each connection with timeout
                    for ws in list(self.active_connections):
                        client = getattr(ws, "client", None)
                        try:
                            # Protect per-client send with timeout
                            await asyncio.wait_for(ws.send_text(text), timeout=self._send_timeout)
                            success_count += 1
                        except asyncio.TimeoutError:
                            logger.warning("WS send timeout to client=%s (type=%s) -> marking disconnected", 
                                          client, payload_type)
                            disconnected.append(ws)
                        except Exception:
                            logger.exception("Error sending WS message to client=%s (type=%s). will disconnect", 
                                           client, payload_type)
                            disconnected.append(ws)

                    # Remove disconnected clients
                    for ws in disconnected:
                        self.disconnect(ws)

                    logger.info("Broadcasted payload type=%s to %d clients (%d failed)", 
                              payload_type, success_count, len(disconnected))
                    
                except asyncio.TimeoutError:
                    # Send heartbeat every 30 seconds during timeout
                    if self.active_connections:
                        await self._send_heartbeat()
                    continue
                    
                except Exception as e:
                    logger.error(f"Error in broadcast loop: {e}")
                    await asyncio.sleep(1)
                    
        except asyncio.CancelledError:
            logger.info("Background broadcast loop cancelled")
        except Exception as e:
            logger.error(f"Background broadcast loop error: {e}")
        finally:
            logger.info("Background broadcast loop stopped")

    async def _send_heartbeat(self):
        """ส่ง heartbeat"""
        heartbeat_data = {
            'type': 'heartbeat',
            'server_time': datetime.now().isoformat(),
            'active_connections': len(self.active_connections)
        }
        
        if self._queue:
            try:
                await self._queue.put(heartbeat_data)
            except Exception as e:
                logger.error(f"Failed to queue heartbeat: {e}")

    # ✅ เพิ่ม convenience methods ที่ใช้ queue_message (thread-safe)
    def broadcast_scan_result(self, scan_data: Dict[Any, Any]):
        """ส่งผลการสแกน RFID (Thread-safe)"""
        self.queue_message({
            'type': 'scan_result',
            'data': scan_data
        })

    def broadcast_notification(self, notification_data: Dict[Any, Any]):
        """ส่งการแจ้งเตือน (Thread-safe)"""
        self.queue_message(notification_data)

    def broadcast_asset_update(self, asset_data: Dict[Any, Any]):
        """ส่งการอัปเดตสินทรัพย์ (Thread-safe)"""
        self.queue_message({
            'type': 'asset_update',
            'data': asset_data
        })

    def broadcast_movement_update(self, movement_data: Dict[Any, Any]):
        """ส่งการอัปเดตการเคลื่อนไหว (Thread-safe)"""
        self.queue_message({
            'type': 'movement_update',
            'data': movement_data
        })

    def broadcast_device_status(self, device_id, status, message=""):
        """ส่ง notification เมื่อสถานะ device เปลี่ยน (Thread-safe)"""
        try:
            notification = {
                "type": "device_status",
                "title": f"📡 Device {device_id} Status",
                "message": f"Device {device_id}: {message}",
                "device_id": device_id,
                "status": status,
                "timestamp": datetime.now().isoformat(),
                "priority": "high" if status == "offline" else "normal"
            }
            self.queue_message(notification)
        except Exception as e:
            logger.error(f"Failed to broadcast device status: {e}")

    async def shutdown(self):
        """Shutdown WebSocket manager cleanly"""
        try:
            self._running = False
            
            if self._bg_task:
                self._bg_task.cancel()
                await self._bg_task
        except Exception:
            logger.exception("Error shutting down ws_manager background task")
        
        # Close active connections
        for ws in list(self.active_connections):
            try:
                await ws.close()
            except Exception:
                pass
        
        self.active_connections.clear()
        self.client_info.clear()
        logger.info("ws_manager shutdown complete")

    def get_connection_count(self) -> int:
        """จำนวน connections ปัจจุบัน"""
        return len(self.active_connections)

    def get_client_info(self) -> Dict[str, Dict]:
        """ข้อมูล clients ทั้งหมด"""
        return self.client_info.copy()

# Global instance
manager = WebSocketManager()