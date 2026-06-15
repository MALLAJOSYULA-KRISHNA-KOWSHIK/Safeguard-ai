# routes/superadmin.py
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt
from extensions import db
from routes import api_response, role_required
from models.user import User

superadmin_bp = Blueprint('superadmin_bp', __name__)


@superadmin_bp.route('/admins', methods=['GET'])
@jwt_required()
@role_required('superadmin')
def list_admins():
    admins = User.query.filter_by(role='admin').all()
    return api_response(data=[{
        'id': str(u.id),
        'email': u.email,
        'role': u.role,
        'created_at': u.created_at.isoformat() if u.created_at else None
    } for u in admins], message='Admins retrieved')


@superadmin_bp.route('/admins', methods=['POST'])
@jwt_required()
@role_required('superadmin')
def create_admin():
    body = request.get_json() or {}
    email = body.get('email', '').strip().lower()
    password = body.get('password', '').strip()

    if not email or not password:
        return api_response(message='email and password are required', status='error', code=400)

    if User.query.filter_by(email=email).first():
        return api_response(message='Email already exists', status='error', code=409)

    user = User(email=email, role='admin')
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    return api_response(data={
        'id': str(user.id),
        'email': user.email,
        'role': user.role
    }, message='Admin created')


@superadmin_bp.route('/admins/<string:id>', methods=['PUT'])
@jwt_required()
@role_required('superadmin')
def update_admin(id):
    user = User.query.filter_by(id=id, role='admin').first()
    if not user:
        return api_response(message='Admin not found', status='error', code=404)

    body = request.get_json() or {}
    if 'email' in body:
        user.email = body['email'].strip().lower()
    if 'password' in body and body['password']:
        user.set_password(body['password'])

    db.session.commit()
    return api_response(data={
        'id': str(user.id),
        'email': user.email,
        'role': user.role
    }, message='Admin updated')


@superadmin_bp.route('/admins/<string:id>', methods=['DELETE'])
@jwt_required()
@role_required('superadmin')
def delete_admin(id):
    user = User.query.filter_by(id=id, role='admin').first()
    if not user:
        return api_response(message='Admin not found', status='error', code=404)
    try:
        from models.manager import Manager
        from models.worker import Worker
        from models.profile import Profile
        from models.violation import Violation
        from models.attendance import Attendance
        from models.ppe_scan import PPEScan
        from models.compliance_log import ComplianceLog
        from models.alert import Alert

        managers = Manager.query.filter_by(admin_id=id).all()
        manager_ids = [m.id for m in managers]
        
        if manager_ids:
            workers = Worker.query.filter(Worker.manager_id.in_(manager_ids)).all()
            worker_db_ids = [w.id for w in workers]
            worker_str_ids = [w.worker_id for w in workers]
            
            if worker_db_ids:
                Profile.query.filter(Profile.worker_id.in_(worker_db_ids)).delete(synchronize_session=False)
                
                violations = Violation.query.filter(Violation.worker_id.in_(worker_db_ids)).all()
                violation_ids = [v.id for v in violations]
                if violation_ids:
                    Alert.query.filter(Alert.violation_id.in_(violation_ids)).delete(synchronize_session=False)
                
                Violation.query.filter(Violation.worker_id.in_(worker_db_ids)).delete(synchronize_session=False)
                
            if worker_str_ids:
                Attendance.query.filter(Attendance.worker_id.in_(worker_str_ids)).delete(synchronize_session=False)
                PPEScan.query.filter(PPEScan.worker_id.in_(worker_str_ids)).delete(synchronize_session=False)
                ComplianceLog.query.filter(ComplianceLog.worker_id.in_(worker_str_ids)).delete(synchronize_session=False)
                
            Worker.query.filter(Worker.manager_id.in_(manager_ids)).delete(synchronize_session=False)
            
        Manager.query.filter_by(admin_id=id).delete(synchronize_session=False)
        
        db.session.delete(user)
        db.session.commit()
        return api_response(data={}, message='Admin and all associated data deleted')
    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return api_response(message=f"Failed to delete admin: {str(e)}", status='error', code=500)
