from app import create_app
from extensions import db
from sqlalchemy import text

app = create_app()

with app.app_context():
    try:
        db.session.execute(text("ALTER TABLE managers ADD COLUMN admin_id VARCHAR(36) REFERENCES users(id);"))
        db.session.commit()
        print("Successfully added admin_id to managers.")
    except Exception as e:
        db.session.rollback()
        print("Error or column already exists:", e)
