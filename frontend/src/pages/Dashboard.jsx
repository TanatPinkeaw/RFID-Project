// filepath: c:\Users\dYflyTaxi\Desktop\RFID\frontend\src\pages\Dashboard.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

const MAX_ACTIVITIES = 50;
const WS_URL = (() => {
  const loc = window.location;
  const proto = loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${loc.hostname}:8000/ws/realtime`;
})();

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalTags: 0,
    activeTags: 0,
    pendingTags: 0,
    recentActivities: 0
  });
  const [recentActivities, setRecentActivities] = useState([]);
  const [filters, setFilters] = useState({
    type: 'all',
    date: 'all',
    user: 'all',
    status: 'all'
  });
  const [loading, setLoading] = useState(true);

  const wsRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const shouldReconnect = useRef(true);

  useEffect(() => {
    loadDashboardData();
    connectWs();
    return () => {
      shouldReconnect.current = false;
      if (wsRef.current) try { wsRef.current.close(); } catch(_) {}
    };
    // eslint-disable-next-line
  }, []);

  const refreshStats = async () => {
    try {
      const res = await api.get('/api/tags/stats');
      if (res && res.data) {
        const d = res.data;
        setStats({
          totalTags: d.totalTags ?? stats.totalTags,
          activeTags: d.totalActive ?? d.totalActive ?? d.totalInUse ?? stats.activeTags,
          pendingTags: (d.totalTags ?? 0) - (d.totalActive ?? 0),
          recentActivities: recentActivities.length
        });
      }
    } catch (err) {
      console.error('refreshStats failed', err);
    }
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      const [assetsRes, tagsRes, tagsStatsRes] = await Promise.all([
        api.get('/api/assets'),
        api.get('/api/tags'),
        api.get('/api/tags/stats')
      ]);

      const tags = tagsRes.data || [];
      const assets = assetsRes.data || [];

      setStats({
        totalTags: tags.length,
        activeTags: tags.filter(tag => tag.status === 'in_use' || tag.status === 'active').length,
        pendingTags: tags.filter(tag => tag.status === 'idle' || !tag.asset_id).length,
        recentActivities: recentActivities.length
      });

      // build initial activities based on tags + assets (most recent last_seen/updated_at)
      const activities = [
        ...tags.slice(0, 20).map(tag => ({
          id: `tag-${tag.tag_id}`,
          type: 'tag',
          action: tag.status === 'borrowed' ? 'ถูกยืม' : (tag.status === 'in_use' ? 'กำลังใช้งาน' : 'พร้อมใช้งาน'),
          item: `Tag ${tag.tag_id}`,
          detail: tag.asset_id ? `Asset ID: ${tag.asset_id}` : 'ไม่ได้ผูก Asset',
          timestamp: tag.last_seen || tag.created_at,
          status: tag.status || 'idle',
          user: 'System',
          location: tag.current_location_id || null
        })),
        ...assets.slice(0, 10).map(asset => ({
          id: `asset-${asset.asset_id}`,
          type: 'asset',
          action: asset.status === 'borrowed' ? 'ถูกยืม' : (asset.status === 'in_use' ? 'กำลังใช้งาน' : 'พร้อมใช้งาน'),
          item: asset.name,
          detail: `Type: ${asset.type}`,
          timestamp: asset.updated_at || asset.created_at,
          status: asset.status || 'idle',
          user: 'Admin',
          location: null
        }))
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, MAX_ACTIVITIES);

      setRecentActivities(activities);
      setStats(prev => ({ ...prev, recentActivities: activities.length }));

      // refresh authoritative stats if endpoint returned counts
      if (tagsStatsRes && tagsStatsRes.data) {
        const d = tagsStatsRes.data;
        setStats(prev => ({
          totalTags: d.totalTags ?? prev.totalTags,
          activeTags: d.totalActive ?? prev.activeTags,
          pendingTags: (d.totalTags ?? prev.totalTags) - (d.totalActive ?? prev.activeTags),
          recentActivities: prev.recentActivities
        }));
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Upsert activity into recentActivities (most recent first)
  const upsertActivity = useCallback((entry) => {
    if (!entry || !entry.id) return;
    setRecentActivities(prev => {
      const idx = prev.findIndex(e => e.id === entry.id);
      let next;
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...entry, timestamp: entry.timestamp || new Date().toISOString() };
        next = copy;
      } else {
        next = [entry, ...prev];
      }
      // sort by timestamp desc and cap
      next = next.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, MAX_ACTIVITIES);
      setStats(s => ({ ...s, recentActivities: next.length }));
      return next;
    });
  }, []);

  // Normalize incoming tag payload to activity entry
  const tagToActivity = (tag) => ({
    id: `tag-${tag.tag_id}`,
    type: 'tag',
    action: tag.status === 'borrowed' ? 'ถูกยืม' : (tag.status === 'in_use' ? 'กำลังใช้งาน' : 'พร้อมใช้งาน'),
    item: `Tag ${tag.tag_id}`,
    detail: tag.asset_id ? `Asset ID: ${tag.asset_id}` : 'ไม่ได้ผูก Asset',
    timestamp: tag.last_seen || tag.updated_at || new Date().toISOString(),
    status: tag.status || (tag.asset_id ? 'in_use' : 'idle'),
    user: 'System',
    location: tag.current_location_id || null
  });

  // Normalize incoming asset payload to activity entry
  const assetToActivity = (asset) => ({
    id: `asset-${asset.asset_id}`,
    type: 'asset',
    action: asset.status === 'borrowed' ? 'ถูกยืม' : (asset.status === 'in_use' ? 'กำลังใช้งาน' : 'พร้อมใช้งาน'),
    item: asset.name || `Asset ${asset.asset_id}`,
    detail: `Type: ${asset.type || 'N/A'}`,
    timestamp: asset.updated_at || asset.created_at || new Date().toISOString(),
    status: asset.status || 'idle',
    user: 'Admin',
    location: null
  });

  const connectWs = useCallback(() => {
    if (wsRef.current) return;
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      reconnectAttempts.current = 0;
      wsRef.current = ws;
      console.info('Dashboard WS connected');
    };

    ws.onmessage = async (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (!data) return;

        if (data.type === 'tag_update' && data.tag) {
          // use canonical object if present, otherwise fetch
          const t = data.tag;
          if (!t.asset_id || (!t.created_at && !t.updated_at)) {
            // fetch canonical row to ensure status/asset_id present
            try {
              const res = await api.get(`/api/tags/${encodeURIComponent(t.tag_id)}`);
              if (res && res.data) {
                upsertActivity(tagToActivity(res.data));
              }
            } catch (err) {
              console.error('Failed to fetch canonical tag in WS handler', err);
            } finally {
              refreshStats();
            }
          } else {
            upsertActivity(tagToActivity(t));
            refreshStats();
          }
          return;
        }

        if (data.type === 'asset_update' && data.asset) {
          const a = data.asset;
          upsertActivity(assetToActivity(a));
          // optionally refresh stats if needed
          refreshStats();
          return;
        }

        if (data.type === 'borrowing_update' && data.borrow) {
          const b = data.borrow;
          // represent borrow as activity; use borrow id for id
          const entry = {
            id: `borrow-${b.id}`,
            type: 'borrow',
            action: data.action === 'borrow' ? 'ถูกยืม' : 'คืนแล้ว',
            item: b.asset_name ? `${b.asset_name}` : `Tag ${b.tag_id}`,
            detail: `By ${b.borrower_name || 'unknown'}`,
            timestamp: b.borrow_date || b.return_date || new Date().toISOString(),
            status: data.action === 'borrow' ? 'borrowed' : 'returned',
            user: b.borrower_name || 'System',
            location: null
          };
          upsertActivity(entry);
          refreshStats();
          return;
        }

      } catch (e) {
        console.error('Dashboard WS parse error', e);
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
      if (!shouldReconnect.current) return;
      const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts.current));
      reconnectAttempts.current += 1;
      console.warn('Dashboard WS closed, reconnect in', delay, 'ms');
      setTimeout(connectWs, delay);
    };

    ws.onerror = (err) => {
      console.error('Dashboard WS error', err);
      try { ws.close(); } catch(_) {}
    };
  }, [upsertActivity]);

  // UI helpers (kept from original)
  const getTagAction = (status) => {
    switch (status) {
      case 'in_use': return 'กำลังใช้งาน';
      case 'borrowed': return 'ถูกยืม';
      case 'idle': return 'พร้อมใช้งาน';
      default: return 'ไม่ทราบสถานะ';
    }
  };

  const getAssetAction = (status) => {
    switch (status) {
      case 'in_use': return 'กำลังใช้งาน';
      case 'borrowed': return 'ถูกยืม';
      case 'idle': return 'พร้อมใช้งาน';
      default: return 'ไม่ทราบสถานะ';
    }
  };

  const getLocationName = (locationId) => {
    switch (locationId) {
      case 1: return 'โรงงาน';
      case 2: return 'ห้องช่าง';
      case 3: return 'นอกพื้นที่';
      default: return 'ไม่ระบุ';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'in_use': return 'bg-green-500';
      case 'borrowed': return 'bg-yellow-500';
      case 'idle': return 'bg-gray-500';
      default: return 'bg-blue-500';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'in_use': 
        return 'bg-green-100 text-green-800 border-green-200';
      case 'borrowed': 
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'idle': 
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default: 
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const quickActions = [
    { title: "จัดการ Tags", description: "ดู แก้ไข และจัดการ RFID Tags", icon: "🏷️", link: "/tags", color: "bg-blue-500 hover:bg-blue-600" },
    { title: "จัดการ Assets", description: "ดู แก้ไข และจัดการทรัพย์สิน", icon: "📦", link: "/assets", color: "bg-green-500 hover:bg-green-600" },
    { title: "ยืม-คืนทรัพย์สิน", description: "บันทึกการยืม และการคืนทรัพย์สิน", icon: "📋", link: "/borrowing", color: "bg-purple-500 hover:bg-purple-600" },
    { title: "Scanner Setup", description: "ตั้งค่าและควบคุม RFID Scanner", icon: "📡", link: "/scanner", color: "bg-orange-500 hover:bg-orange-600" }
  ];

  const filteredActivities = recentActivities.filter(activity => {
    if (filters.type !== 'all' && activity.type !== filters.type) return false;
    if (filters.status !== 'all' && activity.status !== filters.status) return false;
    if (filters.user !== 'all' && activity.user !== filters.user) return false;
    
    if (filters.date !== 'all') {
      const activityDate = new Date(activity.timestamp);
      const now = new Date();
      const diffHours = (now - activityDate) / (1000 * 60 * 60);
      switch (filters.date) {
        case 'today': if (diffHours > 24) return false; break;
        case 'week': if (diffHours > 168) return false; break;
        case 'month': if (diffHours > 720) return false; break;
      }
    }
    return true;
  });

  const typeOptions = ['all', 'tag', 'asset', 'borrow'];
  const statusOptions = ['all', 'in_use', 'borrowed', 'idle', 'returned'];
  const userOptions = ['all', 'System', 'Admin', ...Array.from(new Set(recentActivities.map(a => a.user).filter(u => u && u !== 'System' && u !== 'Admin')))];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-cyan-100 flex items-center justify-center">
        <div className="text-center bg-white/80 backdrop-blur-lg rounded-3xl p-12 shadow-2xl border border-white/20">
          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
          </div>
          <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-3">
            กำลังโหลด Dashboard
          </h3>
          <p className="text-gray-600">โปรดรอสักครู่...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-cyan-100">
      <div className="w-full h-full px-6 py-6">
      
      {/* 🎨 Beautiful Header */}
      <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-6 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5"></div>
        
        <div className="relative flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-3">
              <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">
                📊
              </div>
              <div>
                <h1 className="text-3xl font-black bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent">
                  Dashboard
                </h1>
                <p className="text-gray-600 mt-1">ระบบจัดการทรัพย์สิน RFID แบบ Real-time</p>
              </div>
            </div>
            
          
          </div>
          
          {/* Action Button */}
          <div className="flex gap-2">
            <button
              onClick={loadDashboardData}
              disabled={loading}
              className="group flex items-center gap-2 px-4 py-2 bg-white border-2 border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all duration-300 disabled:opacity-50 shadow-lg hover:shadow-xl"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
              ) : (
                <span className="text-lg group-hover:rotate-180 transition-transform duration-500">🔄</span>
              )}
              <span className="font-semibold text-sm">รีเฟรช</span>
            </button>
          </div>
        </div>
      </div>

      {/* 🎨 Beautiful Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatsCard 
          title="จำนวน TAG ทั้งหมดในระบบ" 
          value={stats.totalTags} 
          icon="🏷️" 
          color="blue" 
        />
        <StatsCard 
          title="จำนวน TAG ที่ Active" 
          value={stats.activeTags} 
          icon="✅" 
          color="green" 
        />
        <StatsCard 
          title="จำนวน TAG คงคลัง" 
          value={stats.pendingTags} 
          icon="📦" 
          color="yellow" 
        />
      </div>

      {/* 🎨 Beautiful Quick Actions */}
      <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 p-6 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-gray-500/5 to-slate-500/5"></div>
        
        <div className="relative">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-r from-gray-500 to-slate-600 rounded-xl flex items-center justify-center text-white text-xl shadow-lg">
              ⚡
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Quick Actions</h2>
              <p className="text-gray-600 text-sm">เข้าถึงฟังก์ชันหลักของระบบอย่างรวดเร็ว</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, index) => (
              <Link 
                key={index} 
                to={action.link} 
                className="group bg-white/90 backdrop-blur-lg rounded-2xl p-6 border-2 border-white/20 hover:border-gray-300 shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-gray-500/5 to-slate-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                
                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 mb-2">{action.title}</h3>
                      <p className="text-sm text-gray-600">{action.description}</p>
                    </div>
                    <div className="w-12 h-12 bg-gradient-to-r from-gray-500 to-slate-600 rounded-xl flex items-center justify-center text-white text-2xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                      {action.icon}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                    <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Go to {action.title}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* 🎨 Beautiful Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* 🎨 Beautiful Filters Panel */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-violet-600 rounded-xl flex items-center justify-center text-white text-xl shadow-lg">
                🔍
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Filters</h3>
                <p className="text-gray-600 text-sm">กรองข้อมูลกิจกรรม</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Type ของอุปกรณ์</label>
                <select 
                  value={filters.type} 
                  onChange={(e) => setFilters({...filters, type: e.target.value})} 
                  className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white shadow-lg transition-all duration-300"
                >
                  {typeOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">วัน/เดือน/ปี</label>
                <select 
                  value={filters.date} 
                  onChange={(e) => setFilters({...filters, date: e.target.value})} 
                  className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white shadow-lg transition-all duration-300"
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="today">วันนี้</option>
                  <option value="week">สัปดาห์นี้</option>
                  <option value="month">เดือนนี้</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">ผู้เก็บ</label>
                <select 
                  value={filters.user} 
                  onChange={(e) => setFilters({...filters, user: e.target.value})} 
                  className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white shadow-lg transition-all duration-300"
                >
                  {userOptions.map(user => <option key={user} value={user}>{user === 'all' ? 'ทั้งหมด' : user}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">คลัง</label>
                <select 
                  value={filters.status} 
                  onChange={(e) => setFilters({...filters, status: e.target.value})} 
                  className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white shadow-lg transition-all duration-300"
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="in_use">กำลังใช้งาน</option>
                  <option value="borrowed">ถูกยืม</option>
                  <option value="idle">คลัง</option>
                </select>
              </div>

              <button 
                onClick={() => setFilters({ type: 'all', date: 'all', user: 'all', status: 'all' })} 
                className="w-full px-4 py-3 text-sm font-bold bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl hover:from-red-600 hover:to-rose-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                🗑️ เคลียร์ฟิลเตอร์
              </button>
            </div>
          </div>
        </div>

        {/* 🎨 Beautiful Activities Panel */}
        <div className="lg:col-span-3 bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center text-white text-xl shadow-lg">
                📋
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Recent Activities</h2>
                <p className="text-gray-600 text-sm">กิจกรรมล่าสุดในระบบ Real-time</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-gray-600">
                แสดง <span className="font-bold text-cyan-600">{filteredActivities.length}</span> จาก <span className="font-bold text-gray-800">{recentActivities.length}</span> รายการ
              </span>
            </div>
          </div>
          
          <div className="p-6">
            {filteredActivities.length === 0 ? (
              <div className="text-center py-16">
                <div className="relative mx-auto mb-8 w-24 h-24">
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-600 rounded-full blur opacity-25 animate-pulse"></div>
                  <div className="relative w-24 h-24 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-white shadow-2xl">
                    <span className="text-4xl">📊</span>
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-gray-800 mb-3">ไม่มีกิจกรรมที่ตรงกับเงื่อนไข</h3>
                <p className="text-gray-600 text-lg max-w-md mx-auto leading-relaxed">
                  ลองปรับเปลี่ยนตัวกรองหรือรอกิจกรรมใหม่จากระบบ
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto custom-scrollbar">
                {filteredActivities.map((activity) => (
                  <div key={activity.id} className="group flex items-start space-x-3 p-4 rounded-2xl hover:bg-gray-50 transition-all duration-300 border-2 border-transparent hover:border-gray-200 shadow-lg hover:shadow-xl">
                    <div className={`flex-shrink-0 w-3 h-3 rounded-full mt-2 ${getStatusColor(activity.status)} shadow-lg`}></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-bold text-gray-900 mb-1">{activity.item} - {activity.action}</p>
                          <p className="text-xs text-gray-600 mb-3">{activity.detail}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border-2 ${getStatusBadge(activity.status)} shadow-lg`}>
                              {activity.status}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">
                              <span>👤</span> {activity.user}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">
                              <span>📍</span> {activity.location || 'ไม่ระบุ'}
                            </span>
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-xs font-bold text-gray-700">{new Date(activity.timestamp).toLocaleDateString('th-TH')}</p>
                          <p className="text-xs text-gray-500">{new Date(activity.timestamp).toLocaleTimeString('th-TH')}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>     
      </div>      
    </div>       
  </div>   
  );    
}

// StatsCard component ต้องอยู่ข้างนอก Dashboard
function StatsCard({ title, value, icon, color }) {
  const gradients = {
    blue: 'from-blue-500 to-purple-600',
    green: 'from-emerald-500 to-teal-600',
    yellow: 'from-amber-500 to-orange-600',
    purple: 'from-purple-500 to-violet-600'
  };

  const bgGradients = {
    blue: 'from-blue-500/5 to-purple-500/5',
    green: 'from-emerald-500/5 to-teal-500/5',
    yellow: 'from-amber-500/5 to-orange-500/5',
    purple: 'from-purple-500/5 to-violet-500/5'
  };

  return (
    <div className="group bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-4 hover:bg-white hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden">
      <div className={`absolute inset-0 bg-gradient-to-r ${bgGradients[color]} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
      <div className="relative">
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-black text-gray-800 mt-1">{value}</p>
          </div>
          <div className={`w-10 h-10 bg-gradient-to-r ${gradients[color]} rounded-xl flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform duration-300 text-xl`}>
            {icon}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
          <span className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Live Data</span>
        </div>
      </div>
    </div>
  );
}
