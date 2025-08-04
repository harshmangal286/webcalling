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

  // Add state to track ongoing offer creation to prevent collisions
  const [ongoingOffers, setOngoingOffers] = useState(new Set());

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



  const getUserMedia = useCallback(async (constraints = {
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: 'user',
    },
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

  // Setup connection with another user
  const createPeerConnection = useCallback((userId) => {
    try {
      console.log('Creating peer connection for:', userId);

      const configuration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
      };

      const peerConnection = new RTCPeerConnection(configuration);
      
      // Add connection state logging
      peerConnection.onsignalingstatechange = () => {
        console.log(`Signaling state (${userId}):`, peerConnection.signalingState);
        
        // Log additional details for debugging
        console.log(`Peer connection ${userId} state details:`, {
          signalingState: peerConnection.signalingState,
          connectionState: peerConnection.connectionState,
          iceConnectionState: peerConnection.iceConnectionState,
          hasLocalDescription: !!peerConnection.localDescription,
          hasRemoteDescription: !!peerConnection.remoteDescription,
          localDescriptionType: peerConnection.localDescription?.type,
          remoteDescriptionType: peerConnection.remoteDescription?.type
        });
      };

      // Improved track handling
      peerConnection.ontrack = (event) => {
        console.log("ontrack fired from user:", userId, "Streams:", event.streams);
        console.log("ontrack event details:", {
          track: event.track,
          streams: event.streams,
          trackKind: event.track?.kind,
          trackEnabled: event.track?.enabled,
          trackReadyState: event.track?.readyState
        });

        if (!event.streams || !event.streams[0]) {
          console.warn("Received ontrack without stream");
          return;
        }

        const [newStream] = event.streams;
        if (!newStream) {
          console.warn("No stream found in ontrack event");
          return;
        }

        // Don't add our own stream as remote
        if (userId === (localUserId || socket?.id)) {
          console.log("Ignoring own stream in ontrack");
          return;
        }

        // Log stream details
        const tracks = newStream.getTracks();
        console.log(`Stream received from ${userId}:`, {
          trackCount: tracks.length,
          tracks: tracks.map(t => ({
            kind: t.kind,
            enabled: t.enabled,
            readyState: t.readyState,
            id: t.id
          }))
        });

        setRemoteStreams(prevStreams => {
          const exists = prevStreams.find(s => s.userId === userId);
          if (exists) {
            console.log(`Updating existing stream for ${userId} (track replacement)`);
            // Update the existing stream with the new stream
            return prevStreams.map(s =>
              s.userId === userId ? { ...s, stream: newStream } : s
            );
          }
          console.log(`Adding new stream for ${userId}`);
          return [...prevStreams, { userId, stream: newStream }];
        });

        // Set track.onended for cleanup and ensure tracks are enabled
        newStream.getTracks().forEach(track => {
          // Ensure track is enabled
          if (!track.enabled && track.readyState === 'live') {
            console.log(`Enabling ${track.kind} track for user ${userId}`);
            track.enabled = true;
          }
          
          track.onended = () => {
            console.log("Track ended:", track.kind, "for user:", userId);
          };
          track.onmute = () => {
            console.log("Track muted:", track.kind, "for user:", userId);
          };
          track.onunmute = () => {
            console.log("Track unmuted:", track.kind, "for user:", userId);
          };
          
          // Handle track replacement events
          track.onended = () => {
            console.log("Track ended:", track.kind, "for user:", userId);
            // Force refresh remote streams when track ends
            setRemoteStreams(prev => prev.map(s => 
              s.userId === userId ? { ...s, stream: newStream } : s
            ));
          };
        });
      };

      peerConnection.oniceconnectionstatechange = () => {
        console.log(`ICE connection state (${userId}):`, peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'failed') {
          console.log('ICE connection failed, attempting restart...');
          peerConnection.restartIce();
        } else if (peerConnection.iceConnectionState === 'connected' || peerConnection.iceConnectionState === 'completed') {
          console.log(`ICE connection established with ${userId}`);
        } else if (peerConnection.iceConnectionState === 'checking') {
          console.log(`ICE connection checking with ${userId}`);
        }
      };

      peerConnection.onconnectionstatechange = () => {
        console.log(`Connection state (${userId}):`, peerConnection.connectionState);
        if (peerConnection.connectionState === 'failed') {
          // Handle connection failure inline to avoid circular dependency
          console.log('Handling connection failure for:', userId);
          
          // Clean up failed connection
          if (peerConnectionsRef.current[userId]) {
            peerConnectionsRef.current[userId].close();
            delete peerConnectionsRef.current[userId];
          }

          // Remove failed streams
          setRemoteStreams(prev => prev.filter(s => s.userId !== userId));
        } else if (peerConnection.connectionState === 'connected') {
          console.log(`Connection established with ${userId}`);
        } else if (peerConnection.connectionState === 'connecting') {
          console.log(`Connection connecting with ${userId}`);
        }
      };

      // Handle ICE candidate generation
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && roomId) {
          console.log('Sending ICE candidate to:', userId);
          socket.emit('candidate', {
            to: userId,
            candidate: event.candidate,
            roomId
          });
        }
      };

      // Add local tracks to the peer connection
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        
        console.log('Local stream details:', {
          hasVideoTrack: !!videoTrack,
          hasAudioTrack: !!audioTrack,
          videoTrackEnabled: videoTrack?.enabled,
          audioTrackEnabled: audioTrack?.enabled,
          videoTrackReadyState: videoTrack?.readyState,
          audioTrackReadyState: audioTrack?.readyState
        });
        
        if (videoTrack) {
          // Ensure video track is enabled
          if (!videoTrack.enabled) {
            console.log('Enabling video track before adding to peer connection');
            videoTrack.enabled = true;
          }
          console.log('Adding video track to peer connection');
          const sender = peerConnection.addTrack(videoTrack, localStreamRef.current);
          console.log('Video track sender:', sender);
        }
        if (audioTrack) {
          // Ensure audio track is enabled
          if (!audioTrack.enabled) {
            console.log('Enabling audio track before adding to peer connection');
            audioTrack.enabled = true;
          }
          console.log('Adding audio track to peer connection');
          const sender = peerConnection.addTrack(audioTrack, localStreamRef.current);
          console.log('Audio track sender:', sender);
        }
      } else {
        console.warn('No local stream available for peer connection');
      }

      // Store the connection
      peerConnectionsRef.current[userId] = peerConnection;
      
      // Add timeout to restart ICE if connection doesn't establish
      setTimeout(() => {
        if (peerConnection.iceConnectionState === 'new' || peerConnection.iceConnectionState === 'checking') {
          console.log(`ICE connection timeout for ${userId}, restarting ICE...`);
          peerConnection.restartIce();
        }
      }, 10000); // 10 second timeout
      
      return peerConnection;
    } catch (error) {
      console.error('Error creating peer connection:', error);
      throw error;
    }
  }, [roomId, localUserId, socket]);

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

    } catch (error) {
      console.error('Join room error:', error);
      setError(`Failed to join room: ${error.message}`);
    }
  };

  // Initialize WebRTC call
  const initiateCall = useCallback(async (userId) => {
    try {
      console.log('Initiating call with:', userId);

      // Check if we're already creating an offer for this user
      if (ongoingOffers.has(userId)) {
        console.log('Already creating offer for:', userId, '- skipping');
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

      // Ensure we have a local stream
      if (!localStreamRef.current || !localStreamRef.current.active) {
        console.log('Getting local stream before initiating call');
        localStreamRef.current = await getUserMedia();
        if (!localStreamRef.current) {
          console.error('Failed to get local stream for call initiation');
          return;
        }
      }

      // Create or reuse peer connection
      let peerConnection = peerConnectionsRef.current[userId];
      if (!peerConnection) {
        peerConnection = createPeerConnection(userId);
      } else {
        console.log('Reusing existing peer connection for:', userId);
        // If connection is not stable, reset it
        if (peerConnection.signalingState !== 'stable') {
          console.log('Resetting unstable peer connection for:', userId);
          peerConnection.close();
          delete peerConnectionsRef.current[userId];
          peerConnection = createPeerConnection(userId);
        }
      }

      // Add a small delay to reduce offer collision probability
      await new Promise(resolve => setTimeout(resolve, Math.random() * 200));

      // Mark that we're creating an offer for this user
      setOngoingOffers(prev => new Set(prev).add(userId));

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

      // Remove from ongoing offers after a short delay
      setTimeout(() => {
        setOngoingOffers(prev => {
          const newSet = new Set(prev);
          newSet.delete(userId);
          return newSet;
        });
      }, 1000);

    } catch (error) {
      console.error('Failed to initiate call:', error);
      
      // Clean up failed connection
      if (peerConnectionsRef.current[userId]) {
        peerConnectionsRef.current[userId].close();
        delete peerConnectionsRef.current[userId];
      }

      // Remove failed streams
      setRemoteStreams(prev => prev.filter(s => s.userId !== userId));

      // Remove from ongoing offers on error
      setOngoingOffers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  }, [roomId, socket, getUserMedia, createPeerConnection, ongoingOffers]);

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

  // Add clearChat function
  const clearChat = () => {
    setChatMessages([]);
  };

  // Add missing functions
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

  const renderRemoteVideos = () => {
    console.log('Rendering remote streams:', remoteStreams);
    console.log('Remote video states:', remoteVideoStates);
    console.log('Participants:', participants);

    return remoteStreams.map((streamInfo) => {
      if (!streamInfo || !streamInfo.userId || !streamInfo.stream) {
        console.log('Skipping invalid stream info:', streamInfo);
        return null;
      }

      // Don't render self as remote video
      if (streamInfo.userId === (localUserId || socket?.id)) {
        console.log('Skipping own stream as remote video');
        return null;
      }

      const participant = participants.find(p => p?.id === streamInfo.userId);
      const username = participant?.username || 'Participant';

      console.log("Rendering video for:", username, "with stream:", streamInfo.stream);

      return (
        <div key={streamInfo.userId} className="video-container">
          {remoteVideoStates[streamInfo.userId] ? (
            <div className="video-error">
              <span className="material-symbols-outlined">videocam_off</span>
              <p>Camera turned off</p>
            </div>
          ) : (
            <video
              key={`video-${streamInfo.userId}-${Date.now()}`}
              data-user-id={streamInfo.userId}
              autoPlay
              playsInline
              muted={false}
              className="video-item"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              ref={(el) => {
                if (el && streamInfo.stream) {
                  // Always set srcObject to ensure it's current
                  el.srcObject = streamInfo.stream;
                  console.log(`Video ${streamInfo.userId} loaded with stream:`, streamInfo.stream);
                  
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
            />
          )}
          <div className="participant-name">{username}</div>
        </div>
      );
    }).filter(Boolean);
  };

  const getVideoContainerClass = () => {
    const totalParticipants = remoteStreams.length + 1; // +1 for local stream
    if (totalParticipants === 1) return 'videos single';
    if (totalParticipants === 2) return 'videos pair';
    return 'videos multiple';
  };

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

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      
      // Check current state
      const currentTrackEnabled = videoTracks[0]?.enabled;
      const newTrackEnabled = !currentTrackEnabled;
      
      console.log('Toggling video:', { current: currentTrackEnabled, new: newTrackEnabled });
      
      // Set track state
      videoTracks.forEach(track => {
        track.enabled = newTrackEnabled;
      });
      
      // Update state
      setIsVideoOff(!newTrackEnabled);
      
      console.log('Video toggled:', { trackEnabled: newTrackEnabled, isVideoOff: !newTrackEnabled });

      // Replace track in all peer connections to ensure remote peers get the updated track
      Object.values(peerConnectionsRef.current).forEach(peerConnection => {
        const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender && videoTracks[0]) {
          console.log('Replacing video track in peer connection');
          sender.replaceTrack(videoTracks[0]).catch(err => {
            console.error('Error replacing video track:', err);
          });
        }
      });

      // Let others know I turned my camera off/on
      socket.emit('videoStateChange', {
        roomId,
        isVideoOff: !newTrackEnabled
      });
      
      // Force re-enable if turning on and track is still disabled
      if (newTrackEnabled) {
        setTimeout(() => {
          const track = videoTracks[0];
          if (track && !track.enabled && track.readyState === 'live') {
            console.log('Force re-enabling video track');
            track.enabled = true;
            setIsVideoOff(false);
          }
        }, 100);
      }
      
      // Force refresh remote streams after a delay to ensure changes propagate
      setTimeout(() => {
        setRemoteStreams(prev => prev.map(streamInfo => ({
          ...streamInfo,
          stream: streamInfo.stream
        })));
      }, 200);
    }
  };

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

  const endCall = () => {
    if (isHost) {
      socket.emit('endCall', { roomId });
      leaveCall();
      clearChat();
    }
  };

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

    socket.on('roomJoined', ({ roomId, users, isHost }) => {
      console.log('Room joined event received:', { roomId, users, isHost });

      if (!roomId || !Array.isArray(users)) {
        console.error('Invalid room data received:', { roomId, users });
        return;
      }

      setRoomId(roomId);
      // Also store roomId in socket for backup
      socket.roomId = roomId;
      setIsHost(isHost);
      setParticipants(users.filter(user => user && user.id));
      setConnectionStatus('connected');
      setIsJoined(true);
      clearChat();

      // Initialize connections with existing users immediately
      users.forEach((user, index) => {
        if (user && user.id && user.id !== socket.id) {
          console.log('Initializing connection with existing user:', user.id);
          if (!peerConnectionsRef.current[user.id]) {
            // Stagger the call initiation to avoid overwhelming the system
            setTimeout(async () => {
              console.log('Calling initiateCall for user:', user.id, 'with roomId:', roomId);
              try {
                await initiateCall(user.id);
                console.log('Successfully initiated call with:', user.id);
              } catch (error) {
                console.error('Failed to initiate call with:', user.id, error);
                // Retry once after a delay
                setTimeout(async () => {
                  try {
                    console.log('Retrying call initiation with:', user.id);
                    await initiateCall(user.id);
                  } catch (retryError) {
                    console.error('Retry failed for call initiation with:', user.id, retryError);
                  }
                }, 2000);
              }
            }, 500 + (index * 200)); // Stagger by 200ms per user
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
          
          // We need to handle this by either:
          // 1. Rolling back our offer and accepting theirs, or
          // 2. Rejecting their offer and keeping ours
          
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

            // Remove from ongoing offers since we received an answer
            setOngoingOffers(prev => {
              const newSet = new Set(prev);
              newSet.delete(from);
              return newSet;
            });
          } else if (peerConnection.signalingState === 'stable') {
            // Connection is already stable, answer might be a duplicate
            console.log('Connection already stable, ignoring duplicate answer from:', from);
            
            // Remove from ongoing offers since connection is established
            setOngoingOffers(prev => {
              const newSet = new Set(prev);
              newSet.delete(from);
              return newSet;
            });
          } else {
            console.warn('Cannot set remote answer - wrong signaling state:', peerConnection.signalingState);
            console.log('Peer connection state:', {
              signalingState: peerConnection.signalingState,
              connectionState: peerConnection.connectionState,
              iceConnectionState: peerConnection.iceConnectionState
            });
            
            // Only reset if it's in an unexpected state (not stable or have-local-offer)
            if (peerConnection.signalingState !== 'stable' && peerConnection.signalingState !== 'have-local-offer') {
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

      // All existing users (including host) initiate calls with the new user
      console.log('Initiating call with new user:', user.id);
      // Small delay to ensure everything is set up
      setTimeout(() => {
        initiateCall(user.id);
      }, 500);
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
  }, [isHost, initiateCall, applyBufferedCandidates, resetPeerConnection]);

  // Add useEffect to automatically initiate calls when participants are added
  useEffect(() => {
    if (isJoined && participants.length > 0) {
      console.log('Participants changed, checking for automatic call initiation');
      
      participants.forEach((participant, index) => {
        if (participant && participant.id && participant.id !== socket?.id) {
          // Check if we already have a peer connection
          if (!peerConnectionsRef.current[participant.id]) {
            console.log('No peer connection found for:', participant.id, '- initiating call');
            // Add a delay to avoid overwhelming the system
            setTimeout(async () => {
              try {
                await initiateCall(participant.id);
                console.log('Automatic call initiation successful for:', participant.id);
              } catch (error) {
                console.error('Automatic call initiation failed for:', participant.id, error);
              }
            }, 1000 + (index * 500)); // Stagger calls by 500ms
          } else {
            console.log('Peer connection already exists for:', participant.id);
          }
        }
      });
    }
  }, [participants, isJoined, socket?.id, initiateCall]);

  // Add socket connection status check
  useEffect(() => {
    const checkSocketConnection = () => {
      if (!socket || !socket.connected) {
        console.warn('Socket disconnected, attempting to reconnect...');
        setConnectionStatus('disconnected');
        // Don't set error immediately, let socket.io handle reconnection
      } else {
        setConnectionStatus('connected');
        setError(null); // Clear any connection errors
      }
    };

    // Check less frequently to reduce console spam
    const interval = setInterval(checkSocketConnection, 10000);
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

      // Remove from ongoing offers
      setOngoingOffers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
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
    
    // Ensure we have a local stream
    if (!localStreamRef.current) {
      console.log('No local stream available for rendering');
      return <div className="video-error">No camera stream</div>;
    }
    
    return (
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className="video-item local"
        style={{ transform: 'scaleX(-1)', objectFit: 'cover' }}
        onLoadedMetadata={(e) => {
          console.log('Local video metadata loaded');
          // Set srcObject if not already set
          if (!e.target.srcObject && localStreamRef.current) {
            e.target.srcObject = localStreamRef.current;
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
          // Set srcObject if not already set
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
          ) : (
            <div className="video-container local">
              {renderLocalVideo()}
            </div>
          )}

          {/* Remote Videos */}
          {renderRemoteVideos()}
          
          {/* Show placeholder when no remote streams */}
          {remoteStreams.length === 0 && participants.length > 1 && (
            <div className="video-container" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              background: '#2a2a2a',
              color: 'white',
              fontSize: '1.2rem'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
                <div>Waiting for other participants...</div>
                <div style={{ fontSize: '0.9rem', marginTop: '0.5rem', opacity: 0.7 }}>
                  {participants.length - 1} participant(s) in room
                </div>
              </div>
            </div>
          )}
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
           <button
             onClick={() => {
               console.log('=== VIDEO DISPLAY DEBUG ===');
               console.log('Remote streams:', remoteStreams);
               console.log('Remote video states:', remoteVideoStates);
               console.log('Participants:', participants);
               console.log('Local stream:', localStreamRef.current);
               console.log('Peer connections:', Object.keys(peerConnectionsRef.current));
               
               // Check if streams are being received
               Object.entries(peerConnectionsRef.current).forEach(([userId, pc]) => {
                 console.log(`Peer connection ${userId}:`, {
                   signalingState: pc.signalingState,
                   connectionState: pc.connectionState,
                   iceConnectionState: pc.iceConnectionState,
                   hasRemoteDescription: !!pc.remoteDescription,
                   hasLocalDescription: !!pc.localDescription
                 });
               });
               
               // Check video elements
               const videos = document.querySelectorAll('video');
               console.log(`Found ${videos.length} video elements:`, videos);
               videos.forEach((video, index) => {
                 console.log(`Video ${index}:`, {
                   srcObject: !!video.srcObject,
                   paused: video.paused,
                   readyState: video.readyState,
                   userId: video.dataset.userId || 'local',
                   className: video.className,
                   style: video.style.cssText
                 });
               });
               
               // Force refresh remote streams
               console.log('Forcing refresh of remote streams...');
               setRemoteStreams(prev => [...prev]);
               
               console.log('=== END VIDEO DISPLAY DEBUG ===');
             }}
             className="debug-button"
             style={{ backgroundColor: '#ff6b6b', color: 'white' }}
           >
             Debug Video
           </button>
           <button
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