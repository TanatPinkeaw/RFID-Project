import { Routes, Route } from 'react-router-dom';  // ลบ BrowserRouter ออก
import { useEffect, useState } from 'react';
import Sidebar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Assets from './pages/Assets';
import Tags from './pages/Tags';
import Scanner from './pages/Scanner';
import Notifications from './pages/Notifications';
import Borrowing from './pages/Borrowing';
import api from './services/api';

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // ทดสอบ API connection เมื่อ app start
  useEffect(() => {
    const testConnection = async () => {
      try {
        console.log('Testing API connection...');
        const response = await api.get('/api/locations');
        console.log('API connection successful:', response.data);
      } catch (error) {
        console.error('API connection failed:', error);
      }
    };
    
    testConnection();
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar 
        isCollapsed={sidebarCollapsed} 
        setIsCollapsed={setSidebarCollapsed} 
      />
      
      {/* Main Content */}
      <div 
        className={`flex-1 flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? 'ml-16' : 'ml-64'
        }`}
        style={{ width: `calc(100vw - ${sidebarCollapsed ? '64px' : '256px'})` }}
      >
        <main className="flex-1 overflow-auto bg-gradient-to-br from-indigo-100 via-purple-50 to-cyan-100">
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/assets" element={<Assets />} />
            <Route path="/tags" element={<Tags />} />
            <Route path="/borrowing" element={<Borrowing />} />
            <Route path="/scanner" element={<Scanner />} />
            <Route path="/notifications" element={<Notifications />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
