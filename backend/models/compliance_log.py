import uuid
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from extensions import db


class ComplianceLog(db.Model):
    __tablename__ = 'compliance_logs'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    worker_id = db.Column(db.String(36), db.ForeignKey('workers.id'), nullable=False)
    worker_name = db.Column(db.Text, nullable=False)
    camera_id = db.Column(db.Text, nullable=True)
    timestamp = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    ppe_detected = db.Column(JSONB, nullable=True)
    is_compliant = db.Column(db.Boolean, default=False, nullable=False)
    confidence_score = db.Column(db.Float, nullable=False)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'worker_id': self.worker_id,
            'worker_name': self.worker_name,
            'camera_id': self.camera_id,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'ppe_detected': self.ppe_detected,
            'is_compliant': self.is_compliant,
            'confidence_score': self.confidence_score
        }
