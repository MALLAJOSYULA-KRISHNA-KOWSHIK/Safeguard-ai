import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB
from extensions import db


class Report(db.Model):
    __tablename__ = 'reports'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    report_name = db.Column(db.Text, nullable=False)
    description = db.Column(db.Text, nullable=True)
    report_type = db.Column(db.Text, nullable=True)
    generated_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    report_url = db.Column(db.Text, nullable=True)
    report_metadata = db.Column('metadata', JSONB, nullable=True)
    created_by = db.Column(db.Text, nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'report_name': self.report_name,
            'description': self.description,
            'report_type': self.report_type,
            'generated_at': self.generated_at.isoformat() if self.generated_at else None,
            'report_url': self.report_url,
            'metadata': self.report_metadata,
            'created_by': self.created_by
        }
