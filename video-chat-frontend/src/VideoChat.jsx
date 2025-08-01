/* eslint-disable react-hooks/exhaustive-deps */
import { useRef, useState, useEffect, useCallback } from "react";
import socket from "./socket";
import RoomJoin from './components/RoomJoin';
import ConnectionStatus from './components/ConnectionStatus';
import ParticipantList from './components/ParticipantList';
import './styles/VideoChat.css';
import PropTypes from 'prop-types';


const VideoChat = () => {
  // My refs for video elements and connections
  const localVideoRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const localStreamRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);

  // States to manage my video chat
  const [localUserId, setLocalUserId] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  // const [isCallStarted, setIsCallStarted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  // Need these for room management
  const [roomId, setRoomId] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [isJoined, setIsJoined] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [error, setError] = useState(null);

  // Chat States
  const [chatMessages, setChatMessages] = useState([]);
  const [message, setMessage] = useState("");

  // Add this state
  const [videoError, setVideoError] = useState(false);

  // Add these new states with your existing states
  const [activeSpeaker, setActiveSpeaker] = useState(null);
  const [showParticipants, setShowParticipants] = useState(true);

  // First, add a new state to track remote video states
  const [remoteVideoStates, setRemoteVideoStates] = useState({});

  // Function to get my camera and mic
  // This function should ONLY return the stream or throw error
  const getUserMediaWithCheck = async () => {
    const hasPermission = await checkMediaPermissions();
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasCamera = devices.some(d => d.kind === 'videoinput');
    const hasMicrophone = devices.some(d => d.kind === 'audioinput');
    if (!hasPermission || !hasCamera || !hasMicrophone) {
      setError('Camera/microphone access denied.');
      setVideoError(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        return stream;
      }
    } catch (err) {
      console.error('getUserMedia error:', err);
      setError('Failed to access camera/microphone.');
    }

  };
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;

      localVideoRef.current.onloadedmetadata = () => {
        localVideoRef.current.play().catch((err) => {
          console.error("Playback error:", err);
        });
      };
    }
  }, [localStream]);



  const getUserMedia = useCallback(async (constraints = {
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: 'user',
    },
    audio: true
  }) => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }

      console.log("📹 Requesting local stream with constraints:", constraints);

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!stream) throw new Error("No stream received");

      console.log("📹 Local stream obtained:", stream);
      console.log("🎥 Video tracks:", stream.getVideoTracks());

      localStreamRef.current = stream;
      return stream;

    } catch (videoError) {
      console.warn("❌ Video error, falling back to audio-only", videoError);

      try {
        const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true
        });

        if (!audioOnlyStream) throw new Error("No audio stream received");

        localStreamRef.current = audioOnlyStream;
        setVideoError(true);
        setError("My camera isn't working, using audio only");
        return audioOnlyStream;

      } catch (audioError) {
        console.error("❌ Failed to get even audio-only stream:", audioError);
        setError("Media access failed completely.");
        return null;
      }
    }
  }, [localStreamRef, setError, setVideoError]);
  // dependencies


  useEffect(() => {
    const initLocalStream = async () => {
      try {
        const stream = await getUserMedia();


        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.onloadedmetadata = () => {
            localVideoRef.current.play().catch(err => {
              console.warn('📛 Local video play failed:', err);

            });
          };
        }
      } catch (err) {
        console.error("Failed to initialize local stream:", err);
        setVideoError(true);
        setError("My camera isn't working, using audio only");
      }
    };

    initLocalStream();
  }, [getUserMedia, localVideoRef, setVideoError, setError]);
  useEffect(() => {
    if (socket) {
      setLocalUserId(socket.id); // This ensures localUserId is correct
    }
  }, [socket]);

  // Setup connection with another user
  const createPeerConnection = useCallback((userId) => {
    try {
      console.log('Creating peer connection for:', userId);

      const configuration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      };

      const peerConnection = new RTCPeerConnection(configuration);

      // Improved track handling
      peerConnection.ontrack = (event) => {
        console.log("📹 ontrack fired from user:", userId, "Streams:", event.streams);

        if (!event.streams || !event.streams[0]) {
          console.warn("Received ontrack without stream");
          return;
        }

        const [newStream] = event.streams;
        const effectiveUserId = localStream || socket?.id || userId; // Ensure we have a valid userId
        console.log("📹 ontrack fired from user:", userId, "Effective userId:", effectiveUserId, "Streams:", event.streams);
        if (!newStream) {
          console.warn("No stream found in ontrack event");
          return;
        }

        event.streams[0].getAudioTracks().forEach((track) => {
          console.log(`[AUDIO] Incoming audio track:`, track);
          console.log(`[AUDIO] Enabled: ${track.enabled}, Muted: ${track.muted}, ReadyState: ${track.readyState}`);
        });
        if (userId === effectiveUserId) return;
        setRemoteStreams(prevStreams => {
          const exists = prevStreams.find(s => s.userId === userId);
          if (exists) {
            return prevStreams.map(s =>
              s.userId === userId ? { ...s, stream: newStream } : s
            );
          }
          return [...prevStreams, { userId, stream: newStream }];
        });

        // Set track.onended for cleanup
        newStream.getTracks().forEach(track => {
          track.onended = () => {
            console.log("Track ended:", track.kind);
          };
        });
      };

      const pendingCandidates = {}; // userId -> array of ICE candidates

      // Enhanced ICE handling
      socket.on('ice-candidate', async ({ from, candidate }) => {
        const pc = peerConnectionsRef.current[from];

        if (!pc) {
          console.warn('Peer connection not ready for ICE candidate from:', from);
          return;
        }

        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('Added ICE candidate from', from);
          } catch (err) {
            console.error('Error adding ICE candidate:', err);
          }
        } else {
          // Buffer the candidate until remote description is set
          if (!pendingCandidates[from]) pendingCandidates[from] = [];
          pendingCandidates[from].push(candidate);
          console.log('Buffered ICE candidate from', from);

        }
      });


      peerConnection.oniceconnectionstatechange = () => {
        console.log(`ICE connection state (${userId}):`, peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'failed') {
          console.log('ICE connection failed, attempting restart...');
          peerConnection.restartIce();
        }
      };

      peerConnection.onconnectionstatechange = () => {
        console.log(`Connection state (${userId}):`, peerConnection.connectionState);
        if (peerConnection.connectionState === 'failed') {
          handleConnectionFailure(userId);
        }
      };
      if (!peerConnectionsRef.current[userId]) {
        const pc = new RTCPeerConnection(configuration);

        // Attach ontrack handler here as needed...

        // ✅ Add local tracks
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (videoTrack) pc.addTrack(videoTrack, localStreamRef.current);
        if (audioTrack) pc.addTrack(audioTrack, localStreamRef.current);

        peerConnectionsRef.current[userId] = pc;
      } else {
        const pc = peerConnectionsRef.current[userId];
        const existingTracks = pc.getSenders().map(sender => sender.track);

        localStreamRef.current.getTracks().forEach(track => {
          const alreadyAdded = existingTracks.some(t => t?.kind === track.kind);
          if (!alreadyAdded) {
            console.log("Adding track:", track.kind);
            pc.addTrack(track, localStreamRef.current);
          } else {
            console.warn(`Track of kind ${track.kind} already added.`);



          }
        });
      }



      // Store the connection
      peerConnectionsRef.current[userId] = peerConnection;
      return peerConnection;
    } catch (error) {
      console.error('Error creating peer connection:', error);
      throw error;
    }
  }, [roomId]);

  // Add connection failure handler
  const handleConnectionFailure = useCallback((userId) => {
    console.log('Handling connection failure for:', userId);

    // Clean up failed connection
    if (peerConnectionsRef.current[userId]) {
      peerConnectionsRef.current[userId].close();
      delete peerConnectionsRef.current[userId];
    }

    // Remove failed streams
    setRemoteStreams(prev => prev.filter(s => s.userId !== userId));

    // Attempt reconnection
    setTimeout(() => {
      if (isHost) {
        console.log('Attempting reconnection...');
        initiateCall(userId);
      }
    }, 2000);
  }, [isHost]);

  // Add track ended handler
  // const handleTrackEnded = useCallback((userId, track) => {
  //   console.log(`Track ${track.kind} ended for user ${userId}`);
  //   if (track.kind === 'video') {
  //     setRemoteVideoStates(prev => ({ ...prev, [userId]: true }));
  //   }
  // }, []);

  // Handle room creation
  const createRoom = async (username) => {
    try {
      await getUserMedia();
      socket.emit('createRoom', { username });
    } catch (error) {
      setError(`Failed to create room: ${error.message}`);
    }
  };

  // Add this function to check permissions
  const checkMediaPermissions = async () => {
    try {
      const permissions = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      permissions.getTracks().forEach(track => track.stop()); // Clean up test stream
      return true;
    } catch (error) {
      console.error('Media permission error:', error);
      setError('Please allow camera and microphone access');
      return false;
    }
  };

  // Handle room joining
  const joinRoom = async (roomId, username) => {
    try {
      console.log('Attempting to join room:', { roomId, username }); // Debug log

      // Get media permissions first
      const stream = await getUserMedia();
      if (!stream) {
        console.error('Failed to get media stream');
        return;
      }
      console.log('Media stream obtained successfully');
      console.log("Video tracks:", stream.getVideoTracks());

      // Emit join room event
      socket.emit('joinRoom', { roomId, username });

      // Set connection status to connecting
      setConnectionStatus('connecting');
      getUserMediaWithCheck();

    } catch (error) {
      console.error('Join room error:', error);
      setError(`Failed to join room: ${error.message}`);
    }
  };

  // Initialize WebRTC call
  const initiateCall = useCallback(async (userId) => {
    try {
      console.log('Initiating call with:', userId);

      if (!localStreamRef.current) {
        console.log('Getting local stream before initiating call');
        localStreamRef.current = await getUserMedia();
      }

      const peerConnection = createPeerConnection(userId);

      // Add all tracks from local stream


      // Create and send offer
      console.log('Creating offer for:', userId);
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });

      console.log('Setting local description');
      await peerConnection.setLocalDescription(offer);

      console.log('Sending offer to:', userId);
      socket.emit('offer', {
        to: userId,
        offer,
        roomId
      });

    } catch (error) {
      console.error('Failed to initiate call:', error);
      handleConnectionFailure(userId);
    }
  }, [roomId, socket]);
  useEffect(() => {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      video.play().catch((err) => {
        console.warn('Autoplay blocked, will retry on interaction',err);
      });
    });

    const retry = () => {
      videos.forEach(video => video.play().catch(() => { }));
    };

    document.addEventListener('click', retry);
    return () => document.removeEventListener('click', retry);
  }, []);

  // Socket event handlers
  useEffect(() => {
    socket.on('roomCreated', ({ roomId }) => {
      if (!roomId) {
        console.error('No roomId received');
        return;
      }
      setRoomId(roomId);
      setIsHost(true);
      setConnectionStatus('connected');
      setIsJoined(true);
      clearChat();
      navigator.clipboard.writeText(roomId);
      alert(`Room created! Room ID: ${roomId} (copied to clipboard)`);
      console.log('Room created:', roomId);
      const roomLink = `${window.location.origin}/room/${roomId}`;
      console.log('Room link:', roomLink);
      window.history.pushState({}, '', roomLink);
      console.log('Room link updated in URL:', window.location.href);
      alert(`Room created! Room link: ${roomLink}`);
    });

    socket.on('roomJoined', ({ roomId, users, isHost }) => {
      console.log('Room joined event received:', { roomId, users, isHost });

      if (!roomId || !Array.isArray(users)) {
        console.error('Invalid room data received:', { roomId, users });
        return;
      }

      setRoomId(roomId);
      setIsHost(isHost);
      setParticipants(users.filter(user => user && user.id));
      setConnectionStatus('connected');
      setIsJoined(true);
      clearChat();

      // Initialize connections with existing users
      users.forEach(user => {
        if (user && user.id && user.id !== socket.id) {
          console.log('Initializing connection with existing user:', user.id);
          if (!peerConnectionsRef.current[user.id]) {
            initiateCall(user.id);
          }
        }
      });
    })[createPeerConnection, getUserMedia, setRemoteStreams, setRemoteVideoStates, setParticipants, setIsJoined, clearChat];
    const pendingCandidates = {}; // userId -> array of ICE candidates

    // ---- OFFER handler ----
    socket.on('offer', async ({ from, offer }) => {
      try {
        const peerConnection = createPeerConnection(from);

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        // Apply any stored ICE candidates
        if (pendingCandidates[from] && pendingCandidates[from].length > 0) {
          for (const cand of pendingCandidates[from]) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
          }
          delete pendingCandidates[from];
        }

        // Add local media tracks


        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        console.log('✅ Sending answer to:', from);
        socket.emit('answer', { to: from, answer });

      } catch (error) {
        console.error('❌ Error handling offer:', error);
      }
    });


    // ---- ANSWER handler ----
    // Do NOT add tracks again! Host already added them before sending the offer.
    socket.on('answer', async ({ from, answer }) => {
      const peerConnection = peerConnectionsRef.current[from];
      if (peerConnection) {
        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('✅ Answer received from:', from);
        } catch (err) {
          console.error('❌ Failed to set remote description:', err);
        }
      }
    });


    // ---- ICE Candidate handler ----
    socket.on('candidate', async ({ from, candidate }) => {
      const peerConnection = peerConnectionsRef.current[from];
      if (peerConnection) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('❌ Error adding ICE candidate:', err);
        }
      } else {
        // If peer connection is not yet ready, store the candidate
        pendingCandidates[from] = pendingCandidates[from] || [];
        pendingCandidates[from].push(candidate);
      }
    });


    // ---- CHAT handler ----
    socket.on('chatMessage', (messageData) => {
      if (!messageData || !messageData.userId) {
        console.error('Invalid message data:', messageData);
        return;
      }
      setChatMessages(prev => [...prev, messageData]);
    });


    // ---- USER LEFT handler ----
    socket.on('userLeft', (user) => {
      if (!user || !user.id) {
        console.error('Invalid user data for disconnect:', user);
        return;
      }
      handleUserDisconnected(user.id);
    });


    // ---- CALL ENDED handler ----
    socket.on('callEnded', () => {
      alert('Call has been ended by the host');
      leaveCall();
    });


    // ---- SOCKET ERROR handler ----
    socket.on('error', ({ message }) => {
      console.error('Socket error:', message);
      setError(message);
      setConnectionStatus('disconnected');
    });


    // ---- SPEAKING STATE handler ----
    socket.on('userSpeaking', ({ userId, speaking }) => {
      handleSpeakingStateChange(userId, speaking);
    });


    // ---- VIDEO STATE CHANGE handler ----
    socket.on('videoStateChanged', ({ userId, isVideoOff }) => {
      console.log('Remote video state changed:', userId, isVideoOff);
      setRemoteVideoStates(prev => ({
        ...prev,
        [userId]: isVideoOff
      }));
    });


    // ---- USER JOINED handler ----
    socket.on('userJoined', ({ user }) => {
      console.log('New user joined:', user);

      if (!user || !user.id) {
        console.error('Invalid user data received:', user);
        return;
      }

      // Add to participants
      setParticipants(prev => {
        const exists = prev.some(p => p.id === user.id);
        if (exists) return prev;
        return [...prev, user];
      });

      // Initialize video state
      setRemoteVideoStates(prev => ({
        ...prev,
        [user.id]: false
      }));

      // Host initiates the call
      if (isHost) {
        console.log('📞 Host initiating call with new user:', user.id);
        setTimeout(() => {
          initiateCall(user.id);
        }, 1500);
      }
    });



    return () => {
      socket.off('roomCreated');
      socket.off('roomJoined');
      socket.off('offer');
      socket.off('answer');
      socket.off('candidate');
      socket.off('chatMessage');
      socket.off('userLeft');
      socket.off('callEnded');
      socket.off('error');
      socket.off('userSpeaking');
      socket.off('videoStateChanged');
      socket.off('userJoined');
    };
  }, [isHost, initiateCall]);

  // Clean up when I leave or someone else leaves
  const handleUserDisconnected = (userId) => {
    if (!userId) {
      console.error('Invalid userId for disconnection');
      return;
    }

    cleanupPeerConnection(userId);

    setRemoteStreams(prev => prev.filter(streamInfo =>
      streamInfo && streamInfo.userId && streamInfo.userId !== userId
    ));

    setParticipants(prev => prev.filter(p =>
      p && p.id && p.id !== userId
    ));

    setRemoteVideoStates(prev => {
      if (!prev) return {};
      const newStates = { ...prev };
      delete newStates[userId];
      return newStates;
    });
  };

  // My controls for video/audio
  const toggleAudio = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsAudioMuted(!isAudioMuted);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);

      // Let others know I turned my camera off/on
      socket.emit('videoStateChange', {
        roomId,
        isVideoOff: !isVideoOff
      });
    }
  };

  // Let me share my screen
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  };

  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const videoTrack = screenStream.getVideoTracks()[0];

      Object.values(peerConnectionsRef.current).forEach(peerConnection => {
        const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });

      videoTrack.onended = stopScreenShare;
      setIsScreenSharing(true);
    } catch (error) {
      console.error("Error starting screen share:", error);
      setError("Failed to start screen sharing");
    }
  };

  const stopScreenShare = async () => {
    try {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      Object.values(peerConnectionsRef.current).forEach(peerConnection => {
        const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });
      setIsScreenSharing(false);
    } catch (error) {
      console.error("Error stopping screen share:", error);
    }
  };

  // Chat function
  const sendMessage = () => {
    if (message.trim() && roomId) {
      try {
        const messageToSend = message.trim();
        console.log('Sending message:', { roomId, message: messageToSend });
        socket.emit('chatMessage', {
          roomId,
          message: messageToSend
        });
        setMessage('');
      } catch (error) {
        console.error('Error sending message:', error);
        setError('Failed to send message');
      }
    }
  };

  // Add this function inside your VideoChat component
  const getVideoContainerClass = () => {
    const totalParticipants = remoteStreams.length + 1; // +1 for local stream
    if (totalParticipants === 1) return 'videos single';
    if (totalParticipants === 2) return 'videos pair';
    return 'videos multiple';
  };

  // Add these functions to your VideoChat component
  const leaveCall = async () => {
    console.log('Leaving call...');
    try {
      // Close and cleanup peer connections
      Object.entries(peerConnectionsRef.current).forEach(([userId, pc]) => {
        console.log(`Closing connection with ${userId}`);
        pc.close();
      });
      peerConnectionsRef.current = {};

      // Stop all local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log(`Stopped track: ${track.kind}`);
        });
      }

      const stream = localStreamRef.current;

      // Clear video elements
      if (localVideoRef.current && stream) {
        localVideoRef.current.srcObject = stream;
      }

      // Reset states
      setRemoteStreams([]);
      setIsJoined(false);
      clearChat();

      // Notify server
      socket.emit('leaveRoom', { roomId });
      console.log('Left room:', roomId);
    } catch (error) {
      console.error('Error during call cleanup:', error);
      setError('Failed to properly clean up call');
    }
  };

  const endCall = () => {
    if (isHost) {
      socket.emit('endCall', { roomId });
      leaveCall();
      clearChat();
    }
  };

  // Add clearChat function
  const clearChat = () => {
    setChatMessages([]);
  };

  // Add connection state logging
  useEffect(() => {
    const logConnectionState = () => {
      Object.entries(peerConnectionsRef.current).forEach(([userId, pc]) => {
        console.log(`Connection state with ${userId}:`, {
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          signalingState: pc.signalingState
        });
      });
    };

    const interval = setInterval(logConnectionState, 5000);
    return () => clearInterval(interval);
  }, []);

  // Add this useEffect to monitor video element and stream
  useEffect(() => {
    if (localVideoRef.current) {
      console.log('Local video element:', {
        srcObject: localVideoRef.current.srcObject,
        readyState: localVideoRef.current.readyState,
        videoWidth: localVideoRef.current.videoWidth,
        videoHeight: localVideoRef.current.videoHeight,
        paused: localVideoRef.current.paused
      });
    }

    if (localStreamRef.current) {
      console.log('Local stream:', {
        active: localStreamRef.current.active,
        tracks: localStreamRef.current.getTracks().map(track => ({
          kind: track.kind,
          enabled: track.enabled,
          muted: track.muted
        }))
      });
    }
  }, [localVideoRef.current?.srcObject]);

  // Add this useEffect to monitor video track status
  useEffect(() => {
    const checkVideoTrack = () => {
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          console.log('Video track status:', {
            enabled: videoTrack.enabled,
            muted: videoTrack.muted,
            readyState: videoTrack.readyState,
            constraints: videoTrack.getConstraints(),
            settings: videoTrack.getSettings()
          });
        } else {
          console.error('No video track found');
        }
      }
    };

    checkVideoTrack();
    const interval = setInterval(checkVideoTrack, 2000);
    return () => clearInterval(interval);
  }, []);

  // Add a retry button to the error container

  const ErrorContainer = ({ error, onRetry, onDismiss }) => (
    <div className="error-container">
      <h2>Error</h2>
      <p>{error}</p>
      <div className="error-buttons">
        <button onClick={onRetry}>Try Again</button>
        <button onClick={onDismiss}>Continue Without Camera</button>
      </div>
    </div>
  );

  ErrorContainer.propTypes = {
    error: PropTypes.string.isRequired,
    onRetry: PropTypes.func.isRequired,
    onDismiss: PropTypes.func.isRequired,
  };

  // Add this function to detect active speaker
  const handleSpeakingStateChange = useCallback((userId, speaking) => {
    if (speaking) {
      setActiveSpeaker(userId);
      // Reset active speaker after 2 seconds of silence
      setTimeout(() => {
        setActiveSpeaker(prev => prev === userId ? null : prev);
      }, 2000);
    }
  }, []);

  // Add this useEffect for audio analysis
  useEffect(() => {
    if (localStreamRef.current) {
      const audioContext = new AudioContext();
      const audioSource = audioContext.createMediaStreamSource(localStreamRef.current);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.minDecibels = -70;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.4;

      audioSource.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let speakingTimeout;

      const checkAudioLevel = () => {
        if (audioContext.state === 'closed') return;

        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

        if (average > 20) { // Adjust threshold as needed
          handleSpeakingStateChange(socket.id, true);
        }

        requestAnimationFrame(checkAudioLevel);
      };

      checkAudioLevel();

      return () => {
        audioContext.close();
        clearTimeout(speakingTimeout);
      };
    }
  }, [localStreamRef.current]);

  // Update ParticipantList rendering with null checks
  const renderParticipantList = () => {
    if (!Array.isArray(participants)) return null;

    return (
      <ParticipantList
        participants={participants.filter(p => p && p.id)} // Filter out invalid participants
        activeParticipant={activeSpeaker}
        localUser={socket?.id ? { id: socket.id, isHost } : null}
        showParticipants={showParticipants}
      />
    );
  };

  // Update video rendering with null checks
  const renderRemoteVideos = () => {
    console.log('Rendering remote streams:', remoteStreams);

    const userId = localUserId || socket?.id; // Ensure userId is defined
    return remoteStreams.map((streamInfo) => {
      if (!streamInfo || !streamInfo.userId || !streamInfo.stream) return null;

      const effectiveUserId = localUserId || socket?.id;
      if (userId === effectiveUserId) return; // ⛔ prevent adding self


      const participant = participants.find(p => p?.id === streamInfo.userId);
      const username = participant?.username || 'Participant';

      console.log("Rendering video for:", username);
      console.log("RemoteStreams:", remoteStreams);
      console.log("Socket ID:", socket?.id);
      console.log("LocalUserId:", localUserId);
      console.log("Participants:", participants);
      console.log("StreamInfo:", streamInfo);
      const videos = document.querySelectorAll("video");
      videos.forEach(v => console.log(v.srcObject, v.paused));



      return (
        <div key={streamInfo.userId} className="video-container">
          {remoteVideoStates[streamInfo.userId] ? (
            <div className="video-error">
              <span className="material-symbols-outlined">videocam_off</span>
              <p>Camera turned off</p>
            </div>
          ) : (
            <video
              key={`video-${streamInfo.userId}`}
              autoPlay
              playsInline
              muted={false}
              ref={(el) => {
                if (el && streamInfo.stream) {
                  el.srcObject = streamInfo.stream;
                  el.onloadedmetadata = () => {
                    console.log(`Video metadata loaded for ${streamInfo.userId}`);
                    el.play().catch(err => {
                      console.warn("Playback error:", err);
                      setVideoError(true);
                    });
                  };
                  setTimeout(() => {
                    if (document.body.contains(el)) {
                      el.play().catch(err => {
                        console.warn("Manual play failed on interaction:", err);
                      });
                    }
                  }, 50); // wait for DOM reflow if needed
                }
              }}

              className="video-item"
              style={{ transform: 'scaleX(-1)', border: '2px solid red', width: '320px', height: '240px' }}

            />
          )}
          <div className="participant-name">{username}</div>
        </div>
      );
    }).filter(Boolean);
  };


  // Add socket connection status check
  useEffect(() => {
    const checkSocketConnection = () => {
      if (!socket || !socket.connected) {
        console.error('Socket disconnected');
        setError('Connection lost. Please refresh the page.');
        setConnectionStatus('disconnected');
        socket.on('all-users', (users) => {
          const filtered = users.filter(user => user.id !== socket.id);
          setParticipants(filtered);
        });
      }
    };

    const interval = setInterval(checkSocketConnection, 5000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (localStreamRef.current && localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [localStream]);
  useEffect(() => {
    console.log("Remote streams updated:", remoteStreams);
  }, [remoteStreams]);


  // Add cleanup for streams when component unmounts
  useEffect(() => {
    return () => {
      // Stop all tracks in local stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }

      // Stop all remote streams
      remoteStreams.forEach(streamInfo => {
        if (streamInfo.stream) {
          streamInfo.stream.getTracks().forEach(track => track.stop());
        }
      });
    };
  }, []);
  useEffect(() => {
    const handleInteraction = () => {
      document.querySelectorAll('video').forEach(video => {
        if (video.paused) {
          video.play().catch(err =>
            console.warn('Manual play failed on interaction:', err)
          );
        }
      });
    };

    document.addEventListener('click', handleInteraction);
    document.addEventListener('touchstart', handleInteraction);

    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
    };
  }, []);


  // Add a useEffect to handle automatic video playing
  useEffect(() => {
    const handleUserInteraction = () => {
      const videos = document.querySelectorAll('video');
      videos.forEach(video => {
        if (video.paused) {
          video.play().catch(err => {
            console.warn('Play after user interaction failed:', err);
          });
        }
      });
    };

    // Add event listeners for user interaction
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('touchstart', handleUserInteraction);

    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };
  }, []);

  // Update cleanup function
  const cleanupPeerConnection = (userId) => {
    console.log('Cleaning up peer connection for:', userId);

    const peerConnection = peerConnectionsRef.current[userId];
    if (peerConnection) {
      // Remove all tracks
      peerConnection.getSenders().forEach(sender => {
        if (sender.track) {
          sender.track.stop();
        }
      });

      // Close the connection
      peerConnection.close();
      delete peerConnectionsRef.current[userId];

      // Remove from remote streams
      setRemoteStreams(prev => prev.filter(s => s.userId !== userId));

      // Reset video state
      setRemoteVideoStates(prev => {
        const newStates = { ...prev };
        delete newStates[userId];
        return newStates;
      });
    }
  };

  // Render functions
  if (error) {
    return (
      <ErrorContainer
        error={error}
        onRetry={async () => {
          setError(null);
          setVideoError(false);
          try {
            await getUserMedia();
          } catch (error) {
            // Error will be handled by getUserMedia
            console.error('Retry failed:', error);
            setError('Failed to access camera or microphone. Please try again.');
          }
        }}
        onDismiss={() => {
          setError(null);
          setVideoError(true);
        }}
      />
    );
  }

  if (!isJoined) {
    return <RoomJoin onJoinRoom={joinRoom} onCreateRoom={createRoom} />;
  }
  const renderLocalVideo = () => {
    if (videoError) return <div className="video-error">Camera not available</div>;
    if (isVideoOff) return <div className="video-error">Camera turned off</div>;
    return (
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className="video-item local"
        style={{ transform: 'scaleX(-1)', objectFit: 'cover' }}
        onLoadedMetadata={(e) => {
          console.log('Video metadata loaded');
          e.target.play().catch(err => {
            console.error('Play failed:', err);
            setVideoError(true);
          });
        }}
        onError={(e) => {
          console.error('Video error:', e);
          setVideoError(true);
        }}
      />
    );
  };

  return (
    <div className="container">
      {showParticipants && renderParticipantList()}
      <ConnectionStatus
        status={connectionStatus}
        roomId={roomId}
        isHost={isHost}
        mediaStatus={localStreamRef.current ? 'connected' : 'disconnected'}
      />
      <div className="video-wrapper">
        <div className={getVideoContainerClass()}>
          {/* Local Video */}
          {videoError ? (
            <div className="video-error">
              <span className="material-symbols-outlined">error</span>
              <p>Camera not available</p>
            </div>
          ) : isVideoOff ? (
            <div className="video-error local">
              <span className="material-symbols-outlined">videocam_off</span>
              <p>Camera turned off</p>
            </div>
          ) : (renderLocalVideo()

          )}

          {/* Remote Videos */}
          {renderRemoteVideos()}
        </div>
        <div className="controls">
          <button onClick={toggleAudio}>
            {isAudioMuted ? (
              <span className="material-symbols-outlined">mic_off</span>
            ) : (
              <span className="material-symbols-outlined">mic</span>
            )}
          </button>
          <button onClick={toggleVideo}>
            {isVideoOff ? (
              <span className="material-symbols-outlined">videocam_off</span>
            ) : (
              <span className="material-symbols-outlined">videocam</span>
            )}
          </button>
          <button onClick={toggleScreenShare}>
            {isScreenSharing ? (
              <span className="material-symbols-outlined">stop_screen_share</span>
            ) : (
              <span className="material-symbols-outlined">screen_share</span>
            )}
          </button>
          <div className="control-separator"></div>
          {isHost ? (
            <button onClick={endCall} className="end-call">
              <span className="material-symbols-outlined">call_end</span>
            </button>
          ) : (
            <button onClick={leaveCall} className="leave-call">
              <span className="material-symbols-outlined">logout</span>
            </button>
          )}
          <button
            onClick={() => setShowParticipants(!showParticipants)}
            className="participant-toggle"
          >
            <span className="material-symbols-outlined">
              {showParticipants ? 'person_off' : 'people'}
            </span>
          </button>
        </div>
      </div>
      <div className="message-wrapper">
        <h3>Chat</h3>
        <div className="message-box">
          {chatMessages.map((msg, index) => (
            <div
              key={index}
              className={`message ${msg.userId === socket.id ? 'self' : 'other'}`}
            >
              <span className="username">
                {msg.userId === socket.id ? 'You' : msg.username}
                {msg.isHost && ' (Host)'}
              </span>
              <p>{msg.text}</p>
              <span className="timestamp">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
        <div className="message-input">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type your message..."
          />
          <button onClick={sendMessage}>Send</button>
        </div>
      </div>
    </div>
  );
}

export default VideoChat;