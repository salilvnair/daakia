# Daakia — Changelog

All notable changes to the Daakia API Client extension are documented here.

---

## [2.0.0] — 2026-07-30

A full UI redesign plus three major new systems: stateful mocking, an in-app
documentation wiki, and git-native collection sync — on top of a large
expansion of the AI feature set.

### Changed — Full UI redesign on `@salilvnair/dui`
- The entire webview UI now runs on **`@salilvnair/dui`**, a shared component
  library (65+ components — buttons, modals, inputs, tabs, editors, side nav)
  with a single CSS-variable theme system, replacing the previous mix of
  bespoke components and raw HTML elements
- Every modal in the app (AI tool popups, save-as, environment editor,
  context menus, save/confirm dialogs) migrated to DUI's `ModalView`, with a
  consistent no-backdrop-close policy
- Standardized button sizes across every protocol panel; removed the last
  hardcoded hex colors in favor of `var(--color-*)` tokens
- Replaced `@monaco-editor/react` direct usage with DUI's `EditorView`
  wrapper — Monaco is now an optional dependency the same way it is for DUI
  itself
- Live theme customizer and a full dark/light CSS-variable overhaul

### Added — Stateful Mock Server
- Mock server routes (REST, GraphQL, gRPC, SOAP) can now be connected to a
  real **State Machine** workflow — built on the new
  [`@salilvnair/state-machine`](https://github.com/salilvnair/state-machine)
  visual canvas — so a mock's response can change based on prior calls,
  driven by real transition events instead of a manual "required state" field
- WireMock-grade mock features: request matching, fault injection, rate
  limiting, response sequences, webhooks, and record/playback
- Mock server export: a real WireMock project (mappings + `__files`, zipped),
  or a generated standalone server (Node.js HTTP + Dockerfile, Apollo/
  graphql-http server, `@grpc/grpc-js` server, Node.js SOAP server, or
  `ws`/SSE/Socket.IO/Aedes-MQTT servers)

### Added — In-App Wiki
- **Settings → Wiki**: a tabbed, scrollable documentation system built from
  real screenshots of the running app (Quick Start, REST, GraphQL, Realtime,
  gRPC, SOAP, Mock Server, Collections & Env, AI Assistant, Settings),
  interleaved with written explanations and code samples — replaces the old
  prose-only Daakia Wiki panel

### Added — Collection Sync (git-native)
- `daakia.exportCollectionsToWorkspace` / `daakia.importCollectionsFromWorkspace`
  commands write collections out as diffable `<protocol>.daakia.json` files
  for commit/review/CI, with an optional auto-export-on-mutation mode and a
  file-watcher that re-imports after external changes (e.g. `git pull`) — no
  git or GitHub credentials are ever touched by the extension

### Added — AI
- **`@daakia` Copilot Chat participant** — 5 slash commands (`/request`,
  `/mock`, `/test`, `/curl`, `/explain`) plus free-text intent classification
  routing to 11 total specialized agents (adds SOAP, GraphQL, XSD→request,
  documentation, and security review agents beyond the slash commands)
- A large catalog of AI power tools in the AI panel toolbar: OpenAPI spec
  generation, Postman→Daakia script translation, webhook payload analysis,
  request-history clustering into collections, cross-protocol test
  orchestration, chaos-engineering test plans, API contract negotiation
  between two OpenAPI specs, and live-traffic mirroring/analysis — each
  individually toggleable in Settings → AI Features
- AI conversation persistence, prompt library with agent system prompts and
  reset-to-default, full AI audit trail (Settings → AI Audit), cache-first AI
  results, multimodal AI support
- Global **Command Palette** (`Cmd/Ctrl+K`) expanded to cover navigation,
  settings, per-protocol tab jumps, and the entire AI feature catalog

### Changed — Dependencies
- `@salilvnair/dui` and `@salilvnair/state-machine` are now installed from
  the public npm registry (`^1.0.2` / `^1.0.0`) instead of local `file:`
  workspace links, matching how any other consumer would install them

### Improved
- Binary response handling and file upload display
- Autocomplete suggestions with a dedicated URL-suggestions store
- History item grouping logic; unique ID generation for default tabs
- Request timeout now defaults to `0` (no timeout) across all protocol
  handlers instead of a fixed value

---

## [1.0.3] — 2026-06-08

### Added
- **MCP Multi-Server Support** — Connect to multiple MCP servers per tab simultaneously; per-server status dots, connect/disconnect, merged capabilities
- **MCP Auth Tab** — Bearer token and API-key auth for HTTP transport; env-var table for STDIO transport
- **MCP Config Tab** — Import Claude Desktop `mcpServers` JSON format directly into Daakia
- **MCP Catalog** — 20 curated MCP servers (Anthropic official + community); search and one-click add
- **WebSocket Auto-Reconnect** — Configurable exponential backoff on disconnect
- **WebSocket Message Templates** — Save and reload frequently used WS messages
- **WebSocket Binary Hex Dump** — View binary WebSocket frames as hex + ASCII dump (offset | hex | ascii)
- **MQTT Client** — Full MQTT connect, subscribe topics, publish messages, QoS 0/1/2 support
- **WSDL → Collection Import** — Parse WSDL from URL or file → auto-create SOAP collection with all operations and skeleton envelopes
- **OpenAPI 3.0 Export** — Generate OpenAPI 3.0 spec JSON from any collection (right-click → Export as OpenAPI 3.0)
- **API Documentation Export** — Export Markdown API docs from any collection with headers/params tables and body code blocks
- **Response Search (Ctrl+F)** — Ctrl+F inside response panel triggers Monaco's built-in find widget
- **Developer Tools: Memory Footprint** — Full heap/RSS/external/array-buffers/OS memory breakdown with progress bars in Settings → Developer Tools
- **Developer Tools: Audit Log** — Browse, filter, and delete `ce_audit` entries; full prompt/response/error expand
- **Developer Tools: DB Explorer** — Browse all SQLite tables, view rows, expand JSON cells, delete rows
- **Developer Tools: Debug Snapshot** — Export complete diagnostic JSON with DB stats, memory, versions, recent errors
- **Theme Toggle** — Dark/Light theme toggle in Settings → Theme (persists across sessions)
- **Large Response Truncation** — Responses > 512 KB are truncated for display with a warning banner; full file always saved

### Improved
- AI Audit panel covers AI Footprint requirements (full LLM call audit trail with model, prompts, payloads, timing)
- Performance: response bodies capped at 512 KB before postMessage to prevent webview freeze on huge responses
- MCP connection errors shown inline in URL bar with Retry button

---

## [1.0.2] — 2026-05-31

### Added
- **AI Features** — Explain response, follow-up questions, natural language assertions, TypeScript type generation, semantic validator, response transformer, smart retry advisor, response pattern learning
- **GraphQL** — Full GraphQL client with schema introspection, Explorer, variable editor, subscription support
- **WebSocket** — Full WS client with sub-protocols, message log, binary detection
- **SSE Client** — Server-Sent Events stream viewer
- **Socket.IO Client** — Socket.IO handshake, emit/listen, namespace support
- **SOAP** — SOAP envelope editor, WSDL import, WS-Security, XSD validation, mock SOAP server
- **gRPC** — Proto file loading, server reflection, all 4 streaming modes, TLS configuration
- **Mock Server** — HTTP, GraphQL, WebSocket, SOAP, gRPC mock servers with configurable routes
- **Collections** — Folders, requests, runner with environment variable support
- **Environments** — Multiple environments with variable substitution in URLs/headers/body
- **Import** — Postman v2.1, OpenAPI/Swagger, cURL, HAR, HTTPie, Insomnia, Bruno
- **Export** — Daakia JSON, Postman, Insomnia, Bruno, HTTPie formats + environment exports
- **DevTools Panel** — Bottom panel with Console, Network, Performance tabs
- **AI Conversation** — Persistent AI chat with history, context injection

---

## [1.0.0] — 2026-05-22

### Initial Release
- REST API client (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS)
- Request builder: URL, headers, query params, body (JSON/form/raw/binary)
- Response viewer: JSON tree, raw, headers, cookies, timeline
- Tab management with unsaved-changes indicator
- History (SQLite-backed)
- Keyboard shortcuts (Ctrl+Enter, Ctrl+S, Ctrl+N, Ctrl+W, Ctrl+L)
- VS Code webview extension architecture
