import { io } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling']
});

export const connectToSocket = (userId: string) => {
  if (!socket.connected) {
    socket.connect();
    
    socket.on('connect', () => {
      console.log('Connected to Socket.IO server');
      socket.emit('identify', userId);
    });

    socket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
    });
  }
};

export const disconnectFromSocket = () => {
  if (socket.connected) {
    socket.disconnect();
  }
};

export const joinRoom = (roomId: string) => {
  if (socket.connected) {
    socket.emit('join-room', roomId);
  } else {
    console.error('Socket not connected. Cannot join room.');
  }
};

export const leaveRoom = (roomId: string) => {
  if (socket.connected) {
    socket.emit('leave-room', roomId);
  } else {
    console.error('Socket not connected. Cannot leave room.');
  }
};

export const sendMessage = (roomId: string, message: string, userId: string) => {
  if (socket.connected) {
    socket.emit('send-message', { roomId, message, userId });
  } else {
    console.error('Socket not connected. Cannot send message.');
  }
};