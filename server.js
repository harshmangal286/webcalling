// Let everyone know when I turn my camera on/off
socket.on('videoStateChange', ({ roomId, isVideoOff }) => {
  socket.to(roomId).emit('videoStateChanged', {
    userId: socket.id,
    isVideoOff
  });
});

// Handle when someone wants to join my room
socket.on('joinRoom', ({ roomId, username }) => {
  // Add them to my room
  const user = {
    id: socket.id,
    username,
    isVideoOff: false
  };
  
  if (!rooms[roomId]) {
    rooms[roomId] = [];
  }
  rooms[roomId].push(user);
  
  // Put them in the socket room
  socket.join(roomId);
  
  // Tell others someone new joined
  socket.to(roomId).emit('userJoined', { user });
  
  // Let them know they're in
  socket.emit('roomJoined', {
    roomId,
    users: rooms[roomId],
    isHost: rooms[roomId].length === 1  // First person is the host
  });
}); 