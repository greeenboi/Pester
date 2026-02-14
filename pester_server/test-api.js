/**
 * WebSocket API Tests for Pester Server
 * 
 * These tests validate the pub/sub broker functionality.
 * 
 * To run:
 *   1. Start the server: node server.js
 *   2. In another terminal: node test-api.js
 */

import { WebSocket } from "ws";

const SERVER_URL = "ws://localhost:4000";

// ── Test Utilities ──────────────────────────────────────────────────────────

function createClient() {
  return new WebSocket(SERVER_URL);
}

function send(ws, message) {
  ws.send(JSON.stringify(message));
}

function waitForMessage(ws, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout waiting for message"));
    }, timeout);

    ws.once("message", (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Test Assertion Helpers ──────────────────────────────────────────────────

let testCount = 0;
let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  testCount++;
  if (condition) {
    passCount++;
    console.log(`✅ ${message}`);
  } else {
    failCount++;
    console.error(`❌ ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
}

// ── Tests ───────────────────────────────────────────────────────────────────

async function testRegister() {
  console.log("\n🧪 Test: Register");
  const ws = createClient();

  await new Promise((resolve) => ws.once("open", resolve));

  send(ws, { type: "register", userId: "alice" });
  const response = await waitForMessage(ws);

  assertEqual(response.type, "registered", "Received 'registered' response");
  assertEqual(response.userId, "alice", "userId matches");
  assert(response.timestamp > 0, "Timestamp is present");

  ws.close();
}

async function testRegisterKicksPreviousSession() {
  console.log("\n🧪 Test: Register kicks previous session");
  const ws1 = createClient();
  const ws2 = createClient();

  await Promise.all([
    new Promise((resolve) => ws1.once("open", resolve)),
    new Promise((resolve) => ws2.once("open", resolve)),
  ]);

  send(ws1, { type: "register", userId: "bob" });
  await waitForMessage(ws1); // registered

  // Second client registers with same userId
  send(ws2, { type: "register", userId: "bob" });

  const kicked = await waitForMessage(ws1);
  const registered = await waitForMessage(ws2);

  assertEqual(kicked.type, "kicked", "First session receives 'kicked'");
  assertEqual(registered.type, "registered", "Second session receives 'registered'");

  ws1.close();
  ws2.close();
}

async function testOpenChannel() {
  console.log("\n🧪 Test: Open channel");
  const ws = createClient();

  await new Promise((resolve) => ws.once("open", resolve));

  send(ws, { type: "register", userId: "charlie" });
  await waitForMessage(ws); // registered

  send(ws, { type: "open_channel", friendId: "dave" });
  const response = await waitForMessage(ws);

  assertEqual(response.type, "channel_opened", "Received 'channel_opened'");
  assertEqual(response.friendId, "dave", "friendId matches");
  assertEqual(response.friendOnline, false, "Friend is offline");
  assert(response.channelId.includes("charlie"), "channelId contains user");
  assert(response.channelId.includes("dave"), "channelId contains friend");

  ws.close();
}

async function testOpenChannelWithOnlineFriend() {
  console.log("\n🧪 Test: Open channel with online friend");
  const wsAlice = createClient();
  const wsBob = createClient();

  await Promise.all([
    new Promise((resolve) => wsAlice.once("open", resolve)),
    new Promise((resolve) => wsBob.once("open", resolve)),
  ]);

  send(wsAlice, { type: "register", userId: "alice" });
  send(wsBob, { type: "register", userId: "bob" });

  await waitForMessage(wsAlice); // alice registered
  await waitForMessage(wsBob); // bob registered

  // Alice opens channel to Bob
  send(wsAlice, { type: "open_channel", friendId: "bob" });

  const aliceResponse = await waitForMessage(wsAlice);
  const bobResponse = await waitForMessage(wsBob);

  assertEqual(aliceResponse.type, "channel_opened", "Alice gets 'channel_opened'");
  assertEqual(aliceResponse.friendOnline, true, "Bob is online");

  assertEqual(bobResponse.type, "channel_invite", "Bob gets 'channel_invite'");
  assertEqual(bobResponse.fromUserId, "alice", "Invite is from Alice");

  wsAlice.close();
  wsBob.close();
}

async function testSendMessage() {
  console.log("\n🧪 Test: Send message");
  const wsAlice = createClient();
  const wsBob = createClient();

  await Promise.all([
    new Promise((resolve) => wsAlice.once("open", resolve)),
    new Promise((resolve) => wsBob.once("open", resolve)),
  ]);

  send(wsAlice, { type: "register", userId: "alice" });
  send(wsBob, { type: "register", userId: "bob" });

  await waitForMessage(wsAlice);
  await waitForMessage(wsBob);

  send(wsAlice, { type: "open_channel", friendId: "bob" });

  const channelOpened = await waitForMessage(wsAlice);
  await waitForMessage(wsBob); // bob gets invite

  const channelId = channelOpened.channelId;

  // Alice sends message
  send(wsAlice, { type: "message", channelId, text: "Hello Bob!" });

  // Bob receives the message (Alice doesn't get echo)
  const bobMessage = await waitForMessage(wsBob);

  assertEqual(bobMessage.type, "message", "Bob receives 'message'");
  assertEqual(bobMessage.fromUserId, "alice", "Message from Alice");
  assertEqual(bobMessage.text, "Hello Bob!", "Message text matches");
  assertEqual(bobMessage.channelId, channelId, "channelId matches");

  wsAlice.close();
  wsBob.close();
}

async function testTypingIndicator() {
  console.log("\n🧪 Test: Typing indicator");
  const wsAlice = createClient();
  const wsBob = createClient();

  await Promise.all([
    new Promise((resolve) => wsAlice.once("open", resolve)),
    new Promise((resolve) => wsBob.once("open", resolve)),
  ]);

  send(wsAlice, { type: "register", userId: "alice" });
  send(wsBob, { type: "register", userId: "bob" });

  await waitForMessage(wsAlice);
  await waitForMessage(wsBob);

  send(wsAlice, { type: "open_channel", friendId: "bob" });

  const channelOpened = await waitForMessage(wsAlice);
  await waitForMessage(wsBob);

  const channelId = channelOpened.channelId;

  // Alice is typing
  send(wsAlice, { type: "typing", channelId });

  const bobTyping = await waitForMessage(wsBob);

  assertEqual(bobTyping.type, "typing", "Bob receives 'typing'");
  assertEqual(bobTyping.userId, "alice", "Typing from Alice");
  assertEqual(bobTyping.channelId, channelId, "channelId matches");

  wsAlice.close();
  wsBob.close();
}

async function testCloseChannel() {
  console.log("\n🧪 Test: Close channel");
  const wsAlice = createClient();
  const wsBob = createClient();

  await Promise.all([
    new Promise((resolve) => wsAlice.once("open", resolve)),
    new Promise((resolve) => wsBob.once("open", resolve)),
  ]);

  send(wsAlice, { type: "register", userId: "alice" });
  send(wsBob, { type: "register", userId: "bob" });

  await waitForMessage(wsAlice);
  await waitForMessage(wsBob);

  send(wsAlice, { type: "open_channel", friendId: "bob" });

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

  assertEqual(aliceResponse.type, "channel_closed", "Alice gets 'channel_closed'");
  assertEqual(bobResponse.type, "user_left", "Bob gets 'user_left'");
  assertEqual(bobResponse.userId, "alice", "Alice left");

  wsAlice.close();
  wsBob.close();
}

async function testErrorWithoutRegistration() {
  console.log("\n🧪 Test: Error without registration");
  const ws = createClient();

  await new Promise((resolve) => ws.once("open", resolve));

  send(ws, { type: "open_channel", friendId: "someone" });
  const response = await waitForMessage(ws);

  assertEqual(response.type, "error", "Received error");
  assert(response.message.includes("Register"), "Error mentions registration");

  ws.close();
}

async function testInvalidJSON() {
  console.log("\n🧪 Test: Invalid JSON");
  const ws = createClient();

  await new Promise((resolve) => ws.once("open", resolve));

  ws.send("{ invalid json }");
  const response = await waitForMessage(ws);

  assertEqual(response.type, "error", "Received error");
  assert(response.message.includes("Invalid JSON"), "Error mentions invalid JSON");

  ws.close();
}

async function testUnknownMessageType() {
  console.log("\n🧪 Test: Unknown message type");
  const ws = createClient();

  await new Promise((resolve) => ws.once("open", resolve));

  send(ws, { type: "register", userId: "alice" });
  await waitForMessage(ws);

  send(ws, { type: "unknown_type" });
  const response = await waitForMessage(ws);

  assertEqual(response.type, "error", "Received error");
  assert(response.message.includes("Unknown message type"), "Error mentions unknown type");

  ws.close();
}

async function testDisconnectCleansUpChannels() {
  console.log("\n🧪 Test: Disconnect cleans up channels");
  const wsAlice = createClient();
  const wsBob = createClient();

  await Promise.all([
    new Promise((resolve) => wsAlice.once("open", resolve)),
    new Promise((resolve) => wsBob.once("open", resolve)),
  ]);

  send(wsAlice, { type: "register", userId: "alice" });
  send(wsBob, { type: "register", userId: "bob" });

  await waitForMessage(wsAlice);
  await waitForMessage(wsBob);

  send(wsAlice, { type: "open_channel", friendId: "bob" });

  await waitForMessage(wsAlice); // channel_opened
  await waitForMessage(wsBob); // channel_invite

  // Alice disconnects
  wsAlice.close();

  await sleep(100); // Wait for cleanup

  // Bob should receive user_left
  const bobResponse = await waitForMessage(wsBob);

  assertEqual(bobResponse.type, "user_left", "Bob gets 'user_left'");
  assertEqual(bobResponse.userId, "alice", "Alice left");

  wsBob.close();
}

// ── Run All Tests ───────────────────────────────────────────────────────────

async function runTests() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("       Pester WebSocket Server API Tests");
  console.log("═══════════════════════════════════════════════════════");

  try {
    await testRegister();
    await testRegisterKicksPreviousSession();
    await testOpenChannel();
    await testOpenChannelWithOnlineFriend();
    await testSendMessage();
    await testTypingIndicator();
    await testCloseChannel();
    await testErrorWithoutRegistration();
    await testInvalidJSON();
    await testUnknownMessageType();
    await testDisconnectCleansUpChannels();

    console.log("\n═══════════════════════════════════════════════════════");
    console.log("✨ All tests completed!");
    console.log(`   Total: ${testCount} | Passed: ${passCount} | Failed: ${failCount}`);
    console.log("═══════════════════════════════════════════════════════\n");

    process.exit(failCount > 0 ? 1 : 0);
  } catch (error) {
    console.error("\n❌ Test suite failed:", error.message);
    console.log("\n═══════════════════════════════════════════════════════");
    console.log(`   Total: ${testCount} | Passed: ${passCount} | Failed: ${failCount}`);
    console.log("═══════════════════════════════════════════════════════\n");
    process.exit(1);
  }
}

runTests();
