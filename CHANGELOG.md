# Daakia — Changelog

All notable changes to the Daakia API Client extension are documented here.

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
