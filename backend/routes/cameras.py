from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from routes import api_response

cameras_bp = Blueprint('cameras_bp', __name__)

CAMERAS = []


@cameras_bp.route('/', methods=['GET'])
@jwt_required()
def list_cameras():
    return api_response(data={'cameras': CAMERAS}, message='Camera list retrieved')


@cameras_bp.route('/start/', methods=['POST'])
@jwt_required()
def start_camera():
    body = request.get_json() or {}
    camera = {
        'camera_id': body.get('camera_id'),
        'rtsp_url': body.get('rtsp_url'),
        'status': 'running'
    }
    CAMERAS.append(camera)
    return api_response(data=camera, message='Camera monitoring started')


@cameras_bp.route('/stop/', methods=['POST'])
@jwt_required()
def stop_camera():
    body = request.get_json() or {}
    camera_id = body.get('camera_id')
    for camera in CAMERAS:
        if camera.get('camera_id') == camera_id:
            camera['status'] = 'stopped'
    return api_response(data={'camera_id': camera_id}, message='Camera monitoring stopped')
