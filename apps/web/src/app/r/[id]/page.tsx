"use client";

import React, { useEffect } from "react";
import { useParams } from "next/navigation";
import { PresenceBar } from "@/components/PresenceBar";
import { JoinModal } from "@/components/JoinModal";
import { CollaborativeEditor } from "@/components/CollaborativeEditor";
import { useRoomStore } from "@/store/roomStore";

export default function RoomPage() {
  const params = useParams();
  const roomId = params.id as string;
  const { setRoomId, setSession, currentUser } = useRoomStore();

  useEffect(() => {
    if (roomId) {
      setRoomId(roomId);
      // Attempt restore session from sessionStorage
      const savedToken = sessionStorage.getItem(`pairio_token_${roomId}`);
      const savedUser = sessionStorage.getItem(`pairio_user_${roomId}`);
      if (savedToken && savedUser && !currentUser) {
        try {
          const userObj = JSON.parse(savedUser);
          setSession(savedToken, userObj);
        } catch {
          // Ignore parse error
        }
      }
    }
  }, [roomId, setRoomId, setSession, currentUser]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 select-none">
      <PresenceBar />
      <JoinModal roomId={roomId} />
      
      <main className="flex-1 relative overflow-hidden">
        <CollaborativeEditor roomId={roomId} />
      </main>
    </div>
  );
}
