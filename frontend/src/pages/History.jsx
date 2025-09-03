import { useState, useEffect, useRef } from "react";
import api from "../services/api";

export default function History() {
  const [tagQuery, setTagQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [assetQuery, setAssetQuery] = useState("");
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdate, setLastUpdate] = useState(null);
  
  // สถิติสำหรับแสดงด้านบน
  const [historyStats, setHistoryStats] = useState({
    totalRecords: 0,
    totalBorrows: 0,
    totalReturns: 0,
    pendingReturns: 0
  });

  const mountedRef = useRef(true);

  // ฟังก์ชันคำนวณสถิติจากข้อมูลประวัติ
  const calculateHistoryStats = (data) => {
    const totalRecords = data.length;
    const totalBorrows = data.filter(item => item.borrowed_at).length;
    const totalReturns = data.filter(item => item.returned_at).length;
    const pendingReturns = data.filter(item => item.borrowed_at && !item.returned_at).length;

    return { totalRecords, totalBorrows, totalReturns, pendingReturns };
  };

  // ฟังก์ชันโหลดข้อมูลประวัติ
  const fetchHistory = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    
    try {
      const response = await api.get("/api/history", {
        params: {
          tag: tagQuery || undefined,
          user: userQuery || undefined,
          asset: assetQuery || undefined,
        }
      });
      
      if (!mountedRef.current) return;
      
      const data = response.data || [];
      setHistoryData(data);
      
      // คำนวณสถิติ
      const stats = calculateHistoryStats(data);
      setHistoryStats(stats);
      
      setLastUpdate(new Date());
    } catch (e) {
      console.error("History fetch error:", e);
      if (mountedRef.current) {
        setError("ไม่สามารถโหลดประวัติได้ กรุณาตรวจสอบการเชื่อมต่อ");
      }
    } finally {
      if (mountedRef.current && showLoading) {
        setLoading(false);
      }
    }
  };

  // Effect สำหรับโหลดข้อมูลครั้งแรก
  useEffect(() => {
    mountedRef.current = true;
    fetchHistory(true);

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Manual refresh
  const handleRefresh = () => {
    fetchHistory(true);
  };

  // Clear filters
  const clearFilters = () => {
    setTagQuery("");
    setUserQuery("");
    setAssetQuery("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">สืบค้นประวัติ</h1>
          <p className="text-slate-600 mt-1">
            ค้นหาและตรวจสอบประวัติการใช้งาน RFID Tags
            {lastUpdate && (
              <span className="ml-2">
                - อัพเดตล่าสุด: {lastUpdate.toLocaleTimeString('th-TH')}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              กำลังโหลด...
            </>
          ) : (
            <>
              <span>🔄</span>
              รีเฟรช
            </>
          )}
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-red-400 mr-2">⚠️</span>
              <span className="text-red-700">{error}</span>
            </div>
            <button 
              onClick={() => setError("")}
              className="text-red-600 hover:text-red-800"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Stats Cards สำหรับประวัติ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="รายการทั้งหมด"
          subtitle="จำนวนรายการประวัติทั้งหมด"
          value={historyStats.totalRecords}
          icon="📋"
          color="blue"
          isLoading={loading && historyData.length === 0}
        />
        <StatsCard
          title="การเบิกทั้งหมด"
          subtitle="จำนวนครั้งที่มีการเบิกอุปกรณ์"
          value={historyStats.totalBorrows}
          icon="📤"
          color="green"
          isLoading={loading && historyData.length === 0}
        />
        <StatsCard
          title="การคืนทั้งหมด"
          subtitle="จำนวนครั้งที่มีการคืนอุปกรณ์"
          value={historyStats.totalReturns}
          icon="📥"
          color="yellow"
          isLoading={loading && historyData.length === 0}
        />
        <StatsCard
          title="รอการคืน"
          subtitle="อุปกรณ์ที่ยังไม่ได้คืน"
          value={historyStats.pendingReturns}
          icon="⏳"
          color="purple"
          isLoading={loading && historyData.length === 0}
        />
      </div>

      {/* Search Filters */}
      <div className="bg-white p-6 rounded-lg shadow border">
        <h3 className="text-lg font-semibold mb-4">ค้นหาประวัติ</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ค้นด้วย TAG อุปกรณ์
            </label>
            <input
              type="text"
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder="Tag ID..."
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ค้นด้วยผู้เบิก
            </label>
            <input
              type="text"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="ชื่อผู้เบิก..."
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ค้นด้วย ID Asset
            </label>
            <input
              type="text"
              value={assetQuery}
              onChange={(e) => setAssetQuery(e.target.value)}
              placeholder="Asset ID..."
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={fetchHistory}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                กำลังค้นหา...
              </>
            ) : (
              <>
                <span>🔍</span>
                ค้นหา
              </>
            )}
          </button>

          {(tagQuery || userQuery || assetQuery) && (
            <button 
              onClick={clearFilters}
              className="text-blue-600 hover:text-blue-800 font-medium text-sm bg-blue-50 px-3 py-2 rounded"
            >
              เคลียร์ตัวกรอง
            </button>
          )}
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-lg shadow border">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">ผลการค้นหา</h2>
            <span className="text-sm text-slate-500">
              พบ {historyData.length} รายการ
            </span>
          </div>
        </div>
        
        <div className="p-6">
          {loading && historyData.length === 0 ? (
            <LoadingSkeleton />
          ) : historyData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full table-auto border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border px-3 py-2 text-left text-sm font-medium text-slate-700">RFID</th>
                    <th className="border px-3 py-2 text-left text-sm font-medium text-slate-700">Asset ID</th>
                    <th className="border px-3 py-2 text-left text-sm font-medium text-slate-700">Spaze reference key</th>
                    <th className="border px-3 py-2 text-left text-sm font-medium text-slate-700">Type</th>
                    <th className="border px-3 py-2 text-left text-sm font-medium text-slate-700">ชื่ออุปกรณ์</th>
                    <th className="border px-3 py-2 text-left text-sm font-medium text-slate-700">วันที่เพิ่ม</th>
                    <th className="border px-3 py-2 text-left text-sm font-medium text-slate-700">วันที่เบิก</th>
                    <th className="border px-3 py-2 text-left text-sm font-medium text-slate-700">วันที่คืน</th>
                    <th className="border px-3 py-2 text-left text-sm font-medium text-slate-700">ผู้เบิก</th>
                    <th className="border px-3 py-2 text-left text-sm font-medium text-slate-700">ผู้บันทึกการเบิก</th>
                  </tr>
                </thead>
                <tbody>
                  {historyData.map((row, i) => (
                    <tr key={i} className={i % 2 ? "bg-white hover:bg-slate-50" : "bg-gray-50 hover:bg-slate-100"}>
                      <td className="border px-3 py-2 text-sm text-slate-700 font-mono">{row.rfid || '-'}</td>
                      <td className="border px-3 py-2 text-sm text-slate-700">{row.asset_id || '-'}</td>
                      <td className="border px-3 py-2 text-sm text-slate-700">{row.spaze_reference_key || '-'}</td>
                      <td className="border px-3 py-2 text-sm text-slate-700">{row.type || '-'}</td>
                      <td className="border px-3 py-2 text-sm text-slate-700">{row.device_name || '-'}</td>
                      <td className="border px-3 py-2 text-sm text-slate-700">
                        {row.created_at ? new Date(row.created_at).toLocaleString('th-TH') : '-'
                        }
                      </td>
                      <td className="border px-3 py-2 text-sm text-slate-700">
                        {row.borrowed_at ? new Date(row.borrowed_at).toLocaleString('th-TH') : '-'
                        }
                      </td>
                      <td className="border px-3 py-2 text-sm text-slate-700">
                        {row.returned_at ? new Date(row.returned_at).toLocaleString('th-TH') : '-'
                        }
                      </td>
                      <td className="border px-3 py-2 text-sm text-slate-700">{row.borrower || '-'}</td>
                      <td className="border px-3 py-2 text-sm text-slate-700">{row.recorded_by || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState 
              hasFilters={tagQuery || userQuery || assetQuery}
              onClearFilters={clearFilters}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Stats Card Component
function StatsCard({ title, subtitle, value, icon, color, isLoading }) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    green: "bg-green-50 text-green-700 border-green-200", 
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200"
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow border hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-lg ${colorClasses[color]} ${isLoading ? 'animate-pulse' : ''}`}>
          <span className="text-xl">{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-600 truncate">{title}</p>
          <p className="text-xs text-slate-500 mb-1 truncate">{subtitle}</p>
          <p className={`text-2xl font-bold text-slate-900 ${isLoading ? 'animate-pulse' : ''}`}>
            {isLoading ? '...' : value.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

// Loading Skeleton Component
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1,2,3,4,5].map(i => (
        <div key={i} className="animate-pulse">
          <div className="h-12 bg-slate-200 rounded"></div>
        </div>
      ))}
    </div>
  );
}

// Empty State Component
function EmptyState({ hasFilters, onClearFilters }) {
  return (
    <div className="text-center py-12 text-slate-500">
      <div className="text-4xl mb-4">📋</div>
      <div className="text-lg font-medium mb-2">
        {hasFilters ? 'ไม่พบประวัติที่ตรงกับเงื่อนไขการค้นหา' : 'ไม่พบข้อมูลประวัติ'}
      </div>
      {hasFilters && (
        <button 
          onClick={onClearFilters}
          className="mt-3 text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-4 py-2 rounded"
        >
          เคลียร์ตัวกรองทั้งหมด
        </button>
      )}
    </div>
  );
}