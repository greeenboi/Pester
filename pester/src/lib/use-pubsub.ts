import { useCallback, useEffect, useRef, useState } from "react";
import * as v from "valibot";
import type { Conversation, ChatMessage, ServerMessage } from "./types";
import TauriWebSocket from "@tauri-apps/plugin-websocket";

const WS_URL = "ws://localhost:4000";

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
  const [conversations, setConversations] = useState<Map<string, Conversation>>(new Map());
  const [activeFriendId, setActiveFriendId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const userIdRef = useRef<string | null>(null);

  // Keep ref in sync for use inside WS listener closure
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // ── Send helper ───────────────────────────────────────────────────────────
  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  // ── Ensure a conversation exists for a given friendId ─────────────────────
  const ensureConversation = useCallback((friendId: string) => {
    setConversations((prev) => {
      if (prev.has(friendId)) return prev;
      const next = new Map(prev);
      next.set(friendId, { friendId, messages: [] });
      return next;
    });
  }, []);

  // ── Message handler ──────────────────────────────────────────────────────
  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "registered":
        setUserId(msg.userId);
        setStatus("registered");
        break;

      case "kicked":
        setError(msg.message);
        setStatus("disconnected");
        setUserId(null);
        break;

      case "message": {
        const chatMsg: ChatMessage = {
          id: `${msg.fromUserId}-${msg.timestamp}`,
          fromUserId: msg.fromUserId,
          text: msg.text,
          timestamp: msg.timestamp,
        };
        setConversations((prev) => {
          const next = new Map(prev);
          const existing = next.get(msg.fromUserId);
          if (existing) {
            next.set(msg.fromUserId, {
              ...existing,
              messages: [...existing.messages, chatMsg],
            });
          } else {
            // Auto-create conversation for incoming messages
            next.set(msg.fromUserId, {
              friendId: msg.fromUserId,
              messages: [chatMsg],
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
          next.set(msg.fromUserId, msg.timestamp);
          return next;
        });
        const existing = typingTimersRef.current.get(msg.fromUserId);
        if (existing) clearTimeout(existing);
        typingTimersRef.current.set(
          msg.fromUserId,
          setTimeout(() => {
            setTypingUsers((prev) => {
              const next = new Map(prev);
              next.delete(msg.fromUserId);
              return next;
            });
          }, 3000)
        );
        break;
      }

      case "error":
        setError(msg.message);
        break;
    }
  }, []);

  // ── Register (connect + subscribe) ───────────────────────────────────────
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
            // Auto-reconnect after a short delay
            setTimeout(() => {
              if (userIdRef.current) {
                register(userIdRef.current);
              }
            }, 3000);
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
  const sendMessage = useCallback(
    (targetUserId: string, text: string) => {
      if (!userId) return;
      const result = v.safeParse(MessageTextSchema, text);
      if (!result.success) return;
      const validText = result.output;

      send({ type: "message", targetUserId, text: validText });

      // Append to local conversation
      const chatMsg: ChatMessage = {
        id: `${userId}-${Date.now()}`,
        fromUserId: userId,
        text: validText,
        timestamp: Date.now(),
      };
      setConversations((prev) => {
        const next = new Map(prev);
        const existing = next.get(targetUserId);
        if (existing) {
          next.set(targetUserId, {
            ...existing,
            messages: [...existing.messages, chatMsg],
          });
        } else {
          next.set(targetUserId, {
            friendId: targetUserId,
            messages: [chatMsg],
          });
        }
        return next;
      });
    },
    [send, userId]
  );

  const sendTyping = useCallback(
    (targetUserId: string) => {
      send({ type: "typing", targetUserId });
    },
    [send]
  );

  const disconnect = useCallback(async () => {
    if (wsRef.current) {
      await wsRef.current.disconnect();
    }
    setUserId(null);
    setConversations(new Map());
    setActiveFriendId(null);
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
    conversations,
    activeFriendId,
    setActiveFriendId,
    typingUsers,
    error,
    setError,
    register,
    ensureConversation,
    sendMessage,
    sendTyping,
    disconnect,
  };
}
