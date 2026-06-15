import sys
from unittest.mock import MagicMock
sys.modules['bcrypt'] = MagicMock()
from app import create_app
from extensions import db
from sqlalchemy import text
from routes.attendance import attendance_bp

app = create_app()
with app.app_context():
    # Simulate what attendance.py does
    join_sql = 'JOIN workers w ON a.worker_id = w.worker_id'
    where_sql = 'WHERE w.zone_id = 1 AND (a.supervisor_id = 3 OR w.supervisor_id = 3)'
    data_sql = f"""
        SELECT
            a.id, a.worker_id, a.check_in, a.check_out,
            a.image_path, a.created_at,
            w2.name AS worker_name, w2.department, w2.worker_id AS worker_code
        FROM attendance a
        {join_sql}
        LEFT JOIN workers w2 ON a.worker_id = w2.worker_id
        {where_sql}
        ORDER BY a.check_in DESC
    """
    rows = db.session.execute(text(data_sql)).fetchall()
    print("Found rows:", len(rows))
    for r in rows:
        print(dict(r._mapping))
