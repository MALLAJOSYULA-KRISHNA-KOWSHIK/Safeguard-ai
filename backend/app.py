import os
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv(override=True)

from extensions import db, jwt, socketio


def token_in_blocklist_callback(jwt_header, jwt_payload):
    from routes.auth import TOKEN_BLOCKLIST
    return jwt_payload['jti'] in TOKEN_BLOCKLIST


def create_app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL")
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "connect_args": {"sslmode": "require"}
    }
    app.config["JWT_SECRET_KEY"] = os.environ.get("SECRET_KEY")
    app.config["DEBUG"] = os.environ.get("DEBUG", "False").lower() == "true"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["UPLOAD_FOLDER"] = os.path.join(os.path.dirname(__file__), 'uploads')

    CORS(app, origins="*", supports_credentials=False, methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"])

    db.init_app(app)
    jwt.init_app(app)
    jwt.token_in_blocklist_loader(token_in_blocklist_callback)
    socketio.init_app(app, cors_allowed_origins="*")  # ← add cors here

    from routes.auth import auth_bp
    from routes.workers import workers_bp
    from routes.zones import zones_bp
    from routes.violations import violations_bp
    from routes.analytics import analytics_bp
    from routes.kiosk import kiosk_bp
    from routes.reports import reports_bp
    from routes.cameras import cameras_bp
    from routes.attendance import attendance_bp
    from routes.settings import settings_bp
    from routes.superadmin import superadmin_bp
    from sockets.live_events import register_live_events

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(workers_bp, url_prefix="/api/workers")
    app.register_blueprint(zones_bp, url_prefix="/api/zones")
    app.register_blueprint(violations_bp, url_prefix="/api/violations")
    app.register_blueprint(analytics_bp, url_prefix="/api/analytics")
    app.register_blueprint(kiosk_bp, url_prefix="/api/kiosk")
    app.register_blueprint(reports_bp, url_prefix="/api/reports")
    app.register_blueprint(cameras_bp, url_prefix="/api/cameras")
    app.register_blueprint(attendance_bp, url_prefix="/api/attendance")
    app.register_blueprint(settings_bp, url_prefix="/api/settings")
    app.register_blueprint(superadmin_bp, url_prefix="/api/superadmin")

    register_live_events(socketio)

    @app.before_request
    def handle_preflight():
        from flask import request, make_response
        if request.method == 'OPTIONS':
            res = make_response()
            res.headers['Access-Control-Allow-Origin'] = '*'
            res.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
            res.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
            res.status_code = 204
            return res

    @app.route('/uploads/<path:filename>')
    def serve_upload(filename):
        """Serve uploaded images from the filesystem."""
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

    @app.route("/health")
    def health_check():
        return jsonify({"status": "success", "message": "SafeGuard AI backend healthy", "data": {}})

    return app


app = create_app()

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=8000, debug=app.config["DEBUG"], allow_unsafe_werkzeug=True, use_reloader=False)