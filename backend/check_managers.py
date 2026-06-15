from app import create_app
from models.manager import Manager

app = create_app()

with app.app_context():
    try:
        mgrs = Manager.query.all()
        for m in mgrs:
            print(m.to_dict())
        print("Success")
    except Exception as e:
        print("ERROR:", str(e))
