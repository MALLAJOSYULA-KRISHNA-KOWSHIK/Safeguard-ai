from functools import wraps
from flask import jsonify
from flask_jwt_extended import get_jwt, verify_jwt_in_request


def api_response(data=None, message="", status="success", code=200):
    payload = {"status": status, "message": message}
    if status == "success":
        payload["data"] = data
    else:
        payload["error"] = message
        payload["code"] = code
    return jsonify(payload), code


def role_required(*allowed_roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            if claims.get("role") not in allowed_roles:
                return api_response(message="Unauthorized role", status="error", code=403)
            return fn(*args, **kwargs)
        return wrapper
    return decorator
