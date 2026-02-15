// ── Types for the pub/sub messaging system ──────────────────────────────────

export interface ChatMessage {
  id: string;
  fromUserId: string;
  text: string;
  timestamp: number;
}

export interface Channel {
  channelId: string;
  friendId: string;
  friendOnline: boolean;
  messages: ChatMessage[];
}

// ── Server → Client messages ────────────────────────────────────────────────

export type ServerMessage =
  | { type: "registered"; userId: string; timestamp: number }
  | { type: "kicked"; message: string }
  | { type: "channel_opened"; channelId: string; friendId: string; friendOnline: boolean; timestamp: number }
  | { type: "channel_invite"; channelId: string; fromUserId: string; timestamp: number }
  | { type: "message"; channelId: string; fromUserId: string; text: string; timestamp: number }
  | { type: "typing"; channelId: string; userId: string; timestamp: number }
  | { type: "user_left"; channelId: string; userId: string; timestamp: number }
  | { type: "user_online"; channelId: string; userId: string; timestamp: number }
  | { type: "channel_closed"; channelId: string; timestamp: number }
  | { type: "error"; message: string };

// ── Client → Server messages ────────────────────────────────────────────────

export type ClientMessage =
  | { type: "register"; userId: string }
  | { type: "open_channel"; friendId: string }
  | { type: "message"; channelId: string; text: string }
  | { type: "typing"; channelId: string }
  | { type: "close_channel"; channelId: string };
