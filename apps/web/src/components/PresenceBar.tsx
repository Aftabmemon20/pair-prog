"use client";

import React, { useState } from "react";
import { Copy, Check, Shield, Bot, FileText, Code2, Columns, Globe } from "lucide-react";
import { useRoomStore } from "../store/roomStore";

export type WorkspaceMode = "code" | "split" | "cobrowse";

interface PresenceBarProps {
  workspaceMode: WorkspaceMode;
  onSetWorkspaceMode: (mode: WorkspaceMode) => void;
  onOpenRecap?: () => void;
  onRun?: () => void;
  isRunning?: boolean;
  pyodideStatus?: string;
  isTimelineOpen?: boolean;
  onToggleTimeline?: () => void;
}

export function PresenceBar({
  workspaceMode,
  onSetWorkspaceMode,
  onOpenRecap,
  onRun,
  isRunning = false,
  pyodideStatus = "ready",
  isTimelineOpen = true,
  onToggleTimeline,
}: PresenceBarProps) {
  const { roomId, connectionStatus, participants, currentUser } = useRoomStore();
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const host = participants.find((p) => p.role === "host") || (currentUser?.role === "host" ? currentUser : null);
  const peer = participants.find((p) => p.role === "peer") || (currentUser?.role === "peer" ? currentUser : null);

  return (
    <header className="h-16 px-6 border-b border-slate-200/80 bg-white/80 backdrop-blur-md flex items-center justify-between select-none z-30 shrink-0">
      {/* Left: Clean Breadcrumbs & Room ID */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-slate-800 tracking-tight">Overview</span>
          <span className="text-slate-400 font-light">•</span>
          <span className="font-medium text-slate-500">Pair Master Studio</span>
        </div>

        {/* Minimalist Room Code Pill */}
        <button
          onClick={handleCopyLink}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono bg-slate-100 hover:bg-slate-200/80 text-slate-600 rounded-full border border-slate-200/60 transition group ml-1"
          title="Click to copy invite link"
        >
          <span className="text-slate-400">room:</span>
          <span className="font-semibold text-slate-700 truncate max-w-[110px]">{roomId}</span>
          {copied ? (
            <Check className="w-3 h-3 text-emerald-500" />
          ) : (
            <Copy className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition" />
          )}
        </button>

        {/* Live Status indicator */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/70 text-[11px] font-medium text-emerald-700">
          <span
            className={`w-2 h-2 rounded-full ${
              connectionStatus === "connected"
                ? "bg-emerald-500 shadow-[0_0_6px_#10b981] animate-pulse"
                : "bg-amber-400 animate-ping"
            }`}
          />
          <span>{connectionStatus === "connected" ? "Live Synced" : connectionStatus}</span>
        </div>
      </div>

      {/* Center: Minimalist Soft Segmented Switcher */}
      <div className="flex items-center p-1 bg-slate-100/90 rounded-full border border-slate-200/80 shadow-inner">
        <button
          onClick={() => onSetWorkspaceMode("code")}
          className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-medium transition ${
            workspaceMode === "code"
              ? "bg-white text-indigo-600 shadow-sm font-semibold"
              : "text-slate-500 hover:text-slate-800"
          }`}
          title="Focus on Code Editor"
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Code</span>
        </button>

        <button
          onClick={() => onSetWorkspaceMode("split")}
          className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-medium transition ${
            workspaceMode === "split"
              ? "bg-white text-indigo-600 shadow-sm font-semibold"
              : "text-slate-500 hover:text-slate-800"
          }`}
          title="Side-by-side Code & Co-Browse Studio"
        >
          <Columns className="w-3.5 h-3.5" />
          <span>Split Studio</span>
        </button>

        <button
          onClick={() => onSetWorkspaceMode("cobrowse")}
          className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-medium transition ${
            workspaceMode === "cobrowse"
              ? "bg-white text-indigo-600 shadow-sm font-semibold"
              : "text-slate-500 hover:text-slate-800"
          }`}
          title="Focus on Co-Browse Web Frame & Telestrator"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Co-Browse</span>
        </button>
      </div>

      {/* Right: Contributor Avatars, Recap & Primary Run Action */}
      <div className="flex items-center gap-3">
        {/* Contributor Avatars Stack (like reference image) */}
        <div className="hidden lg:flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">3 seats</span>
          <div className="flex -space-x-2 overflow-hidden">
            <div
              className="inline-block h-7 w-7 rounded-full ring-2 ring-white bg-emerald-100 text-emerald-700 font-bold text-[10px] flex items-center justify-center shadow-sm"
              title={host ? `Host: ${host.name}` : "Seat 1: Host"}
            >
              {host ? host.name.slice(0, 1).toUpperCase() : "A"}
            </div>
            <div
              className="inline-block h-7 w-7 rounded-full ring-2 ring-white bg-sky-100 text-sky-700 font-bold text-[10px] flex items-center justify-center shadow-sm"
              title={peer ? `Peer: ${peer.name}` : "Seat 2: Peer"}
            >
              {peer ? peer.name.slice(0, 1).toUpperCase() : "B"}
            </div>
            <div
              className="inline-block h-7 w-7 rounded-full ring-2 ring-white bg-indigo-100 text-indigo-600 text-[10px] flex items-center justify-center shadow-sm"
              title="Seat 3: Pair Master AI"
            >
              <Bot className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Recap Pill */}
        {onOpenRecap && (
          <button
            onClick={onOpenRecap}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200/80 text-slate-700 rounded-full border border-slate-200/60 transition shadow-sm font-medium"
            title="View Pair Master Session Recap"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Recap</span>
          </button>
        )}

        {/* Primary Run Action Button (Like Add Task + in Reference) */}
        {onRun && (
          <button
            onClick={onRun}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-xs rounded-full shadow-md shadow-indigo-500/20 disabled:opacity-50 transition transform active:scale-95"
            title="Execute Code in Pyodide Sandbox (Ctrl+Enter)"
          >
            {isRunning ? (
              <span className="animate-spin text-sm">⟳</span>
            ) : (
              <span className="text-sm font-bold">▶</span>
            )}
            <span>{isRunning ? "Running..." : "Run"}</span>
            <span className="text-[10px] text-indigo-200 font-mono ml-0.5 hidden sm:inline">
              Ctrl+↵
            </span>
          </button>
        )}
      </div>
    </header>
  );
}
