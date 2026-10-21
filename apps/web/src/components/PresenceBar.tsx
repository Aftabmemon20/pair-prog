"use client";

import React, { useState } from "react";
import { Copy, Check, Users, Shield, Bot, Radio, FileText } from "lucide-react";
import { useRoomStore } from "../store/roomStore";

interface PresenceBarProps {
  onOpenRecap?: () => void;
}

export function PresenceBar({ onOpenRecap }: PresenceBarProps) {
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

  const statusColors = {
    connected: "bg-emerald-500",
    connecting: "bg-amber-500 animate-pulse",
    reconnecting: "bg-amber-500 animate-pulse",
    disconnected: "bg-rose-500",
  };

  const statusLabels = {
    connected: "Connected",
    connecting: "Connecting...",
    reconnecting: "Reconnecting...",
    disconnected: "Disconnected",
  };

  return (
    <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 flex items-center justify-between select-none">
      {/* Left: Brand & Room ID */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center font-bold text-white text-xs shadow-md shadow-purple-500/20">
            P
          </div>
          <span className="font-semibold text-sm tracking-tight text-slate-100 hidden sm:inline">
            Pairio-Lite
          </span>
        </div>

        <div className="h-4 w-px bg-slate-800 hidden sm:block" />

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono bg-slate-800 hover:bg-slate-700/80 text-slate-300 rounded-md border border-slate-700/60 transition"
            title="Click to copy invite link"
          >
            <span className="text-slate-400">room:</span>
            <span className="font-semibold text-slate-200">{roomId}</span>
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
          </button>
        </div>

        {/* Connection status badge */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700/40 text-[11px] font-medium text-slate-300">
          <span className={`w-2 h-2 rounded-full ${statusColors[connectionStatus]}`} />
          <span>{statusLabels[connectionStatus]}</span>
        </div>
      </div>

      {/* Center: The 3 Seats */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Seat 1: Dev A (Host) */}
        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs ${
          host ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-200" : "bg-slate-800/40 border-slate-800 text-slate-500 border-dashed"
        }`}>
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="font-medium">{host ? host.name : "Seat 1 (Empty)"}</span>
          <span className="text-[10px] px-1 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700/50">Host</span>
        </div>

        {/* Seat 2: Dev B (Peer) */}
        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs ${
          peer ? "bg-sky-950/40 border-sky-800/60 text-sky-200" : "bg-slate-800/40 border-slate-800 text-slate-500 border-dashed"
        }`}>
          <div className="w-2 h-2 rounded-full bg-sky-400" />
          <span className="font-medium">{peer ? peer.name : "Seat 2 (Empty)"}</span>
          <span className="text-[10px] px-1 rounded bg-sky-900/60 text-sky-300 border border-sky-700/50">Peer</span>
        </div>

        {/* Seat 3: Pair Master (AI Facilitator) */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-purple-950/40 border border-purple-800/60 text-purple-200 text-xs">
          <Bot className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
          <span className="font-medium hidden md:inline">Pair Master</span>
          <span className="text-[10px] px-1 rounded bg-purple-900/60 text-purple-300 border border-purple-700/50">AI</span>
        </div>
      </div>

      {/* Right: Recap & User identity tag */}
      <div className="flex items-center gap-2 text-xs">
        {onOpenRecap && (
          <button
            onClick={onOpenRecap}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-purple-950/40 hover:bg-purple-900/60 text-purple-200 border border-purple-800/60 rounded-md transition shadow-sm"
            title="End pairing session & view Pair Master recap"
          >
            <FileText className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline font-medium">Recap</span>
          </button>
        )}

        {currentUser && (
          <div className="flex items-center gap-2 px-2 py-1 bg-slate-800/60 rounded-md border border-slate-700/40">
            <span className="text-slate-400">You:</span>
            <span className="font-semibold" style={{ color: currentUser.color }}>
              {currentUser.name}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
