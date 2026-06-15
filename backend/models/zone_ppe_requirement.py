import uuid
from datetime import datetime
from extensions import db

class ZonePpeRequirement(db.Model):
    __tablename__ = 'zone_ppe_requirements'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    zone_id = db.Column(db.Integer, db.ForeignKey('zones.id'), nullable=False)
    ppe_item = db.Column(db.Text, nullable=False)
    is_required = db.Column(db.Boolean, default=True)
    updated_by = db.Column(db.Integer, nullable=True)
    updated_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'zone_id': self.zone_id,
            'ppe_item': self.ppe_item,
            'is_required': self.is_required,
            'updated_by': self.updated_by,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
