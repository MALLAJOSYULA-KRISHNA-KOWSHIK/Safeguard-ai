import threading
from extensions import db
from models.violation import Violation
from models.alert import Alert

ESCALATION_LEVELS = [
    {"level": 1, "channel": "dashboard", "delay_minutes": 0, "action": "socketio_emit"},
    {"level": 2, "channel": "sms", "delay_minutes": 2, "action": "twilio_sms"},
    {"level": 3, "channel": "whatsapp", "delay_minutes": 5, "action": "twilio_whatsapp"},
    {"level": 3, "channel": "email", "delay_minutes": 5, "action": "smtp_email"},
    {"level": 4, "channel": "pa_system", "delay_minutes": 10, "action": "mqtt_pa"},
    {"level": 5, "channel": "auto_call", "delay_minutes": 15, "action": "twilio_voice"},
    {"level": 6, "channel": "lockout", "delay_minutes": 20, "action": "machine_lockout"},
]


def dispatch_alert(violation: Violation, channel: str) -> None:
    # Placeholder for multi-channel alert integration.
    print(f"Dispatching alert for violation {violation.id} on {channel}")


def trigger_escalation(violation_id: int):
    def send_alert(level):
        violation = Violation.query.get(violation_id)
        if violation and violation.status == 'open':
            dispatch_alert(violation, level['channel'])
            alert = Alert(violation_id=violation_id, level=level['level'], channel=level['channel'])
            db.session.add(alert)
            db.session.commit()

    for level in ESCALATION_LEVELS:
        timer = threading.Timer(level['delay_minutes'] * 60, send_alert, args=(level,))
        timer.daemon = True
        timer.start()
