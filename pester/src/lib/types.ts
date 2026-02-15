// ── Types for the pub/sub event bus ─────────────────────────────────────────

export interface ChatMessage {
  id: string;
  fromUserId: string;
  text: string;
  timestamp: number;
}

export interface Conversation {
  friendId: string;
  messages: ChatMessage[];
}

// ── Server → Client events ──────────────────────────────────────────────────

export type ServerMessage =
  | { type: "registered"; userId: string; timestamp: number }
  | { type: "kicked"; message: string }
  | { type: "message"; fromUserId: string; text: string; timestamp: number }
  | { type: "typing"; fromUserId: string; timestamp: number }
  | { type: "error"; message: string };

// ── Client → Server events ──────────────────────────────────────────────────

export type ClientMessage =
  | { type: "register"; userId: string }
  | { type: "message"; targetUserId: string; text: string }
  | { type: "typing"; targetUserId: string };
