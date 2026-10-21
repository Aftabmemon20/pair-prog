"use client";

import React, { useState } from "react";
import { Users, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { useRoomStore } from "../store/roomStore";
import { JoinResponse } from "../types";

interface JoinModalProps {
  roomId: string;
}

export function JoinModal({ roomId }: JoinModalProps) {
  const { currentUser, setSession } = useRoomStore();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (currentUser) {
    return null;
  }

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    try {
      const res = await fetch(`${apiUrl}/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Failed to join room (HTTP ${res.status})`);
      }

      const data: JoinResponse = await res.json();
      setSession(data.token, {
        id: data.participant_id,
        name: data.name,
        color: data.color,
        role: data.role,
      });

      // Persist to session storage so refresh preserves identity
      sessionStorage.setItem(`pairio_token_${roomId}`, data.token);
      sessionStorage.setItem(`pairio_user_${roomId}`, JSON.stringify({
        id: data.participant_id,
        name: data.name,
        color: data.color,
        role: data.role,
      }));
    } catch (err: any) {
      setError(err.message || "Failed to join room.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-12 -left-12 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center gap-2 mb-2">
          <div className="p-2 rounded-lg bg-purple-950/60 border border-purple-800/80 text-purple-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Join Pair Session</h2>
            <p className="text-xs text-slate-400">Room: <span className="font-mono text-slate-300">{roomId}</span></p>
          </div>
        </div>

        <p className="text-xs text-slate-400 mb-5 leading-relaxed">
          Enter your display name to claim a seat. Max 2 human developers per session + Pair Master AI facilitator.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Display Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dev A, Mark, Alice"
              className="w-full px-3.5 py-2 text-sm bg-slate-950 border border-slate-700/80 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Claiming Seat...</span>
              </>
            ) : (
              <>
                <span>Enter Room</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
