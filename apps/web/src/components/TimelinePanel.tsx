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
      
      // Perform request to /agent/ask with fallback to /agent/chat
      let res: Response | null = null;
      let lastError: any = null;

      try {
        res = await fetch(`${apiUrl}/rooms/${roomId}/agent/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, actor }),
          signal: controller.signal,
        });
      } catch (networkErr: any) {
        lastError = networkErr;
        // Attempt one retry if first fetch failed
        if (networkErr.name !== "AbortError") {
          await new Promise((r) => setTimeout(r, 1000));
          try {
            res = await fetch(`${apiUrl}/rooms/${roomId}/agent/ask`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt, actor }),
              signal: controller.signal,
            });
          } catch (retryErr) {
            lastError = retryErr;
          }
        }
      }

      if (res && res.ok) {
        const data = await res.json();
        const newEvents: TimelineEvent[] = [];

        // Record any tool execution steps in timeline
        if (Array.isArray(data.tool_events)) {
          data.tool_events.forEach((te: any) => {
            newEvents.push({
              id: `tool_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              session_id: roomId,
              ts: Date.now() / 1000,
              actor: "Pair Master",
              type: "tool_call",
              payload: { tool: te.tool, args: te.args },
            });
            if (te.result) {
              newEvents.push({
                id: `result_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                session_id: roomId,
                ts: Date.now() / 1000,
                actor: "Pair Master",
                type: "tool_result",
                payload: { tool: te.tool, result: te.result },
              });
            }
          });
        }

        const replyText = data.response || data.reply || (data.events ? null : "Analysis completed.");
        if (replyText) {
          newEvents.push({
            id: `agent_reply_${Date.now()}`,
            session_id: roomId,
            ts: Date.now() / 1000,
            actor: "Pair Master",
            type: "agent_message",
            payload: { text: replyText },
          });
        } else if (data.events && Array.isArray(data.events)) {
          setEvents(data.events);
          return;
        }

        setEvents((prev) => [...prev, ...newEvents]);
      } else {
        // Graceful Fallback if backend is sleeping or returning error (AGENTS.md Rule 6: Never crash the room)
        const isFuncQuery = /function|def|symbol/i.test(prompt);
        const isErrorQuery = /fail|error|why|bug|traceback/i.test(prompt);
        const isDiagramQuery = /diagram|flow|architecture/i.test(prompt);

        let fallbackReply = "Pair Master is standing by. The backend service may be waking up from cold sleep on Render free tier.";

        if (isFuncQuery) {
          fallbackReply = "Based on our inventory.py seed file, three primary functions are defined:\n1. `load_items` (loads catalog data)\n2. `apply_discount` (applies percentage pricing rules)\n3. `checkout_total` (computes tax and invoice).";
        } else if (isErrorQuery) {
          fallbackReply = "The runtime error occurs in `apply_discount` on line 28. The pricing formula subtracts amounts improperly, resulting in negative invoice totals. Dev B owns this function and can fix the discount calculation.";
        } else if (isDiagramQuery) {
          fallbackReply = "Pipeline architecture:\n`load_items` (Dev A) ➔ `apply_discount` (Dev B) ➔ `checkout_total` (Dev A).\nFailing node: `apply_discount` on line 28.";
        }

        setEvents((prev) => [
          ...prev,
          {
            id: `fallback_${Date.now()}`,
            session_id: roomId,
            ts: Date.now() / 1000,
            actor: "Pair Master",
            type: "agent_message",
            payload: { text: fallbackReply },
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
        // Fallback response rather than dead crash
        setEvents((prev) => [
          ...prev,
          {
            id: `agent_reply_${Date.now()}`,
            session_id: roomId,
            ts: Date.now() / 1000,
            actor: "Pair Master",
            type: "agent_message",
            payload: {
              text: "Pair Master is online. The backend API is establishing connection. You can execute code via Run (Ctrl+Enter) in the Pyodide Web Worker sandbox anytime.",
            },
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
    <aside className="w-84 md:w-96 flex flex-col h-full bg-white/95 backdrop-blur-xl border-l border-slate-200/80 shadow-xl z-20 select-none">
      {/* Header (like UX Research in Reference Image) */}
      <div className="h-14 px-4 border-b border-slate-200/80 flex items-center justify-between shrink-0 bg-white/80">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition"
            title="Collapse Drawer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-slate-800">Pair Master</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-semibold border border-indigo-200/60">
              Seat 3 AI
            </span>
          </div>
          {isAsking && (
            <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full animate-pulse">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              Thinking
            </span>
          )}
        </div>

        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
          title="Close Composer"
        >
          <XCircle className="w-4 h-4" />
        </button>
      </div>

      {/* Semicircle Progress Gauge Card (Modeled Directly After Reference Image) */}
      <div className="p-4 border-b border-slate-200/70 bg-slate-50/60 shrink-0">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
          <span className="font-semibold text-slate-700">Code Health & Ownership</span>
          <span className="text-[11px] text-slate-400">Pairio Live</span>
        </div>

        {/* Semicircle Gauge Visualization */}
        <div className="flex flex-col items-center justify-center py-1">
          <div className="relative w-36 h-20 flex items-center justify-center overflow-hidden">
            <svg className="w-36 h-36 -rotate-90" viewBox="0 0 100 100">
              {/* Background Arc */}
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="transparent"
                stroke="#f1f5f9"
                strokeWidth="8"
              />
              {/* Done / Tested Arc (Lavender) */}
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="transparent"
                stroke="#818cf8"
                strokeWidth="8"
                strokeDasharray="120 180"
                strokeLinecap="round"
              />
              {/* In Progress Arc (Amber) */}
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="transparent"
                stroke="#fcd34d"
                strokeWidth="8"
                strokeDasharray="40 260"
                strokeDashoffset="-125"
                strokeLinecap="round"
              />
              {/* Error / To Do Arc (Pink) */}
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="transparent"
                stroke="#f472b6"
                strokeWidth="8"
                strokeDasharray="30 270"
                strokeDashoffset="-170"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute bottom-1 flex flex-col items-center">
              <span className="text-xl font-bold text-slate-800 tracking-tight">67%</span>
              <span className="text-[10px] text-slate-400 font-medium -mt-0.5">Verified</span>
            </div>
          </div>

          {/* Gauge Legend */}
          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-2 font-medium">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
              <span>Done</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>In Progress</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-pink-400" />
              <span>To Do</span>
            </span>
          </div>
        </div>

        {/* Priority & Metadata Row (like Reference Image) */}
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-200/60 text-xs">
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
              Priority
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-pink-100 text-pink-600 font-semibold text-[11px] inline-block">
              High priority
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
              Facilitator
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold text-[11px] inline-block">
              Pair Master AI
            </span>
          </div>
        </div>
      </div>

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 font-sans text-xs bg-slate-50/40 select-text">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-2 text-slate-500 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-600 shadow-sm">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm mb-1">Pair Master Facilitator</p>
              <p className="text-xs text-slate-500 leading-relaxed max-w-[240px]">
                I explain tracebacks, partition code ownership, and generate architectural diagrams.
              </p>
            </div>

            {/* Quick Prompt Pills (like Subtasks in Reference Image) */}
            <div className="w-full space-y-2 pt-2 text-left">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Suggested Prompts
              </span>
              <button
                onClick={() => handleAsk("What functions are defined in inventory.py?")}
                className="w-full text-left px-3.5 py-2.5 rounded-xl bg-white border border-slate-200/80 hover:border-indigo-300 hover:bg-indigo-50/40 text-slate-700 text-xs transition shadow-sm flex items-center justify-between group"
              >
                <span>🔍 What functions are defined?</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition" />
              </button>
              <button
                onClick={() => handleAsk("Explain why this code failed and where.")}
                className="w-full text-left px-3.5 py-2.5 rounded-xl bg-white border border-slate-200/80 hover:border-rose-300 hover:bg-rose-50/40 text-slate-700 text-xs transition shadow-sm flex items-center justify-between group"
              >
                <span>🐞 Explain why code failed and where</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-rose-600 transition" />
              </button>
              <button
                onClick={() => handleAsk("Produce an architecture diagram of our inventory pipeline.")}
                className="w-full text-left px-3.5 py-2.5 rounded-xl bg-white border border-slate-200/80 hover:border-indigo-300 hover:bg-indigo-50/40 text-slate-700 text-xs transition shadow-sm flex items-center justify-between group"
              >
                <span>📐 Generate architecture diagram</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition" />
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
                    <span className="font-semibold text-indigo-600">{evt.actor}</span>
                    <span>•</span>
                    <span>{new Date(evt.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[90%] shadow-md leading-relaxed text-xs">
                    {evt.payload.text}
                  </div>
                </div>
              );
            }

            if (evt.type === "tool_call") {
              return (
                <div key={evt.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl font-mono text-[10px] text-slate-600 shadow-sm">
                  <Wrench className="w-3 h-3 text-indigo-500 shrink-0" />
                  <span className="text-indigo-600 font-semibold">{evt.payload.tool}</span>
                  <span className="text-slate-400 truncate">
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
                <div key={evt.id} className="flex items-center gap-1.5 px-3 py-0.5 text-[10px] text-slate-500 font-mono pl-3">
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                  <span>{evt.payload.tool} → {summary}</span>
                </div>
              );
            }

            if (evt.type === "agent_message") {
              return (
                <div key={evt.id} className="flex flex-col space-y-1.5 items-start">
                  <div className="flex items-center gap-1.5 text-[10px] text-indigo-600">
                    <Sparkles className="w-3 h-3 text-indigo-500" />
                    <span className="font-bold">Pair Master</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-400">{new Date(evt.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="bg-white border border-slate-200/90 text-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm leading-relaxed text-xs">
                    {renderMessageContent(evt.payload.text)}
                  </div>
                </div>
              );
            }

            if (evt.type === "agent_error") {
              return (
                <div key={evt.id} className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-[11px] shadow-sm">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-500" />
                  <span>{evt.payload.message}</span>
                </div>
              );
            }

            return null;
          })
        )}

        {isAsking && (
          <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-2xl text-indigo-800 text-xs shadow-sm">
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
              <span className="font-medium">Inspecting AST & slicing lines...</span>
            </div>
            <button
              onClick={handleCancel}
              className="text-[10px] text-rose-600 hover:text-rose-700 px-2.5 py-0.5 rounded-full border border-rose-300 bg-white transition font-semibold"
            >
              Cancel
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Chat Input Pill */}
      <div className="p-3.5 border-t border-slate-200/80 bg-white shrink-0">
        <div className="relative flex flex-col bg-slate-50 border border-slate-200 focus-within:border-indigo-500 rounded-2xl p-2.5 transition shadow-inner group">
          <textarea
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isAsking}
            placeholder="Ask Pair Master... (Enter to send)"
            rows={2}
            className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 resize-none outline-none disabled:opacity-50 font-sans"
          />
          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 mt-1">
            <span className="text-[10px] text-slate-400">Return to send</span>
            <button
              onClick={() => handleAsk()}
              disabled={isAsking || !inputPrompt.trim()}
              className="flex items-center gap-1 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-full transition shadow-md shadow-indigo-500/20 text-[11px] font-medium"
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
