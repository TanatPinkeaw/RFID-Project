export default function ConfigurationTab({
  scannerConfigs, 
  editingConfig, 
  setEditingConfig,
  newConfigValue, 
  setNewConfigValue, 
  onUpdateConfig,
  onRefreshConfig,
  scannerConnected, 
  selectedDevice,
  loading, 
  getConfigDisplayValue,
  getInputType, 
  getSelectOptions, 
  validateConfigValue
}) {
  return (
    <div className="space-y-8">
      {/* 🎨 Beautiful Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-3xl border border-indigo-200 shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-pink-500/5"></div>
        <div className="relative p-8">
          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-400 to-purple-600 rounded-2xl blur opacity-75 animate-pulse"></div>
              <div className="relative w-16 h-16 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-3xl shadow-xl">
                🔧
              </div>
            </div>
            <div>
              <h3 className="text-3xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
                การตั้งค่าเครื่อง Scanner
              </h3>
              <p className="text-gray-600 text-lg font-medium">
                ดูและแก้ไขการตั้งค่าแบบ Real-time จาก RFID Scanner โดยตรง
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ✨ Enhanced Warning for no device selected */}
      {!selectedDevice && (
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl shadow-xl">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-orange-500/5"></div>
          <div className="relative p-6">
            <div className="flex items-start gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-orange-600 rounded-xl blur opacity-75 animate-pulse"></div>
                <div className="relative w-12 h-12 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl flex items-center justify-center text-white text-2xl shadow-lg animate-float">
                  ⚠️
                </div>
              </div>
              <div className="flex-1">
                <h4 className="text-xl font-bold text-gray-800 mb-3">ไม่ได้เลือก Scanner</h4>
                <p className="text-gray-700 text-lg font-medium leading-relaxed">
                  กรุณาเลือก Scanner จากรายการด้านบนแล้วกด "รีเฟรชจากเครื่อง" 
                  เพื่อดึงการตั้งค่าจริงจากเครื่องมาแสดง
                </p>
                <div className="mt-4">
                  <span className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 border border-amber-300 rounded-xl text-sm font-bold text-amber-800">
                    <span>🎯</span>
                    <span>โปรดเลือก Scanner</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✨ Enhanced Warning for disconnected scanner */}
      {selectedDevice && !selectedDevice.is_connected && (
        <div className="relative overflow-hidden bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-200 rounded-2xl shadow-xl">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-rose-500/5"></div>
          <div className="relative p-6">
            <div className="flex items-start gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-red-400 to-rose-600 rounded-xl blur opacity-75 animate-pulse"></div>
                <div className="relative w-12 h-12 bg-gradient-to-r from-red-500 to-rose-600 rounded-xl flex items-center justify-center text-white text-2xl shadow-lg">
                  ❌
                </div>
              </div>
              <div className="flex-1">
                <h4 className="text-xl font-bold text-gray-800 mb-3">Scanner ไม่ได้เชื่อมต่อ</h4>
                <p className="text-gray-700 text-lg font-medium leading-relaxed">
                  Device #{selectedDevice.device_id} ไม่ได้เชื่อมต่อ ไม่สามารถดูหรือแก้ไขการตั้งค่าได้
                </p>
                <div className="mt-4">
                  <span className="inline-flex items-center gap-2 px-4 py-2 bg-red-100 border border-red-300 rounded-xl text-sm font-bold text-red-800">
                    <span>🔌</span>
                    <span>ต้องการการเชื่อมต่อ</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✨ Enhanced No config loaded yet */}
      {selectedDevice && selectedDevice.is_connected && scannerConfigs.length === 0 && !loading && (
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl shadow-xl">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-indigo-500/5"></div>
          <div className="relative p-6">
            <div className="flex items-start gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-600 rounded-xl blur opacity-75 animate-bounce"></div>
                <div className="relative w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white text-2xl shadow-lg">
                  ℹ️
                </div>
              </div>
              <div className="flex-1">
                <h4 className="text-xl font-bold text-gray-800 mb-3">ยังไม่ได้โหลดการตั้งค่า</h4>
                <p className="text-gray-700 text-lg font-medium leading-relaxed">
                  กด "รีเฟรชจากเครื่อง" เพื่อดึงการตั้งค่าจริงจาก Device #{selectedDevice.device_id} มาแสดง
                </p>
                <div className="mt-4">
                  <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 border border-blue-300 rounded-xl text-sm font-bold text-blue-800">
                    <span>🔄</span>
                    <span>ต้องการรีเฟรช</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✨ Enhanced Selected Device Info */}
      {selectedDevice && (
        <div className="relative overflow-hidden bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-500/5 to-gray-700/5"></div>
          
          <div className="relative p-8">
            <div className="flex items-start gap-6">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-gray-600 to-gray-800 rounded-xl blur opacity-50"></div>
                <div className="relative w-14 h-14 bg-gradient-to-r from-gray-700 to-gray-900 rounded-xl flex items-center justify-center text-white text-2xl shadow-lg animate-float">
                  📱
                </div>
              </div>
              <div className="flex-1">
                <h4 className="text-2xl font-bold text-gray-800 mb-6">การตั้งค่าสำหรับ Scanner</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="group relative overflow-hidden bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 hover:shadow-lg transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <div className="relative">
                      <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Device ID</p>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                          #
                        </div>
                        <p className="text-2xl font-black text-gray-800">{selectedDevice.device_id}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="group relative overflow-hidden bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-4 hover:shadow-lg transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <div className="relative">
                      <p className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-2">Device SN</p>
                      <p className="font-mono text-sm text-gray-800 bg-white/50 backdrop-blur-sm px-3 py-2 rounded-lg border-none">
                        {selectedDevice.device_sn}
                      </p>
                    </div>
                  </div>
                  
                  <div className="group relative overflow-hidden bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 hover:shadow-lg transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <div className="relative">
                      <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">Location</p>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📍</span>
                        <p className="font-bold text-gray-800">{selectedDevice.location_name || `Location ${selectedDevice.location_id}`}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="group relative overflow-hidden bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-2xl p-4 hover:shadow-lg transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-gray-500/5 to-gray-700/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <div className="relative">
                      <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">สถานะ</p>
                      <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm ${
                        selectedDevice.is_connected 
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                          : 'bg-red-100 text-red-800 border border-red-300'
                      }`}>
                        {selectedDevice.is_connected ? '🟢 เชื่อมต่อ' : '🔴 ไม่เชื่อมต่อ'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* ✨ Enhanced Action Buttons */}
      {selectedDevice && selectedDevice.is_connected && (
        <div className="relative overflow-hidden bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5"></div>
          
          <div className="relative p-8">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-600 rounded-xl blur opacity-50"></div>
                  <div className="relative w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white text-2xl shadow-lg">
                    ⚙️
                  </div>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-800 mb-1">การตั้งค่า Scanner</h3>
                  <p className="text-gray-600 font-medium">
                    ดูและแก้ไขการตั้งค่าจริงของ RFID Scanner โดยตรง
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <button
                  onClick={onRefreshConfig}
                  disabled={loading}
                  className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold py-4 px-8 rounded-2xl hover:from-blue-600 hover:to-indigo-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-1 flex items-center gap-3"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>กำลังรีเฟรช...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xl">🔄</span>
                      <span>รีเฟรชจากเครื่อง</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* ✨ Enhanced Configuration Table */}
      {selectedDevice && selectedDevice.is_connected && (
        <div className="relative overflow-hidden bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-500/5 to-gray-700/5"></div>
          
          <div className="relative p-8">
            {scannerConfigs.length === 0 ? (
              <div className="text-center py-20">
                <div className="relative mx-auto mb-8">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-600 rounded-full blur opacity-75 animate-pulse"></div>
                  <div className="relative w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-4xl shadow-2xl animate-float">
                    ⚙️
                  </div>
                </div>
                <h3 className="text-3xl font-bold text-gray-800 mb-4">
                  {loading ? 'กำลังโหลดการตั้งค่าจากเครื่อง...' : 'ไม่พบการตั้งค่า'}
                </h3>
                <p className="text-gray-600 text-lg font-medium max-w-md mx-auto">
                  {loading ? 'กรุณารอสักครู่...' : 'ลองรีเฟรชการตั้งค่าใหม่'}
                </p>
                {loading && (
                  <div className="mt-8">
                    <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                      <th className="py-6 px-6 text-left font-bold text-gray-700 text-sm uppercase tracking-wider rounded-tl-2xl">Parameter</th>
                      <th className="py-6 px-6 text-left font-bold text-gray-700 text-sm uppercase tracking-wider">Current Value</th>
                      <th className="py-6 px-6 text-left font-bold text-gray-700 text-sm uppercase tracking-wider">Description</th>
                      <th className="py-6 px-6 text-center font-bold text-gray-700 text-sm uppercase tracking-wider rounded-tr-2xl">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {Array.isArray(scannerConfigs) && scannerConfigs.map((config, index) => (
                      <tr key={config.key} className="group hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 transition-all duration-200">
                        <td className="py-6 px-6">
                          <div className="flex items-center gap-4">
                            <div className="relative">
                              <div className="absolute inset-0 bg-gradient-to-r from-indigo-400 to-purple-600 rounded-lg blur opacity-30"></div>
                              <div className="relative bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-xs px-3 py-2 rounded-lg shadow-lg">
                                {config.key}
                              </div>
                            </div>
                            {config.key.includes('Device') || config.key.includes('Serial') || config.key.includes('Firmware') ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 border border-gray-300 text-gray-600 rounded-xl text-xs font-bold">
                                <span>🔒</span>
                                <span>Read-only</span>
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-6 px-6">
                          {editingConfig === config.key ? (
                            <div className="space-y-3">
                              {getInputType(config.key) === "select" ? (
                                <div className="relative">
                                  <select
                                    value={newConfigValue}
                                    onChange={(e) => setNewConfigValue(e.target.value)}
                                    className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl font-medium text-gray-800 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 shadow-sm hover:shadow-md appearance-none cursor-pointer"
                                  >
                                    {getSelectOptions(config.key).map(option => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                </div>
                              ) : (
                                <input
                                  type="number"
                                  value={newConfigValue}
                                  onChange={(e) => setNewConfigValue(e.target.value)}
                                  className={`w-full px-4 py-3 bg-white border-2 rounded-xl font-medium text-gray-800 focus:outline-none focus:ring-4 transition-all duration-300 shadow-sm hover:shadow-md ${
                                    !validateConfigValue(config.key, newConfigValue) 
                                      ? 'border-red-400 bg-red-50 focus:ring-red-500/20 focus:border-red-500' 
                                      : 'border-gray-200 focus:ring-blue-500/20 focus:border-blue-500'
                                  }`}
                                  min={config.key === "RfPower" ? "0" : undefined}
                                  max={config.key === "RfPower" ? "33" : undefined}
                                />
                              )}
                              {!validateConfigValue(config.key, newConfigValue) && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                                  <span className="text-red-500">❌</span>
                                  <span className="text-xs font-bold text-red-700">
                                    ค่าไม่ถูกต้องสำหรับ {config.key}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex items-center gap-4">
                                <span className="text-2xl font-black text-gray-800">
                                  {getConfigDisplayValue(config)}
                                </span>
                                <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold">
                                  <span>✅</span>
                                  <span>Real-time</span>
                                </span>
                              </div>
                              <p className="text-xs font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-lg inline-block">
                                จาก Device #{selectedDevice.device_id}
                              </p>
                            </div>
                          )}
                        </td>
                        <td className="py-6 px-6">
                          <div className="bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4">
                            <p className="text-sm font-medium text-gray-700 leading-relaxed">
                              {config.description || 'ไม่มีคำอธิบาย'}
                            </p>
                          </div>
                        </td>
                        <td className="py-6 px-6 text-center">
                          {config.key.includes('Device') || config.key.includes('Serial') || config.key.includes('Firmware') ? (
                            <span className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 text-gray-600 rounded-xl text-sm font-bold">
                              <span>🔒</span>
                              <span>Read-only</span>
                            </span>
                          ) : editingConfig === config.key ? (
                            <div className="flex gap-3 justify-center">
                              <button
                                onClick={() => onUpdateConfig(config)}
                                disabled={loading || !validateConfigValue(config.key, newConfigValue)}
                                className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-3 px-4 rounded-xl hover:from-emerald-600 hover:to-teal-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-1 flex items-center gap-2"
                              >
                                {loading ? (
                                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                ) : (
                                  <span className="text-lg">💾</span>
                                )}
                                <span>บันทึก</span>
                              </button>
                              <button
                                onClick={() => {
                                  setEditingConfig(null);
                                  setNewConfigValue("");
                                }}
                                disabled={loading}
                                className="bg-gradient-to-r from-gray-500 to-gray-600 text-white font-bold py-3 px-4 rounded-xl hover:from-gray-600 hover:to-gray-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1 flex items-center gap-2"
                              >
                                <span className="text-lg">❌</span>
                                <span>ยกเลิก</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingConfig(config.key);
                                setNewConfigValue(config.value);
                              }}
                              disabled={loading}
                              className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold py-3 px-6 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-1 flex items-center gap-2"
                            >
                              <span className="text-lg">✏️</span>
                              <span>แก้ไข</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ✨ Enhanced Help Information */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 rounded-3xl shadow-2xl">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
        
        <div className="relative p-8 text-white">
          <div className="flex items-start gap-6 mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-white/20 rounded-2xl blur-sm animate-pulse"></div>
              <div className="relative w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-4xl border border-white/30">
                🎯
              </div>
            </div>
            <div>
              <h4 className="text-4xl font-black mb-3">
                การตั้งค่าแบบ Real-time Multi-Device
              </h4>
              <p className="text-white/90 text-xl font-medium">
                คู่มือการใช้งานการตั้งค่า RFID Scanner แบบ Real-time
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-2xl border border-white/30 group-hover:scale-110 transition-transform duration-300">
                  📱
                </div>
                <div>
                  <h5 className="text-xl font-bold">Multi-Device Support</h5>
                  <p className="text-white/80 text-sm">รองรับหลาย Scanner</p>
                </div>
              </div>
              <p className="text-white/90 text-sm leading-relaxed">
                รองรับการเชื่อมต่อและจัดการหลาย Scanner พร้อมกัน แต่ละเครื่องสามารถตั้งค่าแยกกันได้
              </p>
            </div>
            
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-2xl border border-white/30 group-hover:scale-110 transition-transform duration-300">
                  ✅
                </div>
                <div>
                  <h5 className="text-xl font-bold">Real-time Values</h5>
                  <p className="text-white/80 text-sm">ค่าแบบ Real-time</p>
                </div>
              </div>
              <p className="text-white/90 text-sm leading-relaxed">
                ค่าที่แสดงคือค่าจริงจากเครื่อง RFID ขณะนี้ ไม่ใช่ค่าที่เก็บในฐานข้อมูล
              </p>
            </div>
            
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-2xl border border-white/30 group-hover:scale-110 transition-transform duration-300">
                  🔄
                </div>
                <div>
                  <h5 className="text-xl font-bold">Auto-refresh</h5>
                  <p className="text-white/80 text-sm">รีเฟรชอัตโนมัติ</p>
                </div>
              </div>
              <p className="text-white/90 text-sm leading-relaxed">
                กดปุ่มรีเฟรชเพื่อดึงค่าการตั้งค่าล่าสุดจากเครื่อง RFID มาแสดงผล
              </p>
            </div>
            
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-2xl border border-white/30 group-hover:scale-110 transition-transform duration-300">
                  💾
                </div>
                <div>
                  <h5 className="text-xl font-bold">Direct Update</h5>
                  <p className="text-white/80 text-sm">อัปเดตโดยตรง</p>
                </div>
              </div>
              <p className="text-white/90 text-sm leading-relaxed">
                การแก้ไขจะส่งไปยังเครื่อง RFID ทันที และอัปเดตค่าในฐานข้อมูลระบบ
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 text-center">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-3xl border border-white/30 mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                🔧
              </div>
              <h5 className="text-lg font-bold mb-2">Configuration Types</h5>
              <p className="text-white/80 text-sm leading-relaxed">
                WorkMode, FreqBand, RfPower และพารามิเตอร์อื่นๆ ของ RFID
              </p>
            </div>
            
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 text-center">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-3xl border border-white/30 mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                🔒
              </div>
              <h5 className="text-lg font-bold mb-2">Read-only Parameters</h5>
              <p className="text-white/80 text-sm leading-relaxed">
                ข้อมูลเครื่อง (Device, Serial, Firmware) แสดงผลอย่างเดียว
              </p>
            </div>
            
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 text-center">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-3xl border border-white/30 mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                ⚡
              </div>
              <h5 className="text-lg font-bold mb-2">Instant Apply</h5>
              <p className="text-white/80 text-sm leading-relaxed">
                การเปลี่ยนแปลงจะมีผลทันทีไม่ต้องรีสตาร์ทเครื่อง
              </p>
            </div>
          </div>
          
          <div className="mt-8 p-6 bg-yellow-500/20 backdrop-blur-sm rounded-2xl border border-yellow-400/30">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-yellow-500/30 backdrop-blur-sm rounded-xl flex items-center justify-center text-2xl border border-yellow-400/30">
                🔒
              </div>
              <div>
                <h5 className="text-xl font-bold text-yellow-100">ข้อมูลที่ไม่สามารถแก้ไขได้</h5>
                <p className="text-yellow-200/90 text-sm">Read-only Parameters</p>
              </div>
            </div>
            <p className="text-yellow-100/90 text-sm leading-relaxed">
              ข้อมูลเครื่อง เช่น Device ID, Serial Number, และ Firmware Version เป็นข้อมูลที่อ่านอย่างเดียว 
              ไม่สามารถแก้ไขได้เพื่อความปลอดภัยของระบบ
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}