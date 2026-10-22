"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Globe,
  Sparkles,
  PenTool,
  Eraser,
  ExternalLink,
  VideoOff,
  ArrowRight,
  MonitorPlay,
  Lock,
  RotateCw,
  Eye,
  Cast,
} from "lucide-react";
import { getStroke } from "perfect-freehand";
import * as Y from "yjs";
import { useRoomStore } from "../store/roomStore";

export interface FreehandStroke {
  id: string;
  points: number[][];
  color: string;
  user: string;
}

interface CoBrowseStudioProps {
  roomId: string;
  ydoc?: Y.Doc | null;
  onAskAgent: (prompt: string) => void;
  onClose?: () => void;
}

// Convert stroke points into smooth SVG path data
function getSvgPathFromStroke(stroke: number[][]): string {
  if (!stroke.length) return "";
  const d = stroke.reduce(
    (acc: (string | number)[], [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...stroke[0], "Q"]
  );
  d.push("Z");
  return d.join(" ");
}

const PRESET_TABS = [
  { name: "WeMakeDevs", url: "https://www.wemakedevs.org" },
  { name: "Python Docs", url: "https://docs.python.org/3/library/exceptions.html" },
  { name: "FastAPI", url: "https://fastapi.tiangolo.com/" },
  { name: "LiveKit Docs", url: "https://docs.livekit.io/" },
];

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ],
};

export function CoBrowseStudio({
  roomId,
  ydoc,
  onAskAgent,
  onClose,
}: CoBrowseStudioProps) {
  const { currentUser } = useRoomStore();

  // Media Stream state
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isSharingTab, setIsSharingTab] = useState(false);
  const [isPeerSharing, setIsPeerSharing] = useState(false);
  const [sharerName, setSharerName] = useState<string>("");
  const [activeTabName, setActiveTabName] = useState<string>("Shared Browser Tab");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  // Webview state
  const [currentUrl, setCurrentUrl] = useState("https://www.wemakedevs.org");
  const [urlInput, setUrlInput] = useState("https://www.wemakedevs.org");
  const [iframeKey, setIframeKey] = useState(0);

  // Telestrator Drawing state
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [selectedColor, setSelectedColor] = useState("#f43f5e"); // Apple Rose
  const [currentPoints, setCurrentPoints] = useState<number[][]>([]);
  const [strokes, setStrokes] = useState<FreehandStroke[]>([]);
  const isPointerDownRef = useRef(false);

  // Determine current active video stream (either local if sharing, or remote if peer is sharing)
  const activeVideoStream = isSharingTab ? localStream : isPeerSharing ? remoteStream : null;

  // Video Callback Ref: ensures video immediately binds stream and calls play() without black frames
  const setVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      videoElementRef.current = node;
      if (node && activeVideoStream) {
        if (node.srcObject !== activeVideoStream) {
          node.srcObject = activeVideoStream;
        }
        node.onloadedmetadata = () => {
          node.play().catch(() => {});
        };
        node.play().catch(() => {});
      }
    },
    [activeVideoStream]
  );

  // When active stream changes, also ensure the video element plays
  useEffect(() => {
    if (videoElementRef.current && activeVideoStream) {
      if (videoElementRef.current.srcObject !== activeVideoStream) {
        videoElementRef.current.srcObject = activeVideoStream;
      }
      videoElementRef.current.play().catch(() => {});
    }
  }, [activeVideoStream]);

  // Sync telestrator strokes via Yjs shared array
  useEffect(() => {
    if (!ydoc) return;
    const yTabStrokes = ydoc.getArray<FreehandStroke>("tab_freehand_strokes");
    setStrokes(yTabStrokes.toArray());

    const observer = () => {
      setStrokes(yTabStrokes.toArray());
    };

    yTabStrokes.observe(observer);
    return () => {
      yTabStrokes.unobserve(observer);
    };
  }, [ydoc]);

  // Sync Co-Browse Tab URL across peers via Yjs
  useEffect(() => {
    if (!ydoc) return;
    const tabMap = ydoc.getMap("shared_tab");
    const savedUrl = tabMap.get("url") as string;
    if (savedUrl && savedUrl !== currentUrl) {
      setCurrentUrl(savedUrl);
      setUrlInput(savedUrl);
    }

    const observer = () => {
      const updatedUrl = tabMap.get("url") as string;
      if (updatedUrl && updatedUrl !== currentUrl) {
        setCurrentUrl(updatedUrl);
        setUrlInput(updatedUrl);
        setIframeKey((prev) => prev + 1);
      }
    };

    tabMap.observe(observer);
    return () => {
      tabMap.unobserve(observer);
    };
  }, [ydoc, currentUrl]);

  const updateSharedUrl = (url: string) => {
    let formatted = url.trim();
    if (!formatted.startsWith("http://") && !formatted.startsWith("https://")) {
      formatted = `https://${formatted}`;
    }
    setCurrentUrl(formatted);
    setUrlInput(formatted);
    setIframeKey((prev) => prev + 1);
    if (ydoc) {
      const tabMap = ydoc.getMap("shared_tab");
      tabMap.set("url", formatted);
      tabMap.set("updated_by", currentUser?.name || "Dev A");
    }
  };

  // Listen for companion extension auto-sync events
  useEffect(() => {
    const handleExtensionMessage = (e: MessageEvent) => {
      if (e.data && e.data.action === "AUTO_SYNC_SHARED_URL" && e.data.url) {
        updateSharedUrl(e.data.url);
      }
    };
    window.addEventListener("message", handleExtensionMessage);

    const runtimeListener = (msg: any) => {
      if (msg && msg.action === "AUTO_SYNC_SHARED_URL" && msg.url) {
        updateSharedUrl(msg.url);
      }
    };
    if (typeof window !== "undefined" && (window as any).chrome?.runtime?.onMessage) {
      (window as any).chrome.runtime.onMessage.addListener(runtimeListener);
    }

    return () => {
      window.removeEventListener("message", handleExtensionMessage);
      if (typeof window !== "undefined" && (window as any).chrome?.runtime?.onMessage) {
        (window as any).chrome.runtime.onMessage.removeListener(runtimeListener);
      }
    };
  }, []);

  // -------------------------------------------------------------
  // WebRTC P2P Screen/Tab Streaming via Yjs Signaling
  // -------------------------------------------------------------
  useEffect(() => {
    if (!ydoc) return;
    const webrtcMap = ydoc.getMap("cobrowse_webrtc");

    const handleWebRTCState = async () => {
      const active = webrtcMap.get("active") as boolean;
      const sharer = webrtcMap.get("sharer") as string;
      const offer = webrtcMap.get("offer") as any;
      const answer = webrtcMap.get("answer") as any;
      const tabTitle = webrtcMap.get("tab_title") as string;

      if (!active) {
        // Stream stopped
        setIsPeerSharing(false);
        setRemoteStream(null);
        if (pcRef.current && !isSharingTab) {
          pcRef.current.close();
          pcRef.current = null;
        }
        return;
      }

      // If another peer is sharing
      if (sharer && sharer !== currentUser?.name) {
        setIsPeerSharing(true);
        setSharerName(sharer);
        if (tabTitle) setActiveTabName(tabTitle);

        // If peer sent an offer and we haven't answered yet
        if (offer && (!pcRef.current || pcRef.current.signalingState === "closed")) {
          try {
            const pc = new RTCPeerConnection(ICE_SERVERS);
            pcRef.current = pc;

            pc.ontrack = (event) => {
              if (event.streams && event.streams[0]) {
                setRemoteStream(event.streams[0]);
              }
            };

            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);

            webrtcMap.set("answer", {
              type: ans.type,
              sdp: ans.sdp,
              from: currentUser?.name || "Peer",
            });
          } catch (err) {
            console.warn("Peer WebRTC answer error:", err);
          }
        }
      }

      // If we are Dev A (the sharer) and received Dev B's answer
      if (isSharingTab && answer && pcRef.current && pcRef.current.signalingState === "have-local-offer") {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.warn("Sharer setRemoteDescription error:", err);
        }
      }
    };

    webrtcMap.observe(handleWebRTCState);
    handleWebRTCState();

    return () => {
      webrtcMap.unobserve(handleWebRTCState);
    };
  }, [ydoc, currentUser, isSharingTab]);

  // Handle Tab / Screen Casting
  const startTabShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser" as any,
          frameRate: { ideal: 60, max: 60 },
        },
        audio: false,
      });

      setLocalStream(stream);
      setIsSharingTab(true);

      const track = stream.getVideoTracks()[0];
      const title = track?.label || "Shared Browser Tab";
      setActiveTabName(title);

      track.onended = () => {
        stopTabShare();
      };

      // Set up P2P WebRTC Connection to broadcast to Dev B
      if (ydoc) {
        try {
          const pc = new RTCPeerConnection(ICE_SERVERS);
          pcRef.current = pc;

          stream.getTracks().forEach((t) => pc.addTrack(t, stream));

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          const webrtcMap = ydoc.getMap("cobrowse_webrtc");
          webrtcMap.set("active", true);
          webrtcMap.set("sharer", currentUser?.name || "Dev A");
          webrtcMap.set("tab_title", title);
          webrtcMap.set("offer", { type: offer.type, sdp: offer.sdp });
          webrtcMap.delete("answer");
        } catch (webrtcErr) {
          console.warn("Could not initiate P2P WebRTC broadcast:", webrtcErr);
        }
      }
    } catch (err: any) {
      if (err.name !== "NotAllowedError") {
        console.error("Tab capture error:", err);
      }
    }
  };

  const stopTabShare = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setIsSharingTab(false);

    if (ydoc) {
      const webrtcMap = ydoc.getMap("cobrowse_webrtc");
      webrtcMap.set("active", false);
      webrtcMap.delete("offer");
      webrtcMap.delete("answer");
    }
  };

  // Clean up streams on unmount
  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      if (pcRef.current) {
        pcRef.current.close();
      }
    };
  }, [localStream]);

  // Yjs Remote Click Synchronization (Dev B -> Dev A)
  const [remoteRipple, setRemoteRipple] = useState<{ x: number; y: number; sender: string } | null>(null);

  useEffect(() => {
    if (!ydoc) return;
    const remoteMap = ydoc.getMap("remote_control");
    const observer = () => {
      const clickData: any = remoteMap.get("click");
      if (clickData && clickData.sender !== currentUser?.name) {
        window.postMessage({ type: "PAIRIO_REMOTE_CLICK", data: clickData }, "*");
        setRemoteRipple({
          x: clickData.xRatio * 100,
          y: clickData.yRatio * 100,
          sender: clickData.sender || "Peer",
        });
        setTimeout(() => setRemoteRipple(null), 800);
      }
    };

    remoteMap.observe(observer);
    return () => {
      remoteMap.unobserve(observer);
    };
  }, [ydoc, currentUser]);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDrawingMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;

    setRemoteRipple({
      x: xRatio * 100,
      y: yRatio * 100,
      sender: currentUser?.name || "You",
    });
    setTimeout(() => setRemoteRipple(null), 800);

    if (ydoc) {
      const remoteMap = ydoc.getMap("remote_control");
      remoteMap.set("click", {
        xRatio,
        yRatio,
        sender: currentUser?.name || "Dev B",
        ts: Date.now(),
      });
    }
  };

  // Drawing event handlers
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawingMode || !svgRef.current) return;
    isPointerDownRef.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure || 0.5;

    setCurrentPoints([[x, y, pressure]]);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isPointerDownRef.current || !isDrawingMode || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure || 0.5;

    setCurrentPoints((prev) => [...prev, [x, y, pressure]]);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;

    if (currentPoints.length > 1) {
      const newStroke: FreehandStroke = {
        id: `tab_stroke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        points: currentPoints,
        color: selectedColor,
        user: currentUser?.name || "Dev A",
      };

      if (ydoc) {
        const yTabStrokes = ydoc.getArray<FreehandStroke>("tab_freehand_strokes");
        yTabStrokes.push([newStroke]);
      } else {
        setStrokes((prev) => [...prev, newStroke]);
      }
    }

    setCurrentPoints([]);
  };

  const clearStrokes = () => {
    if (ydoc) {
      const yTabStrokes = ydoc.getArray<FreehandStroke>("tab_freehand_strokes");
      yTabStrokes.delete(0, yTabStrokes.length);
    } else {
      setStrokes([]);
    }
  };

  const handleAskSeat3AboutTab = () => {
    const isLive = isSharingTab || isPeerSharing;
    const prompt = isLive
      ? `[Visual Co-Browse Context]: We are streaming an active tab ("${activeTabName}"). Please inspect how this UI interacts with our Python inventory codebase, identify any errors or gaps, and propose an architecture diagram.`
      : `[Documentation Co-Browse Context]: We are reviewing the reference page at ${currentUrl}. Please explain how this applies to our current Python inventory codebase and recommend relevant fixes.`;

    onAskAgent(prompt);
  };

  const currentOutline = currentPoints.length
    ? getStroke(currentPoints, {
        size: 5,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
      })
    : [];

  const isAnyStreamActive = Boolean(isSharingTab || isPeerSharing);

  return (
    <div className="flex flex-col h-full bg-[#030712] text-slate-100 select-none overflow-hidden relative border-l border-white/[0.06]">
      {/* Apple Safari macOS Style Window Header */}
      <div className="h-12 bg-slate-900/90 backdrop-blur-xl border-b border-white/[0.08] px-3.5 flex items-center justify-between gap-3 shrink-0">
        {/* Left: Authentic macOS Traffic Lights */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onClose}
              className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] cursor-pointer hover:opacity-80 transition"
              title="Close Panel"
            />
            <span
              className="w-3 h-3 rounded-full bg-[#febc2e] border border-[#d89e24] cursor-pointer hover:opacity-80 transition"
              title="Minimize"
            />
            <span
              className="w-3 h-3 rounded-full bg-[#28c840] border border-[#1aab29] cursor-pointer hover:opacity-80 transition"
              title="Expand"
            />
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-300 text-[11px] font-medium shadow-sm">
            <Globe className="w-3 h-3 text-sky-400" />
            <span>Co-Browse Safari</span>
          </div>
        </div>

        {/* Center: Frosted Glass Unified Search / Address Capsule */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateSharedUrl(urlInput);
          }}
          className="flex-1 max-w-md flex items-center bg-slate-950/80 hover:bg-slate-950 border border-white/[0.08] focus-within:border-sky-500/80 rounded-full px-3.5 py-1 text-xs text-slate-200 transition shadow-inner group"
        >
          <Lock className="w-3 h-3 text-emerald-400 shrink-0 mr-1.5" />
          <input
            type="text"
            value={
              isSharingTab
                ? `You are broadcasting: ${activeTabName}`
                : isPeerSharing
                ? `${sharerName} is broadcasting: ${activeTabName}`
                : urlInput
            }
            disabled={isAnyStreamActive}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Search or enter website URL..."
            className="bg-transparent border-none outline-none w-full text-slate-200 placeholder-slate-500 disabled:opacity-85 font-mono text-[11px]"
          />
          {!isAnyStreamActive && (
            <button
              type="submit"
              className="text-slate-400 group-hover:text-sky-400 transition ml-1 p-0.5 rounded hover:bg-slate-800"
              title="Navigate URL"
            >
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </form>

        {/* Right: Quick Tab Presets & Streaming Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {!isAnyStreamActive && (
            <div className="hidden xl:flex items-center gap-1 bg-slate-950/60 p-0.5 rounded-full border border-white/[0.06]">
              {PRESET_TABS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => updateSharedUrl(preset.url)}
                  className={`px-2.5 py-0.5 text-[10px] rounded-full transition font-medium ${
                    currentUrl.includes(preset.name.toLowerCase().replace(/\s+/g, ""))
                      ? "bg-slate-800 text-sky-300 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          )}

          {/* Cast Tab / Stop Stream Button */}
          {isSharingTab ? (
            <button
              onClick={stopTabShare}
              className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 transition font-medium shadow-sm animate-pulse"
              title="Stop Sharing Tab"
            >
              <VideoOff className="w-3.5 h-3.5" />
              <span>Stop Stream</span>
            </button>
          ) : isPeerSharing ? (
            <div className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-full bg-sky-500/15 border border-sky-500/40 text-sky-300 font-medium shadow-sm animate-pulse">
              <Eye className="w-3.5 h-3.5" />
              <span>Receiving Stream</span>
            </div>
          ) : (
            <button
              onClick={startTabShare}
              className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium shadow-md shadow-emerald-950/40 transition ring-1 ring-emerald-400/30"
              title="Cast active Chrome tab into the room (WebRTC 60 FPS HD)"
            >
              <MonitorPlay className="w-3.5 h-3.5" />
              <span>Cast Tab</span>
            </button>
          )}

          {/* Inspect with Seat 3 AI */}
          <button
            onClick={handleAskSeat3AboutTab}
            className="flex items-center gap-1.5 px-3 py-1 text-xs text-purple-200 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 rounded-full transition font-medium shadow-sm"
            title="Ask Seat 3 AI to inspect this tab with the current Python code"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden md:inline">Inspect with Seat 3</span>
          </button>
        </div>
      </div>

      {/* Floating Apple-Pencil Style Telestrator Palette */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-slate-900/90 backdrop-blur-2xl border border-white/10 px-3.5 py-1.5 rounded-full shadow-2xl ring-1 ring-black/40">
        <button
          onClick={() => setIsDrawingMode(!isDrawingMode)}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full font-semibold transition ${
            isDrawingMode
              ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30"
              : "text-slate-300 hover:text-white hover:bg-slate-800"
          }`}
          title="Toggle Telestrator Pen (Draw on Tab or Stream)"
        >
          <PenTool className="w-3.5 h-3.5" />
          <span>{isDrawingMode ? "Drawing Active" : "Telestrator"}</span>
        </button>

        {isDrawingMode && (
          <>
            <div className="h-3.5 w-px bg-white/10 mx-1" />
            {[
              { label: "Rose", hex: "#f43f5e" },
              { label: "Cyan", hex: "#06b6d4" },
              { label: "Emerald", hex: "#10b981" },
              { label: "Amber", hex: "#f59e0b" },
            ].map((c) => (
              <button
                key={c.hex}
                onClick={() => setSelectedColor(c.hex)}
                className={`w-4 h-4 rounded-full border transition transform ${
                  selectedColor === c.hex
                    ? "border-white scale-125 ring-2 ring-white/40 shadow-sm"
                    : "border-transparent opacity-60 hover:opacity-100"
                }`}
                style={{ backgroundColor: c.hex }}
                title={c.label}
              />
            ))}

            <div className="h-3.5 w-px bg-white/10 mx-1" />
            <button
              onClick={clearStrokes}
              className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-full transition"
              title="Clear Markings"
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Main Display Canvas Container */}
      <div
        onClick={handleContainerClick}
        className={`flex-1 relative overflow-hidden bg-[#050914] flex items-center justify-center ${
          !isDrawingMode ? "cursor-pointer" : ""
        }`}
      >
        {isAnyStreamActive ? (
          // Active WebRTC Video Stream (Callback ref guarantees immediate playback)
          <div className="w-full h-full relative flex items-center justify-center bg-black">
            <video
              ref={setVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain bg-black pointer-events-none"
            />

            {/* Subtle floating watermark banner indicating WebRTC status */}
            <div className="absolute top-3 left-4 px-2.5 py-1 rounded-full bg-slate-900/80 backdrop-blur border border-white/10 text-[10px] text-slate-300 flex items-center gap-1.5 shadow-lg pointer-events-none">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                {isSharingTab
                  ? "Broadcasting Live WebRTC Tab (60 FPS HD)"
                  : `Watching ${sharerName}'s Live Stream`}
              </span>
            </div>
          </div>
        ) : (
          // Interactive Webview Frame with X-Frame-Options graceful fallback
          <div className="w-full h-full flex flex-col items-center justify-center relative">
            {/youtube\.com|google\.com|twitter\.com|x\.com|github\.com/i.test(currentUrl) ? (
              <div className="flex flex-col items-center justify-center p-8 text-center max-w-md bg-slate-900/90 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-2xl">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 shadow-inner">
                  <MonitorPlay className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-slate-100 mb-1.5">WebRTC Video Stream Ready</h3>
                <p className="text-xs text-slate-400 mb-5 leading-relaxed">
                  External site security headers (<code className="text-amber-300 font-mono text-[10px]">X-Frame-Options: SAMEORIGIN</code>) prevent static embedding. Click <strong>Cast Tab</strong> to stream it live at 60 FPS!
                </p>
                <button
                  onClick={startTabShare}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-semibold shadow-lg shadow-emerald-950/40 hover:from-emerald-500 hover:to-teal-500 transition"
                >
                  Cast Tab Now
                </button>
              </div>
            ) : (
              <iframe
                key={iframeKey}
                src={currentUrl}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                className="w-full h-full border-none bg-white"
                title="Co-Browse Web Frame"
              />
            )}
          </div>
        )}

        {/* Visual Remote Click Ripple */}
        {remoteRipple && (
          <div
            className="absolute z-30 pointer-events-none transition-all duration-500 ease-out flex flex-col items-center"
            style={{
              left: `${remoteRipple.x}%`,
              top: `${remoteRipple.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div className="w-8 h-8 rounded-full border-2 border-cyan-400 bg-cyan-500/30 animate-ping" />
            <span className="text-[10px] font-bold text-cyan-300 bg-slate-900/95 px-2 py-0.5 rounded-full shadow mt-1 whitespace-nowrap border border-cyan-500/30">
              {remoteRipple.sender} Clicked
            </span>
          </div>
        )}

        {/* Telestrator Freehand SVG Overlay */}
        <svg
          ref={svgRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={`absolute inset-0 w-full h-full z-10 ${
            isDrawingMode
              ? "pointer-events-auto cursor-crosshair touch-none"
              : "pointer-events-none"
          }`}
          style={{ touchAction: "none" }}
        >
          {/* Synchronized Telestrator Strokes */}
          {strokes.map((stroke) => {
            const outline = getStroke(stroke.points, {
              size: 5,
              thinning: 0.5,
              smoothing: 0.5,
              streamline: 0.5,
            });
            const pathData = getSvgPathFromStroke(outline);
            return (
              <path
                key={stroke.id}
                d={pathData}
                fill={stroke.color}
                opacity={0.92}
              />
            );
          })}

          {/* Current In-Flight Stroke */}
          {currentOutline.length > 0 && (
            <path
              d={getSvgPathFromStroke(currentOutline)}
              fill={selectedColor}
              opacity={0.95}
            />
          )}
        </svg>
      </div>

      {/* Footer Status Ribbon */}
      <div className="h-7 bg-slate-900/90 backdrop-blur border-t border-white/[0.08] px-4 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>
            {isAnyStreamActive
              ? `WebRTC P2P Stream: ${activeTabName} (60 FPS HD)`
              : "Interactive Co-Browse Sandbox (Synced URL)"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span>Strokes: {strokes.length}</span>
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-slate-400 hover:text-sky-400 transition"
          >
            <span>Open in Tab</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
