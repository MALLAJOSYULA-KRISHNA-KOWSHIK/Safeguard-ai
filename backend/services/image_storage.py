"""
Attendance image storage service.

Saves images to the local filesystem in organized date folders and returns
the relative path for storage in the database. No binary data is ever
written to Supabase — only the path string.

Directory layout:
    uploads/attendance/YYYY/MM/DD/attendance_YYYYMMDD_HHMMSS_{worker_id}.jpg
"""

import os
import base64
import uuid
from datetime import datetime
from werkzeug.utils import secure_filename

# ── configuration ────────────────────────────────────────────────────────
UPLOAD_ROOT = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads')
ATTENDANCE_SUBDIR = 'attendance'
WORKERS_SUBDIR = 'workers'
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png'}
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


def _ensure_dir(path: str) -> None:
    """Create directory tree if it does not exist."""
    os.makedirs(path, exist_ok=True)


def _validate_size(data_bytes: bytes) -> bool:
    """Return True if the decoded image is within the size limit."""
    return len(data_bytes) <= MAX_FILE_SIZE_BYTES


def _strip_data_uri(image_base64: str) -> str:
    """Remove the `data:image/...;base64,` prefix if present."""
    if ',' in image_base64:
        return image_base64.split(',', 1)[1]
    return image_base64


def save_attendance_image(image_base64: str, worker_id: str) -> str | None:
    """
    Decode a base-64 image string, write it to disk and return the
    **relative** path (relative to UPLOAD_ROOT) for DB storage.

    Returns None if the input is empty, too large, or decoding fails.
    """
    if not image_base64:
        return None

    try:
        raw_b64 = _strip_data_uri(image_base64)
        raw_b64 += "=" * ((4 - len(raw_b64) % 4) % 4)
        image_bytes = base64.b64decode(raw_b64)
    except Exception:
        return None

    if not _validate_size(image_bytes):
        return None

    now = datetime.utcnow()
    date_folder = os.path.join(
        ATTENDANCE_SUBDIR,
        now.strftime('%Y'),
        now.strftime('%m'),
        now.strftime('%d'),
    )
    abs_folder = os.path.join(UPLOAD_ROOT, date_folder)
    _ensure_dir(abs_folder)

    # Build a unique, secure filename
    safe_worker = secure_filename(worker_id) or 'unknown'
    timestamp = now.strftime('%Y%m%d_%H%M%S')
    short_uuid = uuid.uuid4().hex[:8]
    filename = f'attendance_{timestamp}_{safe_worker}_{short_uuid}.jpg'

    rel_path = os.path.join(date_folder, filename).replace('\\', '/')
    abs_path = os.path.join(UPLOAD_ROOT, rel_path)

    try:
        with open(abs_path, 'wb') as f:
            f.write(image_bytes)
    except OSError:
        return None

    return rel_path


def delete_attendance_image(rel_path: str) -> bool:
    """
    Delete an image file from disk given its relative path
    (the value stored in the attendance.image_path column).

    Returns True if the file was successfully removed or didn't exist.
    """
    if not rel_path:
        return True

    abs_path = os.path.join(UPLOAD_ROOT, rel_path)
    try:
        if os.path.isfile(abs_path):
            os.remove(abs_path)
        return True
    except OSError:
        return False

def save_worker_image_bytes(image_bytes: bytes, worker_id: str) -> str | None:
    """
    Save worker registration photo to disk and return relative path.
    Directory: uploads/workers/{worker_id}.jpg
    """
    if not image_bytes:
        print("DEBUG SAVE: no image_bytes")
        return None

    if not _validate_size(image_bytes):
        print("DEBUG SAVE: size validation failed")
        return None

    abs_folder = os.path.join(UPLOAD_ROOT, WORKERS_SUBDIR)
    _ensure_dir(abs_folder)

    safe_worker = secure_filename(worker_id) or 'unknown'
    short_uuid = uuid.uuid4().hex[:8]
    filename = f'{safe_worker}_{short_uuid}.jpg'

    rel_path = os.path.join(WORKERS_SUBDIR, filename).replace('\\', '/')
    abs_path = os.path.join(UPLOAD_ROOT, rel_path)

    try:
        with open(abs_path, 'wb') as f:
            f.write(image_bytes)
        print(f"DEBUG SAVE: saved to {abs_path}")
    except OSError as e:
        print(f"DEBUG SAVE: open failed: {e}")
        return None

    return rel_path
