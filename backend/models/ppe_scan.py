import uuid
from datetime import datetime
from extensions import db


class PPEScan(db.Model):
    __tablename__ = 'ppe_scans'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    worker_id = db.Column(db.Text, nullable=False)
    scan_time = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    helmet = db.Column(db.Boolean, default=False, nullable=False)
    vest = db.Column(db.Boolean, default=False, nullable=False)
    gloves = db.Column(db.Boolean, default=False, nullable=False)
    boots = db.Column(db.Boolean, default=False, nullable=False)
    goggles = db.Column(db.Boolean, default=False, nullable=False)
    mask = db.Column(db.Boolean, default=False, nullable=False)
    is_compliant = db.Column(db.Boolean, default=False, nullable=False)
    image_path = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'worker_id': self.worker_id,
            'scan_time': self.scan_time.isoformat() if self.scan_time else None,
            'helmet': self.helmet,
            'vest': self.vest,
            'gloves': self.gloves,
            'boots': self.boots,
            'goggles': self.goggles,
            'mask': self.mask,
            'is_compliant': self.is_compliant,
            'image_path': self.image_path,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
