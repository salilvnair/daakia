/**
 * gRPC mock server sample configurations.
 * - "No Proto" samples: work instantly with generic JSON serialization (no .proto file needed)
 * - "With Proto" samples: methods match proto-samples.ts definitions — upload the matching .proto from client
 */

export interface GrpcSample {
  id: string;
  label: string;
  description: string;
  category: 'no-proto' | 'with-proto';
  methods: Array<{
    service: string;
    method: string;
    type: 'unary' | 'server_streaming' | 'client_streaming' | 'bidi_streaming';
    response: string;
    streamResponses?: Array<{ data: string; delayMs: number }>;
  }>;
}

export const GRPC_SAMPLES: GrpcSample[] = [
  // ════════════════════════════════════════════════════════════════
  // NO PROTO — works out of the box with generic JSON serialization
  // ════════════════════════════════════════════════════════════════
  {
    id: 'health-check',
    label: 'Health Check',
    description: 'Standard gRPC health checking service (no proto needed)',
    category: 'no-proto',
    methods: [
      {
        service: 'grpc.health.v1.Health',
        method: 'Check',
        type: 'unary',
        response: '{"status": "SERVING"}',
      },
      {
        service: 'grpc.health.v1.Health',
        method: 'Watch',
        type: 'server_streaming',
        response: '{"status": "SERVING"}',
        streamResponses: [
          { data: '{"status": "SERVING"}', delayMs: 0 },
          { data: '{"status": "SERVING"}', delayMs: 3000 },
          { data: '{"status": "NOT_SERVING"}', delayMs: 3000 },
          { data: '{"status": "SERVING"}', delayMs: 2000 },
        ],
      },
    ],
  },
  {
    id: 'auth-service',
    label: 'Auth Service',
    description: 'Authentication with login, refresh, and logout (no proto needed)',
    category: 'no-proto',
    methods: [
      {
        service: 'auth.AuthService',
        method: 'Login',
        type: 'unary',
        response: '{"access_token": "eyJhbGciOiJIUzI1NiJ9.mock_token", "refresh_token": "rt_mock_abc123", "expires_in": 3600, "user_id": "usr_001"}',
      },
      {
        service: 'auth.AuthService',
        method: 'RefreshToken',
        type: 'unary',
        response: '{"access_token": "eyJhbGciOiJIUzI1NiJ9.refreshed_token", "expires_in": 3600}',
      },
      {
        service: 'auth.AuthService',
        method: 'Logout',
        type: 'unary',
        response: '{"success": true, "message": "Session terminated"}',
      },
      {
        service: 'auth.AuthService',
        method: 'ValidateToken',
        type: 'unary',
        response: '{"valid": true, "user_id": "usr_001", "roles": ["admin", "editor"], "expires_at": "2026-05-28T18:00:00Z"}',
      },
    ],
  },
  {
    id: 'notification-service',
    label: 'Notification Stream',
    description: 'Real-time notification delivery via server streaming (no proto needed)',
    category: 'no-proto',
    methods: [
      {
        service: 'notify.NotificationService',
        method: 'Subscribe',
        type: 'server_streaming',
        response: '{}',
        streamResponses: [
          { data: '{"id": "n1", "type": "info", "title": "Welcome!", "body": "You are now connected", "timestamp": "2026-05-28T12:00:00Z"}', delayMs: 0 },
          { data: '{"id": "n2", "type": "message", "title": "New message", "body": "Alice sent you a message", "timestamp": "2026-05-28T12:00:02Z"}', delayMs: 2000 },
          { data: '{"id": "n3", "type": "alert", "title": "Payment received", "body": "$42.00 from Bob", "timestamp": "2026-05-28T12:00:05Z"}', delayMs: 3000 },
          { data: '{"id": "n4", "type": "system", "title": "Maintenance", "body": "Scheduled at 3 AM", "timestamp": "2026-05-28T12:00:08Z"}', delayMs: 3000 },
        ],
      },
      {
        service: 'notify.NotificationService',
        method: 'MarkRead',
        type: 'unary',
        response: '{"success": true, "unread_count": 2}',
      },
    ],
  },
  {
    id: 'order-service',
    label: 'Order Processing',
    description: 'E-commerce order lifecycle — create, track, cancel (no proto needed)',
    category: 'no-proto',
    methods: [
      {
        service: 'orders.OrderService',
        method: 'CreateOrder',
        type: 'unary',
        response: '{"order_id": "ORD-20260528-001", "status": "CONFIRMED", "total": 129.99, "currency": "USD", "estimated_delivery": "2026-06-02"}',
      },
      {
        service: 'orders.OrderService',
        method: 'TrackOrder',
        type: 'server_streaming',
        response: '{}',
        streamResponses: [
          { data: '{"order_id": "ORD-20260528-001", "status": "PROCESSING", "location": "Warehouse A", "timestamp": "2026-05-28T10:00:00Z"}', delayMs: 0 },
          { data: '{"order_id": "ORD-20260528-001", "status": "SHIPPED", "location": "Distribution Center", "tracking": "TRK123456", "timestamp": "2026-05-28T14:00:00Z"}', delayMs: 1500 },
          { data: '{"order_id": "ORD-20260528-001", "status": "IN_TRANSIT", "location": "Local Facility", "timestamp": "2026-05-29T08:00:00Z"}', delayMs: 1500 },
          { data: '{"order_id": "ORD-20260528-001", "status": "DELIVERED", "location": "Front door", "timestamp": "2026-05-29T15:30:00Z"}', delayMs: 1500 },
        ],
      },
      {
        service: 'orders.OrderService',
        method: 'CancelOrder',
        type: 'unary',
        response: '{"order_id": "ORD-20260528-001", "status": "CANCELLED", "refund_amount": 129.99, "refund_eta": "3-5 business days"}',
      },
    ],
  },
  {
    id: 'log-ingestion',
    label: 'Log Ingestion',
    description: 'Client streaming log collector — batch send logs, get summary (no proto needed)',
    category: 'no-proto',
    methods: [
      {
        service: 'logging.LogService',
        method: 'IngestLogs',
        type: 'client_streaming',
        response: '{"ingested": 47, "failed": 0, "batch_id": "batch_2026052813", "storage_used_mb": 12.4}',
      },
      {
        service: 'logging.LogService',
        method: 'Query',
        type: 'unary',
        response: '{"logs": [{"level": "ERROR", "service": "payment-api", "message": "Connection timeout", "timestamp": "2026-05-28T11:42:00Z"}, {"level": "WARN", "service": "auth-svc", "message": "Rate limit approaching", "timestamp": "2026-05-28T11:43:00Z"}], "total": 2, "query_time_ms": 45}',
      },
    ],
  },

  // ════════════════════════════════════════════════════════════════
  // WITH PROTO — matches downloadable .proto files from client tab
  // ════════════════════════════════════════════════════════════════
  {
    id: 'echo-proto',
    label: 'Echo (↓ echo.proto)',
    description: 'Matches echo.proto — download from client Proto tab samples',
    category: 'with-proto',
    methods: [
      {
        service: 'echo.EchoService',
        method: 'Echo',
        type: 'unary',
        response: '{"message": "Echo: Hello from gRPC mock!", "timestamp": 1716900000}',
      },
      {
        service: 'echo.EchoService',
        method: 'Reverse',
        type: 'unary',
        response: '{"message": "!kcom CPRg morf olleH", "timestamp": 1716900001}',
      },
      {
        service: 'echo.EchoService',
        method: 'Countdown',
        type: 'server_streaming',
        response: '{}',
        streamResponses: [
          { data: '{"value": 5, "done": false}', delayMs: 0 },
          { data: '{"value": 4, "done": false}', delayMs: 1000 },
          { data: '{"value": 3, "done": false}', delayMs: 1000 },
          { data: '{"value": 2, "done": false}', delayMs: 1000 },
          { data: '{"value": 1, "done": false}', delayMs: 1000 },
          { data: '{"value": 0, "done": true}', delayMs: 1000 },
        ],
      },
    ],
  },
  {
    id: 'user-service-proto',
    label: 'Users (↓ user_service.proto)',
    description: 'Matches user_service.proto — CRUD + bulk create',
    category: 'with-proto',
    methods: [
      {
        service: 'users.UserService',
        method: 'GetUser',
        type: 'unary',
        response: '{"id": "usr_001", "name": "Alice Johnson", "email": "alice@example.com", "role": "admin", "created_at": 1716800000, "active": true}',
      },
      {
        service: 'users.UserService',
        method: 'ListUsers',
        type: 'unary',
        response: '{"users": [{"id": "usr_001", "name": "Alice Johnson", "email": "alice@example.com", "role": "admin", "created_at": 1716800000, "active": true}, {"id": "usr_002", "name": "Bob Smith", "email": "bob@example.com", "role": "viewer", "created_at": 1716810000, "active": true}], "total": 2, "page": 1}',
      },
      {
        service: 'users.UserService',
        method: 'CreateUser',
        type: 'unary',
        response: '{"id": "usr_003", "name": "Charlie Brown", "email": "charlie@example.com", "role": "editor", "created_at": 1716900000, "active": true}',
      },
      {
        service: 'users.UserService',
        method: 'DeleteUser',
        type: 'unary',
        response: '{"success": true}',
      },
      {
        service: 'users.UserService',
        method: 'BulkCreate',
        type: 'client_streaming',
        response: '{"created_count": 3, "ids": ["usr_010", "usr_011", "usr_012"]}',
      },
    ],
  },
  {
    id: 'chat-proto',
    label: 'Chat (↓ chat.proto)',
    description: 'Matches chat.proto — bidi streaming chat + rooms',
    category: 'with-proto',
    methods: [
      {
        service: 'chat.ChatService',
        method: 'Chat',
        type: 'bidi_streaming',
        response: '{"id": "msg_r1", "room_id": "room-001", "sender": "bot", "content": "Got your message!", "timestamp": 1716900000, "type": 0}',
      },
      {
        service: 'chat.ChatService',
        method: 'JoinRoom',
        type: 'server_streaming',
        response: '{}',
        streamResponses: [
          { data: '{"id": "sys_1", "room_id": "room-001", "sender": "system", "content": "You joined #general", "timestamp": 1716900000, "type": 1}', delayMs: 0 },
          { data: '{"id": "msg_1", "room_id": "room-001", "sender": "alice", "content": "Hey! Welcome!", "timestamp": 1716900002, "type": 0}', delayMs: 2000 },
          { data: '{"id": "msg_2", "room_id": "room-001", "sender": "bob", "content": "Hi there 👋", "timestamp": 1716900004, "type": 0}', delayMs: 2000 },
        ],
      },
      {
        service: 'chat.ChatService',
        method: 'GetRoom',
        type: 'unary',
        response: '{"id": "room-001", "name": "#general", "members": ["alice", "bob", "charlie"], "created_at": 1716700000}',
      },
      {
        service: 'chat.ChatService',
        method: 'ListRooms',
        type: 'unary',
        response: '{"rooms": [{"id": "room-001", "name": "#general", "members": ["alice", "bob"], "created_at": 1716700000}, {"id": "room-002", "name": "#dev", "members": ["alice", "charlie"], "created_at": 1716750000}]}',
      },
    ],
  },
  {
    id: 'sensor-proto',
    label: 'Sensors (↓ sensor.proto)',
    description: 'Matches sensor.proto — IoT streaming + batch upload',
    category: 'with-proto',
    methods: [
      {
        service: 'sensors.SensorService',
        method: 'GetLatest',
        type: 'unary',
        response: '{"sensor_id": "sensor-001", "temperature": 22.5, "humidity": 45.0, "pressure": 1013.25, "timestamp": 1716900000, "battery_percent": 85}',
      },
      {
        service: 'sensors.SensorService',
        method: 'StreamReadings',
        type: 'server_streaming',
        response: '{}',
        streamResponses: [
          { data: '{"sensor_id": "sensor-001", "temperature": 22.5, "humidity": 45.0, "pressure": 1013.25, "timestamp": 1716900000, "battery_percent": 85}', delayMs: 0 },
          { data: '{"sensor_id": "sensor-001", "temperature": 22.7, "humidity": 44.8, "pressure": 1013.20, "timestamp": 1716900001, "battery_percent": 85}', delayMs: 1000 },
          { data: '{"sensor_id": "sensor-001", "temperature": 23.1, "humidity": 44.2, "pressure": 1013.10, "timestamp": 1716900002, "battery_percent": 84}', delayMs: 1000 },
          { data: '{"sensor_id": "sensor-001", "temperature": 22.9, "humidity": 44.5, "pressure": 1013.15, "timestamp": 1716900003, "battery_percent": 84}', delayMs: 1000 },
        ],
      },
      {
        service: 'sensors.SensorService',
        method: 'UploadReadings',
        type: 'client_streaming',
        response: '{"received_count": 10, "success": true, "message": "Batch accepted"}',
      },
      {
        service: 'sensors.SensorService',
        method: 'GetSensorInfo',
        type: 'unary',
        response: '{"sensor_id": "sensor-001", "name": "Office Temp", "location": "Building A, Floor 3", "model": "DHT22-Pro", "last_seen": 1716900003, "online": true}',
      },
    ],
  },
  {
    id: 'product-proto',
    label: 'Products (↓ product.proto)',
    description: 'Matches product.proto — catalog search + inventory watch',
    category: 'with-proto',
    methods: [
      {
        service: 'catalog.ProductService',
        method: 'GetProduct',
        type: 'unary',
        response: '{"id": "prod_001", "name": "Wireless Headphones", "description": "Premium noise-cancelling headphones", "price": 149.99, "currency": "USD", "stock": 42, "category": "electronics", "tags": ["audio", "wireless", "bluetooth"], "available": true}',
      },
      {
        service: 'catalog.ProductService',
        method: 'SearchProducts',
        type: 'unary',
        response: '{"products": [{"id": "prod_001", "name": "Wireless Headphones", "price": 149.99, "currency": "USD", "stock": 42, "category": "electronics", "available": true}, {"id": "prod_002", "name": "USB-C Hub", "price": 39.99, "currency": "USD", "stock": 128, "category": "electronics", "available": true}], "total": 2}',
      },
      {
        service: 'catalog.ProductService',
        method: 'UpdateInventory',
        type: 'unary',
        response: '{"product_id": "prod_001", "new_stock": 40, "success": true}',
      },
      {
        service: 'catalog.ProductService',
        method: 'WatchInventory',
        type: 'server_streaming',
        response: '{}',
        streamResponses: [
          { data: '{"product_id": "prod_001", "product_name": "Wireless Headphones", "old_stock": 42, "new_stock": 40, "reason": "sale", "timestamp": 1716900000}', delayMs: 0 },
          { data: '{"product_id": "prod_002", "product_name": "USB-C Hub", "old_stock": 128, "new_stock": 125, "reason": "sale", "timestamp": 1716900002}', delayMs: 2000 },
          { data: '{"product_id": "prod_001", "product_name": "Wireless Headphones", "old_stock": 40, "new_stock": 50, "reason": "restock", "timestamp": 1716900005}', delayMs: 3000 },
        ],
      },
    ],
  },
  // ════════════════════════════════════════════════════════════════
  // WITH PROTO — All 4 stream types
  // ════════════════════════════════════════════════════════════════
  {
    id: 'rideshare-proto',
    label: 'Ride-Sharing (all streams)',
    description: 'Ride-sharing service with all 4 gRPC stream types',
    category: 'with-proto',
    methods: [
      {
        service: 'rideshare.RideService',
        method: 'RequestRide',
        type: 'unary',
        response: '{"ride_id": "ride_abc123", "driver": {"name": "Alex M.", "rating": 4.9, "vehicle": "Toyota Camry"}, "eta_seconds": 180, "fare_estimate": 12.50, "currency": "USD"}',
      },
      {
        service: 'rideshare.RideService',
        method: 'TrackDriver',
        type: 'server_streaming',
        response: '{}',
        streamResponses: [
          { data: '{"lat": 37.7749, "lng": -122.4194, "heading": 45, "speed_mph": 25, "eta_seconds": 180}', delayMs: 0 },
          { data: '{"lat": 37.7755, "lng": -122.4180, "heading": 50, "speed_mph": 30, "eta_seconds": 120}', delayMs: 2000 },
          { data: '{"lat": 37.7762, "lng": -122.4165, "heading": 48, "speed_mph": 20, "eta_seconds": 60}', delayMs: 2000 },
          { data: '{"lat": 37.7770, "lng": -122.4150, "heading": 0, "speed_mph": 0, "eta_seconds": 0, "arrived": true}', delayMs: 2000 },
        ],
      },
      {
        service: 'rideshare.RideService',
        method: 'SendLocationUpdates',
        type: 'client_streaming',
        response: '{"points_received": 5, "distance_km": 3.2, "duration_seconds": 420, "fare": 14.75}',
      },
      {
        service: 'rideshare.RideService',
        method: 'LiveChat',
        type: 'bidi_streaming',
        response: '{}',
        streamResponses: [
          { data: '{"from": "driver", "message": "Hi! I\'m on my way.", "timestamp": 1716900000}', delayMs: 0 },
          { data: '{"from": "driver", "message": "I\'m outside, silver Toyota.", "timestamp": 1716900005}', delayMs: 3000 },
        ],
      },
    ],
  },
  {
    id: 'trading-proto',
    label: 'Stock Trading (all streams)',
    description: 'Stock trading platform with all 4 gRPC stream types',
    category: 'with-proto',
    methods: [
      {
        service: 'trading.TradingService',
        method: 'GetQuote',
        type: 'unary',
        response: '{"symbol": "AAPL", "price": 189.45, "change": 2.31, "change_percent": 1.23, "volume": 52340000, "market_cap": "2.95T", "timestamp": 1716900000}',
      },
      {
        service: 'trading.TradingService',
        method: 'StreamPrices',
        type: 'server_streaming',
        response: '{}',
        streamResponses: [
          { data: '{"symbol": "AAPL", "price": 189.45, "bid": 189.40, "ask": 189.50, "volume": 1200}', delayMs: 0 },
          { data: '{"symbol": "AAPL", "price": 189.52, "bid": 189.48, "ask": 189.55, "volume": 800}', delayMs: 1000 },
          { data: '{"symbol": "AAPL", "price": 189.38, "bid": 189.35, "ask": 189.42, "volume": 2400}', delayMs: 1500 },
          { data: '{"symbol": "AAPL", "price": 189.61, "bid": 189.58, "ask": 189.65, "volume": 1800}', delayMs: 1000 },
        ],
      },
      {
        service: 'trading.TradingService',
        method: 'BatchOrders',
        type: 'client_streaming',
        response: '{"orders_processed": 3, "total_value": 15420.50, "all_filled": true, "execution_time_ms": 45}',
      },
      {
        service: 'trading.TradingService',
        method: 'TradingSession',
        type: 'bidi_streaming',
        response: '{}',
        streamResponses: [
          { data: '{"type": "fill", "order_id": "ord_001", "symbol": "AAPL", "side": "buy", "quantity": 10, "price": 189.45}', delayMs: 0 },
          { data: '{"type": "alert", "symbol": "AAPL", "message": "Price crossed above 190.00", "price": 190.02}', delayMs: 2000 },
        ],
      },
    ],
  },
  {
    id: 'filetransfer-proto',
    label: 'File Transfer (all streams)',
    description: 'File transfer service with all 4 gRPC stream types',
    category: 'with-proto',
    methods: [
      {
        service: 'filetransfer.FileService',
        method: 'GetFileInfo',
        type: 'unary',
        response: '{"filename": "report.pdf", "size_bytes": 2458624, "mime_type": "application/pdf", "created_at": "2024-01-15T10:30:00Z", "checksum_sha256": "a1b2c3d4e5f6..."}',
      },
      {
        service: 'filetransfer.FileService',
        method: 'DownloadFile',
        type: 'server_streaming',
        response: '{}',
        streamResponses: [
          { data: '{"chunk_index": 0, "data": "UERGLTEuNA==", "total_chunks": 4, "bytes_sent": 614656}', delayMs: 0 },
          { data: '{"chunk_index": 1, "data": "JVBERi0xLjQ=", "total_chunks": 4, "bytes_sent": 1229312}', delayMs: 500 },
          { data: '{"chunk_index": 2, "data": "c3RyZWFtDQo=", "total_chunks": 4, "bytes_sent": 1843968}', delayMs: 500 },
          { data: '{"chunk_index": 3, "data": "ZW5kc3RyZWFt", "total_chunks": 4, "bytes_sent": 2458624, "complete": true}', delayMs: 500 },
        ],
      },
      {
        service: 'filetransfer.FileService',
        method: 'UploadFile',
        type: 'client_streaming',
        response: '{"filename": "upload.zip", "size_bytes": 5242880, "chunks_received": 8, "checksum_sha256": "f1e2d3c4b5a6...", "stored_path": "/uploads/upload.zip"}',
      },
      {
        service: 'filetransfer.FileService',
        method: 'SyncFiles',
        type: 'bidi_streaming',
        response: '{}',
        streamResponses: [
          { data: '{"action": "updated", "filename": "config.json", "size_bytes": 1024, "timestamp": "2024-01-15T10:30:00Z"}', delayMs: 0 },
          { data: '{"action": "created", "filename": "new-report.pdf", "size_bytes": 3145728, "timestamp": "2024-01-15T10:31:00Z"}', delayMs: 2000 },
          { data: '{"action": "deleted", "filename": "old-log.txt", "timestamp": "2024-01-15T10:32:00Z"}', delayMs: 1500 },
        ],
      },
    ],
  },
];
