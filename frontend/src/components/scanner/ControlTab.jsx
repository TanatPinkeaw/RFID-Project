import React, { useState, useEffect } from 'react';

export default function ControlTab({ 
  connectedDevices,
  selectedDevice,
  onStartScanning, 
  onStopScanning, 
  onManualUpdate, 
  loading,
  wsConnected
}) {
  // --- Settings state & handlers ---
  const [settings, setSettings] = useState({
    SCAN_INTERVAL: 0.1,
    DB_UPDATE_INTERVAL: 1,
    DELAY_SECONDS: 20
  });
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function fetchSettings() {
      setLoadingSettings(true);
      try {
        const res = await fetch('/api/system-config/scan-settings');
        if (!res.ok) throw new Error('Failed to load settings');
        const data = await res.json();
        setSettings(prev => ({
          ...prev,
          SCAN_INTERVAL: data.SCAN_INTERVAL?.value ?? prev.SCAN_INTERVAL,
          DB_UPDATE_INTERVAL: data.DB_UPDATE_INTERVAL?.value ?? prev.DB_UPDATE_INTERVAL,
          DELAY_SECONDS: data.DELAY_SECONDS?.value ?? prev.DELAY_SECONDS
        }));
      } catch (e) {
        console.error('Load settings error', e);
      } finally {
        setLoadingSettings(false);
      }
    }
    fetchSettings();
  }, []);

  const updateField = (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const updates = [
        { key: 'SCAN_INTERVAL', value: String(settings.SCAN_INTERVAL) },
        { key: 'DB_UPDATE_INTERVAL', value: String(settings.DB_UPDATE_INTERVAL) },
        { key: 'DELAY_SECONDS', value: String(settings.DELAY_SECONDS) }
      ];
      await Promise.all(updates.map(u =>
        fetch(`/api/system-config/${u.key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: u.value })
        }).then(r => {
          if (!r.ok) throw new Error(`${u.key} update failed`);
          return r.json();
        })
      ));
      setMessage('บันทึกการตั้งค่าเรียบร้อยแล้ว');
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      console.error('Save settings error', e);
      setMessage('บันทึกการตั้งค่าล้มเหลว');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = async () => {
    if (!confirm('ต้องการรีเซ็ตค่ากลับค่าเริ่มต้นหรือไม่?')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/system-config/reset-defaults', { method: 'POST' });
      if (!res.ok) throw new Error('Reset failed');
      
      // reload settings
      const res2 = await fetch('/api/system-config/scan-settings');
      const newSettings = await res2.json();
      setSettings({
        SCAN_INTERVAL: newSettings.SCAN_INTERVAL?.value ?? 0.1,
        DB_UPDATE_INTERVAL: newSettings.DB_UPDATE_INTERVAL?.value ?? 1,
        DELAY_SECONDS: newSettings.DELAY_SECONDS?.value ?? 20
      });
      setMessage('รีเซ็ตสำเร็จ');
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      console.error('Reset error', e);
      setMessage('รีเซ็ตล้มเหลว');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  // ✨ Enhanced Empty State
  if (!connectedDevices || connectedDevices.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="relative mx-auto mb-8">
          <div className="absolute inset-0 bg-gradient-to-r from-orange-400 to-red-600 rounded-full blur opacity-75 animate-pulse"></div>
        </div>
        <h3 className="text-3xl font-bold text-gray-800 mb-4">ไม่มี Scanner เชื่อมต่อ</h3>
        <p className="text-gray-600 max-w-md mx-auto text-lg font-medium leading-relaxed mb-8">
          กรุณาเชื่อมต่อ RFID Scanner ก่อนใช้งานฟังก์ชันการควบคุมและตั้งค่าระบบ
        </p>
        <div className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl">
          <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse"></div>
          <span className="font-bold text-amber-800 text-sm uppercase tracking-wide">
            ⚠️ ต้องการการเชื่อมต่อ
          </span>
        </div>
      </div>
    );
  }

  // ✨ Enhanced No Selection State
  if (!selectedDevice) {
    return (
      <div className="relative overflow-hidden bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200 rounded-3xl shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-orange-500/5"></div>
        <div className="relative p-8">
          <div className="flex items-start gap-6">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-orange-600 rounded-xl blur opacity-75 animate-pulse"></div>
              <div className="relative w-16 h-16 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl flex items-center justify-center text-white text-3xl shadow-xl animate-float">
                ⚠️
              </div>
            </div>
            <div className="flex-1">
              <h4 className="text-2xl font-bold text-gray-800 mb-3">ไม่ได้เลือก Scanner</h4>
              <p className="text-gray-700 text-lg font-medium leading-relaxed">
                กรุณาเลือก Scanner จากรายการด้านบนเพื่อใช้งานฟังก์ชันการควบคุมและตั้งค่าระบบ
              </p>
              <div className="mt-6">
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 border border-amber-300 rounded-xl text-sm font-bold text-amber-800">
                  <span>🎯</span>
                  <span>โปรดเลือก Scanner</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* 🎨 Beautiful Message Alert */}
      {message && (
        <div className={`relative overflow-hidden rounded-2xl border-2 shadow-xl transition-all duration-500 ${
          message.includes('สำเร็จ') || message.includes('เรียบร้อย')
            ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200' 
            : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-200'
        }`}>
          <div className={`absolute inset-0 ${
            message.includes('สำเร็จ') || message.includes('เรียบร้อย')
              ? 'bg-gradient-to-r from-emerald-500/5 to-teal-500/5' 
              : 'bg-gradient-to-r from-red-500/5 to-rose-500/5'
          }`}></div>
          <div className="relative p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white text-2xl shadow-lg ${
                  message.includes('สำเร็จ') || message.includes('เรียบร้อย')
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500' 
                    : 'bg-gradient-to-r from-red-500 to-rose-500'
                }`}>
                  {message.includes('สำเร็จ') || message.includes('เรียบร้อย') ? '✅' : '❌'}
                </div>
                <div>
                  <h4 className={`font-bold text-lg ${
                    message.includes('สำเร็จ') || message.includes('เรียบร้อย') ? 'text-emerald-800' : 'text-red-800'
                  }`}>
                    {message.includes('สำเร็จ') || message.includes('เรียบร้อย') ? 'สำเร็จ!' : 'เกิดข้อผิดพลาด'}
                  </h4>
                  <p className={`font-medium ${
                    message.includes('สำเร็จ') || message.includes('เรียบร้อย') ? 'text-emerald-700' : 'text-red-700'
                  }`}>
                    {message}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setMessage('')}
                className={`text-2xl hover:scale-110 transition-all duration-200 w-8 h-8 flex items-center justify-center rounded-lg ${
                  message.includes('สำเร็จ') || message.includes('เรียบร้อย')
                    ? 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100' 
                    : 'text-red-600 hover:text-red-800 hover:bg-red-100'
                }`}
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✨ Enhanced System Settings Panel */}
      <div className="relative overflow-hidden bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5"></div>
        
        <div className="relative p-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* SCAN_INTERVAL */}
            <div className="group relative overflow-hidden bg-white rounded-2xl border-2 border-violet-200 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-2">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-50 to-purple-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              
              <div className="relative p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="relative w-14 h-14 bg-gradient-to-r from-violet-500 to-purple-600 rounded-xl flex items-center justify-center text-white text-2xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <span className="relative">⏱️</span>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-gray-800 group-hover:text-gray-900 transition-colors">
                      SCAN_INTERVAL
                    </h4>
                    <p className="text-sm font-mono bg-gray-100 px-2 py-1 rounded-lg text-gray-600 inline-block">
                      ช่วงเวลาระหว่างการสแกน
                    </p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={settings.SCAN_INTERVAL}
                      onChange={(e) => updateField('SCAN_INTERVAL', parseFloat(e.target.value))}
                      className="w-full px-6 py-4 bg-white border-2 border-gray-200 rounded-2xl font-semibold text-lg focus:outline-none focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all duration-300 pr-20 shadow-sm disabled:opacity-50"
                      disabled={loadingSettings || saving}
                      placeholder="0.1"
                    />
                    <span className="absolute right-6 top-1/2 transform -translate-y-1/2 text-sm font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-lg">
                      วินาที
                    </span>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-violet-50 to-purple-50 border-2 border-violet-200 rounded-2xl p-4 mb-4">
                  <p className="text-sm text-gray-700 leading-relaxed font-medium">
                    กำหนดระยะเวลาระหว่างการสแกน RFID แต่ละรอบ
                  </p>
                </div>

                <div className="text-center">
                  <span className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl text-sm font-semibold text-blue-700">
                    <span>💡</span>
                    <span>แนะนำ: 0.1-0.5 วินาที</span>
                  </span>
                </div>
              </div>
            </div>

            {/* DB_UPDATE_INTERVAL */}
            <div className="group relative overflow-hidden bg-white rounded-2xl border-2 border-emerald-200 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-2">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-teal-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              
              <div className="relative p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="relative w-14 h-14 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center text-white text-2xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <span className="relative">💾</span>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-gray-800 group-hover:text-gray-900 transition-colors">
                      DB_UPDATE_INTERVAL
                    </h4>
                    <p className="text-sm font-mono bg-gray-100 px-2 py-1 rounded-lg text-gray-600 inline-block">
                      ช่วงเวลาการอัปเดตฐานข้อมูล
                    </p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={settings.DB_UPDATE_INTERVAL}
                      onChange={(e) => updateField('DB_UPDATE_INTERVAL', parseFloat(e.target.value))}
                      className="w-full px-6 py-4 bg-white border-2 border-gray-200 rounded-2xl font-semibold text-lg focus:outline-none focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all duration-300 pr-20 shadow-sm disabled:opacity-50"
                      disabled={loadingSettings || saving}
                      placeholder="1.0"
                    />
                    <span className="absolute right-6 top-1/2 transform -translate-y-1/2 text-sm font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-lg">
                      วินาที
                    </span>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-2xl p-4 mb-4">
                  <p className="text-sm text-gray-700 leading-relaxed font-medium">
                    กำหนดระยะเวลาในการอัปเดตข้อมูลลงฐานข้อมูล
                  </p>
                </div>

                <div className="text-center">
                  <span className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl text-sm font-semibold text-blue-700">
                    <span>💡</span>
                    <span>แนะนำ: 1-5 วินาที</span>
                  </span>
                </div>
              </div>
            </div>

            {/* DELAY_SECONDS */}
            <div className="group relative overflow-hidden bg-white rounded-2xl border-2 border-amber-200 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-2">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-orange-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              
              <div className="relative p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="relative w-14 h-14 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl flex items-center justify-center text-white text-2xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <span className="relative">⏳</span>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-gray-800 group-hover:text-gray-900 transition-colors">
                      DELAY_SECONDS
                    </h4>
                    <p className="text-sm font-mono bg-gray-100 px-2 py-1 rounded-lg text-gray-600 inline-block">
                      หน่วงเวลาก่อนประมวลผลซ้ำ
                    </p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="relative">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={settings.DELAY_SECONDS}
                      onChange={(e) => updateField('DELAY_SECONDS', parseInt(e.target.value || '0', 10))}
                      className="w-full px-6 py-4 bg-white border-2 border-gray-200 rounded-2xl font-semibold text-lg focus:outline-none focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 transition-all duration-300 pr-20 shadow-sm disabled:opacity-50"
                      disabled={loadingSettings || saving}
                      placeholder="20"
                    />
                    <span className="absolute right-6 top-1/2 transform -translate-y-1/2 text-sm font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-lg">
                      วินาที
                    </span>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl p-4 mb-4">
                  <p className="text-sm text-gray-700 leading-relaxed font-medium">
                    หน่วงเวลาก่อนประมวลผล tag เดิมซ้ำอีกครั้ง
                  </p>
                </div>

                <div className="text-center">
                  <span className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl text-sm font-semibold text-blue-700">
                    <span>💡</span>
                    <span>แนะนำ: 10-30 วินาที</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 flex flex-wrap gap-4 justify-center">
            <button
              onClick={saveSettings}
              disabled={saving || loadingSettings}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-4 px-8 rounded-2xl hover:from-emerald-600 hover:to-teal-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-1 flex items-center gap-3"
            >
              {saving ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>กำลังบันทึก...</span>
                </>
              ) : (
                <>
                  <span className="text-xl">💾</span>
                  <span>บันทึกการตั้งค่า</span>
                </>
              )}
            </button>

            <button
              onClick={resetDefaults}
              disabled={saving || loadingSettings}
              className="bg-white border-2 border-gray-300 text-gray-700 font-bold py-4 px-8 rounded-2xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-1 flex items-center gap-3"
            >
              <span className="text-xl">🔄</span>
              <span>รีเซ็ตเป็นค่าเริ่มต้น</span>
            </button>
          </div>
        </div>
      </div>

      {/* ✨ Enhanced Help Information */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 rounded-3xl shadow-2xl">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
        
        <div className="relative p-8 text-white">
          <div className="flex items-start gap-6 mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-white/20 rounded-2xl blur-sm animate-pulse"></div>
              <div className="relative w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-4xl border border-white/30">
                💡
              </div>
            </div>
            <div>
              <h4 className="text-4xl font-black mb-3">
                คู่มือการใช้งานการควบคุมระบบ
              </h4>
              <p className="text-white/90 text-xl font-medium">
                แนวทางในการควบคุมและปรับแต่งระบบ RFID Scanner
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-2xl border border-white/30 group-hover:scale-110 transition-transform duration-300">
                  🎮
                </div>
                <div>
                  <h5 className="text-xl font-bold">การควบคุม Scanner</h5>
                  <p className="text-white/80 text-sm">Control Panel</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-white/60 rounded-full"></div>
                  <span className="text-white/90 font-medium">เริ่ม/หยุดการสแกน RFID</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-white/60 rounded-full"></div>
                  <span className="text-white/90 font-medium">อัปเดตข้อมูลแบบ Manual</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-white/60 rounded-full"></div>
                  <span className="text-white/90 font-medium">ตรวจสอบสถานะ Real-time</span>
                </div>
              </div>
            </div>
            
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-2xl border border-white/30 group-hover:scale-110 transition-transform duration-300">
                  ⚙️
                </div>
                <div>
                  <h5 className="text-xl font-bold">การตั้งค่าระบบ</h5>
                  <p className="text-white/80 text-sm">System Configuration</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-white/60 rounded-full"></div>
                  <span className="text-white/90 font-medium">ปรับความถี่การสแกน</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-white/60 rounded-full"></div>
                  <span className="text-white/90 font-medium">ตั้งค่าการอัปเดต DB</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-white/60 rounded-full"></div>
                  <span className="text-white/90 font-medium">กำหนด Delay สำหรับ Tag ซ้ำ</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 text-center">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-3xl border border-white/30 mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                ⚡
              </div>
              <h5 className="text-lg font-bold mb-2">Real-time Control</h5>
              <p className="text-white/80 text-sm leading-relaxed">
                ควบคุมและติดตามสถานะแบบ Real-time ผ่าน WebSocket
              </p>
            </div>
            
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 text-center">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-3xl border border-white/30 mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                🔧
              </div>
              <h5 className="text-lg font-bold mb-2">System Tuning</h5>
              <p className="text-white/80 text-sm leading-relaxed">
                ปรับแต่งประสิทธิภาพระบบตามความต้องการใช้งาน
              </p>
            </div>
            
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 text-center">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-3xl border border-white/30 mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                💾
              </div>
              <h5 className="text-lg font-bold mb-2">Auto-Save</h5>
              <p className="text-white/80 text-sm leading-relaxed">
                บันทึกการตั้งค่าอัตโนมัติและรีเซ็ตค่าเริ่มต้น
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}