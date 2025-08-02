import { io } from 'socket.io-client';

const socket = io('https://webcalling-00u5.onrender.com/', {
  transports: ['websocket'],
});

export default socket;
