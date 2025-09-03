# Configuration file for RFID Monitor

# Database Configuration
DATABASE = {
    'host': 'localhost',
    'user': 'root',
    'password': '',  # ใส่รหัสผ่านฐานข้อมูลของคุณ
    'database': 'rfid_tracking',  # ชื่อฐานข้อมูลของคุณ
    'port': 3306
}

# Default Scanner Settings
SCANNER_DEFAULTS = {
    'tcp_ip': '10.10.100.254',
    'tcp_port': 8899,
    'serial_baudrate': 115200,
    'scan_timeout': 1000,
    'scan_interval': 1.0
}

# Display Settings
DISPLAY = {
    'max_tags_shown': 20,
    'auto_refresh': True,
    'refresh_interval': 3,  # seconds
    'max_status_lines': 100
}

# Window Settings
WINDOW = {
    'title': 'RFID Tag Monitor - ระบบติดตามแท็กล่าสุด',
    'width': 1200,
    'height': 800,
    'resizable': True
}

# Colors and Styling
COLORS = {
    'enter_event': '#4CAF50',  # Green
    'exit_event': '#F44336',   # Red
    'scan_event': '#2196F3',   # Blue
    'background': '#FFFFFF',   # White
    'text': '#000000'          # Black
}

# Tag Display Format
TAG_FORMAT = {
    'show_queue_number': True,
    'show_seconds_only': True,  # True = แสดงเฉพาะ HH:MM:SS, False = แสดงวันที่ด้วย
    'date_format': '%Y-%m-%d %H:%M:%S',
    'time_format': '%H:%M:%S'
}

# Logging Configuration
LOGGING = {
    'level': 'INFO',  # DEBUG, INFO, WARNING, ERROR
    'file': 'monitor.log',
    'max_file_size': 10485760,  # 10MB
    'backup_count': 5
}
