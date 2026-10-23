"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  PhoneCall,
  PhoneOff,
  Sparkles,
  Maximize2,
  Minimize2,
  AlertCircle,
  Volume2,
} from "lucide-react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useTracks,
  useLocalParticipant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { useRoomStore } from "../store/roomStore";

interface CallBarProps {
  roomId: string;
}

function LiveKitVideoGrid() {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const { setActiveScreenStream } = useRoomStore();

  // Automatically lift any active LiveKit screen share track to the main Co-Browse Studio canvas
  useEffect(() => {
    const screenTrackRef = tracks.find((t) => t.source === Track.Source.ScreenShare);
    if (screenTrackRef) {
      const mediaStreamTrack = screenTrackRef.publication?.track?.mediaStreamTrack;
      if (mediaStreamTrack) {
        const stream = new MediaStream([mediaStreamTrack]);
        const sharer = screenTrackRef.participant.name || screenTrackRef.participant.identity;
        setActiveScreenStream(stream, sharer);
        return;
      }
    }
    // Only clear if no LiveKit screen track is active
    setActiveScreenStream(null);
  }, [tracks, setActiveScreenStream]);

  if (tracks.length === 0) {
    return (
      <div className="flex items-center justify-center p-3 text-xs text-slate-400 bg-slate-900/90 rounded-lg border border-slate-800">
        <span>No active video feeds. Camera or screen share is off.</span>
      </div>
    );
  }

  return (
    <div className="flex gap-2 p-2 max-w-full overflow-x-auto bg-slate-950/90 backdrop-blur rounded-xl border border-slate-800 shadow-2xl">
      {tracks.map((trackRef) => {
        const isScreen = trackRef.source === Track.Source.ScreenShare;
        return (
          <div
            key={`${trackRef.participant.identity}-${trackRef.source}`}
            className={`relative w-44 h-28 bg-slate-900 rounded-lg overflow-hidden border shadow-md group flex-shrink-0 ${
              isScreen ? "border-sky-500/80 ring-1 ring-sky-500/40" : "border-slate-700/80"
            }`}
          >
            <VideoTrack trackRef={trackRef} className="w-full h-full object-cover" />
            <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded bg-slate-950/85 backdrop-blur text-[10px] text-slate-200 border border-slate-800 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="truncate max-w-[85px]">
                {trackRef.participant.name || trackRef.participant.identity}
              </span>
              {isScreen && (
                <span className="text-[9px] text-sky-400 font-mono font-bold">(Screen)</span>
              )}
            </div>

            {isScreen && (
              <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-sky-950/80 border border-sky-500/40 text-[9px] text-sky-300 font-medium">
                Live in Studio
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CallBar({ roomId }: CallBarProps) {
  const { currentUser } = useRoomStore();

  const [isInCall, setIsInCall] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string>("");
  const [isConfigured, setIsConfigured] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const [callStatus, setCallStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [callError, setCallError] = useState<string | null>(null);

  // Local media stream for offline / preview fallback
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Fetch LiveKit access token from backend
  useEffect(() => {
    if (!roomId) return;

    const fetchToken = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const identity = currentUser?.name || "Developer";
        const res = await fetch(`${apiUrl}/rooms/${roomId}/livekit/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identity: identity,
            name: identity,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setToken(data.token);
          setServerUrl(data.server_url);
          setIsConfigured(data.configured);
        }
      } catch (err: any) {
        console.error("Failed to fetch LiveKit token:", err);
      }
    };

    fetchToken();
  }, [roomId, currentUser]);

  const handleJoinCall = () => {
    setIsInCall(true);
    setIsVideoOn(true);
    setIsAudioOn(true);
    setCallStatus("connecting");
    setCallError(null);
  };

  // Handle local webcam/mic toggle when in preview mode (unconfigured)
  useEffect(() => {
    if (isConfigured || !isInCall) {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      return;
    }

    if (isVideoOn && !localStreamRef.current) {
      navigator.mediaDevices
        ?.getUserMedia({ video: true, audio: isAudioOn })
        .then((stream) => {
          localStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          setCallStatus("connected");
        })
        .catch((err) => {
          console.warn("Could not access camera in local preview:", err);
          setCallError(err.message || "Camera permission denied");
          setCallStatus("error");
          setIsVideoOn(false);
        });
    } else if (!isVideoOn && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
  }, [isInCall, isVideoOn, isAudioOn, isConfigured]);

  const handleToggleScreenShare = async () => {
    if (isConfigured) {
      setIsScreenSharing(!isScreenSharing);
      return;
    }

    // Local screen share test via standard getDisplayMedia
    try {
      if (!isScreenSharing) {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setIsScreenSharing(true);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        stream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
        };
      } else {
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => t.stop());
          localStreamRef.current = null;
        }
        setIsScreenSharing(false);
      }
    } catch {
      setIsScreenSharing(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 select-none">
      {/* Video feeds drawer */}
      {isInCall && !isMinimized && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
          {callError && (
            <div className="mb-2 p-2 bg-rose-950/90 border border-rose-800 text-rose-300 text-xs rounded-lg flex items-center gap-1.5 shadow-lg">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{callError}</span>
            </div>
          )}

          {isConfigured && token && serverUrl ? (
            <LiveKitRoom
              serverUrl={serverUrl}
              token={token}
              connect={isInCall}
              video={isVideoOn}
              audio={isAudioOn}
              screen={isScreenSharing}
              data-lk-theme="default"
              onConnected={() => {
                setCallStatus("connected");
                setCallError(null);
              }}
              onDisconnected={() => {
                setCallStatus("idle");
                setIsInCall(false);
              }}
              onError={(err) => {
                console.error("LiveKit connection error:", err);
                setCallStatus("error");
                setCallError(err.message || "Failed to connect to LiveKit Cloud");
              }}
            >
              <RoomAudioRenderer />
              <LiveKitVideoGrid />
            </LiveKitRoom>
          ) : (
            /* Local preview webcam bubble */
            <div className="p-2.5 bg-slate-950/90 backdrop-blur rounded-xl border border-slate-800 shadow-2xl flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-amber-300">
                <span className="flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  LiveKit Local Preview
                </span>
                <span className="text-[10px] text-slate-400">Add credentials in .env</span>
              </div>

              {(isVideoOn || isScreenSharing) ? (
                <div className="relative w-52 h-32 bg-slate-900 rounded-lg overflow-hidden border border-slate-700 shadow-inner">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded bg-slate-950/80 backdrop-blur text-[10px] text-slate-200 border border-slate-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>{currentUser?.name || "You"}</span>
                    {isScreenSharing && <span className="text-sky-400 font-mono">(Sharing)</span>}
                  </div>
                </div>
              ) : (
                <div className="w-52 h-20 bg-slate-900/80 rounded-lg border border-slate-800 flex flex-col items-center justify-center text-slate-400 gap-1.5">
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-bold text-xs">
                    {(currentUser?.name || "D").charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[11px]">Camera is off</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating Call Control Dock */}
      <div className="flex items-center gap-1.5 p-1.5 bg-[#090e21]/80 backdrop-blur-2xl border border-white/[0.12] rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
        {!isInCall ? (
          /* Start Call Button */
          <button
            onClick={handleJoinCall}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs rounded-xl shadow-md shadow-emerald-950/30 transition group ring-1 ring-emerald-400/30"
            title="Start Pair Call (WebRTC Voice, Video, and Screen Share)"
          >
            <PhoneCall className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span>Join Call</span>
          </button>
        ) : (
          /* Active Call Controls */
          <>
            {/* Live Status indicator */}
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/80 rounded-lg text-[10px] border border-slate-700/60">
              <span className={`w-1.5 h-1.5 rounded-full ${callStatus === "connected" ? "bg-emerald-400" : callStatus === "connecting" ? "bg-amber-400 animate-pulse" : "bg-rose-400"}`} />
              <span className="text-slate-300 font-medium">
                {callStatus === "connected" ? "LiveKit" : callStatus === "connecting" ? "Connecting..." : "Error"}
              </span>
            </div>
            {/* Mic Toggle */}
            <button
              onClick={() => setIsAudioOn(!isAudioOn)}
              className={`p-2 rounded-xl transition ${
                isAudioOn
                  ? "bg-slate-800 hover:bg-slate-700 text-slate-200"
                  : "bg-rose-950/80 border border-rose-800/80 text-rose-300 hover:bg-rose-900"
              }`}
              title={isAudioOn ? "Mute Microphone" : "Unmute Microphone"}
            >
              {isAudioOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>

            {/* Video Camera Toggle */}
            <button
              onClick={() => setIsVideoOn(!isVideoOn)}
              className={`p-2 rounded-xl transition ${
                isVideoOn
                  ? "bg-slate-800 hover:bg-slate-700 text-slate-200"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
              }`}
              title={isVideoOn ? "Turn Camera Off" : "Turn Camera On"}
            >
              {isVideoOn ? <Video className="w-4 h-4 text-emerald-400" /> : <VideoOff className="w-4 h-4" />}
            </button>

            {/* Screen Share Toggle */}
            <button
              onClick={handleToggleScreenShare}
              className={`p-2 rounded-xl transition ${
                isScreenSharing
                  ? "bg-sky-950/80 border border-sky-700 text-sky-300 ring-2 ring-sky-500/20"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
              }`}
              title={isScreenSharing ? "Stop Sharing Screen" : "Share Screen"}
            >
              <Monitor className={`w-4 h-4 ${isScreenSharing ? "text-sky-400" : ""}`} />
            </button>

            {/* Minimize/Maximize feeds */}
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-2 rounded-xl bg-slate-800/60 text-slate-400 hover:text-slate-200 transition"
              title={isMinimized ? "Show Video Feeds" : "Minimize Feeds"}
            >
              {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
            </button>

            <div className="h-4 w-px bg-slate-800 mx-0.5" />

            {/* Leave Call */}
            <button
              onClick={() => {
                setIsInCall(false);
                setIsVideoOn(false);
                setIsScreenSharing(false);
              }}
              className="p-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-950/30 transition group"
              title="Leave Call"
            >
              <PhoneOff className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
