import uuid
from sqlalchemy.dialects.postgresql import JSONB
from extensions import db


class Camera(db.Model):
    __tablename__ = 'cameras'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    camera_name = db.Column(db.Text, nullable=False)
    location = db.Column(db.Text, nullable=True)
    rtsp_url = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    zone = db.Column(db.Text, nullable=True)
    required_ppe = db.Column(JSONB, nullable=True)
    is_online = db.Column(db.Boolean, default=False, nullable=False)
    resolution = db.Column(db.Text, nullable=True)
    fps = db.Column(db.Integer, nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'camera_name': self.camera_name,
            'location': self.location,
            'rtsp_url': self.rtsp_url,
            'is_active': self.is_active,
            'zone': self.zone,
            'required_ppe': self.required_ppe,
            'is_online': self.is_online,
            'resolution': self.resolution,
            'fps': self.fps
        }
