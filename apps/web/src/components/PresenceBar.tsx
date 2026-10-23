"use client";

import React, { useState } from "react";
import { Copy, Check, Shield, Bot, FileText, Code2, Columns, Globe } from "lucide-react";
import { useRoomStore } from "../store/roomStore";

export type WorkspaceMode = "code" | "split" | "cobrowse";

interface PresenceBarProps {
  workspaceMode: WorkspaceMode;
  onSetWorkspaceMode: (mode: WorkspaceMode) => void;
  onOpenRecap?: () => void;
}

export function PresenceBar({
  workspaceMode,
  onSetWorkspaceMode,
  onOpenRecap,
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
    <header className="h-14 border-b border-white/[0.08] bg-[#090e1f]/75 backdrop-blur-2xl px-4 flex items-center justify-between select-none z-30 shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
      {/* Left: Brand & Room Tag */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-sky-400 flex items-center justify-center font-bold text-white text-xs shadow-lg shadow-purple-500/30 ring-1 ring-white/25">
            P
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-xs tracking-tight text-white leading-none">
              Pairio-Lite
            </span>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5">Pair Master Studio</span>
          </div>
        </div>

        <div className="h-4 w-px bg-white/10 hidden sm:block mx-1" />

        {/* Room Code Pill */}
        <button
          onClick={handleCopyLink}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-mono bg-slate-900/80 hover:bg-slate-800 text-slate-200 rounded-full border border-white/[0.08] transition shadow-sm group"
          title="Click to copy invite link"
        >
          <span className="text-slate-500 text-[11px]">room:</span>
          <span className="font-medium text-slate-200 truncate max-w-[120px]">{roomId}</span>
          {copied ? (
            <Check className="w-3 h-3 text-emerald-400" />
          ) : (
            <Copy className="w-3 h-3 text-slate-400 group-hover:text-slate-200 transition" />
          )}
        </button>

        {/* Live Status Indicator with breathing pulse */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/60 border border-white/[0.06] text-[11px] font-medium text-slate-300 backdrop-blur">
          <span
            className={`w-2 h-2 rounded-full ${
              connectionStatus === "connected"
                ? "bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse"
                : "bg-amber-400 animate-ping"
            }`}
          />
          <span>{connectionStatus === "connected" ? "Live CRDT Synced" : connectionStatus}</span>
        </div>
      </div>

      {/* Center: Apple macOS Segmented Workspace Switcher */}
      <div className="flex items-center p-1 bg-slate-950/90 rounded-full border border-white/[0.08] shadow-inner">
        <button
          onClick={() => onSetWorkspaceMode("code")}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition ${
            workspaceMode === "code"
              ? "bg-gradient-to-r from-slate-800 to-slate-700 text-white shadow-md border border-white/10"
              : "text-slate-400 hover:text-slate-200"
          }`}
          title="Focus on Code Editor"
        >
          <Code2 className="w-3.5 h-3.5 text-sky-400" />
          <span>Code</span>
        </button>

        <button
          onClick={() => onSetWorkspaceMode("split")}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition ${
            workspaceMode === "split"
              ? "bg-gradient-to-r from-indigo-900/80 to-purple-900/80 text-purple-200 shadow-md border border-purple-500/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
          title="Side-by-side Code & Co-Browse Studio"
        >
          <Columns className="w-3.5 h-3.5 text-purple-400" />
          <span>Split Studio</span>
        </button>

        <button
          onClick={() => onSetWorkspaceMode("cobrowse")}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition ${
            workspaceMode === "cobrowse"
              ? "bg-gradient-to-r from-teal-900/80 to-emerald-900/80 text-emerald-200 shadow-md border border-emerald-500/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
          title="Focus on Co-Browse Web Frame & Telestrator"
        >
          <Globe className="w-3.5 h-3.5 text-teal-400" />
          <span>Co-Browse</span>
        </button>
      </div>

      {/* Right: The 3 Seats & Recap */}
      <div className="flex items-center gap-2">
        {/* Seat 1 Host */}
        <div
          className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${
            host
              ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
              : "bg-slate-900/30 border-white/5 text-slate-500"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="truncate max-w-[80px]">{host ? host.name : "Seat 1"}</span>
          <span className="text-[9px] px-1 rounded bg-emerald-900/50 text-emerald-300">Host</span>
        </div>

        {/* Seat 2 Peer */}
        <div
          className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${
            peer
              ? "bg-sky-950/30 border-sky-500/30 text-sky-300"
              : "bg-slate-900/30 border-white/5 text-slate-500"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
          <span className="truncate max-w-[80px]">{peer ? peer.name : "Seat 2"}</span>
          <span className="text-[9px] px-1 rounded bg-sky-900/50 text-sky-300">Peer</span>
        </div>

        {/* Seat 3 Pair Master AI Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-950/40 border border-purple-500/30 text-purple-300 text-xs font-medium">
          <Bot className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
          <span className="hidden xl:inline">Pair Master</span>
          <span className="text-[9px] px-1 rounded bg-purple-900/60 text-purple-200">AI</span>
        </div>

        {/* Recap Button */}
        {onOpenRecap && (
          <button
            onClick={onOpenRecap}
            className="flex items-center gap-1.5 px-3 py-1 text-xs bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-white/[0.08] rounded-full transition shadow-sm font-medium"
            title="View Pair Master Session Recap"
          >
            <FileText className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden md:inline">Recap</span>
          </button>
        )}

        {/* Current User Pill */}
        {currentUser && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/90 rounded-full border border-white/[0.08] text-xs font-medium">
            <span className="text-slate-500 text-[11px]">You:</span>
            <span className="font-semibold" style={{ color: currentUser.color }}>
              {currentUser.name}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
