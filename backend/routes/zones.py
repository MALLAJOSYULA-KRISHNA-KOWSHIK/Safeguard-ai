from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from extensions import db
from models.zone import Zone
from routes import api_response, role_required

zones_bp = Blueprint('zones_bp', __name__)


@zones_bp.route('/', methods=['GET'])
@jwt_required()
def list_zones():
    zones = [zone.to_dict() for zone in Zone.query.all()]
    return api_response(data=zones, message='Zone list retrieved')


@zones_bp.route('/', methods=['POST'])
@jwt_required()
@role_required('admin')
def create_zone():
    body = request.get_json() or {}
    zone = Zone(
        name=body.get('name', ''),
        required_ppe=body.get('required_ppe', '[]'),
        is_high_risk=body.get('is_high_risk', False)
    )
    db.session.add(zone)
    db.session.commit()
    return api_response(data=zone.to_dict(), message='Zone created'), 201


@zones_bp.route('/<int:zone_id>', methods=['PUT'])
@jwt_required()
@role_required('admin')
def update_zone(zone_id):
    zone = Zone.query.get_or_404(zone_id)
    body = request.get_json() or {}
    zone.name = body.get('name', zone.name)
    zone.required_ppe = body.get('required_ppe', zone.required_ppe)
    zone.is_high_risk = body.get('is_high_risk', zone.is_high_risk)
    db.session.commit()
    return api_response(data=zone.to_dict(), message='Zone updated')
