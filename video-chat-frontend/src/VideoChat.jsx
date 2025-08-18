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
  const [setShowPlaceholder] = useState(false); // ✅ define state

  // States to manage my video chat
  const [localUserId, setLocalUserId] = useState(null);
  const [localUserName, setLocalUserName] = useState("");
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

  // Add state for join request/approval
  const [joinPending, setJoinPending] = useState(false);
  const [joinDenied, setJoinDenied] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]); // For host

  // Add this state
  const [localVideoKey] = useState(0);

  // Function to get my camera and mic
  // This function should ONLY return the stream or throw error
  const getUserMediaWithCheck = async () => {
    console.log("🟢 getUserMediaWithCheck() called");
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.log('✅ Local stream assigned to video element');
        return stream;
      }
    } catch (err) {
      console.error('getUserMedia error:', err);
      setError('Failed to access camera/microphone.');
    }

  };
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log("Setting local stream to video element");
      localVideoRef.current.srcObject = localStream;

      localVideoRef.current.onloadedmetadata = () => {
        console.log("Local video metadata loaded from state");
        localVideoRef.current.play().catch((err) => {
          console.error("Local video playback error:", err);
        });
      };
    }
  }, [localStream]);
  if (!localStreamRef.current) {
    console.warn("⛔ renderLocalVideo: localStreamRef.current is NULL");
  }




  const getUserMedia = useCallback(async (constraints = {
    video: true,
    audio: true
  }) => {
    // If we already have an active stream, return it
    if (localStreamRef.current && localStreamRef.current.active) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      const audioTrack = localStreamRef.current.getAudioTracks()[0];

      // Check if tracks are still live
      if (videoTrack && videoTrack.readyState === 'live' && audioTrack && audioTrack.readyState === 'live') {
        console.log("Returning existing active local stream");
        return localStreamRef.current;
      } else {
        console.log("Existing stream has ended tracks, getting new stream");
        // Stop the old stream
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
    }

    try {
      console.log("Requesting local stream with constraints:", constraints);

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!stream) throw new Error("No stream received");

      console.log("Local stream obtained:", stream);
      console.log("Video tracks:", stream.getVideoTracks());

      localStreamRef.current = stream;
      setLocalStream(stream); // Also update the state
      setVideoError(false); // Reset video error when we get a new stream
      return stream;

    } catch (videoError) {
      console.warn("Video error, falling back to audio-only", videoError);

      try {
        const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true
        });

        if (!audioOnlyStream) throw new Error("No audio stream received");

        localStreamRef.current = audioOnlyStream;
        setLocalStream(audioOnlyStream); // Also update the state
        setVideoError(true);
        setError("My camera isn't working, using audio only");
        return audioOnlyStream;

      } catch (audioError) {
        console.error("Failed to get even audio-only stream:", audioError);
        setError("Media access failed completely.");
        return null;
      }
    }
  }, [setError, setVideoError]);
  // dependencies


  // Single useEffect to initialize local stream and socket
  useEffect(() => {
    const initializeLocalStream = async () => {
      try {
        // Only initialize if we don't already have a stream
        if (!localStreamRef.current) {
          console.log('Initializing local stream on component mount');
          const stream = await getUserMedia();
          if (stream && localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
            console.log('Local stream set to video element');
          }
        } else {
          // If we already have a stream, make sure it's set to the video element
          if (localVideoRef.current && !localVideoRef.current.srcObject) {
            localVideoRef.current.srcObject = localStreamRef.current;
            console.log('Existing local stream set to video element');
          }
        }
      } catch (error) {
        console.error('Failed to initialize stream on mount:', error);
      }
    };

    // Set local user ID when socket is available
    if (socket) {
      setLocalUserId(socket.id);
    }

    // Initialize stream
    initializeLocalStream();
  }, [socket, getUserMedia]);
  useEffect(() => {
    console.log("🟢 useEffect: Calling getUserMediaWithCheck()");
    getUserMediaWithCheck();
  }, []);
  // Inside useEffect in your main room component
  useEffect(() => {
    socket.on("connect", () => {
      setLocalUserId(socket.id); // store my ID in state
    });

    return () => {
      socket.off("connect");
    };
  }, []);




  // // Setup connection with another user
  // const createPeerConnection = useCallback((userId) => {
  //   try {
  //     console.log('Creating peer connection for:', userId);

  //     const configuration = {
  //       iceServers: [
  //         { urls: 'stun:stun.l.google.com:19302' },
  //         { urls: 'stun:openrelay.metered.ca:80' },
  //         {
  //           urls: 'turn:openrelay.metered.ca:80',
  //           username: 'openrelayproject',
  //           credential: 'openrelayproject',
  //         },
  //       ],
  //       iceCandidatePoolSize: 10
  //     };

  //     const peerConnection = new RTCPeerConnection(configuration);

  //     // Add connection state logging
  //     peerConnection.onsignalingstatechange = () => {
  //       console.log(`Signaling state (${userId}):`, peerConnection.signalingState);
  //     };

  //     // Improved track handling
  //     peerConnection.ontrack = (event) => {
  //       console.log("[ontrack] fired from user:", userId, "Streams:", event.streams);
  //       console.log("ontrack event details:", {
  //         track: event.track,
  //         streams: event.streams,
  //         trackKind: event.track?.kind,
  //         trackEnabled: event.track?.enabled,
  //         trackReadyState: event.track?.readyState
  //       });

  //       if (!event.streams || !event.streams[0]) {
  //         console.warn("Received ontrack without stream");
  //         return;
  //       }

  //       const [newStream] = event.streams;
  //       if (!newStream) {
  //         console.warn("No stream found in ontrack event");
  //         return;
  //       }

  //       // Don't add our own stream as remote
  //       if (userId === (localUserId || socket?.id)) {
  //         console.log("Ignoring own stream in ontrack");
  //         return;
  //       }

  //       // Log stream details
  //       const tracks = newStream.getTracks();
  //       console.log(`Stream received from ${userId}:`, {
  //         trackCount: tracks.length,
  //         tracks: tracks.map(t => ({
  //           kind: t.kind,
  //           enabled: t.enabled,
  //           readyState: t.readyState,
  //           id: t.id
  //         }))
  //       });

  //       setRemoteStreams(prevStreams => {
  //         const exists = prevStreams.find(s => s.userId === userId);
  //         const updatedStreams = exists
  //           ? prevStreams.map(s => s.userId === userId ? { ...s, stream: newStream } : s)
  //           : [...prevStreams, { userId, stream: newStream }];
  //         console.log('[ontrack] remoteStreams after update:', updatedStreams);
  //         return updatedStreams;
  //       });

  //       // Set track.onended for cleanup and ensure tracks are enabled
  //       newStream.getTracks().forEach(track => {
  //         // Ensure track is enabled
  //         if (!track.enabled && track.readyState === 'live') {
  //           console.log(`Enabling ${track.kind} track for user ${userId}`);
  //           track.enabled = true;
  //         }

  //         track.onended = () => {
  //           console.log("Track ended:", track.kind, "for user:", userId);
  //         };
  //         track.onmute = () => {
  //           console.log("Track muted:", track.kind, "for user:", userId);
  //         };
  //         track.onunmute = () => {
  //           console.log("Track unmuted:", track.kind, "for user:", userId);
  //         };

  //         // Handle track replacement events
  //         track.onended = () => {
  //           console.log("Track ended:", track.kind, "for user:", userId);
  //           // Force refresh remote streams when track ends
  //           setRemoteStreams(prev => prev.map(s =>
  //             s.userId === userId ? { ...s, stream: newStream } : s
  //           ));
  //         };
  //       });
  //     };

  //     peerConnection.oniceconnectionstatechange = () => {
  //       console.log(`ICE connection state (${userId}):`, peerConnection.iceConnectionState);
  //       if (peerConnection.iceConnectionState === 'failed') {
  //         console.log('ICE connection failed, attempting restart...');
  //         peerConnection.restartIce();
  //       } else if (peerConnection.iceConnectionState === 'connected' || peerConnection.iceConnectionState === 'completed') {
  //         console.log(`ICE connection established with ${userId}`);
  //       } else if (peerConnection.iceConnectionState === 'checking') {
  //         console.log(`ICE connection checking with ${userId}`);
  //       }
  //     };

  //     peerConnection.onconnectionstatechange = () => {
  //       console.log(`Connection state (${userId}):`, peerConnection.connectionState);
  //       if (peerConnection.connectionState === 'failed') {
  //         // Handle connection failure inline to avoid circular dependency
  //         console.log('Handling connection failure for:', userId);

  //         // Clean up failed connection
  //         if (peerConnectionsRef.current[userId]) {
  //           peerConnectionsRef.current[userId].close();
  //           delete peerConnectionsRef.current[userId];
  //         }

  //         // Remove failed streams
  //         setRemoteStreams(prev => prev.filter(s => s.userId !== userId));
  //       } else if (peerConnection.connectionState === 'connected') {
  //         console.log(`Connection established with ${userId}`);
  //       } else if (peerConnection.connectionState === 'connecting') {
  //         console.log(`Connection connecting with ${userId}`);
  //       }
  //     };

  //     // Handle ICE candidate generation
  //     peerConnection.onicecandidate = (event) => {
  //       if (event.candidate && roomId) {
  //         console.log('Sending ICE candidate to:', userId);
  //         console.log("❄️ ICE Candidate:", event.candidate);
  //         socket.emit('candidate', {
  //           to: userId,
  //           candidate: event.candidate,
  //           roomId
  //         });
  //       }
  //     };

  //     // Add local tracks to the peer connection
  //     if (localStreamRef.current) {
  //       const videoTrack = localStreamRef.current.getVideoTracks()[0];
  //       const audioTrack = localStreamRef.current.getAudioTracks()[0];

  //       console.log('Local stream details:', {
  //         hasVideoTrack: !!videoTrack,
  //         hasAudioTrack: !!audioTrack,
  //         videoTrackEnabled: videoTrack?.enabled,
  //         audioTrackEnabled: audioTrack?.enabled,
  //         videoTrackReadyState: videoTrack?.readyState,
  //         audioTrackReadyState: audioTrack?.readyState
  //       });

  //       if (videoTrack) {
  //         // Ensure video track is enabled
  //         if (!videoTrack.enabled) {
  //           console.log('Enabling video track before adding to peer connection');
  //           videoTrack.enabled = true;
  //         }
  //         console.log('Adding video track to peer connection');
  //         const sender = peerConnection.addTrack(videoTrack, localStreamRef.current);
  //         console.log('Video track sender:', sender);
  //       }
  //       if (audioTrack) {
  //         // Ensure audio track is enabled
  //         if (!audioTrack.enabled) {
  //           console.log('Enabling audio track before adding to peer connection');
  //           audioTrack.enabled = true;
  //         }
  //         console.log('Adding audio track to peer connection');
  //         const sender = peerConnection.addTrack(audioTrack, localStreamRef.current);
  //         console.log('Audio track sender:', sender);
  //       }
  //     } else {
  //       console.warn('No local stream available for peer connection');
  //     }

  //     // Store the connection
  //     peerConnectionsRef.current[userId] = peerConnection;

  //     // Add timeout to restart ICE if connection doesn't establish
  //     setTimeout(() => {
  //       if (peerConnection.iceConnectionState === 'new' || peerConnection.iceConnectionState === 'checking') {
  //         console.log(`ICE connection timeout for ${userId}, restarting ICE...`);
  //         peerConnection.restartIce();
  //       }
  //     }, 10000); // 10 second timeout

  //     return peerConnection;
  //   } catch (error) {
  //     console.error('Error creating peer connection:', error);
  //     throw error;
  //   }
  // }, [roomId, localUserId, socket]);
  const createPeerConnection = useCallback((userId) => {
    try {
      console.log(`Creating peer connection for user: ${userId}`);
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:openrelay.metered.ca:80' },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject',
          },
        ],
        iceCandidatePoolSize: 10
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('candidate', {
            to: userId,
            candidate: event.candidate,
            roomId,
          });
        }
      };

      pc.ontrack = (event) => {
        console.log(`Track received from ${userId}`);

        setRemoteStreams((prev) => {
          const existing = prev.find(s => s.userId === userId);
          if (existing) {
            // 🔄 Update the existing stream
            return prev.map(s =>
              s.userId === userId ? { ...s, stream: event.streams[0] } : s
            );
          } else {
            // ➕ Add new stream
            return [...prev, { userId, stream: event.streams[0] }];
          }
        });
      };



      // Add local tracks if the stream is ready
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      peerConnectionsRef.current[userId] = pc;
      return pc;

    } catch (error) {
      console.error('Error creating peer connection:', error);
    }
  }, [roomId, socket]);

  // Helper function to apply buffered ICE candidates
  const applyBufferedCandidates = useCallback(async (userId, peerConnection, candidatesMap) => {
    if (candidatesMap[userId] && candidatesMap[userId].length > 0) {
      console.log('Applying', candidatesMap[userId].length, 'buffered ICE candidates for:', userId);
      for (const cand of candidatesMap[userId]) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
          console.log('Successfully applied buffered ICE candidate for:', userId);
        } catch (err) {
          console.error('Error applying buffered ICE candidate for:', userId, err);
        }
      }
      delete candidatesMap[userId];
    }
  }, []);



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
      setLocalUserName(username);
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

  // Update joinRoom to handle joinPending
  const joinRoom = async (roomId, username) => {
    try {
      console.log('Attempting to join room:', { roomId, username });

      // Get media permissions first
      const stream = await getUserMedia();
      if (!stream) {
        console.error('Failed to get media stream');
        return;
      }
      console.log('Media stream obtained successfully');

      // Emit join room event
      socket.emit('joinRoom', { roomId, username });

      // Set connection status to connecting
      setConnectionStatus('connecting');
      // Set joinPending to false in case of retry
      setJoinPending(false);
      setJoinDenied(false);
      setLocalUserName(username);

    } catch (error) {
      console.error('Join room error:', error);
      setError(`Failed to join room: ${error.message}`);
    }
  };

  // Initialize WebRTC call
  const initiateCall = useCallback(async (userId) => {
    try {
      console.log('Initiating call with:', userId);

      // Check if we already have a peer connection for this user
      if (peerConnectionsRef.current[userId]) {
        console.log('Peer connection already exists for:', userId);
        return;
      }

      // Add a small random delay to reduce offer collision probability
      const delay = Math.random() * 200; // 0-200ms delay
      console.log(`Adding ${delay.toFixed(0)}ms delay to reduce collision probability`);
      await new Promise(resolve => setTimeout(resolve, delay));

      // Double-check that we still don't have a peer connection after the delay
      if (peerConnectionsRef.current[userId]) {
        console.log('Peer connection was created during delay, aborting call initiation');
        return;
      }

      // Get roomId from state or socket
      const currentRoomId = roomId || socket?.roomId;
      if (!currentRoomId) {
        console.error('No roomId available for call initiation');
        console.log('Current roomId state:', roomId);
        console.log('Socket roomId:', socket?.roomId);
        return;
      }

      if (!localStreamRef.current || !localStreamRef.current.active) {
        console.log('Getting local stream before initiating call');
        localStreamRef.current = await getUserMedia();
      }

      const peerConnection = createPeerConnection(userId);

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
        roomId: currentRoomId
      });

    } catch (error) {
      console.error('Failed to initiate call:', error);
      // Handle connection failure inline
      console.log('Handling connection failure for:', userId);

      // Clean up failed connection
      if (peerConnectionsRef.current[userId]) {
        peerConnectionsRef.current[userId].close();
        delete peerConnectionsRef.current[userId];
      }

      // Remove failed streams
      setRemoteStreams(prev => prev.filter(s => s.userId !== userId));
    }
  }, [roomId, socket, getUserMedia, createPeerConnection]);

  // Add function to reset peer connection (moved before useEffect that uses it)
  const resetPeerConnection = useCallback((userId) => {
    console.log('Resetting peer connection for:', userId);
    cleanupPeerConnection(userId);

    // Try to re-establish connection if we're the host
    if (isHost) {
      setTimeout(() => {
        console.log('Attempting to re-establish connection with:', userId);
        initiateCall(userId);
      }, 1000);
    }
  }, [isHost, initiateCall]);

  useEffect(() => {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      if (video.srcObject && video.paused) {
        video.play().catch((err) => {
          if (err.name !== 'AbortError') {
            console.warn('Autoplay blocked, will retry on interaction', err);
          }
        });
      }
    });

    const retry = () => {
      const videos = document.querySelectorAll('video');
      videos.forEach(video => {
        if (video.srcObject && video.paused) {
          video.play().catch((err) => {
            if (err.name !== 'AbortError') {
              console.warn('Manual play failed on interaction:', err);
            }
          });
        }
      });
    };

    document.addEventListener('click', retry);
    return () => document.removeEventListener('click', retry);
  }, []);

  // Socket event handlers
  useEffect(() => {
    socket.on('roomCreated', ({ roomId }) => {
      console.log('Room created event received:', roomId);

      if (!roomId) {
        console.error('No roomId received');
        return;
      }

      setRoomId(roomId);
      setIsHost(true);
      setConnectionStatus('connected');
      setIsJoined(true);
      clearChat();

      try {
        navigator.clipboard.writeText(roomId);
        console.log('Room created:', roomId);
        const roomLink = `${window.location.origin}/room/${roomId}`;
        console.log('Room link:', roomLink);
        window.history.pushState({}, '', roomLink);
        console.log('Room link updated in URL:', window.location.href);
        alert(`Room created! Room ID: ${roomId} (copied to clipboard)`);
      } catch (error) {
        console.error('Error copying room ID to clipboard:', error);
        alert(`Room created! Room ID: ${roomId}`);
      }
    });

    // socket.on('roomJoined', ({ roomId, users, isHost }) => {
    //   console.log('Room joined event received:', { roomId, users, isHost });

    //   if (!roomId || !Array.isArray(users)) {
    //     console.error('Invalid room data received:', { roomId, users });
    //     return;
    //   }

    //   setRoomId(roomId);
    //   // Also store roomId in socket for backup
    //   socket.roomId = roomId;
    //   setIsHost(isHost);
    //   setParticipants(users.filter(user => user && user.id));
    //   setConnectionStatus('connected');
    //   setIsJoined(true);
    //   clearChat();

    //   // Initialize connections with existing users immediately
    //   users.forEach((user, index) => {
    //     if (user && user.id && user.id !== socket.id) {
    //       console.log('Initializing connection with existing user:', user.id);
    //       if (!peerConnectionsRef.current[user.id]) {
    //         // Only the host initiates calls to prevent offer collisions
    //         if (isHost) {
    //           // Stagger the call initiation to avoid overwhelming the system
    //           setTimeout(async () => {
    //             console.log('Host calling initiateCall for user:', user.id, 'with roomId:', roomId);
    //             try {
    //               await initiateCall(user.id);
    //               console.log('Successfully initiated call with:', user.id);
    //             } catch (error) {
    //               console.error('Failed to initiate call with:', user.id, error);
    //               // Retry once after a delay
    //               setTimeout(async () => {
    //                 try {
    //                   console.log('Retrying call initiation with:', user.id);
    //                   await initiateCall(user.id);
    //                 } catch (retryError) {
    //                   console.error('Retry failed for call initiation with:', user.id, retryError);
    //                 }
    //               }, 2000);
    //             }
    //           }, 500 + (index * 200)); // Stagger by 200ms per user
    //         } else {
    //           console.log('Not host, waiting for host to initiate call with:', user.id);
    //         }
    //       }
    //     }
    //   });
    // });

    socket.on('roomJoined', ({ roomId, users, isHost }) => {
      console.log('Room joined event received:', { roomId, users, isHost });

      if (!roomId || !Array.isArray(users)) {
        console.error('Invalid room data received:', { roomId, users });
        return;
      }

      setRoomId(roomId);
      socket.roomId = roomId; // Good for backup
      setIsHost(isHost);
      setParticipants(users.filter(user => user && user.id));
      setConnectionStatus('connected');
      setIsJoined(true);
      clearChat();

      // Every client will initiate a connection with every other existing client
      users.forEach(user => {
        if (user && user.id && user.id !== socket.id) {
          // To prevent offer collisions, let the user with the "greater" ID initiate
          if (socket.id > user.id) {
            console.log(`Initiating call with existing user: ${user.id}`);
            initiateCall(user.id);
          }
        }
      });
    });
    const pendingCandidates = {}; // userId -> array of ICE candidates

    // ---- OFFER handler ----
    socket.on('offer', async ({ from, offer }) => {
      try {
        console.log('Received offer from:', from);

        if (!from || !offer) {
          console.error('Invalid offer data received:', { from, offer });
          return;
        }

        // Check if we already have a peer connection for this user
        let peerConnection = peerConnectionsRef.current[from];
        if (!peerConnection) {
          peerConnection = createPeerConnection(from);
        } else {
          console.log('Reusing existing peer connection for:', from);
        }

        // Handle different signaling states
        if (peerConnection.signalingState === 'stable') {
          // Normal case: we can accept the offer
          await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
          console.log('Remote description set for:', from);

          // Apply any stored ICE candidates after remote description is set
          await applyBufferedCandidates(from, peerConnection, pendingCandidates);

          // Create and send answer
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);

          console.log('Sending answer to:', from);
          socket.emit('answer', { to: from, answer, roomId: roomId || socket?.roomId });

        } else if (peerConnection.signalingState === 'have-local-offer') {
          // Offer collision: both peers sent offers simultaneously
          console.log('Offer collision detected with:', from);

          // Check if rollback is supported (try-catch is more reliable than feature detection)
          try {
            // For simplicity, we'll roll back our offer and accept theirs
            // First, roll back our local description
            await peerConnection.setLocalDescription({ type: 'rollback' });

            // Now we should be in 'stable' state, so we can accept their offer
            if (peerConnection.signalingState === 'stable') {
              await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
              console.log('Remote description set after rollback for:', from);

              // Apply any stored ICE candidates
              await applyBufferedCandidates(from, peerConnection, pendingCandidates);

              // Create and send answer
              const answer = await peerConnection.createAnswer();
              await peerConnection.setLocalDescription(answer);

              console.log('Sending answer after rollback to:', from);
              socket.emit('answer', { to: from, answer, roomId: roomId || socket?.roomId });
            } else {
              console.error('Failed to rollback to stable state');
              resetPeerConnection(from);
            }
          } catch (rollbackError) {
            console.warn('Rollback not supported, resetting connection:', rollbackError);
            resetPeerConnection(from);
          }

        } else if (peerConnection.signalingState === 'have-remote-offer') {
          // We already have a remote offer, this shouldn't happen normally
          console.warn('Received offer while already having remote offer from:', from);
          // We can either ignore this offer or reset the connection
          // For now, we'll ignore it
          console.log('Ignoring duplicate offer from:', from);

        } else {
          console.warn('Cannot set remote offer - unexpected signaling state:', peerConnection.signalingState);
          console.log('Peer connection state:', {
            signalingState: peerConnection.signalingState,
            connectionState: peerConnection.connectionState,
            iceConnectionState: peerConnection.iceConnectionState
          });

          // Reset the connection if it's in an unexpected state
          console.log('Resetting peer connection due to unexpected signaling state');
          resetPeerConnection(from);
        }

      } catch (error) {
        console.error('Error handling offer:', error);
        // Reset connection on error
        resetPeerConnection(from);
      }
    });


    // ---- ANSWER handler ----
    socket.on('answer', async ({ from, answer }) => {
      console.log('Received answer from:', from);

      if (!from || !answer) {
        console.error('Invalid answer data received:', { from, answer });
        return;
      }

      const peerConnection = peerConnectionsRef.current[from];
      if (peerConnection) {
        try {
          // Check if we can set the remote description
          if (peerConnection.signalingState === 'have-local-offer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log('Remote description set from answer for:', from);

            // Apply any stored ICE candidates after remote description is set
            await applyBufferedCandidates(from, peerConnection, pendingCandidates);
          } else if (peerConnection.signalingState === 'have-remote-offer') {
            // We sent an offer, so we should ignore this answer (we're waiting for their answer)
            console.log('Ignoring answer from:', from, '- we sent an offer, waiting for their answer');
          } else if (peerConnection.signalingState === 'stable') {
            // Connection is already stable, answer might be a duplicate
            console.log('Connection already stable, ignoring duplicate answer from:', from);
          } else {
            console.warn('Cannot set remote answer - wrong signaling state:', peerConnection.signalingState);
            console.log('Peer connection state:', {
              signalingState: peerConnection.signalingState,
              connectionState: peerConnection.connectionState,
              iceConnectionState: peerConnection.iceConnectionState
            });

            // Only reset if it's in an unexpected state (not stable, have-local-offer, or have-remote-offer)
            if (peerConnection.signalingState !== 'stable' &&
              peerConnection.signalingState !== 'have-local-offer' &&
              peerConnection.signalingState !== 'have-remote-offer') {
              console.log('Resetting peer connection due to bad signaling state for answer');
              resetPeerConnection(from);
            }
          }
        } catch (err) {
          console.error('Failed to set remote description:', err);
          // Reset connection on error
          resetPeerConnection(from);
        }
      } else {
        console.warn('No peer connection found for answer from:', from);
        console.log('Available peer connections:', Object.keys(peerConnectionsRef.current));
      }
    });


    // ---- ICE Candidate handler ----
    socket.on('candidate', async ({ from, candidate }) => {
      console.log('Received ICE candidate from:', from);

      if (!from || !candidate) {
        console.error('Invalid candidate data received:', { from, candidate });
        return;
      }

      const peerConnection = peerConnectionsRef.current[from];
      if (peerConnection) {
        // Check if remote description is set before adding ICE candidate
        if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('Successfully added ICE candidate from:', from);
          } catch (err) {
            console.error('Error adding ICE candidate:', err);
          }
        } else {
          // Buffer the candidate until remote description is set
          if (!pendingCandidates[from]) {
            pendingCandidates[from] = [];
          }
          pendingCandidates[from].push(candidate);
          console.log('Buffered ICE candidate from:', from, '- waiting for remote description');
          console.log('Peer connection state:', {
            signalingState: peerConnection.signalingState,
            connectionState: peerConnection.connectionState,
            iceConnectionState: peerConnection.iceConnectionState
          });
        }
      } else {
        // If peer connection is not yet ready, store the candidate
        if (!pendingCandidates[from]) {
          pendingCandidates[from] = [];
        }
        pendingCandidates[from].push(candidate);
        console.log('Buffered ICE candidate from:', from, '- no peer connection yet');
        console.log('Available peer connections:', Object.keys(peerConnectionsRef.current));
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

      // Force refresh remote streams to ensure video state is properly reflected
      setRemoteStreams(prev => {
        const updated = prev.map(streamInfo => {
          if (streamInfo.userId === userId && streamInfo.stream) {
            // Force enable/disable video tracks based on state
            const videoTracks = streamInfo.stream.getVideoTracks();
            videoTracks.forEach(track => {
              if (track.readyState === 'live') {
                track.enabled = !isVideoOff;
              }
            });

            // Force refresh the stream object to trigger re-render
            return { ...streamInfo, stream: streamInfo.stream };
          }
          return streamInfo;
        });
        return updated;
      });
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

      // Only the host initiates calls with new users to prevent offer collisions

      setTimeout(() => {
        initiateCall(user.id);
      }, 500);
    });

    socket.on('joinPending', () => {
      setJoinPending(true);
      setJoinDenied(false);
      setConnectionStatus('waiting-approval');
    });
    socket.on('joinApproved', () => {
      setJoinPending(false);
      setJoinDenied(false);
      setConnectionStatus('connected');
      setIsJoined(true);
      // RoomJoined event will handle the rest
    });
    socket.on('joinDenied', () => {
      setJoinPending(false);
      setJoinDenied(true);
      setConnectionStatus('disconnected');
      setIsJoined(false);
    });
    socket.on('joinRequest', ({ roomId, request }) => {
      // Only host should handle this
      if (!isHost) return;
      setPendingRequests(prev => [...prev, { ...request, roomId }]);
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
      socket.off('joinPending');
      socket.off('joinApproved');
      socket.off('joinDenied');
      socket.off('joinRequest');
    };
  }, [isHost, initiateCall, applyBufferedCandidates, resetPeerConnection]);

  // Clean up when I leave or someone else leaves
  const handleUserDisconnected = (userId) => {
    console.log(`User disconnected: ${userId}`);

    // Close and remove the peer connection
    if (peerConnectionsRef.current[userId]) {
      peerConnectionsRef.current[userId].close();
      delete peerConnectionsRef.current[userId];
    }

    // Remove the remote stream
    setRemoteStreams(prev => prev.filter(s => s.userId !== userId));

    // Remove the participant from the list
    setParticipants(prev => prev.filter(p => p.id !== userId));
  };

  // My controls for video/audio
  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      // Fix the reversed logic - when track is enabled, we're not muted
      const isTrackEnabled = audioTracks[0]?.enabled;
      setIsAudioMuted(!isTrackEnabled);

      console.log('Audio toggled:', { trackEnabled: isTrackEnabled, isMuted: !isTrackEnabled });
    }
  };

  // const toggleVideo = async () => {
  //   if (localStreamRef.current) {
  //     const videoTracks = localStreamRef.current.getVideoTracks();
  //     const videoTrack = videoTracks[0];
  //     const currentTrackEnabled = videoTrack?.enabled;
  //     const newTrackEnabled = !currentTrackEnabled;
  //     console.log('Toggling video:', { current: currentTrackEnabled, new: newTrackEnabled });
  //     if (newTrackEnabled) {
  //       // Turning video ON
  //       if (!videoTrack || videoTrack.readyState !== 'live') {
  //         // Track is ended or missing, stop and remove all old video tracks before reacquiring
  //         videoTracks.forEach(track => {
  //           try {
  //             track.stop();
  //             localStreamRef.current.removeTrack(track);
  //             console.log('Stopped and removed old video track:', track.id);
  //           } catch (err) {
  //             console.warn('Error stopping/removing old video track:', err);
  //           }
  //         });
  //         try {
  //           const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
  //           const newVideoTrack = newStream.getVideoTracks()[0];
  //           if (newVideoTrack) {
  //             await Promise.all(Object.values(peerConnectionsRef.current).map(async peerConnection => {
  //               const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
  //               if (sender) {
  //                 await new Promise(res => setTimeout(res, 100));
  //                 await sender.replaceTrack(newVideoTrack).catch(err => {
  //                   console.warn('replaceTrack error after reacquire:', err);
  //                 });
  //               }
  //             }));
  //             localStreamRef.current.addTrack(newVideoTrack);
  //             // Always use the same stream for local preview
  //             if (localVideoRef.current) {
  //               try {
  //                 localVideoRef.current.srcObject = null;
  //                 localVideoRef.current.srcObject = localStreamRef.current;
  //                 localVideoRef.current.play().catch(err => {
  //                   if (err.name !== 'AbortError') {
  //                     console.warn('Forced play after reacquire failed:', err);
  //                   }
  //                 });
  //                 console.log('Assigned localStreamRef.current to local video element after reacquire');
  //               } catch (err) {
  //                 console.warn('Error forcing local video refresh:', err);
  //               }
  //             }
  //             setIsVideoOff(false);
  //             setLocalVideoKey(k => k + 1); // Still force React remount for safety
  //             console.log('Recovered and replaced ended video track (stable)');
  //           } else {
  //             console.error('No new video track found after getUserMedia');
  //             setError('No new video track found after getUserMedia');
  //           }
  //         } catch (err) {
  //           setError('Failed to reacquire camera: ' + (err && err.message ? err.message : err));
  //           setIsVideoOff(true);
  //           console.error('Error reacquiring camera:', err);
  //         }
  //       } else {
  //         // Track is live, just enable it
  //         videoTrack.enabled = true;
  //         setIsVideoOff(false);
  //         Object.values(peerConnectionsRef.current).forEach(peerConnection => {
  //           const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
  //           if (sender && videoTrack) {
  //             sender.replaceTrack(videoTrack).catch(err => {
  //               console.warn('replaceTrack error:', err);
  //             });
  //           }
  //         });
  //       }
  //     } else {
  //       // Turning video OFF
  //       videoTracks.forEach(track => {
  //         track.enabled = false;
  //       });
  //       setIsVideoOff(true);
  //       Object.values(peerConnectionsRef.current).forEach(peerConnection => {
  //         const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
  //         if (sender && videoTrack) {
  //           sender.replaceTrack(videoTrack).catch(err => {
  //             console.warn('replaceTrack error:', err);
  //           });
  //         }
  //       });
  //     }
  //     // Emit video state change to server so others are notified
  //     if (roomId) {
  //       socket.emit('videoStateChange', {
  //         roomId,
  //         isVideoOff: !newTrackEnabled
  //       });
  //     }
  //   }
  // };
  // Add these helper functions inside your VideoChat component

  // const reacquireVideoStream = useCallback(async (oldVideoTracks) => {
  //   console.log('🔄 Reacquiring video stream...');

  //   // Clean up old tracks first
  //   oldVideoTracks.forEach(track => {
  //     try {
  //       console.log('Stopping track:', track.id, 'State:', track.readyState);
  //       track.stop();
  //       if (localStreamRef.current) {
  //         localStreamRef.current.removeTrack(track);
  //       }
  //       console.log('✅ Cleaned up old video track:', track.id);
  //     } catch (err) {
  //       console.warn('Error cleaning up old video track:', err);
  //     }
  //   });

  //   // Clear local video element temporarily
  //   if (localVideoRef.current) {
  //     localVideoRef.current.srcObject = null;
  //   }

  //   try {
  //     // Get new video stream (video only, preserve existing audio)
  //     const constraints = {
  //       video: {
  //         width: { ideal: 1280, max: 1920 },
  //         height: { ideal: 720, max: 1080 },
  //         frameRate: { ideal: 30 }
  //       },
  //       audio: false // Only video for this stream
  //     };

  //     console.log('🎥 Requesting new video stream with constraints:', constraints);
  //     const newStream = await navigator.mediaDevices.getUserMedia(constraints);

  //     const newVideoTrack = newStream.getVideoTracks()[0];
  //     if (!newVideoTrack) {
  //       throw new Error('No video track in new stream');
  //     }

  //     console.log('✅ Got new video track:', newVideoTrack.id, 'State:', newVideoTrack.readyState);

  //     // Add new track to existing local stream (preserve audio tracks)
  //     if (localStreamRef.current) {
  //       localStreamRef.current.addTrack(newVideoTrack);
  //       console.log('✅ Added new video track to local stream');
  //     } else {
  //       // If no local stream exists, create one with audio
  //       const audioConstraints = { audio: true, video: false };
  //       try {
  //         const audioStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
  //         const audioTrack = audioStream.getAudioTracks()[0];

  //         // Create new stream with both tracks
  //         localStreamRef.current = new MediaStream([newVideoTrack, audioTrack]);
  //         setLocalStream(localStreamRef.current); // Update state
  //         console.log('✅ Created new local stream with audio and video');
  //       } catch (audioError) {
  //         console.warn('Failed to get audio, using video only:', audioError);
  //         localStreamRef.current = newStream;
  //         setLocalStream(newStream); // Update state
  //       }
  //     }

  //     // Update peer connections first
  //     await updatePeerConnections(newVideoTrack);

  //     // Then update local video element - THIS IS THE KEY FIX
  //     await updateLocalVideoElement();

  //     // Update state and UI
  //     setIsVideoOff(false);
  //     setVideoError(false);
  //     setLocalVideoKey(prev => prev + 1); // Force React remount

  //     console.log('✅ Successfully reacquired and setup video stream');

  //   } catch (error) {
  //     console.error('❌ Failed to reacquire video stream:', error);
  //     setIsVideoOff(true);
  //     setError('Failed to turn on camera');

  //     // Ensure local video is cleared on failure
  //     if (localVideoRef.current) {
  //       localVideoRef.current.srcObject = null;
  //     }

  //     throw error;
  //   }
  // }, [setIsVideoOff, setVideoError, setError, setLocalVideoKey, setLocalStream]);

  // const updatePeerConnections = useCallback(async (videoTrack) => {
  //   const updatePromises = Object.values(peerConnectionsRef.current).map(async peerConnection => {
  //     try {
  //       const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
  //       if (sender) {
  //         await sender.replaceTrack(videoTrack);
  //         console.log('Updated peer connection with new video track');
  //       } else {
  //         // Add track if no video sender exists
  //         if (localStreamRef.current) {
  //           peerConnection.addTrack(videoTrack, localStreamRef.current);
  //           console.log('Added video track to peer connection');
  //         }
  //       }
  //     } catch (error) {
  //       console.warn('Error updating peer connection:', error);
  //       // Don't throw here, continue with other connections
  //     }
  //   });

  //   await Promise.allSettled(updatePromises);
  // }, []);

  // const updateLocalVideoElement = useCallback(async () => {
  //   if (!localVideoRef.current || !localStreamRef.current) {
  //     console.warn('Local video ref or stream not available');
  //     return;
  //   }

  //   try {
  //     const videoElement = localVideoRef.current;

  //     console.log('🔄 Updating local video element...');

  //     // Force stop any existing playback
  //     videoElement.pause();
  //     videoElement.srcObject = null;

  //     // Small delay to ensure cleanup
  //     await new Promise(resolve => setTimeout(resolve, 100));

  //     // Set new stream
  //     videoElement.srcObject = localStreamRef.current;

  //     // Set video properties
  //     videoElement.muted = true; // Prevent audio feedback for local video
  //     videoElement.playsInline = true; // Important for mobile
  //     videoElement.autoplay = true;

  //     // Force load and play
  //     videoElement.load();

  //     // Wait for the video to be ready
  //     await new Promise(resolve => {
  //       const timeout = setTimeout(() => {
  //         console.warn('Timeout waiting for video to load');
  //         resolve(); // Don't reject, just continue
  //       }, 3000);

  //       const onLoadedMetadata = () => {
  //         clearTimeout(timeout);
  //         videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
  //         console.log('✅ Local video metadata loaded');
  //         resolve();
  //       };

  //       videoElement.addEventListener('loadedmetadata', onLoadedMetadata);
  //     });

  //     // Now play the video
  //     try {
  //       await videoElement.play();
  //       console.log('✅ Local video element updated and playing');
  //     } catch (playError) {
  //       if (playError.name !== 'AbortError') {
  //         console.warn('Play failed, but video element is updated:', playError);
  //       }
  //     }

  //   } catch (error) {
  //     console.error('Error updating local video element:', error);

  //     // Fallback: try a simple direct assignment
  //     try {
  //       const videoElement = localVideoRef.current;
  //       videoElement.srcObject = localStreamRef.current;
  //       videoElement.muted = true;
  //       videoElement.playsInline = true;
  //       await videoElement.play();
  //       console.log('✅ Fallback video update succeeded');
  //     } catch (fallbackError) {
  //       console.error('Fallback video update also failed:', fallbackError);
  //     }
  //   }
  // }, []);

  // Debug function to help troubleshoot local video issues
  // const debugLocalVideo = useCallback(() => {
  //   console.log('🔍 DEBUG: Local Video Status');
  //   console.log('localVideoRef.current:', !!localVideoRef.current);
  //   console.log('localStreamRef.current:', !!localStreamRef.current);

  //   if (localVideoRef.current) {
  //     const videoEl = localVideoRef.current;
  //     console.log('Video element properties:', {
  //       srcObject: !!videoEl.srcObject,
  //       videoWidth: videoEl.videoWidth,
  //       videoHeight: videoEl.videoHeight,
  //       paused: videoEl.paused,
  //       muted: videoEl.muted,
  //       autoplay: videoEl.autoplay,
  //       playsInline: videoEl.playsInline,
  //       readyState: videoEl.readyState,
  //       networkState: videoEl.networkState
  //     });
  //   }

  //   if (localStreamRef.current) {
  //     const stream = localStreamRef.current;
  //     console.log('Stream properties:', {
  //       id: stream.id,
  //       active: stream.active,
  //       videoTracks: stream.getVideoTracks().length,
  //       audioTracks: stream.getAudioTracks().length
  //     });

  //     const videoTracks = stream.getVideoTracks();
  //     videoTracks.forEach((track, index) => {
  //       console.log(`Video track ${index}:`, {
  //         id: track.id,
  //         kind: track.kind,
  //         enabled: track.enabled,
  //         readyState: track.readyState,
  //         muted: track.muted
  //       });
  //     });
  //   }
  // }, []);

  // Quick fix function you can call if video stops working
  // const forceRefreshLocalVideo = useCallback(async () => {
  //   console.log('🔄 Force refreshing local video...');

  //   if (!localStreamRef.current || !localVideoRef.current) {
  //     console.error('Missing refs for video refresh');
  //     return;
  //   }

  //   try {
  //     await updateLocalVideoElement();
  //     console.log('✅ Force refresh completed');

  //   } catch (error) {
  //     console.error('❌ Force refresh failed:', error);
  //     debugLocalVideo();
  //   }
  // }, [updateLocalVideoElement, debugLocalVideo]);

  // Updated toggleVideo function - replace your existing one
  // const toggleVideo = useCallback(async () => {
  //   if (!localStreamRef.current) {
  //     console.warn('No local stream available');
  //     return;
  //   }

  //   const videoTracks = localStreamRef.current.getVideoTracks();
  //   const videoTrack = videoTracks[0];
  //   const currentTrackEnabled = videoTrack?.enabled ?? false;
  //   const newTrackEnabled = !currentTrackEnabled;

  //   console.log('Toggling video:', {
  //     current: currentTrackEnabled,
  //     new: newTrackEnabled,
  //     trackState: videoTrack?.readyState
  //   });

  //   try {
  //     if (newTrackEnabled) {
  //       // Turning video ON
  //       if (!videoTrack || videoTrack.readyState !== 'live') {
  //         // Track is ended or missing, stop and remove all old video tracks before reacquiring
  //         videoTracks.forEach(track => {
  //           try {
  //             track.stop();
  //             localStreamRef.current.removeTrack(track);
  //             console.log('Stopped and removed old video track:', track.id);
  //           } catch (err) {
  //             console.warn('Error stopping/removing old video track:', err);
  //           }
  //         });
  //         try {
  //           const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
  //           const newVideoTrack = newStream.getVideoTracks()[0];
  //           // Combine with any existing live audio tracks
  //           const audioTracks = localStreamRef.current
  //             ? localStreamRef.current.getAudioTracks().filter(t => t.readyState === 'live')
  //             : [];
  //           const tracks = [newVideoTrack, ...audioTracks];
  //           const newMediaStream = new MediaStream(tracks);
  //           localStreamRef.current = newMediaStream;
  //           setLocalStream(newMediaStream);
  //           // Always use the same stream for local preview
  //           if (localVideoRef.current) {
  //             try {
  //               localVideoRef.current.srcObject = null;
  //               localVideoRef.current.srcObject = newMediaStream;
  //               localVideoRef.current.play().catch(err => {
  //                 if (err.name !== 'AbortError') {
  //                   console.warn('Forced play after reacquire failed:', err);
  //                 }
  //               });
  //               console.log('👍Assigned newMediaStream to local video element after reacquire');
  //               console.log('New local stream tracks:', newMediaStream.getTracks());
  //               console.log('Video element srcObject:', localVideoRef.current.srcObject);
  //             } catch (err) {
  //               console.warn('Error forcing local video refresh:', err);
  //             }
  //           }
  //           setIsVideoOff(false);
  //           setLocalVideoKey(prev => prev + 1); // Force React remount
  //         } catch (err) {
  //           console.error('Error reacquiring local video stream:', err);
  //           setIsVideoOff(true);
  //         }
  //       } else {
  //         // Track is live, just enable it
  //         videoTrack.enabled = true;
  //         setIsVideoOff(false);
  //         await updatePeerConnections(videoTrack);
  //       }
  //     } else {
  //       // Turning video OFF
  //       videoTracks.forEach(track => {
  //         track.enabled = false;
  //       });
  //       setIsVideoOff(true);

  //       // Update peer connections with disabled track
  //       const disabledTrack = videoTracks[0];
  //       if (disabledTrack) {
  //         await updatePeerConnections(disabledTrack);
  //       }
  //     }

  //     // Emit state change to server
  //     if (roomId && socket) {
  //       socket.emit('videoStateChange', {
  //         roomId,
  //         isVideoOff: !newTrackEnabled
  //       });
  //     }
  //   } catch (error) {
  //     console.error('Error toggling video:', error);
  //     // Revert UI state on error
  //     setIsVideoOff(currentTrackEnabled);
  //     setError('Failed to toggle video');
  //   }
  // }, [roomId, socket, reacquireVideoStream, updatePeerConnections, setIsVideoOff, setError]);
  // Function to update video track for all peers



  const toggleVideo = useCallback(async () => {
    if (!localStreamRef.current) {
      console.warn("toggleVideo called without a local stream");
      return;
    }

    let videoTrack = localStreamRef.current.getVideoTracks()[0];
    const isTurningOn = !videoTrack || !videoTrack.enabled || videoTrack.readyState === 'ended';

    if (isTurningOn) {
      // --- Turning Video ON ---
      try {
        let newVideoTrack;
        if (!videoTrack || videoTrack.readyState === 'ended') {
          console.log("🎥 Acquiring a new video track...");
          const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
          newVideoTrack = newStream.getVideoTracks()[0];

          // Remove old track if exists
          if (videoTrack) {
            localStreamRef.current.removeTrack(videoTrack);
          }
          // Add the new track to local stream
          localStreamRef.current.addTrack(newVideoTrack);
          videoTrack = newVideoTrack;
        } else {
          // Re-enable existing track
          console.log("✅ Re-enabling existing video track.");
          videoTrack.enabled = true;
          setIsVideoOff(false);
        }

        // --- Update peer connections ---
        for (const pc of Object.values(peerConnectionsRef.current)) {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(videoTrack);
            console.log("🔄 Video track replaced for a peer.");
          }
        }

        // --- Update local preview ---
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }

        setIsVideoOff(false);

      } catch (error) {
        console.error("❌ Failed to turn on video:", error);
        setError("Could not start camera. Please check permissions.");
      }
    } else {
      // --- Turning Video OFF ---
      console.log("🚫 Disabling video track.");
      videoTrack.enabled = false;
      setIsVideoOff(true);
    }

    // --- Notify others about state change ---
    if (roomId && socket) {
      socket.emit("videoStateChange", {
        roomId,
        isVideoOff: !isTurningOn,
      });
    }
  }, [roomId, socket, setError]);


  // Add this useEffect to make debug functions available globally
  // useEffect(() => {
  //   // Make debug functions available globally for testing
  //   window.debugLocalVideo = debugLocalVideo;
  //   window.forceRefreshLocalVideo = forceRefreshLocalVideo;

  //   // Cleanup function
  //   return () => {
  //     delete window.debugLocalVideo;
  //     delete window.forceRefreshLocalVideo;
  //   };
  // }, [debugLocalVideo, forceRefreshLocalVideo]);
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
      console.log('=== Peer Connection Status ===');
      Object.entries(peerConnectionsRef.current).forEach(([userId, pc]) => {
        console.log(`User ${userId}:`, {
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          signalingState: pc.signalingState,
          hasRemoteDescription: !!pc.remoteDescription,
          hasLocalDescription: !!pc.localDescription
        });
      });
      console.log('=== End Status ===');
    };

    // Check more frequently for debugging
    const interval = setInterval(logConnectionState, 5000);
    return () => clearInterval(interval);
  }, []);

  // Add this useEffect to monitor video element and stream
  useEffect(() => {
    // Ensure local video element always has the stream set
    if (localVideoRef.current && localStreamRef.current) {
      if (!localVideoRef.current.srcObject) {
        console.log('Setting local stream to video element from monitoring');
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      // Force play if paused
      if (localVideoRef.current.paused) {
        localVideoRef.current.play().catch(err => {
          if (err.name !== 'AbortError') {
            console.warn('Force play local video failed:', err);
          }
        });
      }
    }
  }, [localStreamRef.current, isJoined]);

  // Add this useEffect to monitor video track status
  useEffect(() => {
    const checkVideoTrack = () => {
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          // Only log if there's an issue and the track is not intentionally ended
          if (!videoTrack.enabled || (videoTrack.readyState !== 'live' && videoTrack.readyState !== 'ended')) {
            console.warn('Video track issue:', {
              enabled: videoTrack.enabled,
              readyState: videoTrack.readyState,
              id: videoTrack.id,
              kind: videoTrack.kind,
              muted: videoTrack.muted,
              timestamp: Date.now()
            });
            // If track is disabled but live, try to re-enable it
            if (!videoTrack.enabled && videoTrack.readyState === 'live') {
              console.log('Re-enabling disabled video track');
              videoTrack.enabled = true;
            }
          }
          // Only set isVideoOff to true if the track is definitely disabled or ended
          const isTrackEnabled = videoTrack.enabled;
          if (!isTrackEnabled && !isVideoOff) {
            console.log('Setting isVideoOff to true because track is disabled');
            setIsVideoOff(true);
          }
          // If track has ended, try to get a new stream
          if (videoTrack.readyState === 'ended' && localStreamRef.current) {
            console.log('Video track ended, attempting to get new stream');
            getUserMedia().catch(err => {
              console.error('Failed to get new stream after track ended:', err);
            });
          }
        } else {
          console.error('No video track found');
        }
      }
    };
    checkVideoTrack();
    const interval = setInterval(checkVideoTrack, 5000);
    return () => clearInterval(interval);
  }, [getUserMedia, isVideoOff]);

  // Force refresh video elements when remote video states change
  useEffect(() => {
    const refreshVideoElements = () => {
      const videoElements = document.querySelectorAll('video[data-user-id]');
      videoElements.forEach(video => {
        const userId = video.dataset.userId;
        const isVideoOff = remoteVideoStates[userId];

        if (video.srcObject) {
          const videoTracks = video.srcObject.getVideoTracks();
          videoTracks.forEach(track => {
            if (track.readyState === 'live') {
              track.enabled = !isVideoOff;
            }
          });

          // Force play if video is enabled
          if (!isVideoOff && video.paused) {
            video.play().catch(err => {
              if (err.name !== 'AbortError') {
                console.warn('Force play after video state change failed:', err);
              }
            });
          }
        }
      });
    };

    // Small delay to ensure state is updated
    const timeoutId = setTimeout(refreshVideoElements, 100);
    return () => clearTimeout(timeoutId);
  }, [remoteVideoStates]);

  // Periodic video state sync to ensure consistency
  useEffect(() => {
    const syncVideoStates = () => {
      if (!localStreamRef.current) return;

      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack && videoTrack.readyState === 'live') {
        const actualTrackEnabled = videoTrack.enabled;
        const expectedVideoOff = isVideoOff;

        // Sync if there's a mismatch
        if (actualTrackEnabled === expectedVideoOff) {
          console.log('Syncing video state mismatch:', { actualTrackEnabled, expectedVideoOff });
          videoTrack.enabled = !expectedVideoOff;

          // Emit state change to ensure remote peers are updated
          if (roomId) {
            socket.emit('videoStateChange', {
              roomId,
              isVideoOff: expectedVideoOff
            });
          }
        }
      }
    };

    const interval = setInterval(syncVideoStates, 3000);
    return () => clearInterval(interval);
  }, [isVideoOff, roomId]);

  // Add a retry button to the error container

  const ErrorContainer = ({ error, onRetry, onDismiss }) => (
    <div className="error-container" style={{ background: '#fff3cd', color: '#856404', border: '1px solid #ffeeba', borderRadius: 8, padding: 24, margin: 24, textAlign: 'center', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#856404' }}>error</span>
      <h2 style={{ margin: '16px 0 8px 0' }}>Something went wrong</h2>
      <p style={{ marginBottom: 16 }}>{error}</p>
      <div className="error-buttons" style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
        <button onClick={onRetry} style={{ background: '#28a745', color: 'white', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer' }}>Try Again</button>
        <button onClick={onDismiss} style={{ background: '#6c757d', color: 'white', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer' }}>Continue Without Camera</button>
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
        localUser={socket?.id ? { id: socket.id, name: localUserName, isHost } : null}
        showParticipants={showParticipants}
      />
    );
  };

  // Update video rendering with null checks
  const renderRemoteVideos = () => {
    console.log('[renderRemoteVideos] remoteStreams:', remoteStreams);
    return remoteStreams.map((streamInfo) => {
      if (!streamInfo || !streamInfo.userId || !streamInfo.stream) return null;
      if (streamInfo.userId === (localUserId || socket?.id)) return null;
      console.log('[renderRemoteVideos] Rendering video for userId:', streamInfo.userId);
      const participant = participants.find(p => p?.id === streamInfo.userId);
      const username = participant?.username || 'Participant';

      console.log("Rendering video for:", username);

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
              data-user-id={streamInfo.userId}
              autoPlay
              playsInline
              muted={false}
              ref={(el) => {
                if (el && streamInfo.stream) {
                  // Always set srcObject to ensure it's current
                  el.srcObject = streamInfo.stream;
                  console.log(`Video ${streamInfo.userId} loaded`);

                  // Check if stream has tracks
                  const tracks = streamInfo.stream.getTracks();
                  console.log(`Stream tracks for ${streamInfo.userId}:`, tracks.map(t => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState })));

                  // Force enable video tracks
                  tracks.forEach(track => {
                    if (track.kind === 'video' && !track.enabled && track.readyState === 'live') {
                      console.log(`Force enabling video track for ${streamInfo.userId}`);
                      track.enabled = true;
                    }
                  });

                  // Only set up event handlers if they haven't been set
                  if (!el._handlersSet) {
                    el.onloadedmetadata = () => {
                      console.log(`Video metadata loaded for ${streamInfo.userId}`);
                      // Force play after metadata is loaded
                      setTimeout(() => {
                        if (el.srcObject && el.paused) {
                          el.play().catch(err => {
                            if (err.name !== 'AbortError') {
                              console.warn("Playback error:", err);
                            }
                          });
                        }
                      }, 100);
                    };

                    el.oncanplay = () => {
                      console.log(`Video can play for ${streamInfo.userId}`);
                      // Force play when ready
                      setTimeout(() => {
                        if (el.srcObject && el.paused) {
                          el.play().catch(err => {
                            if (err.name !== 'AbortError') {
                              console.warn("Canplay play failed:", err);
                            }
                          });
                        }
                      }, 100);
                    };

                    el.onplay = () => {
                      console.log(`Video started playing for ${streamInfo.userId}`);
                    };

                    el.onerror = (e) => {
                      console.error(`Video error for ${streamInfo.userId}:`, e);
                    };

                    el.onstalled = () => {
                      console.warn(`Video stalled for ${streamInfo.userId}`);
                    };

                    el.onwaiting = () => {
                      console.warn(`Video waiting for ${streamInfo.userId}`);
                      console.log("Video waiting for", streamInfo.userId, "readyState:", el.readyState);
                      setShowPlaceholder(true);
                      // Add detailed debugging for waiting state
                      console.log(`Video waiting details for ${streamInfo.userId}:`, {
                        readyState: el.readyState,
                        networkState: el.networkState,
                        paused: el.paused,
                        currentTime: el.currentTime,
                        duration: el.duration,
                        hasSrcObject: !!el.srcObject,
                        streamActive: el.srcObject?.active,
                        trackCount: el.srcObject?.getTracks().length,
                        tracks: el.srcObject?.getTracks().map(t => ({
                          kind: t.kind,
                          enabled: t.enabled,
                          readyState: t.readyState,
                          muted: t.muted
                        }))
                      });

                      // Check if this is a remote stream and log connection status
                      if (streamInfo.userId !== socket?.id) {
                        const pc = peerConnectionsRef.current[streamInfo.userId];
                        if (pc) {
                          console.log(`Peer connection status for ${streamInfo.userId}:`, {
                            connectionState: pc.connectionState,
                            iceConnectionState: pc.iceConnectionState,
                            signalingState: pc.signalingState
                          });
                        } else {
                          console.warn(`No peer connection found for ${streamInfo.userId}`);
                        }
                      }
                    };

                    el._handlersSet = true;
                  }

                  // Force play immediately if ready
                  if (el.readyState >= 2) {
                    setTimeout(() => {
                      if (el.paused) {
                        el.play().catch(err => {
                          if (err.name !== 'AbortError') {
                            console.warn("Immediate play failed:", err);
                          }
                        });
                      }
                    }, 100);
                  }
                }
              }}
              className="video-item"
              style={{ transform: 'scaleX(-1)' }}
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
      if (!socket) {
        console.warn('No socket instance available');
        setConnectionStatus('disconnected');
        setError('Socket connection not available');
        return;
      }

      if (!socket.connected) {
        console.warn('Socket disconnected, attempting to reconnect...');
        setConnectionStatus('disconnected');

        // Try to reconnect if not already attempting
        if (!socket.connected && !socket.connecting) {
          console.log('Manually attempting socket reconnection...');
          socket.connect();
        }

        // Set error message for user feedback
        setError('Connection lost. Attempting to reconnect...');
      } else {
        console.log('Socket connection is healthy');
        setConnectionStatus('connected');
        setError(null); // Clear any connection errors
      }
    };

    // Check connection status immediately
    checkSocketConnection();

    // Check less frequently to reduce console spam
    const interval = setInterval(checkSocketConnection, 5000);
    return () => clearInterval(interval);
  }, [socket]);
  // Remove redundant local stream ref setting
  // Remove redundant logging of remote streams


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
        if (video.paused && video.srcObject) {
          video.play().catch(err => {
            if (err.name !== 'AbortError') {
              console.warn('Manual play failed on interaction:', err);
            }
          });
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
        if (video.paused && video.srcObject) {
          video.play().catch(err => {
            if (err.name !== 'AbortError') {
              console.warn('Play after user interaction failed:', err);
            }
          });
        }
      });
    };

    // Add event listeners for user interaction
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('touchstart', handleUserInteraction);

    // Also try to play videos periodically and check stream status
    const playInterval = setInterval(() => {
      const videos = document.querySelectorAll('video');
      videos.forEach(video => {
        if (video.paused && video.srcObject && video.readyState >= 2) {
          video.play().catch(err => {
            if (err.name !== 'AbortError') {
              console.warn('Periodic play attempt failed:', err);
            }
          });
        }

        // Force enable video tracks for remote videos
        if (video.srcObject && video.dataset.userId) {
          const stream = video.srcObject;
          const tracks = stream.getTracks();
          tracks.forEach(track => {
            if (track.kind === 'video' && !track.enabled && track.readyState === 'live') {
              console.log(`Force enabling video track for ${video.dataset.userId}`);
              track.enabled = true;
            }
          });
        }

        // Debug video element status
        if (video.srcObject) {
          const stream = video.srcObject;
          const tracks = stream.getTracks();
          console.log(`Video element ${video.dataset.userId || 'local'} status:`, {
            paused: video.paused,
            readyState: video.readyState,
            currentTime: video.currentTime,
            duration: video.duration,
            trackCount: tracks.length,
            tracks: tracks.map(t => ({
              kind: t.kind,
              enabled: t.enabled,
              readyState: t.readyState
            }))
          });
        }
      });
    }, 3000);

    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      clearInterval(playInterval);
    };
  }, []);

  // Ensure local video element always has the stream set
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;

      localVideoRef.current.play().catch((err) => {
        console.warn('Autoplay failed:', err);
      });

      console.log("✅ Assigned local stream to local video in useEffect");
    }
  }, [localStreamRef.current]);

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

      // Clean up video elements for this user
      const videoElements = document.querySelectorAll(`video[data-user-id="${userId}"]`);
      videoElements.forEach(video => {
        if (video.srcObject) {
          video.srcObject.getTracks().forEach(track => track.stop());
          video.srcObject = null;
        }
        delete video._handlersSet;
      });

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

  // Host: Approve/Deny join request
  const handleApproveJoin = (roomId, socketId) => {
    socket.emit('approveJoin', { roomId, socketId });
    setPendingRequests(prev => prev.filter(r => r.socketId !== socketId));
  };
  const handleDenyJoin = (roomId, socketId) => {
    socket.emit('denyJoin', { roomId, socketId });
    setPendingRequests(prev => prev.filter(r => r.socketId !== socketId));
  };

  // Deep debugging for local video element and stream
  // useEffect(() => {
  //   const videoEl = localVideoRef.current;
  //   const stream = localStreamRef.current;
  //   console.log('=== LOCAL VIDEO DEBUG ===');
  //   if (!videoEl) {
  //     console.warn('Local video element is null');
  //     return;
  //   }
  //   if (!stream) {
  //     console.warn('Local stream is null');
  //     return;
  //   }
  //   const videoTracks = stream.getVideoTracks();
  //   console.log('Local stream video tracks:', videoTracks.length);
  //   videoTracks.forEach((track, i) => {
  //     console.log(`Track ${i}:`, {
  //       id: track.id,
  //       kind: track.kind,
  //       enabled: track.enabled,
  //       readyState: track.readyState,
  //       muted: track.muted
  //     });
  //   });
  //   if (videoTracks.length > 1) {
  //     console.warn('More than one video track in localStreamRef.current! This can cause preview issues.');
  //   }
  //   console.log('Local video element srcObject:', videoEl.srcObject === stream ? 'CORRECT' : videoEl.srcObject);
  //   console.log('Video element readyState:', videoEl.readyState, 'paused:', videoEl.paused, 'currentTime:', videoEl.currentTime);
  //   // Force srcObject and play
  //   if (videoEl.srcObject !== stream) {
  //     videoEl.srcObject = stream;
  //     console.log('Set local video element srcObject to localStreamRef.current');
  //   }
  //   if (videoEl.paused) {
  //     videoEl.play().then(() => {
  //       console.log('Forced local video play()');
  //     }).catch(err => {
  //       if (err.name !== 'AbortError') {
  //         console.warn('Forced play failed:', err);
  //       }
  //     });
  //   }
  //   console.log('=== END LOCAL VIDEO DEBUG ===');
  // }, [localStreamRef.current, localVideoKey, isJoined]);

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
          <button onClick={() => setJoinDenied(false)}>Try Again</button>
        </div>
      );
    }
    return <RoomJoin
      onJoinRoom={joinRoom}
      onCreateRoom={createRoom}
      joinPending={joinPending}
      joinDenied={joinDenied}
      pendingRequests={pendingRequests}
      setJoinDenied={setJoinDenied}
      setPendingRequests={setPendingRequests}
      onApproveJoin={handleApproveJoin}
      onDenyJoin={handleDenyJoin}
      onRetry={() => setJoinDenied(false)}
    />;
  }
  const renderLocalVideo = () => {
    console.log("🧪 renderLocalVideo() called");
    console.log("🟢 localStreamRef.current =", localStreamRef.current);
    if (videoError) return <div className="video-error">Camera not available</div>;
    if (isVideoOff) return <div className="video-error">Camera turned off</div>;

    if (!localStreamRef.current) {
      console.log('❌ No local stream available for rendering');
      return <div className="video-error">No camera stream</div>;
    }
    console.log('✅ Rendering local video element');
    return (
      <><video
        key={localVideoKey}
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className="video-item local"
        style={{ transform: 'scaleX(-1)', objectFit: 'cover' }}
        onLoadedMetadata={(e) => {
          console.log('🎯 Local video metadata loaded');
          if (!e.target.srcObject && localStreamRef.current) {
            e.target.srcObject = localStreamRef.current;
            console.log('👍Assigned localStreamRef.current to local video element after reacquire');
          }
          if (e.target.srcObject && e.target.paused) {
            e.target.play().catch(err => {
              if (err.name !== 'AbortError') {
                console.error('Local video play failed:', err);
              }
            });
          }
        }}
        onCanPlay={(e) => {
          console.log('Local video can play');
          if (!e.target.srcObject && localStreamRef.current) {
            e.target.srcObject = localStreamRef.current;
          }
          if (e.target.srcObject && e.target.paused) {
            e.target.play().catch(err => {
              if (err.name !== 'AbortError') {
                console.error('Local video play failed on canplay:', err);
              }
            });
          }
        }}
        onPlay={() => {
          console.log('Local video started playing');
        }}
        onError={(e) => {
          console.error('Local video error:', e);
          setVideoError(true);
        }} /><div className="participant-name">
          {localUserName} (You)
        </div></>
    );
  };



  return (
    <div className="container">
      {showParticipants && renderParticipantList()}
      {/* {isHost && pendingRequests.length > 0 && (
        <div className="pending-requests-panel">
          <h3>Pending Join Requests</h3>
          <ul>
            {pendingRequests.map(req => (
              <li key={req.socketId}>
                <span>{req.username || req.socketId}</span>
                <button onClick={() => handleApproveJoin(req.roomId, req.socketId)}>Approve</button>
                <button onClick={() => handleDenyJoin(req.roomId, req.socketId)}>Deny</button>
              </li>
            ))}
          </ul>
        </div>
      )} */}
      {pendingRequests.length > 0 && (
        <div className="approval-stack-overlay">
          {pendingRequests.map((req) => (
            <div key={req.id} className="approval-card">
              <h3>{req.username} wants to join</h3>
              <div className="approval-buttons">
                <button
                  className="approve-button"
                  onClick={() => handleApproveJoin(req.roomId, req.socketId)}
                >
                  Approve
                </button>
                <button
                  className="deny-button"
                  onClick={() => handleDenyJoin(req.roomId, req.socketId)}
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
          ) : (
            <div className="video-container local">
              {renderLocalVideo()}
            </div>
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
          {/* <button
            onClick={() => {
              console.log('=== MANUAL CALL INITIATION ===');
              // Try to initiate calls with all participants
              participants.forEach(participant => {
                if (participant.id !== socket?.id) {
                  console.log('Manually initiating call with:', participant.id);
                  initiateCall(participant.id);
                }
              });
              console.log('=== END MANUAL CALL INITIATION ===');
            }}
            className="debug-button"
            style={{ backgroundColor: '#28a745', color: 'white' }}
          >
            Force Call
          </button> */}
          {/* <button
            onClick={() => {
              console.log('=== MANUAL SOCKET RECONNECTION ===');
              if (socket) {
                if (socket.connected) {
                  console.log('Socket is already connected');
                } else {
                  console.log('Attempting manual socket reconnection...');
                  socket.connect();
                }
              } else {
                console.error('No socket instance available');
              }
              console.log('=== END SOCKET RECONNECTION ===');
            }}
            className="debug-button"
            style={{ backgroundColor: '#ffc107', color: 'black' }}
          >
            Reconnect
          </button> */}
          {/* <button
             onClick={() => {
               console.log('=== CONNECTION STATUS DEBUG ===');
               console.log('Room ID:', roomId);
               console.log('Is Host:', isHost);
               console.log('Is Joined:', isJoined);
               console.log('Participants:', participants);
               console.log('Local Stream:', localStreamRef.current);
               console.log('Remote Streams:', remoteStreams);
               
               // Check peer connections
               Object.entries(peerConnectionsRef.current).forEach(([userId, pc]) => {
                 console.log(`Peer Connection ${userId}:`, {
                   signalingState: pc.signalingState,
                   connectionState: pc.connectionState,
                   iceConnectionState: pc.iceConnectionState,
                   hasLocalDescription: !!pc.localDescription,
                   hasRemoteDescription: !!pc.remoteDescription,
                   localDescriptionType: pc.localDescription?.type,
                   remoteDescriptionType: pc.remoteDescription?.type
                 });
               });
               
               // Check video elements
               const videos = document.querySelectorAll('video');
               console.log(`Found ${videos.length} video elements`);
               videos.forEach((video, index) => {
                 console.log(`Video ${index}:`, {
                   srcObject: !!video.srcObject,
                   paused: video.paused,
                   readyState: video.readyState,
                   userId: video.dataset.userId || 'local'
                 });
               });
               
               console.log('=== END CONNECTION STATUS DEBUG ===');
             }}
             className="debug-button"
             style={{ backgroundColor: '#17a2b8', color: 'white' }}
           >
             Status
           </button> */}
          {/* <button
            onClick={() => {
              console.log('=== MANUAL VIDEO TEST ===');

              // Check local stream directly
              if (localStreamRef.current) {
                const videoTrack = localStreamRef.current.getVideoTracks()[0];
                if (videoTrack) {
                  console.log('Local video track status:', {
                    enabled: videoTrack.enabled,
                    readyState: videoTrack.readyState,
                    id: videoTrack.id,
                    kind: videoTrack.kind,
                    muted: videoTrack.muted
                  });

                  // Force fix if needed
                  if (!videoTrack.enabled && videoTrack.readyState === 'live') {
                    console.log('Force fixing local video track');
                    videoTrack.enabled = true;
                    setIsVideoOff(false);
                  }
                }
              }

              const videos = document.querySelectorAll('video');
              videos.forEach((video, index) => {
                console.log(`Video ${index}:`, {
                  srcObject: !!video.srcObject,
                  paused: video.paused,
                  readyState: video.readyState,
                  userId: video.dataset.userId || 'local'
                });
                if (video.srcObject) {
                  const stream = video.srcObject;
                  const tracks = stream.getTracks();
                  console.log(`Stream tracks:`, tracks.map(t => ({
                    kind: t.kind,
                    enabled: t.enabled,
                    readyState: t.readyState,
                    id: t.id,
                    muted: t.muted
                  })));

                  // Force enable all video tracks
                  tracks.forEach(track => {
                    if (track.kind === 'video' && !track.enabled && track.readyState === 'live') {
                      console.log(`Force enabling video track for ${video.dataset.userId || 'local'}`);
                      track.enabled = true;
                    }
                  });

                  // Force play video
                  if (video.paused) {
                    video.play().catch(err => {
                      if (err.name !== 'AbortError') {
                        console.warn('Force play failed:', err);
                      }
                    });
                  }
                }
              });
              console.log('=== END TEST ===');

              // Additional video toggle debugging
              console.log('=== VIDEO TOGGLE DEBUG ===');
              console.log('Local video state:', { isVideoOff });
              console.log('Remote video states:', remoteVideoStates);
              console.log('Peer connections:', Object.keys(peerConnectionsRef.current));

              // Check if video state change events are working
              if (localStreamRef.current) {
                const videoTrack = localStreamRef.current.getVideoTracks()[0];
                console.log('Current video track state:', {
                  enabled: videoTrack?.enabled,
                  readyState: videoTrack?.readyState,
                  muted: videoTrack?.muted
                });
              }

              // Test video state change emission
              console.log('Testing video state change emission...');
              socket.emit('videoStateChange', {
                roomId,
                isVideoOff: !isVideoOff
              });
              console.log('=== END VIDEO TOGGLE DEBUG ===');

              // Test video toggle functionality
              console.log('=== TESTING VIDEO TOGGLE ===');
              if (localStreamRef.current) {
                const videoTracks = localStreamRef.current.getVideoTracks();
                const currentState = videoTracks[0]?.enabled;
                console.log('Current video track enabled:', currentState);

                // Toggle video track
                videoTracks.forEach(track => {
                  track.enabled = !currentState;
                });

                console.log('Video track toggled to:', !currentState);

                // Replace track in peer connections
                Object.values(peerConnectionsRef.current).forEach(peerConnection => {
                  const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
                  if (sender && videoTracks[0]) {
                    console.log('Replacing video track in peer connection for test');
                    sender.replaceTrack(videoTracks[0]).catch(err => {
                      console.error('Test track replacement failed:', err);
                    });
                  }
                });

                // Emit state change
                socket.emit('videoStateChange', {
                  roomId,
                  isVideoOff: currentState
                });

                console.log('Video state change emitted');
              }
              console.log('=== END TESTING VIDEO TOGGLE ===');
            }}
            className="debug-button"
            style={{ backgroundColor: '#ff6b6b', color: 'white' }}
          >
            Debug
          </button> */}
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

export default VideoChat