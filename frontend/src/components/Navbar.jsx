import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../services/api';

export default function Sidebar() {
  const location = useLocation();
  const [notificationCount, setNotificationCount] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(true);

  // WebSocket refs
  const wsRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const shouldReconnect = useRef(true);

  // โหลดจำนวนการแจ้งเตือนใหม่
  const loadNotificationCount = async () => {
    try {
      const response = await api.get('/api/notifications/stats');
      setNotificationCount(response.data.unread || 0);
    } catch (error) {
      console.error('Failed to load notification count:', error);
    }
  };

  // WebSocket URL builder
  const buildWsUrl = useCallback(() => {
    const loc = window.location;
    const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${loc.hostname}:8000/ws/realtime`;
  }, []);

  // WebSocket connection
  const connectWs = useCallback(() => {
    if (wsRef.current) return;
    
    const wsUrl = buildWsUrl();
    console.info('[Navbar] Connecting WS ->', wsUrl);
    
    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      console.error('[Navbar] WebSocket construction failed', e);
      const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts.current));
      reconnectAttempts.current += 1;
      setTimeout(() => connectWs(), delay);
      return;
    }

    ws.onopen = () => {
      console.info('[Navbar] WS connected');
      reconnectAttempts.current = 0;
      wsRef.current = ws;
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // อัปเดตเมื่อมี notification ใหม่หรือมีการเปลี่ยนแปลงสถานะ
        if (data && (
          data.notif_id || 
          data.id || 
          data.type === 'notification_update' ||
          data.type === 'tag_update' ||
          data.type === 'asset_update' ||
          data.type === 'borrowing_update'
        )) {
          // รีเฟรชจำนวนการแจ้งเตือนเมื่อมีการเปลี่ยนแปลง
          await loadNotificationCount();
          console.debug('[Navbar] Notification count refreshed via WS');
        }
      } catch (e) {
        console.error('[Navbar] WS message parse error', e);
      }
    };

    ws.onclose = (ev) => {
      if (wsRef.current === ws) wsRef.current = null;
      if (!shouldReconnect.current) return;
      
      const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts.current));
      reconnectAttempts.current += 1;
      console.warn('[Navbar] WS closed, reconnect in', delay, 'ms', ev);
      setTimeout(() => connectWs(), delay);
    };

    ws.onerror = (err) => {
      console.error('[Navbar] WS error', err);
      try { 
        ws.close(); 
      } catch (_) {}
    };
  }, [buildWsUrl]);

  useEffect(() => {
    // โหลดข้อมูลครั้งแรก
    loadNotificationCount();
    
    // เชื่อมต่อ WebSocket
    connectWs();
    
    // fallback: รีเฟรชทุก 5 นาที (กรณี WS ขัดข้อง)
    const interval = setInterval(loadNotificationCount, 300000); // 5 minutes
    
    return () => {
      shouldReconnect.current = false;
      clearInterval(interval);
      if (wsRef.current) {
        try { 
          wsRef.current.close(); 
        } catch (_) {}
      }
    };
  }, [connectWs]);

  const menuItems = [
    { 
      name: 'Dashboard', 
      href: '/dashboard', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: 'blue'
    },
    { 
      name: 'Assets', 
      href: '/assets', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
      color: 'emerald'
    },
    { 
      name: 'Tags', 
      href: '/tags', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      ),
      color: 'orange'
    },
    { 
      name: 'Borrowing', 
      href: '/borrowing', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      color: 'cyan'
    },
    { 
      name: 'Scanner', 
      href: '/scanner', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14h8" />
        </svg>
      ),
      color: 'violet'
    },
    { 
      name: 'การแจ้งเตือน', 
      href: '/notifications', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.021 15.493l.99-.099L5 15.415v-2.83A8 8 0 0113 4.584a8 8 0 018 8.001v2.83l-.01-.021-.99.099a.992.992 0 00-.99.99H4.021z" />
        </svg>
      ),
      color: 'pink',
      badge: notificationCount > 0 ? notificationCount : null
    }
  ];

  const isActive = (href) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
  };

  const getColorClasses = (color, isActive = false) => {
    const colors = {
      blue: isActive ? 'bg-blue-100 text-blue-700 border-blue-200' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600',
      emerald: isActive ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'text-gray-600 hover:bg-emerald-50 hover:text-emerald-600',
      orange: isActive ? 'bg-orange-100 text-orange-700 border-orange-200' : 'text-gray-600 hover:bg-orange-50 hover:text-orange-600',
      cyan: isActive ? 'bg-cyan-100 text-cyan-700 border-cyan-200' : 'text-gray-600 hover:bg-cyan-50 hover:text-cyan-600',
      violet: isActive ? 'bg-violet-100 text-violet-700 border-violet-200' : 'text-gray-600 hover:bg-violet-50 hover:text-violet-600',
      pink: isActive ? 'bg-pink-100 text-pink-700 border-pink-200' : 'text-gray-600 hover:bg-pink-50 hover:text-pink-600'
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className={`fixed top-0 left-0 h-full bg-white border-r border-gray-200 shadow-lg transition-all duration-300 ease-in-out z-50 ${
      isCollapsed ? 'w-16' : 'w-64'
    }`}>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          {!isCollapsed && (
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-sm">
                📡
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">RFID System</h1>
                <p className="text-xs text-gray-500">Management Portal</p>
              </div>
            </div>
          )}
          
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800 transition-all duration-200"
          >
            {isCollapsed ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            )}
          </button>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={`group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 border ${
                isActive(item.href)
                  ? `${getColorClasses(item.color, true)} shadow-sm`
                  : `${getColorClasses(item.color)} border-transparent hover:border-gray-200`
              }`}
              title={isCollapsed ? item.name : ''}
            >
              {/* Icon */}
              <div className="flex-shrink-0">
                {item.icon}
              </div>
              
              {!isCollapsed && (
                <div className="flex-1 flex items-center justify-between ml-3">
                  <span>{item.name}</span>
                  
                  {/* Badge */}
                  {item.badge && (
                    <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
              )}

              {/* Badge สำหรับ collapsed mode */}
              {isCollapsed && item.badge && (
                <span className="absolute top-1 right-1 inline-flex items-center justify-center w-4 h-4 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* WebSocket Status */}
        <div className="px-3 py-2 border-t border-gray-200">
          <div className={`flex items-center justify-center space-x-2 px-2 py-1.5 rounded-lg text-xs font-medium ${
            wsRef.current 
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              wsRef.current ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            
            {!isCollapsed && (
              <span>
                {wsRef.current ? 'Connected' : 'Disconnected'}
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        {!isCollapsed && (
          <div className="px-3 py-2 border-t border-gray-200">
            <div className="text-center">
              <p className="text-xs font-medium text-gray-900">RFID Management</p>
              <p className="text-xs text-gray-500">System v2.0</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}