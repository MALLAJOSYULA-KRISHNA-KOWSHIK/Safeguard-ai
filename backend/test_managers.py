from app import create_app
from flask_jwt_extended import create_access_token

app = create_app()

with app.app_context():
    # 1. create token
    token = create_access_token(identity='12345', additional_claims={'role': 'admin'})
    
    # 2. test client
    client = app.test_client()
    resp = client.get('/api/settings/managers', headers={'Authorization': f'Bearer {token}'})
    print(resp.status_code)
    print(resp.get_data(as_text=True))
