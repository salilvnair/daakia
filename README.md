# Daakia — API Development Platform for VS Code

![Daakia](images/daakia-icon.png)

> **Daakia** (*डाकिया*, "The Messenger") — A multi-protocol API client built as a
> first-class VS Code extension. Think **Postman + Insomnia + Bruno**, but living inside your
> editor — REST, GraphQL, gRPC, SOAP, WebSocket/SSE/Socket.IO/MQTT, and MCP, with a stateful
> mock server, a script debugger, an in-app documentation wiki, and 20+ AI-powered tools.

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-1.99%2B-blue?logo=visualstudiocode)](https://marketplace.visualstudio.com/)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript)](https://www.typescriptlang.org/)

![Daakia demo — REST, GraphQL, gRPC, SOAP, WebSocket, MCP, Mock Server, Collections, History, Environments, DevTools, and Settings](https://raw.githubusercontent.com/salilvnair/daakia/main/media/daakia-showcase.gif)

---

## Table of Contents

- [Supported Protocols](#supported-protocols)
- [UI Layout](#ui-layout)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Protocol Details](#protocol-details)
  - [REST API](#rest-api)
  - [GraphQL](#graphql)
  - [gRPC](#grpc)
  - [SOAP](#soap)
  - [WebSocket / Realtime](#websocket--realtime)
  - [MCP Client](#mcp-client)
- [Mock Server — Stateful, Multi-Protocol](#mock-server--stateful-multi-protocol)
- [Scripts & Debugger](#scripts--debugger)
- [AI Assistant](#ai-assistant)
- [AI Power Tools](#ai-power-tools)
- [Command Palette](#command-palette)
- [Wiki — In-App Documentation](#wiki--in-app-documentation)
- [Settings](#settings)
- [Developer Tools](#developer-tools)
- [Import / Export](#import--export)
- [Collection Sync (git-native)](#collection-sync-git-native)
- [Tech Stack](#tech-stack)
- [Design Principles](#design-principles)
- [Contributing / Local Development](#contributing--local-development)
- [License](#license)

---

## Supported Protocols

Daakia is a **multi-protocol** API client. Each protocol has its own execution engine,
UI panels, sidebar context, and store state. Switch between protocols using the
**left icon rail** — everything updates instantly.

| Protocol | Execution Engine | Status |
|----------|-----------------|--------|
| **REST** | Axios (extension host) | ✅ |
| **GraphQL** | HTTP POST + WebSocket (subscriptions), schema introspection | ✅ |
| **gRPC** | `@grpc/grpc-js` + proto-loader, server reflection | ✅ |
| **SOAP** | `soap` + WSDL parser, WS-Security | ✅ |
| **WebSocket** | `ws` (Node.js), auto-reconnect | ✅ |
| **SSE** | Axios streaming | ✅ |
| **Socket.IO** | `socket.io-client` | ✅ |
| **MQTT** | `mqtt` + Aedes broker (for mocking) | ✅ |
| **MCP** (Model Context Protocol) | Custom stdio + HTTP/SSE transport | ✅ |
| **AI** | 13 LLM providers, tool calling, streaming | ✅ |

---

## UI Layout

```
 ┌──────────┬───────────────────────────────────────┬──────────────┐
 │  LEFT    │          MAIN CONTENT AREA            │    RIGHT     │
 │ SIDEBAR  │  ┌─────────────────────────────────┐  │   SIDEBAR    │
 │          │  │ Tab Bar (drag-drop, ctx menu)   │  │              │
 │ REST     │  ├─────────────────────────────────┤  │ Collections  │
 │ GraphQL  │  │ URL Bar (per-protocol, per-tab) │  │ History      │
 │ RealTime │  ├─────────────────────────────────┤  │ Environments │
 │ gRPC     │  │ Request Config (top)            │  │              │
 │ SOAP     │  │ ─── draggable splitter ───      │  │              │
 │ AI       │  │ Response/Conversation (bottom)  │  │              │
 │ MCP      │  └─────────────────────────────────┘  │              │
 │          │                                       │              │
 │ ──────── │                                       │ ──────────   │
 │ Mock     │                                       │ Settings ⚙   │
 │ DevTools │                                       │              │
 └──────────┴───────────────────────────────────────┴──────────────┘
```

- **Left protocol rail** — one icon per protocol plus Mock Server and DevTools; each
  glows in its own accent color when active, and key UI accents (scrollbar thumb,
  focus rings) follow the active protocol.
- **Tab bar** — per-protocol tabs with drag-and-drop reorder, a right-click context
  menu (Close / Close Others / Close to Right), a dirty-state dot, and a per-tab
  environment selector.
- **Resizable split panels** — request config (top) and response/conversation (bottom),
  with a draggable pill-grip handle; the split position persists per protocol.
- **Right sidebar** — Collections, History, and Environments for REST/GraphQL/SOAP;
  the Settings gear is always available at the bottom.
- The global **Command Palette** (`Cmd/Ctrl+K`) reaches almost everything below without
  touching the mouse — see [Command Palette](#command-palette).

---

## Key Features

### Request Builder
- **Full HTTP method support**: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- **Request config tabs**: Params, Headers, Body, Auth, Variables, Scripts (pre-request + post-response)
- **Body modes**: JSON, XML, HTML, Text, JavaScript, form-data (with file upload), URL-encoded, binary, GraphQL
- **Auth types**: None, Bearer Token, Basic Auth, API Key, OAuth 2.0 (all grant types + PKCE), AWS Signature
- **Variable substitution**: `{{variable}}` and `${variable}` syntax with layered resolution (request → env → collection → global)

### Response Viewer
- **Body views**: Pretty-printed JSON, Raw text, Preview (HTML/image)
- **Response tabs**: Body, Headers, Cookies, Test Results, Timeline
- **Timeline**: DNS/connect/TLS/first-byte breakdown
- **Search**: Ctrl+F inside the response panel opens Monaco's built-in find widget
- **Large responses**: bodies over 512 KB are truncated for display with a warning banner; the full file is always saved to disk

### Collections & Environments
- **Nested folders**: recursive tree, drag-and-drop reorder, hover actions, search
- **Collection-level**: variables, auth (inherited by child requests), pre-request/test scripts
- **Environments**: create/edit/delete, global variables, secret values masked with `***`
- **Variable resolution**: request vars → env vars → collection vars → global vars
- **Collection runner**: execute every request in sequence with delay, stop-on-error, progress tracking

### Request History
- Auto-saved on every send with the full response body
- Search, replay to a new tab, clear history
- Configurable max entries (default: 500)

### Code Generation
- 12 target snippets: cURL, JavaScript (fetch + axios), Python (requests), Go (net/http),
  Java (HttpClient), C# (HttpClient), PHP (cURL), Ruby (Net::HTTP), wget — generated from
  the Send dropdown's "Show Code"

---

## Architecture

### Extension Host ↔ Webview Communication

```
┌────────────────────────── VS Code Extension Host ──────────────────────────┐
│                                                                             │
│  extension.ts ──► MainPanel.ts ──► postMessage ──► React Webview           │
│       │                  │                                                 │
│       ▼                  ▼                                                 │
│  ┌─────────┐    ┌───────────────┐    ┌───────────────┐   ┌────────────┐  │
│  │ SQLite  │    │ HTTP Executor │    │ Mock Servers   │   │ AI / Chat  │  │
│  │ (sql.js)│    │   (Axios)     │    │ (per protocol, │   │ Participant│  │
│  │         │    │               │    │  state-machine │   │ (Copilot)  │  │
│  │         │    │               │    │  backed)       │   │            │  │
│  └─────────┘    └───────────────┘    └───────────────┘   └────────────┘  │
│                                                                             │
│  Message handlers — one per protocol (REST, GraphQL, gRPC, SOAP, Realtime,│
│  MCP), plus git-sync, mock-server, and AI handler modules.                │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────── Webview UI (React 19) ────────────────────────────┐
│                                                                             │
│  App.tsx                                                                    │
│  ├── Left Protocol Rail                                                    │
│  ├── TabBar (tabs-store.ts — Zustand)                                      │
│  ├── Main Content Area (per-protocol panels, built from @salilvnair/dui)   │
│  └── Right Sidebar (Collections / History / Environments, context-aware)   │
│                                                                             │
│  Zustand stores: tabs, collections, env, toast, sidebar, devtools,         │
│  ui-state, url-suggestions, ai-providers, ai-features, mock, prompt-       │
│  template, and the embedded @salilvnair/state-machine workspace stores.    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component library — `@salilvnair/dui`

The entire webview UI is built on [`@salilvnair/dui`](https://www.npmjs.com/package/@salilvnair/dui),
a shared React 19 component library (also used by other Daakia-family projects) —
65+ components (`ButtonView`, `ModalView`, `TextInputView`, `SelectInputView`,
`EditorView`, `TabView`, `SideNavView`, `KeyValueTableView`, and more), a single
CSS-variable theme, and an optional Monaco-backed code editor. Two hard rules
flow from this: no native `<select>` anywhere in the app, and every color comes
from a `var(--color-*)` token, never a hardcoded hex value — see
[Design Principles](#design-principles).

### Stateful mocking — `@salilvnair/state-machine`

The Mock Server's "connect this route to a workflow" experience is powered by
[`@salilvnair/state-machine`](https://github.com/salilvnair/state-machine), a
standalone visual state-machine library (React Flow canvas, ck8t card style)
embedded directly into the Mock Server tab. See
[Mock Server — Stateful, Multi-Protocol](#mock-server--stateful-multi-protocol).

### Storage

All persistent data lives in a single SQLite file at `~/.salilvnair/daakia-vsce/db/daakia.db`,
via **sql.js** (SQLite compiled to WASM) — no native addons, works unmodified on every
platform. If the DB fails to load, the UI offers a one-click Rebuild.

---

## Getting Started

Install **Daakia** directly from the VS Code Marketplace — search for "Daakia" in the
Extensions view (`Cmd/Ctrl+Shift+X`) and click Install, or click the Install button at
the top of this page. Requires **VS Code `^1.99.0`**.

---

## Protocol Details

### REST API

The flagship protocol — a full Postman-compatible request builder.

- Method selector + URL bar with a method-colored badge
- Config tabs: Params, Headers, Body, Auth, Variables, Scripts (Pre-request & Post-response)
- Body sub-tabs: none, JSON, XML, Text, HTML, JavaScript, form-data, URL-encoded, binary, GraphQL
- Split Send button: Send, Send & Download, Import cURL, Show Code, Clear All
- Split Save button: Save (in-place), Save As (tree-browser modal)
- Response: Pretty JSON, Raw, Preview, Headers table, Cookies table, Test Results, Timeline

### GraphQL

Schema-aware GraphQL client with introspection and auto-complete.

- Query/Mutation editor with syntax highlighting (Monaco), separate Variables and Headers panels
- **Schema introspection** — connect to an endpoint to auto-discover types, queries, mutations,
  subscriptions, browsable in a Schema Explorer sidebar with type-aware auto-complete
- **Subscriptions** — live WebSocket-based subscription viewer
- Separate collections and history from REST

### gRPC

- **Proto Manager** — import `.proto` files, browse services and methods
- **Server Reflection** — auto-discover services from a gRPC reflection endpoint (no `.proto` needed)
- Method selector, JSON message body editor (Monaco), custom metadata pairs
- Configurable per-request deadline

### SOAP

- **WSDL import** — by URL or file, auto-discovers every operation
- Envelope editor (XML, Monaco) and a generated Form editor per operation
- **WS-Security** — Username Token, Timestamp, Signature
- MTOM/SwA attachments, response assertions on SOAP body content

### WebSocket / Realtime

One unified panel covers four sub-protocols:

- **WebSocket** — custom headers/sub-protocols, text/binary messages (with a hex+ASCII
  dump for binary frames), message templates, auto-reconnect with exponential backoff
- **SSE** — real-time event stream with type filtering, auto-reconnect
- **Socket.IO** — namespace support, custom event send/listen
- **MQTT** — QoS 0/1/2, retain flag, topic subscribe/publish

### MCP Client

A dedicated protocol for testing and debugging Model Context Protocol servers.

- **Transports**: stdio (subprocess) or HTTP/SSE
- **Multi-server per tab** — connect to several MCP servers simultaneously, with per-server
  status dots and merged capabilities
- Tool / Resource / Prompt browsers, an Auth tab (Bearer/API-key for HTTP, env-var table
  for stdio), a Config tab that imports Claude Desktop's `mcpServers` JSON directly, and a
  curated 20-server Catalog for one-click add

---

## Mock Server — Stateful, Multi-Protocol

Daakia's mock server runs locally inside VS Code and covers every supported protocol
(REST, GraphQL, gRPC, SOAP, WebSocket, SSE, Socket.IO, MQTT), with per-route config
for status code, headers, response body, and artificial delay.

**What makes it more than a static mock**: any route (or gRPC method, or GraphQL
operation, or SOAP operation) can be gated by a real **State Machine** workflow —
built on the embedded `@salilvnair/state-machine` canvas. Pick which workflow a route
is connected to, then pick a real **Trigger Event** from that workflow's transition
graph; when a request hits the route, the runtime fires that event against the
workflow exactly like the canvas's own "Run" debugger would, and the response returned
can change depending on which state the machine is currently in. Multiple workflows
connected to the same server track independent state per workflow, so you can model
things like "the third `GET /order/:id` after a `POST /order` returns `shipped`"
without writing any server code.

- Multiple mock servers can run simultaneously on different ports
- Full request logger — every incoming request with method, path, headers, body, timestamp
- Export a running mock as a real WireMock project (mappings + `__files`), or generate
  a standalone server (Node.js HTTP, Dockerfile, Apollo Server, `@grpc/grpc-js` server,
  Node.js SOAP server, `ws`/SSE/Socket.IO server, or an Aedes MQTT broker) — see
  [Import / Export](#import--export)

---

## Scripts & Debugger

A **VS Code-style JavaScript debugger** lives inside the webview — set breakpoints,
step through pre-request/post-response scripts, inspect variables, hover for values,
all without leaving Daakia.

### Script Types

| Script | When It Runs | Use For |
|--------|-------------|---------|
| **Pre-request** | Before the HTTP request is sent | Set variables, generate timestamps, compute auth tokens, abort requests |
| **Post-response** | After the response is received | Assertions, extract data to env vars, chain requests |
| **Collection-level** | Inherited by all requests in a collection | Shared setup/teardown, common auth headers |

### Script API (`dk.*`)

Scripts run in a sandboxed Node.js `vm` context with a `dk` global:

- `dk.env.set/get/secret` — environment variable read/write, secrets masked as `***`
- `dk.globals.set/get` — global variable scope
- `dk.request` / `dk.response` — read-only request, and (post-response only) response with `.status`/`.headers`/`.body`/`.time`/`.json()`
- `dk.sendRequest({...})` — sub-requests from inside a script (e.g. auto-login)
- `dk.test(name, fn)` + `dk.expect(value)` — assertions (`.toBe`, `.toContain`, `.toBeLessThan`, `.toHaveProperty`, ...)
- `dk.console.log/warn/error` — logged to the DevTools Console tab
- `dk.crypto.md5/sha1/sha256/hmac/base64/uuid`, `dk.oauth` — utility helpers

### Debugger

- Click a line-number gutter to set a breakpoint (persists with the request)
- A pill-shaped, draggable HUD toolbar appears when execution pauses: Continue / Step Over /
  Step Into / Step Out / Restart / Stop
- **Run & Debug sidebar**: Variables (expandable tree), Watch expressions, Call Stack, Breakpoints list
- Hover any variable while paused to see its live value; the current line highlights yellow
- Debug mode auto-activates the moment a breakpoint is set — no separate "start debugging" step
- Test results land in the Response panel's Tests tab (`N passed` / `N failed`) — tests run
  even without any breakpoints set

---

## AI Assistant

Daakia ships AI in two complementary surfaces:

### 1. In-app AI panel

A full LLM playground built into the app — its own protocol tab, with a URL bar
(provider + model selector), five config tabs (Prompt, Authorization, Tools, MCP,
Settings — temperature/max tokens/top_p/penalties/stream/stop sequences/seed/response
format), and a streaming conversation panel with tool-call cards.

**13 built-in providers**, each with real model IDs pulled live from the source:

| Provider | Sample models |
|---|---|
| **GitHub Copilot** | `auto`, `gpt-4o`, `claude-sonnet-4-5`, `gemini-2.0-flash`, `o3-mini` (live list from `vscode.lm`) |
| **OpenAI** | `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`, `gpt-4.1`, `gpt-4o`, `o3-pro`, `o4-mini` |
| **Anthropic** | `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-3-7-sonnet-20250219`, `claude-3-5-haiku-20241022` |
| **Google AI** | `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-pro` |
| **Ollama** (local) | `llama3.3`, `qwen2.5`, `deepseek-r1`, `mistral`, `codellama` |
| **Groq** | `compound-beta`, Llama 4 Maverick/Scout, `llama-3.3-70b-versatile`, Kimi K2 |
| **Together AI** | Llama 3.1 405B/70B, DeepSeek R1 |
| **Mistral AI** | Mistral Large/Small, Codestral |
| **xAI** | `grok-3`, `grok-3-mini` |
| **DeepSeek** | V4 Pro/Flash, V3, R1 |
| **Azure OpenAI** | Azure deployment variants |
| **Custom** | any OpenAI-compatible endpoint |
| **Daakia Mock** | points at a local Daakia AI mock server, for offline dev |

### 2. `@daakia` Copilot Chat participant

Registered as a real VS Code chat participant (`daakia.copilot`) — type `@daakia` in
Copilot Chat. Five explicit slash commands (`/request`, `/mock`, `/test`, `/curl`,
`/explain`) plus free-text intent classification that routes to **11 total specialized
agents**: request builder, mock generator, test-script generator, cURL converter,
response explainer, general Q&A, SOAP, GraphQL, XSD→request, documentation generator,
and security review — each with its own system prompt, heuristic-matched first with an
LLM fallback for ambiguous phrasing.

---

## AI Power Tools

Beyond chat, the AI panel's toolbar exposes a catalog of task-specific tools (each
individually toggleable in **Settings → AI Features**):

| Tool | What it does |
|---|---|
| **Export** | Exports the AI conversation (prompts, responses, generated requests) as a Markdown report |
| **@ Prompts** | Quick-insert picker into the AI Prompt Library |
| **OpenAPI** | Generates a full OpenAPI 3.1 spec (YAML/JSON) from the active collection or open tabs |
| **Security** | Scans open tabs for security anti-patterns |
| **pm→dk** | Translates Postman `pm.*` test scripts to Daakia's `dk.*` API automatically |
| **Webhook** | Analyzes webhook payloads, validates HMAC signatures, explains structure |
| **Cluster** | Groups request history into logical API domains, auto-organized into collections |
| **Orchestrate** | Turns a plain-English multi-protocol user journey into a coordinated, pass/fail-tracked test timeline |
| **Chaos** | Designs a chaos-engineering test plan — fault scenarios, order, probability, protocols, duration — plus a risk matrix and resilience report |
| **Contracts** | Diffs two teams' OpenAPI specs, proposes resolutions, and generates adapter stub mocks so both teams can develop independently |
| **Traffic** | Proxy mode — mirrors real API traffic into Daakia, analyzes patterns live, auto-updates mocks, flags anomalies |

Plus a longer tail available from Collections' context menu and elsewhere: a deep
per-collection Security Audit, Voice-to-Request, Request-from-Screenshot, API Flow
Builder, Response Transformer, Request-from-Logs, Scenario Generator, Adaptive Mock
Learning, Semantic Validator, and more.

---

## Command Palette

`Cmd/Ctrl+K` opens a global command palette covering essentially the whole app:
New Request, Navigate, Settings, per-protocol "Go to Tab" (REST/GraphQL/SOAP),
Developer Tools, Collections & Environments, currently open tabs, and the full AI
feature catalog from above — each AI tool is reachable here even if you don't know
which panel it normally lives in.

---

## Wiki — In-App Documentation

**Settings → Wiki** is a tabbed, scrollable, in-app documentation system built from
real screenshots of the running app (Quick Start, REST, GraphQL, WebSocket/Realtime,
gRPC, SOAP, Mock Server, Collections & Env, AI Assistant, Settings), interleaved with
written explanations, code samples, and callouts for each screen — so help is a click
away without leaving the editor, and it never drifts from what the UI actually looks
like since the screenshots are real captures, not mockups.

---

## Settings

| Section | Covers |
|---|---|
| **General** | Follow redirects, SSL verification, save response in history, request timeout, max history entries |
| **Theme** | Dark/Light toggle, persists across sessions |
| **Mock Server** | Default port range, auto-start behavior |
| **LLM Provider** | Enable/disable providers, API keys (stored via VS Code SecretStorage), custom base URLs, per-provider model toggles |
| **AI Features** | Per-tool on/off switches for every [AI Power Tool](#ai-power-tools) |
| **Prompt Library** | Manage saved prompt templates and agent system prompts, with reset-to-default |
| **AI Audit** | Full LLM call audit trail — model, prompts, payloads, timing |
| **Developer Tools** | Memory Footprint, Audit Log, Audit Config, DB Explorer, Debug Snapshot |
| **Power Features** | 8 cards: Cookie Manager, Proxy Settings, Client Certificates, API Monitor, Request Interceptor, Response Diff, Bulk URL Tester, Load Tester |
| **Wiki** | The in-app documentation described above |

---

## Developer Tools

Two distinct surfaces, both reachable from the app:

**The DevTools panel** (rail icon, bottom-left) — a resizable bottom panel with
**Console** (script logs, error traces, a REPL for live expression evaluation),
**Network** (every request across every protocol — method/status/URL/duration/size,
click for full request/response detail), and **Performance** (heap/RSS/external
memory/CPU, auto-refreshing).

**Settings → Developer Tools** — a separate, DB-focused surface: Memory Footprint,
Audit Log (browse/filter/delete `ce_audit` entries), Audit Config, DB Explorer
(browse every SQLite table, expand JSON cells, delete rows), and a one-click Debug
Snapshot export (DB status, memory, versions, recent errors, as JSON).

---

## Import / Export

**Import**: Postman Collection v2.1, OpenAPI/Swagger (2.x & 3.x, YAML or JSON), HAR
(HTTP Archive), Bruno `.bru`, HTTPie, Thunder Client.

**Export** (per-collection, right-click menu): Daakia JSON, Postman-compatible JSON,
Insomnia, Bruno `.bru`, HTTPie, OpenAPI 3.0, and a Markdown API-docs export.

**Mock Server export**: a real WireMock project (mappings + `__files`, zipped), or a
generated standalone server for the target protocol (Node.js HTTP server + Dockerfile,
GraphQL via `graphql-http` or Apollo Server, a real `@grpc/grpc-js` server, a Node.js
SOAP server, or `ws`/SSE/Socket.IO/Aedes-MQTT servers) — so a mock built visually in
Daakia can leave the editor as a runnable project.

---

## Collection Sync (git-native)

`daakia.exportCollectionsToWorkspace` / `daakia.importCollectionsFromWorkspace` (VS Code
Command Palette) write every collection out as diffable `<protocol>.daakia.json` files
inside your workspace, so they can be committed, code-reviewed, and diffed like any
other file — and re-imported on another machine after a `git pull`. An optional
auto-export mode (`daakia.gitSync.enabled`) debounces a write on every collection
mutation and watches the sync folder for external changes to re-import automatically.
No GitHub/git credentials are ever touched by the extension — actual `git add/commit/push`
stays entirely in your own hands via VS Code's Source Control panel.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Extension Host** | TypeScript 5.7, VS Code Extension API, esbuild |
| **Webview UI** | React 19, Vite 6 |
| **Styling** | Tailwind CSS v4 + CSS custom properties |
| **Component Library** | [`@salilvnair/dui`](https://www.npmjs.com/package/@salilvnair/dui) — shared design system |
| **State Machine** | [`@salilvnair/state-machine`](https://github.com/salilvnair/state-machine) — stateful mock workflows |
| **State** | Zustand 5 |
| **Code Editor** | Monaco (`@monaco-editor/react` + `monaco-editor`, wrapped by DUI's `EditorView`) |
| **Storage** | sql.js (SQLite compiled to WASM) — no native addons |
| **HTTP Client** | Axios |
| **gRPC** | `@grpc/grpc-js` + `@grpc/proto-loader` + `protobufjs` |
| **SOAP** | `soap` + `fast-xml-parser` |
| **WebSocket / Socket.IO / MQTT** | `ws`, `socket.io-client`, `mqtt` + `aedes` (mock broker) |
| **YAML** | `js-yaml` (OpenAPI/Swagger parsing) |
| **Path matching** | `path-to-regexp` (mock route matching) |

---

## Design Principles

1. **No hardcoded colors** — every color is a `var(--color-*)` token or comes from `daakia-colors.ts`
2. **No inline SVGs** — every icon lives in `daakia-icons.tsx`
3. **No native `<select>`** — always DUI's `SelectInputView`/`StyledDropdown`
4. **No backdrop-close modals** — only an explicit X or Cancel/Close button dismisses a modal
5. **No browser right-click menu** — globally disabled; a custom `ContextMenu` component takes over
6. **Protocol separation** — each protocol is self-contained: own panels, sidebar, stores, execution
7. **Confirm all destructive actions** — via a shared `ConfirmDialog`, never an inline confirmation
8. **Stable scrollbars** — every scrollable area reserves gutter space so content never shifts
9. **Help icons** — always the shared `InfoPopup` (title + description + code badges + wiki link), never a bare toast or direct link
10. **postMessage bridge** — all extension ↔ webview communication goes through typed message handlers

---

## Contributing / Local Development

> This section is for people building Daakia from source — not needed to use the extension,
> which installs in one click from the Marketplace above.

**Prerequisites:** Node.js 20+ (`nvm use 22`).

```bash
git clone https://github.com/salilvnair/daakia.git
cd daakia
nvm use 22
npm install
npm run build:all

npm run watch          # watch mode, extension host
npm run dev:webview    # Vite dev server, hot reload for the UI

# Press F5 in VS Code → Extension Development Host window opens
```

### Build Commands

| Command | Description |
|---------|-------------|
| `npm run build:all` | Typecheck + build extension (esbuild) + build webview (Vite) |
| `npm run build:ext` | Build extension only |
| `npm run build:webview` | Build webview only |
| `npm run watch` | Watch mode for the extension |
| `npm run dev:webview` | Vite dev server for the webview (hot reload) |
| `npm run local-server` | Standalone dev backend (real SQLite + mock servers) for browser-only UI testing |
| `npm run vscode:package` | Package into a `.vsix` file (for manual/offline installs) |
| `npm run vscode:publish` | Publish to the VS Code Marketplace (current `package.json` version) |
| `npm run vscode:publish:patch` / `:minor` / `:major` | Bump semver and publish in one step |
| `npm run lint` | ESLint on `src/` |

### Installing a locally-built VSIX

```bash
npm run build:all
npm run vscode:package
code --install-extension daakia-*.vsix
```

---

## License

MIT © 2026 [salilvnair](https://github.com/salilvnair)

---

<p align="center">
  <sub>Built with ❤️ for the VS Code community</sub>
</p>
