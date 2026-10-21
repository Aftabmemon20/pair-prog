"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Play, Loader2, Sparkles, AlertCircle, Split, PenTool, Eraser } from "lucide-react";
import { PresenceBar } from "@/components/PresenceBar";
import { JoinModal } from "@/components/JoinModal";
import { CollaborativeEditor, EditorHandle, OwnershipItem } from "@/components/CollaborativeEditor";
import { OutputPanel } from "@/components/OutputPanel";
import { TimelinePanel } from "@/components/TimelinePanel";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import { VoiceButton } from "@/components/VoiceButton";
import { RecapModal } from "@/components/RecapModal";
import { CallBar } from "@/components/CallBar";
import { useRoomStore } from "@/store/roomStore";
import { pyodideRunner, RunResult } from "@/lib/pyodideRunner";

export default function RoomPage() {
  const params = useParams();
  const roomId = params.id as string;
  const { setRoomId, setSession, currentUser } = useRoomStore();

  const editorRef = useRef<EditorHandle | null>(null);
  const [pyodideStatus, setPyodideStatus] = useState<string>("uninitialized");
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [isTimelineOpen, setIsTimelineOpen] = useState(true);
  const [pendingAgentPrompt, setPendingAgentPrompt] = useState<string | null>(null);
  const [isSplitting, setIsSplitting] = useState(false);
  const [ownership, setOwnership] = useState<OwnershipItem[]>([]);
  const [diagramSrc, setDiagramSrc] = useState<string | undefined>(undefined);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isRecapOpen, setIsRecapOpen] = useState(false);

  // Restore session if available
  useEffect(() => {
    if (roomId) {
      setRoomId(roomId);
      const savedToken = sessionStorage.getItem(`pairio_token_${roomId}`);
      const savedUser = sessionStorage.getItem(`pairio_user_${roomId}`);
      if (savedToken && savedUser && !currentUser) {
        try {
          const userObj = JSON.parse(savedUser);
          setSession(savedToken, userObj);
        } catch {
          // Ignore
        }
      }
    }
  }, [roomId, setRoomId, setSession, currentUser]);

  // Pre-load Pyodide Web Worker on room entry
  useEffect(() => {
    pyodideRunner.init();
    const unsub = pyodideRunner.onStatusChange((status) => {
      setPyodideStatus(status);
    });
    return unsub;
  }, []);

  // Poll for peer run events so output is synced across both browsers
  useEffect(() => {
    if (!roomId) return;
    const interval = setInterval(async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const res = await fetch(`${apiUrl}/rooms/${roomId}/events?limit=5`);
        if (res.ok) {
          const events = await res.json();
          const lastRunEvent = [...events].reverse().find((e: any) => e.type === "run_result");
          if (lastRunEvent && (!runResult || lastRunEvent.idempotency_key !== (runResult as any)._lastId)) {
            const p = lastRunEvent.payload;
            const syncedResult: RunResult = {
              exit_code: p.exit_code,
              stdout: p.stdout,
              stderr: p.stderr,
              execution_time_ms: p.execution_time_ms,
              traceback: p.traceback,
              actor: lastRunEvent.actor,
            };
            (syncedResult as any)._lastId = lastRunEvent.idempotency_key;
            setRunResult(syncedResult);
          }
        }
      } catch {
        // Ignore poll error
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [roomId, runResult]);

  // Load room ownership on mount
  useEffect(() => {
    if (!roomId) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    fetch(`${apiUrl}/rooms/${roomId}/ownership`)
      .then((res) => (res.ok ? res.json() : []))
      .then((items: OwnershipItem[]) => {
        if (items && items.length > 0) {
          setOwnership(items);
          if (editorRef.current) {
            editorRef.current.setOwnershipDecorations(items);
          }
        }
      })
      .catch(() => {});
  }, [roomId]);

  const handleSplitWork = useCallback(async () => {
    if (isSplitting || !roomId) return;
    setIsSplitting(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/rooms/${roomId}/ownership/split`, { method: "POST" });
      if (res.ok) {
        const items: OwnershipItem[] = await res.json();
        setOwnership(items);
        if (editorRef.current) {
          editorRef.current.setOwnershipDecorations(items);
        }
        // Fetch updated architectural diagram
        const diagRes = await fetch(`${apiUrl}/rooms/${roomId}/diagram`);
        if (diagRes.ok) {
          const diagData = await diagRes.json();
          setDiagramSrc(diagData.mermaid_src);
        }
      }
    } catch (err) {
      console.error("Failed to split work:", err);
    } finally {
      setIsSplitting(false);
    }
  }, [isSplitting, roomId]);

  const handleAnalyzeFailure = useCallback(async () => {
    if (!roomId || !runResult) return;
    setIsTimelineOpen(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/rooms/${roomId}/agent/analyze-failure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error_type: runResult.traceback?.error_type || "RuntimeError",
          error_message: runResult.traceback?.error_message || "Execution failed",
          line: runResult.traceback?.top_frame?.line || 28,
          actor: currentUser?.name || "Dev A",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.mermaid_src) {
          setDiagramSrc(data.mermaid_src);
        }
        if (data.line && editorRef.current) {
          editorRef.current.jumpToLine(data.line);
          editorRef.current.setAnnotationDecorations([
            {
              start_line: data.line,
              end_line: data.line,
              kind: "error",
              message: `${data.failing_symbol || "function"} failed (${data.owner} owned): ${runResult.traceback?.error_type}`,
            },
          ]);
        }
      }
    } catch (err) {
      console.error("Analyze failure error:", err);
    }
  }, [roomId, runResult, currentUser]);

  const handleRun = useCallback(async () => {
    if (isRunning || !editorRef.current || !currentUser) return;

    const code = editorRef.current.getCode();
    if (!code.trim()) return;

    setIsRunning(true);
    try {
      const result = await pyodideRunner.runCode(code, currentUser.name, roomId);
      setRunResult(result);

      // If traceback exists, highlight failing line in editor
      if (result.traceback?.top_frame?.line) {
        editorRef.current.highlightLine(result.traceback.top_frame.line);
      }
    } catch (err: any) {
      setRunResult({
        exit_code: 1,
        stdout: "",
        stderr: String(err),
        execution_time_ms: 0,
        actor: currentUser.name,
      });
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, currentUser, roomId]);

  const handleSelectLine = (line: number) => {
    if (editorRef.current) {
      editorRef.current.jumpToLine(line);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 select-none">
      <PresenceBar onOpenRecap={() => setIsRecapOpen(true)} />
      <JoinModal roomId={roomId} />
      <RecapModal
        roomId={roomId}
        isOpen={isRecapOpen}
        onClose={() => setIsRecapOpen(false)}
      />

      {/* Editor Sub-Header Toolbar */}
      <div className="h-10 bg-slate-900/90 border-b border-slate-800 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Run Button */}
          <button
            onClick={handleRun}
            disabled={isRunning || !currentUser}
            className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-semibold text-xs rounded-md shadow-sm shadow-emerald-600/20 transition group"
            title="Run Code in Pyodide Sandbox (Ctrl+Enter)"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Running...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Run</span>
                <span className="text-[10px] text-emerald-200/80 font-normal ml-0.5 hidden sm:inline">
                  (Ctrl+Enter)
                </span>
              </>
            )}
          </button>

          {/* Pyodide Engine Status */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] text-slate-400 bg-slate-800/60 border border-slate-700/40">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                pyodideStatus === "ready"
                  ? "bg-emerald-400"
                  : pyodideStatus === "loading"
                  ? "bg-amber-400 animate-pulse"
                  : "bg-slate-500"
              }`}
            />
            <span className="hidden sm:inline">Python 3.12 (Pyodide):</span>
            <span className="font-mono text-slate-300">
              {pyodideStatus === "ready" ? "Sandbox Ready" : pyodideStatus === "loading" ? "Preloading..." : pyodideStatus}
            </span>
          </div>

          <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

          {/* Voice Push-to-Talk (Groq Whisper Turbo) */}
          <VoiceButton
            roomId={roomId}
            onSpeechTranscribed={() => setIsTimelineOpen(true)}
          />

          {/* Collaborative Drawing Tool (perfect-freehand) */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsDrawingMode(!isDrawingMode)}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border font-medium transition ${
                isDrawingMode
                  ? "bg-emerald-950/80 border-emerald-500 text-emerald-200 ring-2 ring-emerald-500/20"
                  : "bg-slate-800/80 hover:bg-slate-700/80 border-slate-700/60 text-slate-300 hover:text-slate-100"
              }`}
              title="Toggle Collaborative Freehand Drawing (Draw on Code)"
            >
              <PenTool className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Draw</span>
            </button>

            {isDrawingMode && (
              <button
                onClick={() => {
                  const doc = editorRef.current?.getYDoc();
                  if (doc) {
                    const arr = doc.getArray("freehand_strokes");
                    arr.delete(0, arr.length);
                  }
                }}
                className="p-1 text-slate-400 hover:text-rose-300 hover:bg-slate-800 rounded transition"
                title="Clear all drawings on screen"
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right side facilitator button & timeline toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsTimelineOpen(!isTimelineOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition ${
              isTimelineOpen
                ? "bg-purple-900/60 border-purple-700/80 text-purple-200 shadow-sm"
                : "bg-slate-800/60 border-slate-700/60 text-slate-300 hover:text-slate-100 hover:bg-slate-800"
            }`}
            title="Toggle Pair Master AI Facilitator Timeline"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Pair Master</span>
          </button>

          <button
            onClick={handleSplitWork}
            disabled={isSplitting}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-purple-200 bg-purple-950/60 hover:bg-purple-900/80 border border-purple-700/80 rounded-md shadow-sm transition disabled:opacity-50"
            title="Partition code ownership between Dev A and Dev B"
          >
            {isSplitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
            ) : (
              <Split className="w-3.5 h-3.5 text-purple-400" />
            )}
            <span className="hidden sm:inline">Split Work</span>
            {ownership.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>
        </div>
      </div>

      {/* Main Workspace + Timeline Split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor on top, Output Panel on bottom */}
        <main className="flex-1 flex flex-col relative overflow-hidden">
          <div className="flex-1 relative overflow-hidden">
            <CollaborativeEditor
              ref={editorRef}
              roomId={roomId}
              onRunShortcut={handleRun}
            />
            <DrawingCanvas
              isDrawingMode={isDrawingMode}
              ydoc={editorRef.current?.getYDoc()}
            />
          </div>

          {/* Output Diagnostics Panel */}
          <OutputPanel
            runResult={runResult}
            onClear={() => setRunResult(null)}
            onSelectLine={handleSelectLine}
            onAskAgent={(prompt) => {
              setIsTimelineOpen(true);
              setPendingAgentPrompt(prompt);
            }}
            onAnalyzeFailure={handleAnalyzeFailure}
            diagramSrc={diagramSrc}
          />
        </main>

        {/* Pair Master Timeline Panel */}
        <TimelinePanel
          isOpen={isTimelineOpen}
          onClose={() => setIsTimelineOpen(false)}
          onSelectLine={handleSelectLine}
          pendingPrompt={pendingAgentPrompt}
          onClearPendingPrompt={() => setPendingAgentPrompt(null)}
        />
      </div>

      {/* Floating WebRTC Zoom-style Call Bar */}
      <CallBar roomId={roomId} />
    </div>
  );
}
