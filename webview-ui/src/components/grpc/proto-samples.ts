/**
 * Sample .proto file definitions for download.
 * Users can download these to test gRPC client functionality.
 */

export interface ProtoSample {
  id: string;
  label: string;
  filename: string;
  description: string;
  content: string;
}

export const PROTO_SAMPLES: ProtoSample[] = [
  {
    id: 'echo',
    label: 'Echo Service',
    filename: 'echo.proto',
    description: 'Simple unary echo + server-streaming countdown',
    content: `syntax = "proto3";

package echo;

service EchoService {
  // Returns the same message back
  rpc Echo (EchoRequest) returns (EchoResponse);
  // Returns reversed text
  rpc Reverse (EchoRequest) returns (EchoResponse);
  // Streams countdown numbers
  rpc Countdown (CountdownRequest) returns (stream CountdownResponse);
}

message EchoRequest {
  string message = 1;
}

message EchoResponse {
  string message = 1;
  int64 timestamp = 2;
}

message CountdownRequest {
  int32 from = 1;
}

message CountdownResponse {
  int32 value = 1;
  bool done = 2;
}
`,
  },
  {
    id: 'user-service',
    label: 'User Service (CRUD)',
    filename: 'user_service.proto',
    description: 'User CRUD with pagination and streaming bulk create',
    content: `syntax = "proto3";

package users;

service UserService {
  rpc GetUser (GetUserRequest) returns (User);
  rpc ListUsers (ListUsersRequest) returns (ListUsersResponse);
  rpc CreateUser (CreateUserRequest) returns (User);
  rpc UpdateUser (UpdateUserRequest) returns (User);
  rpc DeleteUser (DeleteUserRequest) returns (DeleteUserResponse);
  // Client streaming — bulk create users
  rpc BulkCreate (stream CreateUserRequest) returns (BulkCreateResponse);
}

message User {
  string id = 1;
  string name = 2;
  string email = 3;
  string role = 4;
  int64 created_at = 5;
  bool active = 6;
}

message GetUserRequest {
  string id = 1;
}

message ListUsersRequest {
  int32 page = 1;
  int32 page_size = 2;
  string filter = 3;
}

message ListUsersResponse {
  repeated User users = 1;
  int32 total = 2;
  int32 page = 3;
}

message CreateUserRequest {
  string name = 1;
  string email = 2;
  string role = 3;
}

message UpdateUserRequest {
  string id = 1;
  string name = 2;
  string email = 3;
  string role = 4;
  bool active = 5;
}

message DeleteUserRequest {
  string id = 1;
}

message DeleteUserResponse {
  bool success = 1;
}

message BulkCreateResponse {
  int32 created_count = 1;
  repeated string ids = 2;
}
`,
  },
  {
    id: 'chat',
    label: 'Chat Service (Bidi)',
    filename: 'chat.proto',
    description: 'Bidirectional streaming chat with rooms',
    content: `syntax = "proto3";

package chat;

service ChatService {
  // Bidirectional streaming chat
  rpc Chat (stream ChatMessage) returns (stream ChatMessage);
  // Join a room and receive messages
  rpc JoinRoom (JoinRequest) returns (stream ChatMessage);
  // Get room info
  rpc GetRoom (GetRoomRequest) returns (Room);
  // List available rooms
  rpc ListRooms (ListRoomsRequest) returns (ListRoomsResponse);
}

message ChatMessage {
  string id = 1;
  string room_id = 2;
  string sender = 3;
  string content = 4;
  int64 timestamp = 5;
  MessageType type = 6;
}

enum MessageType {
  TEXT = 0;
  JOIN = 1;
  LEAVE = 2;
  SYSTEM = 3;
}

message JoinRequest {
  string room_id = 1;
  string username = 2;
}

message GetRoomRequest {
  string room_id = 1;
}

message Room {
  string id = 1;
  string name = 2;
  repeated string members = 3;
  int64 created_at = 4;
}

message ListRoomsRequest {
  int32 limit = 1;
}

message ListRoomsResponse {
  repeated Room rooms = 1;
}
`,
  },
  {
    id: 'sensor',
    label: 'Sensor Data (Streaming)',
    filename: 'sensor.proto',
    description: 'IoT sensor readings with server streaming',
    content: `syntax = "proto3";

package sensors;

service SensorService {
  // Get latest reading from a sensor
  rpc GetLatest (SensorRequest) returns (SensorReading);
  // Stream readings in real-time
  rpc StreamReadings (StreamRequest) returns (stream SensorReading);
  // Client streaming — batch upload readings
  rpc UploadReadings (stream SensorReading) returns (UploadResponse);
  // Get sensor info
  rpc GetSensorInfo (SensorRequest) returns (SensorInfo);
}

message SensorRequest {
  string sensor_id = 1;
}

message StreamRequest {
  string sensor_id = 1;
  int32 interval_ms = 2;
  int32 max_readings = 3;
}

message SensorReading {
  string sensor_id = 1;
  double temperature = 2;
  double humidity = 3;
  double pressure = 4;
  int64 timestamp = 5;
  int32 battery_percent = 6;
}

message UploadResponse {
  int32 received_count = 1;
  bool success = 2;
  string message = 3;
}

message SensorInfo {
  string sensor_id = 1;
  string name = 2;
  string location = 3;
  string model = 4;
  int64 last_seen = 5;
  bool online = 6;
}
`,
  },
  {
    id: 'product',
    label: 'Product Catalog',
    filename: 'product.proto',
    description: 'E-commerce product catalog with search and inventory',
    content: `syntax = "proto3";

package catalog;

service ProductService {
  rpc GetProduct (GetProductRequest) returns (Product);
  rpc SearchProducts (SearchRequest) returns (SearchResponse);
  rpc CreateProduct (CreateProductRequest) returns (Product);
  rpc UpdateInventory (UpdateInventoryRequest) returns (InventoryResponse);
  // Stream product updates in real-time
  rpc WatchInventory (WatchRequest) returns (stream InventoryEvent);
}

message Product {
  string id = 1;
  string name = 2;
  string description = 3;
  double price = 4;
  string currency = 5;
  int32 stock = 6;
  string category = 7;
  repeated string tags = 8;
  bool available = 9;
}

message GetProductRequest {
  string id = 1;
}

message SearchRequest {
  string query = 1;
  string category = 2;
  double min_price = 3;
  double max_price = 4;
  int32 page = 5;
  int32 page_size = 6;
}

message SearchResponse {
  repeated Product products = 1;
  int32 total = 2;
}

message CreateProductRequest {
  string name = 1;
  string description = 2;
  double price = 3;
  string currency = 4;
  int32 stock = 5;
  string category = 6;
  repeated string tags = 7;
}

message UpdateInventoryRequest {
  string product_id = 1;
  int32 quantity_change = 2;
  string reason = 3;
}

message InventoryResponse {
  string product_id = 1;
  int32 new_stock = 2;
  bool success = 3;
}

message WatchRequest {
  string category = 1;
}

message InventoryEvent {
  string product_id = 1;
  string product_name = 2;
  int32 old_stock = 3;
  int32 new_stock = 4;
  string reason = 5;
  int64 timestamp = 6;
}
`,
  },
  {
    id: 'rideshare',
    label: 'Ride-sharing (All Types)',
    filename: 'rideshare.proto',
    description: 'Ride service with unary, server/client/bidi streaming',
    content: `syntax = "proto3";

package rideshare;

service RideService {
  // Unary — Request a new ride
  rpc RequestRide (RideRequest) returns (RideResponse);

  // Server streaming — Track driver location in real-time
  rpc TrackDriver (TrackRequest) returns (stream LocationUpdate);

  // Client streaming — Rider sends GPS updates during trip
  rpc SendLocationUpdates (stream LocationUpdate) returns (TripSummary);

  // Bidi streaming — Live chat between rider and driver
  rpc LiveChat (stream ChatMessage) returns (stream ChatMessage);
}

message RideRequest {
  double pickup_lat = 1;
  double pickup_lng = 2;
  double dropoff_lat = 3;
  double dropoff_lng = 4;
  string ride_type = 5; // "economy", "premium", "xl"
}

message RideResponse {
  string ride_id = 1;
  string driver_name = 2;
  string vehicle = 3;
  int32 eta_seconds = 4;
  double estimated_fare = 5;
}

message TrackRequest {
  string ride_id = 1;
}

message LocationUpdate {
  string entity_id = 1;
  double latitude = 2;
  double longitude = 3;
  double speed_kmh = 4;
  int64 timestamp = 5;
}

message TripSummary {
  double distance_km = 1;
  int32 duration_seconds = 2;
  int32 points_received = 3;
}

message ChatMessage {
  string sender = 1;
  string text = 2;
  int64 timestamp = 3;
}
`,
  },
  {
    id: 'trading',
    label: 'Stock Trading (All Types)',
    filename: 'trading.proto',
    description: 'Trading platform with unary, server/client/bidi streaming',
    content: `syntax = "proto3";

package trading;

service TradingService {
  // Unary — Get current price quote
  rpc GetQuote (QuoteRequest) returns (Quote);

  // Server streaming — Stream live price updates
  rpc StreamPrices (PriceStreamRequest) returns (stream PriceUpdate);

  // Client streaming — Submit batch of orders
  rpc BatchOrders (stream OrderRequest) returns (BatchOrderResult);

  // Bidi streaming — Interactive trading session
  rpc TradingSession (stream TradeCommand) returns (stream TradeEvent);
}

message QuoteRequest {
  string symbol = 1;
}

message Quote {
  string symbol = 1;
  double bid = 2;
  double ask = 3;
  double last_price = 4;
  int64 volume = 5;
  int64 timestamp = 6;
}

message PriceStreamRequest {
  repeated string symbols = 1;
  int32 interval_ms = 2;
}

message PriceUpdate {
  string symbol = 1;
  double price = 2;
  double change_percent = 3;
  int64 volume = 4;
  int64 timestamp = 5;
}

message OrderRequest {
  string symbol = 1;
  string side = 2; // "buy" or "sell"
  double quantity = 3;
  double limit_price = 4;
  string order_type = 5; // "market", "limit", "stop"
}

message BatchOrderResult {
  int32 submitted = 1;
  int32 accepted = 2;
  int32 rejected = 3;
  repeated string order_ids = 4;
}

message TradeCommand {
  string action = 1; // "subscribe", "unsubscribe", "place_order", "cancel_order"
  string symbol = 2;
  double quantity = 3;
  double price = 4;
  string order_id = 5;
}

message TradeEvent {
  string event_type = 1; // "fill", "partial_fill", "cancelled", "price_alert"
  string symbol = 2;
  double price = 3;
  double quantity = 4;
  string order_id = 5;
  int64 timestamp = 6;
  string message = 7;
}
`,
  },
  {
    id: 'filetransfer',
    label: 'File Transfer (All Types)',
    filename: 'filetransfer.proto',
    description: 'File service with unary, server/client/bidi streaming',
    content: `syntax = "proto3";

package filetransfer;

service FileService {
  // Unary — Get file metadata
  rpc GetFileInfo (FileInfoRequest) returns (FileInfo);

  // Server streaming — Download file in chunks
  rpc DownloadFile (DownloadRequest) returns (stream FileChunk);

  // Client streaming — Upload file in chunks
  rpc UploadFile (stream FileChunk) returns (UploadResult);

  // Bidi streaming — Sync files between client and server
  rpc SyncFiles (stream SyncCommand) returns (stream SyncEvent);
}

message FileInfoRequest {
  string path = 1;
}

message FileInfo {
  string path = 1;
  string name = 2;
  int64 size_bytes = 3;
  string mime_type = 4;
  string checksum_sha256 = 5;
  int64 modified_at = 6;
  bool is_directory = 7;
}

message DownloadRequest {
  string path = 1;
  int32 chunk_size = 2; // bytes per chunk
  int64 offset = 3; // resume from offset
}

message FileChunk {
  string path = 1;
  bytes data = 2;
  int64 offset = 3;
  int64 total_size = 4;
  bool is_last = 5;
}

message UploadResult {
  string path = 1;
  int64 bytes_written = 2;
  string checksum_sha256 = 3;
  bool success = 4;
  string error = 5;
}

message SyncCommand {
  string action = 1; // "check", "push", "pull", "delete"
  string path = 2;
  string checksum = 3;
  int64 modified_at = 4;
  bytes data = 5;
}

message SyncEvent {
  string event_type = 1; // "needs_update", "conflict", "synced", "deleted"
  string path = 2;
  string remote_checksum = 3;
  int64 remote_modified_at = 4;
  bytes data = 5;
  string message = 6;
}
`,
  },
];
