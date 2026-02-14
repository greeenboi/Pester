# Pester Server

Volatile WebSocket pub/sub messaging broker for Pester.

## Running the Server

```bash
node server.js
```

The server runs on `ws://localhost:4000`.

## API

### Register

Connect as a user:

```json
{ "type": "register", "userId": "alice" }
```

Response:

```json
{ "type": "registered", "userId": "alice", "timestamp": 1234567890 }
```

### Open Channel

Open a channel with another user:

```json
{ "type": "open_channel", "friendId": "bob" }
```

Response:

```json
{
  "type": "channel_opened",
  "channelId": "chat_alice_bob",
  "friendId": "bob",
  "friendOnline": true,
  "timestamp": 1234567890
}
```

If the friend is online, they receive:

```json
{
  "type": "channel_invite",
  "channelId": "chat_alice_bob",
  "fromUserId": "alice",
  "timestamp": 1234567890
}
```

### Send Message

```json
{ "type": "message", "channelId": "chat_alice_bob", "text": "Hello!" }
```

Other channel members receive:

```json
{
  "type": "message",
  "channelId": "chat_alice_bob",
  "fromUserId": "alice",
  "text": "Hello!",
  "timestamp": 1234567890
}
```

### Typing Indicator

```json
{ "type": "typing", "channelId": "chat_alice_bob" }
```

Other channel members receive:

```json
{
  "type": "typing",
  "channelId": "chat_alice_bob",
  "userId": "alice",
  "timestamp": 1234567890
}
```

### Close Channel

```json
{ "type": "close_channel", "channelId": "chat_alice_bob" }
```

You receive:

```json
{
  "type": "channel_closed",
  "channelId": "chat_alice_bob",
  "timestamp": 1234567890
}
```

Other members receive:

```json
{
  "type": "user_left",
  "channelId": "chat_alice_bob",
  "userId": "alice",
  "timestamp": 1234567890
}
```

## Testing

Run the test suite:

```bash
# Start the server in one terminal
node server.js

# Run tests in another terminal
node test-api.js
```

The test suite validates:

- User registration
- Single-session enforcement (kick previous sessions)
- Channel opening (online/offline friends)
- Message sending
- Typing indicators
- Channel closing
- Error handling (invalid JSON, unknown message types, etc.)
- Disconnect cleanup

All tests use the WebSocket API and verify server responses.
