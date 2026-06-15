import os
import uuid
from supabase import create_client

supabase = create_client(os.environ.get('SUPABASE_URL'), os.environ.get('SUPABASE_KEY'))
BUCKET = os.environ.get('SUPABASE_STORAGE_BUCKET', 'screenshots')


def upload_violation_frame(frame_bytes: bytes, camera_id: str) -> str:
    filename = f"violations/{camera_id}/{uuid.uuid4()}.jpg"
    supabase.storage.from_(BUCKET).upload(filename, frame_bytes, {'content-type': 'image/jpeg'})
    return supabase.storage.from_(BUCKET).get_public_url(filename)['public_url']


def upload_report_pdf(pdf_bytes: bytes, report_type: str) -> str:
    filename = f"reports/{report_type}/{uuid.uuid4()}.pdf"
    supabase.storage.from_(BUCKET).upload(filename, pdf_bytes, {'content-type': 'application/pdf'})
    return supabase.storage.from_(BUCKET).get_public_url(filename)['public_url']
