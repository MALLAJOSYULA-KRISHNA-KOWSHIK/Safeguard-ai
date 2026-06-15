import uuid
from datetime import datetime
from extensions import db


class Attendance(db.Model):
    __tablename__ = 'attendance'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    worker_id = db.Column(db.String(36), db.ForeignKey('workers.worker_id'), nullable=False)
    check_in = db.Column(db.DateTime(timezone=True), nullable=False)
    check_out = db.Column(db.DateTime(timezone=True), nullable=True)
    shift = db.Column(db.Text, nullable=True)
    location = db.Column(db.Text, nullable=True)
    image_path = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    date = db.Column(db.Date, nullable=True)
    status = db.Column(db.Text, default='PENDING')
    zone_id = db.Column(db.Integer, nullable=True)
    supervisor_id = db.Column(db.Integer, nullable=True)
    resolved_at = db.Column(db.DateTime(timezone=True), nullable=True)
    resolution_note = db.Column(db.Text, nullable=True)

    # relationship for easy name joins
    worker = db.relationship('Worker', backref='attendance_records', lazy='joined')

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'worker_id': self.worker_id,
            'worker_name': self.worker.name if self.worker else None,
            'worker_code': self.worker.worker_id if self.worker else None,
            'department': self.worker.department if self.worker else None,
            'check_in': self.check_in.isoformat() if self.check_in else None,
            'check_out': self.check_out.isoformat() if self.check_out else None,
            'shift': self.shift,
            'location': self.location,
            'image_path': self.image_path,
            'image_url': f'/uploads/{self.image_path}' if self.image_path else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'date': self.date.isoformat() if self.date else None,
            'status': self.status,
            'zone_id': self.zone_id,
            'supervisor_id': self.supervisor_id,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
            'resolution_note': self.resolution_note
        }
