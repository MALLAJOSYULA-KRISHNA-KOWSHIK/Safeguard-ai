import uuid
from datetime import datetime
from extensions import db


class Alert(db.Model):
    __tablename__ = 'alerts'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    violation_id = db.Column(db.String(36), db.ForeignKey('violations.id'), nullable=False)
    level = db.Column(db.Integer, nullable=False)
    channel = db.Column(db.String(20), nullable=False)
    sent_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    acknowledged_at = db.Column(db.DateTime(timezone=True), nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'violation_id': self.violation_id,
            'level': self.level,
            'channel': self.channel,
            'sent_at': self.sent_at.isoformat() if self.sent_at else None,
            'acknowledged_at': self.acknowledged_at.isoformat() if self.acknowledged_at else None
        }
