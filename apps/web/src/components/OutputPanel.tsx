"use client";

import React, { useState, useEffect } from "react";
import { Terminal, AlertTriangle, CheckCircle, Clock, Trash2, ChevronUp, ChevronDown, Layers, Bug, Sparkles, Workflow } from "lucide-react";
import { RunResult } from "../lib/pyodideRunner";
import { useRoomStore } from "../store/roomStore";
import { MermaidDiagram } from "./MermaidDiagram";

interface OutputPanelProps {
  runResult: RunResult | null;
  onClear: () => void;
  onSelectLine?: (line: number) => void;
  onAskAgent?: (prompt: string) => void;
  onAnalyzeFailure?: () => void;
  diagramSrc?: string;
}

export function OutputPanel({
  runResult,
  onClear,
  onSelectLine,
  onAskAgent,
  onAnalyzeFailure,
  diagramSrc,
}: OutputPanelProps) {
  const { roomId } = useRoomStore();
  const [activeTab, setActiveTab] = useState<"terminal" | "traceback" | "symbols" | "diagram">("terminal");
  const [collapsed, setCollapsed] = useState(false);
  const [symbols, setSymbols] = useState<any[]>([]);
  const [liveDiagramSrc, setLiveDiagramSrc] = useState<string>("");

  // Automatically switch to traceback tab if a runtime error occurs
  useEffect(() => {
    if (runResult && runResult.exit_code !== 0 && runResult.traceback) {
      setActiveTab("traceback");
    }
  }, [runResult]);

  // Load symbols on demand when clicking symbols tab
  useEffect(() => {
    if (activeTab === "symbols" && roomId) {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      fetch(`${apiUrl}/rooms/${roomId}/symbols`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setSymbols(data))
        .catch(() => setSymbols([]));
    }
  }, [activeTab, roomId]);

  // Load diagram on demand when clicking diagram tab
  useEffect(() => {
    if (activeTab === "diagram" && roomId && !diagramSrc) {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      fetch(`${apiUrl}/rooms/${roomId}/diagram`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.mermaid_src) setLiveDiagramSrc(data.mermaid_src);
        })
        .catch(() => {});
    }
  }, [activeTab, roomId, diagramSrc]);

  if (!runResult && symbols.length === 0 && !liveDiagramSrc && !diagramSrc) {
    return (
      <div className="h-10 border-t border-slate-800 bg-slate-900/80 px-4 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5" />
          <span>Output & Diagnostics</span>
        </div>
        <span className="text-[11px] text-slate-600">Click &quot;Run&quot; or press Ctrl+Enter</span>
      </div>
    );
  }

  return (
    <div className={`border-t border-slate-800 bg-slate-900/95 flex flex-col transition-all duration-200 ${
      collapsed ? "h-10" : "h-64 sm:h-72"
    }`}>
      {/* Panel Header */}
      <div className="h-10 px-3 bg-slate-900 border-b border-slate-800/80 flex items-center justify-between text-xs select-none">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab("terminal")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition ${
              activeTab === "terminal"
                ? "bg-slate-800 text-slate-100 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Terminal</span>
          </button>

          <button
            onClick={() => setActiveTab("traceback")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition ${
              activeTab === "traceback"
                ? "bg-slate-800 text-slate-100 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Bug className={`w-3.5 h-3.5 ${runResult?.exit_code !== 0 ? "text-rose-400" : ""}`} />
            <span>Traceback</span>
            {runResult?.exit_code !== 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("symbols")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition ${
              activeTab === "symbols"
                ? "bg-slate-800 text-slate-100 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>AST Symbols</span>
          </button>

          <button
            onClick={() => setActiveTab("diagram")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition ${
              activeTab === "diagram"
                ? "bg-slate-800 text-slate-100 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Workflow className="w-3.5 h-3.5 text-purple-400" />
            <span>Call Graph</span>
          </button>
        </div>

        {/* Execution Metadata Status */}
        <div className="flex items-center gap-2">
          {runResult && (
            <>
              <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800/80 text-slate-300">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>{runResult.execution_time_ms}ms</span>
              </div>

              <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                runResult.exit_code === 0
                  ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/60"
                  : runResult.exit_code === 124
                  ? "bg-amber-950/60 text-amber-400 border border-amber-800/60"
                  : "bg-rose-950/60 text-rose-400 border border-rose-800/60"
              }`}>
                {runResult.exit_code === 0 ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <AlertTriangle className="w-3 h-3" />
                )}
                <span>
                  {runResult.exit_code === 0 ? "Exit 0" : runResult.exit_code === 124 ? "Timeout 5s" : `Exit ${runResult.exit_code}`}
                </span>
              </div>

              <span className="text-[11px] text-slate-400 hidden sm:inline">
                by <strong className="text-slate-200">{runResult.actor}</strong>
              </span>
            </>
          )}

          <div className="h-4 w-px bg-slate-800 mx-1" />

          <button
            onClick={onClear}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition"
            title="Clear Output"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition"
          >
            {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {!collapsed && (
        <div className="flex-1 overflow-auto p-3 font-mono text-xs bg-slate-950 select-text">
          {activeTab === "terminal" && (
            <div className="space-y-1">
              {runResult?.stdout && (
                <pre className="text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {runResult.stdout}
                </pre>
              )}
              {runResult?.stderr && (
                <pre className="text-rose-400 whitespace-pre-wrap leading-relaxed bg-rose-950/20 p-2 rounded border border-rose-900/40">
                  {runResult.stderr}
                </pre>
              )}
              {!runResult?.stdout && !runResult?.stderr && (
                <div className="text-slate-500 italic">No output produced.</div>
              )}
            </div>
          )}

          {activeTab === "traceback" && (
            <div>
              {runResult?.traceback ? (
                <div className="space-y-3">
                  <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-rose-900/80 text-rose-200 mr-2">
                        {runResult.traceback.error_type}
                      </span>
                      <span className="text-rose-300 font-semibold">
                        {runResult.traceback.error_message}
                      </span>
                    </div>

                    {(onAnalyzeFailure || onAskAgent) && (
                      <button
                        onClick={() => {
                          if (onAnalyzeFailure) {
                            onAnalyzeFailure();
                          } else if (onAskAgent) {
                            onAskAgent(
                              `Explain why this code failed with ${runResult.traceback?.error_type}: ${runResult.traceback?.error_message} at line ${runResult.traceback?.top_frame?.line || "?"}.`
                            );
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs rounded-md shadow-sm transition shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Ask Pair Master to Analyze</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Call Stack Frames:
                    </span>
                    {runResult.traceback.frames.map((frame, idx) => (
                      <div
                        key={idx}
                        onClick={() => onSelectLine && onSelectLine(frame.line)}
                        className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg hover:border-slate-700 cursor-pointer transition group"
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                          <span>
                            File <span className="text-slate-200 font-semibold">{frame.file}</span>, line{" "}
                            <span className="text-amber-400 font-bold">{frame.line}</span> in{" "}
                            <span className="text-purple-300 font-medium">{frame.function}</span>
                          </span>
                          <span className="text-[10px] text-slate-500 group-hover:text-purple-400 transition">
                            Click to jump
                          </span>
                        </div>
                        {frame.code_line && (
                          <div className="pl-3 border-l-2 border-rose-500/80 text-rose-300 font-mono text-[11px]">
                            {frame.code_line}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-slate-500 italic">No structured traceback available.</div>
              )}
            </div>
          )}

          {activeTab === "symbols" && (
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                AST Parsed Symbols ({symbols.length}):
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {symbols.map((sym, idx) => (
                  <div
                    key={idx}
                    onClick={() => onSelectLine && onSelectLine(sym.start_line)}
                    className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg hover:border-purple-800/60 cursor-pointer transition flex items-center justify-between"
                  >
                    <div>
                      <span className="text-purple-300 font-bold text-xs">{sym.name}</span>
                      <span className="text-[10px] text-slate-500 ml-2 uppercase">({sym.kind})</span>
                      {sym.args.length > 0 && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          args: ({sym.args.join(", ")})
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                      L{sym.start_line} - L{sym.end_line}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "diagram" && (
            <div className="h-full w-full min-h-[190px]">
              <MermaidDiagram
                mermaidSrc={diagramSrc || liveDiagramSrc}
                title="System Pipeline & Owner Call Graph"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
