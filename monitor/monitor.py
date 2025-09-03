import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
import threading
import time
from datetime import datetime
import logging
from database import get_db_connection, test_database_connection, get_recent_scanned_tags, get_locations, get_tag_movements, get_recent_scanned_tags_by_location

# ตั้งค่า logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class TagMonitorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("RFID Tag Monitor System")
        self.root.geometry("1920x1080")  # เพิ่มขนาดหน้าต่างให้ใหญ่สุด
        self.root.configure(bg='#f0f0f0')
        
        # เปิดเต็มจอ
        self.root.state('zoomed')  # สำหรับ Windows
        
        # Variables
        self.is_refreshing = False
        self.recent_tags = []
        self.location_map = {}  # map location_id -> name
        
        # สร้าง UI ทั้งหมดก่อน
        self.create_widgets()
        
        # ตรวจสอบการเชื่อมต่อฐานข้อมูล (หลังสร้าง UI เสร็จ)
        self.root.after(100, self.check_database_connection)
        
        # โหลด locations (หลังสร้าง UI เสร็จ)
        self.root.after(200, self.load_locations)
        
        # เริ่มการรีเฟรชข้อมูล
        self.start_auto_refresh()
        
        # เริ่มนาฬิกา
        self.start_clock()
        
        # ตั้งค่า cleanup เมื่อปิดโปรแกรม
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)

    def create_widgets(self):
        """สร้าง UI components ทั้งหมด"""
        # Style configuration สำหรับหน้าจอใหญ่
        style = ttk.Style()
        style.theme_use('clam')
        
        # Configure styles ให้ใหญ่มากขึ้นอีก
        style.configure('Heading.TLabel', font=('Arial', 40, 'bold'))
        style.configure('Large.TLabel', font=('Arial', 24))
        style.configure('Medium.TLabel', font=('Arial', 20))
        style.configure('Treeview.Heading', font=('Arial', 28, 'bold'))
        style.configure('Treeview', font=('Arial', 22), rowheight=60)  # เพิ่มความสูงแถวมากขึ้น
        
        # เพิ่ม style สำหรับปุ่มใหญ่
        style.configure('Large.TButton', font=('Arial', 14, 'bold'), padding=(10, 8))
        
        # Main frame
        main_frame = ttk.Frame(self.root, padding="20")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Configure grid weights
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(0, weight=1)
        main_frame.rowconfigure(0, weight=1)
        
        # สร้าง Notebook (Tabs)
        self.notebook = ttk.Notebook(main_frame)
        self.notebook.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # (status_text จะย้ายไปอยู่ใน Tab การตั้งค่า Location เพื่อให้แสดงในแท็บนั้น)
 
        # Tab 1: การตั้งค่า Location
        self.setup_tab = ttk.Frame(self.notebook)
        self.notebook.add(self.setup_tab, text="⚙️ การตั้งค่า Location")
        
        # Tab 2: Recent Scanned Tags
        self.monitor_tab = ttk.Frame(self.notebook)
        self.notebook.add(self.monitor_tab, text="📊 Recent Scanned Tags")
        
        # สร้างเนื้อหาใน tabs
        self.create_setup_tab_content()
        self.create_monitor_tab_content()

    def create_setup_tab_content(self):
        """สร้างเนื้อหาใน Tab การตั้งค่า (เหลือแค่เลือก Location)"""
        # Main frame สำหรับ setup tab
        setup_main_frame = ttk.Frame(self.setup_tab, padding="25")
        setup_main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))

        self.setup_tab.columnconfigure(0, weight=1)
        self.setup_tab.rowconfigure(0, weight=1)
        setup_main_frame.columnconfigure(0, weight=1)

        # Location Settings (ย้ายมาชัดเจนตรงนี้)
        location_frame = ttk.LabelFrame(setup_main_frame, text="📍 เลือก Location ที่ต้องการดูข้อมูล", padding="25")
        location_frame.grid(row=0, column=0, sticky=(tk.W, tk.E), pady=(0, 25))

        ttk.Label(location_frame, text="เลือก Location:", style='Large.TLabel').grid(row=0, column=0, sticky=tk.W, pady=(0, 15))
        self.location_var = tk.StringVar()
        self.location_combo = ttk.Combobox(location_frame, textvariable=self.location_var,
                                          width=40, state="readonly", font=("Arial", 18))
        self.location_combo.grid(row=1, column=0, sticky=(tk.W, tk.E))
        
        # เมื่อเลือก location ใหม่ให้รีเฟรชข้อมูล
        self.location_combo.bind("<<ComboboxSelected>>", lambda e: self.refresh_tags())

        # Info / Help text
        help_lbl = ttk.Label(location_frame, text="เลือกสถานที่เพื่อดูรายงานการสแกน (ไม่ต้องเชื่อมต่ออุปกรณ์)", font=("Arial", 12))
        help_lbl.grid(row=2, column=0, sticky=tk.W, pady=(10,0))

        # Status display
        status_display_frame = ttk.LabelFrame(setup_main_frame, text="📊 สถานะการแสดงผล", padding="25")
        status_display_frame.grid(row=1, column=0, sticky=(tk.W, tk.E))
        
        self.status_label = ttk.Label(status_display_frame, text="กรุณาเลือก Location เพื่อดูข้อมูล", 
                                     font=("Arial", 18), foreground="blue")
        self.status_label.grid(row=0, column=0)

        # System log / status area NOW inside the Setup tab (moved from bottom of main window)
        log_frame = ttk.LabelFrame(setup_main_frame, text="System Log", padding="6")
        log_frame.grid(row=2, column=0, sticky=(tk.W, tk.E), pady=(12, 0))
        self.status_text = scrolledtext.ScrolledText(log_frame, height=8, font=("Arial", 12))
        self.status_text.pack(fill="both", expand=True)

        # ensure status_text is writable initially
        self.add_status("ℹ️ System log initialized (moved into Setup tab)")

    def create_monitor_tab_content(self):
        """สร้างเนื้อหาใน Tab Monitor - จัดรูปแบบเหมือนรูป"""
        # Main frame สำหรับ monitor tab
        monitor_main_frame = ttk.Frame(self.monitor_tab, padding="10")
        monitor_main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        self.monitor_tab.columnconfigure(0, weight=1)
        self.monitor_tab.rowconfigure(0, weight=1)
        monitor_main_frame.columnconfigure(0, weight=1)
        monitor_main_frame.rowconfigure(1, weight=1)  # ให้ table ใช้พื้นที่เต็มที่

        # --- NEW: Location filter สำหรับ Monitor tab ---
        filter_frame = ttk.Frame(monitor_main_frame)
        filter_frame.grid(row=0, column=0, sticky=(tk.W, tk.E), pady=(0, 8))
        ttk.Label(filter_frame, text="เลือก Location ที่จะแสดง:", font=("Arial", 16)).pack(side="left")
        self.monitor_location_var = tk.StringVar()
        self.monitor_location_combo = ttk.Combobox(filter_frame, textvariable=self.monitor_location_var,
                                                   width=40, state="readonly", font=("Arial", 14))
        self.monitor_location_combo.pack(side="left", padx=(8,0))
        self.monitor_location_combo.bind("<<ComboboxSelected>>", lambda e: self.refresh_tags())
        # --- END NEW ---
        
        # Tags Table Frame - ใช้พื้นที่เต็มที่
        table_frame = ttk.LabelFrame(monitor_main_frame, text="📋 Tags List", padding="10")
        table_frame.grid(row=1, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Tags treeview - ปรับให้ใหญ่มากขึ้น
        columns = ("tag_id", "asset_name", "time", "status")
        self.tags_tree = ttk.Treeview(table_frame, columns=columns, show="headings", height=35)
        
        # Configure columns ให้ใหญ่มากขึ้น
        self.tags_tree.heading("tag_id", text="Tag ID")
        self.tags_tree.heading("asset_name", text="Asset Name")
        self.tags_tree.heading("time", text="เวลาสแกน")
        self.tags_tree.heading("status", text="สถานะ")
        
        # ปรับความกว้าง column ให้เหมาะกับหน้าจอใหญ่
        self.tags_tree.column("tag_id", width=600, anchor="w")
        self.tags_tree.column("asset_name", width=500, anchor="w")
        self.tags_tree.column("time", width=300, anchor="center")
        self.tags_tree.column("status", width=300, anchor="center")
        
        # Configure row colors - สีเด่นชัดขึ้นเหมือนรูป
        self.tags_tree.tag_configure("borrowed", background="#f2d9db", foreground="#d32f2f")  # แดงเข้มขึ้น
        self.tags_tree.tag_configure("available", background="#f3fff4", foreground="#388e3c")  # เขียวเข้มขึ้น
        
        # Scrollbar for treeview
        tags_scrollbar = ttk.Scrollbar(table_frame, orient="vertical", command=self.tags_tree.yview)
        self.tags_tree.configure(yscrollcommand=tags_scrollbar.set)
        
        self.tags_tree.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        tags_scrollbar.grid(row=0, column=1, sticky=(tk.N, tk.S))
        
        # Bind double-click event
        self.tags_tree.bind("<Double-1>", self.on_tag_double_click)
        
        table_frame.columnconfigure(0, weight=1)
        table_frame.rowconfigure(0, weight=1)
        
        # Bottom control bar - จัดเรียงแนวนอนเหมือนรูป
        bottom_frame = ttk.Frame(monitor_main_frame)
        bottom_frame.grid(row=2, column=0, sticky=(tk.W, tk.E), pady=(10, 5))
        
        # Control elements ในแนวนอน
        control_container = ttk.Frame(bottom_frame)
        control_container.pack(side="right", padx=(0, 20))  # จัดชิดขวา
        
        # Refresh button
        refresh_btn = ttk.Button(control_container, text="🔄 Refresh", 
                            command=self.refresh_tags, 
                            width=12, 
                            style='Large.TButton')
        refresh_btn.pack(side="left", padx=(0, 10))
        
        # Clear button  
        clear_btn = ttk.Button(control_container, text="🗑️ Clear", 
                          command=self.clear_tags, 
                          width=12,
                          style='Large.TButton')
        clear_btn.pack(side="left", padx=(0, 15))
        
        # Auto refresh status
        self.auto_refresh_label = ttk.Label(control_container, text="🔄 Auto Refresh: ON", 
                                       font=("Arial", 14, "bold"), foreground="green")
        self.auto_refresh_label.pack(side="left", padx=(0, 20))
        
        # Clock display
        self.current_time_label = ttk.Label(control_container, text="", 
                                       font=("Arial", 18, "bold"), foreground="blue")
        self.current_time_label.pack(side="left")

    def start_clock(self):
        """เริ่มนาฬิกาแสดงเวลาปัจจุบัน"""
        def update_clock():
            current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self.current_time_label.config(text=f"🕐 {current_time}")
            self.root.after(1000, update_clock)  # อัพเดททุกวินาที
        
        update_clock()

    def check_database_connection(self):
        """ตรวจสอบการเชื่อมต่อฐานข้อมูล"""
        success, message = test_database_connection()
        if success:
            self.add_status(f"✅ {message}")
        else:
            self.add_status(f"❌ {message}")
            messagebox.showerror("Database Error", message)

    def load_locations(self):
        """โหลดรายการ locations"""
        try:
            locations = get_locations()
            self.location_map = {}  # map id -> name
            if locations:
                # values สำหรับ combobox ในหน้า setup (no "All")
                location_values = [f"{loc['location_id']} - {loc['name']}" for loc in locations]
                self.location_combo['values'] = location_values
                self.location_combo.current(0)

                # เก็บ mapping id->name
                for loc in locations:
                    try:
                        self.location_map[int(loc['location_id'])] = loc.get('name') or str(loc['location_id'])
                    except Exception:
                        pass

                # values สำหรับ monitor filter (มี "ทั้งหมด" เป็นตัวเลือกแรก)
                monitor_values = ["ทั้งหมด"] + location_values
                if hasattr(self, 'monitor_location_combo'):
                    self.monitor_location_combo['values'] = monitor_values
                    self.monitor_location_combo.current(0)
                self.add_status(f"📍 โหลด locations: {len(locations)} รายการ")
            else:
                self.add_status("❌ ไม่พบ locations ในฐานข้อมูล")
        except Exception as e:
            self.add_status(f"❌ ไม่สามารถโหลด locations ได้: {str(e)}")

    def refresh_tags(self):
        """รีเฟรชรายการ tags จากฐานข้อมูล"""
        if self.is_refreshing:
            return

        self.is_refreshing = True
        try:
            # หาตำแหน่งที่ผู้ใช้เลือก (None = ทั้งหมด)
            selected = None
            location_name = "ทั้งหมด"
            
            # ใช้ค่า filter จาก monitor combobox ก่อน (ถ้ามี)
            if hasattr(self, 'monitor_location_combo') and self.monitor_location_combo.get():
                sel = self.monitor_location_combo.get()
                if sel and sel != "ทั้งหมด":
                    try:
                        selected = int(sel.split(" - ")[0])
                        location_name = sel.split(" - ")[1]
                    except Exception:
                        selected = None
                else:
                    selected = None
            elif self.location_combo.get():
                # fallback: ใช้ค่าจาก setup tab
                sel = self.location_combo.get()
                if sel:
                    try:
                        selected = int(sel.split(" - ")[0])
                        location_name = sel.split(" - ")[1]
                    except Exception:
                        selected = None

            self.add_status(f"🔍 Debug: selected_location_id = {selected}")

            # ดึงรายการ tag ล่าสุดจาก DB (ตาม location หรือทั้งหมด)
            raw_tags = []
            if selected is None:
                raw_tags = get_recent_scanned_tags(50) or []
            else:
                raw_tags = get_recent_scanned_tags_by_location(selected, 50) or []

            # เตรียม recent_tags ในรูปแบบที่ refresh_tags_display ต้องการ
            new_list = []
            for row in raw_tags:
                # ฟังก์ชัน DB อาจคืน dict หรือ tuple ต่างกัน จึงรองรับทั้งสองแบบ
                if isinstance(row, dict):
                    tag_id = row.get('tag_id') or row.get('uii') or row.get('TagID') or None
                    last_seen = row.get('last_seen') or row.get('timestamp') or row.get('time')
                    asset_name = row.get('asset_name', 'ไม่ได้ผูก')
                    status = row.get('status', 'ออก')
                    current_location_id = row.get('current_location_id')
                else:
                    # ถ้าเป็น tuple ให้เดาที่ตำแหน่ง (tag_id, last_seen)
                    try:
                        tag_id = row[0]
                        last_seen = row[1]
                        asset_name = 'ไม่ได้ผูก'
                        status = 'ออก'
                        current_location_id = None
                    except Exception:
                        continue

                if not tag_id:
                    continue

                # ดึงข้อมูล asset/status สำหรับแต่ละ tag
                asset_info = self.get_asset_info_by_tag(tag_id, selected)
                
                # last_seen ให้เป็น datetime ถ้ายังเป็น string
                try:
                    if isinstance(last_seen, str):
                        # พยายาม parse แบบ ISO หรือ common formats
                        try:
                            last_seen_dt = datetime.fromisoformat(last_seen)
                        except Exception:
                            last_seen_dt = datetime.strptime(last_seen, "%Y-%m-%d %H:%M:%S")
                    else:
                        last_seen_dt = last_seen
                except Exception:
                    last_seen_dt = datetime.now()

                new_list.append({
                    'tag_id': tag_id,
                    'asset_name': asset_info.get('asset_name', asset_name),
                    'last_seen': last_seen_dt,
                    'status': asset_info.get('status', status),
                    'current_location_id': asset_info.get('current_location_id', current_location_id)
                })

            # เก็บผลและอัพเดท UI
            self.recent_tags = new_list
            self.refresh_tags_display()
            
            # อัพเดทสถานะ
            if hasattr(self, 'status_label'):
                self.status_label.config(text=f"แสดงข้อมูล: {location_name} ({len(self.recent_tags)} tags)")
            
            self.add_status(f"🔄 รีเฟรช {location_name}: {len(self.recent_tags)} tags")

        except Exception as e:
            self.add_status(f"❌ ไม่สามารถรีเฟรชข้อมูลได้: {str(e)}")
        finally:
            self.is_refreshing = False

    def get_asset_info_by_tag(self, tag_id, selected_location=None):
        """ดึงข้อมูล Asset และสถานะจาก tag_id - ใช้ Location ที่เลือกเป็นตัวกำหนด 'เข้า/ออก'"""
        try:
            conn = get_db_connection()
            if not conn:
                return {"asset_name": "ไม่ได้ผูก", "status": "ออก", "current_location_id": None}

            cursor = conn.cursor()
            cursor.execute("""
                SELECT a.name, t.current_location_id, t.status
                FROM tags t 
                LEFT JOIN assets a ON t.asset_id = a.asset_id 
                WHERE t.tag_id = %s
            """, (tag_id,))

            result = cursor.fetchone()
            cursor.close()
            conn.close()

            if result:
                asset_name = result[0] if result[0] else "ไม่ได้ผูก"
                current_location_id = result[1]
                # tag_status = result[2]  # อาจไม่ได้ใช้ ถ้า DB ไม่ตั้งค่า

                # กำหนดสถานะโดยอิง selected_location และ current_location_id
                if selected_location is None:
                    # ถ้ายังไม่เลือก location ให้แสดงสถานะตามค่า current_location_id
                    if current_location_id is None:
                        status = "ออก"
                    else:
                        # ถ้ามีค่า location ให้แสดง "เข้า" สำหรับตำแหน่งนั้น (โดยสรุป)
                        status = "เข้า"
                else:
                    if current_location_id == selected_location:
                        status = "เข้า"
                    else:
                        # ถ้าอยู่ที่อื่น ให้แสดงออก พร้อมชื่อสถานที่ปัจจุบัน (ถ้ามี)({loc_name})
                        if current_location_id is None:
                            status = "ออก"
                        else:
                            loc_name = self.location_map.get(current_location_id, str(current_location_id))
                            status = f"ออก "

                return {
                    "asset_name": asset_name,
                    "status": status,
                    "current_location_id": current_location_id
                }
            else:
                return {"asset_name": "ไม่ได้ผูก", "status": "ออก", "current_location_id": None}

        except Exception as e:
            logging.error(f"Error getting asset info: {e}")
            return {"asset_name": "ไม่ได้ผูก", "status": "ออก", "current_location_id": None}

    def refresh_tags_display(self):
        """อัพเดทการแสดงผลใน treeview - ถ้าไม่มีข้อมูลใช้ข้อความชัดเจนเกี่ยวกับ Location"""
        # ล้างข้อมูลเก่า
        for item in self.tags_tree.get_children():
            self.tags_tree.delete(item)

        if not self.recent_tags:
            # แสดงข้อความแนะนำให้เลือก Location (ไม่ขึ้นว่าเชื่อมต่อ)
            selected_loc = None
            if hasattr(self, 'monitor_location_combo') and self.monitor_location_combo.get():
                sel = self.monitor_location_combo.get()
                if sel and sel != "ทั้งหมด":
                    try:
                        selected_loc = int(sel.split(" - ")[0])
                    except:
                        selected_loc = None

            if selected_loc is None:
                message = "กรุณาเลือก Location เพื่อดูข้อมูล"
            else:
                loc_name = self.location_map.get(selected_loc, f"Location {selected_loc}")
                message = f"ไม่มีข้อมูลล่าสุดใน {loc_name}"

            self.tags_tree.insert("", "end", values=(
                "ไม่มีข้อมูล", message, "-", "-"
            ), tags=("no_data",))
            return

        # แสดงข้อมูล tags ปกติ...
        for tag in self.recent_tags:
            time_str = tag['last_seen'].strftime("%H:%M:%S") if hasattr(tag['last_seen'], 'strftime') else str(tag['last_seen'])
            raw_status = tag.get('status', 'ไม่ทราบ')

            # แยก icon/label จาก raw_status (รองรับรูปแบบ "ออก (ชื่อสถานที่)")
            if raw_status.startswith("เข้า"):
                tag_color = "available"
                status_display = "🟢 เข้า"
            elif raw_status.startswith("ออก"):
                tag_color = "borrowed"
                # ถ้ามีชื่อสถานที่ให้แสดงด้วย
                if "(" in raw_status and ")" in raw_status:
                    status_display = f"🔴 {raw_status}"
                else:
                    status_display = "🔴 ออก"
            else:
                tag_color = "no_data"
                status_display = "🟡 เคลื่อนไหว"

            self.tags_tree.insert("", "end", values=(
                tag['tag_id'],
                tag.get('asset_name', 'ไม่ได้ผูก'),
                time_str,
                status_display
            ), tags=(tag_color,))

    def clear_tags(self):
        """ล้างรายการ tags"""
        self.recent_tags.clear()
        self.refresh_tags_display()
        self.add_status("🗑️ ล้างรายการ tags แล้ว")

    def on_tag_double_click(self, event):
        """เมื่อดับเบิลคลิกที่ tag"""
        selection = self.tags_tree.selection()
        if not selection:
            return
        
        item = self.tags_tree.item(selection[0])
        tag_id = item['values'][0]  # Tag ID อยู่ที่ column แรก
        
        # แสดงประวัติการเคลื่อนไหว
        self.show_tag_movements(tag_id)

    def show_tag_movements(self, tag_id):
        """แสดงประวัติการเคลื่อนไหวของ tag"""
        movements = get_tag_movements(tag_id, 20)  # ดึง 20 รายการล่าสุด

        # สร้างหน้าต่างใหม่
        movement_window = tk.Toplevel(self.root)
        movement_window.title(f"Tag Movement History - {tag_id}")
        movement_window.geometry("1000x700")
        movement_window.configure(bg='#f0f0f0')

        # Header
        header_frame = ttk.Frame(movement_window)
        header_frame.pack(fill="x", padx=25, pady=25)

        ttk.Label(header_frame, text=f"📋 ประวัติการเคลื่อนไหว: {tag_id}",
                font=("Arial", 20, "bold")).pack()

        # Table frame
        table_frame = ttk.LabelFrame(movement_window, text="Movement History", padding="20")
        table_frame.pack(fill="both", expand=True, padx=25, pady=(0, 25))

        # สร้าง treeview สำหรับแสดงประวัติ
        columns = ("timestamp", "event", "from_loc", "to_loc")
        tree = ttk.Treeview(table_frame, columns=columns, show="headings")

        tree.heading("timestamp", text="เวลา")
        tree.heading("event", text="เหตุการณ์")
        tree.heading("from_loc", text="จาก")
        tree.heading("to_loc", text="ไป")

        tree.column("timestamp", width=200)
        tree.column("event", width=150)
        tree.column("from_loc", width=200)
        tree.column("to_loc", width=200)

        # Scrollbar
        scrollbar = ttk.Scrollbar(table_frame, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=scrollbar.set)

        tree.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        scrollbar.grid(row=0, column=1, sticky=(tk.N, tk.S))

        table_frame.columnconfigure(0, weight=1)
        table_frame.rowconfigure(0, weight=1)

        # เพิ่มข้อมูลจาก movements
        for movement in movements:
            tree.insert("", "end", values=(
                movement.get('timestamp').strftime("%Y-%m-%d %H:%M:%S") if movement.get('timestamp') else '-',
                movement.get('event_type') or '-',
                movement.get('from_location_name') or str(movement.get('from_location_id') or '-'),
                movement.get('to_location_name') or str(movement.get('to_location_id') or '-')
            ))

        if not movements:
            ttk.Label(table_frame, text="ไม่พบประวัติการเคลื่อนไหว",
                    font=("Arial", 16)).grid(row=1, column=0, pady=25)

    def start_auto_refresh(self):
        """เริ่มการรีเฟรชอัตโนมัติ"""
        def auto_refresh():
            if not self.is_refreshing:
                self.refresh_tags()
            # รีเฟรชทุก 3 วินาที
            self.root.after(3000, auto_refresh)
        
        self.root.after(2000, auto_refresh)  # เริ่มหลัง 2 วินาที

    def add_status(self, message):
        """เพิ่มข้อความสถานะ"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        status_message = f"[{timestamp}] {message}\n"
        
        self.status_text.insert(tk.END, status_message)
        self.status_text.see(tk.END)

    def on_closing(self):
        """เมื่อปิดโปรแกรม"""
        self.root.destroy()

def main():
    root = tk.Tk()
    try:
        # ตั้งค่า icon (optional)
        # root.iconbitmap("icon.ico")
        pass
    except:
        pass
    
    app = TagMonitorApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()
