/**
 * GraphQL mock server sample schemas + operations.
 * Each sample provides an SDL schema and 3 mock operations.
 */

export interface GraphQLSample {
  id: string;
  label: string;
  description: string;
  schema: string;
  operations: Array<{
    operationType: 'query' | 'mutation' | 'subscription';
    operationName: string;
    response: string;
  }>;
}

export const GRAPHQL_SAMPLES: GraphQLSample[] = [
  {
    id: 'countries',
    label: 'Countries API',
    description: 'Geographic data API with countries, continents, and languages',
    schema: `type Query {
  countries: [Country!]!
  country(code: ID!): Country
  continents: [Continent!]!
}

type Country {
  code: ID!
  name: String!
  capital: String
  currency: String
  continent: Continent!
  languages: [Language!]!
}

type Continent {
  code: ID!
  name: String!
  countries: [Country!]!
}

type Language {
  code: ID!
  name: String!
}`,
    operations: [
      { operationType: 'query', operationName: 'countries', response: '{\n  "data": {\n    "countries": [\n      { "code": "US", "name": "United States", "capital": "Washington D.C.", "currency": "USD" },\n      { "code": "GB", "name": "United Kingdom", "capital": "London", "currency": "GBP" },\n      { "code": "JP", "name": "Japan", "capital": "Tokyo", "currency": "JPY" }\n    ]\n  }\n}' },
      { operationType: 'query', operationName: 'country', response: '{\n  "data": {\n    "country": {\n      "code": "US",\n      "name": "United States",\n      "capital": "Washington D.C.",\n      "currency": "USD",\n      "continent": { "code": "NA", "name": "North America" },\n      "languages": [{ "code": "en", "name": "English" }]\n    }\n  }\n}' },
      { operationType: 'query', operationName: 'continents', response: '{\n  "data": {\n    "continents": [\n      { "code": "NA", "name": "North America" },\n      { "code": "EU", "name": "Europe" },\n      { "code": "AS", "name": "Asia" }\n    ]\n  }\n}' },
    ],
  },
  {
    id: 'ecommerce',
    label: 'E-Commerce Store',
    description: 'Shopping platform with products, cart management, and checkout',
    schema: `type Query {
  products(limit: Int, offset: Int): [Product!]!
  product(id: ID!): Product
  cart(userId: ID!): Cart
}

type Mutation {
  addToCart(userId: ID!, productId: ID!, quantity: Int!): Cart!
  removeFromCart(userId: ID!, itemId: ID!): Cart!
  checkout(userId: ID!): Order!
}

type Product {
  id: ID!
  name: String!
  price: Float!
  description: String
  category: String!
  inStock: Boolean!
  imageUrl: String
}

type Cart {
  id: ID!
  items: [CartItem!]!
  total: Float!
}

type CartItem {
  id: ID!
  product: Product!
  quantity: Int!
}

type Order {
  id: ID!
  items: [CartItem!]!
  total: Float!
  status: String!
  createdAt: String!
}`,
    operations: [
      { operationType: 'query', operationName: 'products', response: '{\n  "data": {\n    "products": [\n      { "id": "1", "name": "Wireless Headphones", "price": 79.99, "category": "Electronics", "inStock": true },\n      { "id": "2", "name": "Running Shoes", "price": 129.99, "category": "Sports", "inStock": true },\n      { "id": "3", "name": "Coffee Maker", "price": 49.99, "category": "Kitchen", "inStock": false }\n    ]\n  }\n}' },
      { operationType: 'mutation', operationName: 'addToCart', response: '{\n  "data": {\n    "addToCart": {\n      "id": "cart-001",\n      "items": [{ "id": "item-1", "product": { "id": "1", "name": "Wireless Headphones" }, "quantity": 1 }],\n      "total": 79.99\n    }\n  }\n}' },
      { operationType: 'mutation', operationName: 'checkout', response: '{\n  "data": {\n    "checkout": {\n      "id": "order-001",\n      "total": 209.98,\n      "status": "CONFIRMED",\n      "createdAt": "2026-05-21T18:00:00Z"\n    }\n  }\n}' },
    ],
  },
  {
    id: 'social-media',
    label: 'Social Media',
    description: 'Social platform with posts, followers, and real-time subscriptions',
    schema: `type Query {
  me: User!
  user(id: ID!): User
  feed(limit: Int): [Post!]!
}

type Mutation {
  createPost(content: String!, mediaUrl: String): Post!
  likePost(postId: ID!): Post!
  followUser(userId: ID!): User!
}

type Subscription {
  newPost: Post!
}

type User {
  id: ID!
  username: String!
  displayName: String!
  avatar: String
  bio: String
  followers: Int!
  following: Int!
  posts: [Post!]!
}

type Post {
  id: ID!
  author: User!
  content: String!
  mediaUrl: String
  likes: Int!
  comments: Int!
  createdAt: String!
}`,
    operations: [
      { operationType: 'query', operationName: 'feed', response: '{\n  "data": {\n    "feed": [\n      { "id": "p1", "content": "Just shipped a new feature!", "likes": 42, "comments": 8, "author": { "username": "devuser", "displayName": "Dev User" } },\n      { "id": "p2", "content": "Beautiful sunset today", "likes": 128, "comments": 15, "author": { "username": "photog", "displayName": "Photo Pro" } }\n    ]\n  }\n}' },
      { operationType: 'mutation', operationName: 'createPost', response: '{\n  "data": {\n    "createPost": {\n      "id": "p-new",\n      "content": "Hello World!",\n      "likes": 0,\n      "comments": 0,\n      "createdAt": "2026-05-21T18:00:00Z"\n    }\n  }\n}' },
      { operationType: 'subscription', operationName: 'newPost', response: '{\n  "data": {\n    "newPost": {\n      "id": "p-live",\n      "content": "Live update from subscription!",\n      "author": { "username": "realtime", "displayName": "Real Time" },\n      "likes": 0\n    }\n  }\n}' },
    ],
  },
  {
    id: 'blog',
    label: 'Blog / CMS',
    description: 'Content management with posts, categories, tags, and drafts',
    schema: `type Query {
  posts(status: PostStatus, limit: Int): [Post!]!
  post(slug: String!): Post
  categories: [Category!]!
  tags: [Tag!]!
}

type Mutation {
  createPost(input: CreatePostInput!): Post!
  updatePost(id: ID!, input: UpdatePostInput!): Post!
  deletePost(id: ID!): Boolean!
}

input CreatePostInput {
  title: String!
  body: String!
  categoryId: ID!
  tags: [ID!]
}

input UpdatePostInput {
  title: String
  body: String
  status: PostStatus
}

enum PostStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

type Post {
  id: ID!
  title: String!
  slug: String!
  body: String!
  status: PostStatus!
  author: Author!
  category: Category!
  tags: [Tag!]!
  publishedAt: String
  createdAt: String!
}

type Author {
  id: ID!
  name: String!
  email: String!
}

type Category {
  id: ID!
  name: String!
  slug: String!
}

type Tag {
  id: ID!
  name: String!
}`,
    operations: [
      { operationType: 'query', operationName: 'posts', response: '{\n  "data": {\n    "posts": [\n      { "id": "1", "title": "Getting Started with GraphQL", "slug": "getting-started-graphql", "status": "PUBLISHED", "author": { "name": "Jane Doe" } },\n      { "id": "2", "title": "Advanced TypeScript Patterns", "slug": "advanced-typescript", "status": "PUBLISHED", "author": { "name": "John Smith" } }\n    ]\n  }\n}' },
      { operationType: 'mutation', operationName: 'createPost', response: '{\n  "data": {\n    "createPost": {\n      "id": "3",\n      "title": "New Post",\n      "slug": "new-post",\n      "status": "DRAFT",\n      "createdAt": "2026-05-21T18:00:00Z"\n    }\n  }\n}' },
      { operationType: 'query', operationName: 'categories', response: '{\n  "data": {\n    "categories": [\n      { "id": "1", "name": "Technology", "slug": "technology" },\n      { "id": "2", "name": "Design", "slug": "design" },\n      { "id": "3", "name": "Business", "slug": "business" }\n    ]\n  }\n}' },
    ],
  },
  {
    id: 'todo-app',
    label: 'Todo App',
    description: 'Task management with CRUD operations and completion tracking',
    schema: `type Query {
  todos(filter: TodoFilter): [Todo!]!
  todo(id: ID!): Todo
}

type Mutation {
  createTodo(title: String!, priority: Priority): Todo!
  updateTodo(id: ID!, title: String, completed: Boolean, priority: Priority): Todo!
  deleteTodo(id: ID!): Boolean!
}

enum Priority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

enum TodoFilter {
  ALL
  ACTIVE
  COMPLETED
}

type Todo {
  id: ID!
  title: String!
  completed: Boolean!
  priority: Priority!
  createdAt: String!
  completedAt: String
}`,
    operations: [
      { operationType: 'query', operationName: 'todos', response: '{\n  "data": {\n    "todos": [\n      { "id": "1", "title": "Buy groceries", "completed": false, "priority": "MEDIUM" },\n      { "id": "2", "title": "Write tests", "completed": true, "priority": "HIGH" },\n      { "id": "3", "title": "Deploy to production", "completed": false, "priority": "URGENT" }\n    ]\n  }\n}' },
      { operationType: 'mutation', operationName: 'createTodo', response: '{\n  "data": {\n    "createTodo": {\n      "id": "4",\n      "title": "New task",\n      "completed": false,\n      "priority": "LOW",\n      "createdAt": "2026-05-21T18:00:00Z"\n    }\n  }\n}' },
      { operationType: 'mutation', operationName: 'updateTodo', response: '{\n  "data": {\n    "updateTodo": {\n      "id": "1",\n      "title": "Buy groceries",\n      "completed": true,\n      "priority": "MEDIUM",\n      "completedAt": "2026-05-21T18:30:00Z"\n    }\n  }\n}' },
    ],
  },
  {
    id: 'chat-app',
    label: 'Chat / Messaging',
    description: 'Real-time messaging with rooms, messages, and online status',
    schema: `type Query {
  conversations: [Conversation!]!
  messages(conversationId: ID!, limit: Int): [Message!]!
}

type Mutation {
  sendMessage(conversationId: ID!, content: String!): Message!
  createConversation(participantIds: [ID!]!): Conversation!
  markAsRead(conversationId: ID!): Boolean!
}

type Subscription {
  messageReceived(conversationId: ID!): Message!
  typingIndicator(conversationId: ID!): TypingEvent!
}

type Conversation {
  id: ID!
  participants: [User!]!
  lastMessage: Message
  unreadCount: Int!
  updatedAt: String!
}

type Message {
  id: ID!
  sender: User!
  content: String!
  createdAt: String!
  readBy: [User!]!
}

type User {
  id: ID!
  name: String!
  avatar: String
  online: Boolean!
}

type TypingEvent {
  user: User!
  isTyping: Boolean!
}`,
    operations: [
      { operationType: 'query', operationName: 'conversations', response: '{\n  "data": {\n    "conversations": [\n      { "id": "c1", "participants": [{ "name": "Alice" }, { "name": "Bob" }], "unreadCount": 3, "lastMessage": { "content": "See you tomorrow!" } },\n      { "id": "c2", "participants": [{ "name": "Charlie" }], "unreadCount": 0, "lastMessage": { "content": "Got it, thanks!" } }\n    ]\n  }\n}' },
      { operationType: 'mutation', operationName: 'sendMessage', response: '{\n  "data": {\n    "sendMessage": {\n      "id": "msg-new",\n      "content": "Hello there!",\n      "sender": { "name": "You" },\n      "createdAt": "2026-05-21T18:00:00Z"\n    }\n  }\n}' },
      { operationType: 'subscription', operationName: 'messageReceived', response: '{\n  "data": {\n    "messageReceived": {\n      "id": "msg-live",\n      "content": "Hey! How are you?",\n      "sender": { "name": "Alice", "online": true },\n      "createdAt": "2026-05-21T18:01:00Z"\n    }\n  }\n}' },
    ],
  },
  {
    id: 'github-like',
    label: 'GitHub-like API',
    description: 'Source code platform with repos, issues, PRs, and CI status',
    schema: `type Query {
  repository(owner: String!, name: String!): Repository
  viewer: User!
  search(query: String!, type: SearchType!): SearchResult!
}

type Mutation {
  createIssue(repoId: ID!, title: String!, body: String): Issue!
  createPullRequest(repoId: ID!, title: String!, head: String!, base: String!): PullRequest!
  starRepository(repoId: ID!): Repository!
}

enum SearchType {
  REPOSITORY
  USER
  ISSUE
}

type Repository {
  id: ID!
  name: String!
  fullName: String!
  description: String
  stars: Int!
  forks: Int!
  language: String
  issues(state: String): [Issue!]!
}

type Issue {
  id: ID!
  number: Int!
  title: String!
  body: String
  state: String!
  author: User!
  labels: [String!]!
  createdAt: String!
}

type PullRequest {
  id: ID!
  number: Int!
  title: String!
  state: String!
  merged: Boolean!
  author: User!
}

type User {
  id: ID!
  login: String!
  name: String
  avatarUrl: String
  repositories: [Repository!]!
}

type SearchResult {
  totalCount: Int!
  nodes: [Repository!]!
}`,
    operations: [
      { operationType: 'query', operationName: 'repository', response: '{\n  "data": {\n    "repository": {\n      "id": "repo-1",\n      "name": "daakia",\n      "fullName": "user/daakia",\n      "description": "API client for VS Code",\n      "stars": 1250,\n      "forks": 89,\n      "language": "TypeScript"\n    }\n  }\n}' },
      { operationType: 'mutation', operationName: 'createIssue', response: '{\n  "data": {\n    "createIssue": {\n      "id": "issue-1",\n      "number": 42,\n      "title": "Bug: Mock server crash",\n      "state": "OPEN",\n      "labels": ["bug", "priority:high"],\n      "createdAt": "2026-05-21T18:00:00Z"\n    }\n  }\n}' },
      { operationType: 'query', operationName: 'search', response: '{\n  "data": {\n    "search": {\n      "totalCount": 3,\n      "nodes": [\n        { "name": "react", "stars": 200000, "language": "JavaScript" },\n        { "name": "next.js", "stars": 110000, "language": "TypeScript" }\n      ]\n    }\n  }\n}' },
    ],
  },
  {
    id: 'weather',
    label: 'Weather Service',
    description: 'Weather API with current conditions, forecasts, and alerts',
    schema: `type Query {
  weather(city: String!): Weather!
  forecast(city: String!, days: Int): [Forecast!]!
  cities(query: String!): [City!]!
}

type Weather {
  city: String!
  temperature: Float!
  feelsLike: Float!
  humidity: Int!
  windSpeed: Float!
  condition: String!
  icon: String!
  updatedAt: String!
}

type Forecast {
  date: String!
  high: Float!
  low: Float!
  condition: String!
  precipitation: Float!
}

type City {
  name: String!
  country: String!
  lat: Float!
  lon: Float!
}`,
    operations: [
      { operationType: 'query', operationName: 'weather', response: '{\n  "data": {\n    "weather": {\n      "city": "New York",\n      "temperature": 72.5,\n      "feelsLike": 75.0,\n      "humidity": 65,\n      "windSpeed": 8.5,\n      "condition": "Partly Cloudy",\n      "icon": "partly-cloudy"\n    }\n  }\n}' },
      { operationType: 'query', operationName: 'forecast', response: '{\n  "data": {\n    "forecast": [\n      { "date": "2026-05-22", "high": 78, "low": 62, "condition": "Sunny", "precipitation": 0 },\n      { "date": "2026-05-23", "high": 75, "low": 60, "condition": "Cloudy", "precipitation": 30 },\n      { "date": "2026-05-24", "high": 68, "low": 55, "condition": "Rain", "precipitation": 80 }\n    ]\n  }\n}' },
      { operationType: 'query', operationName: 'cities', response: '{\n  "data": {\n    "cities": [\n      { "name": "New York", "country": "US", "lat": 40.7128, "lon": -74.006 },\n      { "name": "London", "country": "GB", "lat": 51.5074, "lon": -0.1278 }\n    ]\n  }\n}' },
    ],
  },
  {
    id: 'music-streaming',
    label: 'Music Streaming',
    description: 'Music platform with playlists, tracks, artists, and playback',
    schema: `type Query {
  playlists: [Playlist!]!
  playlist(id: ID!): Playlist
  search(query: String!): SearchResults!
  nowPlaying: Track
}

type Mutation {
  createPlaylist(name: String!): Playlist!
  addTrackToPlaylist(playlistId: ID!, trackId: ID!): Playlist!
  play(trackId: ID!): PlaybackState!
  pause: PlaybackState!
}

type Track {
  id: ID!
  title: String!
  artist: Artist!
  album: Album!
  duration: Int!
  coverUrl: String
}

type Artist {
  id: ID!
  name: String!
  genres: [String!]!
}

type Album {
  id: ID!
  title: String!
  year: Int!
  tracks: [Track!]!
}

type Playlist {
  id: ID!
  name: String!
  tracks: [Track!]!
  trackCount: Int!
  duration: Int!
}

type SearchResults {
  tracks: [Track!]!
  artists: [Artist!]!
  albums: [Album!]!
}

type PlaybackState {
  isPlaying: Boolean!
  track: Track
  progress: Int!
}`,
    operations: [
      { operationType: 'query', operationName: 'playlists', response: '{\n  "data": {\n    "playlists": [\n      { "id": "pl-1", "name": "Chill Vibes", "trackCount": 25, "duration": 5400 },\n      { "id": "pl-2", "name": "Workout Mix", "trackCount": 18, "duration": 3600 },\n      { "id": "pl-3", "name": "Focus Mode", "trackCount": 30, "duration": 7200 }\n    ]\n  }\n}' },
      { operationType: 'query', operationName: 'search', response: '{\n  "data": {\n    "search": {\n      "tracks": [{ "id": "t1", "title": "Bohemian Rhapsody", "artist": { "name": "Queen" }, "duration": 354 }],\n      "artists": [{ "id": "a1", "name": "Queen", "genres": ["Rock"] }],\n      "albums": [{ "id": "al1", "title": "A Night at the Opera", "year": 1975 }]\n    }\n  }\n}' },
      { operationType: 'mutation', operationName: 'play', response: '{\n  "data": {\n    "play": {\n      "isPlaying": true,\n      "track": { "id": "t1", "title": "Bohemian Rhapsody", "artist": { "name": "Queen" }, "duration": 354 },\n      "progress": 0\n    }\n  }\n}' },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics Dashboard',
    description: 'Business analytics with metrics, events, and dashboard data',
    schema: `type Query {
  dashboard(dateRange: DateRange!): DashboardData!
  events(type: String, limit: Int): [Event!]!
  topPages(limit: Int): [PageView!]!
}

input DateRange {
  start: String!
  end: String!
}

type DashboardData {
  totalVisitors: Int!
  pageViews: Int!
  bounceRate: Float!
  avgSessionDuration: Float!
  visitorsByDay: [DayMetric!]!
  topReferrers: [Referrer!]!
}

type DayMetric {
  date: String!
  visitors: Int!
  pageViews: Int!
}

type Referrer {
  source: String!
  visitors: Int!
  percentage: Float!
}

type Event {
  id: ID!
  type: String!
  userId: String
  metadata: String
  createdAt: String!
}

type PageView {
  path: String!
  views: Int!
  uniqueVisitors: Int!
  avgTime: Float!
}`,
    operations: [
      { operationType: 'query', operationName: 'dashboard', response: '{\n  "data": {\n    "dashboard": {\n      "totalVisitors": 12450,\n      "pageViews": 45230,\n      "bounceRate": 34.5,\n      "avgSessionDuration": 185.3,\n      "visitorsByDay": [\n        { "date": "2026-05-19", "visitors": 4200, "pageViews": 15000 },\n        { "date": "2026-05-20", "visitors": 4100, "pageViews": 14800 },\n        { "date": "2026-05-21", "visitors": 4150, "pageViews": 15430 }\n      ]\n    }\n  }\n}' },
      { operationType: 'query', operationName: 'topPages', response: '{\n  "data": {\n    "topPages": [\n      { "path": "/", "views": 8500, "uniqueVisitors": 6200, "avgTime": 45.2 },\n      { "path": "/docs", "views": 5200, "uniqueVisitors": 3800, "avgTime": 120.5 },\n      { "path": "/pricing", "views": 3100, "uniqueVisitors": 2900, "avgTime": 65.0 }\n    ]\n  }\n}' },
      { operationType: 'query', operationName: 'events', response: '{\n  "data": {\n    "events": [\n      { "id": "e1", "type": "page_view", "userId": "u-123", "createdAt": "2026-05-21T17:55:00Z" },\n      { "id": "e2", "type": "button_click", "userId": "u-456", "metadata": "{\\"button\\": \\"signup\\"}", "createdAt": "2026-05-21T17:56:00Z" }\n    ]\n  }\n}' },
    ],
  },
];
