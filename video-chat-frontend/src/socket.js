import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
    withCredentials: true,
    transports: ['websocket'],
    secure:true
});

socket.on('connect_error', (err) => {
    console.error('Connection Error:', err);
});

export default socket;
