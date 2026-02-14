/**
 * WebSocket API Tests for Pester Server (Deno)
 * 
 * These tests validate the pub/sub broker functionality.
 * 
 * To run:
 *   1. Start the server: deno run --allow-net main.ts
 *   2. In another terminal: deno test --allow-net
 */

import { assertEquals, assert } from "@std/assert";

const SERVER_URL = "ws://localhost:4000";

// ── Test Utilities ──────────────────────────────────────────────────────────

function createClient(): WebSocket {
  return new WebSocket(SERVER_URL);
}

function send(ws: WebSocket, message: unknown) {
  ws.send(JSON.stringify(message));
}

function waitForMessage(ws: WebSocket, timeout = 5000): Promise<{ type: string; [key: string]: unknown }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout waiting for message"));
    }, timeout);

    const handler = (event: MessageEvent) => {
      clearTimeout(timer);
      ws.removeEventListener("message", handler);
      resolve(JSON.parse(event.data));
    };

    ws.addEventListener("message", handler);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
}

function waitForClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      resolve();
      return;
    }
    ws.addEventListener("close", () => resolve(), { once: true });
  });
}

async function closeAndWait(ws: WebSocket) {
  ws.close();
  await waitForClose(ws);
  await sleep(50); // Allow server cleanup
}

// ── Tests ───────────────────────────────────────────────────────────────────

Deno.test("Register", async () => {
  const ws = createClient();
  await waitForOpen(ws);

  send(ws, { type: "register", userId: "alice_r1" });
  const response = await waitForMessage(ws);

  assertEquals(response.type, "registered", "Received 'registered' response");
  assertEquals(response.userId, "alice_r1", "userId matches");
  assert(typeof response.timestamp === "number" && response.timestamp > 0, "Timestamp is present");

  await closeAndWait(ws);
});

Deno.test("Register kicks previous session", async () => {
  const ws1 = createClient();
  const ws2 = createClient();

  await Promise.all([waitForOpen(ws1), waitForOpen(ws2)]);

  send(ws1, { type: "register", userId: "bob_r2" });
  await waitForMessage(ws1); // registered

  // Second client registers with same userId
  send(ws2, { type: "register", userId: "bob_r2" });

  const kicked = await waitForMessage(ws1);
  const registered = await waitForMessage(ws2);

  assertEquals(kicked.type, "kicked", "First session receives 'kicked'");
  assertEquals(registered.type, "registered", "Second session receives 'registered'");

  await closeAndWait(ws1);
  await closeAndWait(ws2);
});

Deno.test("Open channel", async () => {
  const ws = createClient();
  await waitForOpen(ws);

  send(ws, { type: "register", userId: "charlie_r3" });
  await waitForMessage(ws); // registered

  send(ws, { type: "open_channel", friendId: "dave_r3" });
  const response = await waitForMessage(ws);

  assertEquals(response.type, "channel_opened", "Received 'channel_opened'");
  assertEquals(response.friendId, "dave_r3", "friendId matches");
  assertEquals(response.friendOnline, false, "Friend is offline");
  assert(typeof response.channelId === "string" && response.channelId.includes("charlie_r3"), "channelId contains user");
  assert(typeof response.channelId === "string" && response.channelId.includes("dave_r3"), "channelId contains friend");

  await closeAndWait(ws);
});

Deno.test("Open channel with online friend", async () => {
  const wsAlice = createClient();
  const wsBob = createClient();

  await Promise.all([waitForOpen(wsAlice), waitForOpen(wsBob)]);

  send(wsAlice, { type: "register", userId: "alice_r4" });
  send(wsBob, { type: "register", userId: "bob_r4" });

  await waitForMessage(wsAlice); // alice registered
  await waitForMessage(wsBob); // bob registered

  // Alice opens channel to Bob
  send(wsAlice, { type: "open_channel", friendId: "bob_r4" });

  const aliceResponse = await waitForMessage(wsAlice);
  const bobResponse = await waitForMessage(wsBob);

  assertEquals(aliceResponse.type, "channel_opened", "Alice gets 'channel_opened'");
  assertEquals(aliceResponse.friendOnline, true, "Bob is online");

  assertEquals(bobResponse.type, "channel_invite", "Bob gets 'channel_invite'");
  assertEquals(bobResponse.fromUserId, "alice_r4", "Invite is from Alice");

  await closeAndWait(wsAlice);
  await closeAndWait(wsBob);
});

Deno.test("Send message", async () => {
  const wsAlice = createClient();
  const wsBob = createClient();

  await Promise.all([waitForOpen(wsAlice), waitForOpen(wsBob)]);

  send(wsAlice, { type: "register", userId: "alice_r5" });
  send(wsBob, { type: "register", userId: "bob_r5" });

  await waitForMessage(wsAlice);
  await waitForMessage(wsBob);

  send(wsAlice, { type: "open_channel", friendId: "bob_r5" });

  const channelOpened = await waitForMessage(wsAlice);
  await waitForMessage(wsBob); // bob gets invite

  const channelId = channelOpened.channelId;

  // Alice sends message
  send(wsAlice, { type: "message", channelId, text: "Hello Bob!" });

  // Bob receives the message (Alice doesn't get echo)
  const bobMessage = await waitForMessage(wsBob);

  assertEquals(bobMessage.type, "message", "Bob receives 'message'");
  assertEquals(bobMessage.fromUserId, "alice_r5", "Message from Alice");
  assertEquals(bobMessage.text, "Hello Bob!", "Message text matches");
  assertEquals(bobMessage.channelId, channelId, "channelId matches");

  await closeAndWait(wsAlice);
  await closeAndWait(wsBob);
});

Deno.test("Typing indicator", async () => {
  const wsAlice = createClient();
  const wsBob = createClient();

  await Promise.all([waitForOpen(wsAlice), waitForOpen(wsBob)]);

  send(wsAlice, { type: "register", userId: "alice_r6" });
  send(wsBob, { type: "register", userId: "bob_r6" });

  await waitForMessage(wsAlice);
  await waitForMessage(wsBob);

  send(wsAlice, { type: "open_channel", friendId: "bob_r6" });

  const channelOpened = await waitForMessage(wsAlice);
  await waitForMessage(wsBob);

  const channelId = channelOpened.channelId;

  // Alice is typing
  send(wsAlice, { type: "typing", channelId });

  const bobTyping = await waitForMessage(wsBob);

  assertEquals(bobTyping.type, "typing", "Bob receives 'typing'");
  assertEquals(bobTyping.userId, "alice_r6", "Typing from Alice");
  assertEquals(bobTyping.channelId, channelId, "channelId matches");

  await closeAndWait(wsAlice);
  await closeAndWait(wsBob);
});

Deno.test("Close channel", async () => {
  const wsAlice = createClient();
  const wsBob = createClient();

  await Promise.all([waitForOpen(wsAlice), waitForOpen(wsBob)]);

  send(wsAlice, { type: "register", userId: "alice_r7" });
  send(wsBob, { type: "register", userId: "bob_r7" });

  await waitForMessage(wsAlice);
  await waitForMessage(wsBob);

  send(wsAlice, { type: "open_channel", friendId: "bob_r7" });

  const channelOpened = await waitForMessage(wsAlice);
  await waitForMessage(wsBob);

  const channelId = channelOpened.channelId;

  // Alice closes channel
  send(wsAlice, { type: "close_channel", channelId });

  // Wait for both responses in parallel to avoid race condition
  const [aliceResponse, bobResponse] = await Promise.all([
    waitForMessage(wsAlice),
    waitForMessage(wsBob),
  ]);

  assertEquals(aliceResponse.type, "channel_closed", "Alice gets 'channel_closed'");
  assertEquals(bobResponse.type, "user_left", "Bob gets 'user_left'");
  assertEquals(bobResponse.userId, "alice_r7", "Alice left");

  await closeAndWait(wsAlice);
  await closeAndWait(wsBob);
});

Deno.test("Error without registration", async () => {
  const ws = createClient();
  await waitForOpen(ws);

  send(ws, { type: "open_channel", friendId: "someone" });
  const response = await waitForMessage(ws);

  assertEquals(response.type, "error", "Received error");
  assert(typeof response.message === "string" && response.message.includes("Register"), "Error mentions registration");

  await closeAndWait(ws);
});

Deno.test("Invalid JSON", async () => {
  const ws = createClient();
  await waitForOpen(ws);

  ws.send("{ invalid json }");
  const response = await waitForMessage(ws);

  assertEquals(response.type, "error", "Received error");
  assert(typeof response.message === "string" && response.message.includes("Invalid JSON"), "Error mentions invalid JSON");

  await closeAndWait(ws);
});

Deno.test("Unknown message type", async () => {
  const ws = createClient();
  await waitForOpen(ws);

  send(ws, { type: "register", userId: "alice_r8" });
  await waitForMessage(ws);

  send(ws, { type: "unknown_type" });
  const response = await waitForMessage(ws);

  assertEquals(response.type, "error", "Received error");
  assert(typeof response.message === "string" && response.message.includes("Unknown message type"), "Error mentions unknown type");

  await closeAndWait(ws);
});

Deno.test("Disconnect cleans up channels", async () => {
  const wsAlice = createClient();
  const wsBob = createClient();

  await Promise.all([waitForOpen(wsAlice), waitForOpen(wsBob)]);

  send(wsAlice, { type: "register", userId: "alice_r9" });
  send(wsBob, { type: "register", userId: "bob_r9" });

  await waitForMessage(wsAlice);
  await waitForMessage(wsBob);

  send(wsAlice, { type: "open_channel", friendId: "bob_r9" });

  await waitForMessage(wsAlice); // channel_opened
  await waitForMessage(wsBob); // channel_invite

  // Start waiting for Bob's message before Alice disconnects
  const bobResponsePromise = waitForMessage(wsBob);

  // Alice disconnects
  await closeAndWait(wsAlice);

  // Bob should receive user_left
  const bobResponse = await bobResponsePromise;

  assertEquals(bobResponse.type, "user_left", "Bob gets 'user_left'");
  assertEquals(bobResponse.userId, "alice_r9", "Alice left");

  await closeAndWait(wsBob);
});
