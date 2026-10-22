import { create } from "zustand";
import { ConnectionStatus, Participant } from "../types";

interface RoomStoreState {
  roomId: string | null;
  token: string | null;
  currentUser: Participant | null;
  participants: Participant[];
  connectionStatus: ConnectionStatus;
  activeScreenStream: MediaStream | null;
  activeScreenSharer: string | null;
  
  // Actions
  setRoomId: (id: string) => void;
  setSession: (token: string, user: Participant) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setParticipants: (participants: Participant[]) => void;
  setActiveScreenStream: (stream: MediaStream | null, sharer?: string | null) => void;
  reset: () => void;
}

export const useRoomStore = create<RoomStoreState>((set) => ({
  roomId: null,
  token: null,
  currentUser: null,
  participants: [],
  connectionStatus: "disconnected",
  activeScreenStream: null,
  activeScreenSharer: null,

  setRoomId: (id) => set({ roomId: id }),
  setSession: (token, user) => set({ token, currentUser: user }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setParticipants: (participants) => set({ participants }),
  setActiveScreenStream: (stream, sharer = null) => set({
    activeScreenStream: stream,
    activeScreenSharer: sharer,
  }),
  reset: () => set({
    roomId: null,
    token: null,
    currentUser: null,
    participants: [],
    connectionStatus: "disconnected",
    activeScreenStream: null,
    activeScreenSharer: null,
  }),
}));
