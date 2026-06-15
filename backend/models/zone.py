from extensions import db


class Zone(db.Model):
    __tablename__ = 'zones'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    required_ppe = db.Column(db.Text, nullable=False)
    is_high_risk = db.Column(db.Boolean, default=False)
    risk_level = db.Column(db.Text, default='low')
    description = db.Column(db.Text, default='')
    color = db.Column(db.Text, default='#6366f1')
    created_at = db.Column(db.DateTime(timezone=True), default=db.func.now())

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'name': self.name,
            'required_ppe': self.required_ppe,
            'is_high_risk': self.is_high_risk,
            'risk_level': self.risk_level,
            'description': self.description,
            'color': self.color,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
