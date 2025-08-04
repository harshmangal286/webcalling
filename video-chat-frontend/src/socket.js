import { io } from 'socket.io-client';

// Use localhost for development, or the deployed URL for production
const SOCKET_URL = process.env.NODE_ENV === 'production' 
  ? 'https://webcalling-00u5.onrender.com/' 
  : 'http://localhost:5000';

console.log('Connecting to socket server:', SOCKET_URL);

const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
  timeout: 20000,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  maxReconnectionAttempts: 10,
  forceNew: true
});

// Add connection event listeners
socket.on('connect', () => {
  console.log('✅ Socket connected successfully:', socket.id);
  console.log('Socket transport:', socket.io.engine.transport.name);
});

socket.on('disconnect', (reason) => {
  console.log('❌ Socket disconnected:', reason);
  if (reason === 'io server disconnect') {
    // the disconnection was initiated by the server, you need to reconnect manually
    console.log('Server initiated disconnect, attempting to reconnect...');
    socket.connect();
  }
});

socket.on('connect_error', (error) => {
  console.error('❌ Socket connection error:', error);
  console.error('Error details:', {
    message: error.message,
    type: error.type,
    description: error.description,
    context: error.context
  });
});

socket.on('reconnect', (attemptNumber) => {
  console.log('🔄 Socket reconnected after', attemptNumber, 'attempts');
});

socket.on('reconnect_attempt', (attemptNumber) => {
  console.log('🔄 Socket reconnection attempt:', attemptNumber);
});

socket.on('reconnect_error', (error) => {
  console.error('❌ Socket reconnection error:', error);
});

socket.on('reconnect_failed', () => {
  console.error('❌ Socket reconnection failed after all attempts');
});

export default socket;
