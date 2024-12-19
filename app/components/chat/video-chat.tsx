"use client";

import { useEffect, useRef, useState } from "react";
import { socket } from "@/app/lib/socket";

interface VideoChatProps {
  roomId: string;
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function VideoChat({ roomId, userId, isOpen, onClose }: VideoChatProps) {
  const [peers, setPeers] = useState<{ [key: string]: RTCPeerConnection }>({});
  const [streams, setStreams] = useState<{ [key: string]: MediaStream }>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // 检查设备是否可用
  const checkMediaDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        return { video: true, audio: true };
      } catch (videoErr) {
        console.log('Video not available, falling back to audio only');
        return { video: false, audio: true };
      }
    } catch (err) {
      console.error('Error checking media devices:', err);
      throw err;
    }
  };

  // 初始化媒体流
  const initializeMediaStream = async () => {
    try {
      const devices = await checkMediaDevices();
      setIsAudioOnly(!devices.video);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: devices.video ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        } : false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setError(null);
      
      // 通知其他用户我加入了视频聊天
      socket.emit("join-video-chat", { roomId, userId, isAudioOnly: !devices.video });
    } catch (err) {
      let errorMessage = 'Error accessing media devices. ';
      if (err instanceof Error) {
        if (err.name === 'NotFoundError') {
          errorMessage = 'No camera or microphone found. Please connect a device and try again.';
        } else if (err.name === 'NotAllowedError') {
          errorMessage = 'Please allow access to your camera and/or microphone to use chat.';
        } else if (err.name === 'NotReadableError') {
          errorMessage = 'Your camera or microphone is already in use by another application.';
        } else {
          errorMessage += err.message;
        }
      }
      setError(errorMessage);
      console.error('Media stream error:', err);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    initializeMediaStream();

    // 监听新用户加入视频聊天
    socket.on("user-joined-video", async ({ userId: peerId }) => {
      const peerConnection = createPeerConnection(peerId);
      setPeers((prev) => ({ ...prev, [peerId]: peerConnection }));

      // 创建并发送提议
      if (localStream) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit("video-offer", {
          roomId,
          userId,
          targetUserId: peerId,
          offer,
        });
      }
    });

    // 处理收到的提议
    socket.on("video-offer", async ({ userId: peerId, offer }) => {
      const peerConnection = createPeerConnection(peerId);
      setPeers((prev) => ({ ...prev, [peerId]: peerConnection }));

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket.emit("video-answer", {
        roomId,
        userId,
        targetUserId: peerId,
        answer,
      });
    });

    // 处理收到的应答
    socket.on("video-answer", async ({ userId: peerId, answer }) => {
      const peerConnection = peers[peerId];
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    // 处理ICE候选
    socket.on("ice-candidate", async ({ userId: peerId, candidate }) => {
      const peerConnection = peers[peerId];
      if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    // 处理用户离开
    socket.on("user-left-video", ({ userId: peerId }) => {
      if (peers[peerId]) {
        peers[peerId].close();
        const newPeers = { ...peers };
        delete newPeers[peerId];
        setPeers(newPeers);

        const newStreams = { ...streams };
        delete newStreams[peerId];
        setStreams(newStreams);
      }
    });

    return () => {
      // 清理
      localStream?.getTracks().forEach((track) => track.stop());
      Object.values(peers).forEach((peer) => peer.close());
      socket.off("user-joined-video");
      socket.off("video-offer");
      socket.off("video-answer");
      socket.off("ice-candidate");
      socket.off("user-left-video");
      socket.emit("leave-video-chat", { roomId, userId });
    };
  }, [isOpen, roomId, userId]);

  const createPeerConnection = (peerId: string) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    // 添加本地流
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });
    }

    // 处理远程流
    peerConnection.ontrack = (event) => {
      setStreams((prev) => ({
        ...prev,
        [peerId]: event.streams[0],
      }));
    };

    // 处理ICE候选
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          roomId,
          userId,
          targetUserId: peerId,
          candidate: event.candidate,
        });
      }
    };

    return peerConnection;
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-4 w-full max-w-6xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">
            {isAudioOnly ? 'Audio Chat' : 'Video Chat'}
            {isAudioOnly && ' (Video unavailable)'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ×
          </button>
        </div>
        
        {error ? (
          <div className="p-4 bg-red-100 text-red-700 rounded-lg mb-4">
            {error}
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => initializeMediaStream()}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Retry with video
              </button>
              <button
                onClick={async () => {
                  setIsAudioOnly(true);
                  try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                      audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                      },
                      video: false
                    });
                    setLocalStream(stream);
                    setError(null);
                    socket.emit("join-video-chat", { roomId, userId, isAudioOnly: true });
                  } catch (err) {
                    setError('Failed to start audio-only mode. Please check your microphone.');
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Try audio only
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {/* Local video/audio */}
              <div className="relative">
                {isAudioOnly ? (
                  <div className="w-full h-48 rounded-lg bg-gray-800 flex items-center justify-center">
                    <div className="text-white text-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      <span>Audio Only</span>
                    </div>
                  </div>
                ) : (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full rounded-lg bg-black"
                  />
                )}
                <div className="absolute bottom-2 left-2 text-white text-sm bg-black bg-opacity-50 px-2 py-1 rounded">
                  You {isAudioOnly ? '(Audio only)' : ''}
                </div>
              </div>
              {/* Remote participants */}
              {Object.entries(streams).map(([peerId, stream]) => (
                <div key={peerId} className="relative">
                  {stream.getVideoTracks().length > 0 ? (
                    <video
                      autoPlay
                      playsInline
                      className="w-full rounded-lg bg-black"
                      ref={(el) => {
                        if (el) el.srcObject = stream;
                      }}
                    />
                  ) : (
                    <div className="w-full h-48 rounded-lg bg-gray-800 flex items-center justify-center">
                      <div className="text-white text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        <span>Audio Only</span>
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 text-white text-sm bg-black bg-opacity-50 px-2 py-1 rounded">
                    Peer {peerId}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex justify-center gap-4 mt-4">
          <button
            onClick={toggleMute}
            className={`p-2 rounded-full ${
              isMuted ? "bg-red-500" : "bg-gray-200"
            }`}
            disabled={!!error}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {isMuted ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
              )}
            </svg>
          </button>
          {!isAudioOnly && (
            <button
              onClick={toggleVideo}
              className={`p-2 rounded-full ${
                isVideoOff ? "bg-red-500" : "bg-gray-200"
              }`}
              disabled={!!error}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                {isVideoOff ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                )}
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
} 