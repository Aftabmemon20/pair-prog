"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Code2, Users, Bot, Sparkles, CheckCircle2 } from "lucide-react";

export default function LandingPage() {
  const router = useRouter();
  const [roomIdInput, setRoomIdInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreateRoom = async () => {
    setLoading(true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${apiUrl}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/r/${data.room_id}`);
      } else {
        // Fallback local random room if API not reached
        const fallbackId = `room_${Math.random().toString(36).substring(2, 9)}`;
        router.push(`/r/${fallbackId}`);
      }
    } catch {
      const fallbackId = `room_${Math.random().toString(36).substring(2, 9)}`;
      router.push(`/r/${fallbackId}`);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinExisting = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomIdInput.trim()) {
      router.push(`/r/${roomIdInput.trim()}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-purple-500/30">
      {/* Top Navbar */}
      <header className="px-6 py-4 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center font-bold text-white text-sm shadow-lg shadow-purple-500/25">
            P
          </div>
          <div>
            <span className="font-bold text-base tracking-tight text-white block leading-tight">
              Pairio-Lite
            </span>
            <span className="text-[10px] text-purple-400 font-mono tracking-widest uppercase">
              Pair Master
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>3-Seat Architecture Ready</span>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-purple-300 bg-purple-950/60 border border-purple-800/60 rounded-full mb-6 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>Collaborative Pair Programming Prototype</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white mb-6">
          Pair programming with an AI agent in the{" "}
          <span className="bg-gradient-to-r from-purple-400 via-indigo-300 to-sky-400 bg-clip-text text-transparent">
            third seat
          </span>
          .
        </h1>

        <p className="text-base sm:text-lg text-slate-400 max-w-2xl mb-10 leading-relaxed font-normal">
          Zero-conflict CRDT code editing for two developers, backed by an autonomous AI facilitator that splits function ownership, isolates runtime bugs, and visualizes call chains.
        </p>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-md mb-12">
          <button
            onClick={handleCreateRoom}
            disabled={loading}
            className="w-full sm:w-auto flex-1 py-3.5 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-xl shadow-purple-600/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            <span>{loading ? "Creating..." : "Create Pair Room"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <form onSubmit={handleJoinExisting} className="flex w-full sm:w-auto flex-1 gap-2">
            <input
              type="text"
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value)}
              placeholder="Enter Room ID"
              className="w-full px-3.5 py-3 text-sm bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
            <button
              type="submit"
              disabled={!roomIdInput.trim()}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700/60 disabled:opacity-40 transition"
            >
              Join
            </button>
          </form>
        </div>

        {/* The 3 Seats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full text-left">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur hover:border-emerald-800/60 transition group">
            <div className="flex items-center gap-2 mb-2 text-emerald-400">
              <Users className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Seat 1: Dev A (Host)</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Drives development, edits in real-time, initiates runs, and shares audio/screen with low-latency WebRTC.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur hover:border-sky-800/60 transition group">
            <div className="flex items-center gap-2 mb-2 text-sky-400">
              <Code2 className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Seat 2: Dev B (Peer)</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Simultaneous concurrent editing on the same file via Yjs CRDT. No locking, no merge conflicts.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur hover:border-purple-800/60 transition group">
            <div className="flex items-center gap-2 mb-2 text-purple-400">
              <Bot className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Seat 3: Pair Master</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              AST code ownership manager, runtime traceback analyzer, call chain diagram generator, and editor annotator.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-slate-800/80 text-xs text-slate-500 text-center">
        Pairio-Lite prototype — Built for high-fidelity technical demonstration
      </footer>
    </div>
  );
}
