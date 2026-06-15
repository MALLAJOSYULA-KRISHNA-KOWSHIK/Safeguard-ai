import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB
from extensions import db


class Violation(db.Model):
    __tablename__ = 'violations'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    worker_id = db.Column(db.String(36), db.ForeignKey('workers.id'), nullable=True)
    worker_name = db.Column(db.Text, nullable=True)
    camera_id = db.Column(db.Text, nullable=False)
    violation_type = db.Column(db.Text, nullable=False)
    severity = db.Column(db.String(20), default='MEDIUM', nullable=False)
    timestamp = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    screenshot_url = db.Column(db.Text, nullable=True)
    is_reviewed = db.Column(db.Boolean, default=False, nullable=False)
    ppe_type = db.Column(db.Text, nullable=True)
    confidence = db.Column(db.Float, nullable=False)
    zone = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), default='open', nullable=False)
    resolved_at = db.Column(db.DateTime(timezone=True), nullable=True)
    approval_status = db.Column(db.Text, default='pending')
    approval_note = db.Column(db.Text, default='')
    approved_by = db.Column(db.Integer, db.ForeignKey('supervisors.id'), nullable=True)
    approved_at = db.Column(db.DateTime(timezone=True), nullable=True)
    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'worker_id': self.worker_id,
            'worker_name': self.worker_name,
            'camera_id': self.camera_id,
            'violation_type': self.violation_type,
            'severity': self.severity,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'screenshot_url': self.screenshot_url,
            'is_reviewed': self.is_reviewed,
            'ppe_type': self.ppe_type,
            'confidence': self.confidence,
            'zone': self.zone,
            'status': self.status,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
            'approval_status': self.approval_status,
            'approval_note': self.approval_note,
            'approved_by': self.approved_by,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None
        }
