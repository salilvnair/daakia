/**
 * SSE mock server sample event configurations.
 * Each sample provides a set of SSE events with realistic data.
 */

export interface SSESample {
  id: string;
  label: string;
  description: string;
  events: Array<{
    eventName: string;
    data: string;
    intervalMs: number;
    delay: number;
    repeat: boolean;
  }>;
}

export const SSE_SAMPLES: SSESample[] = [
  {
    id: 'live-scores',
    label: 'Live Sports Scores',
    description: 'Real-time score updates with match events, goals, and game clock',
    events: [
      { eventName: 'score', data: '{"match": "Team A vs Team B", "score": "2-1", "minute": 67, "lastGoal": "Team A - Player #9"}', intervalMs: 5000, delay: 0, repeat: true },
      { eventName: 'event', data: '{"type": "yellow_card", "player": "Player #4", "team": "Team B", "minute": 72}', intervalMs: 15000, delay: 3000, repeat: true },
      { eventName: 'clock', data: '{"minute": 67, "half": 2, "stoppage": 0, "status": "in_progress"}', intervalMs: 1000, delay: 0, repeat: true },
    ],
  },
  {
    id: 'stock-prices',
    label: 'Stock Price Feed',
    description: 'Live stock ticker with price changes, volume, and market status',
    events: [
      { eventName: 'price', data: '{"symbol": "AAPL", "price": 185.42, "change": 2.35, "changePercent": 1.28, "volume": 52300000}', intervalMs: 2000, delay: 0, repeat: true },
      { eventName: 'price', data: '{"symbol": "GOOGL", "price": 178.90, "change": -0.85, "changePercent": -0.47, "volume": 18900000}', intervalMs: 2500, delay: 500, repeat: true },
      { eventName: 'market-status', data: '{"status": "open", "session": "regular", "nextClose": "2026-05-24T16:00:00Z"}', intervalMs: 30000, delay: 1000, repeat: true },
    ],
  },
  {
    id: 'notifications',
    label: 'Push Notifications',
    description: 'App notification stream with different priority levels and categories',
    events: [
      { eventName: 'notification', data: '{"id": "notif-001", "title": "New message from Alice", "body": "Hey, are you free for lunch?", "category": "message", "priority": "high", "timestamp": "2026-05-24T10:30:00Z"}', intervalMs: 8000, delay: 1000, repeat: true },
      { eventName: 'notification', data: '{"id": "notif-002", "title": "Order shipped", "body": "Your package #8842 is on its way", "category": "commerce", "priority": "normal", "timestamp": "2026-05-24T10:31:00Z"}', intervalMs: 12000, delay: 4000, repeat: true },
      { eventName: 'badge', data: '{"unread": 7, "categories": {"message": 3, "commerce": 2, "system": 2}}', intervalMs: 10000, delay: 2000, repeat: true },
    ],
  },
  {
    id: 'ci-pipeline',
    label: 'CI/CD Pipeline',
    description: 'Build pipeline progress with stage updates, logs, and test results',
    events: [
      { eventName: 'stage', data: '{"pipeline": "main-build-142", "stage": "build", "status": "running", "progress": 65, "duration": 45}', intervalMs: 3000, delay: 0, repeat: true },
      { eventName: 'log', data: '{"level": "info", "message": "Compiling TypeScript... 128 files processed", "timestamp": "2026-05-24T10:00:15Z"}', intervalMs: 2000, delay: 500, repeat: true },
      { eventName: 'test-result', data: '{"suite": "unit-tests", "passed": 142, "failed": 0, "skipped": 3, "coverage": 87.5}', intervalMs: 20000, delay: 10000, repeat: true },
    ],
  },
  {
    id: 'server-metrics',
    label: 'Server Metrics',
    description: 'System monitoring with CPU, memory, disk, and network metrics',
    events: [
      { eventName: 'cpu', data: '{"host": "prod-web-01", "usage": 42.5, "cores": 8, "loadAvg": [1.2, 0.9, 0.7]}', intervalMs: 2000, delay: 0, repeat: true },
      { eventName: 'memory', data: '{"host": "prod-web-01", "used": 6144, "total": 16384, "percent": 37.5, "swap": 0}', intervalMs: 5000, delay: 1000, repeat: true },
      { eventName: 'network', data: '{"host": "prod-web-01", "rxBytes": 125000, "txBytes": 89000, "connections": 342, "errors": 0}', intervalMs: 3000, delay: 2000, repeat: true },
    ],
  },
  {
    id: 'chat-stream',
    label: 'AI Chat Stream',
    description: 'Token-by-token AI response streaming like ChatGPT/Claude',
    events: [
      { eventName: 'token', data: '{"id": "resp-001", "content": "Here is", "index": 0, "model": "gpt-4", "finish_reason": null}', intervalMs: 100, delay: 500, repeat: true },
      { eventName: 'usage', data: '{"prompt_tokens": 42, "completion_tokens": 15, "total_tokens": 57}', intervalMs: 0, delay: 3000, repeat: false },
      { eventName: 'done', data: '{"id": "resp-001", "finish_reason": "stop", "total_tokens": 57}', intervalMs: 0, delay: 5000, repeat: false },
    ],
  },
  {
    id: 'weather-updates',
    label: 'Weather Updates',
    description: 'Real-time weather data with temperature, conditions, and alerts',
    events: [
      { eventName: 'current', data: '{"location": "San Francisco", "temp": 18.5, "feels_like": 17.2, "humidity": 72, "condition": "Partly Cloudy", "wind": {"speed": 12, "direction": "NW"}}', intervalMs: 10000, delay: 0, repeat: true },
      { eventName: 'forecast', data: '{"hourly": [{"hour": 14, "temp": 19, "condition": "Sunny"}, {"hour": 15, "temp": 18, "condition": "Cloudy"}, {"hour": 16, "temp": 17, "condition": "Rain"}]}', intervalMs: 60000, delay: 5000, repeat: true },
      { eventName: 'alert', data: '{"type": "wind_advisory", "severity": "moderate", "message": "Strong winds expected 3-6pm", "expires": "2026-05-24T18:00:00Z"}', intervalMs: 0, delay: 2000, repeat: false },
    ],
  },
  {
    id: 'order-tracking',
    label: 'Order Tracking',
    description: 'Package delivery updates with location, status, and ETA',
    events: [
      { eventName: 'status', data: '{"orderId": "ORD-8842", "status": "in_transit", "carrier": "FedEx", "trackingNumber": "FX123456789", "eta": "2026-05-25T14:00:00Z"}', intervalMs: 15000, delay: 0, repeat: true },
      { eventName: 'location', data: '{"orderId": "ORD-8842", "lat": 37.7749, "lng": -122.4194, "city": "San Francisco", "facility": "Distribution Center", "timestamp": "2026-05-24T08:30:00Z"}', intervalMs: 10000, delay: 3000, repeat: true },
      { eventName: 'event', data: '{"orderId": "ORD-8842", "type": "scanned", "message": "Package arrived at local facility", "timestamp": "2026-05-24T08:30:00Z"}', intervalMs: 20000, delay: 5000, repeat: true },
    ],
  },
  {
    id: 'social-feed',
    label: 'Social Media Feed',
    description: 'Live social feed with posts, likes, and trending topics',
    events: [
      { eventName: 'post', data: '{"id": "post-991", "author": {"name": "Jane Dev", "avatar": "jd", "verified": true}, "content": "Just deployed v2.0! 🚀", "likes": 42, "comments": 7, "timestamp": "2026-05-24T10:15:00Z"}', intervalMs: 6000, delay: 0, repeat: true },
      { eventName: 'like', data: '{"postId": "post-991", "user": "Bob Smith", "totalLikes": 43}', intervalMs: 3000, delay: 2000, repeat: true },
      { eventName: 'trending', data: '{"topics": [{"tag": "#typescript", "posts": 1250}, {"tag": "#vscode", "posts": 890}, {"tag": "#webdev", "posts": 2100}]}', intervalMs: 30000, delay: 10000, repeat: true },
    ],
  },
  {
    id: 'crypto-prices',
    label: 'Crypto Price Ticker',
    description: 'Cryptocurrency price feed with trades, orderbook, and market data',
    events: [
      { eventName: 'trade', data: '{"symbol": "BTC/USD", "price": 68542.50, "size": 0.15, "side": "buy", "timestamp": "2026-05-24T10:00:01Z"}', intervalMs: 1000, delay: 0, repeat: true },
      { eventName: 'ticker', data: '{"symbol": "ETH/USD", "bid": 3850.20, "ask": 3851.10, "last": 3850.80, "volume24h": 12500000, "change24h": 2.3}', intervalMs: 2000, delay: 500, repeat: true },
      { eventName: 'orderbook', data: '{"symbol": "BTC/USD", "bids": [[68540, 1.5], [68535, 2.1], [68530, 0.8]], "asks": [[68545, 0.9], [68550, 1.2], [68555, 3.0]]}', intervalMs: 500, delay: 200, repeat: true },
    ],
  },
];
