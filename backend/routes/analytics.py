from flask import Blueprint
from flask_jwt_extended import jwt_required
from routes import api_response

analytics_bp = Blueprint('analytics_bp', __name__)


@analytics_bp.route('/compliance/', methods=['GET'])
@jwt_required()
def compliance_trend():
    payload = {
        'trend': [],
        'violations': [],
        'compliance_rate': 0.0
    }
    return api_response(data=payload, message='Compliance analytics placeholder')


@analytics_bp.route('/heatmap/', methods=['GET'])
@jwt_required()
def heatmap():
    payload = {'zones': []}
    return api_response(data=payload, message='Heatmap analytics placeholder')


@analytics_bp.route('/leaderboard/', methods=['GET'])
@jwt_required()
def leaderboard():
    from flask import request
    from extensions import db
    from sqlalchemy import text

    zone_id = request.args.get('zone_id', type=int)
    limit   = request.args.get('limit', 20, type=int)
    params  = {'limit': limit}
    where   = ["w.is_active = true"]

    if zone_id is not None:
        where.append('w.zone_id = :zone_id')
        params['zone_id'] = zone_id

    where_sql = 'WHERE ' + ' AND '.join(where)
    sql = f"""
        SELECT
            w.id::text,
            w.worker_id,
            w.name,
            w.department,
            w.compliance_rate,
            w.zone_id,
            COUNT(a.id) AS total_shifts,
            MAX(a.check_in)::text AS last_seen
        FROM workers w
        LEFT JOIN attendance a ON a.worker_id = w.worker_id
        {where_sql}
        GROUP BY w.id, w.worker_id, w.name, w.department, w.compliance_rate, w.zone_id
        ORDER BY w.compliance_rate DESC NULLS LAST
        LIMIT :limit
    """
    rows = db.session.execute(text(sql), params).fetchall()
    workers = [dict(r._mapping) for r in rows]
    return api_response(data={'workers': workers}, message='Leaderboard retrieved')



@analytics_bp.route('/predictions/', methods=['GET'])
@jwt_required()
def predictions():
    payload = {'risk_predictions': []}
    return api_response(data=payload, message='Predictions placeholder')


@analytics_bp.route('/near-misses/', methods=['GET'])
@jwt_required()
def near_misses():
    payload = {'near_misses': []}
    return api_response(data=payload, message='Near misses placeholder')


@analytics_bp.route('/dashboard/stats/', methods=['GET'])
@jwt_required()
def dashboard_stats():
    from flask import request as req
    from extensions import db
    from sqlalchemy import text
    from datetime import datetime

    today_str = datetime.utcnow().strftime('%Y-%m-%d')
    zone_id = req.args.get('zone_id', type=int)

    # ── Count open (unresolved) violations today, filtered by zone ──
    vio_joins = ''
    vio_where = "WHERE DATE(v.timestamp) = :today AND v.status != 'resolved'"
    vio_params: dict = {'today': today_str}

    if zone_id is not None:
        vio_joins = 'JOIN workers w ON v.worker_id::text = w.id::text'
        vio_where += ' AND w.zone_id = :zone_id'
        vio_params['zone_id'] = zone_id

    vio_sql = text(f"SELECT COUNT(*) FROM violations v {vio_joins} {vio_where}")
    total_violations_today = db.session.execute(vio_sql, vio_params).scalar() or 0

    # ── Count resolved violations (zone-filtered if applicable) ──
    res_where = "WHERE v.status = 'resolved'"
    res_joins = ''
    res_params: dict = {}
    if zone_id is not None:
        res_joins = 'JOIN workers w ON v.worker_id::text = w.id::text'
        res_where += ' AND w.zone_id = :zone_id'
        res_params['zone_id'] = zone_id

    res_sql = text(f"SELECT COUNT(*) FROM violations v {res_joins} {res_where}")
    resolved_count = db.session.execute(res_sql, res_params).scalar() or 0

    # ── High-risk zone count ──
    hrz_sql = text("SELECT COUNT(*) FROM (SELECT zone_id, AVG(compliance_rate) as avg_c FROM workers GROUP BY zone_id) z WHERE z.avg_c < 80")
    high_risk_count = db.session.execute(hrz_sql).scalar() or 0

    # ── Compliance rate (zone-filtered if applicable) ──
    cr_where = 'WHERE is_active = true'
    cr_params: dict = {}
    if zone_id is not None:
        cr_where += ' AND zone_id = :zone_id'
        cr_params['zone_id'] = zone_id

    cr_sql = text(f"SELECT AVG(compliance_rate) FROM workers {cr_where}")
    compliance_rate_val = db.session.execute(cr_sql, cr_params).scalar()
    compliance_rate = round(float(compliance_rate_val)) if compliance_rate_val else 100

    payload = {
        'totalViolationsToday': total_violations_today,
        'complianceRate': compliance_rate,
        'highRiskCount': high_risk_count,
        'resolvedCount': resolved_count
    }
    return api_response(data=payload, message='Dashboard stats retrieved')
