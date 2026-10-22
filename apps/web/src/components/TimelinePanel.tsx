"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Send,
  Loader2,
  XCircle,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Code2,
  ChevronRight,
  Bot,
  Zap,
} from "lucide-react";
import { useRoomStore } from "../store/roomStore";

export interface TimelineEvent {
  id: string;
  session_id: string;
  ts: number;
  actor: string;
  type: "user_message" | "tool_call" | "tool_result" | "agent_message" | "agent_error";
  payload: any;
  idempotency_key?: string;
}

interface TimelinePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLine?: (line: number) => void;
  pendingPrompt?: string | null;
  onClearPendingPrompt?: () => void;
}

export function TimelinePanel({
  isOpen,
  onClose,
  onSelectLine,
  pendingPrompt,
  onClearPendingPrompt,
}: TimelinePanelProps) {
  const { roomId, currentUser } = useRoomStore();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of events
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [events, isAsking]);

  // Periodic poll of timeline events from API
  useEffect(() => {
    if (!roomId || !isOpen) return;

    let isMounted = true;
    const fetchTimeline = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const res = await fetch(`${apiUrl}/rooms/${roomId}/agent/timeline?limit=100`);
        if (res.ok && isMounted) {
          const data = await res.json();
          if (Array.isArray(data.events)) {
            setEvents(data.events);
          }
        }
      } catch {
        // Silently tolerate intermittent network glitches
      }
    };

    fetchTimeline();
    const interval = setInterval(fetchTimeline, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [roomId, isOpen]);

  // Handle external pending prompt (e.g. from OutputPanel "Ask Pair Master")
  useEffect(() => {
    if (pendingPrompt && isOpen && !isAsking) {
      handleAsk(pendingPrompt);
      if (onClearPendingPrompt) onClearPendingPrompt();
    }
  }, [pendingPrompt, isOpen, isAsking]);

  const handleAsk = async (promptToSend?: string) => {
    const prompt = (promptToSend || inputPrompt).trim();
    if (!prompt || isAsking || !roomId) return;

    setInputPrompt("");
    setIsAsking(true);

    const controller = new AbortController();
    setAbortController(controller);

    const actor = currentUser?.name || "Dev A";

    // Optimistically show user message immediately
    const optimisticUserEvent: TimelineEvent = {
      id: `local_user_${Date.now()}`,
      session_id: roomId,
      ts: Date.now() / 1000,
      actor: actor,
      type: "user_message",
      payload: { text: prompt },
    };
    setEvents((prev) => [...prev, optimisticUserEvent]);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/rooms/${roomId}/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          actor,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.events && Array.isArray(data.events)) {
        setEvents(data.events);
      } else if (data.reply) {
        setEvents((prev) => [
          ...prev,
          {
            id: `agent_reply_${Date.now()}`,
            session_id: roomId,
            ts: Date.now() / 1000,
            actor: "Pair Master",
            type: "agent_message",
            payload: { text: data.reply },
          },
        ]);
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        setEvents((prev) => [
          ...prev,
          {
            id: `aborted_${Date.now()}`,
            session_id: roomId,
            ts: Date.now() / 1000,
            actor: "Pair Master",
            type: "agent_error",
            payload: { message: "Request cancelled by user." },
          },
        ]);
      } else {
        setEvents((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            session_id: roomId,
            ts: Date.now() / 1000,
            actor: "Pair Master",
            type: "agent_error",
            payload: { message: `Connection error: ${err.message}` },
          },
        ]);
      }
    } finally {
      setIsAsking(false);
      setAbortController(null);
    }
  };

  const handleCancel = () => {
    if (abortController) {
      abortController.abort();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  // Helper to render text with clickable line references (e.g. line 28, L28, lines 20-30)
  const renderMessageContent = (text: string) => {
    const lineRegex = /\b(?:line|lines|L)\s*(\d+)(?:\s*(?:to|-)\s*(\d+))?\b/gi;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = lineRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      const lineNum = parseInt(match[1], 10);
      parts.push(
        <button
          key={`line-${match.index}`}
          onClick={() => onSelectLine && onSelectLine(lineNum)}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-1 bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-500/40 rounded text-[11px] font-mono cursor-pointer transition shadow-sm"
          title={`Click to jump to line ${lineNum} in Monaco editor`}
        >
          <Code2 className="w-3 h-3 text-purple-400" />
          <span>{match[0]}</span>
        </button>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  if (!isOpen) return null;

  return (
    <aside className="w-80 md:w-96 flex flex-col h-full bg-[#050811]/90 backdrop-blur-2xl border-l border-white/[0.08] shadow-2xl z-20 select-none">
      {/* Apple Composer Header */}
      <div className="h-11 px-3.5 border-b border-white/[0.08] bg-slate-900/80 backdrop-blur-xl flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-md shadow-purple-500/25 ring-1 ring-white/20">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-xs text-white">Pair Master</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono border border-purple-500/30">
              Seat 3 AI
            </span>
          </div>
          {isAsking && (
            <span className="flex items-center gap-1 text-[10px] text-amber-300 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded-full animate-pulse ml-1">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              Thinking
            </span>
          )}
        </div>

        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition"
          title="Close Composer Drawer"
        >
          <XCircle className="w-4 h-4" />
        </button>
      </div>

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 font-sans text-xs bg-[#030610]/50 select-text">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4 text-slate-400 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-inner">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold text-slate-200 text-sm mb-1">Pair Master Composer</p>
              <p className="text-xs text-slate-400 leading-relaxed max-w-[240px]">
                I inspect code slices, explain runtime tracebacks, and help coordinate tasks.
              </p>
            </div>

            {/* Quick Prompt Pills */}
            <div className="w-full space-y-1.5 pt-3 text-left">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Suggested Prompts</span>
              <button
                onClick={() => handleAsk("What functions are defined in inventory.py?")}
                className="w-full text-left px-3 py-2 rounded-xl bg-slate-900/80 border border-white/[0.08] hover:border-purple-500/50 hover:bg-slate-850 hover:text-purple-200 text-slate-300 text-xs transition shadow-sm flex items-center justify-between group"
              >
                <span>🔍 What functions are defined?</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-300 transition" />
              </button>
              <button
                onClick={() => handleAsk("Explain why this code failed and where.")}
                className="w-full text-left px-3 py-2 rounded-xl bg-slate-900/80 border border-white/[0.08] hover:border-rose-500/50 hover:bg-slate-850 hover:text-rose-200 text-slate-300 text-xs transition shadow-sm flex items-center justify-between group"
              >
                <span>🐞 Explain why code failed and where</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-rose-300 transition" />
              </button>
              <button
                onClick={() => handleAsk("Produce an architecture diagram of our inventory pipeline.")}
                className="w-full text-left px-3 py-2 rounded-xl bg-slate-900/80 border border-white/[0.08] hover:border-indigo-500/50 hover:bg-slate-850 hover:text-indigo-200 text-slate-300 text-xs transition shadow-sm flex items-center justify-between group"
              >
                <span>📐 Generate architecture diagram</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-300 transition" />
              </button>
            </div>
          </div>
        ) : (
          events.map((evt) => {
            if (evt.type === "user_message") {
              const isMe = evt.actor === currentUser?.name;
              return (
                <div key={evt.id} className="flex flex-col space-y-1 items-end">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className="font-semibold text-emerald-400">{evt.actor}</span>
                    <span>•</span>
                    <span>{new Date(evt.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="bg-gradient-to-r from-slate-850 to-slate-800 border border-white/10 text-slate-100 rounded-2xl rounded-tr-sm px-3.5 py-2 max-w-[90%] shadow-md leading-relaxed text-xs">
                    {evt.payload.text}
                  </div>
                </div>
              );
            }

            if (evt.type === "tool_call") {
              return (
                <div key={evt.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/80 border border-white/[0.06] rounded-lg font-mono text-[10px] text-slate-400 shadow-sm">
                  <Wrench className="w-3 h-3 text-purple-400 shrink-0" />
                  <span className="text-purple-300 font-semibold">{evt.payload.tool}</span>
                  <span className="text-slate-500 truncate">
                    ({JSON.stringify(evt.payload.args)})
                  </span>
                </div>
              );
            }

            if (evt.type === "tool_result") {
              const res = evt.payload.result;
              const summary =
                res?.status === "success"
                  ? res.symbols
                    ? `Found ${res.symbols.length} symbols`
                    : res.lines
                    ? `Sliced lines ${res.start_line}-${res.end_line}`
                    : "Completed"
                  : res?.message || "Executed";

              return (
                <div key={evt.id} className="flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] text-slate-500 font-mono pl-3">
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                  <span>{evt.payload.tool} → {summary}</span>
                </div>
              );
            }

            if (evt.type === "agent_message") {
              return (
                <div key={evt.id} className="flex flex-col space-y-1.5 items-start">
                  <div className="flex items-center gap-1.5 text-[10px] text-purple-300">
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    <span className="font-bold">Pair Master</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-500">{new Date(evt.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="bg-purple-950/25 border border-purple-500/30 text-slate-200 rounded-2xl rounded-tl-sm px-3.5 py-3 shadow-md leading-relaxed text-xs backdrop-blur">
                    {renderMessageContent(evt.payload.text)}
                  </div>
                </div>
              );
            }

            if (evt.type === "agent_error") {
              return (
                <div key={evt.id} className="flex items-start gap-2 p-2.5 bg-rose-950/40 border border-rose-500/30 rounded-xl text-rose-300 text-[11px] shadow-sm">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
                  <span>{evt.payload.message}</span>
                </div>
              );
            }

            return null;
          })
        )}

        {isAsking && (
          <div className="flex items-center justify-between p-2.5 bg-purple-950/30 border border-purple-500/30 rounded-xl text-slate-300 text-xs backdrop-blur shadow-sm">
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
              <span>Inspecting AST & slicing lines...</span>
            </div>
            <button
              onClick={handleCancel}
              className="text-[10px] text-rose-400 hover:text-rose-300 px-2 py-0.5 rounded-full border border-rose-500/40 bg-rose-950/50 transition font-medium"
            >
              Cancel
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Apple Composer Input Capsule */}
      <div className="p-3 border-t border-white/[0.08] bg-slate-900/80 backdrop-blur-xl shrink-0">
        <div className="relative flex flex-col bg-slate-950/90 border border-white/[0.08] focus-within:border-purple-500/60 rounded-2xl p-2.5 transition shadow-inner group">
          <textarea
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isAsking}
            placeholder="Ask Pair Master... (Enter to send)"
            rows={2}
            className="w-full bg-transparent text-xs text-slate-200 placeholder-slate-500 resize-none outline-none disabled:opacity-50 font-sans"
          />
          <div className="flex items-center justify-between pt-1 border-t border-white/[0.04] mt-1">
            <span className="text-[10px] text-slate-500">Return to send</span>
            <button
              onClick={() => handleAsk()}
              disabled={isAsking || !inputPrompt.trim()}
              className="flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white rounded-full transition shadow-md shadow-purple-950/40 text-[11px] font-medium"
              title="Send to Pair Master"
            >
              {isAsking ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <>
                  <span>Send</span>
                  <Send className="w-3 h-3" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
