import base64
import numpy as np
import cv2
import uuid
import traceback
from datetime import datetime, date
from flask import Blueprint, request
from extensions import db, socketio
from models.worker import Worker
from routes import api_response
from services.face_service import FaceRecognitionService
from services.ai_engine import PPEDetector
from services.image_storage import save_attendance_image

kiosk_bp = Blueprint('kiosk_bp', __name__)
face_service = FaceRecognitionService()
ppe_detector = PPEDetector()

# In-memory dictionary to store pending approvals
pending_approvals = {}


def decode_base64_to_frame(body):
    image_base64 = body.get('image_base64')
    if not image_base64:
        return None
    if ',' in image_base64:
        image_base64 = image_base64.split(',')[1]
        
    image_base64 += "=" * ((4 - len(image_base64) % 4) % 4)
    
    try:
        image_bytes = base64.b64decode(image_base64)
        np_arr = np.frombuffer(image_bytes, np.uint8)
        return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    except Exception as e:
        print(f"DEBUG DECODE KIOSK: failed: {e}")
        return None


@kiosk_bp.route('/scan-face', methods=['POST'])
def scan_face():
    body = request.get_json() or {}
    frame = decode_base64_to_frame(body)
    if frame is None:
        return api_response(message='Image is required', status='error', code=400)

    workers = Worker.query.filter_by(is_active=True).all()
    if not workers:
        return api_response(message='No registered workers found', status='error', code=404)

    # Filter only workers with face encodings
    workers_with_face = [w for w in workers if w.face_encoding is not None]
    print(f"DEBUG SCAN: Total workers: {len(workers)}, With face: {len(workers_with_face)}")

    if not workers_with_face:
        return api_response(message='No workers have face data registered', status='error', code=404)

    result = face_service.find_matching_worker(frame, workers_with_face)
    print(f"DEBUG SCAN: Match result: {result}")

    if result['verified']:
        attendance_state = 'not_checked_in'
        try:
            from models.attendance import Attendance
            today = date.today()
            existing = Attendance.query.filter_by(
                worker_id=result['worker_id']
            ).filter(
                db.func.date(Attendance.check_in) == today
            ).order_by(Attendance.check_in.desc()).first()

            if existing and existing.check_out is None:
                attendance_state = 'checked_in'

            worker = Worker.query.filter_by(worker_id=result['worker_id']).first()
            if worker:
                worker.last_seen = datetime.utcnow()
                db.session.commit()
        except Exception as e:
            print(f"Attendance check error: {e}")

        return api_response(data={
            'worker_id': result['worker_id'],
            'worker_db_id': result['worker_db_id'],
            'name': result['name'],
            'language': result['language'],
            'status': 'verified',
            'attendance_state': attendance_state
        }, message='Identity verified')
    else:
        return api_response(data={
            'worker_id': None,
            'name': None,
            'status': 'not_found'
        }, message='Face not recognized', status='error', code=404)


@kiosk_bp.route('/verify-ppe', methods=['POST'], strict_slashes=False)
def verify_ppe():
    if request.content_type and request.content_type.startswith('multipart/form-data'):
        worker_id = request.form.get('worker_id')
        image_file = request.files.get('image')
        image_bytes = image_file.read() if image_file else None
        
        if image_bytes:
            np_arr = np.frombuffer(image_bytes, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        else:
            frame = None
    else:
        body = request.get_json() or {}
        frame = decode_base64_to_frame(body)
        worker_id = body.get('worker_id')

    if frame is None:
        return api_response(message='Image is required', status='error', code=400)

    required_ppe = ["helmet", "mask", "glove", "goggles"]
    worker = None
    if worker_id:
        worker = Worker.query.filter_by(worker_id=worker_id).first()
        print(f"DEBUG PPE Check: worker_id={worker_id}, worker={worker}")
        if worker and worker.zone_id:
            from models.zone import Zone
            zone = Zone.query.get(worker.zone_id)
            print(f"DEBUG PPE Check: zone_id={worker.zone_id}, zone={zone}")
            if zone and zone.required_ppe:
                import json
                print(f"DEBUG PPE Check: zone.required_ppe={zone.required_ppe}")
                try:
                    req_list = json.loads(zone.required_ppe)
                    print(f"DEBUG PPE Check: parsed req_list={req_list}")
                    if isinstance(req_list, list):
                        required_ppe = req_list
                except Exception as e:
                    print(f"DEBUG PPE Check json.loads ERROR: {e}")

    detection_result = ppe_detector.detect_frame(frame)
    violations = detection_result.get('violations', [])
    detections = detection_result.get('detections', [])

    # Build set of detected positive PPE items
    detected_ppe = set()
    for det in detections:
        cls = det['class'].lower()
        if cls == 'helmet':    detected_ppe.add('helmet')
        elif cls == 'mask':    detected_ppe.add('mask')
        elif cls == 'glove':   detected_ppe.add('glove')
        elif cls == 'goggles': detected_ppe.add('goggles')
        elif cls == 'shoes':   detected_ppe.add('shoes')
        elif cls in ('vest', 'safety_vest', 'reflective_vest'): detected_ppe.add('vest')

    # An item is MISSING unless it is positively detected — safe fail-closed logic
    missing_items = [ppe for ppe in required_ppe if ppe not in detected_ppe]

    # DEBUG logging
    print(f"\n===== PPE DETECTION DEBUG =====")
    print(f"All detections ({len(detections)}):")
    for d in detections:
        print(f"  class={d['class']!r}  conf={d['confidence']:.3f}")
    print(f"detected_ppe: {detected_ppe}")
    print(f"missing_items: {missing_items}")
    print(f"================================\n")

    passed = len(missing_items) == 0


    if worker_id:
        try:
            from models.ppe_scan import PPEScan
            from models.attendance import Attendance
            
            image_base64_for_save = None
            if not request.content_type or not request.content_type.startswith('multipart/form-data'):
                image_base64_for_save = body.get('image_base64')
            else:
                import base64
                if image_bytes:
                    image_base64_for_save = f"data:image/jpeg;base64,{base64.b64encode(image_bytes).decode('utf-8')}"
                
            image_path = save_attendance_image(image_base64_for_save, worker_id) if image_base64_for_save else None
            
            if passed:
                scan = PPEScan(
                    worker_id=worker_id,
                    scan_time=datetime.utcnow(),
                    helmet='helmet' in detected_ppe,
                    vest='vest' in detected_ppe,
                    gloves='glove' in detected_ppe,
                    boots='shoes' in detected_ppe,
                    goggles='goggles' in detected_ppe,
                    mask='mask' in detected_ppe,
                    is_compliant=True,
                    image_path=image_path,
                    created_at=datetime.utcnow()
                )
                db.session.add(scan)
                
                # Only skip if there's already an open (not yet checked-out) attendance today
                from datetime import date as date_type
                today = date_type.today()
                open_attendance = Attendance.query.filter_by(worker_id=worker_id).filter(
                    db.func.date(Attendance.check_in) == today,
                    Attendance.check_out == None
                ).first()
                if not open_attendance:
                    attendance = Attendance(
                        worker_id=worker_id,
                        check_in=datetime.utcnow(),
                        image_path=image_path,
                        supervisor_id=worker.supervisor_id if worker else None,
                        zone_id=worker.zone_id if worker else None,
                        status='APPROVED',
                        date=today
                    )
                    db.session.add(attendance)
                db.session.commit()
            else:
                # Instead of saving failure immediately, we put it in pending approvals
                token = str(uuid.uuid4())
                worker_name = worker.name if worker else worker_id
                
                pending_approvals[token] = {
                    'worker_id': worker_id,
                    'worker_name': worker_name,
                    'supervisor_id': worker.supervisor_id if worker else None,
                    'zone_id': worker.zone_id if worker else None,
                    'missing_items': missing_items,
                    'detected_ppe': list(detected_ppe),
                    'violations_list': [v['class'] for v in violations],
                    'confidence': max([d['confidence'] for d in detections], default=0),
                    'image_path': image_path
                }
                supervisor_room = f"supervisor_{worker.supervisor_id}" if worker and worker.supervisor_id else None
                print(f"DEBUG: supervisor_id={worker.supervisor_id if worker else None}, room={supervisor_room}")
                if supervisor_room:
                    socketio.emit('ppe_approval_needed', {
                        'token': token,
                        'worker_id': worker_id,
                        'worker_name': worker_name,
                        'supervisor_id': worker.supervisor_id,
                        'zone_id': worker.zone_id if worker else None,
                        'missing_items': missing_items,
                        'detected_ppe': list(detected_ppe),
                        'image_path': image_path
                    }, namespace='/live', room=supervisor_room)
                else:
                    print("WARNING: Worker has no supervisor — approval not sent")
                
                return api_response(data={
                    'passed': False,
                    'requires_approval': True,
                    'approval_token': token,
                    'missing_items': missing_items,
                    'detected_ppe': list(detected_ppe),
                    'violations': [v['class'] for v in violations],
                    'confidence': max([d['confidence'] for d in detections], default=0)
                }, message='PPE check failed. Waiting for admin approval.')

        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            print(f"PPE scan log error:\n{error_details}")
            return api_response(message=f"Error processing PPE scan: {e}", status='error', code=500)

    return api_response(data={
        'passed': passed,
        'missing_items': missing_items,
        'violations': [v['class'] for v in violations],
        'confidence': max([d['confidence'] for d in detections], default=0)
    }, message='PPE check complete')


@kiosk_bp.route('/resolve-approval', methods=['POST'])
def resolve_approval():
    body = request.get_json() or {}
    token = body.get('token')
    action = body.get('action')  # 'approve' or 'reject'
    
    if not token or token not in pending_approvals:
        return api_response(message='Invalid or expired approval token', status='error', code=400)
        
    approval_data = pending_approvals.pop(token)
    worker_id = approval_data['worker_id']
    detected_ppe = approval_data['detected_ppe']
    missing_items = approval_data['missing_items']
    image_path = approval_data['image_path']
    
    try:
        from models.ppe_scan import PPEScan
        from models.attendance import Attendance
        from models.violation import Violation
        
        scan = PPEScan(
            worker_id=worker_id,
            scan_time=datetime.utcnow(),
            helmet='helmet' in detected_ppe,
            vest='vest' in detected_ppe,
            gloves='glove' in detected_ppe,
            boots='shoes' in detected_ppe,
            goggles='goggles' in detected_ppe,
            mask='mask' in detected_ppe,
            is_compliant=False, # It failed originally
            image_path=image_path,
            created_at=datetime.utcnow()
        )
        db.session.add(scan)
        
        if action == 'approve':
            from datetime import date as date_type
            today = date_type.today()
            # Only block if there's an open (not checked-out) record today
            open_attendance = Attendance.query.filter_by(worker_id=worker_id).filter(
                db.func.date(Attendance.check_in) == today,
                Attendance.check_out == None
            ).first()
            print(f"DEBUG APPROVE: worker_id={worker_id}, today={today}, open_attendance={open_attendance}")
            if not open_attendance:
                print(f"DEBUG APPROVE: No open attendance found — inserting new check-in")
                attendance = Attendance(
                    worker_id=worker_id,
                    check_in=datetime.utcnow(),
                    image_path=image_path,
                    supervisor_id=approval_data.get('supervisor_id'),
                    zone_id=approval_data.get('zone_id'),
                    status='APPROVED',
                    date=today
                )
                db.session.add(attendance)
            else:
                print(f"DEBUG APPROVE: Open attendance exists: {open_attendance.id} — skipping insert")
            
        worker = Worker.query.filter_by(worker_id=worker_id).first()
        worker_name_db = worker.name if worker else worker_id

        # Log violations regardless of approval or rejection, 
        # or maybe with a different status? We'll log them as open.
        for missing in missing_items:
            v = Violation(
                worker_id=worker.id if worker else None,
                worker_name=worker_name_db,
                camera_id='KIOSK',
                violation_type='{no_' + missing + '}',
                severity='MEDIUM',
                timestamp=datetime.utcnow(),
                ppe_type=f'no_{missing}',
                status='open' if action == 'reject' else 'resolved',
                confidence=1.0
            )
            db.session.add(v)
            
        db.session.commit()
        
        # Notify Kiosk (must use /live namespace - that's what the frontend connects to)
        socketio.emit('ppe_approval_resolved', {'status': 'approved' if action == 'approve' else 'rejected'}, namespace='/live', room=f"kiosk_{token}")
        
        return api_response(message=f'Approval resolved: {action}')
    except Exception as e:
        print(f"Resolve approval error: {e}")
        traceback.print_exc()
        db.session.rollback()
        return api_response(message=f'Failed to resolve approval: {str(e)}', status='error', code=500)


@kiosk_bp.route('/register-face', methods=['POST'])
def register_face():
    body = request.get_json() or {}
    worker_id = body.get('worker_id', '').strip()
    if not worker_id:
        return api_response(message='worker_id is required', status='error', code=400)

    frame = decode_base64_to_frame(body)
    if frame is None:
        return api_response(message='Image is required', status='error', code=400)

    worker = Worker.query.filter_by(worker_id=worker_id).first()
    if not worker:
        return api_response(message='Worker not found', status='error', code=404)

    embedding = face_service.get_embedding(frame)
    if embedding is None:
        return api_response(message='No face detected. Please try again.', status='error', code=400)

    worker.face_encoding = embedding.tolist()
    db.session.commit()

    return api_response(data={
        'success': True,
        'worker_id': worker.worker_id,
        'name': worker.name
    }, message='Face registered successfully')

@kiosk_bp.route('/check-out', methods=['POST'])
def check_out():
    body = request.get_json() or {}
    worker_id = body.get('worker_id')
    if not worker_id:
        return api_response(message='worker_id is required', status='error', code=400)

    try:
        from models.attendance import Attendance
        today = date.today()
        existing = Attendance.query.filter_by(
            worker_id=worker_id
        ).filter(
            db.func.date(Attendance.check_in) == today
        ).order_by(Attendance.check_in.desc()).first()

        if existing and existing.check_out is None:
            existing.check_out = datetime.utcnow()
            db.session.commit()
            return api_response(message='Checked out successfully')
        else:
            return api_response(message='No active check-in found', status='error', code=400)
    except Exception as e:
        print(f"Check-out error: {e}")
        return api_response(message='Check-out failed', status='error', code=500)