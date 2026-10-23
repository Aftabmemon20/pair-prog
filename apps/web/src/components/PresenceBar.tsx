"use client";

import React, { useState } from "react";
import { Copy, Check, Shield, Bot, FileText, Code2, Columns, Globe, Sun, Moon } from "lucide-react";
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
  const { roomId, connectionStatus, participants, currentUser, theme, toggleTheme } = useRoomStore();
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
    <header className="h-16 px-6 border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-[#121622] flex items-center justify-between select-none z-30 shrink-0">
      {/* Left: Clean Breadcrumbs & Room ID */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-slate-800 dark:text-slate-100 tracking-tight">Overview</span>
          <span className="text-slate-400 font-light">•</span>
          <span className="font-medium text-slate-500 dark:text-slate-400">Pair Master Studio</span>
        </div>

        {/* Minimalist Room Code Pill */}
        <button
          onClick={handleCopyLink}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono bg-slate-100 dark:bg-[#1a1f2e] hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full border border-slate-200/60 dark:border-slate-700 transition group ml-1"
          title="Click to copy invite link"
        >
          <span className="text-slate-400">room:</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[110px]">{roomId}</span>
          {copied ? (
            <Check className="w-3 h-3 text-emerald-500" />
          ) : (
            <Copy className="w-3 h-3 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition" />
          )}
        </button>

        {/* Live Status indicator */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/70 dark:border-emerald-800/60 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
          <span
            className={`w-2 h-2 rounded-full ${
              connectionStatus === "connected"
                ? "bg-emerald-500 shadow-[0_0_6px_#10b981]"
                : "bg-amber-400"
            }`}
          />
          <span>{connectionStatus === "connected" ? "Live Synced" : connectionStatus}</span>
        </div>
      </div>

      {/* Center: Minimalist Soft Segmented Switcher */}
      <div className="flex items-center p-1 bg-slate-100 dark:bg-[#0e121b] rounded-full border border-slate-200/80 dark:border-slate-800 shadow-inner">
        <button
          onClick={() => onSetWorkspaceMode("code")}
          className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-medium transition ${
            workspaceMode === "code"
              ? "bg-white dark:bg-[#1a1f2e] text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
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
              ? "bg-white dark:bg-[#1a1f2e] text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
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
              ? "bg-white dark:bg-[#1a1f2e] text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
          title="Focus on Co-Browse Web Frame & Telestrator"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Co-Browse</span>
        </button>
      </div>

      {/* Right: Contributor Avatars, Theme Toggle, Recap & Primary Run Action */}
      <div className="flex items-center gap-2.5">
        {/* Contributor Avatars Stack */}
        <div className="hidden lg:flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">3 seats</span>
          <div className="flex -space-x-2 overflow-hidden">
            <div
              className="inline-block h-7 w-7 rounded-full ring-2 ring-white dark:ring-slate-800 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] flex items-center justify-center shadow-sm"
              title={host ? `Host: ${host.name}` : "Seat 1: Host"}
            >
              {host ? host.name.slice(0, 1).toUpperCase() : "A"}
            </div>
            <div
              className="inline-block h-7 w-7 rounded-full ring-2 ring-white dark:ring-slate-800 bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-bold text-[10px] flex items-center justify-center shadow-sm"
              title={peer ? `Peer: ${peer.name}` : "Seat 2: Peer"}
            >
              {peer ? peer.name.slice(0, 1).toUpperCase() : "B"}
            </div>
            <div
              className="inline-block h-7 w-7 rounded-full ring-2 ring-white dark:ring-slate-800 bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 text-[10px] flex items-center justify-center shadow-sm"
              title="Seat 3: Pair Master AI"
            >
              <Bot className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Dark / Light Theme Mode Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full bg-slate-100 dark:bg-[#1a1f2e] border border-slate-200/60 dark:border-slate-700 text-slate-600 dark:text-amber-400 hover:text-slate-900 dark:hover:text-amber-300 transition shadow-sm"
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>

        {/* Recap Pill */}
        {onOpenRecap && (
          <button
            onClick={onOpenRecap}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-100 dark:bg-[#1a1f2e] hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full border border-slate-200/60 dark:border-slate-700 transition shadow-sm font-medium"
            title="View Pair Master Session Recap"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Recap</span>
          </button>
        )}

        {/* Primary Run Action Button */}
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
