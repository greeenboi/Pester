import { createServer } from "node:http";
import { Server } from "socket.io";
import { WebSocketServer } from "ws";
import * as v from "valibot";

const MessageTextSchema = v.pipe(
  v.string(),
  v.trim(),
  v.nonEmpty("Message cannot be empty"),
  v.maxLength(300, "Message must be 300 characters or less"),
);

console.log("[System] Initializing Pester Server (Node.js)...");

const PORT = process.env.PORT || 4000;

// ── In-memory state (volatile — nothing persisted) ──────────────────────────
/** userId → { type: "ws" | "socketio", conn: WebSocket | Socket } */
const users = new Map();
/** channelId → Set<userId> */
const channels = new Map();
/** userId → Array<{ channelId, fromUserId, text, timestamp }> — messages buffered while offline */
const offlineMessages = new Map();

function makeChannelId(a, b) {
  return `chat_${[a, b].sort().join("_")}`;
}

/** Send a message object to a connected user, regardless of transport */
function sendTo(userId, message) {
  const entry = users.get(userId);
  if (!entry) return;

  if (entry.type === "ws") {
    if (entry.conn.readyState === 1 /* WebSocket.OPEN */) {
      entry.conn.send(JSON.stringify(message));
    }
  } else {
    entry.conn.emit("message", message);
  }
}

function broadcast(channelId, message, excludeUserId = null) {
  const members = channels.get(channelId);
  if (!members) return;
  for (const uid of members) {
    if (uid === excludeUserId) continue;
    if (users.has(uid)) {
      sendTo(uid, message);
    } else if (message.type === "message") {
      // Buffer chat messages for offline users
      if (!offlineMessages.has(uid)) offlineMessages.set(uid, []);
      offlineMessages.get(uid).push(message);
      console.log(`[📦] Buffered message for offline user ${uid}`);
    }
  }
}

function removeUserFromAllChannels(userId) {
  for (const [channelId, members] of channels) {
    if (members.has(userId)) {
      members.delete(userId);
      broadcast(channelId, {
        type: "user_left",
        channelId,
        userId,
        timestamp: Date.now(),
      });
      if (members.size === 0) {
        channels.delete(channelId);
      }
    }
  }
}

// ── Shared message handler (works for both WS and Socket.IO) ────────────────
function handleIncomingMessage(msg, getCurrentUserId, setCurrentUserId, sendError, disconnectOld) {
  switch (msg.type) {
    case "register": {
      const { userId } = msg;
      if (!userId || typeof userId !== "string") {
        if (getCurrentUserId()) {
          sendTo(getCurrentUserId(), { type: "error", message: "userId is required" });
        }
        return;
      }

      // Kick existing session for same userId (single-session)
      if (users.has(userId)) {
        const old = users.get(userId);
        sendTo(userId, { type: "kicked", message: "Logged in from another client" });
        disconnectOld(old);
        removeUserFromAllChannels(userId);
      }

      setCurrentUserId(userId);
      sendTo(userId, { type: "registered", userId, timestamp: Date.now() });
      console.log(`[+] ${userId} registered`);

      // ── Re-join existing channels & notify peers ──────────────────────
      for (const [channelId, members] of channels) {
        if (members.has(userId)) {
          // Find the other user in this channel
          const friendId = [...members].find((m) => m !== userId);
          if (friendId) {
            // Notify this user about the channel they're still in
            sendTo(userId, {
              type: "channel_invite",
              channelId,
              fromUserId: friendId,
              timestamp: Date.now(),
            });
            // Notify the other member that this user is now online
            sendTo(friendId, {
              type: "user_online",
              channelId,
              userId,
              timestamp: Date.now(),
            });
          }
        }
      }

      // ── Deliver buffered offline messages ─────────────────────────────
      const buffered = offlineMessages.get(userId);
      if (buffered && buffered.length > 0) {
        console.log(`[📬] Delivering ${buffered.length} buffered messages to ${userId}`);
        for (const msg of buffered) {
          sendTo(userId, msg);
        }
        offlineMessages.delete(userId);
      }

      break;
    }

    case "open_channel": {
      const currentUserId = getCurrentUserId();
      if (!currentUserId) {
        sendError("Register first");
        return;
      }
      const { friendId } = msg;
      if (!friendId || typeof friendId !== "string" || friendId === currentUserId) {
        sendTo(currentUserId, { type: "error", message: "Invalid friendId" });
        return;
      }

      const channelId = makeChannelId(currentUserId, friendId);
      if (!channels.has(channelId)) {
        channels.set(channelId, new Set());
      }
      // Always add both users to the channel
      channels.get(channelId).add(currentUserId);
      channels.get(channelId).add(friendId);

      const friendOnline = users.has(friendId);
      sendTo(currentUserId, {
        type: "channel_opened",
        channelId,
        friendId,
        friendOnline,
        timestamp: Date.now(),
      });

      if (friendOnline) {
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

    case "message": {
      const currentUserId = getCurrentUserId();
      if (!currentUserId) {
        sendError("Register first");
        return;
      }
      const { channelId, text } = msg;
      if (!channelId || typeof channelId !== "string") return;

      // Validate message text with valibot
      const textResult = v.safeParse(MessageTextSchema, text);
      if (!textResult.success) {
        const issue = textResult.issues[0]?.message ?? "Invalid message text";
        sendTo(currentUserId, { type: "error", message: issue });
        return;
      }

      const members = channels.get(channelId);
      if (!members || !members.has(currentUserId)) {
        sendTo(currentUserId, { type: "error", message: "Not in this channel" });
        return;
      }

      broadcast(
        channelId,
        {
          type: "message",
          channelId,
          fromUserId: currentUserId,
          text: textResult.output,
          timestamp: Date.now(),
        },
        currentUserId
      );
      break;
    }

    case "typing": {
      const currentUserId = getCurrentUserId();
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

    case "close_channel": {
      const currentUserId = getCurrentUserId();
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
      sendError(`Unknown message type: ${msg.type}`);
  }
}

function handleDisconnect(currentUserId) {
  if (currentUserId) {
    console.log(`[-] ${currentUserId} disconnected`);
    removeUserFromAllChannels(currentUserId);
    users.delete(currentUserId);
  }
}

// ── HTTP Server (with REST API) ─────────────────────────────────────────────
const httpServer = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS headers for all API responses
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // ── GET /api/status?users=id1,id2,... — check online status via HTTP ──
  if (req.method === "GET" && url.pathname === "/api/status") {
    const userIds = url.searchParams.get("users")?.split(",").filter(Boolean) || [];
    const result = {};
    for (const id of userIds) {
      result[id] = users.has(id);
    }
    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
    res.end(JSON.stringify(result));
    return;
  }

  // ── GET /api/online — list all currently connected users ──────────────
  if (req.method === "GET" && url.pathname === "/api/online") {
    const onlineList = [...users.keys()];
    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
    res.end(JSON.stringify({ count: onlineList.length, users: onlineList }));
    return;
  }

  // ── POST /api/test-message — send a test message to a user ULID ──────
  if (req.method === "POST" && url.pathname === "/api/test-message") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { targetUserId, text } = JSON.parse(body);
        if (!targetUserId || typeof targetUserId !== "string") {
          res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders });
          res.end(JSON.stringify({ error: "targetUserId is required" }));
          return;
        }

        const messageText = text || `[Test] ping at ${new Date().toISOString()}`;
        const testSenderId = "__server_test__";
        const channelId = makeChannelId(testSenderId, targetUserId);

        // Ensure channel exists
        if (!channels.has(channelId)) {
          channels.set(channelId, new Set([testSenderId, targetUserId]));
        } else {
          channels.get(channelId).add(testSenderId);
          channels.get(channelId).add(targetUserId);
        }

        const online = users.has(targetUserId);
        const message = {
          type: "message",
          channelId,
          fromUserId: testSenderId,
          text: messageText,
          timestamp: Date.now(),
        };

        if (online) {
          // Also send channel_invite so the client creates the channel entry
          sendTo(targetUserId, {
            type: "channel_invite",
            channelId,
            fromUserId: testSenderId,
            timestamp: Date.now(),
          });
          sendTo(targetUserId, message);
          res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
          res.end(JSON.stringify({ ok: true, delivered: true, message: messageText }));
        } else {
          // Buffer for when they come online
          if (!offlineMessages.has(targetUserId)) offlineMessages.set(targetUserId, []);
          offlineMessages.get(targetUserId).push(message);
          res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
          res.end(JSON.stringify({ ok: true, delivered: false, buffered: true, message: messageText }));
        }
        console.log(`[🧪] Test message → ${targetUserId} (${online ? "delivered" : "buffered"})`);
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
      }
    });
    return;
  }

  // ── GET /api/channels — debug: list active channels ───────────────────
  if (req.method === "GET" && url.pathname === "/api/channels") {
    const result = {};
    for (const [channelId, members] of channels) {
      result[channelId] = [...members];
    }
    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
    res.end(JSON.stringify(result));
    return;
  }

  // Default / health
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Pester WebSocket Server");
});

// ── Raw WebSocket Server (for Tauri / native WS clients) ────────────────────
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws) => {
  let currentUserId = null;

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    handleIncomingMessage(
      msg,
      () => currentUserId,
      (id) => {
        currentUserId = id;
        users.set(id, { type: "ws", conn: ws });
      },
      (errMsg) => ws.send(JSON.stringify({ type: "error", message: errMsg })),
      (old) => {
        if (old.type === "ws") old.conn.close();
        else old.conn.disconnect();
      }
    );
  });

  ws.on("close", () => handleDisconnect(currentUserId));
  ws.on("error", (err) => console.error(`[!] WS error for ${currentUserId}:`, err));
});

// ── Socket.IO Server (for web clients) ──────────────────────────────────────
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
});

io.on("connection", (socket) => {
  let currentUserId = null;

  socket.on("message", (data) => {
    const msg = typeof data === "string" ? JSON.parse(data) : data;

    handleIncomingMessage(
      msg,
      () => currentUserId,
      (id) => {
        currentUserId = id;
        users.set(id, { type: "socketio", conn: socket });
      },
      (errMsg) => socket.emit("message", { type: "error", message: errMsg }),
      (old) => {
        if (old.type === "ws") old.conn.close();
        else old.conn.disconnect();
      }
    );
  });

  socket.on("disconnect", () => handleDisconnect(currentUserId));
  socket.on("error", (err) => console.error(`[!] Socket.IO error for ${currentUserId}:`, err));
});

// ── Upgrade handling: route raw WS vs Socket.IO ────────────────────────────
httpServer.on("upgrade", (req, socket, head) => {
  // Socket.IO handles its own upgrades on /socket.io/ path
  if (req.url?.startsWith("/socket.io")) {
    return; // let Socket.IO handle it
  }

  // Everything else goes to raw WebSocket
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Pester pub/sub broker running on port ${PORT}`);
  console.log(`   Raw WebSocket: ws://localhost:${PORT}`);
  console.log(`   Socket.IO:     http://localhost:${PORT}/socket.io/`);
});
