import { useCallback, useEffect, useRef, useState } from "react";
import * as v from "valibot";
import type { Channel, ChatMessage, ServerMessage } from "./types";
import TauriWebSocket from "@tauri-apps/plugin-websocket";

const WS_URL = "ws://localhost:4000";

export const HTTP_URL = WS_URL.replace("wss://", "https://").replace("ws://", "http://");

const MessageTextSchema = v.pipe(
  v.string(),
  v.trim(),
  v.nonEmpty("Message cannot be empty"),
  v.maxLength(300, "Message must be 300 characters or less"),
);

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "registered";

export function usePubSub() {
  const wsRef = useRef<TauriWebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [userId, setUserId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Map<string, Channel>>(new Map());
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Send helper ───────────────────────────────────────────────────────────
  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  // ── Message handler ──────────────────────────────────────────────────────
  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "registered":
        setUserId(msg.userId);
        setStatus("registered");
        setChannels(new Map());
        setActiveChannelId(null);
        break;

      case "kicked":
        setError(msg.message);
        setStatus("disconnected");
        setUserId(null);
        break;

      case "channel_opened":
        setChannels((prev) => {
          const next = new Map(prev);
          if (!next.has(msg.channelId)) {
            next.set(msg.channelId, {
              channelId: msg.channelId,
              friendId: msg.friendId,
              friendOnline: msg.friendOnline,
              messages: [],
            });
          }
          return next;
        });
        setActiveChannelId(msg.channelId);
        break;

      case "channel_invite":
        setChannels((prev) => {
          const next = new Map(prev);
          if (!next.has(msg.channelId)) {
            next.set(msg.channelId, {
              channelId: msg.channelId,
              friendId: msg.fromUserId,
              friendOnline: true,
              messages: [],
            });
          }
          return next;
        });
        break;

      case "message": {
        const chatMsg: ChatMessage = {
          id: `${msg.fromUserId}-${msg.timestamp}`,
          fromUserId: msg.fromUserId,
          text: msg.text,
          timestamp: msg.timestamp,
        };
        setChannels((prev) => {
          const next = new Map(prev);
          const channel = next.get(msg.channelId);
          if (channel) {
            next.set(msg.channelId, {
              ...channel,
              messages: [...channel.messages, chatMsg],
            });
          }
          return next;
        });
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(msg.fromUserId);
          return next;
        });
        break;
      }

      case "typing": {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.set(msg.userId, msg.timestamp);
          return next;
        });
        const existing = typingTimersRef.current.get(msg.userId);
        if (existing) clearTimeout(existing);
        typingTimersRef.current.set(
          msg.userId,
          setTimeout(() => {
            setTypingUsers((prev) => {
              const next = new Map(prev);
              next.delete(msg.userId);
              return next;
            });
          }, 3000)
        );
        break;
      }

      case "user_left":
        setChannels((prev) => {
          const next = new Map(prev);
          const channel = next.get(msg.channelId);
          if (channel) {
            next.set(msg.channelId, { ...channel, friendOnline: false });
          }
          return next;
        });
        break;

      case "user_online":
        setChannels((prev) => {
          const next = new Map(prev);
          const channel = next.get(msg.channelId);
          if (channel) {
            next.set(msg.channelId, { ...channel, friendOnline: true });
          }
          return next;
        });
        break;

      case "channel_closed":
        setChannels((prev) => {
          const next = new Map(prev);
          next.delete(msg.channelId);
          return next;
        });
        setActiveChannelId((prev) => (prev === msg.channelId ? null : prev));
        break;

      case "error":
        setError(msg.message);
        break;
    }
  }, []);

  // ── Register (connect + identify) ────────────────────────────────────────
  const register = useCallback(async (id: string) => {
    if (wsRef.current) {
      await wsRef.current.disconnect();
    }

    setStatus("connecting");
    setError(null);

    try {
      const ws = await TauriWebSocket.connect(WS_URL);
      wsRef.current = ws;
      setStatus("connected");

      ws.addListener((rawMsg) => {
        // Tauri WS plugin sends { type: "Text", data: "..." } or { type: "Close", ... }
        if (typeof rawMsg === "object" && rawMsg !== null) {
          const envelope = rawMsg as { type?: string; data?: string };
          if (envelope.type === "Text" && envelope.data) {
            try {
              const parsed: ServerMessage = JSON.parse(envelope.data);
              handleMessage(parsed);
            } catch {
              // ignore parse errors
            }
          } else if (envelope.type === "Close") {
            setStatus("disconnected");
            wsRef.current = null;
          }
        }
      });

      await ws.send(JSON.stringify({ type: "register", userId: id }));
    } catch {
      setError("Connection failed. Is the server running?");
      setStatus("disconnected");
    }
  }, [handleMessage]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const openChannel = useCallback(
    (friendId: string) => {
      send({ type: "open_channel", friendId });
    },
    [send]
  );

  const sendMessage = useCallback(
    (channelId: string, text: string) => {
      if (!userId) return;
      const result = v.safeParse(MessageTextSchema, text);
      if (!result.success) return;
      const validText = result.output;
      send({ type: "message", channelId, text: validText });
      const chatMsg: ChatMessage = {
        id: `${userId}-${Date.now()}`,
        fromUserId: userId,
        text: validText,
        timestamp: Date.now(),
      };
      setChannels((prev) => {
        const next = new Map(prev);
        const channel = next.get(channelId);
        if (channel) {
          next.set(channelId, {
            ...channel,
            messages: [...channel.messages, chatMsg],
          });
        }
        return next;
      });
    },
    [send, userId]
  );

  const sendTyping = useCallback(
    (channelId: string) => {
      send({ type: "typing", channelId });
    },
    [send]
  );

  const closeChannel = useCallback(
    (channelId: string) => {
      send({ type: "close_channel", channelId });
      setChannels((prev) => {
        const next = new Map(prev);
        next.delete(channelId);
        return next;
      });
      setActiveChannelId((prev) => (prev === channelId ? null : prev));
    },
    [send]
  );

  const disconnect = useCallback(async () => {
    if (wsRef.current) {
      await wsRef.current.disconnect();
    }
    setUserId(null);
    setChannels(new Map());
    setActiveChannelId(null);
    setStatus("disconnected");
  }, []);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      wsRef.current?.disconnect();
      for (const timer of typingTimersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  return {
    status,
    userId,
    channels,
    activeChannelId,
    setActiveChannelId,
    typingUsers,
    error,
    setError,
    register,
    openChannel,
    sendMessage,
    sendTyping,
    closeChannel,
    disconnect,
  };
}
