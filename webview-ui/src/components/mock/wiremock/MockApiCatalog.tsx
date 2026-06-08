/**
 * MockApiCatalog — protocol-aware pre-built template library (6A.26 + extensions).
 */
import { useState } from 'react';
import { PlusIcon } from '../../../icons';
import type { MockRoute } from '../mock-types';

const MOCK_ACCENT = 'var(--color-mock-server)';

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  routeCount: number;
  routes: MockRoute[];
  /** For non-REST protocols, raw config (SDL / .proto / WSDL / event JSON) instead of routes */
  raw?: string;
  rawLabel?: string; // e.g. "SDL", ".proto", "WSDL", "Events"
}

export interface Props {
  protocol?: string;
  onAddRoutes: (routes: MockRoute[], raw?: string) => void;
}

// ─── Template helpers ─────────────────────────────────────────────────────────

function r(method: string, path: string, status: number, body: string, headers?: Record<string, string>): MockRoute {
  return { id: crypto.randomUUID(), method: method as MockRoute['method'], path, statusCode: status, headers: headers ?? { 'Content-Type': 'application/json' }, body, delay: 0, enabled: true };
}
const j = (o: unknown) => JSON.stringify(o, null, 2);

// ─── REST catalog ─────────────────────────────────────────────────────────────

const REST_CATALOG: CatalogEntry[] = [
  {
    id: 'users-crud', name: 'Users CRUD', category: 'REST', tags: ['users', 'crud', 'auth'], routeCount: 5,
    description: 'Full user management: list, get, create, update, delete with realistic data.',
    routes: [
      r('GET',    '/api/users',     200, j({ users: [{ id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'admin' }, { id: 2, name: 'Bob Smith', email: 'bob@example.com', role: 'user' }], total: 2, page: 1 })),
      r('GET',    '/api/users/:id', 200, j({ id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'admin' })),
      r('POST',   '/api/users',     201, j({ id: 3, name: 'New User', email: 'new@example.com', role: 'user' })),
      r('PUT',    '/api/users/:id', 200, j({ id: 1, name: 'Alice Johnson Updated', email: 'alice@example.com' })),
      r('DELETE', '/api/users/:id', 204, ''),
    ],
  },
  {
    id: 'auth-flow', name: 'Auth Flow', category: 'REST', tags: ['auth', 'jwt', 'oauth', 'login'], routeCount: 4,
    description: 'Login, logout, refresh token, and profile endpoints with JWT-style responses.',
    routes: [
      r('POST', '/auth/login',   200, j({ accessToken: 'eyJhbGciOiJIUzI1NiJ9.mock', refreshToken: 'refresh_abc123', expiresIn: 3600, tokenType: 'Bearer' })),
      r('POST', '/auth/refresh', 200, j({ accessToken: 'eyJhbGciOiJIUzI1NiJ9.refreshed', expiresIn: 3600 })),
      r('POST', '/auth/logout',  200, j({ message: 'Logged out successfully' })),
      r('GET',  '/auth/me',      200, j({ id: 1, name: 'Alice Johnson', email: 'alice@example.com', permissions: ['read', 'write', 'delete'] })),
    ],
  },
  {
    id: 'products', name: 'Product Catalog', category: 'E-Commerce', tags: ['products', 'ecommerce', 'catalog'], routeCount: 5,
    description: 'E-commerce product listing, search, categories, and cart.',
    routes: [
      r('GET',  '/api/products',        200, j({ products: [{ id: 'prod_1', name: 'MacBook Pro 16"', price: 2499.00, inStock: true }, { id: 'prod_2', name: 'AirPods Pro', price: 249.00, inStock: false }], total: 2 })),
      r('GET',  '/api/products/:id',    200, j({ id: 'prod_1', name: 'MacBook Pro 16"', price: 2499.00, description: 'Most powerful MacBook Pro.' })),
      r('GET',  '/api/categories',      200, j({ categories: [{ id: 'electronics', name: 'Electronics', count: 142 }] })),
      r('POST', '/api/cart/items',       201, j({ cartId: 'cart_xyz', items: [{ productId: 'prod_1', quantity: 1, price: 2499.00 }], total: 2499.00 })),
      r('POST', '/api/orders',           201, j({ orderId: 'ord_abc123', status: 'pending', total: 2499.00 })),
    ],
  },
  {
    id: 'error-scenarios', name: 'Error Scenarios', category: 'Testing', tags: ['errors', '4xx', '5xx', 'rfc7807'], routeCount: 6,
    description: 'Common error responses in RFC 7807 Problem Details format.',
    routes: [
      r('GET', '/errors/400', 400, j({ type: 'https://tools.ietf.org/html/rfc7807', title: 'Bad Request',           status: 400, detail: 'Missing required fields.' })),
      r('GET', '/errors/401', 401, j({ type: 'https://tools.ietf.org/html/rfc7807', title: 'Unauthorized',          status: 401, detail: 'Authentication required.' })),
      r('GET', '/errors/403', 403, j({ type: 'https://tools.ietf.org/html/rfc7807', title: 'Forbidden',             status: 403, detail: 'Insufficient permissions.' })),
      r('GET', '/errors/404', 404, j({ type: 'https://tools.ietf.org/html/rfc7807', title: 'Not Found',             status: 404, detail: 'Resource not found.' })),
      r('GET', '/errors/429', 429, j({ type: 'https://tools.ietf.org/html/rfc7807', title: 'Too Many Requests',     status: 429, detail: 'Rate limit exceeded.' }), { 'Content-Type': 'application/json', 'Retry-After': '60' }),
      r('GET', '/errors/500', 500, j({ type: 'https://tools.ietf.org/html/rfc7807', title: 'Internal Server Error', status: 500, detail: 'Unexpected error.' })),
    ],
  },
  {
    id: 'health-checks', name: 'Health Checks', category: 'Infrastructure', tags: ['health', 'kubernetes', 'k8s', 'devops'], routeCount: 3,
    description: 'Standard health, readiness, and liveness endpoints for K8s / load balancers.',
    routes: [
      r('GET', '/health',       200, j({ status: 'ok', uptime: 99.99, version: '1.0.0' })),
      r('GET', '/health/ready', 200, j({ status: 'ready', checks: { database: 'ok', cache: 'ok' } })),
      r('GET', '/health/live',  200, j({ status: 'live' })),
    ],
  },
  {
    id: 'pagination', name: 'Paginated Lists', category: 'REST', tags: ['pagination', 'cursor', 'offset'], routeCount: 2,
    description: 'Offset and cursor pagination response shapes.',
    routes: [
      r('GET', '/api/items',        200, j({ data: [{ id: 1 }, { id: 2 }], pagination: { page: 1, perPage: 20, total: 100, hasNextPage: true } })),
      r('GET', '/api/items/cursor', 200, j({ data: [{ id: 1 }], cursor: { next: 'eyJpZCI6MX0', prev: null, hasMore: true } })),
    ],
  },
];

// ─── GraphQL catalog ──────────────────────────────────────────────────────────

const GQL_CATALOG: CatalogEntry[] = [
  {
    id: 'gql-users', name: 'Users API', category: 'Queries', tags: ['users', 'crud', 'auth'], routeCount: 0,
    description: 'User management schema with queries, mutations, and subscriptions.',
    routes: [],
    rawLabel: 'SDL',
    raw: `type Query {
  user(id: ID!): User
  users(page: Int, limit: Int): UserList!
  me: User
}

type Mutation {
  createUser(input: CreateUserInput!): User!
  updateUser(id: ID!, input: UpdateUserInput!): User!
  deleteUser(id: ID!): Boolean!
}

type Subscription {
  userCreated: User!
  userUpdated(id: ID!): User!
}

type User {
  id: ID!
  name: String!
  email: String!
  role: UserRole!
  createdAt: String!
  updatedAt: String!
}

type UserList {
  users: [User!]!
  total: Int!
  page: Int!
  hasNextPage: Boolean!
}

enum UserRole { ADMIN USER VIEWER }

input CreateUserInput { name: String! email: String! role: UserRole }
input UpdateUserInput { name: String email: String role: UserRole }`,
  },
  {
    id: 'gql-social', name: 'Social / Posts', category: 'Queries', tags: ['posts', 'comments', 'likes', 'social'], routeCount: 0,
    description: 'Blog / social feed schema: posts, comments, likes, follows.',
    routes: [],
    rawLabel: 'SDL',
    raw: `type Query {
  post(id: ID!): Post
  posts(authorId: ID, page: Int, limit: Int): PostList!
  feed(userId: ID!): [Post!]!
}

type Mutation {
  createPost(input: CreatePostInput!): Post!
  likePost(postId: ID!): Post!
  addComment(postId: ID!, text: String!): Comment!
  follow(userId: ID!): Boolean!
}

type Subscription {
  newPost(authorId: ID): Post!
  newComment(postId: ID!): Comment!
}

type Post {
  id: ID!
  title: String!
  body: String!
  author: User!
  likes: Int!
  comments: [Comment!]!
  createdAt: String!
}

type Comment { id: ID! text: String! author: User! createdAt: String! }
type User    { id: ID! name: String! username: String! }
type PostList { posts: [Post!]! total: Int! hasNextPage: Boolean! }

input CreatePostInput { title: String! body: String! tags: [String!] }`,
  },
  {
    id: 'gql-ecommerce', name: 'E-Commerce', category: 'E-Commerce', tags: ['products', 'cart', 'orders', 'ecommerce'], routeCount: 0,
    description: 'Product catalog, cart, and order management schema.',
    routes: [],
    rawLabel: 'SDL',
    raw: `type Query {
  product(id: ID!): Product
  products(category: String, page: Int): ProductList!
  cart(cartId: ID!): Cart
  order(id: ID!): Order
  orders(userId: ID!): [Order!]!
}

type Mutation {
  addToCart(productId: ID!, quantity: Int!): Cart!
  removeFromCart(cartId: ID!, itemId: ID!): Cart!
  checkout(cartId: ID!, paymentToken: String!): Order!
}

type Product { id: ID! name: String! price: Float! currency: String! inStock: Boolean! category: String! }
type ProductList { products: [Product!]! total: Int! }
type CartItem  { id: ID! product: Product! quantity: Int! subtotal: Float! }
type Cart      { id: ID! items: [CartItem!]! total: Float! itemCount: Int! }
type Order     { id: ID! status: OrderStatus! items: [CartItem!]! total: Float! createdAt: String! }
enum OrderStatus { PENDING PROCESSING SHIPPED DELIVERED CANCELLED }`,
  },
  {
    id: 'gql-github-like', name: 'GitHub-like', category: 'Developer', tags: ['repos', 'issues', 'prs', 'github'], routeCount: 0,
    description: 'Repository, issue, and pull request management schema.',
    routes: [],
    rawLabel: 'SDL',
    raw: `type Query {
  repository(owner: String!, name: String!): Repository
  issue(repoId: ID!, number: Int!): Issue
  pullRequest(repoId: ID!, number: Int!): PullRequest
  viewer: User!
}

type Mutation {
  createIssue(input: CreateIssueInput!): Issue!
  closeIssue(id: ID!): Issue!
  mergePullRequest(id: ID!): PullRequest!
  starRepository(id: ID!): Repository!
}

type User       { id: ID! login: String! name: String! email: String! avatarUrl: String! }
type Repository { id: ID! name: String! fullName: String! description: String isPrivate: Boolean! stars: Int! forks: Int! }
type Issue      { id: ID! number: Int! title: String! body: String! state: IssueState! author: User! }
type PullRequest { id: ID! number: Int! title: String! state: PRState! merged: Boolean! commits: Int! }

enum IssueState { OPEN CLOSED }
enum PRState    { OPEN CLOSED MERGED }

input CreateIssueInput { title: String! body: String! labels: [String!] }`,
  },
];

// ─── gRPC catalog ─────────────────────────────────────────────────────────────

const GRPC_CATALOG: CatalogEntry[] = [
  {
    id: 'proto-users', name: 'User Service', category: 'Services', tags: ['users', 'crud', 'auth'], routeCount: 0,
    description: 'User management gRPC service with CRUD operations and streaming.',
    routes: [],
    rawLabel: '.proto',
    raw: `syntax = "proto3";
package users.v1;
option go_package = "users/v1;usersv1";

service UserService {
  rpc GetUser    (GetUserRequest)    returns (User);
  rpc ListUsers  (ListUsersRequest)  returns (ListUsersResponse);
  rpc CreateUser (CreateUserRequest) returns (User);
  rpc UpdateUser (UpdateUserRequest) returns (User);
  rpc DeleteUser (DeleteUserRequest) returns (DeleteUserResponse);
  // Server streaming — push user updates to client
  rpc WatchUser  (WatchUserRequest)  returns (stream UserEvent);
}

message User {
  string id    = 1;
  string name  = 2;
  string email = 3;
  string role  = 4;
  int64  created_at = 5;
}

message GetUserRequest    { string id   = 1; }
message DeleteUserRequest { string id   = 1; }
message WatchUserRequest  { string id   = 1; }
message DeleteUserResponse { bool success = 1; }
message ListUsersRequest  { int32 page = 1; int32 limit = 2; string role_filter = 3; }
message ListUsersResponse { repeated User users = 1; int32 total = 2; bool has_next = 3; }
message CreateUserRequest { string name = 1; string email = 2; string role = 3; }
message UpdateUserRequest { string id = 1; string name = 2; string email = 3; }
message UserEvent { string type = 1; User user = 2; int64 ts = 3; }`,
  },
  {
    id: 'proto-products', name: 'Product Service', category: 'E-Commerce', tags: ['products', 'catalog', 'ecommerce'], routeCount: 0,
    description: 'Product catalog gRPC service with inventory and pricing.',
    routes: [],
    rawLabel: '.proto',
    raw: `syntax = "proto3";
package products.v1;

service ProductService {
  rpc GetProduct     (GetProductRequest)     returns (Product);
  rpc ListProducts   (ListProductsRequest)   returns (ListProductsResponse);
  rpc CreateProduct  (CreateProductRequest)  returns (Product);
  rpc UpdateProduct  (UpdateProductRequest)  returns (Product);
  rpc CheckInventory (InventoryRequest)      returns (InventoryResponse);
  // Bidirectional streaming for live price updates
  rpc PriceStream (stream PriceRequest) returns (stream PriceUpdate);
}

message Product {
  string id       = 1;
  string name     = 2;
  double price    = 3;
  string currency = 4;
  bool   in_stock = 5;
  string category = 6;
  int32  quantity = 7;
}

message GetProductRequest    { string id = 1; }
message ListProductsRequest  { string category = 1; int32 page = 2; int32 limit = 3; }
message ListProductsResponse { repeated Product products = 1; int32 total = 2; }
message CreateProductRequest { string name = 1; double price = 2; string currency = 3; string category = 4; }
message UpdateProductRequest { string id = 1; double price = 2; bool in_stock = 3; int32 quantity = 4; }
message InventoryRequest     { repeated string product_ids = 1; }
message InventoryResponse    { map<string, int32> stock = 1; }
message PriceRequest         { string product_id = 1; }
message PriceUpdate          { string product_id = 1; double price = 2; int64 ts = 3; }`,
  },
  {
    id: 'proto-auth', name: 'Auth Service', category: 'Auth', tags: ['auth', 'jwt', 'tokens'], routeCount: 0,
    description: 'Authentication and authorization gRPC service.',
    routes: [],
    rawLabel: '.proto',
    raw: `syntax = "proto3";
package auth.v1;

service AuthService {
  rpc Login         (LoginRequest)         returns (LoginResponse);
  rpc Logout        (LogoutRequest)        returns (LogoutResponse);
  rpc RefreshToken  (RefreshTokenRequest)  returns (RefreshTokenResponse);
  rpc ValidateToken (ValidateTokenRequest) returns (ValidateTokenResponse);
  rpc GetPermissions(GetPermissionsRequest) returns (GetPermissionsResponse);
}

message LoginRequest         { string email = 1; string password = 2; string device_id = 3; }
message LoginResponse        { string access_token = 1; string refresh_token = 2; int32 expires_in = 3; string token_type = 4; }
message LogoutRequest        { string access_token = 1; }
message LogoutResponse       { bool success = 1; }
message RefreshTokenRequest  { string refresh_token = 1; }
message RefreshTokenResponse { string access_token = 1; int32 expires_in = 2; }
message ValidateTokenRequest { string token = 1; }
message ValidateTokenResponse { bool valid = 1; string user_id = 2; string role = 3; int64 expires_at = 4; }
message GetPermissionsRequest { string user_id = 1; }
message GetPermissionsResponse { repeated string permissions = 1; string role = 2; }`,
  },
];

// ─── SOAP catalog ─────────────────────────────────────────────────────────────

const SOAP_CATALOG: CatalogEntry[] = [
  {
    id: 'wsdl-weather', name: 'Weather Service', category: 'Services', tags: ['weather', 'forecast', 'xml'], routeCount: 0,
    description: 'Classic weather WSDL — GetWeather and GetForecast operations.',
    routes: [],
    rawLabel: 'WSDL',
    raw: `<?xml version="1.0" encoding="UTF-8"?>
<definitions name="WeatherService"
  targetNamespace="http://mock.daakia.io/weather"
  xmlns="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://mock.daakia.io/weather"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema">

  <types>
    <xsd:schema targetNamespace="http://mock.daakia.io/weather">
      <xsd:element name="GetWeatherRequest">
        <xsd:complexType><xsd:sequence>
          <xsd:element name="city"    type="xsd:string"/>
          <xsd:element name="country" type="xsd:string" minOccurs="0"/>
        </xsd:sequence></xsd:complexType>
      </xsd:element>
      <xsd:element name="GetWeatherResponse">
        <xsd:complexType><xsd:sequence>
          <xsd:element name="city"        type="xsd:string"/>
          <xsd:element name="temperature" type="xsd:decimal"/>
          <xsd:element name="unit"        type="xsd:string"/>
          <xsd:element name="description" type="xsd:string"/>
          <xsd:element name="humidity"    type="xsd:int"/>
        </xsd:sequence></xsd:complexType>
      </xsd:element>
    </xsd:schema>
  </types>

  <message name="GetWeatherInput">  <part name="parameters" element="tns:GetWeatherRequest"/>  </message>
  <message name="GetWeatherOutput"> <part name="parameters" element="tns:GetWeatherResponse"/> </message>

  <portType name="WeatherPortType">
    <operation name="GetWeather">
      <input  message="tns:GetWeatherInput"/>
      <output message="tns:GetWeatherOutput"/>
    </operation>
  </portType>

  <binding name="WeatherBinding" type="tns:WeatherPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="GetWeather">
      <soap:operation soapAction="GetWeather"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>

  <service name="WeatherService">
    <port name="WeatherPort" binding="tns:WeatherBinding">
      <soap:address location="http://localhost:4000/weather"/>
    </port>
  </service>
</definitions>`,
  },
  {
    id: 'wsdl-currency', name: 'Currency Converter', category: 'Finance', tags: ['currency', 'forex', 'finance'], routeCount: 0,
    description: 'Currency conversion WSDL — ConvertCurrency and GetRates operations.',
    routes: [],
    rawLabel: 'WSDL',
    raw: `<?xml version="1.0" encoding="UTF-8"?>
<definitions name="CurrencyService"
  targetNamespace="http://mock.daakia.io/currency"
  xmlns="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://mock.daakia.io/currency"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema">

  <types>
    <xsd:schema targetNamespace="http://mock.daakia.io/currency">
      <xsd:element name="ConvertRequest">
        <xsd:complexType><xsd:sequence>
          <xsd:element name="amount"       type="xsd:decimal"/>
          <xsd:element name="fromCurrency" type="xsd:string"/>
          <xsd:element name="toCurrency"   type="xsd:string"/>
        </xsd:sequence></xsd:complexType>
      </xsd:element>
      <xsd:element name="ConvertResponse">
        <xsd:complexType><xsd:sequence>
          <xsd:element name="convertedAmount" type="xsd:decimal"/>
          <xsd:element name="rate"            type="xsd:decimal"/>
          <xsd:element name="timestamp"       type="xsd:string"/>
        </xsd:sequence></xsd:complexType>
      </xsd:element>
    </xsd:schema>
  </types>

  <message name="ConvertInput">  <part name="parameters" element="tns:ConvertRequest"/>  </message>
  <message name="ConvertOutput"> <part name="parameters" element="tns:ConvertResponse"/> </message>

  <portType name="CurrencyPortType">
    <operation name="ConvertCurrency">
      <input  message="tns:ConvertInput"/>
      <output message="tns:ConvertOutput"/>
    </operation>
  </portType>

  <binding name="CurrencyBinding" type="tns:CurrencyPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="ConvertCurrency">
      <soap:operation soapAction="ConvertCurrency"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>

  <service name="CurrencyService">
    <port name="CurrencyPort" binding="tns:CurrencyBinding">
      <soap:address location="http://localhost:4000/currency"/>
    </port>
  </service>
</definitions>`,
  },
];

// ─── Realtime catalog (shared for WS / SSE / SocketIO / MQTT) ─────────────────

function realtimeCatalog(protocol: string): CatalogEntry[] {
  const isWs = protocol === 'websocket' || protocol === 'socketio';
  const isMqtt = protocol === 'mqtt';
  const isSse = protocol === 'sse';

  return [
    {
      id: 'rt-chat', name: 'Chat Room', category: 'Messaging', tags: ['chat', 'rooms', 'realtime', 'messages'], routeCount: 0,
      description: `Chat room event definitions — join/leave rooms, send/receive messages, typing indicators.`,
      routes: [],
      rawLabel: 'Events',
      raw: JSON.stringify([
        { event: isMqtt ? 'chat/rooms/{roomId}/join' : 'room:join',    direction: 'client→server', payload: { roomId: 'string', username: 'string' } },
        { event: isMqtt ? 'chat/rooms/{roomId}/joined' : 'room:joined', direction: 'server→client', payload: { roomId: 'string', members: ['string'], memberCount: 'number' } },
        { event: isMqtt ? 'chat/rooms/{roomId}/message' : 'message:send', direction: 'client→server', payload: { roomId: 'string', text: 'string' } },
        { event: isMqtt ? 'chat/rooms/{roomId}/broadcast' : 'message:broadcast', direction: 'server→client', payload: { id: 'string', roomId: 'string', from: 'string', text: 'string', ts: 'number' } },
        { event: isMqtt ? 'chat/rooms/{roomId}/typing' : 'typing:start', direction: 'client→server', payload: { roomId: 'string' } },
        { event: isMqtt ? 'chat/rooms/{roomId}/typing-stop' : 'typing:stop', direction: 'client→server', payload: { roomId: 'string' } },
        { event: isMqtt ? 'chat/rooms/{roomId}/leave' : 'room:leave', direction: 'client→server', payload: { roomId: 'string' } },
      ], null, 2),
    },
    {
      id: 'rt-notifications', name: 'Notifications', category: 'Infrastructure', tags: ['notifications', 'alerts', 'push'], routeCount: 0,
      description: `Push notification event definitions — subscribe to channels, receive typed alerts.`,
      routes: [],
      rawLabel: 'Events',
      raw: JSON.stringify([
        { event: isMqtt ? 'notifications/{userId}/subscribe' : 'notifications:subscribe', direction: 'client→server', payload: { userId: 'string', channels: ['string'] } },
        { event: isMqtt ? 'notifications/{userId}/new' : 'notification:new', direction: 'server→client', payload: { id: 'string', type: 'info|warning|error|success', title: 'string', body: 'string', ts: 'number' } },
        { event: isMqtt ? 'notifications/{userId}/read' : 'notification:read', direction: 'client→server', payload: { notificationId: 'string' } },
        { event: isMqtt ? 'notifications/{userId}/clear' : 'notifications:clear', direction: 'client→server', payload: {} },
      ], null, 2),
    },
    {
      id: 'rt-iot', name: isMqtt ? 'IoT Sensors' : 'Live Telemetry', category: 'IoT', tags: ['iot', 'sensors', 'telemetry', 'devices'], routeCount: 0,
      description: isMqtt
        ? 'MQTT topic patterns for IoT device telemetry, commands, and status updates.'
        : 'Realtime device/sensor telemetry event stream.',
      routes: [],
      rawLabel: 'Events',
      raw: JSON.stringify([
        { event: isMqtt ? 'devices/{deviceId}/telemetry' : 'telemetry:update', direction: 'server→client', payload: { deviceId: 'string', temperature: 'number', humidity: 'number', battery: 'number', ts: 'number' } },
        { event: isMqtt ? 'devices/{deviceId}/status' : 'device:status', direction: 'server→client', payload: { deviceId: 'string', online: 'boolean', lastSeen: 'string' } },
        { event: isMqtt ? 'devices/{deviceId}/command' : 'device:command', direction: 'client→server', payload: { deviceId: 'string', command: 'reboot|reset|ping', params: 'object' } },
        { event: isMqtt ? 'devices/{deviceId}/ack' : 'device:ack', direction: 'server→client', payload: { deviceId: 'string', command: 'string', success: 'boolean' } },
        { event: isMqtt ? 'alerts/{zone}/threshold' : 'alert:threshold', direction: 'server→client', payload: { deviceId: 'string', metric: 'string', value: 'number', threshold: 'number', severity: 'warning|critical' } },
      ], null, 2),
    },
    ...(isSse ? [{
      id: 'sse-progress', name: 'Progress Stream', category: 'UX', tags: ['progress', 'upload', 'jobs', 'sse'], routeCount: 0,
      description: 'SSE events for long-running job progress reporting.',
      routes: [] as MockRoute[],
      rawLabel: 'Events',
      raw: JSON.stringify([
        { event: 'job:started',   direction: 'server→client', payload: { jobId: 'string', total: 'number', description: 'string' } },
        { event: 'job:progress',  direction: 'server→client', payload: { jobId: 'string', current: 'number', total: 'number', percent: 'number', message: 'string' } },
        { event: 'job:completed', direction: 'server→client', payload: { jobId: 'string', result: 'object', durationMs: 'number' } },
        { event: 'job:failed',    direction: 'server→client', payload: { jobId: 'string', error: 'string', code: 'string' } },
      ], null, 2),
    }] : []),
    ...(isWs ? [{
      id: 'ws-collab', name: 'Collaborative Editing', category: 'Collaboration', tags: ['crdt', 'collab', 'yjs', 'editing'], routeCount: 0,
      description: 'Operational-transform / CRDT-style collaborative editing events.',
      routes: [] as MockRoute[],
      rawLabel: 'Events',
      raw: JSON.stringify([
        { event: 'doc:join',      direction: 'client→server', payload: { docId: 'string', userId: 'string' } },
        { event: 'doc:state',     direction: 'server→client', payload: { docId: 'string', content: 'string', version: 'number', collaborators: ['string'] } },
        { event: 'doc:operation', direction: 'client→server', payload: { docId: 'string', op: 'insert|delete|retain', pos: 'number', text: 'string', version: 'number' } },
        { event: 'doc:patch',     direction: 'server→client', payload: { docId: 'string', op: 'insert|delete|retain', pos: 'number', text: 'string', version: 'number', author: 'string' } },
        { event: 'cursor:move',   direction: 'client→server', payload: { docId: 'string', pos: 'number', userId: 'string' } },
        { event: 'cursor:update', direction: 'server→client', payload: { userId: 'string', pos: 'number', color: 'string' } },
      ], null, 2),
    }] : []),
  ];
}

// ─── Catalog selector ──────────────────────────────────────────────────────────

function getCatalog(protocol: string): CatalogEntry[] {
  if (protocol === 'graphql') return GQL_CATALOG;
  if (protocol === 'grpc')    return GRPC_CATALOG;
  if (protocol === 'soap')    return SOAP_CATALOG;
  if (['websocket', 'sse', 'socketio', 'mqtt'].includes(protocol)) return realtimeCatalog(protocol);
  return REST_CATALOG;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MockApiCatalog({ protocol = 'rest', onAddRoutes }: Props) {
  const catalog = getCatalog(protocol);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [added, setAdded] = useState<Set<string>>(new Set());

  const categories = ['all', ...Array.from(new Set(catalog.map(c => c.category)))];
  const filtered = catalog.filter(c => {
    const matchCat  = category === 'all' || c.category === category;
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.tags.some(t => t.includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  const add = (entry: CatalogEntry) => {
    const routes = entry.routes.map(r => ({ ...r, id: crypto.randomUUID() }));
    onAddRoutes(routes, entry.raw);
    setAdded(prev => new Set([...prev, entry.id]));
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Search + filter */}
      <div className="flex items-center gap-2">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…"
          className="flex-1 h-[30px] px-3 text-[11px] rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none" />
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {categories.map(cat => (
          <button key={cat} type="button" onClick={() => setCategory(cat)}
            className="h-[22px] px-2.5 text-[10px] rounded-full cursor-pointer capitalize transition-colors"
            style={{
              background: category === cat ? `color-mix(in srgb, ${MOCK_ACCENT} 15%, transparent)` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${category === cat ? `color-mix(in srgb, ${MOCK_ACCENT} 30%, transparent)` : 'rgba(255,255,255,0.08)'}`,
              color: category === cat ? MOCK_ACCENT : 'var(--color-text-muted)',
            }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-2">
        {filtered.map(entry => (
          <CatalogCard key={entry.id} entry={entry} added={added.has(entry.id)} onAdd={() => add(entry)} />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-2 py-8 text-center text-[11px] text-[var(--color-text-muted)] opacity-50">No templates match your search.</p>
        )}
      </div>
    </div>
  );
}

function CatalogCard({ entry, added, onAdd }: { entry: CatalogEntry; added: boolean; onAdd: () => void }) {
  const itemLabel = entry.rawLabel
    ? `${entry.rawLabel} template`
    : `${entry.routeCount} route${entry.routeCount !== 1 ? 's' : ''}`;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)] transition-colors bg-[rgba(255,255,255,0.02)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[12px] font-medium text-[var(--color-text-primary)]">{entry.name}</p>
          <p className="text-[9px] text-[var(--color-text-muted)] mt-0.5">{itemLabel} · {entry.category}</p>
        </div>
        <button type="button" onClick={onAdd} disabled={added}
          className="flex items-center gap-1 h-[22px] px-2 text-[10px] rounded cursor-pointer disabled:opacity-50 flex-shrink-0"
          style={{
            background: added ? 'rgba(34,197,94,0.12)' : `color-mix(in srgb, ${MOCK_ACCENT} 12%, transparent)`,
            border: `1px solid ${added ? 'rgba(34,197,94,0.25)' : `color-mix(in srgb, ${MOCK_ACCENT} 25%, transparent)`}`,
            color: added ? 'var(--color-success)' : MOCK_ACCENT,
          }}>
          {added ? '✓ Added' : <><PlusIcon size={9} /> Add</>}
        </button>
      </div>
      <p className="text-[10px] text-[var(--color-text-muted)] opacity-70 leading-relaxed">{entry.description}</p>
      <div className="flex flex-wrap gap-1">
        {entry.tags.map(t => (
          <span key={t} className="text-[8px] px-1.5 py-0.5 rounded-full bg-[rgba(255,255,255,0.05)] text-[var(--color-text-muted)]">{t}</span>
        ))}
      </div>
    </div>
  );
}
