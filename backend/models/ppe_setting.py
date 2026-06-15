from datetime import datetime
from extensions import db

class PpeSetting(db.Model):
    __tablename__ = 'ppe_settings'

    id = db.Column(db.Integer, primary_key=True)
    item_name = db.Column(db.Text, unique=True, nullable=False)
    is_enabled = db.Column(db.Boolean, default=True, nullable=False)
    priority = db.Column(db.Text, default='medium', nullable=False)
    updated_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'item_name': self.item_name,
            'is_enabled': self.is_enabled,
            'priority': self.priority,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
