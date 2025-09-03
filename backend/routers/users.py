from fastapi import APIRouter, HTTPException
from typing import List
from datetime import datetime
from config import get_db  # ✅ แก้ไข - import จาก config
from models import User

router = APIRouter(prefix="/api/users", tags=["users"])

@router.get("", response_model=List[User])
def list_users():
    """GET /api/users – ดึงรายการผู้ใช้ทั้งหมด"""
    db = next(get_db())
    try:
        # ใช้ raw SQL query แทน ORM
        cur = db.cursor(dictionary=True)
        cur.execute("SELECT user_id, name, email, role, created_at FROM users ORDER BY created_at DESC")
        return cur.fetchall()
    finally:
        cur.close()

@router.post("", response_model=User)
def create_user(user: User):
    """POST /api/users – สร้างผู้ใช้ใหม่"""
    db = next(get_db())
    try:
        cur = db.cursor()
        cur.execute(
            "INSERT INTO users (name, email, role, created_at) VALUES (%s, %s, %s, %s)",
            (user.name, user.email, user.role, datetime.now())
        )
        db.commit()
        new_id = cur.lastrowid
        
        # ดึงข้อมูลผู้ใช้ที่เพิ่งสร้าง
        cur.execute("SELECT user_id, name, email, role, created_at FROM users WHERE user_id = %s", (new_id,))
        result = cur.fetchone()
        return {
            "user_id": result[0],
            "name": result[1], 
            "email": result[2],
            "role": result[3],
            "created_at": result[4]
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        cur.close()

@router.get("/{user_id}", response_model=User)
def get_user(user_id: int):
    """GET /api/users/{user_id} – ดึงข้อมูลผู้ใช้เดียว"""
    db = next(get_db())
    try:
        cur = db.cursor(dictionary=True)
        cur.execute("SELECT user_id, name, email, role, created_at FROM users WHERE user_id = %s", (user_id,))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    finally:
        cur.close()
