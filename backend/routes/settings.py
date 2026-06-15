import bcrypt
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from extensions import db
from models.ppe_setting import PpeSetting
from models.zone import Zone
from models.supervisor import Supervisor
from models.manager import Manager

settings_bp = Blueprint('settings_bp', __name__)

# ─── PPE SETTINGS ────────────────────────────────────────────────────────────

@settings_bp.route('/ppe', methods=['GET'])
@jwt_required()
def get_ppe_settings():
    try:
        settings = PpeSetting.query.order_by(PpeSetting.priority.desc(), PpeSetting.item_name).all()
        return jsonify([s.to_dict() for s in settings]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@settings_bp.route('/ppe/<string:item_name>', methods=['PATCH'])
@jwt_required()
def update_ppe_setting(item_name):
    try:
        body = request.get_json() or {}
        setting = PpeSetting.query.filter_by(item_name=item_name).first()
        if not setting:
            return jsonify({'error': f'PPE item "{item_name}" not found'}), 404

        updated = False
        if 'is_enabled' in body:
            setting.is_enabled = bool(body['is_enabled'])
            updated = True

        if 'priority' in body:
            if body['priority'] not in ('low', 'medium', 'high'):
                return jsonify({'error': 'priority must be low, medium, or high'}), 400
            setting.priority = body['priority']
            updated = True

        if updated:
            db.session.commit()
        return jsonify(setting.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ─── ZONES ───────────────────────────────────────────────────────────────────

@settings_bp.route('/zones', methods=['GET'])
@jwt_required()
def get_zones():
    try:
        zones = Zone.query.order_by(Zone.name).all()
        return jsonify([z.to_dict() for z in zones]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@settings_bp.route('/zones', methods=['POST'])
@jwt_required()
def create_zone():
    try:
        body = request.get_json() or {}
        name = (body.get('name') or '').strip()
        if not name:
            return jsonify({'error': 'Zone name is required'}), 400

        risk_level = body.get('risk_level', 'low')
        if risk_level not in ('low', 'medium', 'high'):
            return jsonify({'error': 'risk_level must be low, medium, or high'}), 400

        is_high_risk = risk_level == 'high'

        zone = Zone(
            name=name,
            risk_level=risk_level,
            description=body.get('description', ''),
            color=body.get('color', '#6366f1'),
            is_high_risk=is_high_risk,
            required_ppe='[]'
        )
        db.session.add(zone)
        db.session.commit()
        return jsonify(zone.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@settings_bp.route('/zones/<int:zone_id>', methods=['PATCH'])
@jwt_required()
def update_zone(zone_id):
    try:
        body = request.get_json() or {}
        zone = Zone.query.get(zone_id)
        if not zone:
            return jsonify({'error': 'Zone not found'}), 404

        if 'name' in body:
            zone.name = body['name'].strip()
        if 'risk_level' in body:
            if body['risk_level'] not in ('low', 'medium', 'high'):
                return jsonify({'error': 'risk_level must be low, medium, or high'}), 400
            zone.risk_level = body['risk_level']
            zone.is_high_risk = body['risk_level'] == 'high'
        if 'description' in body:
            zone.description = body['description']
        if 'color' in body:
            zone.color = body['color']
        if 'required_ppe' in body:
            import json
            if isinstance(body['required_ppe'], list):
                zone.required_ppe = json.dumps(body['required_ppe'])
            else:
                zone.required_ppe = body['required_ppe']

        db.session.commit()
        return jsonify(zone.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@settings_bp.route('/zones/<int:zone_id>', methods=['DELETE'])
@jwt_required()
def delete_zone(zone_id):
    try:
        zone = Zone.query.get(zone_id)
        if not zone:
            return jsonify({'error': 'Zone not found'}), 404
        db.session.delete(zone)
        db.session.commit()
        return jsonify({'message': 'Zone deleted'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ─── SUPERVISORS ─────────────────────────────────────────────────────────────

@settings_bp.route('/supervisors', methods=['GET'])
@jwt_required()
def get_supervisors():
    try:
        supervisors = Supervisor.query.order_by(Supervisor.name).all()
        result = []
        for s in supervisors:
            s_dict = s.to_dict()
            if s.zone_id:
                zone = Zone.query.get(s.zone_id)
                s_dict['zone_name'] = zone.name if zone else None
            else:
                s_dict['zone_name'] = None
            result.append(s_dict)
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@settings_bp.route('/supervisors', methods=['POST'])
@jwt_required()
def create_supervisor():
    try:
        body = request.get_json() or {}
        name = (body.get('name') or '').strip()
        email = (body.get('email') or '').strip().lower()
        password = (body.get('password') or '').strip()

        if not name or not email:
            return jsonify({'error': 'name and email are required'}), 400
        if not password:
            return jsonify({'error': 'password is required'}), 400

        password_hash = bcrypt.hashpw(
            password.encode('utf-8'),
            bcrypt.gensalt()
        ).decode('utf-8')

        zone_id = body.get('zone_id') or None
        if zone_id is not None:
            zone_id = int(zone_id)

        supervisor = Supervisor(
            name=name,
            email=email,
            phone=body.get('phone', ''),
            zone_id=zone_id,
            badge_id=body.get('badge_id', ''),
            password_hash=password_hash,
            role='supervisor'
        )
        db.session.add(supervisor)
        db.session.commit()
        return jsonify(supervisor.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@settings_bp.route('/supervisors/<int:sup_id>', methods=['PATCH'])
@jwt_required()
def update_supervisor(sup_id):
    try:
        body = request.get_json() or {}
        supervisor = Supervisor.query.get(sup_id)
        if not supervisor:
            return jsonify({'error': 'Supervisor not found'}), 404

        if 'name' in body:
            supervisor.name = body['name'].strip()
        if 'email' in body:
            supervisor.email = body['email'].strip().lower()
        if 'phone' in body:
            supervisor.phone = body['phone']
        if 'zone_id' in body:
            supervisor.zone_id = int(body['zone_id']) if body['zone_id'] else None
        if 'is_active' in body:
            supervisor.is_active = bool(body['is_active'])

        db.session.commit()
        return jsonify(supervisor.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@settings_bp.route('/supervisors/<int:sup_id>', methods=['DELETE'])
@jwt_required()
def delete_supervisor(sup_id):
    try:
        supervisor = Supervisor.query.get(sup_id)
        if not supervisor:
            return jsonify({'error': 'Supervisor not found'}), 404
        db.session.delete(supervisor)
        db.session.commit()
        return jsonify({'message': 'Supervisor deleted'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ─── MANAGERS ────────────────────────────────────────────────────────────────

import traceback

@settings_bp.route('/managers', methods=['GET'])
@jwt_required()
def get_managers():
    try:
        claims = get_jwt()
        role = claims.get('role')
        user_id = claims.get('sub')
        
        query = Manager.query
        if role == 'admin':
            query = query.filter_by(admin_id=user_id)
            
        managers = query.order_by(Manager.name).all()
        return jsonify([m.to_dict() for m in managers]), 200
    except Exception as e:
        print(traceback.format_exc())
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500


@settings_bp.route('/managers', methods=['POST'])
@jwt_required()
def create_manager():
    try:
        body = request.get_json() or {}
        name = (body.get('name') or '').strip()
        email = (body.get('email') or '').strip().lower()
        password = (body.get('password') or '').strip()

        if not name or not email:
            return jsonify({'error': 'name and email are required'}), 400
        if not password:
            return jsonify({'error': 'password is required'}), 400

        password_hash = bcrypt.hashpw(
            password.encode('utf-8'),
            bcrypt.gensalt()
        ).decode('utf-8')

        claims = get_jwt()
        admin_id = claims.get('sub') if claims.get('role') == 'admin' else None

        manager = Manager(
            name=name,
            email=email,
            phone=body.get('phone', ''),
            badge_id=body.get('badge_id', ''),
            password_hash=password_hash,
            role='manager',
            admin_id=admin_id
        )
        db.session.add(manager)
        db.session.commit()
        return jsonify(manager.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@settings_bp.route('/managers/<int:mgr_id>', methods=['PATCH'])
@jwt_required()
def update_manager(mgr_id):
    try:
        claims = get_jwt()
        role = claims.get('role')
        user_id = claims.get('sub')
        
        body = request.get_json() or {}
        manager = Manager.query.get(mgr_id)
        if not manager:
            return jsonify({'error': 'Manager not found'}), 404
            
        if role == 'admin' and str(manager.admin_id) != str(user_id):
            return jsonify({'error': 'Unauthorized'}), 403

        if 'name' in body:
            manager.name = body['name'].strip()
        if 'email' in body:
            manager.email = body['email'].strip().lower()
        if 'phone' in body:
            manager.phone = body['phone']
        if 'is_active' in body:
            manager.is_active = bool(body['is_active'])

        db.session.commit()
        return jsonify(manager.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@settings_bp.route('/managers/<int:mgr_id>', methods=['DELETE'])
@jwt_required()
def delete_manager(mgr_id):
    try:
        claims = get_jwt()
        role = claims.get('role')
        user_id = claims.get('sub')
        
        manager = Manager.query.get(mgr_id)
        if not manager:
            return jsonify({'error': 'Manager not found'}), 404
            
        if role == 'admin' and str(manager.admin_id) != str(user_id):
            return jsonify({'error': 'Unauthorized'}), 403
        db.session.delete(manager)
        db.session.commit()
        return jsonify({'message': 'Manager deleted'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500