import { useState } from 'react';
import PropTypes from 'prop-types';
import '../styles/RoomJoin.css';

const RoomJoin = ({
  onJoinRoom,
  onCreateRoom,

  pendingRequests = [], // array of {id, username}
  onApproveJoin,
  onDenyJoin,
}) => {
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleUsernameChange = (e) => {
    let value = e.target.value.replace(/\s+/g, '');
    if (value.length > 15) value = value.slice(0, 15);
    setUsername(value);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalUsername = username.trim();
    if (!finalUsername) return alert('Username is required');

    if (isCreating) {
      onCreateRoom(finalUsername);
    } else {
      const finalRoomId = roomId.trim();
      if (!finalRoomId) return alert('Please enter a Room ID to join');
      onJoinRoom(finalRoomId, finalUsername);
    }
  };

  return (
    <div className="room-join-container">
      <div className="room-join-card">
        <h2>{isCreating ? 'Create Room' : 'Join Room'}</h2>
        <form onSubmit={handleSubmit} className="join-form">
          {!isCreating && (
            <div className="input-group">
              <label htmlFor="room-id">Room ID</label>
              <input
                id="room-id"
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter Room ID"
              />
            </div>
          )}
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={handleUsernameChange}
              placeholder="Max 15 chars, no spaces"
            />
          </div>
          <button type="submit" className="brutalist-button">
            {isCreating ? 'Create Room' : 'Join Room'}
          </button>
        </form>
        <button
          className="toggle-mode brutalist-button"
          onClick={() => setIsCreating(!isCreating)}
        >
          {isCreating ? 'Join Existing Room' : 'Create New Room'}
        </button>
      </div>

      {/* Host Approval Stack on Left Side */}
      {pendingRequests.length > 0 && (
        <div className="approval-stack-overlay">
          {pendingRequests.map((req) => (
            <div key={req.id} className="approval-card">
              <h3>{req.username} wants to join</h3>
              <div className="approval-buttons">
                <button
                  className="approve-button"
                  onClick={() => onApproveJoin(req.id)}
                >
                  Approve
                </button>
                <button
                  className="deny-button"
                  onClick={() => onDenyJoin(req.id)}
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

RoomJoin.propTypes = {
  onJoinRoom: PropTypes.func.isRequired,
  onCreateRoom: PropTypes.func.isRequired,
  joinPending: PropTypes.bool,
  joinDenied: PropTypes.bool,
  onRetry: PropTypes.func,
  pendingRequests: PropTypes.array,
  onApproveJoin: PropTypes.func,
  onDenyJoin: PropTypes.func,
};

export default RoomJoin;
