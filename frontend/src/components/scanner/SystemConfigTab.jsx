import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function SystemConfigTab() {
  const [configs, setConfigs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState({
    SCAN_INTERVAL: '',
    DB_UPDATE_INTERVAL: '',
    DELAY_SECONDS: ''
  });

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/system-config/scan-settings');
      setConfigs(response.data);
      
      setFormData({
        SCAN_INTERVAL: response.data.SCAN_INTERVAL?.value?.toString() || '0.1',
        DB_UPDATE_INTERVAL: response.data.DB_UPDATE_INTERVAL?.value?.toString() || '1',
        DELAY_SECONDS: response.data.DELAY_SECONDS?.value?.toString() || '20'
      });
    } catch (error) {
      console.error('Error loading configs:', error);
      setMessage('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = async (key) => {
    try {
      setSaving(true);
      const value = formData[key];
      
      await api.put(`/api/system-config/${key}`, {
        value: value
      });
      
      setMessage(`อัปเดต ${key} สำเร็จ`);
      await loadConfigs();
      
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error saving config:', error);
      setMessage(`เกิดข้อผิดพลาดในการบันทึก ${key}`);
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    if (!confirm('คุณต้องการรีเซ็ตค่าเป็นค่าเริ่มต้นหรือไม่?')) return;
    
    try {
      setSaving(true);
      await api.post('/api/system-config/reset-defaults');
      setMessage('รีเซ็ตค่าเริ่มต้นสำเร็จ');
      await loadConfigs();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error resetting defaults:', error);
      setMessage('เกิดข้อผิดพลาดในการรีเซ็ตค่าเริ่มต้น');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const configItems = [
    {
      key: 'SCAN_INTERVAL',
      title: 'ระยะเวลาระหว่างการสแกน',
      subtitle: 'SCAN_INTERVAL',
      icon: '⏱️',
      unit: 'วินาที',
      bgGradient: 'from-violet-500 to-purple-600',
      bgLight: 'from-violet-50 to-purple-50',
      borderColor: 'border-violet-200',
      textColor: 'text-violet-600',
      focusRing: 'focus:ring-violet-500 focus:border-violet-500',
      placeholder: '0.1',
      step: 0.1,
      min: 0.1,
      description: 'กำหนดระยะเวลาระหว่างการสแกน RFID แต่ละรอบ',
      recommendation: '0.1-0.5 วินาที'
    },
    {
      key: 'DB_UPDATE_INTERVAL',
      title: 'ระยะเวลาอัปเดตฐานข้อมูล',
      subtitle: 'DB_UPDATE_INTERVAL',
      icon: '💾',
      unit: 'วินาที',
      bgGradient: 'from-emerald-500 to-teal-600',
      bgLight: 'from-emerald-50 to-teal-50',
      borderColor: 'border-emerald-200',
      textColor: 'text-emerald-600',
      focusRing: 'focus:ring-emerald-500 focus:border-emerald-500',
      placeholder: '1',
      step: 0.1,
      min: 0.1,
      description: 'กำหนดระยะเวลาในการอัปเดตข้อมูลลงฐานข้อมูล',
      recommendation: '1-5 วินาที'
    },
    {
      key: 'DELAY_SECONDS',
      title: 'เวลา Delay การประมวลผล',
      subtitle: 'DELAY_SECONDS',
      icon: '⏳',
      unit: 'วินาที',
      bgGradient: 'from-amber-500 to-orange-600',
      bgLight: 'from-amber-50 to-orange-50',
      borderColor: 'border-amber-200',
      textColor: 'text-amber-600',
      focusRing: 'focus:ring-amber-500 focus:border-amber-500',
      placeholder: '20',
      step: 1,
      min: 0,
      description: 'หน่วงเวลาก่อนประมวลผล tag เดิมซ้ำอีกครั้ง',
      recommendation: '10-30 วินาที'
    }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl opacity-20 animate-pulse"></div>
            <div className="absolute inset-2 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white text-2xl">
              ⚙️
            </div>
          </div>
          <div className="w-12 h-12 mx-auto mb-6 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">กำลังโหลดการตั้งค่าระบบ</h3>
          <p className="text-gray-600">โปรดรอสักครู่...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 🎨 Beautiful Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-3xl border border-white shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-pink-500/5"></div>
        <div className="relative p-8">
          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-400 to-purple-600 rounded-2xl blur opacity-75 animate-pulse"></div>
              <div className="relative w-16 h-16 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-3xl shadow-xl">
                ⚙️
              </div>
            </div>
            <div>
              <h3 className="text-4xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
                การตั้งค่าระบบสแกน
              </h3>
              <p className="text-gray-600 text-lg font-medium">
                ปรับแต่งพารามิเตอร์การทำงานของระบบ RFID Scanner แบบ Real-time
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 🎨 Beautiful Message Alert */}
      {message && (
        <div className={`relative overflow-hidden rounded-2xl border-2 shadow-xl transition-all duration-500 ${
          message.includes('สำเร็จ') 
            ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200' 
            : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-200'
        }`}>
          <div className={`absolute inset-0 ${
            message.includes('สำเร็จ') 
              ? 'bg-gradient-to-r from-emerald-500/5 to-teal-500/5' 
              : 'bg-gradient-to-r from-red-500/5 to-rose-500/5'
          }`}></div>
          <div className="relative p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white text-2xl shadow-lg ${
                  message.includes('สำเร็จ') 
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500' 
                    : 'bg-gradient-to-r from-red-500 to-rose-500'
                }`}>
                  {message.includes('สำเร็จ') ? '✅' : '❌'}
                </div>
                <div>
                  <h4 className={`font-bold text-lg ${
                    message.includes('สำเร็จ') ? 'text-emerald-800' : 'text-red-800'
                  }`}>
                    {message.includes('สำเร็จ') ? 'สำเร็จ!' : 'เกิดข้อผิดพลาด'}
                  </h4>
                  <p className={`font-medium ${
                    message.includes('สำเร็จ') ? 'text-emerald-700' : 'text-red-700'
                  }`}>
                    {message}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setMessage('')}
                className={`text-2xl hover:scale-110 transition-all duration-200 w-8 h-8 flex items-center justify-center rounded-lg ${
                  message.includes('สำเร็จ') 
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

      {/* 🎨 Beautiful Configuration Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {configItems.map((item, index) => (
          <div key={item.key} className="group relative overflow-hidden bg-white rounded-3xl border border-gray-200 shadow-xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2">
            {/* Background Pattern */}
            <div className={`absolute inset-0 bg-gradient-to-br ${item.bgLight} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
            
            <div className="relative p-8">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className={`relative w-16 h-16 bg-gradient-to-r ${item.bgGradient} rounded-2xl flex items-center justify-center text-white text-2xl shadow-xl group-hover:scale-110 transition-transform duration-300`}>
                    <div className="absolute inset-0 bg-white/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <span className="relative">{item.icon}</span>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-gray-800 group-hover:text-gray-900 transition-colors mb-1">
                      {item.title}
                    </h4>
                    <p className="text-xs font-mono bg-gray-100 px-3 py-1 rounded-lg text-gray-600 inline-block">
                      {item.subtitle}
                    </p>
                  </div>
                </div>
              </div>

              {/* Input Section */}
              <div className="space-y-4 mb-6">
                <div className="relative">
                  <input
                    type="number"
                    step={item.step}
                    min={item.min}
                    value={formData[item.key]}
                    onChange={(e) => handleInputChange(item.key, e.target.value)}
                    className={`w-full px-6 py-4 bg-white border-2 border-gray-200 rounded-2xl font-semibold text-lg focus:outline-none ${item.focusRing} focus:ring-4 transition-all duration-300 pr-20 shadow-sm`}
                    placeholder={item.placeholder}
                    disabled={saving}
                  />
                  <span className="absolute right-6 top-1/2 transform -translate-y-1/2 text-sm font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-lg">
                    {item.unit}
                  </span>
                </div>
                
                <button
                  onClick={() => handleSave(item.key)}
                  disabled={saving}
                  className={`w-full bg-gradient-to-r ${item.bgGradient} text-white font-bold py-4 px-6 rounded-2xl hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-1 flex items-center justify-center gap-3 shadow-lg`}
                >
                  {saving ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xl">💾</span>
                      <span>บันทึกค่าใหม่</span>
                    </>
                  )}
                </button>
              </div>

              {/* Description */}
              <div className={`bg-gradient-to-r ${item.bgLight} border-2 ${item.borderColor} rounded-2xl p-4 mb-4`}>
                <p className="text-sm text-gray-700 leading-relaxed font-medium">
                  {configs[item.key]?.description || item.description}
                </p>
              </div>

              {/* Current Value Display */}
              <div className="flex items-center justify-between bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl p-4 border border-gray-200">
                <span className="text-sm font-bold text-gray-600 uppercase tracking-wide">
                  ค่าปัจจุบัน
                </span>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-black ${item.textColor}`}>
                    {configs[item.key]?.value || item.placeholder}
                  </span>
                  <span className="text-sm font-semibold text-gray-500">
                    {item.unit}
                  </span>
                  <div className={`w-3 h-3 ${item.textColor.replace('text-', 'bg-')} rounded-full animate-pulse ml-2 shadow-sm`}></div>
                </div>
              </div>

              {/* Recommendation */}
              <div className="mt-4 text-center">
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl text-sm font-semibold text-blue-700">
                  <span>💡</span>
                  <span>แนะนำ: {item.recommendation}</span>
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 🎨 Beautiful Reset Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-red-50 via-rose-50 to-pink-50 rounded-3xl border border-red-200 shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-pink-500/5"></div>
        <div className="relative p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-red-400 to-pink-600 rounded-2xl blur opacity-75 animate-pulse"></div>
                <div className="relative w-16 h-16 bg-gradient-to-r from-red-500 to-pink-600 rounded-2xl flex items-center justify-center text-white text-3xl shadow-xl">
                  🔄
                </div>
              </div>
              <div>
                <h4 className="text-2xl font-bold text-gray-800 mb-2">รีเซ็ตการตั้งค่า</h4>
                <p className="text-gray-600 font-medium max-w-md">
                  กลับไปใช้ค่าเริ่มต้นของระบบทั้งหมด (SCAN_INTERVAL: 0.1s, DB_UPDATE_INTERVAL: 1s, DELAY_SECONDS: 20s)
                </p>
              </div>
            </div>
            
            <button
              onClick={handleResetDefaults}
              disabled={saving}
              className="bg-gradient-to-r from-red-500 to-pink-600 text-white font-bold py-4 px-8 rounded-2xl hover:from-red-600 hover:to-pink-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-1 flex items-center gap-3"
            >
              {saving ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>กำลังรีเซ็ต...</span>
                </>
              ) : (
                <>
                  <span className="text-xl">🔄</span>
                  <span>รีเซ็ตเป็นค่าเริ่มต้น</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 🎨 Beautiful Current Values Overview */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-3xl border border-blue-200 shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5"></div>
        <div className="relative p-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-600 rounded-2xl blur opacity-75"></div>
              <div className="relative w-14 h-14 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-xl">
                📊
              </div>
            </div>
            <div>
              <h4 className="text-3xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-1">
                ค่าปัจจุบันในระบบ
              </h4>
              <p className="text-gray-600 font-medium text-lg">แสดงค่าที่ใช้งานอยู่ในขณะนี้</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {configItems.map((item) => (
              <div key={item.key} className="group relative overflow-hidden bg-white rounded-2xl border-2 border-gray-200 p-6 hover:border-purple-300 hover:shadow-lg transition-all duration-300">
                <div className={`absolute inset-0 bg-gradient-to-r ${item.bgGradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>
                <div className="relative text-center">
                  <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">
                    {item.icon}
                  </div>
                  <div className="flex items-baseline justify-center gap-2 mb-3">
                    <span className="text-4xl font-black text-gray-800">
                      {configs[item.key]?.value || item.placeholder}
                    </span>
                    <span className="text-lg font-bold text-gray-500">
                      {item.unit}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-4">
                    {item.title}
                  </div>
                  <div className={`w-3 h-3 ${item.textColor.replace('text-', 'bg-')} rounded-full animate-pulse mx-auto shadow-sm`}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 🎨 Beautiful Help Information */}
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
                คำแนะนำการตั้งค่าระบบ
              </h4>
              <p className="text-white/90 text-xl font-medium">
                แนวทางในการปรับแต่งพารามิเตอร์เพื่อประสิทธิภาพสูงสุด
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105">
              <div className="text-5xl mb-4 text-center group-hover:scale-110 transition-transform duration-300">⏱️</div>
              <h5 className="text-xl font-bold mb-3 text-center">SCAN_INTERVAL</h5>
              <div className="text-white/90 leading-relaxed text-center space-y-2">
                <p className="font-medium">ค่าต่ำ = สแกนเร็วขึ้น</p>
                <p className="font-medium">แต่ใช้ CPU มากขึ้น</p>
                <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-3 mt-4 border border-white/30">
                  <span className="font-bold text-lg">แนะนำ: 0.1-0.5 วินาที</span>
                </div>
              </div>
            </div>
            
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105">
              <div className="text-5xl mb-4 text-center group-hover:scale-110 transition-transform duration-300">💾</div>
              <h5 className="text-xl font-bold mb-3 text-center">DB_UPDATE_INTERVAL</h5>
              <div className="text-white/90 leading-relaxed text-center space-y-2">
                <p className="font-medium">ความถี่ในการอัปเดต</p>
                <p className="font-medium">ฐานข้อมูล</p>
                <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-3 mt-4 border border-white/30">
                  <span className="font-bold text-lg">แนะนำ: 1-5 วินาที</span>
                </div>
              </div>
            </div>
            
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105">
              <div className="text-5xl mb-4 text-center group-hover:scale-110 transition-transform duration-300">⏳</div>
              <h5 className="text-xl font-bold mb-3 text-center">DELAY_SECONDS</h5>
              <div className="text-white/90 leading-relaxed text-center space-y-2">
                <p className="font-medium">ป้องกันการสแกน tag เดิม</p>
                <p className="font-medium">ซ้ำเร็วเกินไป</p>
                <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-3 mt-4 border border-white/30">
                  <span className="font-bold text-lg">แนะนำ: 10-30 วินาที</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}