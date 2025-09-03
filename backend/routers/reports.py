from fastapi import APIRouter, Query
from datetime import date
from typing import List
from config.database import get_db_connection
from models import ReportSummary, ReportHistory

router = APIRouter(prefix="/api/reports", tags=["reports"])

@router.get("/summary", response_model=List[ReportSummary])
def report_summary():
    """GET /api/reports/summary – ดึงสรุปสถานะทรัพย์สิน (count by status, location)"""
    conn = get_db_connection(); cur = conn.cursor(dictionary=True)
    try:
        cur.execute("""
            SELECT
                t.status,
                t.current_location_id AS location_id,
                COALESCE(l.name, 'Unknown') AS location_name,
                COUNT(*) AS cnt
            FROM tags t
            LEFT JOIN locations l ON t.current_location_id = l.location_id
            GROUP BY t.status, t.current_location_id, l.name
            ORDER BY t.status, location_name
        """)
        return cur.fetchall()
    finally:
        cur.close(); conn.close()

@router.get("/history", response_model=List[ReportHistory])
def report_history(
    period: str = Query("day", regex="^(day|month|year)$"),
    start_date: date | None = Query(None, description="วันที่เริ่มต้น (yyyy-mm-dd)"),
    end_date: date | None = Query(None, description="วันที่สิ้นสุด (yyyy-mm-dd)"),
):
    """GET /api/reports/history – ดึงรายงาน movement รายวัน/เดือน/ปี"""
    # เลือกรูปแบบวันที่ตาม period
    fmt_map = {
        "day":   "DATE_FORMAT(timestamp, '%Y-%m-%d')",
        "month": "DATE_FORMAT(timestamp, '%Y-%m')",
        "year":  "DATE_FORMAT(timestamp, '%Y')",
    }
    fmt = fmt_map[period]

    sql = f"SELECT {fmt} AS period, COUNT(*) AS cnt FROM movements"
    params: list = []
    where = []

    if start_date:
        where.append("timestamp >= %s"); params.append(start_date)
    if end_date:
        where.append("timestamp <= %s"); params.append(end_date)
    if where:
        sql += " WHERE " + " AND ".join(where)

    sql += f" GROUP BY {fmt} ORDER BY {fmt}"

    conn = get_db_connection(); cur = conn.cursor(dictionary=True)
    try:
        cur.execute(sql, tuple(params))
        return cur.fetchall()
    finally:
        cur.close(); conn.close()