"use client";

import React, { useEffect, useRef, useState } from "react";
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

interface CollaborativeEditorProps {
  roomId: string;
}

export function CollaborativeEditor({ roomId }: CollaborativeEditorProps) {
  const { currentUser, setConnectionStatus, setParticipants } = useRoomStore();
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const bindingRef = useRef<any>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const [editorReady, setEditorReady] = useState(false);

  // Initialize Yjs and WebSocket provider
  useEffect(() => {
    if (!currentUser || !editorReady || !editorRef.current) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
    setConnectionStatus("connecting");

    const ydoc = new Y.Doc();
    docRef.current = ydoc;

    // Connect to Yjs sync endpoint
    // y-websocket connects to `${wsUrl}/${roomname}`. We pass `yjs/${roomId}` as room name
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
