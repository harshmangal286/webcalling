import  { useState } from 'react';
import PropTypes from 'prop-types';
import '../styles/RoomJoin.css';

const RoomJoin = ({ onJoinRoom, onCreateRoom, joinPending, joinDenied, onRetry }) => {
    const [roomId, setRoomId] = useState('');
    const [username, setUsername] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        const finalUsername = username.trim() || `User_${Math.floor(Math.random() * 1000)}`;
        
        if (isCreating) {
            console.log('Creating room with username:', finalUsername);
            onCreateRoom(finalUsername);
        } else {
            const finalRoomId = roomId.trim();
            if (!finalRoomId) {
                alert('Please enter a Room ID to join');
                return;
            }
            console.log('Joining room:', { roomId: finalRoomId, username: finalUsername });
            onJoinRoom(finalRoomId, finalUsername);
        }
    };

    if (joinPending) {
        return (
            <div className="waiting-approval">
                <h2>Waiting for host approval...</h2>
                <p>Your request to join the room has been sent. Please wait for the host to approve.</p>
            </div>
        );
    }
    if (joinDenied) {
        return (
            <div className="join-denied">
                <h2>Join Request Denied</h2>
                <p>Your request to join the room was denied by the host.</p>
                <button onClick={onRetry}>Try Again</button>
            </div>
        );
    }

    return (
        <div className="room-join-container">
            <div className="room-join-card">
                <h2>{isCreating ? 'Create Room' : 'Join Room'}</h2>
                <form onSubmit={handleSubmit}>
                    {!isCreating && (
                        <div className="input-group">
                            <label htmlFor="room-id">Room ID</label>
                            <input
                                id="room-id"
                                type="text"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                                placeholder="Enter Room ID"
                                required={!isCreating}
                                disabled={joinPending}
                            />
                        </div>
                    )}
                    <div className="input-group">
                        <label htmlFor="username">Username (optional)</label>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter username"
                            disabled={joinPending}
                        />
                    </div>
                    <button type="submit" className="brutalist-button" disabled={joinPending}>
                        {isCreating ? 'Create Room' : 'Join Room'}
                    </button>
                </form>
                <button 
                    className="toggle-mode brutalist-button" 
                    onClick={() => setIsCreating(!isCreating)}
                    disabled={joinPending}
                >
                    {isCreating ? 'Join Existing Room' : 'Create New Room'}
                </button>
            </div>
        </div>
    );
};
RoomJoin.propTypes = {
    onJoinRoom: PropTypes.func.isRequired,
    onCreateRoom: PropTypes.func.isRequired,
    joinPending: PropTypes.bool,
    joinDenied: PropTypes.bool,
    onRetry: PropTypes.func,
};

export default RoomJoin; 
