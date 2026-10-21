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
  Maximize2,
  Minimize2,
  Bot
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
      const res = await fetch(`${apiUrl}/rooms/${roomId}/agent/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, actor }),
        signal: controller.signal,
      });

      if (res.ok) {
        const data = await res.json();
        // Trigger a fresh timeline poll to incorporate tool events and agent message
        const timelineRes = await fetch(`${apiUrl}/rooms/${roomId}/agent/timeline?limit=100`);
        if (timelineRes.ok) {
          const tData = await timelineRes.json();
          if (Array.isArray(tData.events)) {
            setEvents(tData.events);
          }
        }
      } else {
        const errText = await res.text();
        setEvents((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            session_id: roomId,
            ts: Date.now() / 1000,
            actor: "Pair Master",
            type: "agent_error",
            payload: { message: `Request failed: ${errText || res.statusText}` },
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
          className="inline-flex items-center gap-0.5 px-1.5 py-0.2 mx-1 bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700/60 rounded text-[11px] font-mono cursor-pointer transition shadow-sm"
          title={`Click to jump to line ${lineNum} in editor`}
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
    <aside className="w-80 md:w-96 flex flex-col h-full bg-slate-900/95 border-l border-slate-800 shadow-2xl z-20 select-none">
      {/* Header */}
      <div className="h-10 px-3 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-purple-600/30 border border-purple-500/50 flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-purple-300" />
          </div>
          <span className="font-semibold text-xs text-slate-100">
            Pair Master <span className="text-[10px] text-purple-400 font-normal">Seat 3</span>
          </span>
          {isAsking && (
            <span className="flex items-center gap-1 text-[10px] text-amber-300 bg-amber-950/50 border border-amber-800/40 px-1.5 py-0.2 rounded-full animate-pulse">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              Thinking
            </span>
          )}
        </div>

        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition"
          title="Close Timeline"
        >
          <XCircle className="w-4 h-4" />
        </button>
      </div>

      {/* Timeline Event Feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 font-sans text-xs bg-slate-950/60 select-text">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4 text-slate-500 space-y-3">
            <div className="w-10 h-10 rounded-full bg-purple-950/40 border border-purple-800/50 flex items-center justify-center text-purple-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium text-slate-300 mb-1">Pair Master is ready</p>
              <p className="text-[11px] leading-relaxed">
                I inspect code slices, explain runtime tracebacks, and help coordinate tasks.
              </p>
            </div>

            {/* Quick Prompts */}
            <div className="w-full space-y-1.5 pt-2 text-left">
              <span className="text-[10px] uppercase font-semibold text-slate-500">Suggested:</span>
              <button
                onClick={() => handleAsk("What functions are defined in main.py?")}
                className="w-full text-left px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 hover:border-purple-800/60 hover:text-purple-200 text-slate-400 text-[11px] transition"
              >
                🔍 What functions are defined in main.py?
              </button>
              <button
                onClick={() => handleAsk("Explain why this code failed and where.")}
                className="w-full text-left px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 hover:border-purple-800/60 hover:text-purple-200 text-slate-400 text-[11px] transition"
              >
                🐞 Explain why this code failed and where
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
                  <div className="bg-slate-800/90 border border-slate-700/60 text-slate-100 rounded-lg rounded-tr-none px-3 py-2 max-w-[90%] shadow-sm leading-relaxed">
                    {evt.payload.text}
                  </div>
                </div>
              );
            }

            if (evt.type === "tool_call") {
              return (
                <div key={evt.id} className="flex items-center gap-1.5 px-2 py-1 bg-slate-900/60 border border-slate-800/80 rounded font-mono text-[11px] text-slate-400">
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
                <div key={evt.id} className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] text-slate-500 font-mono pl-4">
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                  <span>{evt.payload.tool} → {summary}</span>
                </div>
              );
            }

            if (evt.type === "agent_message") {
              return (
                <div key={evt.id} className="flex flex-col space-y-1 items-start">
                  <div className="flex items-center gap-1.5 text-[10px] text-purple-300">
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    <span className="font-bold">Pair Master</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-500">{new Date(evt.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="bg-purple-950/30 border border-purple-800/50 text-slate-200 rounded-lg rounded-tl-none px-3 py-2.5 shadow-sm leading-relaxed text-xs">
                    {renderMessageContent(evt.payload.text)}
                  </div>
                </div>
              );
            }

            if (evt.type === "agent_error") {
              return (
                <div key={evt.id} className="flex items-start gap-2 p-2 bg-rose-950/40 border border-rose-800/60 rounded-md text-rose-300 text-[11px]">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
                  <span>{evt.payload.message}</span>
                </div>
              );
            }

            return null;
          })
        )}

        {isAsking && (
          <div className="flex items-center justify-between p-2 bg-purple-950/20 border border-purple-800/30 rounded text-slate-400 text-xs">
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
              <span>Inspecting AST & slicing lines...</span>
            </div>
            <button
              onClick={handleCancel}
              className="text-[10px] text-rose-400 hover:text-rose-300 px-1.5 py-0.5 rounded border border-rose-800/40 bg-rose-950/30 transition"
            >
              Cancel
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-2 border-t border-slate-800 bg-slate-900/90">
        <div className="relative flex items-end bg-slate-950 border border-slate-800 rounded-lg focus-within:border-purple-600/60 transition">
          <textarea
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isAsking}
            placeholder="Ask Pair Master... (Enter to send)"
            rows={2}
            className="w-full bg-transparent p-2 text-xs text-slate-200 placeholder-slate-500 resize-none outline-none disabled:opacity-50"
          />
          <div className="p-1.5">
            <button
              onClick={() => handleAsk()}
              disabled={isAsking || !inputPrompt.trim()}
              className="p-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-md transition shadow-sm"
              title="Send to Pair Master (Enter)"
            >
              {isAsking ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
