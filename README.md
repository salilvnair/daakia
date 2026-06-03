# Daakia — API Development Platform for VS Code

<p align="center">
  <img src="images/daakia-icon.png" alt="Daakia" width="128" height="128" />
</p>

> **Daakia** (*डाकिया*, "The Messenger") — A powerful, multi-protocol API client built as a
> first-class VS Code extension. Think **Postman + Insomnia + Bruno**, but living inside your
> editor with deep AI integration, script debugging, mock servers, and support for 6+ protocols.

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-1.99%2B-blue?logo=visualstudiocode)](https://marketplace.visualstudio.com/)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript)](https://www.typescriptlang.org/)

---

## Table of Contents

- [Supported Protocols](#supported-protocols)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Build Commands](#build-commands)
- [Protocol Details](#protocol-details)
  - [REST API](#rest-api)
  - [GraphQL](#graphql)
  - [gRPC](#grpc)
  - [SOAP](#soap)
  - [WebSocket / Realtime](#websocket--realtime)
  - [MCP Client](#mcp-client)
- [Mock Server](#mock-server)
- [Scripts & Debugger](#scripts--debugger)
- [Settings](#settings)
- [AI Panel](#ai-panel)
- [Developer Tools](#developer-tools)
- [Tech Stack](#tech-stack)
- [Design Principles](#design-principles)
- [Development Roadmap](#development-roadmap)
- [License](#license)

---

## Supported Protocols

Daakia is a **multi-protocol** API client. Each protocol has its own execution engine,
UI panels, sidebar context, and store state. Switch between protocols using the
**left icon rail** — everything updates instantly.

| Protocol | Icon Color | Execution Engine | Status |
|----------|-----------|-----------------|--------|
| **REST** | Indigo `#6366f1` | Axios (extension host) | ✅ Complete |
| **GraphQL** | Pink `#E535AB` | HTTP POST + WebSocket (subscriptions) | ✅ Complete |
| **gRPC** | Blue `#3b82f6` | `@grpc/grpc-js` + proto-loader | ✅ Complete |
| **SOAP** | Coral `#f97316` | `soap` + WSDL parser | ✅ Complete |
| **WebSocket** | Green `#3c790a` | `ws` (Node.js) | ✅ Complete |
| **SSE** | Teal `#14b8a6` | Axios streaming | ✅ Complete |
| **Socket.IO** | Amber `#f59e0b` | `socket.io-client` | ✅ Complete |
| **MQTT** | Purple `#a855f7` | `mqtt` + Aedes broker (mock) | ✅ Complete |
| **AI** | Purple `#8b5cf6` | LLM providers (OpenAI, Anthropic, Google, Ollama, Groq, etc.) | ✅ Complete |
| **MCP** | Cyan `#06b6d4` | Custom MCP stdio/HTTP transport | ✅ Complete |

---

## UI Layout

Daakia's interface is organized into three main zones:

```
 ┌──────────┬───────────────────────────────────────┬──────────────┐
 │  LEFT    │          MAIN CONTENT AREA            │    RIGHT     │
 │ SIDEBAR  │  ┌─────────────────────────────────┐  │   SIDEBAR    │
 │          │  │ Tab Bar (drag-drop, ctx menu)   │  │              │
 │ REST ●   │  ├─────────────────────────────────┤  │ Collections  │
 │ GQL  ●   │  │ URL Bar (per-protocol, per-tab) │  │ History      │
 │ RT   ●   │  ├─────────────────────────────────┤  │ Environments │
 │ gRPC ●   │  │ Request Config (top)            │  │              │
 │ SOAP ●   │  │ ─── draggable splitter ───      │  │              │
 │ AI   ●   │  │ Response/Conversation (bottom)  │  │              │
 │ MCP  ●   │  └─────────────────────────────────┘  │              │
 │          │                                       │              │
 │ ──────── │                                       │ ──────────   │
 │ Mock  ●  │                                       │ Settings ⚙   │
 │ Dev   ●  │                                       │              │
 └──────────┴───────────────────────────────────────┴──────────────┘
```

### Left Protocol Rail (7 Protocols + Tools)

| Icon | Protocol | Accent Color | Description |
|------|----------|-------------|-------------|
| 🟣 | **REST** | `#6366f1` (Indigo) | Default protocol — HTTP request builder |
| 🩷 | **GraphQL** | `#E535AB` (Pink) | Schema-aware query/mutation/subscription |
| 🟢 | **Realtime** | `#3c790a` (Green) | WebSocket + SSE + Socket.IO + MQTT |
| 🔵 | **gRPC** | `#3b82f6` (Blue) | Proto file management + RPC invocation |
| 🟠 | **SOAP** | `#f97316` (Coral) | WSDL parsing + envelope editing |
| 🟣 | **AI** | `#8b5cf6` (Purple) | Multi-provider LLM chat + tool calling |
| 🩵 | **MCP** | `#06b6d4` (Cyan) | MCP server testing (stdio + HTTP) |
| 🟡 | **Mock Server** | Yellow | Multi-protocol mock server management |
| ⚙️ | **DevTools** | Protocol accent | Console, Network, Timeline, Performance |

Each protocol icon highlights when active with a glow background in its accent color.
The scrollbar thumb color and key UI accents automatically match the active protocol.

### Tab Bar
- **Tabs per protocol**: REST, GraphQL, gRPC, SOAP, WebSocket, AI, MCP
- **Special tabs**: Settings, Mock Server
- **Drag-and-drop reorder**, right-click context menu (Close, Close Others, Close to Right)
- **Dirty indicator**: Orange dot when unsaved changes exist
- **Per-tab environment selector**: Choose which environment variables apply to each tab
- **Loading spinner**: Animated spinner during request execution or AI streaming

### Resizable Split Panels
- **Vertical splitter** between request config (top) and response/conversation (bottom)
- **Pill-grip handle**: Drag to resize, double-click to reset to 50/50
- **Focused panel**: Click top or bottom to snap to 70/30 or 25/75
- Split position is **persisted per protocol** across sessions

### Right Sidebar (Context-Aware)
- **REST / GraphQL / SOAP**: Collections, History, Environments
- **WebSocket / Realtime / AI / MCP**: No sidebar panels
- **Settings gear** always available at bottom
- Sidebar panels slide in/out with animated transitions
- Sidebar width is resizable and persisted

---

## Key Features

### Request Builder
- **Full HTTP method support**: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- **Request config tabs**: Params, Headers, Body, Auth, Variables, Scripts (pre-request + post-response)
- **Body modes**: JSON, XML, HTML, Text, JavaScript, form-data (with file upload), URL-encoded, binary, GraphQL
- **Auth types**: None, Bearer Token, Basic Auth, API Key, OAuth 2.0 (all grant types + PKCE), AWS Signature
- **Variable substitution**: `{{variable}}` and `${variable}` syntax with layered resolution (request → env → collection → global)
- **Variable highlighting**: Indigo-tinted tokens in URL, header, and body inputs

### Response Viewer
- **Body views**: Pretty-printed JSON, Raw text, Preview (HTML/image)
- **Response tabs**: Body, Headers, Cookies (with domain/path/expires), Test Results, Timeline
- **Status badge**: Color-coded (green 2xx, yellow 3xx, red 4xx/5xx)
- **Timeline**: Total time visualization + DNS/connect/TLS/first-byte breakdown
- **Search**: Find-in-response across all views

### Collections & Environments
- **Nested folders**: Recursive tree with drag-and-drop reorder, hover actions, expand/collapse
- **Collection-level**: Variables, auth (inherited by child requests), pre-request/test scripts
- **Environments**: Create/edit/delete, global variables, secret type (masked with `***`)
- **Variable resolution engine**: Request vars > Env vars > Collection vars > Global vars
- **Collection runner**: Execute all requests in sequence with delay, stop-on-error, progress tracking
- **Import**: Postman Collection v2.1, OpenAPI/Swagger 3.x + 2.x, HAR (HTTP Archive), Bruno `.bru` files
- **Export**: Daakia JSON, Postman-compatible JSON, OpenAPI spec

### Request History
- Auto-saved on every send with full response body
- Search, replay to new tab, clear history
- Configurable max entries (default: 500)

### Code Generation
- **12 languages**: cURL, JavaScript (fetch + axios), Python (requests), Go (net/http), Java (HttpClient), C# (HttpClient), PHP (cURL), Ruby (Net::HTTP), wget
- **Line numbers + syntax highlighting**: Via Monaco editor
- **Copy to clipboard**: One-click copy
- **Generate from any request**: Click "Show Code" in the Send dropdown

### Import Formats
- **cURL**: Paste a cURL command → auto-populated request tab
- **Postman Collection v2.1**: Full folder + request hierarchy
- **OpenAPI/Swagger**: 3.x & 2.x (YAML or JSON) → collections with paths as folders
- **HAR**: HTTP Archive files grouped by domain
- **Bruno**: Parse `.bru` files and folder structure

---

## Architecture

### Extension Host ↔ Webview Communication

```
┌────────────────────────── VS Code Extension Host ──────────────────────────┐
│                                                                             │
│  extension.ts ──► MainPanel.ts ──► postMessage ──► React Webview           │
│       │                  │                                                   │
│       ▼                  ▼                                                   │
│  ┌─────────┐    ┌───────────────┐    ┌──────────────┐    ┌───────────┐    │
│  │ SQLite  │    │ HTTP Executor │    │ Mock Server   │    │ AI Exec.  │    │
│  │ (sql.js)│    │   (Axios)     │    │  (Express)    │    │ (Copilot) │    │
│  └─────────┘    └───────────────┘    └──────────────┘    └───────────┘    │
│                                                                             │
│  Message Handlers (5 modules):                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ REST     │ │ GraphQL  │ │ gRPC     │ │ SOAP     │ │ Realtime │        │
│  │ Handler  │ │ Handler  │ │ Handler  │ │ Handler  │ │ Handler  │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────── Webview UI (React 19) ────────────────────────────┐
│                                                                             │
│  App.tsx                                                                    │
│  ├── Left Protocol Rail (REST | GraphQL | WebSocket | SSE | Socket.IO ...) │
│  ├── TabBar (tabs-store.ts — Zustand)                                      │
│  ├── URL Bar (per-protocol)                                                │
│  ├── Main Content Area (per-protocol panels)                               │
│  │   ├── REST: UrlBar + RequestConfig + ResponsePanel                      │
│  │   ├── GraphQL: GraphQLPanel + SchemaPanel + Response                    │
│  │   ├── gRPC: ProtoManager + MethodSelector + RequestConfig               │
│  │   ├── SOAP: WsdlBrowser + OperationSelector + EnvelopeEditor            │
│  │   ├── WebSocket: ConnectionPanel + MessageLog + Composer                │
│  │   └── MCP: McpUrlBar + RequestTabs + ResponsePanel                      │
│  └── Right Sidebar (context-aware, per-protocol)                           │
│                                                                             │
│  Zustand Stores (11): tabs, collections, env, toast, sidebar, debug,       │
│                       devtools, ui-state, url-suggestions, ai-providers,    │
│                       mock                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Storage

All persistent data lives in a single SQLite file at `~/.salilvnair/daakia-vsce/db/daakia.db`, using **sql.js** (SQLite compiled to WASM). This means:
- **No native addons** — works on all platforms without compilation
- **Graceful degradation** — if SQLite fails to load, the UI shows a Rebuild button
- **Tables**: collections, folders, requests, environments, environment_variables, global_variables, history, cookies, mock_servers, mock_routes, mock_logs, settings, audit_log

---

## Getting Started

### Prerequisites
- **VS Code** `^1.99.0`
- **Node.js** 20+ (use `nvm use 22`)

### Install from VSIX (Manual)

```bash
# 1. Build the project
npm run build:all

# 2. Package into .vsix
npm run vscode:package

# 3. Install in VS Code
code --install-extension daakia-1.0.0.vsix
```

### Development

```bash
# Install dependencies
nvm use 22
npm install

# Build everything
npm run build:all

# Watch mode (auto-rebuild extension)
npm run watch

# Dev webview server (hot reload for UI)
npm run dev:webview

# Run extension in VS Code debugger
# Press F5 → Extension Development Host window opens
```

---

## Build Commands

| Command | Description |
|---------|-------------|
| `npm run build:all` | Build extension (esbuild) + webview (Vite) |
| `npm run build:ext` | Build extension only |
| `npm run build:webview` | Build webview only |
| `npm run watch` | Watch mode for extension |
| `npm run dev:webview` | Vite dev server for webview (hot reload) |
| `npm run vscode:package` | Package into `.vsix` file |
| `npm run vscode:publish` | Publish to VS Code Marketplace |
| `npm run vscode:publish:patch` | Bump patch version + publish |
| `npm run lint` | ESLint on `src/` |
| `npm run backup` | Create backup zip |

---

## Protocol Details

### REST API

The flagship protocol. Full Postman-compatible request builder with every feature you'd expect.

**Request Builder:**
- Method selector + URL bar with method-colored badge
- Config tabs: Params, Headers, Body, Auth, Variables, Scripts (Pre-request & Post-response)
- Body sub-tabs: none, JSON, XML, Text, HTML, JavaScript, form-data, URL-encoded, binary, GraphQL
- SplitButton Send: Send, Send & Download, Import cURL, Show Code, Clear All
- SplitButton Save: Save (in-place), Save As (tree-browser modal)

**Response Viewer:**
- Body views: Pretty JSON (code-folded), Raw text, Preview
- Headers table with search
- Cookies table: name, value, domain, path, expires, httpOnly, secure
- Test Results table: assertion name, status (pass/fail), error message
- Timeline: waterfall-style DNS → Connect → TLS → Request → Response timing

**Sidebar (REST):**
- **Collections**: Recursive tree with folders, drag-drop, hover actions (run/add/edit/delete), search
- **History**: Chronological list, search by URL/method, replay to new tab
- **Environments**: Create/edit/delete, variable table with secret toggle, global variables

### GraphQL

Schema-aware GraphQL client with introspection and auto-complete.

**Features:**
- Query/Mutation editor with syntax highlighting (Monaco)
- Variables and Headers panels
- **Schema introspection**: Connect to endpoint → auto-discover types, queries, mutations, subscriptions
- **Schema Explorer** sidebar: Browse types, fields, arguments, enums
- **Auto-complete**: Type-aware suggestions from introspected schema
- **Subscriptions**: Live WebSocket-based subscription viewer
- **Query tabs**: Multiple named queries per request
- Query prettification and formatting
- Separate collections and history from REST

### gRPC

Full gRPC client with proto file management and reflection support.

**Features:**
- **Proto Manager**: Import `.proto` files, browse services and methods
- **Method Selector**: Dropdown of all available RPC methods
- **Request Config**: JSON message body editor with Monaco
- **Metadata**: Custom gRPC metadata pairs
- **Server Reflection**: Auto-discover services from gRPC reflection endpoint
- **Response Panel**: JSON response viewer with status/error details
- **Deadline**: Configurable timeout per request
- **Sample protos**: Built-in sample `.proto` files for testing

### SOAP

Enterprise-grade SOAP client with WSDL parsing and WS-Security support.

**Features:**
- **WSDL Browser**: Import WSDL by URL or file → auto-discover operations
- **Operation Selector**: Dropdown of all available SOAP operations
- **Envelope Editor**: XML body with syntax highlighting (Monaco)
- **Form Editor**: Key-value input for each operation parameter
- **Head ers Editor**: Custom SOAP headers (WS-Security, custom namespaces)
- **Attachments**: MTOM and SwA attachment support
- **Assertions**: Response assertions for SOAP body content
- **SOAPUI Import**: Import existing SOAPUI projects
- **WS-Security**: Username Token, Timestamp, Signature support

### WebSocket / Realtime

Unified realtime client supporting 4 sub-protocols.

**WebSocket:**
- Connect with custom headers and sub-protocols
- Send/receive text and binary messages
- Message log with timestamps and direction indicators (↑ sent / ↓ received)
- Auto-reconnect with exponential backoff
- Connection status indicator (connected/disconnected/connecting/error)

**SSE (Server-Sent Events):**
- Connect to SSE endpoint
- Real-time event stream with type filtering
- Event log with ID, type, data, and timestamp
- Auto-reconnect on connection loss

**Socket.IO:**
- Connect to Socket.IO endpoints with namespace support
- Send and listen to custom events
- Event log with event name, payload, direction

**MQTT:**
- Connect to MQTT brokers with client options
- Subscribe to topics with QoS levels (0, 1, 2)
- Publish messages to topics with retain flag
- Message log with topic, payload, QoS

### MCP Client

Model Context Protocol client for testing and debugging MCP servers.

**Features:**
- **Connect**: stdio (subprocess) or HTTP transport
- **Tool Browser**: List and invoke MCP tools with custom parameters
- **Resource Browser**: List and read MCP resources
- **Prompt Browser**: List and execute MCP prompts
- **Response Panel**: JSON response viewer with syntax highlighting
- **Request Tabs**: Params, Headers, Body configuration

---

## Mock Server

Daakia includes a full-featured **multi-protocol mock server** — create realistic API
mocks that run locally inside VS Code.

**Supported Protocols:**
| Protocol | Mock Engine |
|----------|------------|
| HTTP/REST | Express.js with path matching, delay, variable responses |
| GraphQL | Custom GraphQL mock with schema-based response generation |
| gRPC | gRPC mock server with `.proto`-defined services |
| SOAP | SOAP mock with WSDL-based operation responses |
| WebSocket | WS mock with configurable message patterns |
| SSE | SSE mock with configurable event streams |
| Socket.IO | Socket.IO mock with namespace + event routing |
| MQTT | Aedes MQTT broker mock |

**Mock Features:**
- Create from scratch or use built-in **OAuth Sample** template
- Per-route configuration: method, path, status code, headers, response body
- Delay simulation (add artificial latency)
- Response templates with random data generation
- Start/stop individual mock servers
- **Request logger**: See all incoming requests with method, path, headers, body, timestamp
- Multiple mock servers can run simultaneously on different ports
- "Generate with AI" buttons (ready for Sprint 4 AI integration)

---

## Scripts & Debugger

Daakia includes a **VS Code-style JavaScript debugger** inside the webview — set
breakpoints, step through code, inspect variables, hover for values, all without
leaving your API client.

### Script Types

| Script | When It Runs | Use For |
|--------|-------------|---------|
| **Pre-request** | Before the HTTP request is sent | Set variables, generate timestamps, compute auth tokens, abort requests |
| **Post-response** | After the response is received | Assertions, extract data to env vars, chain requests |
| **Collection-level** | Inherited by all requests in a collection | Shared setup/teardown, common auth headers |

### Script API (`dk.*`)

Scripts run in a **sandboxed Node.js `vm` context** with access to the `dk` global:

**Environment & Variables:**
- `dk.env.set(name, value)` — Set environment variable (persisted)
- `dk.env.get(name)` — Read variable from any scope (env → collection → global)
- `dk.env.secret(name, value)` — Store secret (masked as `***` in UI and logs)
- `dk.globals.set(name, value)` / `dk.globals.get(name)` — Global variable scope

**Request & Response:**
- `dk.request` — Read-only: `.method`, `.url`, `.headers`, `.body`
- `dk.response` — Post-response only: `.status`, `.headers`, `.body`, `.time`, `.json()`
- `dk.sendRequest({ method, url, headers, body })` — Make sub-requests from scripts

**Test Assertions:**
- `dk.test(name, fn)` — Define a test case
- `dk.expect(value).toBe(expected)` / `.not.toBe()` / `.toContain()` / `.toBeLessThan()` / `.toBeGreaterThan()` / `.toHaveProperty()`

**Utilities:**
- `dk.console.log/warn/error(...)` — Log to DevTools Console tab
- `dk.crypto.md5/sha1/sha256/hmac/base64/uuid()` — Crypto helpers
- `dk.oauth` — OAuth2 token management

### Debugger Features

**Breakpoints:**
- Click line numbers in the gutter to toggle breakpoints (red dot appears)
- Multiple breakpoints can be set across both pre-request and post-response scripts
- Breakpoints persist per-request (saved with the request)
- Toggle individual breakpoints on/off from the Run & Debug sidebar panel
- Remove all breakpoints with confirmation dialog

**Debug Controls (HUD Toolbar):**
- Pill-shaped toolbar appears at **top center** when execution pauses
- Semi-transparent backdrop blur, protocol-accented border
- Buttons: ▶ Continue, ⤿ Step Over, ↓ Step Into, ↑ Step Out, ↻ Restart, ■ Stop
- **Draggable**: Grab the dotted grip handle to reposition horizontally
- HUD resets to default center position on each new debug session

**Variable Inspection:**
- **Run & Debug sidebar panel** (bug icon in left rail):
  - **VARIABLES**: Tree view of all in-scope variables, expandable objects/arrays
  - **WATCH**: Add custom expressions (e.g., `user.name`, `numbers.length`), evaluated live
  - **CALL STACK**: Current execution frame
  - **BREAKPOINTS**: List all breakpoints with file/line, enable/disable toggle, remove all
- **Variable hover**: While paused, hover any variable in the editor to see its current value in a tooltip (type + value)
- **Yellow highlight**: Current execution line is highlighted yellow with a small arrow in the gutter

**Debug Flow:**
- Debug mode **auto-activates** when any breakpoint is set — no separate "debug" button needed
- `debugger;` statement in scripts also triggers a pause
- **Step Over** skips function internals (calls complete, you stay on the next line)
- **Continue** runs to the next breakpoint or to completion
- **Stop** immediately terminates execution (HUD disappears, yellow highlight clears)
- Editor is **read-only** while debugging (prevents accidental edits mid-session)
- Runtime errors during debug (e.g., null property access) end the session and show the error in Console

**Test Results:**
- Appear in the Response panel's **Tests** tab
- Each result row: assertion name, green check (passed) or red ✕ (failed), error detail on failure
- Badge count shows `N passed` / `N failed`
- Tests run even without breakpoints — debugging is optional

### Script Examples

**Pre-request: Set a timestamp variable**
```javascript
const ts = new Date().toISOString();
dk.env.set('requestTime', ts);
console.log('Request timestamp:', ts);
```

**Pre-request: Auto-login + store token (sub-request)**
```javascript
const login = dk.sendRequest({
  method: 'POST',
  url: 'https://api.example.com/auth/login',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'auto', password: 'pass123' })
});
const token = login.json().access_token;
dk.env.set('auth_token', token);
```

**Post-response: Assertions + extract data**
```javascript
dk.test('Status is 200', () => {
  dk.expect(dk.response.status).toBe(200);
});

dk.test('Response time OK', () => {
  dk.expect(dk.response.time).toBeLessThan(5000);
});

const body = dk.response.json();
dk.env.set('userId', body.user.id);
```

**Pre-request: Abort on condition**
```javascript
if (!dk.env.get('auth_token')) {
  throw new Error('No auth token — aborting request');
}
// Request is NOT sent when pre-request script throws
```

---

## Settings

Daakia's Settings panel provides centralized configuration across 5 sections:

### General
- **Follow Redirects**: Toggle automatic HTTP 3xx redirect following
- **SSL Certificate Verification**: Toggle SSL/TLS certificate validation
- **Save Response in History**: Store response body + headers in history entries
- **Request Timeout**: Maximum wait time in milliseconds (default: 30000)
- **Max History Entries**: Auto-delete oldest entries above this limit (default: 500)

### Encoding
- Request/response character encoding configuration

### Proxy
- HTTP/HTTPS proxy host, port, and authentication
- Bypass list for hosts that should skip the proxy (e.g., `localhost, 127.0.0.1, *.internal.com`)

### LLM Provider
- Enable/disable individual AI providers
- Configure API keys per provider (stored securely)
- Set custom base URLs for self-hosted or compatible endpoints
- Per-provider model enable/disable toggles

### Mock Server
- Default port range for mock servers
- Auto-start behavior

---

## Developer Tools

Daakia's **DevTools panel** provides deep observability into every request, script
execution, and system metric. Toggle it from the left rail (bottom icon).

### Console Tab
- **Script logs**: All `dk.console.log/warn/error` output with timestamps
- **Error traces**: Full stack traces from script failures
- **Runtime messages**: Request lifecycle events, connection status changes
- **REPL**: Interactive JavaScript evaluation against the live script sandbox —
  test expressions, query variables, prototype snippets without modifying scripts
- Collapsible log groups, copy-to-clipboard, clear all

### Network Tab
- **Request list** (left panel): Table with METHOD, STATUS, URL, DURATION, SIZE columns
  - Method badges color-coded: GET green, POST yellow, PUT blue, DELETE red, PATCH purple
  - Status badges color-coded: 2xx green, 3xx blue, 4xx orange, 5xx red, 0/error red
  - gRPC status: 0 = green OK, non-zero = red error with gRPC status code
  - Click any row to see full details
- **Detail panel** (right): Three sub-tabs per selected request
  - **Request**: Method, full URL, request headers table with copy buttons, request body
  - **Response**: Status code, status text, response headers table, response body
  - **Network Logs**: Expandable timeline of request/response events with timestamps,
    method badges, status badges, protocol badges (REST/gRPC/SOAP/GraphQL)
- **Protocol coverage**: All protocols — REST, GraphQL, gRPC, SOAP, AI, MCP

### Timeline Tab
- Chronological event log of all activity across the session
- Each entry shows: timestamp, event type (request/response/error/script/connection),
  protocol badge, method, URL, status, duration

### Performance Tab
- **Real-time metrics**:
  - Heap Used / Heap Total (with progress bar)
  - RSS (Resident Set Size)
  - External Memory
  - Array Buffers
  - CPU Usage %
  - System Uptime
- Auto-refreshes every 2 seconds while the tab is open

### Debug Snapshot
- One-click copy of complete diagnostic JSON including:
  - SQLite database status and file path
  - All audit log entries
  - Extension version and VS Code version
  - System information (OS, arch, Node version, Electron version)

### DB Explorer
- Browse all SQLite tables in a tree view
- Select any table to view rows in a paginated table
- View row count, column names, and data types
- Delete individual rows
- Expand JSON columns inline

---

## AI Panel

Daakia includes a **fully functional AI chat panel** — an LLM playground built directly
into your API client. Configure prompts, define tools, connect to any provider, and
have multi-turn conversations with streaming responses.

**URL Bar:**
- **Provider selector**: Dropdown of all enabled LLM providers
- **Model selector**: Per-provider model list, filtered by enabled models
- **Auto-initialization**: Fresh AI tabs auto-select the first enabled provider + model
- **Send button**: Submits the conversation with current user prompt + system messages
- **Loading indicator**: Animated spinning dots during streaming responses

**Config Tabs (5 tabs with PillTabs UI):**

| Tab | Description |
|-----|-------------|
| **Prompt** | System prompts (multi-card, add/remove) + user prompt textarea |
| **Authorization** | Shared AuthEditor — Bearer Token, Basic Auth, API Key, OAuth 2.0 |
| **Tools** | Define function tools the AI can call: name, description, JSON Schema parameters |
| **MCP** | Connect to MCP servers for additional tools/resources/prompts |
| **Settings** | Temperature (0–2), max tokens, top_p, frequency/presence penalty, stream toggle, stop sequences, seed, response format (text/JSON) |

**Conversation Panel (bottom half):**
- **Message bubbles**: User (purple, right-aligned) / Assistant (gray, left-aligned) / Tool responses (border, JSON viewer)
- **Role labels + timestamps**: Each message shows role, time, and token usage badge
- **Tool call cards**: Expandable cards showing function name + arguments (JSON)
- **Auto-scroll**: Automatically scrolls to latest message
- **Streaming indicator**: "AI is thinking..." with animated pulsing dots
- **Clear conversation**: Trash button in header to reset conversation

**Supported LLM Providers (7 built-in):**

| Provider | Models |
|----------|--------|
| **OpenAI** | GPT-5.4, GPT-5.4 Mini, GPT-5.4 Nano, GPT-5.3 Codex, GPT-4.1, GPT-4o, o3 Pro, o4 Mini |
| **Anthropic** | Claude Opus 4.8, Claude Sonnet 4.6, Claude 3.7 Sonnet, Claude 3.5 Haiku |
| **Google AI** | Gemini 2.5 Pro/Flash, Gemini 2.0 Flash, Gemini 1.5 Pro |
| **Ollama (Local)** | Llama 3.3, Qwen 2.5, DeepSeek R1, Mistral, Code Llama |
| **Groq** | Compound Beta, Llama 4 Maverick/Scout, Llama 3.3 70B, Qwen 3 32B, Kimi K2 |
| **Together AI** | Llama 3.1 405B, Llama 3.1 70B, DeepSeek R1 |
| **Mistral AI** | Mistral Large, Mistral Small, Codestral, Ministral |

Plus **Custom Provider** support for any OpenAI-compatible API (LM Studio, Azure, self-hosted, etc.).

**Coming in Sprint 4:**
- `@daakia` Chat Participant in VS Code Copilot Chat
- 10 specialized agents (REST, SOAP, Mock, Test Script, cURL, FAQ, GraphQL, Documentation, Security, XSD2Request)
- Inline AI actions: "Ask AI why" on errors, AI response explainer, AI body/header generators
- SSE bridge for real-time streaming from extension host to webview

---

## Developer Tools

**Built-in DevTools panel**:

| Tab | Description |
|-----|-------------|
| **Console** | Script execution logs, error traces, runtime messages |
| **Network** | Request/response timing waterfall, DNS/TCP/TLS breakdown |
| **Timeline** | Chronological event log with metadata columns |
| **Performance** | Real-time metrics: heap used/total, RSS, external memory, CPU %, uptime |
| **Debug Snapshot** | Copy raw diagnostic JSON — DB status, audit entries, versions, system info |
| **DB Explorer** | Browse all SQLite tables — view rows, select, delete, row count, JSON expand |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Extension Host** | TypeScript 5.7, VS Code Extension API | Backend execution, DB, message routing |
| **Bundler (ext)** | esbuild | Fast TypeScript → JS bundling |
| **Webview UI** | React 19 + TypeScript | Component-based UI rendering |
| **Bundler (webview)** | Vite 6 | Dev server + production build |
| **Styling** | Tailwind CSS v4 + CSS custom properties | Indigo-themed design system |
| **State** | Zustand 5 | Lightweight, hook-based state management |
| **Code Editor** | Monaco Editor (self-hosted) | Syntax highlighting for all body types |
| **Storage** | sql.js (SQLite WASM) | No native addons, cross-platform DB |
| **HTTP Client** | Axios | All HTTP/S request execution |
| **gRPC** | `@grpc/grpc-js` + `@grpc/proto-loader` | gRPC client + proto file loading |
| **SOAP** | `soap` + `fast-xml-parser` | SOAP client + XML parsing |
| **WebSocket** | `ws` | WebSocket connections from extension host |
| **Socket.IO** | `socket.io-client` | Socket.IO client |
| **MQTT** | `mqtt` + `aedes` | MQTT client + broker (for mock) |
| **Protobuf** | `protobufjs` | Protocol Buffer parsing |
| **Mock Server** | Express.js | HTTP/REST mock server |
| **Path Matching** | `path-to-regexp` | URL pattern matching for mocks |
| **YAML** | `js-yaml` | OpenAPI/Swagger YAML parsing |
| **UUID** | `uuid` | Unique ID generation |

---

## Design Principles

1. **No hardcoded colors** — All colors via CSS variables or `daakia-colors.ts`. Never hex values in TSX.
2. **No inline SVGs** — All icons in `daakia-icons.tsx`. Import from `../../icons`.
3. **No native `<select>`** — Always use `StyledDropdown` with floating menu + keyboard nav.
4. **No backdrop-close modals** — Only X button or Cancel/Close buttons dismiss modals.
5. **No browser right-click menu** — Globally disabled; use custom `ContextMenu` component.
6. **Protocol separation** — Each protocol is self-contained (own panels, sidebar, stores, execution).
7. **Confirm all destructive actions** — Use `ConfirmDialog` component, no inline confirmations.
8. **Stable scrollbars** — All scrollable areas use `overflow-y-auto [scrollbar-gutter:stable]`.
9. **Help icons** — Always use shared `InfoPopup` component (title + description + code badges + wiki link).
10. **postMessage bridge** — All extension ↔ webview communication through typed message handlers.

---

## Development Roadmap

| Sprint | Status | Focus |
|--------|--------|-------|
| **Sprint 1** | ✅ Complete | Foundation: Extension scaffold, webview UI, SQLite, HTTP executor, mock server, response panel, tab system, URL bar, request config, Monaco editor, sidebar |
| **Sprint 2** | ✅ Complete | Request Builder: SplitButton, SaveAsModal, nested collections, code generation (12 languages), cURL import, collection runner, environments persistence, variable substitution |
| **Sprint 3** | ✅ Complete | Advanced: Collection variables/auth/scripts, OAuth2, variable resolution engine, Postman/OpenAPI/HAR/Bruno import, script execution engine, cookie jar, timeline, MainPanel refactor |
| **Sprint 5** | ✅ Complete | Multi-protocol: gRPC, WebSocket/SSE/Socket.IO/MQTT, protocol rail restructure, script debugger, DevTools panel |
| **Sprint 6** | ✅ Complete | SOAP protocol, MCP client, multi-protocol mock servers |
| **Sprint 7** | ✅ Complete | Settings panel (General/Encoding/Proxy/LLM/Mock), DevTools (Console/Network/Timeline/Performance/Snapshot/DB Explorer), Run & Debug sidebar |
| **Sprint 4** | 🔄 Partial | AI Panel complete (multi-provider chat + tool calling + streaming). Remaining: `@daakia` Chat Participant, 10 specialized agents, SSE bridge, inline AI actions |

---

## License

MIT © 2026 [salilvnair](https://github.com/salilvnair)

---

<p align="center">
  <sub>Built with ❤️ for the VS Code community</sub>
</p>
