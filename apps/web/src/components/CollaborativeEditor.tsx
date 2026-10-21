"use client";

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import dynamic from "next/dynamic";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { useRoomStore } from "../store/roomStore";
import { Loader2 } from "lucide-react";

// Dynamically import Monaco Editor with SSR disabled
const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-950 text-slate-400">
      <Loader2 className="w-6 h-6 animate-spin mr-2 text-purple-400" />
      <span>Loading collaborative editor...</span>
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

export const CollaborativeEditor = forwardRef<EditorHandle, CollaborativeEditorProps>(
  ({ roomId, onRunShortcut }, ref) => {
    const { currentUser, setConnectionStatus, setParticipants } = useRoomStore();
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<any>(null);
    const bindingRef = useRef<any>(null);
    const providerRef = useRef<WebsocketProvider | null>(null);
    const docRef = useRef<Y.Doc | null>(null);
    const decorationsRef = useRef<any[]>([]);
    const ownershipDecorationsRef = useRef<any[]>([]);
    const annotationDecorationsRef = useRef<any[]>([]);
    const [editorReady, setEditorReady] = useState(false);

    useImperativeHandle(ref, () => ({
      getCode: () => {
        return editorRef.current ? editorRef.current.getValue() : "";
      },
      jumpToLine: (line: number) => {
        if (editorRef.current && monacoRef.current) {
          editorRef.current.revealLineInCenter(line);
          editorRef.current.setPosition({ lineNumber: line, column: 1 });
          editorRef.current.focus();

          // Highlight the line briefly
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
        if (editorRef.current && monacoRef.current) {
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
                    value: `**${item.owner} Owned:** \`${item.symbol}\`${item.reason ? `\n\n*${item.reason}*` : ""}`,
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

      // Connect to Yjs sync endpoint
      const provider = new WebsocketProvider(wsUrl, `yjs/${roomId}`, ydoc, {
        connect: true,
        maxBackoffTime: 5000,
      });
      providerRef.current = provider;

      // Configure awareness (cursor identity)
      provider.awareness.setLocalStateField("user", {
        name: currentUser.name,
        color: currentUser.color,
        role: currentUser.role,
      });

      // Handle connection status changes
      provider.on("status", (event: { status: "connected" | "connecting" | "disconnected" }) => {
        setConnectionStatus(event.status);
      });

      provider.on("sync", (isSynced: boolean) => {
        if (isSynced) {
          setConnectionStatus("connected");
        }
      });

      // Update presence list from awareness
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

      // Dynamic import of y-monaco to prevent SSR issues
      let binding: any = null;
      import("y-monaco").then(({ MonacoBinding }) => {
        const ytext = ydoc.getText("monaco");
        const model = editorRef.current.getModel();

        if (model) {
          binding = new MonacoBinding(
            ytext,
            model,
            new Set([editorRef.current]),
            provider.awareness
          );
          bindingRef.current = binding;
        }
      });

      return () => {
        if (binding) binding.destroy();
        provider.destroy();
        ydoc.destroy();
        setConnectionStatus("disconnected");
      };
    }, [currentUser, editorReady, roomId, setConnectionStatus, setParticipants]);

    const handleEditorDidMount = (editor: any, monaco: any) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Configure python language options
      monaco.editor.setTheme("vs-dark");

      // Bind Ctrl+Enter / Cmd+Enter to run shortcut
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        if (onRunShortcut) {
          onRunShortcut();
        }
      });

      setEditorReady(true);
    };

    return (
      <div className="relative h-full w-full bg-slate-950 overflow-hidden">
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
            content: ' ';
            border: 3px solid #10b981;
            left: -4px;
            top: -5px;
          }
        `}</style>

        <Editor
          height="100%"
          defaultLanguage="python"
          theme="vs-dark"
          options={{
            fontSize: 13.5,
            fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
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
    );
  }
);

CollaborativeEditor.displayName = "CollaborativeEditor";
