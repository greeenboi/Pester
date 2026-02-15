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

console.log("[System] Initializing Pester Event Bus (Node.js)...");

const PORT = process.env.PORT || 4000;

// ── In-memory state ─────────────────────────────────────────────────────────
/** userId → { type: "ws" | "socketio", conn: WebSocket | Socket } */
const subscribers = new Map();
/** userId → Array<{ fromUserId, text, timestamp }> — buffered while offline */
const pendingMessages = new Map();

/** Send a message object to a subscribed user, regardless of transport */
function sendTo(userId, message) {
  const entry = subscribers.get(userId);
  if (!entry) return false;

  if (entry.type === "ws") {
    if (entry.conn.readyState === 1 /* WebSocket.OPEN */) {
      entry.conn.send(JSON.stringify(message));
      return true;
    }
  } else {
    entry.conn.emit("message", message);
    return true;
  }
  return false;
}

/** Deliver a message to targetUserId, or buffer it for later */
function deliverOrBuffer(targetUserId, message) {
  if (subscribers.has(targetUserId)) {
    sendTo(targetUserId, message);
    return true;
  }
  // Buffer for when they reconnect
  if (!pendingMessages.has(targetUserId)) pendingMessages.set(targetUserId, []);
  pendingMessages.get(targetUserId).push(message);
  console.log(`[📦] Buffered message for ${targetUserId}`);
  return false;
}

// ── Shared message handler (works for both WS and Socket.IO) ────────────────
function handleIncomingMessage(msg, getCurrentUserId, setCurrentUserId, sendError, disconnectOld) {
  switch (msg.type) {
    case "register": {
      const { userId } = msg;
      if (!userId || typeof userId !== "string") {
        sendError("userId is required");
        return;
      }

      // Kick existing session for same userId (single-session)
      if (subscribers.has(userId)) {
        const old = subscribers.get(userId);
        sendTo(userId, { type: "kicked", message: "Logged in from another client" });
        disconnectOld(old);
      }

      setCurrentUserId(userId);
      sendTo(userId, { type: "registered", userId, timestamp: Date.now() });
      console.log(`[+] ${userId} subscribed`);

      // ── Deliver buffered messages ─────────────────────────────────────
      const buffered = pendingMessages.get(userId);
      if (buffered && buffered.length > 0) {
        console.log(`[📬] Delivering ${buffered.length} buffered messages to ${userId}`);
        for (const m of buffered) {
          sendTo(userId, m);
        }
        pendingMessages.delete(userId);
      }

      break;
    }

    case "message": {
      const currentUserId = getCurrentUserId();
      if (!currentUserId) {
        sendError("Register first");
        return;
      }
      const { targetUserId, text } = msg;
      if (!targetUserId || typeof targetUserId !== "string") {
        sendTo(currentUserId, { type: "error", message: "targetUserId is required" });
        return;
      }

      // Validate message text with valibot
      const textResult = v.safeParse(MessageTextSchema, text);
      if (!textResult.success) {
        const issue = textResult.issues[0]?.message ?? "Invalid message text";
        sendTo(currentUserId, { type: "error", message: issue });
        return;
      }

      const event = {
        type: "message",
        fromUserId: currentUserId,
        text: textResult.output,
        timestamp: Date.now(),
      };

      const delivered = deliverOrBuffer(targetUserId, event);
      console.log(`[→] ${currentUserId} → ${targetUserId}: "${textResult.output.slice(0, 50)}" (${delivered ? "delivered" : "buffered"})`);
      break;
    }

    case "typing": {
      const currentUserId = getCurrentUserId();
      if (!currentUserId) return;
      const { targetUserId } = msg;
      if (!targetUserId || typeof targetUserId !== "string") return;

      // Typing events are fire-and-forget, no buffering
      sendTo(targetUserId, {
        type: "typing",
        fromUserId: currentUserId,
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
    console.log(`[-] ${currentUserId} unsubscribed`);
    subscribers.delete(currentUserId);
  }
}

// ── HTTP Server (with REST API) ─────────────────────────────────────────────
const httpServer = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
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
        const event = {
          type: "message",
          fromUserId: "__server_test__",
          text: messageText,
          timestamp: Date.now(),
        };

        const delivered = deliverOrBuffer(targetUserId, event);
        res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ ok: true, delivered, buffered: !delivered, message: messageText }));
        console.log(`[🧪] Test message → ${targetUserId} (${delivered ? "delivered" : "buffered"})`);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
      }
    });
    return;
  }

  // ── GET /api/subscribers — debug: list subscribed user IDs ────────────
  if (req.method === "GET" && url.pathname === "/api/subscribers") {
    const list = [...subscribers.keys()];
    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
    res.end(JSON.stringify({ count: list.length, subscribers: list }));
    return;
  }

  // ── GET /api/pending — debug: list pending (buffered) message counts ──
  if (req.method === "GET" && url.pathname === "/api/pending") {
    const result = {};
    for (const [userId, msgs] of pendingMessages) {
      result[userId] = msgs.length;
    }
    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
    res.end(JSON.stringify(result));
    return;
  }

  // Default / health
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Pester Event Bus");
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
        subscribers.set(id, { type: "ws", conn: ws });
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
        subscribers.set(id, { type: "socketio", conn: socket });
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
  if (req.url?.startsWith("/socket.io")) {
    return; // let Socket.IO handle it
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Pester event bus running on port ${PORT}`);
  console.log(`   Raw WebSocket: ws://localhost:${PORT}`);
  console.log(`   Socket.IO:     http://localhost:${PORT}/socket.io/`);
});
