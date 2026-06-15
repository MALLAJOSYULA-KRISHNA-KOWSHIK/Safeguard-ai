from flask_socketio import join_room


def register_live_events(socketio):
    @socketio.on('subscribe_live', namespace='/live')
    def handle_subscribe(data):
        join_room('live_monitoring')

    @socketio.on('pause_monitoring', namespace='/live')
    def handle_pause():
        # This event could be used to stop emitting live frames for the client
        pass

    @socketio.on('join_supervisor_room', namespace='/live')
    def join_supervisor_room(data):
        supervisor_id = data.get('supervisor_id')
        if supervisor_id:
            join_room(f"supervisor_{supervisor_id}")
            print(f"Supervisor {supervisor_id} joined room supervisor_{supervisor_id}")

    @socketio.on('join_kiosk_room', namespace='/live')
    def join_kiosk_room(data):
        token = data.get('token')
        if token:
            join_room(f"kiosk_{token}")
            print(f"Kiosk joined room kiosk_{token}")
