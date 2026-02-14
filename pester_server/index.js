import { createServer } from "node:http";
import { Server } from "socket.io";
import { WebSocketServer } from "ws";

console.log("[System] Initializing Pester Server (Node.js)...");

const PORT = process.env.PORT || 4000;

// ── In-memory state (volatile — nothing persisted) ──────────────────────────
/** userId → { type: "ws" | "socketio", conn: WebSocket | Socket } */
const users = new Map();
/** channelId → Set<userId> */
const channels = new Map();

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
    sendTo(uid, message);
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
      channels.get(channelId).add(currentUserId);

      const friendOnline = users.has(friendId);
      sendTo(currentUserId, {
        type: "channel_opened",
        channelId,
        friendId,
        friendOnline,
        timestamp: Date.now(),
      });

      if (friendOnline) {
        channels.get(channelId).add(friendId);
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
      if (!channelId || typeof channelId !== "string" || !text || typeof text !== "string") return;

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
          text,
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

// ── HTTP Server ─────────────────────────────────────────────────────────────
const httpServer = createServer((req, res) => {
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
