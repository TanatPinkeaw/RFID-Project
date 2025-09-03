import { useState, useEffect, useRef } from "react";
import api from "../services/api";
import ConnectionTab from "../components/scanner/ConnectionTab";
import ControlTab from "../components/scanner/ControlTab";
import ConfigurationTab from "../components/scanner/ConfigurationTab";
import StatsCard from "../components/scanner/StatsCard";

// เพิ่ม import CSS ที่สวยงาม
import '../index.css';

export default function Scanner() {
  const [activeTab, setActiveTab] = useState("connection");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // ⭐ เปลี่ยนเป็น Array สำหรับ Multi-Device
  const [connectedDevices, setConnectedDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  
  // Connection Form
  const [connectionForm, setConnectionForm] = useState({
    location_id: 1,
    connection_type: "network",
    ip: "10.10.100.254",
    port: 8899,
    timeout: 5000,
    com_port: "COM7",
    baud_rate: 115200
  });
  
  // Configuration specific state
  const [scannerConfigs, setScannerConfigs] = useState([]);
  const [editingConfig, setEditingConfig] = useState(null);
  const [newConfigValue, setNewConfigValue] = useState("");
  
  // Locations
  const [locations, setLocations] = useState([]);

  // ⭐ WebSocket state
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const wsRef = useRef(null);
  const mountedRef = useRef(true);

  // ⭐ WebSocket Functions
  const connectWebSocket = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("🌐 WebSocket already connected");
      return;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/realtime`;
      
      console.log("🌐 Connecting WebSocket to:", wsUrl);
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("✅ Scanner WebSocket connected");
        setWsConnected(true);
        setError("");
      };

      wsRef.current.onmessage = handleWebSocketMessage;

      wsRef.current.onclose = () => {
        console.log("❌ Scanner WebSocket disconnected");
        setWsConnected(false);
        
        // Auto-reconnect after 3 seconds if component is still mounted
        if (mountedRef.current) {
          setTimeout(() => {
            if (mountedRef.current) {
              console.log("🔄 Attempting Scanner WebSocket reconnection...");
              connectWebSocket();
            }
          }, 3000);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error("❌ Scanner WebSocket error:", error);
        setWsConnected(false);
      };

    } catch (error) {
      console.error("❌ Failed to create Scanner WebSocket:", error);
      setWsConnected(false);
    }
  };

  // ⭐ WebSocket Message Handler
  const handleWebSocketMessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log("📡 Scanner WS received:", data);

      setLastUpdate(new Date().toLocaleTimeString());

      // ⭐ Scanner Status Updates
      if (data.type === "scanner_status" || data.type === "device_status") {
        console.log("🔄 Updating scanner status from WebSocket");
        updateDeviceStatus(data);
        return;
      }

      // ⭐ Scanner Connection Events
      if (data.type === "scanner_connected") {
        console.log("🟢 Scanner connected:", data.device_id);
        handleScannerConnected(data);
        return;
      }

      if (data.type === "scanner_disconnected") {
        console.log("🔴 Scanner disconnected:", data.device_id);
        handleScannerDisconnected(data);
        return;
      }

      // ⭐ Scanner Configuration Updates
      if (data.type === "scanner_config") {
        console.log("⚙️ Scanner config updated:", data);
        handleConfigUpdate(data);
        return;
      }

      // ⭐ Tag Scan Updates (แสดงจำนวน tags ที่สแกนได้)
      if (data.type === "scan_result" || data.type === "tag_update") {
        console.log("🏷️ Tag scan result:", data);
        handleScanUpdate(data);
        return;
      }

      // ⭐ System Events
      if (data.type === "system_status") {
        console.log("💻 System status update:", data);
        // อัปเดตสถานะระบบโดยรวม
        return;
      }

    } catch (error) {
      console.error("❌ Scanner WS parse error:", error);
    }
  };

  // ⭐ WebSocket Event Handlers
  const updateDeviceStatus = (data) => {
    if (data.device_id) {
      setConnectedDevices(prev => 
        prev.map(device => 
          device.device_id === data.device_id
            ? { 
                ...device, 
                ...data,
                last_update: new Date().toISOString()
              }
            : device
        )
      );
    } else if (data.devices) {
      // Bulk update
      setConnectedDevices(data.devices);
    }
  };

  const handleScannerConnected = (data) => {
    const newDevice = {
      device_id: data.device_id,
      device_sn: data.device_sn || 'Unknown',
      location_id: data.location_id,
      location_name: data.location_name,
      is_connected: true,
      scanned_count: data.scanned_count || 0,
      tracked_count: data.tracked_count || 0,
      connection_type: data.connection_type,
      last_update: new Date().toISOString()
    };

    setConnectedDevices(prev => {
      const existing = prev.find(d => d.device_id === data.device_id);
      if (existing) {
        return prev.map(d => 
          d.device_id === data.device_id 
            ? { ...d, ...newDevice }
            : d
        );
      } else {
        return [...prev, newDevice];
      }
    });

    setSuccess(`🟢 Scanner #${data.device_id} เชื่อมต่อแล้ว`);
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleScannerDisconnected = (data) => {
    setConnectedDevices(prev => 
      prev.map(device => 
        device.device_id === data.device_id
          ? { ...device, is_connected: false, last_update: new Date().toISOString() }
          : device
      )
    );

    // ถ้าเป็น device ที่เลือกอยู่ ให้เลือกใหม่
    if (selectedDevice?.device_id === data.device_id) {
      const remainingOnline = connectedDevices.filter(d => 
        d.device_id !== data.device_id && d.is_connected
      );
      setSelectedDevice(remainingOnline.length > 0 ? remainingOnline[0] : null);
    }

    setSuccess(`🔴 Scanner #${data.device_id} ตัดการเชื่อมต่อแล้ว`);
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleConfigUpdate = (data) => {
    if (selectedDevice?.device_id === data.device_id) {
      setScannerConfigs(prev => 
        prev.map(config => 
          config.key === data.config_key
            ? { ...config, value: data.config_value }
            : config
        )
      );
    }
  };

  const handleScanUpdate = (data) => {
    if (data.device_id) {
      setConnectedDevices(prev => 
        prev.map(device => 
          device.device_id === data.device_id
            ? { 
                ...device, 
                scanned_count: data.scanned_count || device.scanned_count || 0,
                tracked_count: data.tracked_count || device.tracked_count || 0,
                last_scan: new Date().toISOString()
              }
            : device
        )
      );
    }
  };

  // Helper functions
  const getConfigDisplayValue = (config) => {
    const freqBands = {
      "1": "USA (902-927MHz)",
      "2": "Korea (917-923MHz)",
      "3": "Europe (865-867MHz)",
      "4": "Japan (952-953MHz)",
      "5": "Malaysia (919-922MHz)",
      "7": "China 1 (840-844MHz)",
      "8": "China 2 (920-924MHz)"
    };

    switch (config.key) {
      case "WorkMode":
        return config.value === "0" ? "Answer" :
               config.value === "1" ? "Active" :
               config.value === "2" ? "Trigger" :
               `Mode ${config.value}`;
      case "FreqBand":
        return freqBands[String(config.value)] || `Band ${config.value}`;
      case "RfPower":
        return `${config.value} dBm`;
      case "ANT":
        return `${config.value} เสา`;
      default:
        return config.value;
    }
  };

  const getSelectOptions = (key) => {
    switch (key) {
      case "WorkMode":
        return [
          { value: "0", label: "Answer" },
          { value: "1", label: "Active" },
          { value: "2", label: "Trigger" }
        ];
      case "FreqBand":
        return [
          { value: "1", label: "USA (902-927MHz)" },
          { value: "2", label: "Korea (917-923MHz)" },
          { value: "3", label: "Europe (865-867MHz)" },
          { value: "4", label: "Japan (952-953MHz)" },
          { value: "5", label: "Malaysia (919-922MHz)" },
          { value: "7", label: "China 1 (840-844MHz)" },
          { value: "8", label: "China 2 (920-924MHz)" }
        ];
      default:
        return [];
    }
  };

  const getInputType = (key) => {
    if (key === "WorkMode" || key === "FreqBand") return "select";
    const numericKeys = ["RfPower", "ANT", "QValue", "Session", "BAUDRATE", "FilterTime", "BuzzerTime"];
    if (numericKeys.includes(key)) return "number";
    return "text";
  };

  const validateConfigValue = (key, value) => {
    if (value === undefined || value === null || value === "") return false;
    const s = String(value);

    switch (key) {
      case "RfPower":
        {
          const numValue = parseInt(s, 10);
          return !isNaN(numValue) && numValue >= 0 && numValue <= 33;
        }
      case "WorkMode":
        return ["0", "1", "2"].includes(s);
      case "FreqBand":
        return ["1","2","3","4","5","7","8"].includes(s) || /^0x[0-9a-fA-F]+$/.test(s);
      case "ANT":
        {
          const numValue = parseInt(s, 10);
          return !isNaN(numValue) && numValue >= 1 && numValue <= 16;
        }
      default:
        return true;
    }
  };

  // Load functions
  const loadLocations = async () => {
    try {
      const response = await api.get("/api/locations/active");
      setLocations(response.data);
      
      if (response.data.length > 0 && !connectionForm.location_id) {
        setConnectionForm(prev => ({
          ...prev,
          location_id: response.data[0].id
        }));
      }
    } catch (error) {
      console.error("Failed to load locations:", error);
      setLocations([
        { id: 1, name: "โรงงาน" },
        { id: 2, name: "ห้องช่าง" }
      ]);
    }
  };

  const loadScannerStatus = async () => {
    try {
      const response = await api.get("/api/scan/status");
      console.log("=== Scanner Status Response ===", response.data);
      
      const devices = response.data.devices || [];
      setConnectedDevices(devices);
      
      // เลือก device แรกถ้ายังไม่มีการเลือก
      if (devices.length > 0 && !selectedDevice) {
        const onlineDevice = devices.find(d => d.is_connected) || devices[0];
        setSelectedDevice(onlineDevice);
      }
      
      // ถ้า selectedDevice หายไป ให้เลือกใหม่
      if (selectedDevice && !devices.find(d => d.device_id === selectedDevice.device_id)) {
        setSelectedDevice(devices.length > 0 ? devices[0] : null);
      }
    } catch (error) {
      console.error("Failed to load scanner status:", error);
      setConnectedDevices([]);
      setSelectedDevice(null);
    }
  };

  // Scanner connection actions
  const handleConnect = async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    
    try {
      const connectData = {
        location_id: parseInt(connectionForm.location_id),
        connection_type: connectionForm.connection_type,
        ip: connectionForm.ip,
        port: parseInt(connectionForm.port),
        timeout: parseInt(connectionForm.timeout),
        com_port: connectionForm.com_port,
        baud_rate: parseInt(connectionForm.baud_rate)
      };

      const response = await api.post("/api/scan/connect", connectData);
      
      setSuccess(`เชื่อมต่อ Scanner สำเร็จ - Device ID: ${response.data.device_id}`);
      // ไม่ต้องโหลดใหม่ เพราะ WebSocket จะอัปเดตให้
      
      // เลือก device ที่เพิ่งเชื่อมต่อ (รอ WebSocket update)
      setTimeout(() => {
        const newDevice = connectedDevices.find(d => d.device_id === response.data.device_id);
        if (newDevice) {
          setSelectedDevice(newDevice);
        }
      }, 1000);
      
    } catch (error) {
      console.error("Connection failed:", error);
      setError(error.response?.data?.detail || "ไม่สามารถเชื่อมต่อได้");
    } finally {
      setLoading(false);
    }
  };
  
  const handleConnectDevice = async (device) => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const connectData = {
        location_id: device.location_id ?? connectionForm.location_id,
        connection_type: device.connection_type ?? connectionForm.connection_type,
        ip: device.ip ?? connectionForm.ip,
        port: parseInt(device.port ?? device.tcp_port ?? connectionForm.port, 10),
        timeout: parseInt(device.timeout ?? connectionForm.timeout, 10),
        com_port: device.com_port ?? device.serial_port ?? connectionForm.com_port,
        baud_rate: parseInt(device.baud_rate ?? connectionForm.baud_rate, 10)
      };

      const response = await api.post("/api/scan/connect", connectData);
      setSuccess(`เชื่อมต่อ Scanner สำเร็จ Device ID: ${response.data.device_id}`);
      
      // เลือก device ที่เพิ่งเชื่อมต่อ
      setSelectedDevice(device);
      
    } catch (error) {
      console.error("Connection failed:", error);
      setError(error.response?.data?.detail || "ไม่สามารถเชื่อมต่อได้");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (deviceId = null) => {
    const targetDeviceId = deviceId || selectedDevice?.device_id;
    if (!targetDeviceId) return;
    
    setLoading(true);
    setError("");
    setSuccess("");
    
    try {
      await api.post(`/api/scan/disconnect/${targetDeviceId}`);
      setSuccess(`ตัดการเชื่อมต่อ Device ${targetDeviceId} สำเร็จ`);
      // WebSocket จะจัดการ update state ให้
      
    } catch (error) {
      console.error("Disconnect failed:", error);
      if (error.response?.status !== 404) {
        setError(error.response?.data?.detail || "ไม่สามารถตัดการเชื่อมต่อได้");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStartScanning = async (deviceId = null) => {
    const targetDeviceId = deviceId || selectedDevice?.device_id;
    if (!targetDeviceId) return;
    
    setLoading(true);
    setError("");
    setSuccess("");
    
    try {
      await api.post(`/api/scan/start/${targetDeviceId}`);
      setSuccess(`เริ่มการสแกน Device ${targetDeviceId} แล้ว`);
      // WebSocket จะอัปเดต status
    } catch (error) {
      console.error("Start scanning failed:", error);
      setError(error.response?.data?.detail || "ไม่สามารถเริ่มการสแกนได้");
    } finally {
      setLoading(false);
    }
  };

  const handleStopScanning = async (deviceId = null) => {
    const targetDeviceId = deviceId || selectedDevice?.device_id;
    if (!targetDeviceId) return;
    
    setLoading(true);
    setError("");
    setSuccess("");
    
    try {
      await api.post(`/api/scan/stop/${targetDeviceId}`);
      setSuccess(`หยุดการสแกน Device ${targetDeviceId} แล้ว`);
      // WebSocket จะอัปเดต status
    } catch (error) {
      console.error("Stop scanning failed:", error);
      setError(error.response?.data?.detail || "ไม่สามารถหยุดการสแกนได้");
    } finally {
      setLoading(false);
    }
  };

  const handleManualUpdate = async (deviceId = null) => {
    const targetDeviceId = deviceId || selectedDevice?.device_id;
    if (!targetDeviceId) return;
    
    setLoading(true);
    setError("");
    setSuccess("");
    
    try {
      const response = await api.post(`/api/scan/update/${targetDeviceId}`);
      setSuccess(`อัปเดตข้อมูล Device ${targetDeviceId} แล้ว - ประมวลผล ${response.data.count} tags`);
      // WebSocket จะอัปเดตจำนวน tags
    } catch (error) {
      console.error("Manual update failed:", error);
      setError(error.response?.data?.detail || "ไม่สามารถอัปเดตข้อมูลได้");
    } finally {
      setLoading(false);
    }
  };

  // Scanner configuration actions
  const handleUpdateConfig = async (config) => {
    if (!selectedDevice || !selectedDevice.device_id) {
      setError("กรุณาเลือก Scanner ก่อน");
      return;
    }

    if (!validateConfigValue(config.key, newConfigValue)) {
      setError("ค่าที่กรอกไม่ถูกต้อง");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await api.put(`/api/scan/scanner-config/${selectedDevice.device_id}`, {
        config_key: config.key,
        config_value: newConfigValue
      });
      
      setEditingConfig(null);
      setNewConfigValue("");
      setSuccess(`อัปเดต ${config.key} เป็น ${newConfigValue} สำเร็จ (Device ${selectedDevice.device_id})`);
      // WebSocket จะอัปเดต config ให้
      
    } catch (error) {
      console.error("Failed to update config:", error);
      setError(error.response?.data?.detail || "ไม่สามารถอัปเดตการตั้งค่าได้");
    } finally {
      setLoading(false);
    }
  };

  const loadScannerConfig = async (deviceId) => {
    if (!deviceId) {
      setScannerConfigs([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/api/scan/scanner-config/${deviceId}`);
      const configData = response.data;
      if (Array.isArray(configData)) {
        setScannerConfigs(configData);
      } else if (configData && Array.isArray(configData.configs)) {
        setScannerConfigs(configData.configs);
      } else {
        setScannerConfigs([]);
      }
    } catch (error) {
      console.error("Failed to load scanner config:", error);
      setError(error.response?.data?.detail || "ไม่สามารถโหลดการตั้งค่าได้");
      setScannerConfigs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshConfig = async () => {
    if (!selectedDevice || !selectedDevice.device_id) {
      setError("กรุณาเลือก Scanner ก่อน");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await api.post(`/api/scan/scanner-config/refresh/${selectedDevice.device_id}`);
      await loadScannerConfig(selectedDevice.device_id);
      setSuccess("รีเฟรชการตั้งค่าสำเร็จ");
    } catch (error) {
      console.error("Failed to refresh config:", error);
      setError(error.response?.data?.detail || "ไม่สามารถรีเฟรชการตั้งค่าได้");
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadScannerStatus(),
        loadLocations(),
        selectedDevice ? loadScannerConfig(selectedDevice.device_id) : Promise.resolve()
      ]);
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setLoading(false);
    }
  };

  // ⭐ Effects
  useEffect(() => {
    mountedRef.current = true;
    
    const initializeApp = async () => {
      try {
        setLoading(true);
        await refreshData();
        // เชื่อมต่อ WebSocket หลังจากโหลดข้อมูลเสร็จ
        connectWebSocket();
      } catch (error) {
        console.error("❌ App initialization failed:", error);
        setError("เกิดข้อผิดพลาดในการเริ่มต้นระบบ: " + error.message);
      } finally {
        setLoading(false);
      }
    };
    
    initializeApp();

    // ⭐ ลดความถี่ของ polling เพราะมี WebSocket แล้ว
    const interval = setInterval(async () => {
      if (mountedRef.current && !wsConnected) {
        // โหลดข้อมูลใหม่เฉพาะเมื่อ WebSocket ไม่เชื่อมต่อ
        try {
          await loadScannerStatus();
        } catch (error) {
          console.warn("⚠️ Auto-refresh failed:", error.message);
        }
      }
    }, 15000); // เพิ่มจาก 5 วินาที เป็น 15 วินาที

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      // ปิด WebSocket เมื่อ component unmount
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // เมื่อเปลี่ยน selectedDevice ให้โหลดการตั้งค่าใหม่
  useEffect(() => {
    if (selectedDevice && selectedDevice.is_connected) {
      loadScannerConfig(selectedDevice.device_id);
    } else {
      setScannerConfigs([]);
    }
  }, [selectedDevice]);

  useEffect(() => {
    if (connectedDevices.length > 0) {
      // เลือก device ที่ออนไลน์ตัวแรก ถ้ามี
      const online = connectedDevices.find(d => d.is_connected);
      if (!selectedDevice || (selectedDevice && !selectedDevice.is_connected && online)) {
        setSelectedDevice(online || connectedDevices[0]);
      }
    }
  }, [connectedDevices]);

  if (loading && connectedDevices.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-cyan-100 flex items-center justify-center">
        <div className="text-center bg-white/80 backdrop-blur-lg rounded-3xl p-12 shadow-2xl border border-white/20">
          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center animate-spin">
            <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full"></div>
          </div>
          <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-3">
            กำลังโหลดข้อมูล Scanner
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
                  📡
                </div>
                <div>
                  <h1 className="text-3xl font-black bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent">
                    Scanner Management
                  </h1>
                  <p className="text-gray-600 mt-1">จัดการและควบคุม RFID Scanner แบบ Multi-Device</p>
                </div>
              </div>
              
              {/* Connection Status */}
              <div className="flex items-center gap-4">
                
                
                {lastUpdate && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
                    <span className="text-blue-500">🕒</span>
                    <span className="text-xs font-medium text-gray-700">
                      อัปเดตล่าสุด: {lastUpdate}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={refreshData}
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

        {error && !error.includes('api.healthCheck') && (
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

        {/* 🎨 No Devices Message */}
        {connectedDevices.length === 0 && !loading && (
          <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 p-8 mb-6 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-red-500/5"></div>
            <div className="relative">
              <div className="w-20 h-20 bg-gradient-to-r from-orange-400 to-red-500 rounded-full flex items-center justify-center text-white text-4xl mx-auto mb-4 animate-bounce shadow-2xl">
                📡
              </div>
              <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-3">
                ไม่มี Scanner เชื่อมต่อ
              </h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                ยังไม่มี RFID Scanner เชื่อมต่อกับระบบ กรุณาเชื่อมต่อ Scanner เพื่อเริ่มใช้งาน
              </p>
              <button
                onClick={() => setActiveTab('connection')}
                className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-3 rounded-2xl hover:from-blue-600 hover:to-purple-700 transition-all duration-300 font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-1"
              >
                🔗 ไปหน้าเชื่อมต่อ
              </button>
            </div>
          </div>
        )}

        {/* 🎨 Beautiful Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="group bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-4 hover:bg-white hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Connected Devices</p>
                  <p className="text-2xl font-black text-gray-800 mt-1">
                    {connectedDevices.filter(d => d.is_connected).length}
                  </p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white text-lg shadow-lg">
                  📡
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Real-time</span>
              </div>
            </div>
          </div>

          <div className="group bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-4 hover:bg-white hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Devices</p>
                  <p className="text-2xl font-black text-gray-800 mt-1">
                    {connectedDevices.length}
                  </p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl flex items-center justify-center text-white text-lg shadow-lg">
                  🖥️
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Active</span>
              </div>
            </div>
          </div>

          <div className="group bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-4 hover:bg-white hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Scanned Tags</p>
                  <p className="text-2xl font-black text-gray-800 mt-1">
                    {connectedDevices.reduce((sum, device) => sum + (device.scanned_count || 0), 0)}
                  </p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-xl flex items-center justify-center text-white text-lg shadow-lg">
                  🏷️
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-yellow-600 uppercase tracking-wide">Scanning</span>
              </div>
            </div>
          </div>

          <div className="group bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-4 hover:bg-white hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Tracked Tags</p>
                  <p className="text-2xl font-black text-gray-800 mt-1">
                    {connectedDevices.reduce((sum, device) => sum + (device.tracked_count || 0), 0)}
                  </p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center text-white text-lg shadow-lg">
                  📊
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Tracked</span>
              </div>
            </div>
          </div>
        </div>

        {/* 🎨 Beautiful Devices Table */}
        {connectedDevices.length > 0 && (
          <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 mb-6 overflow-hidden">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                    รายการ Scanner ทั้งหมด
                  </h3>
                  <p className="text-gray-600 text-sm mt-1">จัดการและติดตามสถานะ Scanner แบบ Real-time</p>
                </div>
              </div>
              
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
                      <th className="py-4 px-4 text-left font-bold text-gray-700 text-xs uppercase tracking-wider rounded-tl-2xl">Device Info</th>
                      <th className="py-4 px-4 text-left font-bold text-gray-700 text-xs uppercase tracking-wider">Location</th>
                      <th className="py-4 px-4 text-center font-bold text-gray-700 text-xs uppercase tracking-wider">สถานะ</th>
                      <th className="py-4 px-4 text-center font-bold text-gray-700 text-xs uppercase tracking-wider">Statistics</th>
                      <th className="py-4 px-4 text-center font-bold text-gray-700 text-xs uppercase tracking-wider">Last Update</th>
                      <th className="py-4 px-4 text-center font-bold text-gray-700 text-xs uppercase tracking-wider rounded-tr-2xl">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {connectedDevices.map(device => (
                      <tr 
                        key={device.device_id} 
                        className={`group hover:bg-gray-50 transition-all duration-200 ${
                          selectedDevice?.device_id === device.device_id 
                            ? 'bg-blue-50 border-l-4 border-blue-500' 
                            : ''
                        }`}
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-r from-gray-700 to-gray-900 rounded-xl flex items-center justify-center text-white font-bold shadow-lg text-sm">
                              #{device.device_id}
                            </div>
                            <div>
                              <p className="font-bold text-gray-800">Device #{device.device_id}</p>
                              <p className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded-lg mt-1">
                                {device.device_sn}
                              </p>
                              {selectedDevice?.device_id === device.device_id && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 mt-1">
                                  🎯 เลือกอยู่
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">📍</span>
                            <span className="text-gray-800 font-semibold text-sm">
                              {device.location_name || `Location ${device.location_id}`}
                            </span>
                          </div>
                        </td>
                        
                        <td className="py-4 px-4 text-center">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            device.is_connected 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {device.is_connected ? '🟢 Online' : '🔴 Offline'}
                          </span>
                        </td>
                        
                        <td className="py-4 px-4">
                          <div className="flex items-center justify-center gap-3">
                            <div className="text-center">
                              <p className="text-sm font-bold text-gray-800">{device.scanned_count || 0}</p>
                              <p className="text-xs text-gray-500">Scanned</p>
                            </div>
                            <div className="w-px h-6 bg-gray-300"></div>
                            <div className="text-center">
                              <p className="text-sm font-bold text-gray-800">{device.tracked_count || 0}</p>
                              <p className="text-xs text-gray-500">Tracked</p>
                            </div>
                          </div>
                        </td>
                        
                        <td className="py-4 px-4 text-center">
                          <div className="text-xs text-gray-500">
                            {device.last_update ? (
                              <>
                                <p>{new Date(device.last_update).toLocaleTimeString()}</p>
                                <p>{new Date(device.last_update).toLocaleDateString()}</p>
                              </>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                N/A
                              </span>
                            )}
                          </div>
                        </td>
                        
                        <td className="py-4 px-4">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => {
                                setSelectedDevice(device);
                                handleConnectDevice(device);
                              }}
                              className="bg-blue-500 text-white text-xs px-2 py-1 rounded-lg hover:bg-blue-600 transition-colors"
                            >
                              เลือก
                            </button>
                            {device.is_connected && (
                              <button
                                onClick={() => handleDisconnect(device.device_id)}
                                disabled={loading}
                                className="bg-red-500 text-white text-xs px-2 py-1 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                              >
                                ตัดการเชื่อมต่อ
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Tab Section */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 mb-6 overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {[{
                id: "connection",
                label: "การเชื่อมต่อ",
                icon: "🔗",
                description: "เชื่อมต่อ Scanner ใหม่"
              },
              {
                id: "control",
                label: "การตั้งค่าระบบ",
                icon: "💻",
                description: "ควบคุมการทำงาน"
              },
              {
                id: "config",
                label: "การตั้งค่าเครื่อง",
                icon: "⚙️",
                description: "ปรับแต่ง Scanner"
              }].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-2 border-b-3 font-medium text-sm flex items-center gap-3 transition-all ${
                    activeTab === tab.id
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300"
                  }`}
                >
                  <span className="text-lg">{tab.icon}</span>
                  <div className="text-left">
                    <p className="font-semibold">{tab.label}</p>
                    <p className="text-xs opacity-75">{tab.description}</p>
                  </div>
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* Tab Content - ใช้ components ที่ได้ตกแต่งแล้ว */}
            {activeTab === "connection" && (
              <ConnectionTab
                connectionForm={connectionForm}
                setConnectionForm={setConnectionForm}
                locations={locations}
                connectedDevices={connectedDevices}
                selectedDevice={selectedDevice}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                loading={loading}
                wsConnected={wsConnected}
              />
            )}

            {activeTab === "control" && (
              <ControlTab
                connectedDevices={connectedDevices}
                selectedDevice={selectedDevice}
                onStartScanning={handleStartScanning}
                onStopScanning={handleStopScanning}
                onManualUpdate={handleManualUpdate}
                loading={loading}
                wsConnected={wsConnected}
              />
            )}

            {activeTab === "config" && (
              <ConfigurationTab
                scannerConfigs={scannerConfigs.filter(c => ["WorkMode","FreqBand","RfPower"].includes(c.key))}
                editingConfig={editingConfig}
                setEditingConfig={setEditingConfig}
                newConfigValue={newConfigValue}
                setNewConfigValue={setNewConfigValue}
                onUpdateConfig={handleUpdateConfig}
                onRefreshConfig={handleRefreshConfig}
                scannerConnected={!!selectedDevice}
                selectedDevice={selectedDevice}
                loading={loading}
                getConfigDisplayValue={getConfigDisplayValue}
                getInputType={getInputType}
                getSelectOptions={getSelectOptions}
                validateConfigValue={validateConfigValue}
                wsConnected={wsConnected}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}