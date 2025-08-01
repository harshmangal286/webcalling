import PropTypes from "prop-types";
import "../styles/ParticipantList.css";

const ParticipantList = ({ participants, activeParticipant, localUser, showParticipants }) => {
  const getInitials = (name) =>
    name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <div className={`participants-panel ${showParticipants ? 'show' : ''}`}>
      <h3>Participants ({participants.length})</h3>
      <div className="participants-list">
        {participants.map((participant) => (
          <div
            key={participant.id}
            className={`participant-item ${
              participant.id === activeParticipant ? "active-speaker" : ""
            }`}
          >
            <div className="participant-avatar">
              {getInitials(participant.username)}
            </div>
            <div className="participant-info">
              <div className="participant-name">
                {participant.username}
                {participant.id === localUser?.id && " (You)"}
                {participant.isHost && <span className="host-badge">Host</span>}
              </div>
              <div className="participant-status">
                {participant.isAudioMuted && (
                  <span className="status-indicator">
                    <span className="material-symbols-outlined">mic_off</span>
                  </span>
                )}
                {participant.isVideoOff && (
                  <span className="status-indicator">
                    <span className="material-symbols-outlined">
                      videocam_off
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

ParticipantList.propTypes = {
  participants: PropTypes.array.isRequired,
  activeParticipant: PropTypes.string,
  localUser: PropTypes.object,
  showParticipants: PropTypes.bool,
};

export default ParticipantList;
