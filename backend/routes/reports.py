from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt
from models.ppe_scan import PPEScan
from models.worker import Worker
from routes import api_response
from extensions import db

reports_bp = Blueprint('reports_bp', __name__)


@reports_bp.route('/ppe', methods=['GET'])
@jwt_required()
def get_ppe_reports():
    claims = get_jwt()
    if claims.get('role') != 'supervisor':
        return api_response(message='PPE scan reports are strictly for supervisors', status='error', code=403)
        
    supervisor_id = claims.get('supervisor_id')
    
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    pagination = PPEScan.query.join(Worker, PPEScan.worker_id == Worker.worker_id).filter(
        Worker.supervisor_id == supervisor_id
    ).order_by(PPEScan.scan_time.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    records = []
    for scan in pagination.items:
        data = scan.to_dict()
        worker = Worker.query.filter_by(worker_id=scan.worker_id).first()
        data['worker_name'] = worker.name if worker else None
        data['image_url'] = f'/uploads/{scan.image_path}' if scan.image_path else None
        records.append(data)

    return api_response(data={
        'records': records,
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    }, message='PPE Reports fetched successfully')


@reports_bp.route('/ppe/<string:scan_id>', methods=['DELETE'])
@jwt_required()
def delete_ppe_report(scan_id):
    claims = get_jwt()
    if claims.get('role') != 'supervisor':
        return api_response(message='Only supervisors can delete PPE scans', status='error', code=403)
        
    supervisor_id = claims.get('supervisor_id')
    
    scan = PPEScan.query.get_or_404(scan_id)
    worker = Worker.query.filter_by(worker_id=scan.worker_id).first()
    
    if not worker or worker.supervisor_id != supervisor_id:
        return api_response(message='You do not have permission to delete this scan', status='error', code=403)

    db.session.delete(scan)
    db.session.commit()
    return api_response(data={}, message='PPE scan record deleted')


@reports_bp.route('/generate/daily/', methods=['POST'])
@jwt_required()
def generate_daily():
    return api_response(data={'report_url': None}, message='Generate daily report placeholder')


@reports_bp.route('/generate/dgms/', methods=['POST'])
@jwt_required()
def generate_dgms():
    return api_response(data={'report_url': None}, message='Generate DGMS report placeholder')


@reports_bp.route('/generate/esg/', methods=['POST'])
@jwt_required()
def generate_esg():
    return api_response(data={'report_url': None}, message='Generate ESG report placeholder')
