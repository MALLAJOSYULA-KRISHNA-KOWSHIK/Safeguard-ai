from datetime import timedelta
from flask import Blueprint, request
from flask_jwt_extended import create_access_token, create_refresh_token, jwt_required, get_jwt
from extensions import db
from models.user import User
from routes import api_response
from sqlalchemy import text
import bcrypt

auth_bp = Blueprint('auth_bp', __name__)
TOKEN_BLOCKLIST = set()


@auth_bp.route('/init-superadmin', methods=['GET'])
def init_superadmin():
    from models.user import User
    from extensions import db
    sa = User.query.filter_by(email='superadmin@safeguard.com').first()
    if not sa:
        sa = User(email='superadmin@safeguard.com', role='superadmin')
        sa.set_password('admin123')
        db.session.add(sa)
        db.session.commit()
        return api_response(message='Superadmin created')
    return api_response(message='Superadmin already exists')


@auth_bp.route('/login', methods=['POST'])
def login():
    body = request.get_json() or {}
    email = (body.get('email') or '').strip().lower()
    password = body.get('password') or ''

    if not email or not password:
        return api_response(message='Email and password are required', status='error', code=400)

    # ── 1. Check admin/user table first (existing logic) ──────────────────
    user = User.query.filter_by(email=email).first()
    if user and user.check_password(password):
        additional_claims = {"role": user.role, "email": user.email}
        access_token = create_access_token(
            identity=str(user.id),
            additional_claims=additional_claims,
            expires_delta=timedelta(minutes=30)
        )
        refresh_token = create_refresh_token(
            identity=str(user.id),
            additional_claims=additional_claims
        )
        return api_response(data={
            'access_token': access_token,
            'refresh_token': refresh_token,
            'role': user.role,
            'email': user.email,
            'name': getattr(user, 'name', '')
        }, message='Logged in successfully')

    # ── 2. Fallback: check supervisors table ──────────────────────────────
    sup = db.session.execute(
        text("SELECT * FROM supervisors WHERE email = :email AND is_active = true"),
        {'email': email}
    ).fetchone()

    if sup:
        sup_dict = dict(sup._mapping)
        stored_hash = sup_dict.get('password_hash')

        if not stored_hash:
            return api_response(
                message='Account not set up yet, contact admin',
                status='error', code=401
            )

        try:
            valid = bcrypt.checkpw(password.encode('utf-8'), stored_hash.encode('utf-8'))
        except Exception:
            valid = False

        if not valid:
            return api_response(message='Invalid credentials', status='error', code=401)

        additional_claims = {
            "role": "supervisor",
            "email": sup_dict['email'],
            "zone_id": sup_dict.get('zone_id'),
            "supervisor_id": sup_dict['id']
        }
        access_token = create_access_token(
            identity=str(sup_dict['id']),
            additional_claims=additional_claims,
            expires_delta=timedelta(minutes=30)
        )
        refresh_token = create_refresh_token(
            identity=str(sup_dict['id']),
            additional_claims=additional_claims
        )
        return api_response(data={
            'access_token': access_token,
            'refresh_token': refresh_token,
            'role': 'supervisor',
            'email': sup_dict['email'],
            'name': sup_dict.get('name', ''),
            'zone_id': sup_dict.get('zone_id'),
            'supervisor_id': sup_dict['id']
        }, message='Logged in successfully')

    # ── 3. Fallback: check managers table ────────────────────────────────
    mgr = db.session.execute(
        text("SELECT * FROM managers WHERE email = :email AND is_active = true"),
        {'email': email}
    ).fetchone()

    if mgr:
        mgr_dict = dict(mgr._mapping)
        stored_hash = mgr_dict.get('password_hash')

        if not stored_hash:
            return api_response(
                message='Account not set up yet, contact admin',
                status='error', code=401
            )

        try:
            valid = bcrypt.checkpw(password.encode('utf-8'), stored_hash.encode('utf-8'))
        except Exception:
            valid = False

        if not valid:
            return api_response(message='Invalid credentials', status='error', code=401)

        additional_claims = {
            "role": "manager",
            "email": mgr_dict['email'],
        }
        access_token = create_access_token(
            identity=str(mgr_dict['id']),
            additional_claims=additional_claims,
            expires_delta=timedelta(minutes=30)
        )
        refresh_token = create_refresh_token(
            identity=str(mgr_dict['id']),
            additional_claims=additional_claims
        )
        return api_response(data={
            'access_token': access_token,
            'refresh_token': refresh_token,
            'role': 'manager',
            'email': mgr_dict['email'],
            'name': mgr_dict.get('name', ''),
        }, message='Logged in successfully')

    # ── 4. Nothing matched ─────────────────────────────────────────────────
    return api_response(message='Invalid credentials', status='error', code=401)


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    claims = get_jwt()
    identity = claims['sub']
    new_token = create_access_token(
        identity=identity,
        additional_claims={"role": claims.get('role'), "email": claims.get('email')}
    )
    return api_response(data={'access_token': new_token}, message='Token refreshed')


@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    jti = get_jwt()['jti']
    TOKEN_BLOCKLIST.add(jti)
    return api_response(message='Logged out successfully')


@auth_bp.app_errorhandler(404)
def route_not_found(e):
    return api_response(message='Route not found', status='error', code=404)


@auth_bp.app_errorhandler(500)
def server_error(e):
    return api_response(message='Internal server error', status='error', code=500)