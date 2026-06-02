/**
 * Socket.IO mock server sample handler configurations.
 * Each sample provides connection, message, and disconnect handlers.
 */

export interface SocketIOSample {
  id: string;
  label: string;
  description: string;
  handlers: Array<{
    event: 'connection' | 'message' | 'disconnect';
    listenEvent: string;
    emitEvent: string;
    response: string;
    delay: number;
    broadcast: boolean;
  }>;
}

export const SOCKETIO_SAMPLES: SocketIOSample[] = [
  {
    id: 'chat-app',
    label: 'Chat Application',
    description: 'Full-featured chat with rooms, typing indicators, and message history',
    handlers: [
      { event: 'connection', listenEvent: '', emitEvent: 'welcome', response: '{"message": "Connected to chat server", "userId": "user_42", "rooms": ["general", "random"]}', delay: 0, broadcast: false },
      { event: 'message', listenEvent: 'chat:send', emitEvent: 'chat:received', response: '{"id": "msg-001", "from": "user_42", "content": "Message received!", "room": "general", "timestamp": "2026-05-24T10:30:00Z"}', delay: 100, broadcast: true },
      { event: 'message', listenEvent: 'typing', emitEvent: 'user:typing', response: '{"userId": "user_42", "room": "general", "isTyping": true}', delay: 0, broadcast: true },
      { event: 'disconnect', listenEvent: '', emitEvent: 'user:left', response: '{"userId": "user_42", "message": "User disconnected", "onlineCount": 14}', delay: 0, broadcast: true },
    ],
  },
  {
    id: 'multiplayer-game',
    label: 'Multiplayer Game',
    description: 'Game server with player movement, actions, and game state sync',
    handlers: [
      { event: 'connection', listenEvent: '', emitEvent: 'game:init', response: '{"playerId": "p1", "position": {"x": 0, "y": 0}, "health": 100, "inventory": [], "players": [{"id": "p2", "name": "Player2", "position": {"x": 5, "y": 3}}]}', delay: 0, broadcast: false },
      { event: 'message', listenEvent: 'player:move', emitEvent: 'player:moved', response: '{"playerId": "p1", "position": {"x": 3, "y": 2}, "velocity": {"dx": 1, "dy": 0}, "timestamp": 1716550200}', delay: 50, broadcast: true },
      { event: 'message', listenEvent: 'player:action', emitEvent: 'action:result', response: '{"playerId": "p1", "action": "attack", "damage": 25, "target": "p2", "targetHealth": 75}', delay: 100, broadcast: true },
      { event: 'disconnect', listenEvent: '', emitEvent: 'player:left', response: '{"playerId": "p1", "message": "Player left the game", "remainingPlayers": 3}', delay: 0, broadcast: true },
    ],
  },
  {
    id: 'dashboard-realtime',
    label: 'Analytics Dashboard',
    description: 'Real-time analytics with visitor counts, events, and conversions',
    handlers: [
      { event: 'connection', listenEvent: '', emitEvent: 'dashboard:snapshot', response: '{"activeVisitors": 1250, "todayPageviews": 45000, "conversionRate": 3.2, "topPages": ["/home", "/pricing", "/docs"]}', delay: 0, broadcast: false },
      { event: 'message', listenEvent: 'subscribe:metric', emitEvent: 'metric:update', response: '{"metric": "activeVisitors", "value": 1255, "delta": 5, "sparkline": [1200, 1210, 1230, 1250, 1255]}', delay: 200, broadcast: false },
      { event: 'message', listenEvent: 'filter:set', emitEvent: 'data:filtered', response: '{"filter": "last_7d", "pageviews": 315000, "uniqueVisitors": 89000, "bounceRate": 42.1}', delay: 500, broadcast: false },
      { event: 'disconnect', listenEvent: '', emitEvent: 'subscriber:removed', response: '{"message": "Dashboard subscription ended"}', delay: 0, broadcast: false },
    ],
  },
  {
    id: 'collaboration',
    label: 'Document Collaboration',
    description: 'Real-time document editing with cursors, selections, and operations',
    handlers: [
      { event: 'connection', listenEvent: '', emitEvent: 'doc:state', response: '{"docId": "doc-abc", "version": 42, "content": "Hello World", "collaborators": [{"id": "u1", "name": "Alice", "color": "#e535ab"}, {"id": "u2", "name": "Bob", "color": "#4caf50"}]}', delay: 0, broadcast: false },
      { event: 'message', listenEvent: 'doc:edit', emitEvent: 'doc:updated', response: '{"version": 43, "ops": [{"retain": 5}, {"insert": " beautiful"}], "author": "u1", "timestamp": "2026-05-24T10:00:00Z"}', delay: 50, broadcast: true },
      { event: 'message', listenEvent: 'cursor:move', emitEvent: 'cursor:update', response: '{"userId": "u1", "position": {"line": 3, "ch": 15}, "selection": null}', delay: 0, broadcast: true },
      { event: 'disconnect', listenEvent: '', emitEvent: 'collaborator:left', response: '{"userId": "u1", "name": "Alice", "remainingCollaborators": 1}', delay: 0, broadcast: true },
    ],
  },
  {
    id: 'iot-hub',
    label: 'IoT Device Hub',
    description: 'IoT gateway with device telemetry, commands, and status updates',
    handlers: [
      { event: 'connection', listenEvent: '', emitEvent: 'hub:registered', response: '{"deviceId": "sensor-001", "type": "temperature_sensor", "firmware": "2.1.0", "capabilities": ["read", "config"], "lastSeen": "2026-05-24T09:55:00Z"}', delay: 0, broadcast: false },
      { event: 'message', listenEvent: 'telemetry', emitEvent: 'telemetry:ack', response: '{"deviceId": "sensor-001", "received": true, "values": {"temperature": 23.5, "humidity": 65, "battery": 87}, "nextReportIn": 5000}', delay: 100, broadcast: false },
      { event: 'message', listenEvent: 'command', emitEvent: 'command:result', response: '{"deviceId": "sensor-001", "command": "set_interval", "status": "executed", "newInterval": 10000}', delay: 200, broadcast: false },
      { event: 'disconnect', listenEvent: '', emitEvent: 'device:offline', response: '{"deviceId": "sensor-001", "reason": "connection_lost", "lastTelemetry": "2026-05-24T10:00:00Z"}', delay: 0, broadcast: true },
    ],
  },
  {
    id: 'ride-sharing',
    label: 'Ride Sharing',
    description: 'Ride-hailing service with driver matching, location, and trip updates',
    handlers: [
      { event: 'connection', listenEvent: '', emitEvent: 'ride:status', response: '{"rideId": "ride-555", "status": "searching", "pickup": {"lat": 40.7128, "lng": -74.006, "address": "123 Main St"}, "eta": null}', delay: 0, broadcast: false },
      { event: 'message', listenEvent: 'ride:request', emitEvent: 'driver:matched', response: '{"driverId": "drv-88", "name": "Mike", "vehicle": {"make": "Toyota", "model": "Camry", "plate": "ABC-1234"}, "eta": 4, "rating": 4.8}', delay: 2000, broadcast: false },
      { event: 'message', listenEvent: 'driver:location', emitEvent: 'location:update', response: '{"driverId": "drv-88", "lat": 40.7135, "lng": -74.005, "heading": 90, "speed": 25, "eta": 3}', delay: 100, broadcast: false },
      { event: 'disconnect', listenEvent: '', emitEvent: 'ride:ended', response: '{"rideId": "ride-555", "status": "completed", "fare": 18.50, "distance": 3.2, "duration": 12}', delay: 0, broadcast: false },
    ],
  },
  {
    id: 'live-auction',
    label: 'Live Auction',
    description: 'Real-time bidding with bid updates, countdown, and winner announcements',
    handlers: [
      { event: 'connection', listenEvent: '', emitEvent: 'auction:state', response: '{"auctionId": "auc-99", "item": "Vintage Watch", "currentBid": 5200, "bidder": "user_42", "bidCount": 18, "endsAt": "2026-05-24T20:00:00Z", "watchers": 256}', delay: 0, broadcast: false },
      { event: 'message', listenEvent: 'bid:place', emitEvent: 'bid:accepted', response: '{"auctionId": "auc-99", "amount": 5500, "bidder": "you", "nextMinBid": 5600, "timeExtended": true, "newEndTime": "2026-05-24T20:02:00Z"}', delay: 300, broadcast: true },
      { event: 'message', listenEvent: 'auction:watch', emitEvent: 'watchers:update', response: '{"auctionId": "auc-99", "watchers": 257, "recentBids": [5500, 5200, 5000]}', delay: 0, broadcast: false },
      { event: 'disconnect', listenEvent: '', emitEvent: 'watcher:left', response: '{"watchers": 255}', delay: 0, broadcast: true },
    ],
  },
  {
    id: 'support-ticket',
    label: 'Support Ticket System',
    description: 'Customer support with ticket assignment, messages, and status changes',
    handlers: [
      { event: 'connection', listenEvent: '', emitEvent: 'agent:ready', response: '{"agentId": "agent-5", "name": "Support Bot", "queue": 3, "status": "online", "skills": ["billing", "technical", "general"]}', delay: 0, broadcast: false },
      { event: 'message', listenEvent: 'ticket:create', emitEvent: 'ticket:created', response: '{"ticketId": "TK-1042", "subject": "Login issue", "priority": "high", "assignedTo": "agent-5", "status": "open", "createdAt": "2026-05-24T10:00:00Z"}', delay: 500, broadcast: false },
      { event: 'message', listenEvent: 'ticket:reply', emitEvent: 'ticket:updated', response: '{"ticketId": "TK-1042", "from": "agent-5", "message": "I can help with that. Could you try clearing your cache?", "status": "pending", "timestamp": "2026-05-24T10:01:00Z"}', delay: 1000, broadcast: false },
      { event: 'disconnect', listenEvent: '', emitEvent: 'agent:offline', response: '{"agentId": "agent-5", "status": "offline", "activeTickets": 2}', delay: 0, broadcast: true },
    ],
  },
  {
    id: 'video-call',
    label: 'Video Call Signaling',
    description: 'WebRTC signaling server with offer/answer, ICE candidates, and room management',
    handlers: [
      { event: 'connection', listenEvent: '', emitEvent: 'room:joined', response: '{"roomId": "room-abc", "userId": "u1", "participants": [{"id": "u2", "name": "Alice", "video": true, "audio": true}], "maxParticipants": 10}', delay: 0, broadcast: false },
      { event: 'message', listenEvent: 'signal:offer', emitEvent: 'signal:answer', response: '{"type": "answer", "sdp": "v=0\\r\\no=- 1234 1 IN IP4 127.0.0.1\\r\\n...", "from": "u2"}', delay: 200, broadcast: false },
      { event: 'message', listenEvent: 'ice:candidate', emitEvent: 'ice:candidate', response: '{"candidate": "candidate:1 1 udp 2130706431 192.168.1.100 5000 typ host", "sdpMid": "0", "from": "u2"}', delay: 50, broadcast: false },
      { event: 'disconnect', listenEvent: '', emitEvent: 'participant:left', response: '{"userId": "u1", "roomId": "room-abc", "remainingParticipants": 1}', delay: 0, broadcast: true },
    ],
  },
  {
    id: 'task-queue',
    label: 'Task Queue Worker',
    description: 'Background job processing with progress updates and completion events',
    handlers: [
      { event: 'connection', listenEvent: '', emitEvent: 'worker:registered', response: '{"workerId": "w-01", "queues": ["email", "export", "thumbnail"], "concurrency": 5, "pendingJobs": 12}', delay: 0, broadcast: false },
      { event: 'message', listenEvent: 'job:submit', emitEvent: 'job:accepted', response: '{"jobId": "job-789", "queue": "export", "status": "queued", "position": 3, "estimatedStart": "2026-05-24T10:02:00Z"}', delay: 200, broadcast: false },
      { event: 'message', listenEvent: 'job:status', emitEvent: 'job:progress', response: '{"jobId": "job-789", "status": "processing", "progress": 65, "message": "Exporting rows 650/1000...", "startedAt": "2026-05-24T10:02:00Z"}', delay: 500, broadcast: false },
      { event: 'disconnect', listenEvent: '', emitEvent: 'worker:offline', response: '{"workerId": "w-01", "reassignedJobs": 2, "message": "Worker disconnected, jobs redistributed"}', delay: 0, broadcast: true },
    ],
  },
];
