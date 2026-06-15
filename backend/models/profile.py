import uuid
from datetime import datetime
from extensions import db


class Profile(db.Model):
    __tablename__ = 'profiles'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    worker_id = db.Column(db.String(36), db.ForeignKey('workers.id'), nullable=False)
    date_of_birth = db.Column(db.Date, nullable=True)
    contact_number = db.Column(db.Text, nullable=True)
    emergency_contact = db.Column(db.Text, nullable=True)
    address = db.Column(db.Text, nullable=True)
    job_title = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'worker_id': self.worker_id,
            'date_of_birth': self.date_of_birth.isoformat() if self.date_of_birth else None,
            'contact_number': self.contact_number,
            'emergency_contact': self.emergency_contact,
            'address': self.address,
            'job_title': self.job_title,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
