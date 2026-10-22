"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Globe,
  Share2,
  Sparkles,
  PenTool,
  Eraser,
  ExternalLink,
  RotateCw,
  VideoOff,
  Layers,
  ArrowRight,
  MonitorPlay,
  CheckCircle2,
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
  { name: "Python Docs", url: "https://docs.python.org/3/library/exceptions.html" },
  { name: "FastAPI Reference", url: "https://fastapi.tiangolo.com/" },
  { name: "LiveKit WebRTC Docs", url: "https://docs.livekit.io/" },
];

export function CoBrowseStudio({
  roomId,
  ydoc,
  onAskAgent,
  onClose,
}: CoBrowseStudioProps) {
  const { currentUser } = useRoomStore();

  // Tab Stream state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isSharingTab, setIsSharingTab] = useState(false);
  const [activeTabName, setActiveTabName] = useState<string>("Active Chrome Tab");

  // Webview fallback state
  const [currentUrl, setCurrentUrl] = useState("https://docs.python.org/3/library/exceptions.html");
  const [urlInput, setUrlInput] = useState("https://docs.python.org/3/library/exceptions.html");
  const [iframeKey, setIframeKey] = useState(0);

  // Telestrator Drawing state
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [selectedColor, setSelectedColor] = useState("#f43f5e"); // Electric red default for telestrator
  const [currentPoints, setCurrentPoints] = useState<number[][]>([]);
  const [strokes, setStrokes] = useState<FreehandStroke[]>([]);
  const isPointerDownRef = useRef(false);

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
  }, [ydoc]);

  const updateSharedUrl = (url: string) => {
    setCurrentUrl(url);
    setUrlInput(url);
    setIframeKey((prev) => prev + 1);
    if (ydoc) {
      const tabMap = ydoc.getMap("shared_tab");
      tabMap.set("url", url);
      tabMap.set("updated_by", currentUser?.name || "Dev A");
    }
  };

  // Listen for extension auto-sync events from the active tab
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

  // Yjs Remote Click Synchronization (Dev B -> Dev A)
  const [remoteRipple, setRemoteRipple] = useState<{ x: number; y: number; sender: string } | null>(null);


  useEffect(() => {
    if (!ydoc) return;
    const remoteMap = ydoc.getMap("remote_control");
    const observer = () => {
      const clickData: any = remoteMap.get("click");
      if (clickData && clickData.sender !== currentUser?.name) {
        // Forward event to Extension content script on Host machine
        window.postMessage({ type: "PAIRIO_REMOTE_CLICK", data: clickData }, "*");

        // Render visual ripple for peer
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

    // Show instant local ripple
    setRemoteRipple({
      x: xRatio * 100,
      y: yRatio * 100,
      sender: currentUser?.name || "You",
    });
    setTimeout(() => setRemoteRipple(null), 800);

    // Broadcast click to peer over Yjs
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


  // Handle Tab Casting via getDisplayMedia
  const startTabShare = async () => {
    try {
      // Prompt user to select specific browser tab
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser" as any,
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsSharingTab(true);

      const track = stream.getVideoTracks()[0];
      if (track) {
        const settings = track.getSettings();
        setActiveTabName(track.label || "Shared Browser Tab");
        track.onended = () => {
          stopTabShare();
        };
      }
    } catch (err: any) {
      if (err.name !== "NotAllowedError") {
        console.error("Tab capture error:", err);
      }
    }
  };

  const stopTabShare = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsSharingTab(false);
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
    const prompt = isSharingTab
      ? `[Visual Co-Browse Context]: I am sharing an active browser tab ("${activeTabName}"). Please inspect how the UI and network flow relate to our current code in inventory.py, explain any bugs or gaps, and produce an architecture diagram.`
      : `[Documentation Co-Browse Context]: I am reviewing the documentation at ${currentUrl}. Please explain how this reference applies to our current Python inventory codebase and recommend relevant fixes.`;

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

  return (
    <div className="flex flex-col h-full bg-slate-950 border-l border-slate-800 text-slate-100 select-none overflow-hidden relative">
      {/* Studio Header & Navigation Bar */}
      <div className="h-11 bg-slate-900 border-b border-slate-800 px-3 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold shrink-0">
            <Globe className="w-3.5 h-3.5" />
            <span>Co-Browse</span>
          </div>

          {/* URL / Source Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateSharedUrl(urlInput);
            }}
            className="flex-1 max-w-sm flex items-center bg-slate-950/80 border border-slate-700/80 rounded-md px-2 py-0.5 text-xs text-slate-200 focus-within:border-emerald-500 transition"
          >
            <input
              type="text"
              value={isSharingTab ? `Streaming: ${activeTabName}` : urlInput}
              disabled={isSharingTab}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://..."
              className="bg-transparent border-none outline-none w-full text-slate-200 placeholder-slate-500 disabled:opacity-75 font-mono text-[11px]"
            />
            {!isSharingTab && (
              <button
                type="submit"
                className="text-slate-400 hover:text-slate-200 ml-1 p-0.5"
                title="Navigate"
              >
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </form>

          {/* Preset Buttons */}
          {!isSharingTab && (
            <div className="hidden lg:flex items-center gap-1">
              {PRESET_TABS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => {
                    updateSharedUrl(preset.url);
                  }}
                  className="px-2 py-0.5 text-[10px] text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 rounded transition"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Share / Stop Browser Tab Stream */}
          {isSharingTab ? (
            <button
              onClick={stopTabShare}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-rose-950/80 border border-rose-600 text-rose-200 hover:bg-rose-900 transition font-medium"
              title="Stop Sharing Browser Tab"
            >
              <VideoOff className="w-3.5 h-3.5" />
              <span>Stop Cast</span>
            </button>
          ) : (
            <button
              onClick={startTabShare}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm transition"
              title="Cast any active Chrome tab (YouTube, Docs, Localhost) into the room"
            >
              <MonitorPlay className="w-3.5 h-3.5" />
              <span>Cast Tab</span>
            </button>
          )}

          {/* Ask Seat 3 AI to Inspect */}
          <button
            onClick={handleAskSeat3AboutTab}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-purple-200 bg-purple-950/80 hover:bg-purple-900 border border-purple-700/80 rounded-md shadow-sm transition font-medium"
            title="Ask Seat 3 AI to inspect this tab alongside the Python code"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Inspect with Seat 3</span>
          </button>
        </div>
      </div>

      {/* Floating Telestrator Annotation Bar */}
      <div className="absolute top-14 left-4 z-20 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-2.5 py-1 rounded-full shadow-lg">
        <button
          onClick={() => setIsDrawingMode(!isDrawingMode)}
          className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium transition ${
            isDrawingMode
              ? "bg-rose-600 text-white shadow-sm"
              : "text-slate-300 hover:text-white hover:bg-slate-800"
          }`}
          title="Toggle Telestrator Pen (Draw on Tab)"
        >
          <PenTool className="w-3 h-3" />
          <span>{isDrawingMode ? "Drawing ON" : "Telestrator"}</span>
        </button>

        {isDrawingMode && (
          <>
            <div className="h-3 w-px bg-slate-700 mx-0.5" />
            {/* Color Swatches */}
            {[
              { label: "Red", hex: "#f43f5e" },
              { label: "Cyan", hex: "#06b6d4" },
              { label: "Emerald", hex: "#10b981" },
              { label: "Amber", hex: "#f59e0b" },
            ].map((c) => (
              <button
                key={c.hex}
                onClick={() => setSelectedColor(c.hex)}
                className={`w-3.5 h-3.5 rounded-full border transition ${
                  selectedColor === c.hex
                    ? "border-white scale-125 ring-2 ring-white/30"
                    : "border-transparent opacity-70 hover:opacity-100"
                }`}
                style={{ backgroundColor: c.hex }}
                title={c.label}
              />
            ))}

            <div className="h-3 w-px bg-slate-700 mx-0.5" />
            <button
              onClick={clearStrokes}
              className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition"
              title="Clear Telestrator Markings"
            >
              <Eraser className="w-3 h-3" />
            </button>
          </>
        )}
      </div>

      {/* Main Display Canvas Container */}
      <div
        onClick={handleContainerClick}
        className={`flex-1 relative overflow-hidden bg-slate-950 flex items-center justify-center ${
          !isDrawingMode ? "cursor-pointer" : ""
        }`}
      >
        {isSharingTab ? (
          // Active Video Stream of Shared Tab
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain bg-black pointer-events-none"
          />
        ) : (
          // Interactive Webview Frame or Blocked Domain Guidance
          <div className="w-full h-full flex flex-col items-center justify-center relative">
            {/youtube\.com|google\.com|twitter\.com|x\.com|github\.com/i.test(currentUrl) ? (
              <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-md">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3">
                  <MonitorPlay className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-100 mb-1">WebRTC Screen Stream Active</h3>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  YouTube security headers (<code className="text-amber-300 font-mono text-[10px]">X-Frame-Options</code>) block static iframes.
                </p>
                <div className="flex flex-col gap-2 w-full text-left text-xs bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold">✓</span>
                    <span>Chrome is streaming YouTube at 60 FPS!</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-[10px] font-bold">✓</span>
                    <span>Use Telestrator (✏️) to annotate over it!</span>
                  </div>
                </div>
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
            <span className="text-[10px] font-bold text-cyan-300 bg-slate-900/90 px-1.5 py-0.5 rounded shadow mt-1 whitespace-nowrap">
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
                opacity={0.9}
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

      {/* Footer Info Ribbon */}
      <div className="h-6 bg-slate-900/90 border-t border-slate-800/80 px-3 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>
            {isSharingTab
              ? `Live WebRTC Tab: ${activeTabName} (60 FPS)`
              : "Interactive Webview Sandbox"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span>Strokes Synced: {strokes.length}</span>
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition"
          >
            <span>Open in Tab</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
