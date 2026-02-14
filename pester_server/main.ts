console.log("[System] Initializing Pester Server (Deno)...");

const PORT = 4000;

// ── In-memory state (volatile — nothing persisted) ──────────────────────────
/** userId → WebSocket */
const users = new Map<string, WebSocket>();
/** channelId → Set<userId> */
const channels = new Map<string, Set<string>>();

function makeChannelId(a: string, b: string): string {
  return `chat_${[a, b].sort().join("_")}`;
}

function broadcast(channelId: string, message: unknown, excludeUserId: string | null = null) {
  const members = channels.get(channelId);
  if (!members) return;
  const payload = JSON.stringify(message);
  for (const uid of members) {
    if (uid === excludeUserId) continue;
    const ws = users.get(uid);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function sendTo(userId: string, message: unknown) {
  const ws = users.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function removeUserFromAllChannels(userId: string) {
  for (const [channelId, members] of channels) {
    if (members.has(userId)) {
      members.delete(userId);
      // Notify remaining members that the user left
      broadcast(channelId, {
        type: "user_left",
        channelId,
        userId,
        timestamp: Date.now(),
      });
      // Clean up empty channels
      if (members.size === 0) {
        channels.delete(channelId);
      }
    }
  }
}

// ── WebSocket handler ───────────────────────────────────────────────────────
function handleWebSocket(ws: WebSocket) {
  let currentUserId: string | null = null;

  ws.onmessage = (event) => {
    let msg: { type?: string; [key: string]: unknown };
    try {
      msg = JSON.parse(event.data);
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    switch (msg.type) {
      // ── Register: client sends { type:"register", userId:"alice" }
      case "register": {
        const { userId } = msg;
        if (!userId || typeof userId !== "string") {
          if (currentUserId) {
            sendTo(currentUserId, {
              type: "error",
              message: "userId is required",
            });
          }
          return;
        }

        // Kick existing session for same userId (single-session)
        if (users.has(userId) && users.get(userId) !== ws) {
          const old = users.get(userId)!;
          old.send(
            JSON.stringify({
              type: "kicked",
              message: "Logged in from another client",
            })
          );
          old.close();
          removeUserFromAllChannels(userId);
        }

        currentUserId = userId;
        users.set(userId, ws);
        sendTo(userId, {
          type: "registered",
          userId,
          timestamp: Date.now(),
        });
        console.log(`[+] ${userId} registered`);
        break;
      }

      // ── Open channel: { type:"open_channel", friendId:"bob" }
      case "open_channel": {
        if (!currentUserId) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Register first",
            })
          );
          return;
        }
        const { friendId } = msg;
        if (!friendId || typeof friendId !== "string" || friendId === currentUserId) {
          sendTo(currentUserId, {
            type: "error",
            message: "Invalid friendId",
          });
          return;
        }

        const channelId = makeChannelId(currentUserId, friendId);

        // Create channel if it doesn't exist
        if (!channels.has(channelId)) {
          channels.set(channelId, new Set());
        }
        channels.get(channelId)!.add(currentUserId);

        // Check if friend is online
        const friendOnline = users.has(friendId);

        // Notify the opener
        sendTo(currentUserId, {
          type: "channel_opened",
          channelId,
          friendId,
          friendOnline,
          timestamp: Date.now(),
        });

        // If friend is online, auto-subscribe them and notify
        if (friendOnline) {
          channels.get(channelId)!.add(friendId);
          sendTo(friendId, {
            type: "channel_invite",
            channelId,
            fromUserId: currentUserId,
            timestamp: Date.now(),
          });
        }

        console.log(
          `[#] Channel ${channelId} opened by ${currentUserId} → ${friendId} (friend ${friendOnline ? "online" : "offline"})`
        );
        break;
      }

      // ── Send message: { type:"message", channelId, text }
      case "message": {
        if (!currentUserId) {
          ws.send(
            JSON.stringify({ type: "error", message: "Register first" })
          );
          return;
        }
        const { channelId, text } = msg;
        if (!channelId || typeof channelId !== "string" || !text || typeof text !== "string") return;

        const members = channels.get(channelId);
        if (!members || !members.has(currentUserId)) {
          sendTo(currentUserId, {
            type: "error",
            message: "Not in this channel",
          });
          return;
        }

        broadcast(
          channelId,
          {
            type: "message",
            channelId,
            fromUserId: currentUserId,
            text,
            timestamp: Date.now(),
          },
          currentUserId // don't echo back to sender
        );
        break;
      }

      // ── Typing indicator: { type:"typing", channelId }
      case "typing": {
        if (!currentUserId) return;
        const { channelId: typingChannel } = msg;
        if (!typingChannel || typeof typingChannel !== "string") return;
        broadcast(
          typingChannel,
          {
            type: "typing",
            channelId: typingChannel,
            userId: currentUserId,
            timestamp: Date.now(),
          },
          currentUserId
        );
        break;
      }

      // ── Close channel: { type:"close_channel", channelId }
      case "close_channel": {
        if (!currentUserId) return;
        const { channelId: closeChannel } = msg;
        if (typeof closeChannel !== "string") return;
        const closeMembers = channels.get(closeChannel);
        if (closeMembers) {
          closeMembers.delete(currentUserId);
          broadcast(closeChannel, {
            type: "user_left",
            channelId: closeChannel,
            userId: currentUserId,
            timestamp: Date.now(),
          });
          if (closeMembers.size === 0) {
            channels.delete(closeChannel);
          }
        }
        sendTo(currentUserId, {
          type: "channel_closed",
          channelId: closeChannel,
          timestamp: Date.now(),
        });
        break;
      }

      default:
        ws.send(
          JSON.stringify({
            type: "error",
            message: `Unknown message type: ${msg.type}`,
          })
        );
    }
  };

  ws.onclose = () => {
    if (currentUserId) {
      console.log(`[-] ${currentUserId} disconnected`);
      removeUserFromAllChannels(currentUserId);
      users.delete(currentUserId);
    }
  };

  ws.onerror = (err) => {
    console.error(`[!] WebSocket error for ${currentUserId}:`, err);
  };
}

// ── HTTP Server with WebSocket upgrade ──────────────────────────────────────
Deno.serve({
  port: PORT,
  handler: (req) => {
    if (req.headers.get("upgrade") === "websocket") {
      const { socket, response } = Deno.upgradeWebSocket(req);
      handleWebSocket(socket);
      return response;
    }
    return new Response("Pester WebSocket Server", { status: 200 });
  },
});

console.log(`🚀 Pester pub/sub broker running on ws://localhost:${PORT}`);
