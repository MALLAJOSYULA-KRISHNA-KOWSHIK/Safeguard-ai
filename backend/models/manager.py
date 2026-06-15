from datetime import datetime
from extensions import db

class Manager(db.Model):
    __tablename__ = 'managers'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.Text, nullable=False)
    email = db.Column(db.Text, unique=True, nullable=False)
    phone = db.Column(db.Text, default='')
    badge_id = db.Column(db.Text, unique=True, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    password_hash = db.Column(db.Text, nullable=True)
    role = db.Column(db.Text, default='manager')
    admin_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'phone': self.phone,
            'badge_id': self.badge_id,
            'is_active': self.is_active,
            'role': self.role,
            'admin_id': self.admin_id,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
