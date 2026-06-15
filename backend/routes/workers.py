import base64
import numpy as np
import cv2
from datetime import datetime
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt
from extensions import db
from models.worker import Worker
from routes import api_response, role_required
from services.face_service import FaceRecognitionService
from services.image_storage import save_worker_image_bytes

workers_bp = Blueprint('workers_bp', __name__)
face_service = FaceRecognitionService()


def _decode_image_bytes(image_bytes: bytes) -> np.ndarray | None:
    if not image_bytes:
        return None
    
    try:
        np_arr = np.frombuffer(image_bytes, np.uint8)
        return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    except Exception as e:
        print(f"DEBUG DECODE: failed: {e}")
        return None


def _worker_dict(worker: Worker) -> dict:
    return {
        'id': str(worker.id),
        'worker_id': worker.worker_id,
        'name': worker.name,
        'department': worker.department,
        'email': worker.email,
        'language': worker.language,
        'is_active': worker.is_active,
        'compliance_rate': worker.compliance_rate or 100.0,
        'has_face': worker.face_encoding is not None,
        'registered_at': worker.registered_at.isoformat() if worker.registered_at else None,
        'last_seen': worker.last_seen.isoformat() if worker.last_seen else None,
    }


@workers_bp.route('', methods=['GET'])
@jwt_required()
def list_workers():
    from sqlalchemy import text
    claims = get_jwt()
    role = claims.get('role')
    jwt_zone_id = claims.get('zone_id')  # set for supervisors

    # Supervisors only see their zone; admins see all
    # Also support explicit ?zone_id= query param (admin use)
    qp_zone_id = request.args.get('zone_id', type=int)

    params = {}
    where_parts = []

    if role == 'supervisor' and jwt_zone_id is not None:
        where_parts.append('w.zone_id = :zone_id')
        params['zone_id'] = int(jwt_zone_id)
    elif qp_zone_id is not None:
        where_parts.append('w.zone_id = :zone_id')
        params['zone_id'] = qp_zone_id

    where_sql = ('WHERE ' + ' AND '.join(where_parts)) if where_parts else ''

    sql = f"""
        SELECT
            w.id::text,
            w.worker_id,
            w.name,
            w.department,
            w.email,
            w.language,
            w.is_active,
            w.zone_id,
            w.supervisor_id,
            z.name AS zone_name,
            s.name AS supervisor_name,
            COALESCE(
                ROUND(
                    100.0 * SUM(CASE WHEN cl.is_compliant THEN 1 ELSE 0 END)
                    / NULLIF(COUNT(cl.id), 0)
                , 1)
            , 100.0) AS compliance_rate,
            (w.face_encoding IS NOT NULL AND w.face_encoding::text != 'null') AS has_face
        FROM workers w
        LEFT JOIN zones z ON w.zone_id = z.id
        LEFT JOIN supervisors s ON w.supervisor_id = s.id
        LEFT JOIN compliance_logs cl ON cl.worker_id::text = w.id::text
        {where_sql}
        GROUP BY w.id, w.worker_id, w.name, w.department, w.email,
                 w.language, w.is_active, w.zone_id, w.supervisor_id,
                 z.name, s.name
        ORDER BY w.name
    """
    try:
        rows = db.session.execute(text(sql), params).fetchall()
        return api_response(data=[dict(r._mapping) for r in rows], message='Worker list retrieved')
    except Exception as e:
        db.session.rollback()
        print(f'Error listing workers: {e}')
        return api_response(message=f'Failed to list workers: {str(e)}', status='error', code=500)



@workers_bp.route('/register', methods=['POST'])
def register_worker():
    if request.content_type and request.content_type.startswith('multipart/form-data'):
        worker_id = request.form.get('worker_id', '').strip()
        name = request.form.get('name', '').strip()
        email = request.form.get('email', '').strip()
        department = request.form.get('department', '').strip()
        language = request.form.get('language', 'en').strip()
        _zid = request.form.get('zone_id') or None
        _sid = request.form.get('supervisor_id') or None
        zone_id = int(_zid) if _zid else None
        supervisor_id = int(_sid) if _sid else None
        image_file = request.files.get('image')
        image_bytes = image_file.read() if image_file else None
    else:
        body = request.get_json() or {}
        worker_id = body.get('worker_id', '').strip()
        name = body.get('name', '').strip()
        email = body.get('email', '').strip()
        department = body.get('department', '').strip()
        language = body.get('language', 'en').strip()
        _zid = body.get('zone_id') or None
        _sid = body.get('supervisor_id') or None
        zone_id = int(_zid) if _zid else None
        supervisor_id = int(_sid) if _sid else None
        image_base64 = body.get('image_base64')
        image_bytes = None
        if image_base64:
            if ',' in image_base64:
                image_base64 = image_base64.split(',', 1)[1]
            image_base64 += "=" * ((4 - len(image_base64) % 4) % 4)
            image_bytes = base64.b64decode(image_base64)

    if not worker_id or not name:
        return api_response(message='worker_id and name are required', status='error', code=400)

    if Worker.query.filter_by(worker_id=worker_id).first():
        return api_response(message=f'Worker ID {worker_id} already exists', status='error', code=409)

    if email and Worker.query.filter_by(email=email).first():
        return api_response(message=f'Email {email} already exists', status='error', code=409)

    face_encoding = None
    face_images_path = None
    if image_bytes:
        frame = _decode_image_bytes(image_bytes)
        print(f"DEBUG: Frame shape: {frame.shape if frame is not None else 'None'}")
        if frame is not None:
            embedding = face_service.get_embedding(frame)
            print(f"DEBUG: Embedding found: {embedding is not None}")
            if embedding is not None:
                face_encoding = embedding.tolist()
                print(f"DEBUG: Face encoding saved, length: {len(face_encoding)}")
                # Save the image to filesystem
                face_images_path = save_worker_image_bytes(image_bytes, worker_id)
                if not face_images_path:
                    return api_response(message='Failed to save image to filesystem', status='error', code=500)
            else:
                return api_response(message='No face detected in the provided image', status='error', code=400)
        else:
            return api_response(message='Failed to decode the provided image (invalid base64 or corrupted image)', status='error', code=400)


    worker = Worker(
        worker_id=worker_id,
        name=name,
        department=department,
        email=email if email else None,
        face_encoding=face_encoding,
        face_images_path=face_images_path,
        language=language,
        is_active=True,
        registered_at=datetime.utcnow(),
        compliance_rate=100.0
    )
    db.session.add(worker)
    db.session.flush()  # populate worker.id

    # Assign zone / supervisor via raw SQL (columns not in ORM model)
    if zone_id is not None or supervisor_id is not None:
        from sqlalchemy import text as _text
        try:
            db.session.execute(
                _text('UPDATE workers SET zone_id = :z, supervisor_id = :s WHERE id::text = :wid'),
                {'z': zone_id, 's': supervisor_id, 'wid': str(worker.id)}
            )
        except Exception as ez:
            print(f'Warning: could not set zone/supervisor on new worker: {ez}')

    db.session.commit()

    return api_response(data={
        'id': str(worker.id),
        'worker_id': worker.worker_id,
        'name': worker.name,
        'has_face': face_encoding is not None
    }, message='Worker registered')


@workers_bp.route('/<string:id>', methods=['GET'])
@jwt_required()
def get_worker(id):
    worker = Worker.query.filter_by(id=id).first()
    if not worker:
        return api_response(message='Worker not found', status='error', code=404)
    return api_response(data=_worker_dict(worker), message='Worker retrieved')


@workers_bp.route('/<string:id>', methods=['PUT'])
@jwt_required()
@role_required('admin', 'supervisor')
def update_worker(id):
    worker = Worker.query.filter_by(id=id).first()
    if not worker:
        return api_response(message='Worker not found', status='error', code=404)

    if request.content_type and request.content_type.startswith('multipart/form-data'):
        worker.name = request.form.get('name', worker.name)
        worker.department = request.form.get('department', worker.department)
        worker.email = request.form.get('email', worker.email)
        worker.language = request.form.get('language', worker.language)
        if 'is_active' in request.form:
            worker.is_active = request.form.get('is_active') == 'true'
        _zid = request.form.get('zone_id') or None
        _sid = request.form.get('supervisor_id') or None
        image_file = request.files.get('image')
        image_bytes = image_file.read() if image_file else None
    else:
        body = request.get_json() or {}
        worker.name = body.get('name', worker.name)
        worker.department = body.get('department', worker.department)
        worker.email = body.get('email', worker.email)
        worker.language = body.get('language', worker.language)
        worker.is_active = body.get('is_active', worker.is_active)
        _zid = body.get('zone_id') or None
        _sid = body.get('supervisor_id') or None
        image_base64 = body.get('image_base64')
        image_bytes = None
        if image_base64:
            if ',' in image_base64:
                image_base64 = image_base64.split(',', 1)[1]
            image_base64 += "=" * ((4 - len(image_base64) % 4) % 4)
            image_bytes = base64.b64decode(image_base64)

    # Apply zone_id / supervisor_id if provided
    if _zid is not None:
        try:
            from sqlalchemy import text as _text
            _zone_id = int(_zid)
            _sup_id  = int(_sid) if _sid else None
            db.session.execute(
                _text('UPDATE workers SET zone_id = :z, supervisor_id = :s WHERE id::text = :wid'),
                {'z': _zone_id, 's': _sup_id, 'wid': str(worker.id)}
            )
        except Exception as ez:
            print(f'Warning: could not update zone/supervisor: {ez}')

    if image_bytes:
        frame = _decode_image_bytes(image_bytes)
        if frame is not None:
            embedding = face_service.get_embedding(frame)
            if embedding is not None:
                worker.face_encoding = embedding.tolist()
                
                # Save the image to filesystem
                new_path = save_worker_image_bytes(image_bytes, worker.worker_id)
                if new_path:
                    worker.face_images_path = new_path
                else:
                    return api_response(message='Failed to save image to filesystem', status='error', code=500)
            else:
                return api_response(message='No face detected in the provided image', status='error', code=400)
        else:
            return api_response(message='Failed to decode the provided image (invalid base64 or corrupted image)', status='error', code=400)

    db.session.commit()
    return api_response(data=_worker_dict(worker), message='Worker updated')


@workers_bp.route('/<string:id>', methods=['DELETE'])
@jwt_required()
@role_required('admin')
def delete_worker(id):
    worker = Worker.query.filter_by(id=id).first()
    if not worker:
        return api_response(message='Worker not found', status='error', code=404)

    try:
        from sqlalchemy import text

        worker_uuid = worker.id          # UUID string e.g. "81d6b012-..."
        worker_code = worker.worker_id   # string code e.g. "24331a4436"

        # Use raw SQL to avoid ORM model / DB schema drift issues.
        # Pass worker_uuid as a plain string — works for both text and uuid columns.
        # attendance.worker_id → workers.worker_id  (text FK)
        db.session.execute(
            text("DELETE FROM attendance WHERE worker_id = :wid"),
            {"wid": worker_code}
        )
        # violations.worker_id → workers.id  (UUID FK, nullable)
        db.session.execute(
            text("DELETE FROM violations WHERE worker_id::text = :wid"),
            {"wid": str(worker_uuid)}
        )
        # compliance_logs.worker_id → workers.id  (UUID FK)
        db.session.execute(
            text("DELETE FROM compliance_logs WHERE worker_id::text = :wid"),
            {"wid": str(worker_uuid)}
        )
        # profiles.worker_id → workers.id  (may be text or uuid in DB)
        db.session.execute(
            text("DELETE FROM profiles WHERE worker_id::text = :wid"),
            {"wid": str(worker_uuid)}
        )

        db.session.delete(worker)
        db.session.commit()
        return api_response(data={}, message='Worker deleted')
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting worker {id}: {e}")
        return api_response(message=f'Failed to delete worker: {str(e)}', status='error', code=500)


@workers_bp.route('/debug', methods=['GET'])
@jwt_required()
def debug_workers():
    workers = Worker.query.all()
    return api_response(data=[{
        'id': str(w.id),
        'worker_id': w.worker_id,
        'name': w.name
    } for w in workers], message='Debug list')