#!/usr/bin/env node
/**
 * Pester Test Client — interact with the event-bus server via REST API.
 *
 * Usage:
 *   node test-client.js <command> [options] [--server URL]
 *
 * Endpoints exercised:
 *   POST /api/test-message   — publish a message to a ULID
 *   GET  /api/subscribers    — list all connected subscribers
 *   GET  /api/pending        — list buffered (undelivered) message counts
 */

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`
Pester Test Client (Event Bus)
──────────────────────────────
Usage:
  node test-client.js <command> [options]

Commands:
  send   <ulid> [text]      Publish a test message to a ULID
  subscribers               List all connected subscribers
  pending                   Show buffered message counts per user
  ping   <ulid>             Send a ping and measure response time

Options:
  --server <url>   Server URL (default: http://localhost:4000)

Examples:
  node test-client.js send 01HXYZ1234ABC "hello!"
  node test-client.js subscribers
  node test-client.js pending
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

      console.log(`\n📤 Publishing message to ${targetUserId}...`);
      console.log(`   Server: ${serverUrl}`);

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
        console.log(`   Delivered: ${data.delivered ? "yes (subscriber online)" : "no (buffered for later)"}`);
        console.log(`   Message: "${data.message}"`);
      } else {
        console.log(`   ❌ Error: ${data.error}`);
      }
      break;
    }

    case "subscribers": {
      console.log("\n📡 Connected subscribers:");
      const res = await fetch(`${serverUrl}/api/subscribers`);
      const data = await res.json();

      console.log(`   Total: ${data.count}`);
      if (data.subscribers.length === 0) {
        console.log("   (no subscribers connected)");
      } else {
        for (const id of data.subscribers) {
          console.log(`   • ${id}`);
        }
      }
      break;
    }

    case "pending": {
      console.log("\n📦 Pending (buffered) messages:");
      const res = await fetch(`${serverUrl}/api/pending`);
      const data = await res.json();

      const entries = Object.entries(data);
      if (entries.length === 0) {
        console.log("   (no pending messages)");
      } else {
        for (const [userId, count] of entries) {
          console.log(`   ${userId}: ${count} message(s)`);
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

      const start = Date.now();
      const res = await fetch(`${serverUrl}/api/test-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId,
          text: `[Ping] ${new Date().toISOString()} — response time test`,
        }),
      });
      const elapsed = Date.now() - start;
      const data = await res.json();

      console.log(`   Round-trip: ${elapsed}ms`);
      console.log(`   Result: ${data.delivered ? "delivered" : "buffered"}`);
      break;
    }

    default: {
      // Legacy mode: first arg is a ULID, second is optional message text
      const targetUserId = args[0];
      const text = args[1] || undefined;

      console.log(`\n📤 Publishing message to ${targetUserId}...`);
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
