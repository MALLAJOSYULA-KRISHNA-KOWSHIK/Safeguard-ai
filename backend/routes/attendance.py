"""
Attendance CRUD routes.

Endpoints:
    GET  /api/attendance        — list records (paginated, filterable by date)
    GET  /api/attendance/<id>   — single record
    DELETE /api/attendance/<id> — delete record + image file
"""

from datetime import datetime
from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from extensions import db
from models.attendance import Attendance
from routes import api_response, role_required
from services.image_storage import delete_attendance_image

attendance_bp = Blueprint('attendance_bp', __name__)


@attendance_bp.route('', methods=['GET'])
@jwt_required()
def list_attendance():
    """Return attendance records with optional filtering and pagination."""
    from sqlalchemy import text
    page      = request.args.get('page', 1, type=int)
    per_page  = request.args.get('per_page', 25, type=int)
    date_from = request.args.get('date_from')
    date_to   = request.args.get('date_to')
    date      = request.args.get('date')        # exact date  YYYY-MM-DD
    worker_id = request.args.get('worker_id')
    zone_id   = request.args.get('zone_id', type=int)
    supervisor_id = request.args.get('supervisor_id', type=int)

    joins  = []
    where  = []
    params = {}
    
    needs_worker_join = False

    if zone_id is not None:
        needs_worker_join = True
        where.append('w.zone_id = :zone_id')
        params['zone_id'] = zone_id

    if supervisor_id is not None:
        needs_worker_join = True
        where.append('(a.supervisor_id = :supervisor_id OR w.supervisor_id = :supervisor_id)')
        params['supervisor_id'] = supervisor_id
        
    if needs_worker_join:
        joins.append('JOIN workers w ON a.worker_id = w.worker_id')

    if date:
        where.append("DATE(a.check_in) = :date")
        params['date'] = date

    if date_from:
        where.append("a.check_in >= :date_from")
        params['date_from'] = date_from

    if date_to:
        where.append("a.check_in <= :date_to")
        params['date_to'] = date_to

    if worker_id:
        where.append("a.worker_id = :worker_id")
        params['worker_id'] = worker_id

    join_sql  = ' '.join(joins)
    where_sql = ('WHERE ' + ' AND '.join(where)) if where else ''

    count_sql = f"SELECT COUNT(*) FROM attendance a {join_sql} {where_sql}"
    total = db.session.execute(text(count_sql), params).scalar() or 0

    offset = (page - 1) * per_page
    params['limit']  = per_page
    params['offset'] = offset
    data_sql = f"""
        SELECT
            a.id, a.worker_id, a.check_in, a.check_out,
            a.shift, a.location, a.image_path, a.created_at,
            w2.name AS worker_name, w2.department, w2.worker_id AS worker_code
        FROM attendance a
        {join_sql}
        LEFT JOIN workers w2 ON a.worker_id = w2.worker_id
        {where_sql}
        ORDER BY a.check_in DESC
        LIMIT :limit OFFSET :offset
    """
    rows = db.session.execute(text(data_sql), params).fetchall()
    records = []
    for r in rows:
        d = dict(r._mapping)
        d['id'] = str(d['id']) if d.get('id') else None
        d['check_in']  = d['check_in'].isoformat()  if d.get('check_in')  else None
        d['check_out'] = d['check_out'].isoformat() if d.get('check_out') else None
        d['created_at'] = d['created_at'].isoformat() if d.get('created_at') else None
        d['image_url'] = f"/uploads/{d['image_path']}" if d.get('image_path') else None
        records.append(d)

    return api_response(data={
        'records':  records,
        'total':    total,
        'page':     page,
        'pages':    (total + per_page - 1) // per_page,
        'per_page': per_page,
    }, message='Attendance records retrieved')



@attendance_bp.route('/<string:id>', methods=['GET'])
@jwt_required()
def get_attendance(id):
    record = Attendance.query.get(id)
    if not record:
        return api_response(message='Attendance record not found', status='error', code=404)
    return api_response(data=record.to_dict(), message='Attendance record retrieved')


@attendance_bp.route('/<string:id>', methods=['DELETE'])
@jwt_required()
@role_required('admin', 'supervisor', 'manager')
def delete_attendance(id):
    record = Attendance.query.get(id)
    if not record:
        return api_response(message='Attendance record not found', status='error', code=404)

    # Delete image file from disk
    if record.image_path:
        delete_attendance_image(record.image_path)

    db.session.delete(record)
    db.session.commit()
    return api_response(data={}, message='Attendance record and image deleted')
