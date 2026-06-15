from datetime import datetime
from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from extensions import db
from models.violation import Violation
from routes import api_response, role_required

violations_bp = Blueprint('violations_bp', __name__)


@violations_bp.route('/', methods=['GET'])
@jwt_required()
def list_violations():
    from sqlalchemy import text
    args = request.args

    status    = args.get('status')
    severity  = args.get('severity')
    zone      = args.get('zone')
    worker_id = args.get('worker_id')
    zone_id   = args.get('zone_id', type=int)
    resolved  = args.get('resolved')          # 'true' / 'false'
    limit     = args.get('limit', type=int)
    group_by  = args.get('group_by')          # 'ppe_type'

    # ── group_by=ppe_type shortcut ───────────────────────────────────────────
    if group_by == 'ppe_type':
        sql = "SELECT ppe_type, COUNT(*) AS count FROM violations GROUP BY ppe_type ORDER BY count DESC"
        rows = db.session.execute(text(sql)).fetchall()
        return api_response(data=[dict(r._mapping) for r in rows], message='Violations by PPE type')

    joins  = []
    where  = []
    params = {}

    if zone_id is not None:
        joins.append('JOIN workers w ON v.worker_id::text = w.id::text')
        where.append('w.zone_id = :zone_id')
        params['zone_id'] = zone_id

    if status:
        where.append('v.status = :status')
        params['status'] = status

    if severity:
        where.append('v.severity = :severity')
        params['severity'] = severity.upper()

    if zone:
        where.append('v.zone = :zone')
        params['zone'] = zone

    if worker_id:
        where.append('v.worker_id = :worker_id')
        params['worker_id'] = worker_id

    if resolved is not None:
        resolved_bool = resolved.lower() == 'true'
        if resolved_bool:
            where.append("v.status = 'resolved'")
        else:
            where.append("v.status != 'resolved'")

    join_sql  = ' '.join(joins)
    where_sql = ('WHERE ' + ' AND '.join(where)) if where else ''
    limit_sql = f'LIMIT {int(limit)}' if limit else ''

    sql = f"SELECT v.* FROM violations v {join_sql} {where_sql} ORDER BY v.timestamp DESC {limit_sql}"
    rows = db.session.execute(text(sql), params).fetchall()

    def _fmt(r):
        d = dict(r._mapping)
        d['id'] = str(d['id']) if d.get('id') else None
        d['worker_id'] = str(d['worker_id']) if d.get('worker_id') else None
        d['timestamp'] = d['timestamp'].isoformat() if d.get('timestamp') else None
        d['resolved_at'] = d['resolved_at'].isoformat() if d.get('resolved_at') else None
        return d

    return api_response(data=[_fmt(r) for r in rows], message='Violations retrieved')



@violations_bp.route('/', methods=['POST'])
@jwt_required()
@role_required('admin', 'supervisor')
def create_violation():
    body = request.get_json() or {}
    violation = Violation(
        worker_id=body.get('worker_id'),
        worker_name=body.get('worker_name'),
        camera_id=body.get('camera_id', ''),
        violation_type=body.get('violation_type', ''),
        severity=body.get('severity', 'MEDIUM').upper(),
        timestamp=body.get('timestamp', datetime.utcnow()),
        screenshot_url=body.get('screenshot_url'),
        is_reviewed=body.get('is_reviewed', False),
        ppe_type=body.get('ppe_type'),
        confidence=body.get('confidence', 0.0),
        zone=body.get('zone'),
        status=body.get('status', 'open')
    )
    db.session.add(violation)
    db.session.commit()
    return api_response(data=violation.to_dict(), message='Violation created'), 201


@violations_bp.route('/<string:violation_id>', methods=['GET'])
@jwt_required()
def get_violation(violation_id):
    violation = Violation.query.get_or_404(violation_id)
    return api_response(data=violation.to_dict(), message='Violation retrieved')


@violations_bp.route('/<string:violation_id>', methods=['PUT'])
@jwt_required()
@role_required('admin', 'supervisor')
def update_violation(violation_id):
    violation = Violation.query.get_or_404(violation_id)
    body = request.get_json() or {}
    violation.status = body.get('status', violation.status)
    if violation.status == 'resolved' and not violation.resolved_at:
        violation.resolved_at = datetime.utcnow()
    db.session.commit()
    return api_response(data=violation.to_dict(), message='Violation updated')


@violations_bp.route('/<string:violation_id>', methods=['DELETE'])
@jwt_required()
@role_required('admin')
def delete_violation(violation_id):
    violation = Violation.query.get_or_404(violation_id)
    db.session.delete(violation)
    db.session.commit()
    return api_response(data={}, message='Violation deleted')
