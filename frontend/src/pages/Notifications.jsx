import { useState, useEffect, useRef, useCallback } from "react";
import api, { BASE_URL } from "../services/api";

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [stats, setStats] = useState({ total: 0, unread: 0, by_type: {}, total_by_type: {} });
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const wsRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const shouldReconnect = useRef(true);

  // helper: normalize one item from backend -> frontend shape the UI expects
  const normalize = (item) => {
    if (!item) return null;
    const notif_id = item.notif_id ?? item.id ?? item.ID ?? null;
    const timestamp = item.timestamp ?? item.created_at ?? item.createdAt ?? null;
    const is_acknowledged = item.is_acknowledged === true || item.is_acknowledged === 1 || item.is_acknowledged === "1";
    const is_read = item.is_read === true || item.is_read === 1 || item.is_read === "1";
    
    const normalized = {
      ...item,
      notif_id,
      timestamp,
      is_acknowledged,
      is_read,
      asset_id: item.asset_id ?? 0,
      user_id: item.user_id ?? 0,
      location_id: item.location_id ?? 0,
      type: item.type ?? "scan",
    };
    
    console.debug("🔧 Normalized notification:", { original: item, normalized });
    return normalized;
  };

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter === "unread") params.append("unread_only", "true");
      if (typeFilter !== "all" && typeFilter !== "alert") params.append("type", typeFilter);
      const q = params.toString();
      
      console.debug(`[Notifications] loadNotifications with filters: filter=${filter}, typeFilter=${typeFilter}`);
      
      const [notifsRes, statsRes] = await Promise.all([
        api.get(`/api/notifications${q ? `?${q}` : ""}`),
        api.get("/api/notifications/stats"),
      ]);

      const raw = Array.isArray(notifsRes.data) ? notifsRes.data : [];
      let normalized = raw.map(normalize).filter(Boolean);

      if (typeFilter === "alert") {
        normalized = normalized.filter((it) => (it.type === "alert" || it.type === "overdue"));
      }

      normalized = normalized.filter(matchesFilters);

      console.debug(`[Notifications] loadNotifications -> got ${normalized.length} items, keeping filters: filter=${filter}, typeFilter=${typeFilter}`);
      setNotifications(normalized);
      setStats(statsRes.data || { total: 0, unread: 0, by_type: {}, total_by_type: {} });
    } catch (e) {
      console.error("loadNotifications failed", e);
    } finally {
      setLoading(false);
    }
  };

  const buildWsUrl = () => {
    const base = (api?.defaults?.baseURL) || BASE_URL || window.location.origin;
    try {
      const isSecure = base.startsWith("https");
      const host = base.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const proto = isSecure ? "wss" : "ws";
      return `${proto}://${host}/ws/realtime`;
    } catch (e) {
      return "ws://localhost:8000/ws/realtime";
    }
  };

  const filterRef = useRef(filter);
  const typeFilterRef = useRef(typeFilter);

  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  useEffect(() => {
    typeFilterRef.current = typeFilter;
  }, [typeFilter]);

  const matchesFiltersWithState = (item, currentFilter, currentTypeFilter) => {
    if (!item) return false;
    
    if (currentFilter === "unread" && (item.is_read || item.is_acknowledged)) {
      console.debug("❌ matchesFilters: rejected by unread filter", { item, filter: currentFilter });
      return false;
    }
    
    if (currentTypeFilter === "all") {
      console.debug("✅ matchesFilters: passed (typeFilter=all)", { item, typeFilter: currentTypeFilter });
      return true;
    }
    
    if (currentTypeFilter === "alert") {
      const matches = item.type === "alert" || item.type === "overdue";
      console.debug(matches ? "✅" : "❌", "matchesFilters: alert filter", { item, typeFilter: currentTypeFilter, matches });
      return matches;
    }
    
    const matches = item.type === currentTypeFilter;
    console.debug(matches ? "✅" : "❌", "matchesFilters: type filter", { item, typeFilter: currentTypeFilter, matches });
    return matches;
  };

  const matchesFilters = (item) => {
    return matchesFiltersWithState(item, filter, typeFilter);
  };

  const connectWebSocket = useCallback(() => {
    if (wsRef.current) return;
    const wsUrl = buildWsUrl();
    console.info("Connecting WS ->", wsUrl);
    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      console.error("WebSocket construction failed", e);
      const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts.current));
      reconnectAttempts.current += 1;
      setTimeout(() => connectWebSocket(), delay);
      return;
    }

    ws.onopen = () => {
      console.info("WS open:", wsUrl);
      reconnectAttempts.current = 0;
      wsRef.current = ws;
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("🔥 WS received:", data);

        const refreshStatsOnly = async () => {
          try {
            const statsRes = await api.get("/api/notifications/stats");
            setStats(statsRes.data);
            console.debug("📊 Stats refreshed:", statsRes.data);
          } catch (e) {
            console.error("refresh stats failed", e);
          }
        };

        if (data && (data.notif_id || data.id)) {
          const item = normalize(data);
          console.debug("🔄 Processing notification item:", item);
          
          const currentFilter = filterRef.current;
          const currentTypeFilter = typeFilterRef.current;
          console.debug("🎯 Current filters from refs:", { filter: currentFilter, typeFilter: currentTypeFilter });

          await refreshStatsOnly();

          const shouldShow = matchesFiltersWithState(item, currentFilter, currentTypeFilter);
          
          if (shouldShow) {
            console.debug("✅ Adding notification to visible list");
            setNotifications((prev) => {
              if (prev.some((n) => n.notif_id === item.notif_id)) {
                console.debug("⚠️ Notification already exists, skipping");
                return prev;
              }
              console.debug("➕ Prepending notification to list");
              return [item, ...prev];
            });
          } else {
            console.debug("❌ Notification filtered out, not adding to visible list");
          }
          return;
        }

        if (data && data.type === "movement" && !data.notif_id) {
          console.debug("🚶 Received standalone movement event:", data);
          
          const movementNotification = {
            notif_id: `movement-${Date.now()}`,
            type: "movement",
            title: data.title || "🚚 การเคลื่อนย้าย Tag",
            message: data.message || `Tag ${data.tag_id} เคลื่อนย้าย`,
            asset_id: data.asset_id || null,
            user_id: null,
            location_id: data.to_location_id || data.location_id,
            related_id: null,
            is_read: false,
            is_acknowledged: false,
            priority: "normal",
            timestamp: new Date().toISOString()
          };

          const item = normalize(movementNotification);
          const currentFilter = filterRef.current;
          const currentTypeFilter = typeFilterRef.current;

          await refreshStatsOnly();

          const shouldShow = matchesFiltersWithState(item, currentFilter, currentTypeFilter);
          
          if (shouldShow) {
            console.debug("✅ Adding movement notification to visible list");
            setNotifications((prev) => [item, ...prev]);
          }
          return;
        }
        
      } catch (e) {
        console.error("WS onmessage parse error", e);
      }
    };

    ws.onclose = (ev) => {
      if (wsRef.current === ws) wsRef.current = null;
      if (!shouldReconnect.current) return;
      const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts.current));
      reconnectAttempts.current += 1;
      console.warn("WS closed, reconnect in", delay, "ms", ev);
      setTimeout(() => connectWebSocket(), delay);
    };

    ws.onerror = (err) => {
      console.error("WS error", err);
      try { ws.close(); } catch (_) {}
    };
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [filter, typeFilter]);

  useEffect(() => {
    shouldReconnect.current = true;
    connectWebSocket();
    return () => {
      shouldReconnect.current = false;
      try { if (wsRef.current) wsRef.current.close(); } catch (_) {}
      wsRef.current = null;
    };
  }, [connectWebSocket]);

  const handleAcknowledgeAll = async () => {
    if (!stats.unread || stats.unread === 0) {
      alert("ไม่มีการแจ้งเตือนที่ยังไม่ได้อ่าน");
      return;
    }

    if (confirm(`คุณแน่ใจว่าต้องการทำเครื่องหมายการแจ้งเตือนทั้งหมด ${stats.unread} รายการเป็น "อ่านแล้ว"?`)) {
      try {
        setLoading(true);
        const response = await api.post('/api/notifications/acknowledge-all');
        alert(`✅ ${response.data.message}`);
        await loadNotifications();
      } catch (error) {
        console.error("Failed to acknowledge all notifications:", error);
        alert(`❌ เกิดข้อผิดพลาดในการอ่านการแจ้งเตือนทั้งหมด: ${error.response?.data?.detail || error.message}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDeleteAll = async () => {
    if (!notifications || notifications.length === 0) {
      alert("ไม่มีการแจ้งเตือนให้ลบ");
      return;
    }

    const filterText = [];
    if (typeFilter !== "all") filterText.push(`ประเภท "${getTypeLabel(typeFilter)}"`);
    if (filter === "unread") filterText.push("ที่ยังไม่อ่าน");

    const filterDescription = filterText.length > 0 ? ` (${filterText.join(", ")})` : " ทั้งหมด";

    if (confirm(`คุณแน่ใจว่าต้องการลบการแจ้งเตือน ${notifications.length} รายการ${filterDescription}?`)) {
      try {
        setLoading(true);

        const deleteData = {};
        if (filter === "unread") {
          deleteData.unread_only = true;
        }
        if (typeFilter && typeFilter !== "all") {
          deleteData.type = typeFilter;
        }

        const response = await api.post('/api/notifications/bulk-delete', deleteData);
        alert(`✅ ${response.data.message}`);
        await loadNotifications();
      } catch (error) {
        console.error("Failed to delete all notifications:", error);
        alert(`❌ เกิดข้อผิดพลาดในการลบการแจ้งเตือน: ${error.response?.data?.detail || error.message}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const getTypeIcon = (type) => {
    const icons = {
      borrow: "📤",
      return: "📥", 
      movement: "🚚",
      scan: "📡",
      alert: "⚠️",
      overdue: "🔴",
      device_disconnected: "🔌" // เพิ่มสำหรับ device disconnect notification
    };
    return icons[type] || "📄";
  };

  const getTypeColor = (type) => {
    const colors = {
      borrow: "blue",
      return: "emerald",
      movement: "amber",
      scan: "purple",
      alert: "red",
      overdue: "red",
    };
    return colors[type] || "gray";
  };

  const getTypeLabel = (type) => {
    const labels = {
      borrow: "การยืม",
      return: "การคืน",
      movement: "การเคลื่อนย้าย",
      scan: "การสแกน",
      alert: "เตือน",
      overdue: "เตือน",
    };
    return labels[type] || type;
  };

  const handleStatsCardClick = (type) => {
    setTypeFilter(type === "all" ? "all" : type);
    setFilter("all");
  };

  const handleAcknowledge = async (notif_id) => {
    if (!notif_id) return;
    setLoading(true);
    try {
      await api.post(`/api/notifications/${notif_id}/acknowledge`);
      await loadNotifications();
    } catch (e) {
      console.error("Acknowledge failed", e);
      alert("ไม่สามารถรับทราบการแจ้งเตือนได้");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (notif_id) => {
    if (!notif_id) return;
    if (!confirm("แน่ใจหรือไม่ที่จะลบการแจ้งเตือนนี้?")) return;
    setLoading(true);
    try {
      await api.delete(`/api/notifications/${notif_id}`);
      await loadNotifications();
    } catch (e) {
      console.error("Delete failed", e);
      alert("ไม่สามารถลบการแจ้งเตือนได้");
    } finally {
      setLoading(false);
    }
  };

  if (loading && notifications.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-cyan-100 flex items-center justify-center">
        <div className="text-center bg-white/80 backdrop-blur-lg rounded-3xl p-12 shadow-2xl border border-white/20">
          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-pink-500 to-rose-600 rounded-full flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
          </div>
          <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-3">
            กำลังโหลดการแจ้งเตือน
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
          <div className="absolute inset-0 bg-gradient-to-r from-pink-500/5 to-rose-500/5"></div>
          
          <div className="relative flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-3">
                {/* Header Icon */}
                <div className="w-14 h-14 bg-gradient-to-r from-pink-500 to-rose-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">
                  🔔
                </div>
                <div>
                  <h1 className="text-3xl font-black bg-gradient-to-r from-pink-600 via-rose-600 to-red-600 bg-clip-text text-transparent">
                    การแจ้งเตือน
                  </h1>
                  <p className="text-gray-600 mt-1">รายการแจ้งเตือนของระบบ Real-time</p>
                </div>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={loadNotifications}
                disabled={loading}
                className="group flex items-center gap-2 px-4 py-2 bg-white border-2 border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all duration-300 disabled:opacity-50 shine-effect shadow-lg hover:shadow-xl"
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 mb-6">
          <StatsCard 
            title="ทั้งหมด"
            value={stats.total}
            icon="📊"
            gradient="from-blue-500 to-purple-600"
            bgGradient="from-blue-500/5 to-purple-500/5"
            onClick={() => handleStatsCardClick("all")}
            isActive={typeFilter === "all"}
          />

          <StatsCard 
            title="ยังไม่อ่าน"
            value={stats.unread}
            icon="🔔"
            gradient="from-red-500 to-pink-600"
            bgGradient="from-red-500/5 to-pink-500/5"
            onClick={() => { setFilter("unread"); setTypeFilter("all"); }}
            isActive={filter === "unread" && typeFilter === "all"}
          />

          {['borrow', 'return', 'movement', 'scan', 'alert'].map((type) => (
            <StatsCard
              key={type}
              title={getTypeLabel(type)}
              value={stats.total_by_type?.[type] || 0}
              icon={getTypeIcon(type)}
              gradient={`from-${getTypeColor(type)}-500 to-${getTypeColor(type)}-600`}
              bgGradient={`from-${getTypeColor(type)}-500/5 to-${getTypeColor(type)}-500/5`}
              onClick={() => handleStatsCardClick(type)}
              isActive={typeFilter === type}
            />
          ))}
        </div>

        {/* 🎨 Beautiful Filter Tabs */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 mb-6 overflow-hidden">
          <div className="border-b border-gray-200">
            <div className="flex justify-between items-center px-6">
              <nav className="flex space-x-8">
                <button
                  onClick={() => setFilter("all")}
                  className={`py-4 px-2 border-b-3 font-medium text-sm flex items-center gap-3 transition-all ${
                    filter === "all"
                      ? "border-pink-500 text-pink-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div>
                    <p className="font-semibold">ทั้งหมด</p>
                    <p className="text-xs opacity-75">({stats.total})</p>
                  </div>
                </button>
                <button
                  onClick={() => setFilter("unread")}
                  className={`py-4 px-2 border-b-3 font-medium text-sm flex items-center gap-3 transition-all ${
                    filter === "unread"
                      ? "border-red-500 text-red-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.021 15.493l.99-.099L5 15.415v-2.83A8 8 0 0113 4.584a8 8 0 018 8.001v2.83l-.01-.021-.99.099a.992.992 0 00-.99.99H4.021z" />
                  </svg>
                  <div>
                    <p className="font-semibold">ยังไม่อ่าน</p>
                    <p className="text-xs opacity-75">({stats.unread})</p>
                  </div>
                </button>
              </nav>

              {/* Action Buttons */}
              <div className="flex items-center space-x-3 py-4">
                {typeFilter !== "all" && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-pink-100 text-pink-800 border border-pink-200">
                    {getTypeLabel(typeFilter)}
                    <button 
                      onClick={() => setTypeFilter("all")}
                      className="ml-2 text-pink-600 hover:text-pink-800 font-bold"
                    >
                      ×
                    </button>
                  </span>
                )}

                {stats.unread > 0 && (
                  <button
                    onClick={handleAcknowledgeAll}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-bold rounded-xl hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    อ่านทั้งหมด ({stats.unread})
                  </button>
                )}

                {notifications.length > 0 && (
                  <button
                    onClick={handleDeleteAll}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500 to-rose-600 text-white text-sm font-bold rounded-xl hover:from-red-600 hover:to-rose-700 disabled:opacity-50 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    ลบที่แสดง ({notifications.length})
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 🎨 Beautiful Notifications List */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-pink-500 to-rose-600 rounded-full flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
              </div>
              <p className="text-gray-600 font-medium">กำลังโหลด...</p>
            </div>
          ) : notifications.length === 0 ? (
            <EmptyNotificationsState 
              typeFilter={typeFilter}
              filter={filter}
              getTypeLabel={getTypeLabel}
            />
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((notification, index) => (
                <NotificationCard
                  key={notification.notif_id ?? `${notification.timestamp ?? "t"}-${index}`}
                  notification={notification}
                  onAcknowledge={handleAcknowledge}
                  onDelete={handleDelete}
                  getTypeIcon={getTypeIcon}
                  getTypeColor={getTypeColor}
                  getTypeLabel={getTypeLabel}
                  loading={loading}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Stats Card Component
function StatsCard({ title, value, icon, gradient, bgGradient, onClick, isActive }) {
  return (
    <div 
      onClick={onClick}
      className={`group bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border-2 p-4 hover:bg-white hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden cursor-pointer ${
        isActive ? 'border-pink-300 bg-pink-50/50' : 'border-white/20 hover:border-pink-200'
      }`}
    >
      <div className={`absolute inset-0 bg-gradient-to-r ${bgGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
      <div className="relative">
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-black text-gray-800 mt-1">{value}</p>
          </div>
          <div className={`w-10 h-10 bg-gradient-to-r ${gradient} rounded-xl flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform duration-300 text-xl`}>
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

// Notification Card Component
function NotificationCard({ notification, onAcknowledge, onDelete, getTypeIcon, getTypeColor, getTypeLabel, loading }) {
  return (
    <div className={`group p-6 hover:bg-gray-50/50 transition-all duration-300 relative ${
      !notification.is_acknowledged ? "bg-pink-50/30 border-l-4 border-l-pink-500" : ""
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4 flex-1">
          <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-gradient-to-r from-${getTypeColor(notification.type)}-500 to-${getTypeColor(notification.type)}-600 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
            {getTypeIcon(notification.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-bold text-gray-900 truncate">
                {notification.title}
              </h3>
              {!notification.is_acknowledged && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200 animate-pulse">
                  ใหม่
                </span>
              )}
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-${getTypeColor(notification.type)}-100 text-${getTypeColor(notification.type)}-800 border border-${getTypeColor(notification.type)}-200`}>
                {getTypeLabel(notification.type)}
              </span>
            </div>
            <p className="text-gray-700 mb-3 leading-relaxed">{notification.message}</p>
            <div className="flex items-center text-sm text-gray-500 space-x-6">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">{new Date(notification.timestamp).toLocaleString('th-TH')}</span>
              </div>
              {notification.asset_id > 0 && (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <span className="font-medium">Asset ID: {notification.asset_id}</span>
                </div>
              )}
              {notification.location_id > 0 && (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                  <span className="font-medium">Location ID: {notification.location_id}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2 ml-4">
          {!notification.is_acknowledged && (
            <button
              onClick={() => onAcknowledge(notification.notif_id)}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-bold rounded-xl hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              รับทราบ
            </button>
          )}
          <button
            onClick={() => onDelete(notification.notif_id)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500 to-rose-600 text-white text-sm font-bold rounded-xl hover:from-red-600 hover:to-rose-700 disabled:opacity-50 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Empty State Component
function EmptyNotificationsState({ typeFilter, filter, getTypeLabel }) {
  return (
    <div className="text-center py-16">
      <div className="relative mx-auto mb-8 w-24 h-24">
        <div className="absolute inset-0 bg-gradient-to-r from-pink-400 to-rose-600 rounded-full blur opacity-25 animate-pulse"></div>
        <div className="relative w-24 h-24 bg-gradient-to-r from-pink-500 to-rose-600 rounded-full flex items-center justify-center text-white shadow-2xl">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.021 15.493l.99-.099L5 15.415v-2.83A8 8 0 0113 4.584a8 8 0 018 8.001v2.83l-.01-.021-.99.099a.992.992 0 00-.99.99H4.021z" />
          </svg>
        </div>
      </div>
      
      <h3 className="text-2xl font-bold text-gray-800 mb-3">ไม่มีการแจ้งเตือน</h3>
      <p className="text-gray-600 text-lg max-w-md mx-auto leading-relaxed">
        {typeFilter !== "all" 
          ? `ไม่มีการแจ้งเตือนประเภท "${getTypeLabel(typeFilter)}" ${filter === "unread" ? "ที่ยังไม่อ่าน" : ""}`
          : filter === "unread" 
            ? "ไม่มีการแจ้งเตือนที่ยังไม่อ่าน"
            : "ยังไม่มีการแจ้งเตือนในขณะนี้"
        }
      </p>
    </div>
  );
}