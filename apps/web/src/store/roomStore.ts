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
  theme: "dark" | "light";
  
  // Actions
  setRoomId: (id: string) => void;
  setSession: (token: string, user: Participant) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setParticipants: (participants: Participant[]) => void;
  setActiveScreenStream: (stream: MediaStream | null, sharer?: string | null) => void;
  setTheme: (theme: "dark" | "light") => void;
  toggleTheme: () => void;
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
  theme: "dark",

  setRoomId: (id) => set({ roomId: id }),
  setSession: (token, user) => set({ token, currentUser: user }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setParticipants: (participants) => set({ participants }),
  setActiveScreenStream: (stream, sharer = null) => set({
    activeScreenStream: stream,
    activeScreenSharer: sharer,
  }),
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
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
