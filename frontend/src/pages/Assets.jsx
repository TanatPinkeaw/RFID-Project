import React, { useState, useEffect, useRef, useCallback } from 'react';
import api, { BASE_URL } from '../services/api';

export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [filteredAssets, setFilteredAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [viewMode, setViewMode] = useState('grid');
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [assetDetails, setAssetDetails] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    status: 'idle'
  });

  const wsRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const shouldReconnect = useRef(true);

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

  const connectWs = useCallback(() => {
    if (wsRef.current) return;
    const url = buildWsUrl();
    console.info("Assets WS ->", url);
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.error("Assets WS construct failed", e);
      const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts.current));
      reconnectAttempts.current += 1;
      setTimeout(() => connectWs(), delay);
      return;
    }

    ws.onopen = () => {
      reconnectAttempts.current = 0;
      wsRef.current = ws;
      console.info("Assets WS open");
    };

    ws.onmessage = (ev) => {
      try {
        console.log("Assets WS raw:", ev.data);
        const data = JSON.parse(ev.data);
        console.log("Assets WS parsed:", data);
        if (!data) return;

        // 1) asset_update -> create/update/delete
        if (data.type === "asset_update") {
          const action = data.action;
          if (action === "delete") {
            const id = data.asset_id;
            setAssets((prev) => prev.filter((a) => a.asset_id !== id));
            return;
          }
          const incoming = data.asset;
          if (!incoming) return;
          setAssets((prev) => {
            const idx = prev.findIndex((a) => a.asset_id === incoming.asset_id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = { ...copy[idx], ...incoming };
              return copy;
            } else {
              return [incoming, ...prev];
            }
          });
          return;
        }

        // 2) tag_update -> if tag has asset_id then refresh/merge that asset
        if (data.type === "tag_update" || data.type === "tag") {
          const tag = data.tag || data;
          const aid = tag.asset_id ?? tag.assetId ?? null;
          if (!aid) return;

          // if we already have the asset, merge small fields; otherwise fetch full asset
          setAssets((prev) => {
            const idx = prev.findIndex((a) => a.asset_id === aid);
            if (idx >= 0) {
              const copy = [...prev];
              if (tag.authorized !== undefined) copy[idx] = { ...copy[idx], authorized: !!tag.authorized };
              if (tag.last_seen) copy[idx] = { ...copy[idx], last_seen: tag.last_seen };
              // update status if we can infer
              if (tag.status) copy[idx] = { ...copy[idx], status: tag.status };
              return copy;
            } else {
              // fetch asset from API and prepend when available
              (async () => {
                try {
                  const res = await api.get(`/api/assets/${aid}`);
                  setAssets((prev2) => {
                    if (prev2.some((p) => p.asset_id === res.data.asset_id)) return prev2;
                    return [res.data, ...prev2];
                  });
                } catch (err) {
                  console.error("Failed to fetch asset for tag_update:", err);
                }
              })();
              return prev;
            }
          });
          return;
        }

        // 3) notification-like frames that include asset_id -> refresh asset
        const payloadAssetId = data.asset_id ?? data.asset?.asset_id ?? null;
        if (payloadAssetId) {
          (async () => {
            try {
              const res = await api.get(`/api/assets/${payloadAssetId}`);
              setAssets((prev) => {
                const idx = prev.findIndex((a) => a.asset_id === res.data.asset_id);
                if (idx >= 0) {
                  const copy = [...prev];
                  copy[idx] = { ...copy[idx], ...res.data };
                  return copy;
                } else {
                  return [res.data, ...prev];
                }
              });
            } catch (err) {
              console.error("Failed to refresh asset from notification payload:", err);
            }
          })();
          return;
        }

      } catch (e) {
        console.error("Assets WS parse error", e);
      }
    };

    ws.onclose = (ev) => {
      if (wsRef.current === ws) wsRef.current = null;
      if (!shouldReconnect.current) return;
      const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts.current));
      reconnectAttempts.current += 1;
      console.warn("Assets WS closed, reconnect in", delay, "ms");
      setTimeout(() => connectWs(), delay);
    };

    ws.onerror = (err) => {
      console.error("Assets WS error", err);
      try { ws.close(); } catch (_) {}
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

  useEffect(() => {
    loadAssets();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [assets, searchQuery, statusFilter, typeFilter, sortBy]);

  const loadAssets = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/assets');
      setAssets(response.data);
    } catch (error) {
      setError('ไม่สามารถโหลดข้อมูล Assets ได้');
      console.error('Failed to load assets:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...assets];

    if (searchQuery) {
      filtered = filtered.filter(asset => 
        asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.asset_id.toString().includes(searchQuery)
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(asset => asset.status === statusFilter);
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(asset => asset.type === typeFilter);
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'type':
          return a.type.localeCompare(b.type);
        case 'status':
          return a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });

    setFilteredAssets(filtered);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      if (editingAsset) {
        await api.put(`/api/assets/${editingAsset.asset_id}`, formData);
        setSuccess('แก้ไข Asset สำเร็จ');
      } else {
        await api.post('/api/assets', formData);
        setSuccess('เพิ่ม Asset สำเร็จ');
      }
      
      setShowModal(false);
      setEditingAsset(null);
      setFormData({ name: '', type: '', status: 'idle' });
      await loadAssets();
      
    } catch (error) {
      // แก้ไขการ handle error
      let errorMessage = 'ไม่สามารถบันทึกข้อมูลได้';
      
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          // ถ้าเป็น validation errors
          errorMessage = error.response.data.detail
            .map(err => err.msg || err.message || 'Validation error')
            .join(', ');
        } else if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail;
        }
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (asset) => {
    if (!confirm(`ต้องการลบ Asset "${asset.name}" หรือไม่?`)) return;
    
    try {
      setLoading(true);
      await api.delete(`/api/assets/${asset.asset_id}`);
      setSuccess('ลบ Asset สำเร็จ');
      await loadAssets();
    } catch (error) {
      setError(error.response?.data?.detail || 'ไม่สามารถลบ Asset ได้');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (asset) => {
    try {
      setLoading(true);
      const response = await api.get(`/api/assets/${asset.asset_id}`);
      setAssetDetails(response.data);
      setShowDetailsModal(true);
    } catch (error) {
      setError('ไม่สามารถโหลดรายละเอียดได้');
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (asset) => {
    setEditingAsset(asset);
    setFormData({
      name: asset.name,
      type: asset.type,
      status: asset.status
    });
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditingAsset(null);
    setFormData({ name: '', type: '', status: 'idle' });
    setShowModal(true);
  };

  const getStatusInfo = (asset) => {
    switch (asset.status) {
      case 'in_use':
        return { label: 'In Use', color: 'bg-green-100 text-green-800 border-green-200', icon: '✅' };
      case 'borrowed':
        return { label: 'Borrowed', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: '📤' };
      case 'idle':
        return { label: 'Available', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: '💤' };
      default:
        return { label: 'Unknown', color: 'bg-gray-100 text-gray-800 border-gray-200', icon: '❓' };
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setTypeFilter('all');
    setSortBy('recent');
  };

  const stats = {
    total: assets.length,
    inUse: assets.filter(a => a.status === 'in_use').length,
    borrowed: assets.filter(a => a.status === 'borrowed').length,
    available: assets.filter(a => a.status === 'idle').length
  };

  const types = [...new Set(assets.map(a => a.type).filter(Boolean))];

  if (loading && assets.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-cyan-100 flex items-center justify-center">
        <div className="text-center bg-white/80 backdrop-blur-lg rounded-3xl p-12 shadow-2xl border border-white/20">
          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
          </div>
          <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-3">
            กำลังโหลดข้อมูล Assets
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
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-teal-500/5"></div>
          
          <div className="relative flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-14 h-14 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">
                  📦
                </div>
                <div>
                  <h1 className="text-3xl font-black bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent">
                    Assets Management
                  </h1>
                  <p className="text-gray-600 mt-1">จัดการและติดตามทรัพย์สินในระบบ Real-time</p>
                </div>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={loadAssets}
                disabled={loading}
                className="group flex items-center gap-2 px-4 py-2 bg-white border-2 border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all duration-300 disabled:opacity-50 shadow-lg hover:shadow-xl"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin"></div>
                ) : (
                  <span className="text-lg group-hover:rotate-180 transition-transform duration-500">🔄</span>
                )}
                <span className="font-semibold text-sm">รีเฟรช</span>
              </button>
              <button
                onClick={openCreateModal}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl hover:from-emerald-600 hover:to-teal-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                disabled={loading}
              >
                <span className="text-lg">➕</span>
                <span className="font-semibold text-sm">เพิ่ม Asset</span>
              </button>
            </div>
          </div>
        </div>

        {/* Alert Messages */}
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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatsCard title="Total Assets" value={stats.total} icon="📦" color="blue" />
          <StatsCard title="In Use" value={stats.inUse} icon="✅" color="green" />
          <StatsCard title="Borrowed" value={stats.borrowed} icon="📤" color="yellow" />
          <StatsCard title="Available" value={stats.available} icon="💤" color="gray" />
        </div>

        {/* Filters and Controls */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 mb-6 overflow-hidden">
          <div className="p-6">
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-end">
              {/* Search */}
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-bold text-gray-700 mb-2">ค้นหา Assets</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ค้นหาด้วยชื่อ, ประเภท หรือ Asset ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white shadow-lg transition-all duration-300"
                  />
                  <span className="absolute left-4 top-3.5 text-gray-400 text-xl">🔍</span>
                </div>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">สถานะ</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white shadow-lg font-medium"
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="idle">Available</option>
                  <option value="in_use">In Use</option>
                  <option value="borrowed">Borrowed</option>
                </select>
              </div>

              {/* Type Filter */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">ประเภท</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white shadow-lg font-medium"
                >
                  <option value="all">ทั้งหมด</option>
                  {types.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* Sort */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">เรียงตาม</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white shadow-lg font-medium"
                >
                  <option value="recent">ล่าสุด</option>
                  <option value="name">ชื่อ</option>
                  <option value="type">ประเภท</option>
                  <option value="status">สถานะ</option>
                </select>
              </div>

              {/* View Mode */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">มุมมอง</label>
                <div className="flex border-2 border-gray-200 rounded-xl overflow-hidden shadow-lg">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`px-4 py-3 text-sm font-bold flex items-center gap-2 transition-all duration-300 ${
                      viewMode === 'grid' 
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg' 
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-lg">📱</span> Grid
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`px-4 py-3 text-sm font-bold flex items-center gap-2 transition-all duration-300 ${
                      viewMode === 'table' 
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg' 
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-lg">📋</span> Table
                  </button>
                </div>
              </div>

              {/* Clear Filters */}
              {(searchQuery || statusFilter !== 'all' || typeFilter !== 'all' || sortBy !== 'recent') && (
                <button
                  onClick={clearFilters}
                  className="px-4 py-3 text-sm font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 rounded-xl border-2 border-red-200 hover:border-red-300 transition-all duration-300 shadow-lg"
                >
                  🗑️ Clear
                </button>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-gray-600">
                แสดง <span className="font-bold text-emerald-600">{filteredAssets.length}</span> จาก <span className="font-bold text-gray-800">{assets.length}</span> assets
              </span>
            </div>
          </div>
        </div>

        {/* Assets Display */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
          <div className="p-6">
            {filteredAssets.length === 0 ? (
              <EmptyState hasFilters={searchQuery || statusFilter !== 'all' || typeFilter !== 'all'} />
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredAssets.map((asset) => (
                  <AssetCard
                    key={asset.asset_id}
                    asset={asset}
                    onViewDetails={() => handleViewDetails(asset)}
                    onEdit={() => openEditModal(asset)}
                    onDelete={() => handleDelete(asset)}
                    getStatusInfo={getStatusInfo}
                  />
                ))}
              </div>
            ) : (
              <AssetTable
                assets={filteredAssets}
                onViewDetails={handleViewDetails}
                onEdit={openEditModal}
                onDelete={handleDelete}
                getStatusInfo={getStatusInfo}
              />
            )}
          </div>
        </div>

        {/* Modals */}
        {showModal && (
          <AssetModal
            asset={editingAsset}
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleSubmit}
            onClose={() => setShowModal(false)}
            loading={loading}
          />
        )}

        {showDetailsModal && (
          <DetailsModal
            asset={assetDetails}
            onClose={() => {
              setShowDetailsModal(false);
              setAssetDetails(null);
            }}
            getStatusInfo={getStatusInfo}
          />
        )}
      </div>
    </div>
  );
}

// Shared Components เหมือน Tags.jsx
function StatsCard({ title, value, icon, color }) {
  const gradients = {
    blue: 'from-blue-500 to-purple-600',
    green: 'from-emerald-500 to-teal-600',
    gray: 'from-gray-500 to-slate-600',
    yellow: 'from-amber-500 to-orange-600'
  };

  const bgGradients = {
    blue: 'from-blue-500/5 to-purple-500/5',
    green: 'from-emerald-500/5 to-teal-500/5',
    gray: 'from-gray-500/5 to-slate-500/5',
    yellow: 'from-amber-500/5 to-orange-500/5'
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

function AssetCard({ asset, onViewDetails, onEdit, onDelete, getStatusInfo }) {
  const statusInfo = getStatusInfo(asset);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(asset.asset_id.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group border-2 border-gray-200 hover:border-emerald-300 rounded-2xl p-6 hover:shadow-2xl transition-all duration-300 bg-white transform hover:-translate-y-1 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      
      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg">
                📦
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 truncate text-lg">
                  {asset.name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded-lg">
                    ID: {asset.asset_id}
                  </span>
                  <button
                    onClick={handleCopy}
                    className={`text-xs px-2 py-1 rounded-lg transition-all duration-300 ${
                      copied ? 'bg-emerald-100 text-emerald-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {copied ? '✓ คัดลอกแล้ว' : '📋 คัดลอก'}
                  </button>
                </div>
              </div>
            </div>
            
            <div className={`inline-flex items-center px-3 py-2 rounded-xl text-sm font-bold border-2 ${statusInfo.color} shadow-lg`}>
              <span className="mr-2 text-lg">{statusInfo.icon}</span>
              {statusInfo.label}
            </div>
          </div>
        </div>

        <div className="space-y-3 text-sm text-gray-600 mb-6">
          <div className="flex justify-between items-center">
            <span className="font-medium">Type:</span>
            <span className="font-bold text-gray-800 bg-gray-100 px-3 py-1 rounded-lg">{asset.type}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-medium">Created:</span>
            <span className="font-bold text-gray-800">
              {new Date(asset.created_at).toLocaleDateString('th-TH')}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onViewDetails}
            className="flex-1 px-4 py-2 text-sm bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 rounded-xl hover:from-gray-200 hover:to-gray-300 transition-all duration-300 font-bold shadow-lg hover:shadow-xl"
          >
             รายละเอียด
          </button>
          <button
            onClick={onEdit}
            className="flex-1 px-4 py-2 text-sm bg-gradient-to-r from-blue-100 to-blue-200 text-blue-700 rounded-xl hover:from-blue-200 hover:to-blue-300 transition-all duration-300 font-bold shadow-lg hover:shadow-xl"
          >
            ✏️ แก้ไข
          </button>
          <button
            onClick={onDelete}
            className="px-4 py-2 text-sm bg-gradient-to-r from-red-100 to-red-200 text-red-700 rounded-xl hover:from-red-200 hover:to-red-300 transition-all duration-300 font-bold shadow-lg hover:shadow-xl"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

function AssetTable({ assets, onViewDetails, onEdit, onDelete, getStatusInfo }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-3 px-2 font-medium text-gray-700">Asset ID</th>
            <th className="text-left py-3 px-2 font-medium text-gray-700">Name</th>
            <th className="text-left py-3 px-2 font-medium text-gray-700">Type</th>
            <th className="text-left py-3 px-2 font-medium text-gray-700">Status</th>
            <th className="text-left py-3 px-2 font-medium text-gray-700">Created</th>
            <th className="text-center py-3 px-2 font-medium text-gray-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const statusInfo = getStatusInfo(asset);
            return (
              <tr key={asset.asset_id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-2">
                  <span className="font-mono text-sm font-medium">{asset.asset_id}</span>
                </td>
                <td className="py-3 px-2">
                  <span className="text-sm font-medium">{asset.name}</span>
                </td>
                <td className="py-3 px-2">
                  <span className="text-sm">{asset.type}</span>
                </td>
                <td className="py-3 px-2">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${statusInfo.color}`}>
                    <span className="mr-1">{statusInfo.icon}</span>
                    {statusInfo.label}
                  </span>
                </td>
                <td className="py-3 px-2">
                  <span className="text-xs text-gray-600">
                    {new Date(asset.created_at).toLocaleString('th-TH')}
                  </span>
                </td>
                <td className="py-3 px-2">
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={() => onViewDetails(asset)}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      ดู
                    </button>
                    <button
                      onClick={() => onEdit(asset)}
                      className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      แก้ไข
                    </button>
                    <button
                      onClick={() => onDelete(asset)}
                      className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      ลบ
                    </button>
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

function AssetModal({ asset, formData, setFormData, onSubmit, onClose, loading }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {asset ? 'แก้ไข Asset' : 'เพิ่ม Asset ใหม่'}
          </h3>
          
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ชื่อ Asset
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ประเภท
              </label>
              <input
                type="text"
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value})}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                สถานะ
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value})}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="idle">Available</option>
                <option value="in_use">In Use</option>
                <option value="borrowed">Borrowed</option>
              </select>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                disabled={loading}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                {asset ? 'บันทึกการแก้ไข' : 'เพิ่ม Asset'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function DetailsModal({ asset, onClose, getStatusInfo }) {
  if (!asset) return null;

  const statusInfo = getStatusInfo(asset);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              รายละเอียด Asset {asset.asset_id}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            <DetailRow label="Asset ID" value={asset.asset_id} mono />
            <DetailRow label="ชื่อ" value={asset.name} />
            <DetailRow label="ประเภท" value={asset.type} />
            <DetailRow 
              label="สถานะ" 
              value={
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${statusInfo.color}`}>
                  <span className="mr-1">{statusInfo.icon}</span>
                  {statusInfo.label}
                </span>
              }
            />
            <DetailRow 
              label="Created At" 
              value={new Date(asset.created_at).toLocaleString('th-TH')} 
            />
            {asset.updated_at && (
              <DetailRow 
                label="Updated At" 
                value={new Date(asset.updated_at).toLocaleString('th-TH')} 
              />
            )}
          </div>

          <div className="mt-6 pt-6 border-t">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              ปิด
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100">
      <span className="text-sm font-medium text-gray-600">{label}:</span>
      <span className={`text-sm text-gray-900 text-right ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function EmptyState({ hasFilters }) {
  return (
    <div className="text-center py-16">
      <div className="relative mx-auto mb-8 w-24 h-24">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-600 rounded-full blur opacity-25 animate-pulse"></div>
        <div className="relative w-24 h-24 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full flex items-center justify-center text-white shadow-2xl">
          <span className="text-4xl">📦</span>
        </div>
      </div>
      
      <h3 className="text-2xl font-bold text-gray-800 mb-3">
        {hasFilters ? 'ไม่พบ Assets ที่ตรงกับเงื่อนไข' : 'ไม่มี Assets ในระบบ'}
      </h3>
      <p className="text-gray-600 text-lg max-w-md mx-auto leading-relaxed">
        {hasFilters ? 'ลองปรับเงื่อนไขการค้นหาหรือเคลียร์ตัวกรอง' : 'เริ่มต้นด้วยการเพิ่ม Assets เข้าสู่ระบบ'}
      </p>
    </div>
  );
}