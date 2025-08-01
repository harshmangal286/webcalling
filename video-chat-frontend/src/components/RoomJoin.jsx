import  { useState } from 'react';
import PropTypes from 'prop-types';
import '../styles/RoomJoin.css';

const RoomJoin = ({ onJoinRoom, onCreateRoom }) => {
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
        </div>
    );
};
RoomJoin.propTypes = {
    onJoinRoom: PropTypes.func.isRequired,
    onCreateRoom: PropTypes.func.isRequired,
    
};

export default RoomJoin; 
