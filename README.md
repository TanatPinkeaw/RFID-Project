# 🏷️ RFID Management System

ระบบจัดการ RFID Scanner และ Tag Tracking สำหรับการติดตามสินทรัพย์และการยืม-คืน

## 📋 Features

- 🏷️ **Asset Management** - จัดการสินทรัพย์และ RFID tags
- 📡 **Scanner Integration** - เชื่อมต่อเครื่องสแกน RFID (Network/Serial)
- 📊 **Real-time Dashboard** - แดชบอร์ดแสดงสถานะแบบ real-time
- 🔔 **Notification System** - ระบบแจ้งเตือนและ alerts
- 📚 **Borrowing System** - ระบบยืม-คืนสินทรัพย์
- 📈 **Reports & Analytics** - รายงานและการวิเคราะห์ข้อมูล
- 🌐 **WebSocket Support** - การอัปเดตแบบ real-time

## 🏗️ Architecture

```
├── backend/          # FastAPI Backend
│   ├── config/       # Configuration management
│   ├── routers/      # API endpoints
│   ├── uhf/          # RFID hardware integration
│   └── models.py     # Data models
├── frontend/         # React Frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── services/
└── docs/            # Documentation
```

## 🚀 Quick Start

### Prerequisites

- Python 3.8+ 32bit
- Node.js 16+
- MySQL/PostgreSQL/SQLite
- RFID Scanner (optional for testing)

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
cp .env.template .env
# แก้ไข .env ตามการตั้งค่าของคุณ
python manage.py init-db
python main.py
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

## 📚 Documentation

- [Backend Structure](backend/README.md)
- [Frontend Structure](frontend/README.md)
- [API Documentation](http://localhost:8000/docs)
- [Database Schema](backend/create_database.sql)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details