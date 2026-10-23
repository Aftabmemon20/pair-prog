"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import dynamic from "next/dynamic";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { useRoomStore } from "../store/roomStore";
import {
  Loader2,
  FolderOpen,
  FileCode,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  UploadCloud,
  FileText,
  Play,
  Layers,
} from "lucide-react";

// Dynamically import Monaco Editor with SSR disabled
const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#080b14] text-slate-400">
      <Loader2 className="w-6 h-6 animate-spin mr-2 text-purple-400" />
      <span className="text-xs">Initializing Monaco workspace...</span>
    </div>
  ),
});

export interface OwnershipItem {
  symbol: string;
  owner: string;
  color: string;
  start_line?: number;
  end_line?: number;
  is_orphaned: boolean;
  reason?: string;
}

export interface AnnotationItem {
  start_line: number;
  end_line: number;
  kind: "warning" | "error" | "info" | "arrow";
  message: string;
}

export interface EditorHandle {
  getCode: () => string;
  getActiveFileName: () => string;
  jumpToLine: (line: number) => void;
  highlightLine: (line: number) => void;
  setOwnershipDecorations: (items: OwnershipItem[]) => void;
  setAnnotationDecorations: (items: AnnotationItem[]) => void;
  getYDoc: () => Y.Doc | null;
}

interface CollaborativeEditorProps {
  roomId: string;
  onRunShortcut?: () => void;
}

export interface WorkspaceFile {
  id: string;
  name: string;
  language: string;
  content: string;
  isCRDT?: boolean;
}

const DEFAULT_WORKSPACE_FILES: WorkspaceFile[] = [
  {
    id: "inventory.py",
    name: "inventory.py",
    language: "python",
    content: "", // Content synced via Yjs CRDT
    isCRDT: true,
  },
  {
    id: "models.py",
    name: "models.py",
    language: "python",
    content: `from dataclasses import dataclass
from typing import Optional

@dataclass
class Item:
    id: str
    name: str
    price: float
    category: str
    in_stock: bool = True

@dataclass
class Invoice:
    items_count: int
    subtotal: float
    discount_applied: float
    tax: float
    grand_total: float
`,
  },
  {
    id: "pricing.py",
    name: "pricing.py",
    language: "python",
    content: `def calculate_vat(amount: float, rate: float = 0.08) -> float:
    """Computes standard VAT percentage on inventory items."""
    return round(amount * rate, 2)

def validate_discount(discount_pct: float) -> bool:
    """Ensures discount does not exceed the 50% safety cap."""
    return 0.0 <= discount_pct <= 0.50
`,
  },
  {
    id: "test_pipeline.py",
    name: "test_pipeline.py",
    language: "python",
    content: `# Unit verification tests for inventory pipeline
from inventory import load_items, apply_discount, checkout_total

def test_inventory_flow():
    items = load_items()
    assert len(items) == 3, f"Expected 3 items, got {len(items)}"
    print(f"✓ Loaded {len(items)} catalog items.")

    discounted = apply_discount(items, discount_pct=0.10)
    for itm in discounted:
        assert itm["price"] > 0, f"Error: Item {itm['id']} price is negative: {itm['price']}"
    print("✓ Discounts computed cleanly.")

    total = checkout_total(discounted)
    assert total > 0, f"Error: Grand total is negative: {total}"
    print(f"✓ Verification complete: Grand total is \${total:.2f}")

test_inventory_flow()
`,
  },
];

export const CollaborativeEditor = forwardRef<EditorHandle, CollaborativeEditorProps>(
  ({ roomId, onRunShortcut }, ref) => {
    const { currentUser, setConnectionStatus, setParticipants } = useRoomStore();

    // Editor & Monaco Refs
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<any>(null);
    const bindingRef = useRef<any>(null);
    const providerRef = useRef<WebsocketProvider | null>(null);
    const docRef = useRef<Y.Doc | null>(null);

    const decorationsRef = useRef<any[]>([]);
    const ownershipDecorationsRef = useRef<any[]>([]);
    const annotationDecorationsRef = useRef<any[]>([]);
    const [editorReady, setEditorReady] = useState(false);

    // Multi-File Workspace State
    const [files, setFiles] = useState<WorkspaceFile[]>(DEFAULT_WORKSPACE_FILES);
    const [activeFileId, setActiveFileId] = useState<string>("inventory.py");
    const [openTabIds, setOpenTabIds] = useState<string[]>([
      "inventory.py",
      "models.py",
      "test_pipeline.py",
    ]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const activeFile = files.find((f) => f.id === activeFileId) || files[0];

    // Helper: Bind/Unbind Yjs Monaco Binding dynamically based on active file
    const bindYjsForActiveFile = useCallback(
      (fileId: string) => {
        if (!editorRef.current || !docRef.current || !providerRef.current) return;

        // Clean up previous binding
        if (bindingRef.current) {
          bindingRef.current.destroy();
          bindingRef.current = null;
        }

        const targetFile = files.find((f) => f.id === fileId);

        if (targetFile?.isCRDT) {
          // Bind Yjs shared CRDT text
          import("y-monaco").then(({ MonacoBinding }) => {
            if (!docRef.current || !editorRef.current) return;
            const ytext = docRef.current.getText("monaco");
            const model = editorRef.current.getModel();
            if (model) {
              bindingRef.current = new MonacoBinding(
                ytext,
                model,
                new Set([editorRef.current]),
                providerRef.current!.awareness
              );
            }
          });
        } else if (targetFile) {
          // Set local file content
          editorRef.current.setValue(targetFile.content);
        }
      },
      [files]
    );

    // Switch active file tab
    const handleSelectFile = (fileId: string) => {
      if (fileId === activeFileId) return;

      // Save content of previously active local file
      if (editorRef.current && !activeFile.isCRDT) {
        const currentCode = editorRef.current.getValue();
        setFiles((prev) =>
          prev.map((f) => (f.id === activeFileId ? { ...f, content: currentCode } : f))
        );
      }

      // Add to open tabs if not present
      if (!openTabIds.includes(fileId)) {
        setOpenTabIds((prev) => [...prev, fileId]);
      }

      setActiveFileId(fileId);
      bindYjsForActiveFile(fileId);
    };

    // Close tab
    const handleCloseTab = (e: React.MouseEvent, fileId: string) => {
      e.stopPropagation();
      const newTabs = openTabIds.filter((id) => id !== fileId);
      if (newTabs.length === 0) return; // Keep at least one tab

      setOpenTabIds(newTabs);
      if (activeFileId === fileId) {
        const nextId = newTabs[newTabs.length - 1];
        setActiveFileId(nextId);
        bindYjsForActiveFile(nextId);
      }
    };

    // Native Folder Picker (window.showDirectoryPicker)
    const handleOpenFolder = async () => {
      try {
        if ("showDirectoryPicker" in window) {
          const dirHandle = await (window as any).showDirectoryPicker();
          const loaded: WorkspaceFile[] = [];

          for await (const entry of dirHandle.values()) {
            if (entry.kind === "file") {
              const name: string = entry.name;
              if (
                name.endsWith(".py") ||
                name.endsWith(".json") ||
                name.endsWith(".txt") ||
                name.endsWith(".md") ||
                name.endsWith(".csv")
              ) {
                const file = await entry.getFile();
                const content = await file.text();
                loaded.push({
                  id: `local_${name}`,
                  name: name,
                  language: name.endsWith(".py")
                    ? "python"
                    : name.endsWith(".json")
                    ? "json"
                    : "markdown",
                  content,
                });
              }
            }
          }

          if (loaded.length > 0) {
            setFiles((prev) => {
              const existingIds = new Set(prev.map((f) => f.id));
              const merged = [...prev];
              loaded.forEach((f) => {
                if (!existingIds.has(f.id)) merged.push(f);
              });
              return merged;
            });
            const firstId = loaded[0].id;
            handleSelectFile(firstId);
          }
        } else if (fileInputRef.current) {
          fileInputRef.current.click();
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.warn("Folder picker error:", err);
        }
      }
    };

    // Fallback file input upload
    const handleFileInputUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;

      const loaded: WorkspaceFile[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i];
        if (
          f.name.endsWith(".py") ||
          f.name.endsWith(".json") ||
          f.name.endsWith(".txt") ||
          f.name.endsWith(".md")
        ) {
          const content = await f.text();
          loaded.push({
            id: `upload_${f.name}_${Date.now()}`,
            name: f.name,
            language: f.name.endsWith(".py") ? "python" : "text",
            content,
          });
        }
      }

      if (loaded.length > 0) {
        setFiles((prev) => [...prev, ...loaded]);
        handleSelectFile(loaded[0].id);
      }
    };

    // Create new file
    const handleCreateNewFile = () => {
      const name = prompt("Enter file name (e.g. solution.py):", `script_${Date.now().toString().slice(-4)}.py`);
      if (!name) return;

      const formatted = name.trim();
      const newFile: WorkspaceFile = {
        id: `user_${formatted}`,
        name: formatted,
        language: formatted.endsWith(".py") ? "python" : "text",
        content: `# ${formatted}\nprint("Hello from ${formatted}")\n`,
      };

      setFiles((prev) => [...prev, newFile]);
      setOpenTabIds((prev) => [...prev, newFile.id]);
      handleSelectFile(newFile.id);
    };

    useImperativeHandle(ref, () => ({
      getCode: () => {
        return editorRef.current ? editorRef.current.getValue() : "";
      },
      getActiveFileName: () => {
        return activeFile.name;
      },
      jumpToLine: (line: number) => {
        if (editorRef.current && monacoRef.current) {
          editorRef.current.revealLineInCenter(line);
          editorRef.current.setPosition({ lineNumber: line, column: 1 });
          editorRef.current.focus();

          const decorations = editorRef.current.deltaDecorations(decorationsRef.current, [
            {
              range: new monacoRef.current.Range(line, 1, line, 1),
              options: {
                isWholeLine: true,
                className: "bg-rose-500/20 border-l-4 border-rose-500",
              },
            },
          ]);
          decorationsRef.current = decorations;
        }
      },
      highlightLine: (line: number) => {
        if (editorRef.current && monacoRef.current) {
          const decorations = editorRef.current.deltaDecorations(decorationsRef.current, [
            {
              range: new monacoRef.current.Range(line, 1, line, 1),
              options: {
                isWholeLine: true,
                className: "bg-rose-500/20 border-l-4 border-rose-500",
              },
            },
          ]);
          decorationsRef.current = decorations;
        }
      },
      setOwnershipDecorations: (items: OwnershipItem[]) => {
        if (editorRef.current && monacoRef.current && activeFile.isCRDT) {
          const newDecorations = items
            .filter((item) => item.start_line && item.end_line && !item.is_orphaned)
            .map((item) => {
              const isDevA = item.owner === "Dev A";
              return {
                range: new monacoRef.current.Range(item.start_line!, 1, item.end_line!, 1),
                options: {
                  isWholeLine: true,
                  className: isDevA
                    ? "bg-emerald-950/20 border-l-2 border-emerald-500/80"
                    : "bg-sky-950/20 border-l-2 border-sky-500/80",
                  hoverMessage: {
                    value: `**${item.owner} Owned:** \`${item.symbol}\`${
                      item.reason ? `\\n\\n*${item.reason}*` : ""
                    }`,
                  },
                },
              };
            });
          ownershipDecorationsRef.current = editorRef.current.deltaDecorations(
            ownershipDecorationsRef.current,
            newDecorations
          );
        }
      },
      setAnnotationDecorations: (items: AnnotationItem[]) => {
        if (editorRef.current && monacoRef.current) {
          const newDecorations = items.map((item) => {
            return {
              range: new monacoRef.current.Range(item.start_line, 1, item.end_line, 1),
              options: {
                isWholeLine: true,
                className: "bg-rose-950/40 border-l-4 border-rose-500",
                hoverMessage: {
                  value: `**⚠️ Pair Master Alert:** ${item.message}`,
                },
              },
            };
          });
          annotationDecorationsRef.current = editorRef.current.deltaDecorations(
            annotationDecorationsRef.current,
            newDecorations
          );
        }
      },
      getYDoc: () => {
        return docRef.current;
      },
    }));

    // Initialize Yjs and WebSocket provider
    useEffect(() => {
      if (!currentUser || !editorReady || !editorRef.current) return;

      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
      setConnectionStatus("connecting");

      const ydoc = new Y.Doc();
      docRef.current = ydoc;

      const provider = new WebsocketProvider(wsUrl, `yjs/${roomId}`, ydoc, {
        connect: true,
        maxBackoffTime: 5000,
      });
      providerRef.current = provider;

      provider.awareness.setLocalStateField("user", {
        name: currentUser.name,
        color: currentUser.color,
        role: currentUser.role,
      });

      provider.on("status", (event: { status: "connected" | "connecting" | "disconnected" }) => {
        setConnectionStatus(event.status);
      });

      provider.on("sync", (isSynced: boolean) => {
        if (isSynced) {
          setConnectionStatus("connected");
        }
      });

      const updateAwarenessUsers = () => {
        const states = provider.awareness.getStates();
        const online: any[] = [];
        states.forEach((state: any, clientID: number) => {
          if (state.user) {
            online.push({
              id: `client_${clientID}`,
              name: state.user.name,
              color: state.user.color,
              role: state.user.role || "peer",
            });
          }
        });
        setParticipants(online);
      };

      provider.awareness.on("change", updateAwarenessUsers);

      // Initial bind for default active file
      bindYjsForActiveFile(activeFileId);

      return () => {
        if (bindingRef.current) bindingRef.current.destroy();
        provider.destroy();
        ydoc.destroy();
        setConnectionStatus("disconnected");
      };
    }, [currentUser, editorReady, roomId, setConnectionStatus, setParticipants, bindYjsForActiveFile, activeFileId]);

    const handleEditorDidMount = (editor: any, monaco: any) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Define Apple dark editor palette
      monaco.editor.defineTheme("pairio-dark-apple", {
        base: "vs-dark",
        inherit: true,
        rules: [
          { token: "comment", foreground: "64748b", fontStyle: "italic" },
          { token: "keyword", foreground: "c084fc", fontStyle: "bold" },
          { token: "string", foreground: "38bdf8" },
          { token: "number", foreground: "34d399" },
          { token: "identifier", foreground: "e2e8f0" },
        ],
        colors: {
          "editor.background": "#080b14",
          "editor.foreground": "#f1f5f9",
          "editor.lineHighlightBackground": "#1e293b22",
          "editorCursor.foreground": "#38bdf8",
          "editorWhitespace.foreground": "#33415544",
          "editorIndentGuide.background": "#33415525",
          "editorIndentGuide.activeBackground": "#47556955",
          "editorLineNumber.foreground": "#475569",
          "editorLineNumber.activeForeground": "#94a3b8",
        },
      });

      monaco.editor.setTheme("pairio-dark-apple");

      // Bind Ctrl+Enter / Cmd+Enter to run shortcut
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        if (onRunShortcut) {
          onRunShortcut();
        }
      });

      setEditorReady(true);
    };

    return (
      <div className="relative h-full w-full flex bg-[#080b14] overflow-hidden select-none">
        {/* Remote cursor CSS styling injected dynamically */}
        <style jsx global>{`
          .yRemoteSelection {
            background-color: rgba(16, 185, 129, 0.2);
          }
          .yRemoteSelectionHead {
            position: absolute;
            border-left: 2px solid #10b981;
            border-top: 2px solid #10b981;
            border-bottom: 2px solid #10b981;
            height: 100%;
            box-sizing: border-box;
          }
          .yRemoteSelectionHead::after {
            position: absolute;
            content: " ";
            border: 3px solid #10b981;
            left: -4px;
            top: -5px;
          }
        `}</style>

        {/* Hidden directory file upload input for fallback */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInputUpload}
          multiple
          className="hidden"
        />

        {/* Collapsible VS Code / Zed Style Project Explorer Sidebar */}
        <div
          className={`h-full flex flex-col border-r border-white/[0.08] bg-[#070913]/90 backdrop-blur-2xl transition-all duration-300 ease-in-out shrink-0 ${
            isSidebarOpen ? "w-52 md:w-56" : "w-0 overflow-hidden border-none"
          }`}
        >
          {/* Explorer Header */}
          <div className="h-10 px-3 border-b border-white/[0.06] flex items-center justify-between text-xs text-slate-300">
            <div className="flex items-center gap-1.5 font-semibold tracking-wider text-[11px] uppercase text-slate-400">
              <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
              <span>Explorer</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCreateNewFile}
                className="p-1 hover:bg-white/[0.08] text-slate-400 hover:text-white rounded transition"
                title="New Python File"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleOpenFolder}
                className="p-1 hover:bg-white/[0.08] text-slate-400 hover:text-white rounded transition"
                title="Open Local Folder"
              >
                <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
              </button>
            </div>
          </div>

          {/* Quick Action: Open Folder Banner */}
          <div className="p-2 border-b border-white/[0.04]">
            <button
              onClick={handleOpenFolder}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[11px] text-slate-200 font-medium transition shadow-sm group"
            >
              <FolderOpen className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
              <span>Open Local Folder</span>
            </button>
          </div>

          {/* File Tree List */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
            <div className="px-2 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <ChevronDown className="w-3 h-3" />
              <span>Workspace Files ({files.length})</span>
            </div>

            {files.map((file) => {
              const isActive = file.id === activeFileId;
              return (
                <div
                  key={file.id}
                  onClick={() => handleSelectFile(file.id)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition group ${
                    isActive
                      ? "bg-slate-800/90 text-white font-medium border border-white/10 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileCode
                      className={`w-3.5 h-3.5 shrink-0 ${
                        file.isCRDT ? "text-emerald-400" : "text-sky-400"
                      }`}
                    />
                    <span className="truncate text-[12px]">{file.name}</span>
                  </div>

                  {file.isCRDT && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                      Live
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sidebar Footer Indicator */}
          <div className="p-2.5 border-t border-white/[0.06] bg-slate-950/40 text-[10px] text-slate-500 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Pyodide Ready
            </span>
            <span className="font-mono">Python 3.12</span>
          </div>
        </div>

        {/* Main Editor Canvas + Tabs */}
        <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          {/* Visual Editor Tabs Bar */}
          <div className="h-10 border-b border-white/[0.06] bg-[#070a14]/80 backdrop-blur-xl px-2 flex items-center justify-between gap-2 overflow-x-auto shrink-0 select-none">
            {/* Left: Sidebar Toggle & Tabs */}
            <div className="flex items-center gap-1 h-full overflow-x-auto">
              {/* Sidebar Collapse/Expand Button */}
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-1.5 hover:bg-white/[0.08] text-slate-400 hover:text-white rounded-lg transition mr-1"
                title={isSidebarOpen ? "Hide File Explorer" : "Show File Explorer"}
              >
                <Layers className="w-3.5 h-3.5" />
              </button>

              {/* Open Tabs */}
              {openTabIds.map((tabId) => {
                const file = files.find((f) => f.id === tabId);
                if (!file) return null;
                const isActive = tabId === activeFileId;

                return (
                  <div
                    key={tabId}
                    onClick={() => handleSelectFile(tabId)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-t-xl text-xs font-medium cursor-pointer transition border-b-2 ${
                      isActive
                        ? "bg-[#080b14] text-white border-sky-400 shadow-sm"
                        : "text-slate-400 hover:text-slate-200 border-transparent hover:bg-white/[0.04]"
                    }`}
                  >
                    <FileCode
                      className={`w-3.5 h-3.5 ${
                        file.isCRDT ? "text-emerald-400" : "text-sky-400"
                      }`}
                    />
                    <span className="font-mono text-[11px]">{file.name}</span>

                    {openTabIds.length > 1 && (
                      <button
                        onClick={(e) => handleCloseTab(e, tabId)}
                        className="p-0.5 rounded-full hover:bg-white/10 text-slate-500 hover:text-white transition"
                        title="Close Tab"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Right: Quick Run Active File Button */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onRunShortcut}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium transition shadow-sm"
                title="Run active file in Pyodide WebWorker sandbox (Ctrl+Enter)"
              >
                <Play className="w-3 h-3 fill-emerald-400 text-emerald-400" />
                <span>Run {activeFile.name}</span>
              </button>
            </div>
          </div>

          {/* Monaco Editor Container */}
          <div className="flex-1 relative overflow-hidden bg-[#080b14]">
            <Editor
              height="100%"
              defaultLanguage="python"
              theme="vs-dark"
              options={{
                fontSize: 13.5,
                fontFamily:
                  "'SF Mono', 'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
                fontLigatures: true,
                lineHeight: 22,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                smoothScrolling: true,
                cursorBlinking: "smooth",
                lineNumbersMinChars: 3,
                padding: { top: 12, bottom: 12 },
              }}
              onMount={handleEditorDidMount}
            />
          </div>
        </div>
      </div>
    );
  }
);

CollaborativeEditor.displayName = "CollaborativeEditor";
