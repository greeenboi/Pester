# Pester Server

Volatile WebSocket pub/sub messaging broker for Pester, built with Node.js and Socket.IO.

## Running the Server

### Development

```bash
npm install
npm run dev
```

### Production

```bash
npm install
npm start
```

### Docker

```bash
# From project root
docker-compose up -d
```

The server runs on `ws://localhost:4000` (or port specified in `PORT` environment variable).

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

## Deployment

### Koyeb

This server is ready for deployment on Koyeb:

```bash
koyeb service create pester-server \
  --git github.com/greeenboi/Pester \
  --git-branch master \
  --git-workdir pester_server \
  --ports 4000:http \
  --routes /:4000 \
  --env PORT=4000
```

Or use the Koyeb web interface to deploy from your GitHub repository.

## Protocol

The server uses Socket.IO for WebSocket communication but maintains a custom JSON message protocol for compatibility. All messages are sent/received through Socket.IO's `message` event.
