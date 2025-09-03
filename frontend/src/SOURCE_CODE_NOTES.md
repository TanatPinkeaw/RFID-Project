# 📂 Frontend Source Code Directory Documentation

> เอกสารอธิบายโครงสร้างและหน้าที่ของไฟล์ในโฟลเดอร์ `src/` ของ RFID Management System
> ตามโค้ดจริงที่มีอยู่ในระบบ

## 🎯 ภาพรวม Source Directory

โฟลเดอร์ `src/` ประกอบด้วย React application source code ที่ใช้งานจริง
พัฒนาด้วย React 18, React Router, และ Axios สำหรับ API integration

---

## 📂 โครงสร้างไฟล์ในโฟลเดอร์ src/

### 🚀 **Entry Point Files (Root Level)**

#### 📄 `main.jsx`
```jsx
/*
Application Entry Point
=======================

ไฟล์เริ่มต้นหลักของ React application
ทำหน้าที่ mount React app ลงใน DOM element

ปัจจุบันใช้:
- React 18 StrictMode สำหรับ development checks
- BrowserRouter สำหรับ client-side routing
- createRoot API (React 18 feature)

Code Structure:
*/
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

/*
Features:
- React 18 concurrent features
- StrictMode สำหรับ detecting side effects
- Global routing setup
- CSS imports
- Performance optimizations
*/
```

#### 📄 `App.jsx`
```jsx
/*
Main Application Component
=========================

Root component ที่จัดการ layout และ routing หลัก

ปัจจุบันใช้:
- Sidebar navigation (collapsible)
- Route-based page rendering
- API connection testing
- Responsive layout design

Key Features:
*/

// Routes ที่มีในระบบ:
Routes: {
  '/dashboard': 'หน้าแดชบอร์ดหลัก',
  '/assets': 'จัดการสินทรัพย์', 
  '/tags': 'จัดการ RFID tags',
  '/borrowing': 'ระบบยืม-คืน',
  '/scanner': 'จัดการเครื่องสแกน',
  '/notifications': 'การแจ้งเตือน'
}

// Layout Features:
Layout: {
  sidebar: 'Collapsible sidebar navigation',
  mainContent: 'Responsive main content area',
  backgroundGradient: 'from-indigo-100 via-purple-50 to-cyan-100',
  responsiveWidth: 'Dynamic width calculation'
}

// API Testing:
APIConnection: {
  endpoint: '/api/locations',
  purpose: 'Test backend connectivity on app start',
  errorHandling: 'Console logging for debugging'
}

/*
Layout Structure:
- Sidebar (fixed, collapsible)
- Main Content (responsive width)
- Route-based page content
- Gradient background
*/
```

#### 📄 `index.css`
```css
/*
Global Styles
=============

Global CSS styles สำหรับ application
รวม base styles และ utility classes

Styling System:
- CSS custom properties (variables)
- Global typography
- Base component styles
- Responsive design utilities
- Animation definitions

Features:
- Modern CSS practices
- Performance optimizations
- Accessibility considerations
- Cross-browser compatibility
*/
```

---

### 📁 **Assets Directory (src/assets/)**

#### 📄 `react.svg`
```
Static Assets for Components
===========================

โฟลเดอร์เก็บ assets ที่ใช้ใน components
ผ่าน bundling process ของ Vite

Contents:
- react.svg: React logo สำหรับ branding
- อื่นๆ: Icons, images ที่ใช้ใน components

Build Process:
- Automatic optimization
- Hash-based caching
- ES module imports
- SVG optimization
```

---

### 📁 **Components Directory (src/components/)**

#### 📄 `ErrorBoundary.jsx`
```jsx
/*
Error Boundary Component
=======================

React Error Boundary สำหรับจับและจัดการ JavaScript errors
ใน component tree

Features:
- Catch component render errors
- Display fallback UI
- Error logging และ reporting
- Graceful error recovery
- User-friendly error messages

Implementation:
- Class component (required for Error Boundary)
- componentDidCatch for error logging
- getDerivedStateFromError for state updates
- Fallback UI with retry option
*/
```

#### 📄 `Navbar.jsx` (Sidebar Component)
```jsx
/*
Sidebar Navigation Component
===========================

Main navigation component ที่ทำงานเป็น sidebar
แทนที่จะเป็น navbar แบบ horizontal

Features ปัจจุบัน:
- Collapsible sidebar design
- Real-time WebSocket connection status
- Notification count display
- Active route highlighting
- Mobile responsive design
- Connection status monitoring

WebSocket Integration:
*/

WebSocketFeatures: {
  connection: 'ws://localhost:8000/ws/realtime',
  features: [
    'Real-time notification updates',
    'Connection status monitoring', 
    'Automatic reconnection with exponential backoff',
    'Error handling และ logging'
  ],
  reconnection: 'Smart retry logic with increasing delays'
}

NavigationStructure: {
  dashboard: 'ภาพรวมระบบ',
  assets: 'จัดการสินทรัพย์',
  tags: 'จัดการ RFID Tags', 
  borrowing: 'ระบบยืม-คืน',
  scanner: 'จัดการเครื่องสแกน',
  notifications: 'การแจ้งเตือน'
}

ResponsiveDesign: {
  desktop: 'Full sidebar with labels',
  collapsed: 'Icon-only sidebar',
  mobile: 'Overlay sidebar'
}

/*
Technical Implementation:
- useState สำหรับ state management
- useEffect สำหรับ WebSocket lifecycle
- useRef สำหรับ WebSocket reference
- useCallback สำหรับ optimized functions
- API integration สำหรับ notification count
*/
```

---

### 📁 **Scanner Components (src/components/scanner/)**

#### 📄 `ScannerManager.jsx`
```jsx
/*
Scanner Manager Main Component
=============================

Component หลักสำหรับจัดการเครื่องสแกน RFID
ทำหน้าที่เป็น container สำหรับ scanner features

Features ปัจจุบัน:
*/

TabStructure: {
  connection: {
    name: 'การเชื่อมต่อ',
    icon: '🔗', 
    description: 'เชื่อมต่อและจัดการ RFID Scanner',
    component: 'ConnectionTab'
  },
  control: {
    name: 'การควบคุม',
    icon: '🎮',
    description: 'ควบคุมการทำงานของระบบ', 
    component: 'ControlTab'
  },
  configuration: {
    name: 'การตั้งค่า',
    icon: '⚙️',
    description: 'ตั้งค่าพารามิเตอร์ Scanner',
    component: 'ConfigurationTab'
  }
}

StateManagement: {
  activeTab: 'Current selected tab',
  connectedDevices: 'List of connected scanners',
  selectedDevice: 'Currently selected device',
  locations: 'Available location list',
  connectionForm: 'Connection parameters',
  scannerConfigs: 'Scanner configuration settings',
  loading: 'Loading state management',
  wsConnected: 'WebSocket connection status'
}

ConnectionForm: {
  location_id: 1,
  connection_type: 'network|serial',
  ip: '10.10.100.254',
  port: 8899,
  com_port: 'COM7',
  baud_rate: 115200,
  timeout: 5000
}

/*
Architecture:
- Tab-based interface
- State management สำหรับ multiple scanners
- API integration สำหรับ device management
- WebSocket สำหรับ real-time updates
- Form handling สำหรับ configuration
*/
```

#### 📄 `ConnectionTab.jsx`
```jsx
/*
Scanner Connection Tab
=====================

Tab สำหรับจัดการการเชื่อมต่อเครื่องสแกน RFID

Features:
- Network connection (TCP/IP)
- Serial connection (COM port)
- Connection testing
- Device discovery
- Connection status monitoring
- Error handling และ troubleshooting

Connection Types:
- Network: IP address และ port configuration
- Serial: COM port และ baud rate settings
- Test connection functionality
- Connection parameter validation
*/
```

#### 📄 `ControlTab.jsx`
```jsx
/*
Scanner Control Tab
==================

Tab สำหรับควบคุมการทำงานของเครื่องสแกน

Features:
- Start/Stop scanning operations
- Real-time scan results display
- Scan mode selection
- Manual scan triggers
- Performance monitoring
- Scan data export

Controls:
- Scan operation management
- Real-time feedback
- Error handling
- Result filtering
- Export functionality
*/
```

#### 📄 `ConfigurationTab.jsx`
```jsx
/*
Scanner Configuration Tab
========================

Tab สำหรับตั้งค่าพารามิเตอร์เครื่องสแกน

Features:
- RF power adjustment
- Antenna configuration
- Region settings
- Q-factor tuning
- Session parameters
- Tag filtering settings

Configuration Categories:
- RF Parameters: Power, frequency, region
- Antenna Settings: Port selection, power
- Algorithm Settings: Q-factor, session
- Filter Settings: Tag type filtering
- Performance Tuning: Speed vs accuracy
*/
```

#### 📄 `StatsCard.jsx`
```jsx
/*
Statistics Card Component
========================

Component แสดงสถิติการทำงานของเครื่องสแกน

Features:
- Real-time performance metrics
- Connection statistics
- Scan rate monitoring
- Error rate tracking
- Historical data visualization

Metrics:
- Scan rate (tags/second)
- Connection uptime
- Error percentage
- Total scans count
- Performance trends
*/
```

#### 📄 `SystemConfigTab.jsx`
```jsx
/*
System Configuration Tab
========================

Tab สำหรับตั้งค่าระบบส่วนกลาง

Features:
- Global system settings
- Database configuration
- Notification preferences
- Performance tuning
- System maintenance tools

Configuration Areas:
- System-wide settings
- Database connection parameters
- Notification rules
- Performance optimization
- Backup และ maintenance
*/
```

---

### 📁 **Pages Directory (src/pages/)**

#### 📄 `Dashboard.jsx`
```jsx
/*
Dashboard Main Page
==================

หน้าแดชบอร์ดหลักแสดงภาพรวมของระบบ

Features ปัจจุบัน:
*/

Statistics: {
  totalTags: 'จำนวน RFID tags ทั้งหมด',
  activeTags: 'จำนวน tags ที่ใช้งานอยู่', 
  pendingTags: 'จำนวน tags ที่รอดำเนินการ',
  recentActivities: 'จำนวนกิจกรรมล่าสุด'
}

RecentActivities: {
  maxActivities: 50,
  filters: {
    type: 'ประเภทกิจกรรม (all|scan|movement|alert)',
    date: 'ช่วงวันที่ (all|today|week|month)',
    user: 'ผู้ใช้งาน (all|specific_user)',
    status: 'สถานะ (all|success|error|pending)'
  },
  realTimeUpdates: 'WebSocket integration สำหรับ real-time'
}

WebSocketIntegration: {
  url: 'ws://hostname:8000/ws/realtime',
  features: [
    'Real-time activity updates',
    'Live statistics refresh',
    'Automatic reconnection', 
    'Error handling'
  ]
}

StateManagement: {
  stats: 'Dashboard statistics',
  recentActivities: 'Activity list (max 50)',
  filters: 'Activity filtering options',
  loading: 'Loading states',
  wsConnection: 'WebSocket connection state'
}

/*
Architecture:
- Real-time dashboard with WebSocket
- Filterable activity feed
- Statistics cards
- Loading state management
- Error handling และ recovery
*/
```

#### 📄 `Assets.jsx`
```jsx
/*
Assets Management Page
=====================

หน้าจัดการสินทรัพย์ในระบบ

Features:
- Asset listing และ management
- Add/Edit/Delete operations
- Asset-Tag binding
- Search และ filtering
- Bulk operations
- Asset status tracking

Functions:
- CRUD operations สำหรับ assets
- Tag assignment management
- Status monitoring
- Bulk action support
- Export/Import functionality
*/
```

#### 📄 `Tags.jsx`
```jsx
/*
RFID Tags Management Page
========================

หน้าจัดการ RFID tags

Features:
- Tag registration และ management
- Tag-Asset binding/unbinding
- Tag status monitoring
- Bulk tag operations
- Tag validation

Functions:
- Tag CRUD operations
- Binding management
- Status tracking
- Bulk operations
- Validation rules
*/
```

#### 📄 `Scanner.jsx`
```jsx
/*
Scanner Page Container
=====================

Page container สำหรับ Scanner management
ทำหน้าที่ wrapper สำหรับ ScannerManager component

Features:
- Scanner management interface
- Device connection handling
- Configuration management
- Real-time monitoring

Implementation:
- Renders ScannerManager component
- Page-level layout
- Navigation integration
*/
```

#### 📄 `Borrowing.jsx`
```jsx
/*
Borrowing Management Page
========================

หน้าจัดการระบบยืม-คืนสินทรัพย์

Features:
- Borrowing request management
- Check-out/Check-in processes
- Overdue tracking
- Borrower management
- Return processing

Functions:
- Borrowing workflow
- Due date tracking
- Notification system
- History tracking
- Report generation
*/
```

#### 📄 `History.jsx`
```jsx
/*
History และ Activity Log Page
=============================

หน้าแสดงประวัติและ log การใช้งานระบบ

Features:
- Activity timeline
- Movement history
- User action logs
- System event logs
- Advanced filtering

Functions:
- Historical data display
- Advanced search/filter
- Export capabilities
- Timeline visualization
- Audit trail
*/
```

#### 📄 `Notifications.jsx`
```jsx
/*
Notifications Management Page
============================

หน้าจัดการการแจ้งเตือนและ alerts

Features:
- Notification center
- Real-time alerts
- Mark as read/unread
- Notification preferences
- Alert configuration

Functions:
- Notification management
- Real-time updates
- User preferences
- Alert rules
- History tracking
*/
```

---

### 📁 **Services Directory (src/services/)**

#### 📄 `api.js`
```javascript
/*
Main API Service Layer
=====================

Central API service สำหรับการติดต่อกับ backend

Configuration ปัจจุบัน:
*/

BaseURL: {
  development: 'http://localhost:8000',
  production: 'https://your-backend-name.railway.app (จาก VITE_API_URL)'
}

Features: {
  axiosInstance: 'Configured with base URL และ timeout',
  timeout: '30 seconds',
  headers: 'JSON content type',
  interceptors: {
    request: 'Logging และ error handling',
    response: 'Response logging และ error management'
  }
}

ErrorHandling: {
  404: 'Resource not found warnings',
  500: 'Server error logging', 
  network: 'Connection error handling',
  timeout: 'Request timeout management'
}

WebSocketURL: {
  helper: 'getWebSocketURL() function',
  protocol: 'ws/wss based on HTTP/HTTPS',
  endpoint: '/ws/realtime'
}

/*
Technical Implementation:
- Axios-based HTTP client
- Environment-aware configuration
- Comprehensive error handling
- Request/Response logging
- WebSocket URL helper
- Production-ready setup
*/
```

#### 📄 `testApi.js`
```javascript
/*
Test และ Mock API Service
=========================

Mock API service สำหรับการทดสอบและ development

Features:
- Mock data generation
- Simulated API responses
- Development testing support
- Error scenario simulation
- Offline development capability

Use Cases:
- Frontend development without backend
- Testing error scenarios
- Performance testing
- Demo data generation
- Integration testing

Mock Data Types:
- Sample assets
- Test RFID tags
- User data
- Scan results
- Notifications
*/
```

---

## 🔄 **Application Data Flow**

### API Communication:
```
Frontend → api.js → axios → Backend API
Frontend ← Response Data ← Backend API
```

### WebSocket Flow:
```
Frontend → WebSocket connection → Backend WS
Frontend ← Real-time updates ← Backend WS
```

### Component Hierarchy:
```
main.jsx
└── App.jsx
    ├── Navbar.jsx (Sidebar)
    └── Routes
        ├── Dashboard.jsx
        ├── Assets.jsx  
        ├── Tags.jsx
        ├── Scanner.jsx
        │   └── ScannerManager.jsx
        │       ├── ConnectionTab.jsx
        │       ├── ControlTab.jsx
        │       ├── ConfigurationTab.jsx
        │       ├── StatsCard.jsx
        │       └── SystemConfigTab.jsx
        ├── Borrowing.jsx
        ├── History.jsx
        └── Notifications.jsx
```

### State Management Pattern:
```
useState → Local component state
useEffect → Lifecycle management
API calls → External data
WebSocket → Real-time updates
```

---

## 🛠️ **Technical Implementation Details**

### API Integration:
- **Base URL**: Environment-aware (dev/prod)
- **Timeout**: 30 seconds
- **Error Handling**: Comprehensive logging
- **WebSocket**: Real-time connection support

### Component Architecture:
- **Functional Components**: Modern React hooks
- **State Management**: useState, useEffect
- **Error Boundaries**: Global error catching
- **Real-time Updates**: WebSocket integration

### Routing System:
- **React Router**: Client-side routing
- **Route Protection**: (เตรียมไว้สำหรับ authentication)
- **Active Route**: Visual indication

### Performance Features:
- **Code Splitting**: Route-based
- **Lazy Loading**: Component optimization
- **Caching**: API response caching
- **Real-time**: WebSocket efficiency

---

## 🎨 **Styling และ Design System**

### CSS Framework:
- **Tailwind CSS**: Utility-first approach
- **Custom CSS**: Global styles ใน index.css
- **Responsive Design**: Mobile-first approach

### Color Scheme:
```css
Background: from-indigo-100 via-purple-50 to-cyan-100
Primary: Blue tones
Secondary: Gray tones
Success: Green tones
Error: Red tones
```

### Layout System:
- **Sidebar**: Collapsible navigation
- **Main Content**: Responsive width
- **Cards**: Component containers
- **Tables**: Data display

---

## 🔧 **Development Guidelines**

### Code Standards:
```jsx
// Component Template
import { useState, useEffect } from 'react'
import api from '../services/api'

function ComponentName() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const response = await api.get('/endpoint')
      setData(response.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return <div>{/* Component JSX */}</div>
}

export default ComponentName
```

### Best Practices:
1. ✅ Functional components with hooks
2. ✅ Proper error handling  
3. ✅ Loading states
4. ✅ WebSocket management
5. ✅ API error handling
6. ✅ Responsive design
7. ✅ Performance optimization

---

## 🚀 **WebSocket Integration Details**

### Connection Management:
```javascript
const connectWs = () => {
  const ws = new WebSocket('ws://localhost:8000/ws/realtime')
  
  ws.onopen = () => {
    console.log('Connected')
    reconnectAttempts.current = 0
  }
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    // Handle real-time updates
  }
  
  ws.onclose = () => {
    // Automatic reconnection with exponential backoff
  }
}
```

### Real-time Features:
- **Dashboard**: Live statistics updates
- **Notifications**: Real-time alerts
- **Scanner**: Live scan results
- **Activities**: Real-time activity feed

---

*เอกสารนี้อัปเดตล่าสุด: September 3, 2025*
*ตาม source code ที่มีอยู่จริงในระบบ*
