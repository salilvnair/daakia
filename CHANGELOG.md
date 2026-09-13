# Daakia — Changelog

All notable changes to the Daakia API Client extension are documented here.

---

## [3.0.2] — 2026-09-13

Five things that were quietly wrong.

**The editor tab has its icon back.** It pointed at a file in `media/`, which
3.0.0 started excluding from the package so the README's GIFs would stop
shipping inside the extension. The path stayed valid in the repository and
dangled once installed.

**dk8s no longer offers clusters you deleted.** A context picked once and later
removed from your kubeconfig was remembered forever and queried on every
refresh, producing an error about a cluster you may not remember adding. Saved
namespaces are checked too, but only against a cluster that actually answered —
one that is unreachable has said nothing, and forgetting a watch because a VPN
was down would throw away something you set up on purpose.

**Nothing in dk8s spins forever.** "Loading namespaces" and "Loading pods" were
drawn whenever a list was empty, so a cluster that had already refused looked
identical to one still being asked. Both now say which it is, and offer
somewhere to go. Silence gets its own answer after twenty-five seconds, because
a reply that never arrives is a state too.

**Closing a tab is remembered.** The workspace snapshot was written two seconds
after a change, and closing the panel inside that window took the pending save
with it — so tabs you had closed came back. Which tabs exist is now saved the
moment it changes.

**Builds are reproducible.** The design system was resolved through a path on
one machine rather than from the registry. Nothing shipped differently; it
simply could not be rebuilt anywhere else.

---

## [3.0.0] — 2026-09-12

Two surfaces that are not an API client at all.

**dk8s** puts Kubernetes in the editor — pods, structured logs, a real
terminal in the container, a file explorer, search across every watched pod —
and **Doctor**, which reads a heap dump, a thread dump or a flight recording
and tells you what is wrong with the process that produced it.

**dkgh** puts one repository's issues there too — a board in four shapes,
saved views, a team view, charts, and a write path that files, edits, labels
and closes through the official `gh` CLI, so your GitHub credential stays in
the OS keychain and never reaches Daakia.

Around them: **Workspaces**, so collections, environments and history belong
to a project rather than to the app; an in-app **wiki and tour**; the
**Power Features** shelf wired to real requests; an audit trail behind every
AI call; and per-request execution settings, the operating system's proxy,
and four features that had been written months ago and were never reachable
from the UI.

The major bump is for the shape of the app, not a break in the file formats —
collections, environments and mock configs from 2.x load unchanged.

![Dk8s and DkGH](https://raw.githubusercontent.com/salilvnair/daakia/main/media/daakia-dk8s-dkgh-3.0.gif)

### Added — dk8s: Kubernetes, without leaving the editor
- **Pods, watched live** — contexts, namespaces and pod grids with status,
  restarts and age; starred deployments stay at the top and the tab opens on
  them
- **Logs with structure** — a configurable format turns raw lines into
  fields, and a panel down the left of the log says how the events divide
  across them: threads, loggers, and any MDC key the application logged
  (`tenant`, `orderId`). Click a value to include it, again to exclude it,
  again to clear; the magnifier beside it asks the pod's whole log rather
  than the buffer
- **A real terminal in the pod** — a PTY over the Kubernetes exec API
  carrying your own kubeconfig, so no port is opened and no credential
  leaves your machine. Themes are configurable (import, export, generate
  with AI, six at a time), and every theme carries a dark and a light
  variant with a preview toggle
- **An Explorer beside it** — the container's filesystem, with folder sizes,
  downloads that can be stopped and retried, and "open a shell here" from
  any path or search hit
- **Search across pods** — text or regex over files and logs in every
  watched pod, with force-stop that actually kills the child processes
  rather than setting a flag
- **Doctor** — open a `.hprof`, a thread dump or a `.jfr` and get a verdict:
  dominators and retained sizes, leak suspects, deadlocks and contention,
  CPU hot spots with self and total kept apart, blocking and allocation
  profiles. The AI can ask for another view and drill, rather than being
  handed one summary
- **dk8s as MCP tools**, deliberately read-only
- Redaction runs over everything that reaches a model, and now catches
  dotted property names — `spring.datasource.password=…` used to get through

### Added — dkgh: the issue tracker, in the editor
- **One repository's board, in four shapes** — cards, a table, columns by
  status, and a roadmap over time. The same filter renders as all four, so
  changing the question does not mean rebuilding the view
- **Saved views** — "All open", "Stale & unowned", "My plate", "This sprint",
  "Closed this week", and your own. Each carries its count, and a shared link
  says what it drops rather than silently narrowing
- **A team view** — who is carrying what, unassigned first on purpose,
  because that is the row a lead needs
- **One issue in full, over the board** — a sheet rather than a navigation,
  with comments, a close reason, labels, relations, and the rail edits the
  way github.com does them
- **Insights** — open issues over time, where they are by module split by
  environment, how long they sit, and who is carrying what; plus your own
  charts, pinned, and a comparison against the period before
- **Repository** — where the chips come from: issue templates imported, a
  field map that moves between repositories, and label sets taken from
  somewhere else
- **Export** — a real `.xlsx`, a PDF that reads as a status mail, a
  repository's whole history, and a scheduled export that runs every Friday
- **Filing** — a composer with the metadata beside it, generate-with-AI, and
  screenshot upload; creation runs as a sequence with duplicate detection and
  retry
- **Through the official `gh` CLI**, never a token in the extension: scopes,
  hosts and accounts are read from it, every command is disclosed before it
  runs, and a confirm screen is built so it cannot describe an action other
  than the one about to happen

### Added — Workspaces
- **Collections, environments and history belong to a workspace**, across
  every protocol, so two projects stop sharing one drawer
- Open, import and export a workspace; the rail says which one you are in
- What you collapsed stays collapsed, and the badges count everything rather
  than the first page

### Added — A wiki, and a tour
- **Documentation inside the extension**, including a Daakia Tour that walks
  the whole app, with a way to keep its screens fresh rather than letting
  them rot
- Help links from settings and the sidebar reach the page they name

### Added — Power features, and AI you can audit
- **The Load Tester sends real requests**, the **Bulk URL Tester** reports
  what the server actually said, and the **Request Interceptor** has a proxy
  behind it — three tools that had a UI and no engine
- **Every AI feature has a switch, and the switch stops the call** — not the
  rendering of the result, the call itself
- **Every AI call has a name, a screen and one door**, and leaves an audit
  entry — including the ones that fail
- **Schema Diff and anomaly detection**, and **Compare with clipboard** from
  the right-click menu of anything holding data
- **Translate: anything → Daakia**, with the source tool detected rather than
  asked for
- **Monitors run**, and a rule can be edited after it is written

### Added — Requests, settings and proxy
- **Per-request and per-collection execution settings** — timeout,
  redirects, SSL verification, encoding and proxy, each inheriting from the
  level above and showing where its value came from. Testing one endpoint
  with a self-signed cert no longer means flipping a global switch and
  remembering to flip it back
- **The operating system's proxy is honoured**, including PAC and WPAD
- **An audit trail for every protocol** — REST, GraphQL, SOAP, gRPC and the
  realtime protocols as sessions, recording the whole request rather than
  method and URL
- **Keymap settings** — keyboard shortcuts, listed and rebindable
- **Connect-time payloads** for WebSocket, SSE and Socket.IO
- **Copy JSON path and Copy XPath**, at every level of a response
- **Expand and collapse a collection**, whole or by subtree

### Added — The collection runner iterates
- **An iteration count and a data file** in Run collection: one pass per CSV
  or JSON row, each column bound as a variable over the environment, so a
  request saying `{{email}}` gets that row's value. The runner previously took
  a collection and an environment and ran each request exactly once
- The file is parsed by **the same module the CLI uses**, so a file that
  iterates fifty rows in a pipeline iterates the same fifty rows in the app.
  Rows are capped at 500 — a run is one request per row per request
- Progress counts across the whole run rather than restarting each pass, and
  the summary says how many iterations there were

### Added — The CI runner grows up
- **`--junit <file>`** writes the one report format CI actually renders: a
  case per request, the folder path as its classname so viewers group by it,
  and a suite per iteration
- **`--folder <name>`** runs one folder, matched on whole path segments;
  **`--env-var k=v`** overrides a variable at the call site, which is where a
  CI secret belongs
- **`--concurrency n`** sends n requests at a time, in batches — a smoke
  suite of forty independent requests no longer takes forty round trips. A
  batch settles before the next starts, so the report keeps the collection's
  order and `--bail` still means something
- **`--data rows.csv`** runs the collection once per row with the row's
  columns bound as variables — the fifty-accounts case, which could not be
  expressed before. JSON rows work too; **`--iterations n`** and
  **`--delay ms`** cover the rest

### Added — Four features that existed and could not be reached
- **Assert** — click a field in a JSON response, get a `dk.expect(...)`; the
  assertions land in the request's post-response script
- **Visualize** — an array of objects as a table, images and PDFs inline.
  Both tabs appear only when the response has something for them to show
- **Response chaining** — `data.token` into `{{token}}` without writing a
  script, applied automatically when a response arrives. It writes the
  environment's *current* value and leaves the initial one empty, so a token
  pulled off a response never lands in an export
- **Starred requests** float to the top of their folder. A per-person view
  preference: never exported, never synced

### Added — One search across every collection
- **Ctrl+Shift+F**, or "Search all collections" in the command palette:
  names, URLs, headers, params, bodies and docs, across every protocol at
  once. `/pattern/` is a regular expression, plain text is a substring
- Each hit says **where** it matched — "in the body" and "in the URL" send
  you to different places — with the matched text beside it, grouped by
  collection. Folders match on their own name, because an empty folder called
  `staging` is part of the answer to "where does staging still appear"
- The sidebar panels each filter their own protocol's tree by name and URL,
  which could never answer "which request sends this header"

### Added — Requests can carry documentation
- **A Docs tab** on every request: markdown describing why it exists, what it
  needs and what it returns, in Edit and Preview. There was nowhere to write
  this down before, which is most of what makes an exported collection useful
  to somebody else
- It **travels with the collection** — into the Markdown docs export above
  the mechanics, and into the OpenAPI export as the operation's
  `description`. Both previously had nothing to work from but URLs and
  payloads
- Chaining rules persist with the request too, so they survive a closed tab

### Added — Contract testing from an imported spec
- An imported OpenAPI document **keeps its `components.schemas`** with the
  collection, so `dk.expect(body).toMatchSchema('#/components/schemas/User')`
  resolves against the spec instead of a copy pasted into the script.
  `#/definitions/User` and a bare `User` name the same schema
- A name that matches nothing **fails as a broken test**, saying which schema
  is missing rather than reporting it as a body that does not match
- **`integer` is understood.** The validator compared JSON Schema's types
  against `typeof`, so every spec that types an id as `integer` failed on a
  perfectly valid body

### Added — Saved response examples
- **Save example** on any response keeps it under the request, named after
  its status and renameable — the 200 that works, the 401 when the token has
  expired, the 422 with the validation body somebody will ask about. A
  request used to store exactly one response: the last one
- They **travel with the request** into the Markdown docs export, which is
  the half of the documentation a URL and a payload cannot give you
- Kept deliberately small, because they ride in the record the sidebar reads
  whole: bodies over 64 KB are trimmed and say so, the last 20 survive, and
  only headers describing the body or the outcome are kept —
  `Set-Cookie` is dropped, since a saved example is a file that gets
  committed

### Changed — The OpenAPI export describes a real API
- **`servers`** — the base URL is declared once instead of baked into every
  path, including the `{{baseUrl}}` convention every exported Postman
  collection uses. That convention used to parse as part of the host, so a
  request whose whole URL was the variable collapsed to `/` and collided with
  every other one
- **`components.securitySchemes`** — the bearer, basic or API-key config each
  request carries becomes a named scheme the operations reference, instead of
  vanishing. Two different API-key headers stay two schemes
- **`{id}` survives** as a path parameter rather than arriving
  percent-encoded as `%7Bid%7D`, which no tool reads
- The exporter emits **3.1.0**, the version the AI doc generator has always
  claimed — one app was producing two spec versions depending which button
  you pressed
- **Request bodies carry an inferred schema** instead of
  `{ type: 'object' }` — true of every JSON payload ever written, and useful
  for nothing. Types, `integer` apart from `number`, and `date-time`, `date`,
  `uuid` and `email` formats where a value is unambiguous
- **Responses come from saved examples**: a status per example, a schema
  inferred from its body, and the body itself as the example. Without any,
  the old 200/400/500 placeholders stand — they say nothing, but in a shape
  tools can read

### Fixed
- **Imported Postman tests said the opposite of what they meant.**
  `.to.not.equal(500)` converted to `toBe` with a `/* NOT */` comment inside
  the argument list — an assertion that passed exactly when it should fail.
  Negation is real now, and a second bug behind it meant every negative
  assertion was being commented out instead. `pm.response.to.have.status()`
  — the first line of most exported collections — converted to a method that
  does not exist and threw on the first run; it resolves through
  `dk.expect(dk.response)` now. The translator has 37 tests, several of which
  execute the converted script rather than grepping it
- **Mock routes** answered on the variable rather than the path, and allowed
  two routes for one method and path
- **Proxy settings never reached the extension host**
- **Two AI buttons** posted prompt keys that were registered nowhere
- **Collection Properties** showed the wrong name and led with the request
- The assertion builder generated `dk.expect(data.[0].name)` for any
  response whose root is an array, and quoted string values by hand
- The wiki's "Export as JSON isn't wired up" note was three releases stale
- **A passing CLI run exited 127.** Any run with more than one request died
  on Windows with a libuv assertion, because `process.exit()` fired while
  fetch's connection pool still held sockets it was closing — in CI,
  indistinguishable from a broken runner
- **The wiki's "Open Wiki" links did nothing** — a button with an empty
  handler. They open the page they name now
- **A global shortcut ate characters you typed.** Three views registered a
  single-key shortcut on `window` — dk8s's `/`, the issue board's
  `j k o a l c m g f /`, the wiki tour's — and two of them guarded only
  `INPUT` and `TEXTAREA`. Every URL bar in the app is a `contenteditable`
  div and every tab stays mounted once visited, so after opening dk8s once,
  typing a URL anywhere silently lost every slash:
  `https://api.example.com/v1/users` became
  `https:api.example.comv1users`. `window` is the last stop in the bubble
  path, so nothing downstream could put the character back and there was no
  way to see why the URL was wrong
- **The collections panel appeared beside tabs that own the whole screen.**
  The rule was a list of "is the active tab this kind" comparisons, and the
  two kinds added most recently — dkgh and Workspaces — were never added to
  it, so both shipped with a REST collections tree taking a third of the
  width beside an issue board and a pod list. It asks what a tab *is* now,
  so the next standalone kind is right without anybody remembering
- **The editor closed brackets and tags even when told not to.**
  `autoClosingBrackets` was hard-coded in two places, one of them applied
  after mount, so nothing outside could turn it off; anything typing a
  character at a time landed its own closing brace on the one already
  inserted. A SOAP envelope came out with every tag doubled
- **dkgh's button reset** was written to out-specify a library rule and broke
  the whole tab twice, because `:not()` takes the specificity of its
  argument. It lives in a cascade layer now, where it does not have to win on
  specificity at all
- **The repository search returned repositories that were not yours**
- **A dkgh handler that threw left the screen waiting** forever instead of
  saying so
- **A dk8s target with no container list** raised a TypeError rather than
  rendering an empty one
- **A dk8s volume export could not finish** — it reports bytes and can be
  cancelled now

### Removed
- A second, superseded gRPC client and a "Coming soon" protocol placeholder,
  both unreferenced; the realtime protocol selector's unreachable "soon"
  badge
- The orphaned CSV request-templating panel — the runner and the CLI both
  iterate over a data file now, which is what it was written for

---

## [2.0.2] — 2026-07-31

Git-native sync grows up into a real sync engine with encrypted secrets and a
recovery bin, GraphQL gets an interactive schema explorer, and a round of
export/UI bug fixes.

### Added — Git Sync: fixed clone, encrypted secrets, more scope
- **Fixed local clone** — the sync working copy now always lives at
  `~/.salilvnair/daakia-vsce/daakia-vsce-git` (via `git clone`/`remote set-url`
  against `daakia.gitSync.remoteUrl`), independent of whatever workspace
  happens to be open, replacing the old workspace-relative `gitSync.folder`
  setting
- **Serialized sync cycles** — a sync in progress now blocks any new sync
  attempt outright instead of running two git processes against the same
  folder concurrently; the auto-sync timer silently skips an overlapping tick
- **Auto Sync interval** — `daakia.gitSync.autoSyncSeconds` (0/1/5/10/30) runs
  a full export → commit → pull → push → import cycle on a timer
- **Environments and AI Config as new sync categories**
  (`daakia.gitSync.syncEnvironments`, `daakia.gitSync.syncAiConfig`) — the
  prompt library, AI feature flags, and provider config (never API keys, which
  stay in your OS keychain) can now round-trip through git alongside
  collections, history, and mock servers
- **Colorful, state-aware Git Sync status card** — checking / syncing /
  no-git / not-cloned / pending / clean, each with branch, remote,
  ahead/behind, and working-tree detail chips; hidden entirely until a remote
  URL is configured

### Added — Vault: encrypted secret environment values
- **Settings → Vault** — set a passphrase (masked field, eye-icon reveal) to
  encrypt every environment variable flagged as secret with AES-256-GCM. The
  passphrase itself is stored in your OS keychain (via VS Code's
  `SecretStorage`) for silent auto-unlock on next launch; only a
  non-reversible verifier hash is kept in the local database, so the
  passphrase is never persisted anywhere in plaintext
- Secret values are now decrypted/encrypted correctly across **every**
  protocol's request and script execution — GraphQL, gRPC, SOAP, WebSocket,
  SSE, MQTT, Socket.IO, MCP, and the Collection Runner all resolve
  `{{secretVar}}` through the vault the same way REST already did
- **Every environment export path redacts secrets** — JSON, Postman, Bruno,
  Insomnia, HTTPie, and Gist exports all replace a secret variable's value
  with a redaction marker, keeping only its key

### Added — Bin (soft delete + 30-day recovery)
- Deleting a **History** entry, **Collection** (or a single request inside
  one), **Mock Server** config, or **Environment** now archives it instead of
  destroying it immediately. **Settings → Bin** lists everything by category
  with a relative "deleted Xd ago, Yd left" timestamp, one-click restore
  (collections reattach to their original parent folder if it still exists),
  and permanent delete. Entries past 30 days are purged automatically on
  extension activation. Scope intentionally matches Git Sync — audit logs,
  cookies, and AI conversation history are not covered

### Added — GraphQL Schema Explorer
- The read-only Schema tab is now an interactive **GraphiQL Explorer-style
  checkbox tree**, ported from the real `graphiql-explorer` implementation
  rather than approximated: check a field to add it to the query, check an
  object field to auto-select its own leaf sub-fields, uncheck to remove —
  every ancestor field needed to keep the query structurally valid is
  created automatically
- **Arguments render as their own checkbox rows** beneath a selected field —
  required arguments are checked by default and marked `*`. Scalars get a
  minimal underline-style input matching GraphiQL's own (no box, no
  placeholder, auto-sized to content, literal quote characters around
  strings); enums and booleans get a dropdown; INPUT_OBJECT arguments expand
  into their own nested, recursively-checkable field group
- **`$` variablize** — hovering a checked argument reveals a small `$`
  button that extracts its literal into a proper GraphQL variable
  (`query MyQuery($id: ID = "") { token(id: $id) }`), de-duplicating names
  and round-tripping cleanly when the query is re-parsed; click again to put
  the literal back
- Schema / Query / Mutation / Subscription tabs, with the original raw-SDL
  viewer (now auto-formatted rather than shown as whatever single-line shape
  the server returned it in) folded in as the "Schema" tab

### Changed
- Response times under 300ms in the History panel now use the AI accent
  color instead of green, and the search bar shows a total-record count
  badge matching the Settings search bar
- `@salilvnair/dui` and `@salilvnair/state-machine` version bumps

### Fixed
- **Collections "Export as JSON"** was a non-functional stub showing a "not
  implemented" toast; now wired to the working export handler
- **Collections "Export to Bruno"** used the same unlabeled folder-picker
  dialog as Import, making the two indistinguishable — export and import now
  have distinct titles/labels
- **AI popup focus rings** across every AI tool (34 input fields in 25
  files) defaulted to the generic blue accent instead of the AI accent color
  when no explicit color was set
- **SOAP WS-Security layout** — the Password Type dropdown and Nonce/Created
  checkboxes were crammed into one visually mismatched row; now an aligned
  two-column grid matching the Username/Password row above it

---

## [2.0.1] — 2026-07-30

Bug-fix release — no new features, all fixes from real-world post-2.0.0 testing.

### Fixed
- **Request/response panel auto-resize** — clicking a request-config tab, sub-tab, or
  input no longer fails to snap the split panel on REST, GraphQL, and MCP (was working
  correctly on gRPC/SOAP/WebSocket/SSE/Socket.IO/MQTT already); REST/GraphQL were
  filtering the focus handler to only `input`/`textarea` elements and silently ignoring
  button clicks, MCP was using `onClick` instead of `onFocus` (broken by inner
  `stopPropagation()` calls)
- **URL suggestion dropdowns** — REST and SOAP were the only protocols showing history/
  mock-server suggestions on an empty, freshly-focused URL field; gRPC, WebSocket, SSE,
  Socket.IO, and MQTT (all via `@salilvnair/dui`'s `HighlightedInputView`) and GraphQL
  (a local duplicate component) had the same empty-focus suppression bug, fixed at the
  shared component level. MCP and AI never had suggestions wired up at all — added
  history + mock-server suggestion support to both, matching every other protocol
- **AI popups cut off at the bottom of the viewport** — Response Explainer, Follow-up
  Requests, and Error Diagnosis (one shared `AiAssistPopover` component used across all
  7 protocols) now clamp to stay fully on-screen in both directions, track window
  resize/scroll instead of positioning once on mount, and fall back to a centered popup
  with a dim backdrop when there's no room to anchor near the trigger button
- **Mock Server state machine canvas rendering blank white node cards, "Blocks 0"** —
  `@salilvnair/state-machine`'s `package.json` had a `sideEffects: ["**/*.css"]` array
  that caused its own library build to tree-shake out the block-registration module
  entirely; published a fixed `1.0.1` and daakia now depends on it via the real npm
  registry
- **`.vsix` package bloat** — `.vscodeignore` was missing `.claude/`, `.history/`,
  `graphify-out/`, `skills/`, `cli/`, stale `out/` (an old e2e test-compile artifact),
  `tsconfig.test.json`, `CLAUDE.md`, and the (16 MB) demo GIF in `media/` — none of
  which belong in the shipped extension; package dropped from thousands of stray files
  down to 117 real files, 12 MB
- **Marketplace README** — the demo GIF and header icon were invisible on the
  Marketplace listing page (raw HTML `<img width=...>` tags rendered at 0×0 there,
  despite working fine on GitHub); switched to plain Markdown image syntax. Also moved
  the "Install from VSIX (Manual)" / build-from-source instructions out of "Getting
  Started" (confusing next to the Marketplace's own Install button) into a separate
  "Contributing / Local Development" section

### Changed
- `@salilvnair/dui` and `@salilvnair/state-machine` are now installed from the public
  npm registry in every remaining place that still had a local `file:` link, matching
  how any other consumer would install them

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
