import { io, Socket } from 'socket.io-client';
import useAuthStore from '../store/authStore';

let socket: Socket | null = null;

export const getSocket = () => {
  if (!socket) {
    socket = io('http://localhost:8000/live', {
      auth: {
        token: useAuthStore.getState().accessToken,
      },
      transports: ['websocket'],
    });
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
