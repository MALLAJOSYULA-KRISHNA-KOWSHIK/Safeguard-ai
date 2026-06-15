from app import create_app
from extensions import db
from sqlalchemy import text

app = create_app()
with app.app_context():
    try:
        db.session.execute(text("ALTER TABLE ppe_scans ADD COLUMN goggles BOOLEAN DEFAULT FALSE NOT NULL;"))
    except Exception as e:
        print("goggles error:", e)
        db.session.rollback()
        
    try:
        db.session.execute(text("ALTER TABLE ppe_scans ADD COLUMN mask BOOLEAN DEFAULT FALSE NOT NULL;"))
    except Exception as e:
        print("mask error:", e)
        db.session.rollback()
        
    db.session.commit()
    print("Database alteration complete")
