import { useState, useEffect, useRef } from "react";
import api from "../services/api";

export default function Borrowing() {
  const [activeTab, setActiveTab] = useState("borrow");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // ข้อมูลสำหรับยืม
  const [borrowForm, setBorrowForm] = useState({
    tag_id: "",
    asset_id: "",
    borrower_name: "",
    borrower_contact: "",
    expected_return_days: 7,
    notes: ""
  });
  
  // ข้อมูลสำหรับคืน
  const [returnForm, setReturnForm] = useState({
    borrow_id: "",
    return_location_id: null,
    return_notes: ""
  });
  
  // รายการที่กำลังยืม
  const [activeBorrows, setActiveBorrows] = useState([]);
  const [overdueBorrows, setOverdueBorrows] = useState([]);
  const [borrowHistory, setBorrowHistory] = useState([]);
  
  const [stats, setStats] = useState({
    totalActive: 0,
    totalOverdue: 0,
    totalReturned: 0,
    avgBorrowDays: 0
  });

  const mountedRef = useRef(true);
  // realtime WS for borrowing
  const wsRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const shouldReconnect = useRef(true);

  // prevent multiple WS from same page (e.g. React StrictMode / HMR)
  const GLOBAL_WS_FLAG = "__BORROWING_WS_CONNECTED__";

  // helper: recalc stats from arrays (fallback to current state)
  const recalcStatsFrom = (activeArr = null, overdueArr = null, historyArr = null) => {
    const a = activeArr ?? activeBorrows;
    const o = overdueArr ?? overdueBorrows;
    const h = historyArr ?? borrowHistory;
    const totalActive = (a?.length) || 0;
    const totalOverdue = (o?.length) || 0;
    const totalReturned = (h?.filter(x => x.return_date)?.length) || 0;
    const avgDays = (h && h.length) ? Math.round((h.reduce((s, it) => s + (it.days_borrowed || 0), 0) / h.length)) : 0;
    setStats({
      totalActive,
      totalOverdue,
      totalReturned,
      avgBorrowDays: avgDays
    });
  };

  // read aggregated stats from backend (authoritative)
  const refreshStats = async () => {
    try {
      const res = await api.get("/api/borrowing/stats");
      if (res && res.data) setStats(res.data);
    } catch (err) {
      console.error("Failed to refresh stats:", err);
      // fallback: recalc from current arrays
      recalcStatsFrom();
    }
  };

  // helper: upsert borrow into activeBorrows (dedupe by id) and recalc stats
  const upsertBorrow = (b) => {
    if (!b || !b.id) return;
    setActiveBorrows((prev) => {
      const idx = prev.findIndex(x => String(x.id) === String(b.id));
      const normalized = {
        ...b,
        days_borrowed: (b.days_borrowed ?? 0),
        days_remaining: (typeof b.days_remaining === "number")
          ? b.days_remaining
          : Math.max(0, Math.ceil((new Date(b.expected_return_date) - new Date()) / (1000*60*60*24))),
        is_overdue: !!b.is_overdue
      };
      let next;
      if (idx >= 0) {
        next = [...prev];
        next[idx] = { ...next[idx], ...normalized };
      } else {
        next = [normalized, ...prev];
      }
      // recalc aggregated numbers (fallback) — backend stats are authoritative via refreshStats()
      recalcStatsFrom(next, null, null);
      return next;
    });
  };

  // helper: remove borrow by id (on return) and recalc stats
  const removeBorrowById = (id) => {
    if (!id) return;
    setActiveBorrows((prev) => {
      const next = prev.filter(x => String(x.id) !== String(id));
      if (next.length !== prev.length) recalcStatsFrom(next, null, null);
      return next;
    });
  };

  const connectWs = () => {
    // guard: prevent opening second WS from same tab
    if (wsRef.current) return;
    if (window[GLOBAL_WS_FLAG]) {
      console.debug("Borrowing WS: global flag set -> skipping duplicate connect");
      return;
    }

    const url = buildWsUrl();
    const ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectAttempts.current = 0;
      wsRef.current = ws;
      window[GLOBAL_WS_FLAG] = true;
      console.info("Borrowing WS open");
    };

    // WS handler: remove any direct setStats++ / -- and rely on upsert/remove which call recalcStatsFrom
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (!data) return;

        // 1) borrowing_update -> canonical borrow/return event (use upsert / remove)
        if (data.type === "borrowing_update") {
          const action = data.action;
          const b = data.borrow;
          if (action === "borrow") {
            upsertBorrow({
              id: b.id,
              asset_id: b.asset_id,
              asset_name: b.asset_name,
              tag_id: b.tag_id,
              borrower_name: b.borrower_name,
              borrow_date: b.borrow_date,
              expected_return_date: b.expected_return_date,
              days_borrowed: b.days_borrowed || 0,
              days_remaining: b.days_remaining || 0,
              is_overdue: b.is_overdue || false,
            });
            // update aggregated numbers from DB
            refreshStats();
          } else if (action === "return") {
            removeBorrowById(b.id);
            refreshStats();
            setBorrowHistory((prev) => {
              const entry = {
                id: b.id,
                asset_id: b.asset_id,
                asset_name: b.asset_name,
                tag_id: b.tag_id,
                borrower_name: b.borrower_name,
                borrow_date: b.borrow_date,
                return_date: b.return_date,
                days_borrowed: b.days_borrowed || 0,
                status: "returned",
                is_overdue: b.is_overdue,
              };
              const next = [entry, ...prev].slice(0, 200);
              return next;
            });
          }
          return;
        }

        // 2) tag_update -> keep borrowing list in sync with tag state
        if (data.type === "tag_update" || data.type === "tag") {
          const tag = data.tag || data;
          const tagId = tag.tag_id || tag.tagId;
          if (!tagId) return;

          // if tag indicates borrowed -> fetch borrow status; otherwise remove possible active borrow
          (async () => {
            try {
              const res = await api.get(`/api/borrowing/tag-status/${encodeURIComponent(tagId)}`);
              const payload = res.data;
              if (payload && payload.current_borrow) {
                const cb = payload.current_borrow;
                upsertBorrow({
                  id: cb.id,
                  asset_id: cb.asset_id,
                  asset_name: cb.asset_name,
                  tag_id: cb.tag_id,
                  borrower_name: cb.borrower_name,
                  borrow_date: cb.borrow_date,
                  expected_return_date: cb.expected_return_date,
                  days_borrowed: cb.days_borrowed || 0,
                  days_remaining: cb.days_remaining || 0,
                  is_overdue: !!cb.is_overdue
                });
                refreshStats();
              } else {
                // no current borrow -> ensure removed from active list
                setActiveBorrows((prev) => {
                  const next = prev.filter(x => x.tag_id !== tagId);
                  if (next.length !== prev.length) refreshStats();
                  return next;
                });
              }
            } catch (err) {
              console.error("Failed to sync borrow status from tag_update:", err);
            }
          })();
          return;
        }

      } catch (e) {
        console.error("Borrowing WS parse error", e);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      try { delete window[GLOBAL_WS_FLAG]; } catch(_) {}
      if (!shouldReconnect.current) return;
      const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts.current));
      reconnectAttempts.current += 1;
      setTimeout(connectWs, delay);
    };

    ws.onerror = (err) => {
      console.error("Borrowing WS error", err);
      try { ws.close(); } catch (_) {}
    };
  };

  // สร้าง URL สำหรับเชื่อม WebSocket (รองรับ baseURL จาก axios หรือ window.location)
  const buildWsUrl = () => {
    const base = (api?.defaults?.baseURL) || window.location.origin;
    const isSecure = base.startsWith("https");
    const host = base.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `${isSecure ? "wss" : "ws"}://${host}/ws/realtime`;
  };

  // โหลดข้อมูล
  const loadData = async () => {
    setLoading(true);
    try {
      const [activeRes, overdueRes, historyRes] = await Promise.all([
        api.get("/api/borrowing/active"),
        api.get("/api/borrowing/overdue"),
        api.get("/api/borrowing/history?limit=50")
      ]);
      
      if (mountedRef.current) {
        setActiveBorrows(activeRes.data || []);
        setOverdueBorrows(overdueRes.data || []);
        setBorrowHistory(historyRes.data || []);
        
        // อ่านสถิติจาก backend (authoritative). ถาล้มเหลว ค่อย recalc จาก arrays
        await refreshStats();
      }
    } catch (error) {
      console.error("Failed to load borrowing data:", error);
      setError("ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  };

  // ยืมอุปกรณ์
  const handleBorrow = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.post("/api/borrowing/borrow", borrowForm);
      setSuccess(response.data.message || "บันทึกการยืมสำเร็จ");
      
      // clear form
      setBorrowForm({
        tag_id: "",
        asset_id: "",
        borrower_name: "",
        borrower_contact: "",
        expected_return_days: 7,
        notes: ""
      });
      
      // refresh aggregated counts from DB
      await refreshStats();
      // reload data to get latest state
      await loadData();
    } catch (error) {
      setError(error.response?.data?.detail || "เกิดข้อผิดพลาดในการยืม");
    } finally {
      setLoading(false);
    }
  };

  // คืนอุปกรณ์
  const handleReturn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.post("/api/borrowing/return", returnForm);
      setSuccess(response.data.message || "คืนอุปกรณ์สำเร็จ");
      
      // clear form
      setReturnForm({
        borrow_id: "",
        return_location_id: null,
        return_notes: ""
      });
      
      await refreshStats();
      await loadData();
    } catch (error) {
      setError(error.response?.data?.detail || "เกิดข้อผิดพลาดในการคืน");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    loadData();

    // start websocket for realtime updates
    shouldReconnect.current = true;
    connectWs();

    const onUnload = () => {
      try { delete window[GLOBAL_WS_FLAG]; } catch(_) {}
    };
    window.addEventListener("beforeunload", onUnload);

    return () => {
      mountedRef.current = false;
      // stop websocket & prevent reconnects
      shouldReconnect.current = false;
      try { if (wsRef.current) wsRef.current.close(); } catch(_) {}
      wsRef.current = null;
      try { delete window[GLOBAL_WS_FLAG]; } catch(_) {}
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  if (loading && activeBorrows.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-cyan-100 flex items-center justify-center">
        <div className="text-center bg-white/80 backdrop-blur-lg rounded-3xl p-12 shadow-2xl border border-white/20">
          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
          </div>
          <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-3">
            กำลังโหลดข้อมูลการยืม-คืน
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
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-blue-500/5"></div>
          
          <div className="relative flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-14 h-14 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">
                  📤
                </div>
                <div>
                  <h1 className="text-3xl font-black bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    การยืม-คืนอุปกรณ์
                  </h1>
                  <p className="text-gray-600 mt-1">จัดการการยืมและคืนอุปกรณ์ RFID แบบ Real-time</p>
                </div>
              </div>

            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={loadData}
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
                <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
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
                <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center text-white">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatsCard
            title="กำลังยืม"
            subtitle="อุปกรณ์ที่ยืมอยู่"
            value={stats.totalActive}
            icon="📦"
            gradient="from-blue-500 to-cyan-600"
            bgGradient="from-blue-500/5 to-cyan-500/5"
            isLoading={loading}
          />
          <StatsCard
            title="เกินกำหนด"
            subtitle="อุปกรณ์ที่เกินกำหนดคืน"
            value={stats.totalOverdue}
            icon="⚠️"
            gradient="from-red-500 to-rose-600"
            bgGradient="from-red-500/5 to-rose-500/5"
            isLoading={loading}
          />
          <StatsCard
            title="คืนแล้ว"
            subtitle="อุปกรณ์ที่คืนแล้ว"
            value={stats.totalReturned}
            icon="✅"
            gradient="from-emerald-500 to-teal-600"
            bgGradient="from-emerald-500/5 to-teal-500/5"
            isLoading={loading}
          />
        </div>

        {/* 🎨 Beautiful Tabs */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {[
                {
                  key: "borrow",
                  label: "ยืมอุปกรณ์",
                  icon: "📤",
                  description: "บันทึกการยืม"
                },
                { 
                  key: "return", 
                  label: "คืนอุปกรณ์", 
                  icon: "📥",
                  description: "บันทึกการคืน"
                },
                { 
                  key: "active", 
                  label: "รายการยืม", 
                  icon: "📋",
                  description: `${stats.totalActive} รายการ`
                },
                { 
                  key: "overdue", 
                  label: "เกินกำหนด", 
                  icon: "⏰",
                  description: `${stats.totalOverdue} รายการ`
                },
                { 
                  key: "history", 
                  label: "ประวัติ", 
                  icon: "🕒",
                  description: "ดูประวัติทั้งหมด"
                }
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`py-4 px-2 border-b-3 font-medium text-sm flex items-center gap-3 transition-all ${
                    activeTab === tab.key
                      ? "border-cyan-500 text-cyan-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <span className="text-xl">{tab.icon}</span>
                  <div className="text-left">
                    <p className="font-semibold">{tab.label}</p>
                    <p className="text-xs opacity-75">{tab.description}</p>
                  </div>
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* Tab Content */}
            {activeTab === "borrow" && (
              <BorrowForm 
                form={borrowForm} 
                setForm={setBorrowForm} 
                onSubmit={handleBorrow}
                loading={loading}
              />
            )}
            
            {activeTab === "return" && (
              <ReturnForm 
                form={returnForm} 
                setForm={setReturnForm} 
                onSubmit={handleReturn}
                activeBorrows={activeBorrows}
                loading={loading}
              />
            )}
            
            {activeTab === "active" && (
              <ActiveBorrowsList borrows={activeBorrows} loading={loading} />
            )}
            
            {activeTab === "overdue" && (
              <OverdueBorrowsList borrows={overdueBorrows} loading={loading} />
            )}
            
            {activeTab === "history" && (
              <BorrowHistoryList history={borrowHistory} loading={loading} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Stats Card Component
function StatsCard({ title, subtitle, value, icon, gradient, bgGradient, isLoading }) {
  return (
    <div className="group bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-4 hover:bg-white hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden">
      <div className={`absolute inset-0 bg-gradient-to-r ${bgGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
      <div className="relative">
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{title}</p>
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
            <p className={`text-2xl font-black text-gray-800 mt-1 ${isLoading ? 'animate-pulse' : ''}`}>
              {isLoading ? '...' : value.toLocaleString()}
            </p>
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

// Borrow Form Component
function BorrowForm({ form, setForm, onSubmit, loading }) {
  const [availableTags, setAvailableTags] = useState([]);
  const [tagSearchTerm, setTagSearchTerm] = useState("");
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);

  // โหลดรายการ Tags ที่มี Asset และพร้อมยืม
  useEffect(() => {
    const loadAvailableTags = async () => {
      setLoadingTags(true);
      try {
        const response = await api.get("/api/borrowing/available-tags");
        setAvailableTags(response.data || []);
        console.log("Available tags loaded:", response.data); // Debug log
      } catch (error) {
        console.error("Failed to load available tags:", error);
        setAvailableTags([]);
      } finally {
        setLoadingTags(false);
      }
    };

    loadAvailableTags();
  }, []);

  // กรองรายการ Tags ตามคำค้นหา
  const filteredTags = availableTags.filter(tag => 
    tag.tag_id.toLowerCase().includes(tagSearchTerm.toLowerCase()) ||
    (tag.asset_name && tag.asset_name.toLowerCase().includes(tagSearchTerm.toLowerCase())) ||
    (tag.asset_id && String(tag.asset_id).toLowerCase().includes(tagSearchTerm.toLowerCase()))
  );

  // เลือก Tag และอัพเดทข้อมูล Asset อัตโนมัติ
  const handleSelectTag = (tag) => {
    setForm({
      ...form,
      tag_id: tag.tag_id,
      asset_id: String(tag.asset_id) || "" // แปลงเป็น string
    });
    setTagSearchTerm(`${tag.tag_id} - ${tag.asset_name || tag.asset_id}`);
    setIsTagDropdownOpen(false);
  };

  // รีเซ็ตการเลือก
  const handleClearSelection = () => {
    setForm({
      ...form,
      tag_id: "",
      asset_id: ""
    });
    setTagSearchTerm("");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-2xl flex items-center justify-center text-white text-2xl mx-auto mb-4 shadow-lg">
          📤
        </div>
        <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent mb-2">
          บันทึกการยืมอุปกรณ์
        </h3>
        <p className="text-gray-600">กรอกข้อมูลสำหรับการยืมอุปกรณ์ใหม่</p>
      </div>
      
      <form onSubmit={onSubmit} className="space-y-6">
        {/* Tag & Asset Selection */}
        <div className="group">
          <label className="block text-sm font-bold text-gray-700 mb-3">
            เลือกอุปกรณ์ที่ต้องการยืม <span className="text-red-500">*</span>
          </label>
          
          <div className="relative">
            <div className="relative">
              <input
                type="text"
                required={!form.tag_id}
                value={tagSearchTerm}
                onChange={(e) => {
                  setTagSearchTerm(e.target.value);
                  setIsTagDropdownOpen(true);
                }}
                onFocus={() => setIsTagDropdownOpen(true)}
                placeholder="ค้นหา Tag ID หรือชื่ออุปกรณ์..."
                className="w-full px-4 py-3 pr-20 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all duration-300 bg-white/80 backdrop-blur-sm group-hover:border-gray-300"
              />
              
              {/* Clear and Dropdown Toggle Buttons */}
              <div className="absolute inset-y-0 right-0 flex items-center">
                {form.tag_id && (
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsTagDropdownOpen(!isTagDropdownOpen)}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className={`w-4 h-4 transition-transform ${isTagDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Dropdown Menu */}
            {isTagDropdownOpen && (
              <div className="absolute z-50 w-full mt-1 bg-white border-2 border-gray-200 rounded-xl shadow-2xl max-h-80 overflow-y-auto">
                {loadingTags ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-gray-300 border-t-cyan-500 rounded-full animate-spin"></div>
                    <span className="ml-2 text-gray-600">กำลังโหลด...</span>
                  </div>
                ) : filteredTags.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.137 0-4.146.832-5.636 2.191M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="font-medium">ไม่พบอุปกรณ์</p>
                    <p className="text-sm">
                      {tagSearchTerm ? 'ลองค้นหาด้วยคำอื่น' : 'ไม่มีอุปกรณ์ที่พร้อมยืม'} 
                      <br />หรือยังไม่ได้ bind Tag กับ Asset
                    </p>
                  </div>
                ) : (
                  <div className="py-2">
                    {filteredTags.map((tag, index) => (
                      <button
                        key={tag.tag_id}
                        type="button"
                        onClick={() => handleSelectTag(tag)}
                        className={`w-full px-4 py-3 text-left hover:bg-cyan-50 hover:border-l-4 hover:border-cyan-500 transition-all duration-200 ${
                          index !== filteredTags.length - 1 ? 'border-b border-gray-100' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                              <div>
                                <p className="font-bold text-gray-900 text-sm">
                                  {tag.asset_name || 'ไม่ระบุชื่อ'}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                                    Tag: {tag.tag_id}
                                  </span>
                                  {tag.asset_id && (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                      Asset ID: {tag.asset_id}
                                    </span>
                                  )}
                                  {tag.asset_type && (
                                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                                      {tag.asset_type}
                                    </span>
                                  )}
                                </div>
                                {tag.location_name && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    📍 {tag.location_name}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">
                              ✅ พร้อมยืม
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Selected Tag Display */}
          {form.tag_id && (
            <div className="mt-3 p-3 bg-cyan-50 border border-cyan-200 rounded-lg">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium text-cyan-800">อุปกรณ์ที่เลือก:</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-800">
                  Tag: {form.tag_id}
                </span>
                {form.asset_id && (
                  <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded bg-blue-100 text-blue-800">
                    Asset ID: {form.asset_id}
                  </span>
                )}
              </div>
            </div>
          )}

          <p className="text-sm text-gray-500 mt-2 ml-1">
            💡 แสดงเฉพาะอุปกรณ์ที่มี Asset binding และพร้อมให้ยืม
          </p>
        </div>

        {/* Rest of the form remains the same */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="group">
            <label className="block text-sm font-bold text-gray-700 mb-3">
              ชื่อผู้ยืม <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={form.borrower_name}
                onChange={(e) => setForm({...form, borrower_name: e.target.value})}
                placeholder="ชื่อ-นามสกุล"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all duration-300 bg-white/80 backdrop-blur-sm group-hover:border-gray-300"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>
          </div>
          
          <div className="group">
            <label className="block text-sm font-bold text-gray-700 mb-3">
              เบอร์ติดต่อ
            </label>
            <div className="relative">
              <input
                type="text"
                value={form.borrower_contact}
                onChange={(e) => setForm({...form, borrower_contact: e.target.value})}
                placeholder="เบอร์โทร หรือ Email"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all duration-300 bg-white/80 backdrop-blur-sm group-hover:border-gray-300"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="group">
            <label className="block text-sm font-bold text-gray-700 mb-3">
              กำหนดคืน (วัน)
            </label>
            <select
              value={form.expected_return_days}
              onChange={(e) => setForm({...form, expected_return_days: parseInt(e.target.value)})}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all duration-300 bg-white/80 backdrop-blur-sm group-hover:border-gray-300"
            >
              <option value={1}>1 วัน</option>
              <option value={3}>3 วัน</option>
              <option value={7}>7 วัน</option>
              <option value={14}>14 วัน</option>
              <option value={30}>30 วัน</option>
            </select>
          </div>
        </div>

        <div className="group">
          <label className="block text-sm font-bold text-gray-700 mb-3">
            หมายเหตุ
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({...form, notes: e.target.value})}
            placeholder="หมายเหตุเพิ่มเติม..."
            rows={4}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all duration-300 bg-white/80 backdrop-blur-sm group-hover:border-gray-300 resize-none"
          />
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={loading || !form.tag_id}
            className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 disabled:from-gray-400 disabled:to-gray-500 text-white py-4 px-6 rounded-2xl font-bold text-lg transition-all duration-300 flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transform hover:-translate-y-1 disabled:transform-none"
          >
            {loading ? (
              <>
                <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                กำลังบันทึก...
              </>
            ) : (
              <>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                </svg>
                บันทึกการยืม
              </>
            )}
          </button>
        </div>
      </form>

      {/* Click outside to close dropdown */}
      {isTagDropdownOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsTagDropdownOpen(false)}
        />
      )}
    </div>
  );
}

// Return Form Component
function ReturnForm({ form, setForm, onSubmit, activeBorrows, loading }) {
  const [returnLocations, setReturnLocations] = useState([]);
  
  // โหลดรายการ locations เมื่อ component mount
  useEffect(() => {
    const loadLocations = async () => {
      try {
        const response = await api.get("/api/borrowing/locations");
        setReturnLocations(response.data || []);
      } catch (error) {
        console.error("Failed to load locations:", error);
      }
    };
    
    loadLocations();
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center text-white text-2xl mx-auto mb-4 shadow-lg">
          📥
        </div>
        <h3 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent mb-2">
          บันทึกการคืนอุปกรณ์
        </h3>
        <p className="text-gray-600">เลือกรายการที่ต้องการคืนและกรอกข้อมูล</p>
      </div>
      
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="group">
          <label className="block text-sm font-bold text-gray-700 mb-3">
            เลือกรายการที่จะคืน <span className="text-red-500">*</span>
          </label>
          <select
            required
            value={form.borrow_id}
            onChange={(e) => setForm({...form, borrow_id: e.target.value})}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-300 bg-white/80 backdrop-blur-sm group-hover:border-gray-300"
          >
            <option value="">-- เลือกรายการ --</option>
            {activeBorrows.map(borrow => (
              <option key={borrow.id} value={borrow.id}>
                {borrow.asset_name || borrow.asset_id} - {borrow.borrower_name} 
                ({borrow.days_borrowed} วัน)
                {borrow.is_overdue ? " - เกินกำหนด!" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="group">
          <label className="block text-sm font-bold text-gray-700 mb-3">
            สถานที่คืน
          </label>
          <select
            value={form.return_location_id || ""}
            onChange={(e) => setForm({...form, return_location_id: e.target.value ? parseInt(e.target.value) : null})}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-300 bg-white/80 backdrop-blur-sm group-hover:border-gray-300"
          >
            <option value="">-- ใช้ตำแหน่งปัจจุบันของ Tag --</option>
            {returnLocations.map(location => (
              <option key={location.location_id} value={location.location_id}>
                {location.name} {location.description && `(${location.description})`}
              </option>
            ))}
          </select>
          <p className="text-sm text-gray-500 mt-2 ml-1">
            💡 หากไม่เลือก ระบบจะใช้ตำแหน่งปัจจุบันของ Tag
          </p>
        </div>

        <div className="group">
          <label className="block text-sm font-bold text-gray-700 mb-3">
            หมายเหตุการคืน
          </label>
          <textarea
            value={form.return_notes}
            onChange={(e) => setForm({...form, return_notes: e.target.value})}
            placeholder="สภาพอุปกรณ์, หมายเหตุเพิ่มเติม..."
            rows={4}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-300 bg-white/80 backdrop-blur-sm group-hover:border-gray-300 resize-none"
          />
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={loading || !form.borrow_id}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:from-gray-400 disabled:to-gray-500 text-white py-4 px-6 rounded-2xl font-bold text-lg transition-all duration-300 flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transform hover:-translate-y-1 disabled:transform-none"
          >
            {loading ? (
              <>
                <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                กำลังบันทึก...
              </>
            ) : (
              <>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                </svg>
                บันทึกการคืน
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

// Active Borrows List Component
function ActiveBorrowsList({ borrows, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-full flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
          </div>
          <p className="text-gray-600 font-medium">กำลังโหลดรายการยืม...</p>
        </div>
      </div>
    );
  }

  if (borrows.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-20 h-20 bg-gradient-to-r from-blue-400 to-cyan-500 rounded-full flex items-center justify-center text-white text-3xl mx-auto mb-6 shadow-2xl">
          📦
        </div>
        <h3 className="text-2xl font-bold text-gray-800 mb-3">ไม่มีรายการยืม</h3>
        <p className="text-gray-600 text-lg max-w-md mx-auto">
          ยังไม่มีรายการยืมในปัจจุบัน เมื่อมีการยืมอุปกรณ์ จะแสดงที่นี่
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">อุปกรณ์</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">ผู้ยืม</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">วันที่ยืม</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">ควรคืน</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">ยืมมาแล้ว</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">สถานะ</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {borrows.map((borrow) => (
              <tr key={borrow.id} className="hover:bg-gray-50 transition-colors duration-200">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-bold text-gray-900">{borrow.asset_name || borrow.asset_id}</div>
                    <div className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded mt-1 inline-block">
                      {borrow.tag_id}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-bold text-gray-900">{borrow.borrower_name}</div>
                    {borrow.borrower_contact && (
                      <div className="text-xs text-gray-500">{borrow.borrower_contact}</div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                  {new Date(borrow.borrow_date).toLocaleDateString('th-TH')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                  {new Date(borrow.expected_return_date).toLocaleDateString('th-TH')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-blue-100 text-blue-800">
                    {borrow.days_borrowed} วัน
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {borrow.is_overdue ? (
                    <span className="inline-flex items-center px-3 py-1 text-sm font-bold rounded-full bg-red-100 text-red-800 border border-red-200">
                      ⚠️ เกินกำหนด {Math.abs(borrow.days_remaining)} วัน
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-3 py-1 text-sm font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      ✅ เหลือ {borrow.days_remaining} วัน
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Overdue Borrows List Component
function OverdueBorrowsList({ borrows, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-red-500 to-rose-600 rounded-full flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
          </div>
          <p className="text-gray-600 font-medium">กำลังโหลดรายการเกินกำหนด...</p>
        </div>
      </div>
    );
  }

  if (borrows.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-20 h-20 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full flex items-center justify-center text-white text-3xl mx-auto mb-6 shadow-2xl">
          ✅
        </div>
        <h3 className="text-2xl font-bold text-gray-800 mb-3">ไม่มีรายการเกินกำหนด</h3>
        <p className="text-gray-600 text-lg max-w-md mx-auto">
          ดีมาก! ยังไม่มีอุปกรณ์ที่เกินกำหนดคืน
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-red-200 bg-white shadow-xl">
      <div className="bg-gradient-to-r from-red-50 to-rose-50 px-6 py-4 border-b border-red-200">
        <h3 className="text-lg font-bold text-red-800">⚠️ รายการเกินกำหนดคืน</h3>
        <p className="text-sm text-red-600 mt-1">กรุณาติดตามให้ผู้ยืมคืนอุปกรณ์โดยเร็วที่สุด</p>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-red-200">
          <thead className="bg-red-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-red-600 uppercase tracking-wider">อุปกรณ์</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-red-600 uppercase tracking-wider">ผู้ยืม</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-red-600 uppercase tracking-wider">ควรคืน</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-red-600 uppercase tracking-wider">เกินมาแล้ว</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-red-600 uppercase tracking-wider">การติดต่อ</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-red-100">
            {borrows.map((borrow) => (
              <tr key={borrow.id} className="hover:bg-red-50 transition-colors duration-200">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-bold text-gray-900">{borrow.asset_name || borrow.asset_id}</div>
                    <div className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded mt-1 inline-block">
                      {borrow.tag_id}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-red-700">{borrow.borrower_name}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(borrow.expected_return_date).toLocaleDateString('th-TH')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                    {borrow.days_overdue} วัน
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {borrow.borrower_contact || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Borrow History List Component  
function BorrowHistoryList({ history, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">กำลังโหลด...</span>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">ไม่มีประวัติ</h3>
        <p className="mt-1 text-sm text-gray-500">ยังไม่มีประวัติการยืม-คืน</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden shadow-sm border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">อุปกรณ์</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ผู้ยืม</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันที่ยืม</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันที่คืน</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ยืมรวม</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สถานะ</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {history.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div>
                  <div className="text-sm font-medium text-gray-900">{item.asset_name || item.asset_id}</div>
                  <div className="text-sm text-gray-500">{item.tag_id}</div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.borrower_name}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {new Date(item.borrow_date).toLocaleDateString('th-TH')}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {item.return_date ? new Date(item.return_date).toLocaleDateString('th-TH') : '-'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.days_borrowed} วัน</td>
              <td className="px-6 py-4 whitespace-nowrap">
                {item.status === 'returned' ? (
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    item.is_overdue 
                      ? 'bg-orange-100 text-orange-800' 
                      : 'bg-green-100 text-green-800'
                  }`}>
                    คืนแล้ว{item.is_overdue ? ' (เกินกำหนด)' : ''}
                  </span>
                ) : (
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                    กำลังยืม
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}