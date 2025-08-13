import PropTypes from "prop-types";
import "../styles/ParticipantList.css";

const ParticipantList = ({ participants, activeParticipant, localUser, showParticipants }) => {
  const getInitials = (name, participantId, localUser) => {
    if (name) return name
      ?.split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
    if (participantId === localUser?.id) {
      return "Y"
    }
    return "UN"; // Fallback for unknown participants
  }
  const getFullName = (name, participantId, localUser) => {
    if (participantId === localUser?.id) {
      return `${localUser?.name || name || "You"} (You)`;
    }
    return name?.trim() || "Unknown User";
  };




  // Ensure local user is included in list
  const allParticipants = [
    ...(localUser ? [localUser] : []),
    ...participants.filter((p) => p.id !== localUser?.id),
  ];

  return (
    <div className={`participants-panel ${showParticipants ? "show" : ""}`}>
      <h3>Participants ({allParticipants.length})</h3>
      <div className="participants-list">
        {allParticipants.map((participant) => (
          <div
            key={participant.id}
            className={`participant-item ${participant.id === activeParticipant ? "active-speaker" : ""
              }`}
          >
            {/* Avatar and Name together */}
            <div className="participant-avatar-name">
              <div className="participant-avatar">
                <span className="initials">
                  {getInitials(participant.username)}
                </span>
              </div>
              <span className="full-name">
                {getFullName(participant.username, participant.id, localUser)}
                {participant.isHost && (
                  <span className="host-badge">Host</span>
                )}
              </span>
            </div>

            {/* Status icons */}
            <div className="participant-status">
              {participant.isAudioMuted && (
                <span className="status-indicator">
                  <span className="material-symbols-outlined">mic_off</span>
                </span>
              )}
              {participant.isVideoOff && (
                <span className="status-indicator">
                  <span className="material-symbols-outlined">videocam_off</span>
                </span>
              )}
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
