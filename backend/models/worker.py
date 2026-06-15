import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB
from extensions import db


class Worker(db.Model):
    __tablename__ = 'workers'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    worker_id = db.Column(db.Text, unique=True, nullable=False)
    name = db.Column(db.Text, nullable=False)
    department = db.Column(db.Text, nullable=True)
    email = db.Column(db.Text, unique=True, nullable=False)
    face_encoding = db.Column(JSONB, nullable=True)
    face_images_path = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    registered_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    last_seen = db.Column(db.DateTime(timezone=True), nullable=True)
    language = db.Column(db.String(2), default='en', nullable=False)
    compliance_rate = db.Column(db.Float, default=100.0)
    zone_id = db.Column(db.Integer, nullable=True)
    supervisor_id = db.Column(db.Integer, db.ForeignKey('supervisors.id'), nullable=True)
    manager_id = db.Column(db.Integer, db.ForeignKey('managers.id'), nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'worker_id': self.worker_id,
            'name': self.name,
            'department': self.department,
            'email': self.email,
            'face_encoding': self.face_encoding,
            'face_images_path': self.face_images_path,
            'is_active': self.is_active,
            'registered_at': self.registered_at.isoformat() if self.registered_at else None,
            'last_seen': self.last_seen.isoformat() if self.last_seen else None,
            'language': self.language,
            'compliance_rate': self.compliance_rate,
            'zone_id': self.zone_id,
            'supervisor_id': self.supervisor_id,
            'manager_id': self.manager_id
        }
