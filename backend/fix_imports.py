"""
Import Fixer Utility - เครื่องมือแก้ไข imports อัตโนมัติ
=======================================================

ไฟล์นี้ใช้สำหรับแก้ไข import statements ในโปรเจคเมื่อมีการย้าย
โครงสร้างโฟลเดอร์หรือเปลี่ยนชื่อ modules

ปัญหาที่แก้ไข:
- เปลี่ยน 'from database import' เป็น 'from config.database import'
- แก้ไข imports อื่นๆ ที่เกี่ยวข้องกับการย้าย config

การใช้งาน:
    python fix_imports.py

ไฟล์ที่จะถูกแก้ไข:
- ไฟล์ทั้งหมดในโฟลเดอร์ routers/
- models.py, ws_manager.py, device_scanner_service.py, testapi.py
"""

import os
import re

def fix_imports_in_file(file_path):
    """
    แก้ไข import statements ในไฟล์เดียว
    
    Args:
        file_path (str): เส้นทางไฟล์ที่ต้องแก้ไข
        
    Returns:
        bool: True ถ้ามีการเปลี่ยนแปลง, False ถ้าไม่มี
        
    Process:
        1. อ่านเนื้อหาไฟล์
        2. ใช้ regex แทนที่ import patterns
        3. เปรียบเทียบกับเนื้อหาเดิม
        4. บันทึกไฟล์ถ้ามีการเปลี่ยนแปลง
        5. แสดงสถานะการแก้ไข
        
    Replacement Patterns:
        - 'from database import' → 'from config.database import'
        - 'from config import get_db' → 'from config import get_db' (ไม่เปลี่ยน)
    """

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        
        # แทนที่ imports ต่างๆ
        replacements = [
            (r'from database import', 'from config.database import'),
            (r'from config import get_db', 'from config import get_db'),  # ถ้ามี
        ]
        
        for old_pattern, new_pattern in replacements:
            content = re.sub(old_pattern, new_pattern, content)
        
        # บันทึกไฟล์ถ้ามีการเปลี่ยนแปลง
        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"✅ Fixed imports in: {file_path}")
            return True
        else:
            print(f"⚪ No changes needed: {file_path}")
            return False
            
    except Exception as e:
        print(f"❌ Error fixing {file_path}: {e}")
        return False

def fix_all_router_imports():
    """
    แก้ไข imports ในไฟล์ router ทั้งหมดและไฟล์อื่นๆ ที่เกี่ยวข้อง
    
    Process:
        1. ตรวจสอบว่าโฟลเดอร์ routers/ มีอยู่
        2. วนลูปแก้ไขไฟล์ .py ทั้งหมดในโฟลเดอร์ routers/
        3. แก้ไขไฟล์อื่นๆ ที่อาจมีปัญหา import
        4. นับจำนวนไฟล์ที่แก้ไขและแสดงสรุป
        
    Target Files:
        - routers/*.py (ยกเว้น __init__.py)
        - models.py
        - ws_manager.py  
        - device_scanner_service.py
        - testapi.py
        
    Output:
        - แสดงสถานะการแก้ไขแต่ละไฟล์
        - สรุปจำนวนไฟล์ที่แก้ไขทั้งหมด
    """

    routers_dir = "routers"
    fixed_count = 0
    
    if not os.path.exists(routers_dir):
        print(f"❌ Directory {routers_dir} not found")
        return
    
    print("🔧 Fixing imports in router files...")
    print("=" * 50)
    
    for filename in os.listdir(routers_dir):
        if filename.endswith('.py') and filename != '__init__.py':
            file_path = os.path.join(routers_dir, filename)
            if fix_imports_in_file(file_path):
                fixed_count += 1
    
    # แก้ไขไฟล์อื่นๆ ที่อาจมีปัญหา
    other_files = ['models.py', 'ws_manager.py', 'device_scanner_service.py', 'testapi.py']
    
    print("\n🔧 Fixing imports in other files...")
    for filename in other_files:
        if os.path.exists(filename):
            if fix_imports_in_file(filename):
                fixed_count += 1
    
    print("=" * 50)
    print(f"🎉 Fixed imports in {fixed_count} files")

# Main Execution
if __name__ == "__main__":
    """
    รันเครื่องมือแก้ไข imports เมื่อเรียกใช้ไฟล์โดยตรง
    
    Usage:
        python fix_imports.py
        
    ผลลัพธ์:
        ✅ Fixed imports in: path/to/file.py  (ถ้าแก้ไขสำเร็จ)
        ⚪ No changes needed: path/to/file.py (ถ้าไม่ต้องแก้ไข)
        ❌ Error fixing path/to/file.py: error_message (ถ้าเกิดข้อผิดพลาด)
        🎉 Fixed imports in X files (สรุปผลลัพธ์)
    """
    fix_all_router_imports()