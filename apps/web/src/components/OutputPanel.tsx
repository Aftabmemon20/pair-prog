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
  activeFileName?: string;
}

export function OutputPanel({
  runResult,
  onClear,
  onSelectLine,
  onAskAgent,
  onAnalyzeFailure,
  diagramSrc,
  activeFileName = "inventory.py",
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
      <div className="h-10 border-t border-slate-200/80 bg-slate-50/80 backdrop-blur-md px-4 flex items-center justify-between text-xs text-slate-500 select-none">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981] animate-pulse" />
          <Terminal className="w-3.5 h-3.5 text-indigo-500" />
          <span className="font-semibold text-slate-700">Output Diagnostics</span>
          <span className="text-[11px] text-slate-400 font-mono">({activeFileName})</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
          <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">Ctrl+↵ Run</span>
          <span className="hidden sm:inline text-slate-400">• Pyodide In-Browser</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`border-t border-slate-200/80 bg-white/95 backdrop-blur-xl flex flex-col transition-all duration-300 ease-in-out ${
      collapsed ? "h-11" : "h-64 sm:h-72"
    }`}>
      {/* Panel Header */}
      <div className="h-11 px-4 bg-slate-50/90 border-b border-slate-200/80 flex items-center justify-between text-xs select-none">
        <div className="flex items-center gap-1 p-0.5 bg-slate-200/60 rounded-full border border-slate-200/80">
          <button
            onClick={() => setActiveTab("terminal")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition ${
              activeTab === "terminal"
                ? "bg-white text-indigo-600 shadow-sm font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Terminal</span>
          </button>

          <button
            onClick={() => setActiveTab("traceback")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition ${
              activeTab === "traceback"
                ? "bg-white text-indigo-600 shadow-sm font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Bug className={`w-3.5 h-3.5 ${runResult?.exit_code !== 0 ? "text-rose-500" : ""}`} />
            <span>Traceback</span>
            {runResult?.exit_code !== 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("symbols")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition ${
              activeTab === "symbols"
                ? "bg-white text-indigo-600 shadow-sm font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>AST Symbols</span>
          </button>

          <button
            onClick={() => setActiveTab("diagram")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition ${
              activeTab === "diagram"
                ? "bg-white text-indigo-600 shadow-sm font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Workflow className="w-3.5 h-3.5" />
            <span>Call Graph</span>
          </button>
        </div>

        {/* Execution Metadata Status */}
        <div className="flex items-center gap-2">
          {runResult && (
            <>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono bg-white border border-slate-200 text-slate-600 shadow-sm">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>{runResult.execution_time_ms}ms</span>
              </div>

              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                runResult.exit_code === 0
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-sm"
                  : runResult.exit_code === 124
                  ? "bg-amber-50 text-amber-700 border-amber-200/80 shadow-sm"
                  : "bg-rose-50 text-rose-700 border-rose-200/80 shadow-sm"
              }`}>
                {runResult.exit_code === 0 ? (
                  <CheckCircle className="w-3 h-3 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                )}
                <span>
                  {runResult.exit_code === 0 ? "Exit 0" : runResult.exit_code === 124 ? "Timeout 5s" : `Exit ${runResult.exit_code}`}
                </span>
              </div>

              <span className="text-[11px] text-slate-500 hidden sm:inline">
                by <strong className="text-slate-700 font-semibold">{runResult.actor}</strong>
              </span>
            </>
          )}

          <div className="h-4 w-px bg-slate-200 mx-1" />

          <button
            onClick={onClear}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
            title="Clear Output"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
          >
            {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {!collapsed && (
        <div className="flex-1 overflow-auto p-4 font-mono text-xs bg-slate-50/70 select-text text-slate-800">
          {activeTab === "terminal" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 pb-2 mb-2 border-b border-slate-200 text-[11px] text-slate-500 font-mono">
                <span className="text-indigo-600 font-bold">$</span>
                <span className="text-slate-800 font-medium">python {activeFileName}</span>
                <span className="text-slate-400 ml-auto hidden sm:inline text-[10px]">Pyodide WebWorker Sandbox</span>
              </div>
              {runResult?.stdout && (
                <pre className="text-slate-800 whitespace-pre-wrap leading-relaxed font-mono">
                  {runResult.stdout}
                </pre>
              )}
              {runResult?.stderr && (
                <pre className="text-rose-600 whitespace-pre-wrap leading-relaxed bg-rose-50 p-3 rounded-xl border border-rose-200 font-mono">
                  {runResult.stderr}
                </pre>
              )}
              {!runResult?.stdout && !runResult?.stderr && (
                <div className="text-slate-400 italic">No output produced. Press Run or Ctrl+Enter to execute.</div>
              )}
            </div>
          )}

          {activeTab === "traceback" && (
            <div>
              {runResult?.traceback ? (
                <div className="space-y-3">
                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm">
                    <div>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold uppercase bg-rose-100 text-rose-700 mr-2 border border-rose-200">
                        {runResult.traceback.error_type}
                      </span>
                      <span className="text-rose-900 font-semibold">
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
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-full shadow-sm transition shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Ask Pair Master to Analyze</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Call Stack Frames:
                    </span>
                    {runResult.traceback.frames.map((frame, idx) => (
                      <div
                        key={idx}
                        onClick={() => onSelectLine && onSelectLine(frame.line)}
                        className="p-3 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 cursor-pointer transition shadow-sm group"
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                          <span>
                            File <span className="text-slate-800 font-semibold">{frame.file}</span>, line{" "}
                            <span className="text-amber-600 font-bold">{frame.line}</span> in{" "}
                            <span className="text-indigo-600 font-medium">{frame.function}</span>
                          </span>
                          <span className="text-[10px] text-slate-400 group-hover:text-indigo-600 transition">
                            Click to jump
                          </span>
                        </div>
                        {frame.code_line && (
                          <div className="pl-3 border-l-2 border-rose-500 text-rose-700 font-mono text-[11px]">
                            {frame.code_line}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 italic">No structured traceback available.</div>
              )}
            </div>
          )}

          {activeTab === "symbols" && (
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                AST Parsed Symbols ({symbols.length}):
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {symbols.map((sym, idx) => (
                  <div
                    key={idx}
                    onClick={() => onSelectLine && onSelectLine(sym.start_line)}
                    className="p-3 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 cursor-pointer transition shadow-sm flex items-center justify-between"
                  >
                    <div>
                      <span className="text-indigo-600 font-bold text-xs">{sym.name}</span>
                      <span className="text-[10px] text-slate-400 ml-2 uppercase font-medium">({sym.kind})</span>
                      {sym.args.length > 0 && (
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          args: ({sym.args.join(", ")})
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                      L{sym.start_line} - L{sym.end_line}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "diagram" && (
            <div className="h-full w-full min-h-[190px] bg-white rounded-xl p-2 border border-slate-200">
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
