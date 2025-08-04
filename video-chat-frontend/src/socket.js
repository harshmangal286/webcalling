import { io } from 'socket.io-client';

// Use localhost for development, or the deployed URL for production
const SOCKET_URL = process.env.NODE_ENV === 'production' 
  ? 'https://webcalling-00u5.onrender.com/' 
  : 'http://localhost:5000';

const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
  timeout: 20000,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// Add connection event listeners
socket.on('connect', () => {
  console.log('Socket connected:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('Socket disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
});

export default socket;
