/**
 * WebSocket mock server sample handler configurations.
 * Each sample provides 3 handlers (connection/message/disconnect combos).
 */

export interface WebSocketSample {
  id: string;
  label: string;
  description: string;
  handlers: Array<{
    event: 'connection' | 'message' | 'disconnect';
    matchPattern: string;
    response: string;
    broadcast: boolean;
  }>;
}

export const WEBSOCKET_SAMPLES: WebSocketSample[] = [
  {
    id: 'chat-room',
    label: 'Chat Room',
    description: 'Real-time chat with welcome message, echo replies, and disconnect events',
    handlers: [
      { event: 'connection', matchPattern: '', response: '{"type": "system", "message": "Welcome to the chat room! You are now connected.", "timestamp": "2026-05-21T18:00:00Z"}', broadcast: false },
      { event: 'message', matchPattern: '*', response: '{"type": "message", "from": "server", "content": "Message received", "echo": true}', broadcast: true },
      { event: 'disconnect', matchPattern: '', response: '{"type": "system", "message": "User disconnected"}', broadcast: true },
    ],
  },
  {
    id: 'stock-ticker',
    label: 'Stock Ticker',
    description: 'Live stock price feed with subscribe/unsubscribe channels',
    handlers: [
      { event: 'connection', matchPattern: '', response: '{"type": "connected", "message": "Stock feed connected", "symbols": ["AAPL", "GOOGL", "MSFT", "AMZN"]}', broadcast: false },
      { event: 'message', matchPattern: '^subscribe:', response: '{"type": "subscribed", "symbol": "AAPL", "price": 185.42, "change": 2.35, "changePercent": 1.28}', broadcast: false },
      { event: 'message', matchPattern: '^unsubscribe:', response: '{"type": "unsubscribed", "message": "Stopped receiving updates"}', broadcast: false },
    ],
  },
  {
    id: 'notifications',
    label: 'Push Notifications',
    description: 'Notification channel with unread count, acknowledgements, and subscriptions',
    handlers: [
      { event: 'connection', matchPattern: '', response: '{"type": "init", "unread": 5, "message": "Notification channel open"}', broadcast: false },
      { event: 'message', matchPattern: 'ack:*', response: '{"type": "acknowledged", "success": true}', broadcast: false },
      { event: 'message', matchPattern: 'subscribe', response: '{"type": "subscribed", "channels": ["alerts", "updates", "messages"]}', broadcast: false },
    ],
  },
  {
    id: 'game-lobby',
    label: 'Game Lobby',
    description: 'Multiplayer game lobby with player list, ready state, and game start',
    handlers: [
      { event: 'connection', matchPattern: '', response: '{"type": "lobby_joined", "players": [{"id": "p1", "name": "Player1", "ready": true}, {"id": "p2", "name": "Player2", "ready": false}], "maxPlayers": 4}', broadcast: false },
      { event: 'message', matchPattern: 'ready', response: '{"type": "player_ready", "playerId": "you", "allReady": false}', broadcast: true },
      { event: 'message', matchPattern: 'start', response: '{"type": "game_starting", "countdown": 3, "map": "arena-01"}', broadcast: true },
    ],
  },
  {
    id: 'iot-sensors',
    label: 'IoT Sensor Data',
    description: 'IoT device telemetry with temperature, humidity, and config updates',
    handlers: [
      { event: 'connection', matchPattern: '', response: '{"type": "device_registered", "deviceId": "sensor-001", "capabilities": ["temperature", "humidity", "pressure"]}', broadcast: false },
      { event: 'message', matchPattern: 'reading', response: '{"type": "sensor_data", "temperature": 23.5, "humidity": 65, "pressure": 1013.25, "timestamp": "2026-05-21T18:00:00Z"}', broadcast: false },
      { event: 'message', matchPattern: 'config:*', response: '{"type": "config_updated", "interval": 5000, "threshold": {"temp_max": 30, "temp_min": 15}}', broadcast: false },
    ],
  },
  {
    id: 'live-collab',
    label: 'Live Collaboration',
    description: 'Collaborative editing with cursor positions and real-time operations',
    handlers: [
      { event: 'connection', matchPattern: '', response: '{"type": "joined", "documentId": "doc-123", "users": [{"id": "u1", "name": "Alice", "cursor": {"line": 5, "col": 10}}, {"id": "u2", "name": "Bob", "cursor": {"line": 12, "col": 3}}]}', broadcast: false },
      { event: 'message', matchPattern: 'edit:*', response: '{"type": "edit_applied", "version": 42, "ops": [{"insert": "Hello"}], "userId": "u1"}', broadcast: true },
      { event: 'message', matchPattern: 'cursor', response: '{"type": "cursor_moved", "userId": "u1", "position": {"line": 8, "col": 15}}', broadcast: true },
    ],
  },
  {
    id: 'auction',
    label: 'Live Auction',
    description: 'Real-time bidding with current bid, time extension, and watcher count',
    handlers: [
      { event: 'connection', matchPattern: '', response: '{"type": "auction_state", "itemId": "item-55", "title": "Vintage Watch", "currentBid": 5200, "bidder": "user_42", "endsAt": "2026-05-21T20:00:00Z"}', broadcast: false },
      { event: 'message', matchPattern: 'bid:*', response: '{"type": "bid_accepted", "amount": 5500, "bidder": "you", "nextMinBid": 5600, "timeExtended": true}', broadcast: true },
      { event: 'message', matchPattern: 'watch', response: '{"type": "watching", "watchers": 128}', broadcast: false },
    ],
  },
  {
    id: 'location-tracking',
    label: 'Location Tracking',
    description: 'GPS tracking with coordinates, speed, heading, and geofence events',
    handlers: [
      { event: 'connection', matchPattern: '', response: '{"type": "tracking_started", "sessionId": "sess-789", "message": "Location tracking active"}', broadcast: false },
      { event: 'message', matchPattern: 'location', response: '{"type": "location_update", "lat": 40.7128, "lng": -74.006, "accuracy": 10, "speed": 5.2, "heading": 180}', broadcast: false },
      { event: 'message', matchPattern: 'geofence:*', response: '{"type": "geofence_event", "zone": "office", "action": "entered", "timestamp": "2026-05-21T09:00:00Z"}', broadcast: false },
    ],
  },
  {
    id: 'terminal',
    label: 'Remote Terminal',
    description: 'Remote shell access with command execution and terminal resizing',
    handlers: [
      { event: 'connection', matchPattern: '', response: '{"type": "shell_ready", "prompt": "user@server:~$ ", "cwd": "/home/user", "env": "production"}', broadcast: false },
      { event: 'message', matchPattern: 'exec:*', response: '{"type": "output", "stdout": "total 16\\ndrwxr-xr-x 4 user user 4096 May 21 18:00 .\\n-rw-r--r-- 1 user user  220 May 21 10:00 .bashrc\\n", "exitCode": 0}', broadcast: false },
      { event: 'message', matchPattern: 'resize', response: '{"type": "resized", "cols": 120, "rows": 40}', broadcast: false },
    ],
  },
  {
    id: 'video-stream',
    label: 'Video / Media Stream',
    description: 'Media streaming with WebRTC signaling and quality controls',
    handlers: [
      { event: 'connection', matchPattern: '', response: '{"type": "stream_info", "streamId": "live-001", "title": "Live Event", "viewers": 1250, "quality": ["1080p", "720p", "480p"]}', broadcast: false },
      { event: 'message', matchPattern: 'quality:*', response: '{"type": "quality_changed", "current": "720p", "bitrate": 2500000, "buffered": 5.2}', broadcast: false },
      { event: 'message', matchPattern: 'reaction', response: '{"type": "reaction_broadcast", "emoji": "fire", "count": 42, "from": "viewer"}', broadcast: true },
    ],
  },
];
