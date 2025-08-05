const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
app.use(cors());

const io = socketIO(server, {
    cors: {
        origin: [
            "http://localhost:5173",
            "http://localhost:3000",
            "https://webcall1.netlify.app",
            "https://webcall.netlify.app"
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

const rooms = new Map(); // Track rooms and their participants
const users = new Map(); // Track user details
const roomMessages = new Map();

io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    // Create or join a room
    socket.on('createRoom', ({ username }) => {
        if (!socket.id || !username) {
            socket.emit('error', { message: 'Invalid socket connection or username' });
            return;
        }

        const roomId = generateRoomId();
        joinRoom(socket, { roomId, username, isHost: true });
        socket.emit('roomCreated', { 
            roomId,
            user: {
                id: socket.id,
                username,
                isHost: true
            }
        });
    });

    // Join existing room
    socket.on('joinRoom', ({ roomId, username }) => {
        console.log(`Join room attempt - Room: ${roomId}, User: ${username}, SocketId: ${socket.id}`);
        
        if (!socket.id || !roomId || !username) {
            console.error('Missing required data:', { socketId: socket.id, roomId, username });
            socket.emit('error', { message: 'Invalid connection data' });
            return;
        }

        if (!rooms.has(roomId)) {
            console.error(`Room not found: ${roomId}`);
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        try {
            // Join the room
            joinRoom(socket, { roomId, username, isHost: false });
            console.log(`User ${username} (${socket.id}) joined room ${roomId} successfully`);
        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    // Handle WebRTC signaling
    socket.on('offer', ({ to, offer, roomId }) => {
        if (!socket.id || !to || !offer || !roomId) {
            console.error('Invalid offer data');
            return;
        }

        const user = users.get(socket.id);
        if (user && rooms.get(roomId)?.has(to)) {
            socket.to(to).emit('offer', {
                from: socket.id,
                offer,
                user: {
                    id: socket.id,
                    username: user.username,
                    isHost: user.isHost
                }
            });
        }
    });

    socket.on('answer', ({ to, answer, roomId }) => {
        if (!socket.id || !to || !answer || !roomId) {
            console.error('Invalid answer data');
            return;
        }

        const user = users.get(socket.id);
        if (user && rooms.get(roomId)?.has(to)) {
            socket.to(to).emit('answer', {
                from: socket.id,
                answer,
                user: {
                    id: socket.id,
                    username: user.username,
                    isHost: user.isHost
                }
            });
        }
    });

    socket.on('candidate', ({ to, candidate, roomId }) => {
        if (!socket.id || !to || !candidate || !roomId) {
            console.error('Invalid candidate data');
            return;
        }

        if (rooms.get(roomId)?.has(to)) {
            socket.to(to).emit('candidate', {
                from: socket.id,
                candidate
            });
        }
    });

    // Handle chat messages
    socket.on('chatMessage', ({ roomId, message }) => {
        const user = users.get(socket.id);
        if (user && rooms.has(roomId)) {
            const messageData = {
                userId: socket.id,
                username: user.username,
                text: message,
                timestamp: new Date().toISOString(),
                isHost: user.isHost
            };
            
            // Store message in room messages
            if (!roomMessages.has(roomId)) {
                roomMessages.set(roomId, []);
            }
            roomMessages.get(roomId).push(messageData);
            
            // Broadcast to everyone in the room
            io.to(roomId).emit('chatMessage', messageData);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        handleDisconnect(socket);
    });

    // Add these event handlers in your socket.io connection handler
    socket.on('leaveRoom', ({ roomId }) => {
        handleDisconnect(socket);
    });

    socket.on('endCall', ({ roomId }) => {
        const user = users.get(socket.id);
        if (user && user.isHost) {
            io.to(roomId).emit('callEnded');
            // Clean up the room
            if (rooms.has(roomId)) {
                rooms.delete(roomId);
                // Clear room messages
                if (roomMessages.has(roomId)) {
                    roomMessages.delete(roomId);
                }
            }
        }
    });

    // Add this to your existing socket.on('connection') handler
    socket.on('speaking', ({ roomId, speaking }) => {
        socket.to(roomId).emit('userSpeaking', {
            userId: socket.id,
            speaking
        });
    });

    // Handle video state changes
    socket.on('videoStateChange', ({ roomId, isVideoOff }) => {
        const user = users.get(socket.id);
        if (user && rooms.has(roomId)) {
            socket.to(roomId).emit('videoStateChanged', {
                userId: socket.id,
                isVideoOff
            });
        }
    });
});

// Helper functions
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function joinRoom(socket, { roomId, username, isHost }) {
    if (!socket.id || !roomId || !username) {
        throw new Error('Missing required connection data');
    }

    console.log('Joining room:', { socketId: socket.id, roomId, username, isHost });

    // Create room if it doesn't exist
    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
    }

    // Add user to room
    rooms.get(roomId).add(socket.id);
    socket.join(roomId);

    // Store user details
    const userData = {
        id: socket.id,
        username,
        roomId,
        isHost
    };
    users.set(socket.id, userData);

    // Get all users in the room (including the current user)
    const allUsersInRoom = Array.from(rooms.get(roomId))
        .map(id => users.get(id))
        .filter(user => user && user.id);

    console.log('All users in room:', allUsersInRoom);

    // Send room info to the new user
    socket.emit('roomJoined', {
        roomId,
        users: allUsersInRoom,
        isHost,
        user: userData
    });

    // Notify others in the room about the new user
    socket.to(roomId).emit('userJoined', {
        user: userData
    });

    // Also send updated participant list to all users in the room
    io.to(roomId).emit('participantsUpdated', {
        users: allUsersInRoom
    });
}

function handleDisconnect(socket) {
    const user = users.get(socket.id);
    if (user) {
        const { roomId } = user;
        
        // Remove user from room
        if (rooms.has(roomId)) {
            rooms.get(roomId).delete(socket.id);
            if (rooms.get(roomId).size === 0) {
                rooms.delete(roomId);
            }
        }

        // Remove user from users map
        users.delete(socket.id);

        // Notify others in the room
        socket.to(roomId).emit('userLeft', {
            id: socket.id,
            username: user.username,
            isHost: user.isHost
        });

        // Send updated participant list to remaining users
        if (rooms.has(roomId) && rooms.get(roomId).size > 0) {
            const remainingUsers = Array.from(rooms.get(roomId))
                .map(id => users.get(id))
                .filter(user => user && user.id);
            
            socket.to(roomId).emit('participantsUpdated', {
                users: remainingUsers
            });
        }
    }
}

server.listen(5000, () => console.log('Server running on port 5000'));
