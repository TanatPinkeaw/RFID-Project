# 🎨 RFID Management System - Frontend Directory Documentation

> เอกสารอธิบายโครงสร้างและหน้าที่ของไฟล์ในโฟลเดอร์ frontend/
> React + Vite application สำหรับ RFID Management System

## 🎯 ภาพรวม Frontend Directory

โฟลเดอร์ `frontend/` ประกอบด้วย React application ที่ใช้ Vite เป็น build tool
สำหรับสร้าง user interface ของระบบ RFID Management System

---

## 📂 โครงสร้างไฟล์ในโฟลเดอร์ frontend/

### 🔧 **Configuration Files (Root Level)**

#### 📄 `.gitignore`
```bash
# Git ignore configuration for frontend
# ==================================

# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Production builds
dist/
build/

# Environment files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Cache และ temporary files
.cache/
.parcel-cache/
.next/
.nuxt/

Purpose:
- ป้องกันไม่ให้ commit ไฟล์ที่ไม่จำเป็น
- รักษาความปลอดภัย (environment variables)
- ลดขนาด repository
- หลีกเลี่ยง conflict จาก IDE settings
```

#### 📄 `package.json`
```json
{
  "name": "rfid-management-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "description": "Frontend for RFID Management System",
  
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0"
  },
  
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.8.0",
    "axios": "^1.3.0",
    "lucide-react": "^0.263.0"
  },
  
  "devDependencies": {
    "vite": "^4.3.0",
    "@vitejs/plugin-react": "^4.0.0",
    "eslint": "^8.38.0",
    "eslint-plugin-react": "^7.32.0",
    "eslint-plugin-react-hooks": "^4.6.0"
  }
}

/*
Package.json Features:
=====================

Scripts:
- dev: รัน development server (Hot Module Replacement)
- build: สร้าง production build (optimized)
- preview: ดู production build locally
- lint: ตรวจสอบ code quality

Core Dependencies:
- React 18: UI library with hooks และ concurrent features
- React DOM: DOM rendering
- React Router DOM: Client-side routing
- Axios: HTTP client สำหรับ API calls
- Lucide React: Icon library

Development Dependencies:
- Vite: Fast build tool และ dev server
- Vite React Plugin: React support สำหรับ Vite
- ESLint: Code linting และ quality checking
- ESLint React Plugins: React-specific linting rules

Build System Features:
- Hot Module Replacement (HMR)
- Tree shaking สำหรับ smaller bundles
- Code splitting สำหรับ lazy loading
- TypeScript support (ถ้าต้องการ)
- CSS preprocessing support
*/
```

#### 📄 `vite.config.js`
```javascript
/*
Vite Configuration
==================

ไฟล์การตั้งค่า Vite build tool สำหรับ development และ production

Configuration Features:
- React plugin integration
- Development server settings
- Build optimization
- Asset handling
- Environment variables
- Proxy configuration สำหรับ API calls

Development Server:
- Port configuration (default: 3000)
- Hot Module Replacement
- Proxy สำหรับ backend API
- CORS handling

Build Settings:
- Output directory (dist/)
- Asset optimization
- Code splitting strategies
- Bundle analysis
- Source maps generation

Common Configurations:
*/

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  
  // Development server
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true
      }
    }
  },
  
  // Build settings
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          utils: ['axios']
        }
      }
    }
  },
  
  // Environment variables
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version)
  }
})
```

#### 📄 `eslint.config.js`
```javascript
/*
ESLint Configuration
===================

การตั้งค่า ESLint สำหรับ code quality และ consistency

Linting Rules:
- React best practices
- Hooks rules enforcement
- Accessibility guidelines
- Code style consistency
- Import/export validation

Configuration Features:
- React-specific rules
- Hooks dependency checking
- JSX syntax validation
- Modern JavaScript features
- Custom rule overrides
*/

import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: '18.2' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/jsx-no-target-blank': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]
```

#### 📄 `index.html`
```html
<!--
Main HTML Template
==================

Entry point สำหรับ React application
ใช้เป็น template สำหรับ Vite build system

Features:
- Meta tags สำหรับ responsive design
- Favicon configuration
- Title และ description
- Root element สำหรับ React mounting
- Vite entry script

SEO และ Performance:
- Viewport meta tag
- Character encoding
- Title และ description tags
- Preload hints (optional)
- PWA manifest (optional)
-->

<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <link rel="icon" type="image/svg+xml" href="/vite.svg" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="RFID Management System - ระบบจัดการ RFID และติดตามสินทรัพย์" />
  <title>RFID Management System</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

#### 📄 `README.md`
```markdown
# RFID Management System - Frontend

Frontend documentation สำหรับ RFID Management System
React application with Vite build system

## Features
- Modern React 18 with Hooks
- Responsive design
- Real-time WebSocket integration
- RESTful API integration
- Component-based architecture

## Development
- Hot Module Replacement
- ESLint code quality
- Fast build times with Vite
- Modern JavaScript/JSX

## Project Structure
- /src/components: Reusable UI components
- /src/pages: Page-level components
- /src/services: API และ service layer
- /src/assets: Static assets

## Getting Started
npm install
npm run dev

## Build
npm run build
npm run preview
```

---

### 📁 **Public Directory**

#### 📄 `public/vite.svg`
```
Static Assets Directory
======================

โฟลเดอร์ public/ เก็บ static assets ที่ไม่ต้องผ่าน build process

Contents:
- vite.svg: Default Vite favicon
- images: Static images
- icons: Application icons
- fonts: Custom fonts (ถ้ามี)
- manifest.json: PWA manifest (ถ้ามี)

Access Pattern:
- ไฟล์ใน public/ สามารถเข้าถึงได้โดยตรงจาก root URL
- ตัวอย่าง: public/logo.png → http://localhost:3000/logo.png
- ไม่ผ่าน bundling process
- เหมาะสำหรับ large static files
```

---

### 📁 **Source Directory (src/)**

#### 📄 `src/main.jsx`
```jsx
/*
Application Entry Point
=======================

ไฟล์หลักที่เริ่มต้น React application
ทำหน้าที่ mount React component ลงใน DOM

Responsibilities:
- React DOM rendering
- Router setup
- Global providers setup
- Error boundary setup
- Performance monitoring setup

Features:
- Strict Mode สำหรับ development
- Error handling
- Performance optimization
- Hot Module Replacement support
*/

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

// Error Boundary wrapper
import ErrorBoundary from './components/ErrorBoundary.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
```

#### 📄 `src/App.jsx`
```jsx
/*
Main Application Component
=========================

Root component ที่จัดการ routing และ layout หลัก

Features:
- Application routing structure
- Global state management
- Layout components
- Navigation setup
- Theme provider
- WebSocket connection setup

Architecture:
- Route-based code splitting
- Protected routes
- Layout templates
- Error handling
- Loading states
*/

import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'

// Page imports
import Dashboard from './pages/Dashboard'
import Assets from './pages/Assets'
import Tags from './pages/Tags'
import Scanner from './pages/Scanner'
import Borrowing from './pages/Borrowing'
import History from './pages/History'
import Notifications from './pages/Notifications'

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/tags" element={<Tags />} />
          <Route path="/scanner" element={<Scanner />} />
          <Route path="/borrowing" element={<Borrowing />} />
          <Route path="/history" element={<History />} />
          <Route path="/notifications" element={<Notifications />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
```

#### 📄 `src/index.css`
```css
/*
Global Styles
=============

Global CSS styles สำหรับ application
รวม Tailwind CSS และ custom styles

Features:
- Tailwind CSS base styles
- Global typography
- Color variables
- Responsive breakpoints
- Custom component styles
- Animation definitions
*/

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* Color variables */
  --primary-color: #3b82f6;
  --secondary-color: #6b7280;
  --success-color: #10b981;
  --error-color: #ef4444;
  --warning-color: #f59e0b;
  
  /* Font variables */
  --font-family: 'Inter', system-ui, sans-serif;
}

body {
  font-family: var(--font-family);
  line-height: 1.6;
}

/* Custom component styles */
.btn-primary {
  @apply bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors;
}

.card {
  @apply bg-white rounded-lg shadow-md p-6;
}

/* Animation classes */
.fade-in {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

---

### 📁 **Assets Directory (src/assets/)**

#### 📄 `src/assets/react.svg`
```
Component Assets
===============

โฟลเดอร์สำหรับ assets ที่ใช้ใน components
ผ่าน bundling process ของ Vite

Contents:
- react.svg: React logo
- images/: Component images
- icons/: SVG icons
- styles/: Component-specific styles

Build Process:
- Assets ได้รับการ optimize
- Automatic hashing สำหรับ cache busting
- Import เป็น ES modules
- Support สำหรับ various formats (SVG, PNG, JPG, etc.)

Usage Pattern:
import reactLogo from './assets/react.svg'
<img src={reactLogo} alt="React Logo" />
```

---

### 📁 **Components Directory (src/components/)**

#### 📄 `src/components/ErrorBoundary.jsx`
```jsx
/*
Error Boundary Component
=======================

React Error Boundary สำหรับจับและจัดการ JavaScript errors
ใน component tree

Features:
- Catch JavaScript errors in child components
- Display fallback UI when errors occur
- Log errors สำหรับ debugging
- Graceful error recovery
- User-friendly error messages

Error Handling:
- Component render errors
- Lifecycle method errors
- Constructor errors
- Event handler errors (manual catching)

Recovery Options:
- Retry mechanism
- Fallback UI
- Error reporting
- Page refresh option
*/

import React from 'react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="card max-w-md">
            <h2 className="text-xl font-bold text-red-600 mb-4">
              เกิดข้อผิดพลาด
            </h2>
            <p className="text-gray-600 mb-4">
              ขออภัย เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              โหลดหน้าใหม่
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
```

#### 📄 `src/components/Navbar.jsx`
```jsx
/*
Navigation Bar Component
=======================

Main navigation component สำหรับ application

Features:
- Responsive navigation menu
- Active route highlighting
- Mobile hamburger menu
- Real-time notification count
- WebSocket connection status
- User authentication status

Navigation Items:
- Dashboard: ภาพรวมระบบ
- Assets: จัดการสินทรัพย์
- Tags: จัดการ RFID tags
- Scanner: จัดการเครื่องสแกน
- Borrowing: ระบบยืม-คืน
- History: ประวัติการใช้งาน
- Notifications: การแจ้งเตือน

State Management:
- Active route tracking
- Mobile menu toggle
- Notification count
- WebSocket connection status
- User authentication state

Responsive Design:
- Desktop: Horizontal menu bar
- Mobile: Collapsible hamburger menu
- Tablet: Adaptive layout
*/

import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bell, Menu, X, Wifi, WifiOff } from 'lucide-react'

function Navbar() {
  const location = useLocation()
  const [notificationCount, setNotificationCount] = useState(0)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [wsConnected, setWsConnected] = useState(false)

  // WebSocket connection management
  const wsRef = useRef(null)

  useEffect(() => {
    // WebSocket connection logic
    connectWebSocket()
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  const connectWebSocket = () => {
    try {
      wsRef.current = new WebSocket('ws://localhost:8000/ws/realtime')
      
      wsRef.current.onopen = () => {
        setWsConnected(true)
        console.log('WebSocket connected')
      }

      wsRef.current.onclose = () => {
        setWsConnected(false)
        console.log('WebSocket disconnected')
      }

      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'notification') {
          setNotificationCount(prev => prev + 1)
        }
      }
    } catch (error) {
      console.error('WebSocket connection error:', error)
      setWsConnected(false)
    }
  }

  const navigationItems = [
    { path: '/', label: 'Dashboard' },
    { path: '/assets', label: 'Assets' },
    { path: '/tags', label: 'Tags' },
    { path: '/scanner', label: 'Scanner' },
    { path: '/borrowing', label: 'Borrowing' },
    { path: '/history', label: 'History' },
    { path: '/notifications', label: 'Notifications' }
  ]

  return (
    <nav className="bg-blue-600 text-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo และ Brand */}
          <div className="flex items-center">
            <h1 className="text-xl font-bold">RFID Management</h1>
            <div className="ml-4 flex items-center">
              {wsConnected ? (
                <Wifi className="w-4 h-4 text-green-300" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-300" />
              )}
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex space-x-6">
            {navigationItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === item.path
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-100 hover:bg-blue-500'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Notification และ Mobile Menu */}
          <div className="flex items-center space-x-4">
            <Link
              to="/notifications"
              className="relative p-2 rounded-md hover:bg-blue-500"
            >
              <Bell className="w-5 h-5" />
              {notificationCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {notificationCount}
                </span>
              )}
            </Link>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 rounded-md hover:bg-blue-500"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              {isCollapsed ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {!isCollapsed && (
          <div className="md:hidden py-4 border-t border-blue-500">
            {navigationItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`block px-3 py-2 rounded-md text-sm font-medium ${
                  location.pathname === item.path
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-100 hover:bg-blue-500'
                }`}
                onClick={() => setIsCollapsed(true)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  )
}

export default Navbar
```

---

### 📁 **Scanner Components (src/components/scanner/)**

#### 📄 `src/components/scanner/ScannerManager.jsx`
```jsx
/*
Scanner Manager Component
========================

Main component สำหรับจัดการเครื่องสแกน RFID

Features:
- Scanner connection management
- Real-time scanning status
- Scanner configuration
- Performance monitoring
- Error handling

Tabs:
- Connection: การเชื่อมต่ออุปกรณ์
- Configuration: การตั้งค่าพารามิเตอร์
- Control: การควบคุมการสแกน
- Stats: สถิติการทำงาน
- System Config: การตั้งค่าระบบ
*/
```

#### 📄 `src/components/scanner/ConnectionTab.jsx`
```jsx
/*
Scanner Connection Tab
=====================

Component สำหรับจัดการการเชื่อมต่อเครื่องสแกน

Features:
- Device connection (COM/Network)
- Connection status monitoring
- Device detection
- Connection parameters
- Troubleshooting tools
*/
```

#### 📄 `src/components/scanner/ConfigurationTab.jsx`
```jsx
/*
Scanner Configuration Tab
========================

Component สำหรับตั้งค่าพารามิเตอร์เครื่องสแกน

Features:
- RF power settings
- Antenna configuration
- Region settings
- Q-factor adjustment
- Session parameters
*/
```

#### 📄 `src/components/scanner/ControlTab.jsx`
```jsx
/*
Scanner Control Tab
==================

Component สำหรับควบคุมการทำงานของเครื่องสแกน

Features:
- Start/Stop scanning
- Manual scan operations
- Scan mode selection
- Real-time results
- Export scan data
*/
```

#### 📄 `src/components/scanner/StatsCard.jsx`
```jsx
/*
Scanner Statistics Card
======================

Component แสดงสถิติการทำงานของเครื่องสแกน

Features:
- Scan performance metrics
- Connection statistics
- Error rates
- Throughput monitoring
- Historical data
*/
```

#### 📄 `src/components/scanner/SystemConfigTab.jsx`
```jsx
/*
System Configuration Tab
========================

Component สำหรับตั้งค่าระบบส่วนกลาง

Features:
- Global system settings
- Database configuration
- Notification settings
- Performance tuning
- Backup/Restore
*/
```

---

### 📁 **Pages Directory (src/pages/)**

#### 📄 `src/pages/Dashboard.jsx`
```jsx
/*
Dashboard Page
=============

หน้าแดชบอร์ดหลักแสดงภาพรวมของระบบ

Features:
- System overview cards
- Real-time statistics
- Recent activities
- Quick actions
- Performance charts
- Alert summaries

Widgets:
- Total assets count
- Active tags count
- Connected devices
- Recent movements
- System alerts
- Borrowing status
*/
```

#### 📄 `src/pages/Assets.jsx`
```jsx
/*
Assets Management Page
=====================

หน้าจัดการสินทรัพย์

Features:
- Asset listing และ search
- Add/Edit/Delete assets
- Asset details modal
- Bulk operations
- Import/Export functionality
- Asset status management
- Tag binding/unbinding

Components:
- Asset table with sorting/filtering
- Asset form modal
- Tag assignment interface
- Bulk action controls
- Search และ filter bar
*/
```

#### 📄 `src/pages/Tags.jsx`
```jsx
/*
RFID Tags Management Page
========================

หน้าจัดการ RFID tags

Features:
- Tag listing และ search
- Tag registration
- Tag-asset binding
- Tag status monitoring
- Bulk tag operations
- Tag validation

Components:
- Tag table with real-time status
- Tag registration form
- Binding interface
- Status indicators
- Search และ filter controls
*/
```

#### 📄 `src/pages/Scanner.jsx`
```jsx
/*
Scanner Management Page
======================

หน้าจัดการเครื่องสแกน RFID

Features:
- Scanner connection management
- Real-time scanning interface
- Scanner configuration
- Performance monitoring
- Multiple scanner support

Components:
- ScannerManager main component
- Tabbed interface สำหรับ different functions
- Real-time status display
- Configuration forms
- Performance charts
*/
```

#### 📄 `src/pages/Borrowing.jsx`
```jsx
/*
Borrowing Management Page
========================

หน้าจัดการระบบยืม-คืนสินทรัพย์

Features:
- Borrowing requests
- Check-out/Check-in process
- Overdue tracking
- Borrower management
- Borrowing history
- Return processing

Components:
- Borrowing form
- Active borrowings table
- Overdue items alert
- Return processing interface
- Borrower search
- History timeline
*/
```

#### 📄 `src/pages/History.jsx`
```jsx
/*
History และ Reports Page
=======================

หน้าแสดงประวัติและรายงานการใช้งาน

Features:
- Movement history timeline
- Asset tracking history
- User activity logs
- System event logs
- Export capabilities
- Advanced filtering

Components:
- Timeline component
- History table with filtering
- Date range picker
- Export controls
- Search functionality
- Activity charts
*/
```

#### 📄 `src/pages/Notifications.jsx`
```jsx
/*
Notifications Page
=================

หน้าจัดการการแจ้งเตือนและ alerts

Features:
- Notification center
- Real-time alerts
- Notification history
- Mark as read/unread
- Notification preferences
- Alert configuration

Components:
- Notification list
- Alert cards
- Filter controls
- Settings panel
- Real-time updates
- Action buttons
*/
```

---

### 📁 **Services Directory (src/services/)**

#### 📄 `src/services/api.js`
```javascript
/*
API Service Layer
================

Central service สำหรับการติดต่อกับ backend API

Features:
- Axios HTTP client configuration
- Request/Response interceptors
- Error handling
- Authentication headers
- API endpoint definitions
- Response data transformation

API Modules:
- Assets API
- Tags API
- Scanner API
- Notifications API
- Reports API
- System Config API

Error Handling:
- Network errors
- HTTP status errors
- Authentication errors
- Validation errors
- Timeout handling

Authentication:
- JWT token management
- Automatic token refresh
- Login/Logout handling
- Protected route support
*/

import axios from 'axios'

// Base API configuration
const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// API methods
export const assetsAPI = {
  getAll: () => api.get('/assets'),
  getById: (id) => api.get(`/assets/${id}`),
  create: (data) => api.post('/assets', data),
  update: (id, data) => api.put(`/assets/${id}`, data),
  delete: (id) => api.delete(`/assets/${id}`)
}

export const tagsAPI = {
  getAll: () => api.get('/tags'),
  bind: (tagId, assetId) => api.post('/tags/bind', { tag_id: tagId, asset_id: assetId }),
  unbind: (tagId) => api.delete(`/tags/${tagId}/unbind`)
}

export const scannerAPI = {
  getConfig: () => api.get('/scanner-config'),
  updateConfig: (config) => api.put('/scanner-config', config),
  startScan: () => api.post('/scan/start'),
  stopScan: () => api.post('/scan/stop'),
  getStatus: () => api.get('/scan/status')
}

export default api
```

#### 📄 `src/services/testApi.js`
```javascript
/*
Test API Service
===============

Mock API service สำหรับการทดสอบและ development

Features:
- Mock data generation
- Simulated API responses
- Development mode support
- Error simulation
- Delayed responses
- Test scenarios

Use Cases:
- Frontend development without backend
- Testing error scenarios
- Performance testing
- Demo data generation
- Offline development

Mock Data:
- Sample assets
- Test RFID tags
- Fake user data
- Simulated scan results
- Mock notifications
*/

// Mock data generators
export const generateMockAssets = (count = 10) => {
  return Array.from({ length: count }, (_, i) => ({
    asset_id: i + 1,
    name: `Asset ${i + 1}`,
    type: ['Computer', 'Printer', 'Monitor', 'Mouse'][i % 4],
    status: ['idle', 'in_use', 'maintenance'][i % 3],
    created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
  }))
}

export const generateMockTags = (count = 20) => {
  return Array.from({ length: count }, (_, i) => ({
    tag_id: `E2${Math.random().toString(16).substr(2, 20).toUpperCase()}`,
    status: ['idle', 'in_use'][i % 2],
    asset_id: i < 10 ? i + 1 : null,
    last_seen: new Date().toISOString()
  }))
}

// Mock API responses
export const mockAPI = {
  assets: {
    getAll: () => Promise.resolve(generateMockAssets()),
    getById: (id) => Promise.resolve(generateMockAssets(1)[0]),
    create: (data) => Promise.resolve({ ...data, asset_id: Date.now() }),
    update: (id, data) => Promise.resolve({ ...data, asset_id: id }),
    delete: (id) => Promise.resolve({ success: true })
  },
  
  tags: {
    getAll: () => Promise.resolve(generateMockTags()),
    bind: (tagId, assetId) => Promise.resolve({ success: true }),
    unbind: (tagId) => Promise.resolve({ success: true })
  }
}

export default mockAPI
```

---

## 🔄 **Application Architecture Flow**

### Component Hierarchy:
```
App.jsx
├── Navbar.jsx (Global Navigation)
├── Routes
│   ├── Dashboard.jsx
│   ├── Assets.jsx
│   ├── Tags.jsx
│   ├── Scanner.jsx
│   │   └── ScannerManager.jsx
│   │       ├── ConnectionTab.jsx
│   │       ├── ConfigurationTab.jsx
│   │       ├── ControlTab.jsx
│   │       ├── StatsCard.jsx
│   │       └── SystemConfigTab.jsx
│   ├── Borrowing.jsx
│   ├── History.jsx
│   └── Notifications.jsx
└── ErrorBoundary.jsx (Error Handling)
```

### Data Flow:
```
API Service → Components → UI Updates
WebSocket → Navbar (notifications) → Real-time updates
User Actions → API calls → State updates → UI refresh
```

### State Management:
```
Local State: useState hooks ใน components
API State: API calls with loading/error states
WebSocket State: Real-time data updates
URL State: React Router สำหรับ navigation
```

---

## 🛠️ **Development Guidelines**

### Component Development:
```jsx
// Component template
import { useState, useEffect } from 'react'
import { api } from '../services/api'

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
      const result = await api.getData()
      setData(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div>
      {/* Component JSX */}
    </div>
  )
}

export default ComponentName
```

### Best Practices:
1. ✅ ใช้ functional components with hooks
2. ✅ Proper error handling
3. ✅ Loading states
4. ✅ Responsive design
5. ✅ Accessibility considerations
6. ✅ Performance optimization
7. ✅ Code splitting
8. ✅ Type checking (PropTypes หรือ TypeScript)

---

## 🎨 **Styling Strategy**

### CSS Framework: Tailwind CSS
- Utility-first approach
- Responsive design
- Custom component classes
- Design system consistency

### Component Styling:
```jsx
// Tailwind utility classes
<button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
  Click me
</button>

// Custom CSS classes (ใน index.css)
<button className="btn-primary">
  Click me
</button>
```

### Responsive Design:
```jsx
// Mobile-first responsive design
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Cards */}
</div>
```

---

## 🚀 **Build และ Deployment**

### Development:
```bash
npm run dev        # Start development server
npm run lint       # Code quality check
```

### Production:
```bash
npm run build      # Create production build
npm run preview    # Preview production build
```

### Build Output:
```
dist/
├── index.html
├── assets/
│   ├── index-[hash].js    # Main JavaScript bundle
│   ├── index-[hash].css   # Main CSS bundle
│   └── vendor-[hash].js   # Vendor dependencies
└── static/               # Static assets
```

---

*เอกสารนี้อัปเดตล่าสุด: September 3, 2025*
*สำหรับข้อมูลเพิ่มเติม อ่านที่ ../backend/PROJECT_STRUCTURE.md*
