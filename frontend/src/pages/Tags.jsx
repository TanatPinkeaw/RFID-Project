import React, { useState, useEffect, useRef, useCallback } from "react";
import api, { BASE_URL } from "../services/api";

// helper: upsert canonical tag object (global scope)
const upsertTag = (tagObj, setTags, setFilteredTags) => {
  if (!tagObj || !tagObj.tag_id) return;
  const normalized = {
    ...tagObj,
    authorized:
      tagObj.authorized === true ||
      tagObj.authorized === 1 ||
      String(tagObj.authorized).toLowerCase() === "true",
    asset_id: tagObj.asset_id ?? null,
  };

  setTags((prev) => {
    const idx = prev.findIndex((t) => t.tag_id === normalized.tag_id);
    if (idx >= 0) {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...normalized };
      return copy;
    } else {
      return [normalized, ...prev];
    }
  });

  setFilteredTags((prev) => {
    const idx = prev.findIndex((t) => t.tag_id === normalized.tag_id);
    if (idx >= 0) {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...normalized };
      return copy;
    } else {
      return [normalized, ...prev];
    }
  });
};

export default function Tags() {
  const [tags, setTags] = useState([]);
  const [assets, setAssets] = useState([]);
  const [filteredTags, setFilteredTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  const wsRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const shouldReconnect = useRef(true);

  // add global WS guard name (like Borrowing)
  const GLOBAL_WS_FLAG = "__TAGS_WS_CONNECTED__";

  // build WS URL from BASE_URL
  const buildWsUrl = useCallback(() => {
    const base = (api?.defaults?.baseURL) || BASE_URL || window.location.origin;
    try {
      const isSecure = base.startsWith("https");
      const host = base.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const proto = isSecure ? "wss" : "ws";
      return `${proto}://${host}/ws/realtime`;
    } catch (e) {
      return "ws://localhost:8000/ws/realtime";
    }
  }, []);

  // connect websocket and handle incoming tag updates
  const connectWs = useCallback(() => {
    if (wsRef.current) return;
    if (window[GLOBAL_WS_FLAG]) {
      console.debug("Tags WS: global flag set -> skipping duplicate connect");
      return;
    }
    const url = buildWsUrl();
    console.info("Tags WS ->", url);
    const ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectAttempts.current = 0;
      wsRef.current = ws;
      window[GLOBAL_WS_FLAG] = true;
      console.info("Tags WS open");
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (!data) return;

        console.debug("🔥 Tags WS received:", data);

        // ⭐ จัดการ tag_update events (รวมจาก movement)
        if (data.type === "tag_update" || data.tag) {
          const t = data.tag || data;
          console.debug("🔄 Processing tag update:", t);
          
          if (!t.tag_id) {
            console.debug("⚠️ No tag_id in payload, skipping");
            return;
          }

          // ถ้าได้ข้อมูลครบถ้วน ใช้เลย
          if (t.status !== undefined && (t.created_at || t.last_seen)) {
            console.debug("✅ Using complete tag data from movement");
            upsertTag(t, setTags, setFilteredTags);
            refreshStats();
          } else {
            // ถ้าข้อมูลไม่ครบ ดึงจาก API
            console.debug("🔍 Fetching complete tag data after movement");
            (async () => {
              try {
                const res = await api.get(`/api/tags/${encodeURIComponent(t.tag_id)}`);
                if (res && res.data) {
                  console.debug("✅ Got complete tag data:", res.data);
                  upsertTag(res.data, setTags, setFilteredTags);
                }
              } catch (err) {
                console.error("❌ Failed to fetch tag data:", err);
              } finally {
                refreshStats();
              }
            })();
          }
          return;
        }

        // ⭐ จัดการ movement notification events
        if (data.type === "movement" && data.notif_id) {
          console.debug("🚶 Movement notification received:", data);
          
          // แยก tag_id จาก message
          const messageMatch = data.message?.match(/Tag\s+([A-F0-9]+)/i);
          if (messageMatch) {
            const tagId = messageMatch[1];
            console.debug("🔍 Extracted tag_id from movement message:", tagId);
            
            // ดึงข้อมูล tag ล่าสุด
            (async () => {
              try {
                const res = await api.get(`/api/tags/${encodeURIComponent(tagId)}`);
                if (res && res.data) {
                  console.debug("✅ Updated tag data from movement:", res.data);
                  upsertTag(res.data, setTags, setFilteredTags);
                  refreshStats();
                }
              } catch (err) {
                console.error("❌ Failed to fetch tag after movement:", err);
              }
            })();
          }
          return;
        }

        // จัดการ events อื่น ๆ
        if (data.type === "scan") {
          console.debug("📡 Scan event received, refreshing stats");
          refreshStats();
          return;
        }

      } catch (e) {
        console.error("❌ Tags WS parse error", e);
      }
    };

    ws.onclose = (ev) => {
      if (wsRef.current === ws) wsRef.current = null;
      try { delete window[GLOBAL_WS_FLAG]; } catch(_) {}
      if (!shouldReconnect.current) return;
      const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts.current));
      reconnectAttempts.current += 1;
      console.warn("Tags WS closed, reconnect in", delay, "ms");
      setTimeout(connectWs, delay);
    };

    ws.onerror = (err) => {
      console.error("Tags WS error", err);
      try {
        ws.close();
      } catch (_) {}
    };
  }, [buildWsUrl]);

  useEffect(() => {
    shouldReconnect.current = true;
    connectWs();
    return () => {
      shouldReconnect.current = false;
      try { if (wsRef.current) wsRef.current.close(); } catch(_) {}
      wsRef.current = null;
    };
  }, [connectWs]);

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [viewMode, setViewMode] = useState("grid"); // grid หรือ table

  // Modal states
  const [showBindModal, setShowBindModal] = useState(false);
  const [selectedTag, setSelectedTag] = useState(null);
  const [bindingAssetId, setBindingAssetId] = useState("");
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [tagDetails, setTagDetails] = useState(null);

  useEffect(() => {
    loadTags();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [tags, searchQuery, statusFilter, locationFilter, sortBy]);

  // โหลด tags และรวมข้อมูลที่จำเป็น (รวม authorized)
  const loadTags = async () => {
    setLoading(true);
    try {
      // โหลดทั้ง tags และ assets พร้อมกัน
      const [tagsRes, assetsRes] = await Promise.all([
        api.get("/api/tags"),
        api.get("/api/assets"),
      ]);

      const tags = (tagsRes.data || []).map((t) => {
        // normalize authorized to boolean (accept number, "0"/"1", "true"/"false", boolean, null)
        const a = t.authorized;
        console.log("normalize", t.authorized, "raw:", a);
        let authBool = false;
        if (a === true || a === false) authBool = a;
        else if (a == null) authBool = false;
        else {
          const n = Number(a);
          if (!Number.isNaN(n)) authBool = n === 1;
          else authBool = String(a).toLowerCase() === "true";
        }

        const normalized = {
          ...t,
          authorized: authBool,
        };
        // optional debug:
        // console.log('normalize', t.tag_id, 'raw:', t.authorized, '->', authBool);
        return normalized;
      });

      console.log("Processed tags data:", tags.slice(0, 6)); // Debug
      setTags(tags);
      setAssets(assetsRes.data || []);

      // read aggregate stats from backend (authoritative)
      await refreshStats();
    } catch (e) {
      console.error("Error loading data:", e);
      setError("ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  };

  // read aggregated stats from backend
  const refreshStats = async () => {
    try {
      const res = await api.get("/api/tags/stats");
      if (res && res.data) {
        // you can map to local UI state or simple console for now
        // e.g. set some local stats state if you have one:
        // setTagStats(res.data)
        console.debug("Tag stats:", res.data);
      }
    } catch (err) {
      console.error("Failed to refresh tag stats:", err);
    }
  };

  const applyFilters = () => {
    let filtered = [...tags];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (tag) =>
          tag.tag_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (tag.asset_id && tag.asset_id.toString().includes(searchQuery))
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((tag) => {
        switch (statusFilter) {
          case "active":
            return tag.asset_id && tag.status === "in_use";
          case "idle":
            return tag.status === "idle";
          case "borrowed":
            return tag.status === "borrowed";
          case "unbound":
            return !tag.asset_id;
          default:
            return true;
        }
      });
    }

    // Location filter
    if (locationFilter !== "all") {
      filtered = filtered.filter(
        (tag) => tag.current_location_id?.toString() === locationFilter
      );
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "recent":
          return new Date(b.last_seen || 0) - new Date(a.last_seen || 0);
        case "tag_id":
          return a.tag_id.localeCompare(b.tag_id);
        case "status":
          return (a.status || "").localeCompare(b.status || "");
        case "location":
          return (a.current_location_id || 0) - (b.current_location_id || 0);
        default:
          return 0;
      }
    });

    setFilteredTags(filtered);
  };

  const handleBindTag = async () => {
    if (!selectedTag || !bindingAssetId) return;

    try {
      setLoading(true);
      await api.post(`/api/tags/${selectedTag.tag_id}/bind`, {
        asset_id: parseInt(bindingAssetId),
      });
      setSuccess(`ผูก Tag ${selectedTag.tag_id} กับ Asset สำเร็จ`);
      setShowBindModal(false);
      setSelectedTag(null);
      setBindingAssetId("");
      await loadTags();
      await refreshStats();
    } catch (error) {
      setError(error.response?.data?.detail || "ไม่สามารถผูก Tag ได้");
    } finally {
      setLoading(false);
    }
  };

  const handleUnbindTag = async (tagOrId) => {
    const tagId = typeof tagOrId === "string" ? tagOrId : tagOrId?.tag_id;
    if (!tagId) return setError("ไม่พบ Tag ID สำหรับยกเลิกการผูก");
    if (!confirm(`ต้องการยกเลิกการผูก Tag ${tagId} หรือไม่?`)) return;

    try {
      setLoading(true);
      const res = await api.post(`/api/tags/${encodeURIComponent(tagId)}/unbind`);
      if (res && res.data) {
        // ใช้ response canonical tag object เพื่ออัปเดต UI
        upsertTag(res.data, setTags, setFilteredTags);
        await refreshStats();
        setSuccess(`ยกเลิกการผูก Tag ${tagId} สำเร็จ`);
        setTimeout(() => setSuccess(""), 3000);
      } else {
        // fallback: โหลดข้อมูลใหม่ทั้งหมด
        await loadTags();
      }
    } catch (error) {
      console.error("Unbind error:", error);
      setError(error.response?.data?.detail || "ไม่สามารถยกเลิกการผูกได้");
      setTimeout(() => setError(""), 4000);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (tag) => {
    try {
      setLoading(true);
      const response = await api.get(`/api/tags/${tag.tag_id}`);
      setTagDetails(response.data);
      setShowDetailsModal(true);
    } catch (error) {
      setError("ไม่สามารถโหลดรายละเอียดได้");
    } finally {
      setLoading(false);
    }
  };

  // แก้ฟังก์ชัน handleToggleAuthorize
  const handleToggleAuthorize = async (tagId, currentStatus) => {
    try {
      setLoading(true);
      const safeId = encodeURIComponent(tagId);
      const requestUrl = `/api/tags/${safeId}/authorize`;
      const requestData = { authorized: !currentStatus };
      const response = await api.post(requestUrl, requestData);
      // optimistic UI update...
      setTags((prev) =>
        prev.map((t) =>
          t.tag_id === tagId
            ? { ...t, authorized: !!requestData.authorized }
            : t
        )
      );
      setFilteredTags((prev) =>
        prev.map((t) =>
          t.tag_id === tagId
            ? { ...t, authorized: !!requestData.authorized }
            : t
        )
      );
      loadTags();
      await refreshStats();
      const statusText = !currentStatus ? "ได้รับอนุญาต" : "ยกเลิกการอนุญาต";
      setSuccess(`✅ Tag ${tagId} ${statusText}แล้ว`);
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      console.error("❌ AUTHORIZE ERROR:", error);
      console.error("❌ ERROR RESPONSE:", error.response);
      const errorMsg =
        error.response?.data?.detail || "ไม่สามารถเปลี่ยนสถานะการอนุญาตได้";
      setError(`❌ ${errorMsg}`);
      setTimeout(() => setError(""), 5000);
    } finally {
      setLoading(false);
    }
  };

  // แก้ฟังก์ชัน getStatusInfo ให้คืน bgColor และ textColor แยก
  const getStatusInfo = (status) => {
    if (status === "in_use") {
      return {
        label: "Active",
        icon: "✓",
        bgColor: "bg-emerald-100",
        textColor: "text-emerald-800",
        borderColor: "border-emerald-300",
      };
    }
    if (status === "borrowed") {
      return {
        label: "Borrowed",
        icon: "↗",
        bgColor: "bg-amber-100",
        textColor: "text-amber-800",
        borderColor: "border-amber-300",
      };
    }
    if (status === "idle") {
      return {
        label: "Available",
        icon: "💤",
        bgColor: "bg-blue-100",
        textColor: "text-blue-800",
        borderColor: "border-blue-300",
      };
    }
    // Unbound
    return {
      label: "Unbound",
      icon: "○",
      bgColor: "bg-gray-100",
      textColor: "text-gray-800",
      borderColor: "border-gray-300",
    };
  };

  const getLocationName = (locationId) => {
    switch (locationId) {
      case 1:
        return "โรงงาน";
      case 2:
        return "ห้องช่าง";
      case 3:
        return "นอกพื้นที่";
      default:
        return "ไม่ระบุ";
    }
  };

  const getAssetName = (assetId) => {
    const asset = assets.find((a) => a.asset_id === assetId);
    return asset ? asset.name : "Unknown Asset";
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setLocationFilter("all");
    setSortBy("recent");
  };

  const stats = {
    total: tags.length,
    active: tags.filter((t) => t.asset_id && t.status === "in_use").length,
    idle: tags.filter((t) => t.status === "idle").length,
    borrowed: tags.filter((t) => t.status === "borrowed").length,
    unbound: tags.filter((t) => !t.asset_id).length,
  };

  const locations = [
    ...new Set(tags.map((t) => t.current_location_id).filter(Boolean)),
  ];

  if (loading && tags.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-cyan-100 flex items-center justify-center">
        <div className="text-center bg-white/80 backdrop-blur-lg rounded-3xl p-12 shadow-2xl border border-white/20">
          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center animate-spin">
            <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full"></div>
          </div>
          <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-3">
            กำลังโหลดข้อมูล Tags
          </h3>
          <p className="text-gray-600 animate-pulse">โปรดรอสักครู่...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-cyan-100">
      <div className="w-full h-full px-6 py-6">
        
        {/* 🎨 Beautiful Header */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-6 mb-6 relative overflow-hidden">
          {/* Background Pattern */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-600/5"></div>
          
          <div className="relative flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg animate-float">
                  🏷️
                </div>
                <div>
                  <h1 className="text-3xl font-black bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent">
                    RFID Tags Management
                  </h1>
                  <p className="text-gray-600 mt-1">จัดการและติดตาม RFID Tags ในระบบแบบ Real-time</p>
                </div>
              </div>
              
              {/* Connection Status */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
                  <div className={`w-2 h-2 rounded-full ${wsRef.current ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                  <span className="text-xs font-medium text-gray-700">
                    {wsRef.current ? 'Real-time Updates Active' : 'Offline Mode'}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={loadTags}
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

        {/* 🎨 Beautiful Alert Messages */}
        {success && (
          <div className="mb-6 bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 shadow-lg">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white text-lg">
                  ✅
                </div>
                <div>
                  <h4 className="font-bold text-emerald-800">สำเร็จ!</h4>
                  <p className="text-emerald-700 text-sm">{success}</p>
                </div>
              </div>
              <button 
                onClick={() => setSuccess('')} 
                className="text-xl text-emerald-600 hover:text-emerald-800 hover:scale-110 transition-all duration-200 w-6 h-6 flex items-center justify-center"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-2xl p-4 shadow-lg">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center text-white text-lg">
                  ⚠️
                </div>
                <div>
                  <h4 className="font-bold text-red-800">เกิดข้อผิดพลาด</h4>
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              </div>
              <button 
                onClick={() => setError('')} 
                className="text-xl text-red-600 hover:text-red-800 hover:scale-110 transition-all duration-200 w-6 h-6 flex items-center justify-center"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* 🎨 Beautiful Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          {/* แก้ StatsCard ให้ใช้สไตล์เดียวกับ Scanner */}
          <div className="group bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-4 hover:bg-white hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Tags</p>
                  <p className="text-2xl font-black text-gray-800 mt-1">{stats.total}</p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white text-lg shadow-lg">
                  🏷️
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Live Data</span>
              </div>
            </div>
          </div>

          {/* ใช้รูปแบบเดียวกันกับ cards อื่น ๆ */}
          <div className="group bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-4 hover:bg-white hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Active</p>
                  <p className="text-2xl font-black text-gray-800 mt-1">{stats.active}</p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center text-white text-lg shadow-lg">
                  ✅
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-emerald-600 uppercase tracking-wide">In Use</span>
              </div>
            </div>
          </div>

          <div className="group bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-4 hover:bg-white hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Available</p>
                  <p className="text-2xl font-black text-gray-800 mt-1">{stats.idle}</p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center text-white text-lg shadow-lg">
                  💤
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Ready</span>
              </div>
            </div>
          </div>

          <div className="group bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-4 hover:bg-white hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Borrowed</p>
                  <p className="text-2xl font-black text-gray-800 mt-1">{stats.borrowed}</p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl flex items-center justify-center text-white text-lg shadow-lg">
                  📤
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-amber-600 uppercase tracking-wide">Out</span>
              </div>
            </div>
          </div>

          <div className="group bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-4 hover:bg-white hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-gray-500/5 to-slate-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Unbound</p>
                  <p className="text-2xl font-black text-gray-800 mt-1">{stats.unbound}</p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-r from-gray-500 to-slate-600 rounded-xl flex items-center justify-center text-white text-lg shadow-lg">
                  🔗
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Free</span>
              </div>
            </div>
          </div>
        </div>

        {/* 🎨 Beautiful Filters Panel */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 mb-6 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-sm">
                🔍
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">ตัวกรองข้อมูล</h3>
                <p className="text-gray-600 text-sm">ค้นหาและกรอง Tags ตามเงื่อนไขที่ต้องการ</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
              {/* ใช้ filters เดิม แต่ปรับ styling ให้เหมือน Scanner */}
              {/* Search */}
              <div className="lg:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">ค้นหา Tags</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ค้นหาด้วย Tag ID หรือ Asset ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 shadow-sm"
                  />
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">สถานะ</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all duration-200 shadow-sm"
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="active">Active</option>
                  <option value="idle">Available</option>
                  <option value="borrowed">Borrowed</option>
                  <option value="unbound">Unbound</option>
                </select>
              </div>

              {/* Location Filter */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Location</label>
                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all duration-200 shadow-sm"
                >
                  <option value="all">ทั้งหมด</option>
                  {locations.map((loc) => (
                    <option key={loc} value={loc}>
                      {getLocationName(loc)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">เรียงตาม</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all duration-200 shadow-sm"
                >
                  <option value="recent">ล่าสุด</option>
                  <option value="tag_id">Tag ID</option>
                  <option value="status">สถานะ</option>
                  <option value="location">Location</option>
                </select>
              </div>

              {/* View Mode */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">มุมมอง</label>
                <div className="flex border border-gray-300 rounded-lg overflow-hidden bg-white shadow-sm">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`flex-1 px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                      viewMode === "grid"
                        ? "bg-orange-500 text-white"
                        : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    Grid
                  </button>
                  <button
                    onClick={() => setViewMode("table")}
                    className={`flex-1 px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                      viewMode === "table"
                        ? "bg-orange-500 text-white"
                        : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    Table
                  </button>
                </div>
              </div>

              {/* Clear Filters */}
              {(searchQuery ||
                statusFilter !== "all" ||
                locationFilter !== "all" ||
                sortBy !== "recent") && (
                <div className="flex items-end">
                  <button
                    onClick={clearFilters}
                    className="w-full px-3 py-2.5 text-sm font-medium text-orange-600 hover:text-white bg-orange-50 hover:bg-orange-500 border border-orange-200 hover:border-orange-500 rounded-lg transition-all duration-200"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                แสดง <span className="font-semibold text-blue-600">{filteredTags.length}</span> จาก <span className="font-semibold">{tags.length}</span> tags
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${wsRef.current ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className="text-xs text-gray-500">
                  {wsRef.current ? 'Real-time Updates' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tags Display */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 mb-6 overflow-hidden">
          <div className="p-6">
            {filteredTags.length === 0 ? (
              <EmptyState
                hasFilters={
                  searchQuery ||
                  statusFilter !== "all" ||
                  locationFilter !== "all"
                }
              />
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredTags.map((tag) => (
                  <TagCard
                    key={tag.tag_id}
                    tag={tag}
                    onViewDetails={() => handleViewDetails(tag)}
                    onBind={() => {
                      setSelectedTag(tag);
                      setShowBindModal(true);
                    }}
                    onUnbind={() => handleUnbindTag(tag)}
                    getStatusInfo={getStatusInfo}
                    getLocationName={getLocationName}
                    getAssetName={getAssetName}
                    onToggleAuthorize={handleToggleAuthorize}
                  />
                ))}
              </div>
            ) : (
              <TagTable
                tags={filteredTags}
                onViewDetails={handleViewDetails}
                onBind={(tag) => {
                  setSelectedTag(tag);
                  setShowBindModal(true);
                }}
                onUnbind={handleUnbindTag}
                getStatusInfo={getStatusInfo}
                getLocationName={getLocationName}
                getAssetName={getAssetName}
                onToggleAuthorize={handleToggleAuthorize}
              />
            )}
          </div>
        </div>

        {/* Bind Modal */}
        {showBindModal && (
          <BindModal
            tag={selectedTag}
            assets={assets.filter((a) => a.status === "idle")}
            bindingAssetId={bindingAssetId}
            setBindingAssetId={setBindingAssetId}
            onBind={handleBindTag}
            onClose={() => {
              setShowBindModal(false);
              setSelectedTag(null);
              setBindingAssetId("");
            }}
            loading={loading}
          />
        )}

        {/* Details Modal */}
        {showDetailsModal && (
          <DetailsModal
            tag={tagDetails}
            onClose={() => {
              setShowDetailsModal(false);
              setTagDetails(null);
            }}
            getAssetName={getAssetName}
            getLocationName={getLocationName}
          />
        )}
      </div>
    </div>
  );
}

// Stats Card Component
function StatsCard({ title, value, icon, gradient, bgGradient }) {
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200/50 p-4 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 relative overflow-hidden group">
      <div className={`absolute inset-0 bg-gradient-to-r ${bgGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
      <div className="relative">
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          </div>
          <div className={`w-10 h-10 bg-gradient-to-r ${gradient} rounded-lg flex items-center justify-center text-white shadow-md group-hover:scale-110 transition-transform duration-300 text-lg`}>
            {icon}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
          <span className="text-xs font-medium text-emerald-600 tracking-wide">Live Data</span>
        </div>
      </div>
    </div>
  );
}

// Tag Card Component
function TagCard({
  tag,
  onViewDetails,
  onBind,
  onUnbind,
  getStatusInfo,
  getLocationName,
  getAssetName,
  onToggleAuthorize,
}) {
  const statusInfo = getStatusInfo(tag.status);
  const assetName = getAssetName(tag.asset_id);
  const locationName = getLocationName(tag.current_location_id);

  const handleCopy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch (e) {
      console.error("Copy failed", e);
      alert("ไม่สามารถคัดลอกได้");
    }
  };

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200/50 p-5 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-r from-orange-500/3 to-red-500/3 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      
      <div className="relative">
        {/* Header: Tag ID */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900 break-all font-mono">
              {tag.tag_id}
            </h3>
            <button
              onClick={() => handleCopy(tag.tag_id)}
              className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-md transition-all duration-200"
              title="Copy Tag ID"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Status Row: สถานะ + การอนุญาต */}
        <div className="flex items-center justify-between mb-4 gap-2">
          {/* Status Badge */}
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${statusInfo.bgColor} ${statusInfo.textColor} border ${statusInfo.borderColor}`}>
            <span className="text-sm">{statusInfo.icon}</span>
            {statusInfo.label}
          </span>

          {/* Authorization Button */}
          <button
            onClick={() => onToggleAuthorize(tag.tag_id, tag.authorized)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border ${
              tag.authorized
                ? "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200"
                : "bg-red-100 text-red-800 border-red-300 hover:bg-red-200"
            } ${
              tag.status === "borrowed"
                ? "opacity-60 cursor-not-allowed"
                : "cursor-pointer hover:scale-105"
            }`}
            disabled={tag.status === "borrowed"}
            title={
              tag.status === "borrowed"
                ? "Tag ที่ถูกยืมจะได้รับอนุญาตอัตโนมัติ"
                : "คลิกเพื่อเปลี่ยนสถานะการอนุญาต"
            }
          >
            <span className="text-sm">{tag.authorized ? "✓" : "✗"}</span>
            {tag.authorized ? "อนุญาต" : "ไม่อนุญาต"}
          </button>
        </div>

        {/* Asset Info */}
        {assetName && assetName !== "Unknown Asset" && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm text-blue-600">🏷️</span>
              <span className="text-sm font-medium text-blue-800">Asset: {assetName}</span>
            </div>
          </div>
        )}

        {/* Location & Time Info */}
        <div className="space-y-2 text-sm text-gray-600 mb-4">
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
            <span className="text-gray-500">📍</span>
            <span className="font-medium">ตำแหน่ง: {locationName || "ไม่ระบุ"}</span>
          </div>
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
            <span className="text-gray-500">🕒</span>
            <span className="font-medium">
              ล่าสุด: {tag.last_seen
                ? new Date(tag.last_seen).toLocaleString("th-TH")
                : "ไม่เคยสแกน"}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => onViewDetails(tag)}
            className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:from-blue-600 hover:to-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-1.5"
          >
            
            ดูรายละเอียด
          </button>
          {tag.asset_id ? (
            <button
              onClick={() => onUnbind(tag.tag_id)}
              className="flex-1 bg-gradient-to-r from-red-500 to-rose-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:from-red-600 hover:to-rose-700 transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-1.5"
            >
              <span>🔗</span>
              ยกเลิกผูก
            </button>
          ) : (
            <button
              onClick={onBind}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:from-emerald-600 hover:to-teal-700 transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-1.5"
            >
              <span>🔗</span>
              ผูก Asset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Tag Table Component
function TagTable({
  tags,
  onViewDetails,
  onBind,
  onUnbind,
  getStatusInfo,
  getLocationName,
  getAssetName,
  onToggleAuthorize,
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white border border-gray-200 rounded-lg overflow-hidden">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
              Tag ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
              Asset
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
              อนุญาต
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
              Location
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
              Last Seen
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {tags.map((tag) => {
            const statusInfo = getStatusInfo(tag.status);
            const assetName = getAssetName(tag.asset_id);
            const locationName = getLocationName(tag.current_location_id);

            return (
              <tr key={tag.tag_id} className="hover:bg-gray-50 transition-colors duration-200">
                <td className="px-4 py-4 whitespace-nowrap text-sm font-mono text-gray-900 border-b border-gray-100">
                  {tag.tag_id}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 border-b border-gray-100">
                  {assetName && assetName !== "Unknown Asset" ? assetName : "-"}
                </td>
                <td className="px-4 py-4 whitespace-nowrap border-b border-gray-100">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${statusInfo.bgColor} ${statusInfo.textColor} border ${statusInfo.borderColor}`}
                  >
                    <span>{statusInfo.icon}</span>
                    {statusInfo.label}
                  </span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap border-b border-gray-100">
                  <button
                    onClick={() =>
                      onToggleAuthorize(tag.tag_id, tag.authorized)
                    }
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      tag.authorized
                        ? "bg-green-100 text-green-800 hover:bg-green-200"
                        : "bg-red-100 text-red-800 hover:bg-red-200"
                    }`}
                    disabled={tag.status === "borrowed"} // ถ้ายืมอยู่ จะอนุญาตอัตโนมัติ
                    title={
                      tag.status === "borrowed"
                        ? "Tag ที่ถูกยืมจะได้รับอนุญาตอัตโนมัติ"
                        : "คลิกเพื่อเปลี่ยนสถานะการอนุญาต"
                    }
                  >
                    {tag.authorized ? "✅ อนุญาต" : "❌ ไม่อนุญาต"}
                  </button>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 border-b border-gray-100">
                  {locationName || "-"}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 border-b border-gray-100">
                  {tag.last_seen
                    ? new Date(tag.last_seen).toLocaleString("th-TH")
                    : "-"}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm font-medium border-b border-gray-100">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => onViewDetails(tag)}
                      className="text-blue-600  bg-blue-100 p-1 rounded hover:text-blue-900 font-medium text-sm"
                    >
                       รายละเอียด
                    </button>
                    {tag.asset_id ? (
                      <button
                        onClick={() => onUnbind(tag.tag_id)}
                        className="text-red-600  bg-red-100 p-1 rounded hover:text-red-900 font-medium text-sm"
                      >
                        🔗 ยกเลิก
                      </button>
                    ) : (
                      <button
                        onClick={() => onBind(tag)}
                        className="text-green-600  bg-green-100 p-1 rounded hover:text-green-900 font-medium text-sm"
                      >
                        🔗 ผูก
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Bind Modal Component
function BindModal({
  tag,
  assets,
  bindingAssetId,
  setBindingAssetId,
  onBind,
  onClose,
  loading,
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-200">
        <div className="p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            ผูก Tag {tag?.tag_id} กับ Asset
          </h3>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              เลือก Asset
            </label>
            <select
              value={bindingAssetId}
              onChange={(e) => setBindingAssetId(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all duration-200"
            >
              <option value="">-- เลือก Asset --</option>
              {assets.map((asset) => (
                <option key={asset.asset_id} value={asset.asset_id}>
                  {asset.name} (ID: {asset.asset_id})
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors duration-200"
              disabled={loading}
            >
              ยกเลิก
            </button>
            <button
              onClick={onBind}
              disabled={loading || !bindingAssetId}
              className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg hover:from-orange-600 hover:to-red-700 disabled:opacity-50 transition-all duration-200 flex items-center gap-2"
            >
              {loading && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              )}
              ผูก
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Details Modal Component
function DetailsModal({ tag, onClose, getAssetName, getLocationName }) {
  if (!tag) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gray-200">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-gray-900">
              รายละเอียด Tag {tag.tag_id}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            <DetailRow label="Tag ID" value={tag.tag_id} mono />
            <DetailRow label="สถานะ" value={tag.status || "ไม่ระบุ"} />
            <DetailRow
              label="Asset ID"
              value={
                tag.asset_id
                  ? `${tag.asset_id} (${getAssetName(tag.asset_id)})`
                  : "ไม่ได้ผูก"
              }
            />
            <DetailRow
              label="Location"
              value={
                tag.current_location_id
                  ? `${tag.current_location_id} - ${getLocationName(
                      tag.current_location_id
                    )}`
                  : "ไม่ระบุ"
              }
            />
            <DetailRow
              label="Last Seen"
              value={
                tag.last_seen
                  ? new Date(tag.last_seen).toLocaleString("th-TH")
                  : "ไม่เคยสแกน"
              }
            />
            <DetailRow
              label="Created At"
              value={
                tag.created_at
                  ? new Date(tag.created_at).toLocaleString("th-TH")
                  : "ไม่ระบุ"
              }
            />
            <DetailRow
              label="Updated At"
              value={
                tag.updated_at
                  ? new Date(tag.updated_at).toLocaleString("th-TH")
                  : "ไม่ระบุ"
              }
            />
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors duration-200"
            >
              ปิด
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Detail Row Component
function DetailRow({ label, value, mono = false }) {
  return (
    <div className="flex justify-between py-3 border-b border-gray-100">
      <span className="text-sm font-semibold text-gray-600">{label}:</span>
      <span
        className={`text-sm text-gray-900 text-right ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

// Empty State Component
function EmptyState({ hasFilters }) {
  return (
    <div className="text-center py-16">
      <div className="relative mx-auto mb-8 w-24 h-24">
        {/* Animated background */}
        <div className="absolute inset-0 bg-gradient-to-r from-orange-400 to-red-600 rounded-full blur opacity-25 animate-pulse"></div>
        
        {/* Icon container */}
        <div className="relative w-24 h-24 bg-gradient-to-r from-orange-500 to-red-600 rounded-full flex items-center justify-center text-white shadow-2xl">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        </div>
      </div>
      
      <h4 className="text-2xl font-bold text-gray-800 mb-3">
        {hasFilters ? 'ไม่พบ Tags ที่ตรงกับเงื่อนไข' : 'ยังไม่มี Tags ในระบบ'}
      </h4>
      
      <p className="text-gray-600 text-lg max-w-md mx-auto leading-relaxed mb-8">
        {hasFilters 
          ? 'ลองปรับเปลี่ยนเงื่อนไขการค้นหาหรือล้างตัวกรองเพื่อดูข้อมูลทั้งหมด'
          : 'เมื่อมีการสแกน RFID Tags ครั้งแรก ข้อมูลจะแสดงที่นี่โดยอัตโนมัติ'
        }
      </p>
      
      {hasFilters && (
        <div className="space-y-4">
          <div className="flex justify-center">
            <button
              onClick={() => {
                // เรียกใช้ฟังก์ชัน clearFilters ถ้ามี
                window.dispatchEvent(new CustomEvent('clearFilters'));
              }}
              className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white font-bold rounded-xl hover:from-orange-600 hover:to-red-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              ล้างตัวกรองทั้งหมด
            </button>
          </div>
          
          <div className="text-sm text-gray-500">
            หรือลองค้นหาด้วยคำอื่น ๆ
          </div>
        </div>
      )}
    </div>
  );
}
