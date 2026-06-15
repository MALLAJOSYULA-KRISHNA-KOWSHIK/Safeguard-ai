from app import create_app
from extensions import db
from models.user import User

app = create_app()

with app.app_context():
    sa = User.query.filter_by(email='superadmin@safeguard.com').first()
    if not sa:
        sa = User(email='superadmin@safeguard.com', role='superadmin')
        sa.set_password('admin123')
        db.session.add(sa)
        db.session.commit()
        print("Superadmin created.")
    else:
        print("Superadmin already exists.")
