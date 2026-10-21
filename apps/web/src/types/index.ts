export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface Participant {
  id: string;
  name: string;
  color: string;
  role: "host" | "peer";
  joined_at?: number;
  last_seen_at?: number;
}

export interface RoomDetails {
  id: string;
  status: string;
  participants: Participant[];
  max_humans: number;
}

export interface JoinResponse {
  token: string;
  participant_id: string;
  name: string;
  color: string;
  role: "host" | "peer";
  room_id: string;
}
