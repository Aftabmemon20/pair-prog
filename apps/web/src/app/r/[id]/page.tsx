"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Play, Loader2, Sparkles, AlertCircle, Split, PenTool, Eraser, Globe, Code2, Columns } from "lucide-react";
import { PresenceBar } from "@/components/PresenceBar";
import { JoinModal } from "@/components/JoinModal";
import { CollaborativeEditor, EditorHandle, OwnershipItem } from "@/components/CollaborativeEditor";
import { OutputPanel } from "@/components/OutputPanel";
import { TimelinePanel } from "@/components/TimelinePanel";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import { CoBrowseStudio } from "@/components/CoBrowseStudio";
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
  const [activeFileName, setActiveFileName] = useState<string>("inventory.py");

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

    const currentFile = editorRef.current.getActiveFileName ? editorRef.current.getActiveFileName() : "inventory.py";
    setActiveFileName(currentFile);

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

  // Workspace Mode: "code" (full editor), "split" (50/50), "cobrowse" (full browser studio)
  const [workspaceMode, setWorkspaceMode] = useState<"code" | "split" | "cobrowse">("split");

  const handleSelectLine = (line: number) => {
    if (editorRef.current) {
      editorRef.current.jumpToLine(line);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden p-2.5 sm:p-3.5 flex bg-gradient-to-tr from-[#9bbbee] via-[#d5d7fc] to-[#fcd9e8] font-sans select-none ambient-canvas-breathe text-slate-800">
      {/* Modals */}
      <JoinModal roomId={roomId} />
      <RecapModal
        roomId={roomId}
        isOpen={isRecapOpen}
        onClose={() => setIsRecapOpen(false)}
      />

      {/* Main Minimalist Floating Card Shell (Like Reference Image) */}
      <div className="flex-1 rounded-[28px] bg-white/95 backdrop-blur-2xl shadow-[0_20px_60px_-15px_rgba(20,30,60,0.12)] border border-white/80 overflow-hidden flex flex-row relative">
        
        {/* Left Slim Vertical Icon Rail */}
        <aside className="w-16 bg-[#f8fafc]/90 border-r border-slate-200/70 flex flex-col items-center py-4 justify-between shrink-0 select-none z-30">
          {/* Top Brand & Workspace Navigation Icons */}
          <div className="flex flex-col items-center gap-4 w-full">
            {/* Pairio Logo Squircle */}
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-indigo-500/25 ring-2 ring-white">
              P
            </div>

            <div className="w-8 h-px bg-slate-200" />

            {/* Code View Icon */}
            <button
              onClick={() => setWorkspaceMode("code")}
              className={`p-2.5 rounded-2xl transition ${
                workspaceMode === "code"
                  ? "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200/80 shadow-sm"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              }`}
              title="Code Editor Mode"
            >
              <Code2 className="w-5 h-5" />
            </button>

            {/* Split Screen Icon */}
            <button
              onClick={() => setWorkspaceMode("split")}
              className={`p-2.5 rounded-2xl transition ${
                workspaceMode === "split"
                  ? "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200/80 shadow-sm"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              }`}
              title="Split Code & Browser"
            >
              <Columns className="w-5 h-5" />
            </button>

            {/* Co-Browse Webview Icon */}
            <button
              onClick={() => setWorkspaceMode("cobrowse")}
              className={`p-2.5 rounded-2xl transition ${
                workspaceMode === "cobrowse"
                  ? "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200/80 shadow-sm"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              }`}
              title="Co-Browse Web Studio"
            >
              <Globe className="w-5 h-5" />
            </button>

            {/* Split AST Work Action */}
            <button
              onClick={handleSplitWork}
              disabled={isSplitting}
              className={`p-2.5 rounded-2xl transition relative ${
                ownership.length > 0
                  ? "bg-purple-50 text-purple-600 ring-1 ring-purple-200/80"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              }`}
              title="Split Work (AST Ownership Partitioning)"
            >
              {isSplitting ? (
                <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
              ) : (
                <Split className="w-5 h-5" />
              )}
              {ownership.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 shadow-sm" />
              )}
            </button>

            {/* Telestrator Drawing Pen Tool */}
            <button
              onClick={() => setIsDrawingMode(!isDrawingMode)}
              className={`p-2.5 rounded-2xl transition ${
                isDrawingMode
                  ? "bg-rose-50 text-rose-600 ring-1 ring-rose-300 shadow-sm"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              }`}
              title="Toggle Telestrator Drawing on Code"
            >
              <PenTool className="w-5 h-5" />
            </button>
          </div>

          {/* Bottom Rail Actions */}
          <div className="flex flex-col items-center gap-3 w-full">
            {/* Voice Push-to-Talk */}
            <VoiceButton
              roomId={roomId}
              onSpeechTranscribed={() => setIsTimelineOpen(true)}
            />

            {/* Pair Master Toggle */}
            <button
              onClick={() => setIsTimelineOpen(!isTimelineOpen)}
              className={`p-2.5 rounded-2xl transition ${
                isTimelineOpen
                  ? "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200 shadow-sm"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              }`}
              title="Toggle Pair Master Facilitator"
            >
              <Sparkles className="w-5 h-5" />
            </button>
          </div>
        </aside>

        {/* Central Workspace + Right Drawer */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
          {/* Top Breadcrumb & Contributor Header */}
          <PresenceBar
            workspaceMode={workspaceMode}
            onSetWorkspaceMode={setWorkspaceMode}
            onOpenRecap={() => setIsRecapOpen(true)}
            onRun={handleRun}
            isRunning={isRunning}
            pyodideStatus={pyodideStatus}
            isTimelineOpen={isTimelineOpen}
            onToggleTimeline={() => setIsTimelineOpen(!isTimelineOpen)}
          />

          {/* Main Work Area */}
          <div className="flex-1 flex overflow-hidden relative">
            <main className="flex-1 flex flex-col relative overflow-hidden bg-white">
              <div className="flex-1 flex overflow-hidden relative">
                {/* Monaco Editor Container */}
                <div
                  className={`h-full relative overflow-hidden transition-all duration-300 ease-in-out ${
                    workspaceMode === "code"
                      ? "w-full"
                      : workspaceMode === "split"
                      ? "w-1/2 border-r border-slate-200/80"
                      : "w-0 hidden"
                  }`}
                >
                  <CollaborativeEditor
                    ref={editorRef}
                    roomId={roomId}
                    onRunShortcut={handleRun}
                  />
                  <DrawingCanvas
                    isDrawingMode={isDrawingMode}
                    ydoc={editorRef.current?.getYDoc()}
                  />
                  {isDrawingMode && (
                    <button
                      onClick={() => {
                        const doc = editorRef.current?.getYDoc();
                        if (doc) {
                          const arr = doc.getArray("freehand_strokes");
                          arr.delete(0, arr.length);
                        }
                      }}
                      className="absolute bottom-4 right-4 z-40 p-2 bg-white rounded-full shadow-lg border border-slate-200 text-rose-500 hover:bg-rose-50 transition"
                      title="Clear code markings"
                    >
                      <Eraser className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Co-Browse Web Studio */}
                {workspaceMode !== "code" && (
                  <div
                    className={`h-full flex flex-col relative overflow-hidden transition-all duration-300 ease-in-out ${
                      workspaceMode === "cobrowse" ? "w-full" : "w-1/2"
                    }`}
                  >
                    <CoBrowseStudio
                      roomId={roomId}
                      ydoc={editorRef.current?.getYDoc()}
                      onAskAgent={(prompt) => {
                        setIsTimelineOpen(true);
                        setPendingAgentPrompt(prompt);
                      }}
                      onClose={() => setWorkspaceMode("code")}
                    />
                  </div>
                )}
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
                activeFileName={activeFileName}
              />
            </main>

            {/* Pair Master Timeline Panel (UX Research styled right card) */}
            <TimelinePanel
              isOpen={isTimelineOpen}
              onClose={() => setIsTimelineOpen(false)}
              onSelectLine={handleSelectLine}
              pendingPrompt={pendingAgentPrompt}
              onClearPendingPrompt={() => setPendingAgentPrompt(null)}
            />
          </div>
        </div>
      </div>

      {/* Floating WebRTC Call Bar */}
      <CallBar roomId={roomId} />
    </div>
  );
}

