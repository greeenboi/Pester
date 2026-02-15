#!/usr/bin/env node
/**
 * Pester Test Client — send a test message to any ULID via the REST API.
 *
 * Usage:
 *   node test-client.js <targetULID> [message text] [--server URL]
 *
 * Examples:
 *   node test-client.js 01HXYZ1234ABC                     # ping with default text
 *   node test-client.js 01HXYZ1234ABC "Hello from test!"  # custom message
 *   node test-client.js 01HXYZ1234ABC --server http://localhost:4000
 *
 * Endpoints exercised:
 *   POST /api/test-message   — send a message to a ULID
 *   GET  /api/status?users=  — check if the target is online
 *   GET  /api/online         — list all connected users
 *   GET  /api/channels       — list active channels
 */

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`
Pester Test Client
──────────────────
Usage:
  node test-client.js <command> [options]

Commands:
  send   <ulid> [text]      Send a test message to a ULID
  status <ulid>[,ulid,...]  Check online status of user(s)
  online                    List all connected users
  channels                  List active channels
  ping   <ulid>             Send a ping and check response time

Options:
  --server <url>   Server URL (default: http://localhost:4000)

Examples:
  node test-client.js send 01HXYZ1234ABC "hello!"
  node test-client.js status 01HXYZ1234ABC,01HABCDEF5678
  node test-client.js online
  node test-client.js ping 01HXYZ1234ABC
  `);
  process.exit(0);
}

// Parse --server flag
let serverUrl = "http://localhost:4000";
const serverIdx = args.indexOf("--server");
if (serverIdx !== -1 && args[serverIdx + 1]) {
  serverUrl = args[serverIdx + 1];
  args.splice(serverIdx, 2);
}

const command = args[0];

async function main() {
  switch (command) {
    case "send": {
      const targetUserId = args[1];
      const text = args[2] || undefined;
      if (!targetUserId) {
        console.error("Error: target ULID is required");
        process.exit(1);
      }

      console.log(`\n📤 Sending test message to ${targetUserId}...`);
      console.log(`   Server: ${serverUrl}`);

      // First check if user is online
      const statusRes = await fetch(`${serverUrl}/api/status?users=${targetUserId}`);
      const statusData = await statusRes.json();
      console.log(`   Online: ${statusData[targetUserId] ? "✅ yes" : "❌ no (will be buffered)"}`);

      // Send the message
      const start = Date.now();
      const res = await fetch(`${serverUrl}/api/test-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, text }),
      });
      const elapsed = Date.now() - start;
      const data = await res.json();

      if (data.ok) {
        console.log(`   ✅ Success (${elapsed}ms)`);
        console.log(`   Delivered: ${data.delivered ? "yes (user online)" : "no (buffered for later)"}`);
        console.log(`   Message: "${data.message}"`);
      } else {
        console.log(`   ❌ Error: ${data.error}`);
      }
      break;
    }

    case "status": {
      const userIds = args[1];
      if (!userIds) {
        console.error("Error: user ULID(s) required (comma-separated)");
        process.exit(1);
      }

      console.log(`\n🔍 Checking status for: ${userIds}`);
      const res = await fetch(`${serverUrl}/api/status?users=${userIds}`);
      const data = await res.json();

      for (const [id, online] of Object.entries(data)) {
        console.log(`   ${online ? "🟢" : "⚫"} ${id}: ${online ? "online" : "offline"}`);
      }
      break;
    }

    case "online": {
      console.log("\n👥 Connected users:");
      const res = await fetch(`${serverUrl}/api/online`);
      const data = await res.json();

      console.log(`   Total: ${data.count}`);
      if (data.users.length === 0) {
        console.log("   (no users connected)");
      } else {
        for (const id of data.users) {
          console.log(`   🟢 ${id}`);
        }
      }
      break;
    }

    case "channels": {
      console.log("\n📡 Active channels:");
      const res = await fetch(`${serverUrl}/api/channels`);
      const data = await res.json();

      const entries = Object.entries(data);
      if (entries.length === 0) {
        console.log("   (no active channels)");
      } else {
        for (const [channelId, members] of entries) {
          console.log(`   ${channelId}: ${members.join(", ")}`);
        }
      }
      break;
    }

    case "ping": {
      const targetUserId = args[1];
      if (!targetUserId) {
        console.error("Error: target ULID is required");
        process.exit(1);
      }

      console.log(`\n🏓 Pinging ${targetUserId}...`);

      // Check status
      const t0 = Date.now();
      const statusRes = await fetch(`${serverUrl}/api/status?users=${targetUserId}`);
      const statusElapsed = Date.now() - t0;
      const statusData = await statusRes.json();

      console.log(`   Status check: ${statusElapsed}ms (${statusData[targetUserId] ? "online" : "offline"})`);

      // Send test message
      const t1 = Date.now();
      const msgRes = await fetch(`${serverUrl}/api/test-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId,
          text: `[Ping] ${new Date().toISOString()} — response time test`,
        }),
      });
      const msgElapsed = Date.now() - t1;
      const msgData = await msgRes.json();

      console.log(`   Message send: ${msgElapsed}ms (${msgData.delivered ? "delivered" : "buffered"})`);
      console.log(`   Total round-trip: ${statusElapsed + msgElapsed}ms`);
      break;
    }

    default: {
      // Legacy mode: first arg is a ULID, second is optional message text
      const targetUserId = args[0];
      const text = args[1] || undefined;

      console.log(`\n📤 Sending test message to ${targetUserId}...`);
      const res = await fetch(`${serverUrl}/api/test-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, text }),
      });
      const data = await res.json();
      console.log(data.ok ? `   ✅ ${data.delivered ? "Delivered" : "Buffered"}` : `   ❌ ${data.error}`);
    }
  }
}

main().catch((err) => {
  console.error(`\n❌ Failed to connect to server at ${serverUrl}`);
  console.error(`   ${err.message}`);
  process.exit(1);
});
