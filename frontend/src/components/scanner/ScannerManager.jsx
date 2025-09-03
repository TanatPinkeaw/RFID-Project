import { useState, useEffect } from 'react';
import ConnectionTab from './ConnectionTab';
import ControlTab from './ControlTab';
import ConfigurationTab from './ConfigurationTab';
import api from '../../utils/api';

export default function ScannerManager() {
  const [activeTab, setActiveTab] = useState('connection');
  const [connectedDevices, setConnectedDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [locations, setLocations] = useState([]);
  const [connectionForm, setConnectionForm] = useState({
    location_id: 1,
    connection_type: 'network',
    ip: '10.10.100.254',
    port: 8899,
    com_port: 'COM7',
    baud_rate: 115200,
    timeout: 5000
  });
  const [scannerConfigs, setScannerConfigs] = useState([]);
  const [editingConfig, setEditingConfig] = useState(null);
  const [newConfigValue, setNewConfigValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  // ✨ Enhanced tab definitions
  const tabs = [
    { 
      id: 'connection', 
      name: 'การเชื่อมต่อ', 
      icon: '🔗',
      description: 'เชื่อมต่อและจัดการ RFID Scanner'
    },
    { 
      id: 'control', 
      name: 'การควบคุม', 
      icon: '🎮',
      description: 'ควบคุมการทำงานของระบบ'
    },
    { 
      id: 'configuration', 
      name: 'การตั้งค่า', 
      icon: '⚙️',
      description: 'ตั้งค่าพารามิเตอร์ Scanner'
    }
  ];

  // Load initial data
  useEffect(() => {
    loadLocations();
    loadConnectedDevices();
    initWebSocket();
  }, []);

  const loadLocations = async () => {
    try {
      const response = await api.get('/locations');
      setLocations(response.data || []);
    } catch (error) {
      console.error('Failed to load locations:', error);
    }
  };

  const loadConnectedDevices = async () => {
    try {
      const response = await api.get('/scanner/devices');
      setConnectedDevices(response.data || []);
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  };

  const initWebSocket = () => {
    // WebSocket connection logic here
    setWsConnected(true);
  };

  // Connection handlers
  const handleConnect = async () => {
    setLoading(true);
    try {
      const response = await api.post('/scanner/connect', connectionForm);
      if (response.data.success) {
        await loadConnectedDevices();
      }
    } catch (error) {
      console.error('Connection failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (deviceId) => {
    setLoading(true);
    try {
      await api.post(`/scanner/disconnect/${deviceId}`);
      await loadConnectedDevices();
      if (selectedDevice?.device_id === deviceId) {
        setSelectedDevice(null);
      }
    } catch (error) {
      console.error('Disconnect failed:', error);
    } finally {
      setLoading(false);
    }
  };

  // Control handlers
  const handleStartScanning = async (deviceId) => {
    setLoading(true);
    try {
      await api.post(`/scanner/${deviceId}/start`);
    } catch (error) {
      console.error('Start scanning failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStopScanning = async (deviceId) => {
    setLoading(true);
    try {
      await api.post(`/scanner/${deviceId}/stop`);
    } catch (error) {
      console.error('Stop scanning failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManualUpdate = async (deviceId) => {
    setLoading(true);
    try {
      await api.post(`/scanner/${deviceId}/manual-update`);
    } catch (error) {
      console.error('Manual update failed:', error);
    } finally {
      setLoading(false);
    }
  };

  // Configuration handlers
  const handleRefreshConfig = async () => {
    if (!selectedDevice) return;
    setLoading(true);
    try {
      const response = await api.get(`/scanner/${selectedDevice.device_id}/config`);
      setScannerConfigs(response.data || []);
    } catch (error) {
      console.error('Failed to refresh config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateConfig = async (config) => {
    if (!selectedDevice) return;
    setLoading(true);
    try {
      await api.put(`/scanner/${selectedDevice.device_id}/config/${config.key}`, {
        value: newConfigValue
      });
      await handleRefreshConfig();
      setEditingConfig(null);
      setNewConfigValue('');
    } catch (error) {
      console.error('Failed to update config:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper functions
  const getConfigDisplayValue = (config) => {
    if (config.key === 'RfPower') {
      return `${config.value} dBm`;
    }
    return config.value;
  };

  const getInputType = (key) => {
    if (key === 'Session') return 'select';
    return 'number';
  };

  const getSelectOptions = (key) => {
    if (key === 'Session') {
      return [
        { value: '0', label: 'S0' },
        { value: '1', label: 'S1' },
        { value: '2', label: 'S2' },
        { value: '3', label: 'S3' }
      ];
    }
    return [];
  };

  const validateConfigValue = (key, value) => {
    if (key === 'RfPower') {
      const num = parseFloat(value);
      return num >= 0 && num <= 33;
    }
    return true;
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'connection':
        return (
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
        );
      case 'control':
        return (
          <ControlTab
            connectedDevices={connectedDevices}
            selectedDevice={selectedDevice}
            onStartScanning={handleStartScanning}
            onStopScanning={handleStopScanning}
            onManualUpdate={handleManualUpdate}
            loading={loading}
            wsConnected={wsConnected}
          />
        );
      case 'configuration':
        return (
          <ConfigurationTab
            scannerConfigs={scannerConfigs}
            editingConfig={editingConfig}
            setEditingConfig={setEditingConfig}
            newConfigValue={newConfigValue}
            setNewConfigValue={setNewConfigValue}
            onUpdateConfig={handleUpdateConfig}
            onRefreshConfig={handleRefreshConfig}
            selectedDevice={selectedDevice}
            loading={loading}
            getConfigDisplayValue={getConfigDisplayValue}
            getInputType={getInputType}
            getSelectOptions={getSelectOptions}
            validateConfigValue={validateConfigValue}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="scanner-manager-container">
      {/* ✨ Enhanced Header */}
      <div className="scanner-header">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center text-white text-3xl animate-float">
            📡
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gradient-primary mb-2">RFID Scanner Manager</h1>
            <p className="text-elegant-text-secondary">
              จัดการและควบคุม RFID Scanner แบบ Multi-Device Real-time
            </p>
          </div>
        </div>
        
        {/* Connection Status */}
        <div className="flex items-center gap-4">
          <div className="status-indicator">
            <span className={`status-badge ${wsConnected ? 'status-success' : 'status-error'}`}>
              {wsConnected ? '🟢 Real-time Connected' : '🔴 Disconnected'}
            </span>
          </div>
          <div className="devices-counter">
            <span className="text-elegant-text-muted text-sm">Connected Devices:</span>
            <span className="font-bold text-xl text-elegant-text-primary ml-2">
              {connectedDevices.length}
            </span>
          </div>
        </div>
      </div>

      {/* ✨ Enhanced Device Selector */}
      {connectedDevices.length > 0 && (
        <div className="device-selector-panel">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-gradient-accent rounded-lg flex items-center justify-center text-white text-lg">
              📱
            </div>
            <h3 className="text-lg font-bold text-elegant-text-primary">เลือก Scanner</h3>
          </div>
          
          <div className="device-grid">
            {connectedDevices.map(device => (
              <button
                key={device.device_id}
                onClick={() => setSelectedDevice(device)}
                className={`device-selector-item ${
                  selectedDevice?.device_id === device.device_id 
                    ? 'device-selector-selected' 
                    : 'device-selector-normal'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-dark rounded-lg flex items-center justify-center text-white font-bold text-sm">
                    #{device.device_id}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-bold text-elegant-text-primary">Device #{device.device_id}</p>
                    <p className="text-xs text-elegant-text-muted font-mono">{device.device_sn}</p>
                  </div>
                  <span className={`status-badge text-xs ${
                    device.is_connected ? 'status-online' : 'status-offline'
                  }`}>
                    {device.is_connected ? '🟢' : '🔴'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ✨ Enhanced Tab Navigation */}
      <div className="tab-navigation">
        <div className="tab-header">
          <h2 className="text-xl font-bold text-elegant-text-primary">การจัดการระบบ</h2>
          <p className="text-elegant-text-muted text-sm">เลือกฟังก์ชันที่ต้องการใช้งาน</p>
        </div>
        
        <div className="tab-buttons">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab-button ${
                activeTab === tab.id ? 'tab-button-active' : 'tab-button-inactive'
              }`}
            >
              <div className="tab-icon">{tab.icon}</div>
              <div className="tab-content">
                <span className="tab-name">{tab.name}</span>
                <span className="tab-description">{tab.description}</span>
              </div>
              {activeTab === tab.id && <div className="tab-indicator"></div>}
            </button>
          ))}
        </div>
      </div>

      {/* ✨ Enhanced Tab Content */}
      <div className="tab-content-container">
        {renderTabContent()}
      </div>
    </div>
  );
}