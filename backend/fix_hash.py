from app import create_app
from models.user import User
from extensions import db
from werkzeug.security import generate_password_hash

app = create_app()

with app.app_context():
    sa = User.query.filter_by(email='superadmin@safeguard.com').first()
    if sa:
        sa.password_hash = generate_password_hash('admin123')
        db.session.commit()
        print("Superadmin hash fixed:", sa.password_hash)
    else:
        print("Superadmin not found.")
