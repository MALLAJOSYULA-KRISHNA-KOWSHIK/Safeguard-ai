from datetime import datetime
from extensions import db

class Supervisor(db.Model):
    __tablename__ = 'supervisors'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.Text, nullable=False)
    email = db.Column(db.Text, unique=True, nullable=False)
    phone = db.Column(db.Text, default='')
    zone_id = db.Column(db.Integer, db.ForeignKey('zones.id'), nullable=True)
    badge_id = db.Column(db.Text, unique=True, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    password_hash = db.Column(db.Text, nullable=True)
    role = db.Column(db.Text, default='supervisor')

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'phone': self.phone,
            'zone_id': self.zone_id,
            'badge_id': self.badge_id,
            'is_active': self.is_active,
            'role': self.role,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
