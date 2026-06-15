import random
import uuid
from datetime import datetime, timedelta
from extensions import db
from models.worker import Worker
from models.zone import Zone
from models.violation import Violation

ZONES = ["Zone A - Drilling", "Zone B - Blasting", "Zone C - Processing", "Zone D - Maintenance", "Zone E - Storage"]
PPE_TYPES = ["NO-Hardhat", "NO-Safety Vest", "NO-Gloves", "NO-Eye Protection"]
CAMERAS = ["CAM-01", "CAM-02", "CAM-03", "CAM-04", "CAM-05"]
SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
SEVERITY_WEIGHTS = [30, 40, 20, 10]


def seed():
    import app

    app_instance = app.create_app()
    with app_instance.app_context():
        db.create_all()
        for zone_name in ZONES:
            if not Zone.query.filter_by(name=zone_name).first():
                zone = Zone(name=zone_name, required_ppe='["helmet","vest","boots"]', is_high_risk='Blasting' in zone_name)
                db.session.add(zone)

        workers = []
        for i in range(1, 21):
            worker_id = f"EMP{i:04d}"
            worker = Worker(
                worker_id=worker_id,
                name=f"Worker {i:02d}",
                department="Field",
                email=f"worker{i}@safeguard.com",
                face_encoding=None,
                face_images_path=None,
                is_active=True,
                registered_at=datetime.utcnow() - timedelta(days=random.randint(1, 90)),
                last_seen=datetime.utcnow() - timedelta(minutes=random.randint(0, 720)),
                language="en",
                compliance_rate=random.uniform(70, 99)
            )
            db.session.add(worker)
            workers.append(worker)
        db.session.commit()

        for day in range(30):
            date = datetime.utcnow() - timedelta(days=day)
            daily_count = random.randint(5, 25)
            for _ in range(daily_count):
                worker = random.choice(workers) if random.random() > 0.3 else None
                violation = Violation(
                    worker_id=worker.id if worker else None,
                    worker_name=worker.name if worker else None,
                    camera_id=random.choice(CAMERAS),
                    violation_type=random.choice(PPE_TYPES),
                    severity=random.choices(SEVERITIES, weights=SEVERITY_WEIGHTS)[0],
                    timestamp=date.replace(hour=random.randint(6, 22), minute=random.randint(0, 59)),
                    screenshot_url=None,
                    is_reviewed=random.random() > 0.4,
                    ppe_type=random.choice(PPE_TYPES),
                    confidence=random.uniform(0.85, 0.99),
                    zone=random.choice(ZONES),
                    status=random.choice(["open", "resolved", "resolved", "escalated"]),
                    resolved_at=(date if random.random() > 0.5 else None)
                )
                db.session.add(violation)
        db.session.commit()
        print("✅ Database seeded: 20 workers, 5 zones, 30 days of violations")


if __name__ == '__main__':
    seed()
