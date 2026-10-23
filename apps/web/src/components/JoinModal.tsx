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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-[#090d1e]/85 backdrop-blur-2xl border border-white/[0.12] rounded-3xl p-7 shadow-[0_24px_50px_rgba(0,0,0,0.8)] relative overflow-hidden ring-1 ring-white/10">
        {/* Living Ambient Glows */}
        <div className="absolute -top-16 -left-16 w-44 h-44 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-44 h-44 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-purple-500/20 to-indigo-500/20 border border-purple-500/30 text-purple-400 shadow-inner">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Join Pair Session</h2>
            <p className="text-xs text-slate-400">
              Room: <span className="font-mono text-purple-300 font-semibold">{roomId}</span>
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-400 mb-6 leading-relaxed">
          Enter your display name to claim a collaborative seat. Two human developers + Pair Master AI pair facilitator.
        </p>

        {error && (
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300 shadow-inner">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              Display Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dev A, Dev B, Alex"
              className="w-full px-4 py-2.5 text-sm bg-slate-950/80 border border-white/[0.12] rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400 transition shadow-inner font-sans"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-purple-600 via-indigo-600 to-teal-600 hover:from-purple-500 hover:to-teal-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition transform active:scale-[0.98]"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Claiming Seat...</span>
              </>
            ) : (
              <>
                <span>Enter Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
