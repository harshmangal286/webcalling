import PropTypes from "prop-types";
import "../styles/ConnectionStatus.css";
const ConnectionStatus = ({ status, roomId, isHost }) => {
  const statusColors = {
    Connected: "#4CAF50",
    Connecting: "#FFC107",
    disconnected: "#F44336",
    default: "#9E9E9E",
  };
  
  const getStatusColor = () => statusColors[status] || statusColors.default;

  const handleShareRoom = () => {
    navigator.clipboard.writeText(window.location.href);
    alert("Room link copied to clipboard!");
  };

  return (
    <div
      className="connection-status"
      style={{ borderLeft: `6px solid ${getStatusColor()}` }}
    >
      <div className="status-content">
        {/* Status Badge */}
        <span className="status-badge" style={{ backgroundColor: getStatusColor() }}>
          {status}
        </span>

        {/* Room Info */}
        {roomId && (
          <div className="room-info">
            <span className="room-id">Room: {roomId}</span>
            <span className="host-badge">{isHost ? "Host" : "Participant"}</span>
            <button className="share-button" onClick={handleShareRoom}>
              📋 Share
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

ConnectionStatus.propTypes = {
  status: PropTypes.string.isRequired,
  roomId: PropTypes.string,
  isHost: PropTypes.bool,
};

export default ConnectionStatus;
