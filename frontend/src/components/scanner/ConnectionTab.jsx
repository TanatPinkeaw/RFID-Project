import React from "react";

export default function ConnectionTab({
  connectionForm,
  setConnectionForm,
  locations,
  connectedDevices,
  selectedDevice,
  onConnect,
  onDisconnect,
  loading,
  wsConnected
}) {
  return (
    <div className="space-y-8">
      {/* 🎨 Beautiful Header Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-3xl border border-blue-200 shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-purple-500/5"></div>
        <div className="relative p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-600 rounded-2xl blur opacity-75 animate-pulse"></div>
                <div className="relative w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-3xl shadow-xl">
                  🔗
                </div>
              </div>
              <div>
                <h3 className="text-3xl font-black bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
                  การเชื่อมต่อ Scanner
                </h3>
                <p className="text-gray-600 text-lg font-medium">เพิ่มและจัดการ RFID Scanner แบบ Multi-Device</p>
              </div>
            </div>
            
            {wsConnected && (
              <div className="flex items-center gap-3 px-6 py-3 bg-emerald-50 border-2 border-emerald-200 rounded-2xl">
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="font-bold text-emerald-800 text-sm uppercase tracking-wide">
                  ✅ Real-time Connected
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* ✨ Enhanced Connection Form */}
        <div className="group relative overflow-hidden bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 hover:shadow-3xl transition-all duration-500">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          
          <div className="relative p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-600 rounded-xl blur opacity-50"></div>
                <div className="relative w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white text-2xl shadow-lg animate-float">
                  🔗
                </div>
              </div>
              <div>
                <h4 className="text-2xl font-bold text-gray-800 mb-1">เชื่อมต่อ Scanner ใหม่</h4>
                <p className="text-gray-600 font-medium">เพิ่ม RFID Scanner เข้าสู่ระบบ</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Location Selection */}
              <div className="group/input">
                <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider flex items-center gap-2">
                  <span className="text-lg">📍</span>
                  <span>Location</span>
                </label>
                <div className="relative">
                  <select
                    className="w-full px-6 py-4 bg-white border-2 border-gray-200 rounded-2xl font-medium text-gray-800 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 shadow-sm hover:shadow-md appearance-none cursor-pointer"
                    value={connectionForm.location_id}
                    onChange={e => setConnectionForm(f => ({ ...f, location_id: parseInt(e.target.value, 10) }))}
                  >
                    {locations.map(l => (
                      <option key={l.id || l.location_id} value={l.id || l.location_id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Connection Type & IP/COM */}
              <div className="grid grid-cols-2 gap-6">
                <div className="group/input">
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider flex items-center gap-2">
                    <span className="text-lg">🔌</span>
                    <span>Connection Type</span>
                  </label>
                  <div className="relative">
                    <select
                      className="w-full px-6 py-4 bg-white border-2 border-gray-200 rounded-2xl font-medium text-gray-800 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 shadow-sm hover:shadow-md appearance-none cursor-pointer"
                      value={connectionForm.connection_type}
                      onChange={e => setConnectionForm(f => ({ ...f, connection_type: e.target.value }))}
                    >
                      <option value="network">🌐 Network</option>
                      <option value="com">📺 Serial (COM)</option>
                    </select>
                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                {connectionForm.connection_type === "network" ? (
                  <div className="group/input">
                    <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider flex items-center gap-2">
                      <span className="text-lg">🌐</span>
                      <span>IP Address</span>
                    </label>
                    <input
                      className="w-full px-6 py-4 bg-white border-2 border-gray-200 rounded-2xl font-medium text-gray-800 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 shadow-sm hover:shadow-md placeholder-gray-400"
                      placeholder="10.10.100.254"
                      value={connectionForm.ip}
                      onChange={e => setConnectionForm(f => ({ ...f, ip: e.target.value }))}
                    />
                  </div>
                ) : (
                  <div className="group/input">
                    <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider flex items-center gap-2">
                      <span className="text-lg">📺</span>
                      <span>COM Port</span>
                    </label>
                    <input
                      className="w-full px-6 py-4 bg-white border-2 border-gray-200 rounded-2xl font-medium text-gray-800 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 shadow-sm hover:shadow-md placeholder-gray-400"
                      placeholder="COM7"
                      value={connectionForm.com_port}
                      onChange={e => setConnectionForm(f => ({ ...f, com_port: e.target.value }))}
                    />
                  </div>
                )}
              </div>

              {/* Port/Baud & Timeout & Connect Button */}
              <div className="grid grid-cols-3 gap-4">
                {connectionForm.connection_type === "network" ? (
                  <div className="group/input">
                    <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider flex items-center gap-2">
                      <span className="text-lg">🔗</span>
                      <span>Port</span>
                    </label>
                    <input
                      type="number"
                      className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl font-medium text-gray-800 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 shadow-sm hover:shadow-md placeholder-gray-400"
                      placeholder="8899"
                      value={connectionForm.port}
                      onChange={e => setConnectionForm(f => ({ ...f, port: parseInt(e.target.value, 10) }))}
                    />
                  </div>
                ) : (
                  <div className="group/input">
                    <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider flex items-center gap-2">
                      <span className="text-lg">⚡</span>
                      <span>Baud Rate</span>
                    </label>
                    <input
                      type="number"
                      className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl font-medium text-gray-800 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 shadow-sm hover:shadow-md placeholder-gray-400"
                      placeholder="115200"
                      value={connectionForm.baud_rate}
                      onChange={e => setConnectionForm(f => ({ ...f, baud_rate: parseInt(e.target.value, 10) }))}
                    />
                  </div>
                )}
                
                <div className="group/input">
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider flex items-center gap-2">
                    <span className="text-lg">⏱️</span>
                    <span>Timeout</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl font-medium text-gray-800 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 shadow-sm hover:shadow-md placeholder-gray-400 pr-12"
                      placeholder="5000"
                      value={connectionForm.timeout}
                      onChange={e => setConnectionForm(f => ({ ...f, timeout: parseInt(e.target.value, 10) }))}
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs font-bold text-gray-500">ms</span>
                  </div>
                </div>
                
                <div className="group/input">
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider opacity-0">Connect</label>
                  <button
                    disabled={loading}
                    onClick={onConnect}
                    className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold py-3 px-4 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-1 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span className="text-sm">เชื่อมต่อ...</span>
                      </>
                    ) : (
                      <>
                        <span className="text-lg">🚀</span>
                        <span className="text-sm font-bold">เชื่อมต่อ</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Selected Device Info */}
              {selectedDevice && (
                <div className="relative overflow-hidden bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-6 shadow-lg">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-indigo-500/5"></div>
                  <div className="relative">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold">
                          #{selectedDevice.device_id}
                        </div>
                        <div>
                          <p className="font-bold text-gray-800 text-lg">Device ที่เลือก</p>
                          <p className="text-sm text-gray-600 font-mono bg-white px-3 py-1 rounded-lg mt-1">
                            {selectedDevice.device_sn}
                          </p>
                        </div>
                      </div>
                      <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl border-2 ${
                        selectedDevice.is_connected 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}>
                        <div className={`w-2 h-2 rounded-full ${
                          selectedDevice.is_connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                        }`}></div>
                        <span className="font-bold text-sm">
                          {selectedDevice.is_connected ? ' Online' : ' Offline'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ✨ Enhanced Device Status Panel */}
        <div className="group relative overflow-hidden bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 hover:shadow-3xl transition-all duration-500">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          
          <div className="relative p-5">
            <div className="flex items-center gap-3 mb-5">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-600 rounded-xl blur opacity-50"></div>
                <div className="relative w-9 h-9 bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl flex items-center justify-center text-white text-base shadow-lg animate-float">
                  📡
                </div>
              </div>
              <div>
                <h4 className="text-lg font-bold text-gray-800 mb-1">สถานะเครื่อง Scanner</h4>
                <p className="text-gray-600 font-medium text-xs">
                  เชื่อมต่อทั้งหมด <span className="font-bold text-purple-600">{connectedDevices.length}</span> เครื่อง
                </p>
              </div>
            </div>

            <div className="space-y-1.5 max-h-[350px] overflow-y-auto custom-scrollbar">
              {connectedDevices.map(dev => (
                <div
                  key={dev.device_id}
                  className={`group/device relative overflow-hidden rounded-md border transition-all duration-300 ${
                    selectedDevice?.device_id === dev.device_id
                      ? "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-300 shadow-sm transform scale-100"
                      : "bg-white border-gray-200 hover:border-purple-300 hover:shadow-sm hover:transform hover:scale-100"
                  }`}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover/device:opacity-100 transition-opacity duration-300"></div>
                  
                  <div className="relative p-2">
                    {/* Device Header */}
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 bg-gradient-to-r from-gray-700 to-gray-900 rounded-md flex items-center justify-center text-white font-bold text-xs shadow-sm">
                          #{dev.device_id}
                        </div>
                        <div>
                          <p className="font-bold text-gray-800 text-xs mb-0.5">Device #{dev.device_id}</p>
                          {selectedDevice?.device_id === dev.device_id && (
                            <span className="inline-flex items-center px-1 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              🎯 เลือกอยู่
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={`flex items-center gap-0.5 px-1 py-0.5 rounded-sm border text-xs ${
                        dev.is_connected 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}>
                        <div className={`w-1 h-1 rounded-full ${
                          dev.is_connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                        }`}></div>
                        <span className="font-bold uppercase tracking-wide">
                          {dev.is_connected ? 'ON' : 'OFF'}
                        </span>
                      </div>
                    </div>

                    {/* Device Serial */}
                    <div className="mb-1">
                      <div className="bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-sm p-0.5">
                        <span className="font-mono text-xs text-gray-700 font-medium">{dev.device_sn}</span>
                      </div>
                    </div>

                    {/* Statistics */}
                    <div className="grid grid-cols-2 gap-1 mb-1">
                      <div className="text-center bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-sm p-1">
                        <p className="text-xs font-black text-blue-600 mb-0">{dev.scanned_count || 0}</p>
                        <p className="text-xs font-bold text-blue-600 uppercase tracking-wide">Scanned</p>
                      </div>
                      <div className="text-center bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-sm p-1">
                        <p className="text-xs font-black text-emerald-600 mb-0">{dev.tracked_count || 0}</p>
                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Tracked</p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => navigator.clipboard.writeText(dev.device_sn || "")}
                        className="flex-1 bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 font-semibold py-0.5 px-1 rounded-sm hover:from-gray-200 hover:to-gray-300 transition-all duration-300 shadow-sm hover:shadow-md text-xs flex items-center justify-center gap-0.5"
                        title="Copy Serial Number"
                      >
                        <span className="text-xs">📋</span>
                        <span>Copy</span>
                      </button>
                      {dev.is_connected && (
                        <button
                          onClick={() => onDisconnect(dev.device_id)}
                          className="bg-gradient-to-r from-red-500 to-rose-600 text-white font-semibold py-0.5 px-1 rounded-sm hover:from-red-600 hover:to-rose-700 transition-all duration-300 shadow-lg hover:shadow-xl text-xs flex items-center justify-center gap-0.5 transform hover:-translate-y-0.5"
                          title="Disconnect Device"
                        >
                          <span className="text-xs">🔌</span>
                          <span>Disc</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Empty State */}
              {connectedDevices.length === 0 && (
                <div className="text-center py-8">
                  <div className="relative mx-auto mb-4">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-600 rounded-full blur opacity-75 animate-pulse"></div>
                  </div>
                  <h4 className="text-xl font-bold text-gray-800 mb-2">ยังไม่มีเครื่องเชื่อมต่อ</h4>
                  <p className="text-gray-600 font-medium text-base max-w-md mx-auto leading-relaxed">
                    เริ่มต้นด้วยการเพิ่ม RFID Scanner เครื่องแรกของคุณ
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ✨ Enhanced Connection Guide */}
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
                คู่มือการเชื่อมต่อ RFID Scanner
              </h4>
              <p className="text-white/90 text-xl font-medium">
                แนวทางในการเชื่อมต่อและจัดการ Scanner แบบ Multi-Device
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-2xl border border-white/30">
                  🌐
                </div>
                <div>
                  <h5 className="text-xl font-bold">Network Connection</h5>
                  <p className="text-white/80 text-sm">เชื่อมต่อผ่าน TCP/IP</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-white/60 rounded-full"></div>
                  <span className="text-white/90 font-medium">IP Address: ที่อยู่ IP ของ RFID Scanner</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-white/60 rounded-full"></div>
                  <span className="text-white/90 font-medium">Port: พอร์ต TCP (ปกติ 8899)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-white/60 rounded-full"></div>
                  <span className="text-white/90 font-medium">Timeout: เวลารอการตอบสนอง (มิลลิวินาที)</span>
                </div>
              </div>
            </div>
            
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-2xl border border-white/30">
                  📺
                </div>
                <div>
                  <h5 className="text-xl font-bold">Serial Connection</h5>
                  <p className="text-white/80 text-sm">เชื่อมต่อผ่าน Serial Port</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-white/60 rounded-full"></div>
                  <span className="text-white/90 font-medium">COM Port: พอร์ต Serial (เช่น COM7)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-white/60 rounded-full"></div>
                  <span className="text-white/90 font-medium">Baud Rate: ความเร็วสื่อสาร (115200)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-white/60 rounded-full"></div>
                  <span className="text-white/90 font-medium">Timeout: เวลารอการตอบสนอง (มิลลิวินาที)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 text-center">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-3xl border border-white/30 mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                🔄
              </div>
              <h5 className="text-lg font-bold mb-2">Multi-Device Support</h5>
              <p className="text-white/80 text-sm leading-relaxed">
                เชื่อมต่อและจัดการหลาย Scanner พร้อมกันในระบบเดียว
              </p>
            </div>
            
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 text-center">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-3xl border border-white/30 mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                ⚡
              </div>
              <h5 className="text-lg font-bold mb-2">Real-time Monitoring</h5>
              <p className="text-white/80 text-sm leading-relaxed">
                ติดตามสถานะและข้อมูลแบบ Real-time ผ่าน WebSocket
              </p>
            </div>
            
            <div className="group bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 text-center">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-3xl border border-white/30 mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                🔒
              </div>
              <h5 className="text-lg font-bold mb-2">Auto-Recovery</h5>
              <p className="text-white/80 text-sm leading-relaxed">
                ระบบเชื่อมต่อใหม่อัตโนมัติเมื่อการเชื่อมต่อขาดหาย
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}