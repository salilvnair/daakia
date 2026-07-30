# Demo Video Generator

Generates a product-showcase-style demo video (and optionally a GIF) of Daakia
by driving the **real running app** with Playwright — real typing, real HTTP
requests, real UI — then composing the recordings with cinematography-style
camera moves (pan / tilt / zoom, like a gimbal shot) and crossfade transitions
via ffmpeg.

Nothing here ships in the extension — it's a dev-only content tool, same
category as `scripts/build-wiki-captures.mjs`.

## Requirements

- `ffmpeg` on `PATH` (`brew install ffmpeg`)
- `playwright` (devDependency — `npm install` pulls its Chromium build)
- The app running: `npm run local-server` in one terminal, `npm run dev:webview` in another (defaults to `http://localhost:5173`)

## Usage

The fast path — after changing anything in this folder (a recipe, an effect,
`config.json`), regenerate both outputs with one command:

```bash
npm run showcase
```

This runs `record.js` then `compose.js --gif`, writing both
`.output/daakia_showcase.mp4` and `.output/daakia_showcase.gif` — open either
one to check the result of whatever you just changed. Requires the app
running first (`npm run local-server` in one terminal, `npm run dev:webview`
in another).

Or run the steps individually:

```bash
node scripts/demo-video/record.js      # records raw clips to .output/raw/
node scripts/demo-video/compose.js     # composes .output/daakia_showcase.mp4
node scripts/demo-video/compose.js --gif   # also writes .output/daakia_showcase.gif
```

npm script equivalents: `npm run demo-video:record`, `npm run demo-video:compose`,
`npm run demo-video` (record + compose, mp4 only, no gif).

Or point at a different config: `node scripts/demo-video/compose.js path/to/other-config.json`.

`.output/` is gitignored — regenerate anytime, nothing in there is committed.

## Configuring it — `config.json`

This is the only file most changes need to touch.

- **`segments`** — the ordered list of clips. Each one:
  - `recipe` — name of a function in `recipes.js` that drives the real app (see below)
  - `effect` — the camera move for that clip (see the vocabulary below)
  - `trimStartSec` — seconds to cut from the start of the raw recording (the
    page needs a beat to finish loading before the action starts — 1.5s is
    the default; raise it if a clip still shows a loading flash)
  - `options` — passed straight to the recipe (e.g. `{ "url": "..." }`)
- **`intro`** — the typewriter brand card at the start. `badges` is the list
  of protocol pills shown under the tagline.
- **`transitions`** — crossfade `type` (any [ffmpeg xfade transition
  name](https://ffmpeg.org/ffmpeg-filters.html#xfade), e.g. `fade`,
  `circleopen`, `zoomin`, `wipeleft`) and `durationSec`.
- **`output`** — resolution/fps/filename.

### Camera effect vocabulary

Every effect is the same underlying shot: the crop window eases toward a
focal point on the frame while zooming, using a smoothstep curve (zero
velocity at both ends — a cinematic drift, not a constant-speed pan) and
rendered at 2x the output resolution before scaling back down, which is the
standard fix for the jitter/shimmer `zoompan` otherwise shows on crisp UI
edges and text (screen recordings are much less forgiving of this than
photos — see `effects.js`'s top comment for the full explanation). Preset
`zoomTo` values default to a subtle 1.06–1.10x — real product-demo Ken
Burns is gentle enough that you feel the shot is alive without consciously
noticing the camera move; push `zoomTo` higher only deliberately. Named
presets (`effects.js`) are just convenient parameter sets:

| Preset | Feels like |
|---|---|
| `static` | Locked-off, no movement |
| `zoom-in` / `zoom-out` | Push in / pull out, centered |
| `pan-left-right` / `pan-right-left` | Camera drifts sideways while pushing in |
| `tilt-top-down` / `tilt-bottom-up` | Camera drifts vertically while pushing in |
| `zoom-in-top-left`, `-top-right`, `-bottom-left`, `-bottom-right` | Push in toward a corner — good for racking focus onto a specific panel (e.g. a code editor sitting bottom-left) |

For anything a preset doesn't cover, use an object instead of a string and
override any of it directly — this is the fully custom escape hatch:

```json
"effect": { "preset": "zoom-in", "fx": 0.3, "fy": 0.7, "zoomTo": 1.4, "direction": "in" }
```

`fx`/`fy` are the focal point as a fraction of the frame (`0,0` = top-left,
`1,1` = bottom-right, `0.5,0.5` = center). `direction: "out"` reverses the
shot (starts at the focal point/zoomed-in, ends centered/zoomed-out).

### Available recipes (`recipes.js`)

One function per app area shown in the current `config.json`:

| Recipe | Segment | What it shows |
|---|---|---|
| `restRequest` | `rest` | Type a URL, Send, real response |
| `jsonBodyType` | `json_body` | Type a JSON body live, Prettify |
| `aiChatType` | `ai_chat` | Type a message into Daakia AI chat |
| `wsMessageType` | `ws` | Connect, type a WS message |
| `graphqlQueryType` | `graphql` | Type a query, Run |
| `grpcMessageType` | `grpc` | Type endpoint + message |
| `soapEnvelopeType` | `soap` | Type endpoint + XML envelope |
| `mcpServerType` | `mcp` | Type an MCP server command/URL |
| `mockServerRun` | `mock` | Create, start, and Try a mock server |
| `devToolsShow` | `devtools` | Send a request, then show it in DevTools' Network tab |
| `collectionsCreate` | `collections` | Create a new collection |
| `historyShow` | `history` | Send a request, then show it in History |
| `environmentCreate` | `environment` | Create an environment, add a variable |
| `settingsShow` | `settings_general` | Open Settings (lands on General) |
| `settingsProviderShow` | `settings_provider` | Settings → LLM Provider tab |
| `settingsPromptShow` | `settings_prompt` | Settings → Prompt Library tab |

`settingsShow`/`aiChatType`/etc. never touch the AI provider API key field —
that stays off-limits to automation regardless of what recipe is running.

### Adding a new segment

1. If it needs a new action sequence, add a function to `recipes.js` (it's
   just a Playwright `async (page, opts) => {...}` — click things, type
   things, wait). If it types into a Monaco editor, use `typeIntoMonaco()`
   from the same file — it disables Monaco's bracket/quote auto-closing
   first, otherwise typing the literal closing `}`/`"` yourself produces
   duplicated, invalid JSON on screen.
2. Add an entry to `config.json`'s `segments` array referencing the recipe
   by name, with whatever `effect` you want.
3. Re-run `record.js` then `compose.js` (or `npm run showcase` for both).

You can also just ask for a change in plain language ("segment 2 should pan
top-to-bottom instead") — translating that into a `config.json` edit is a
five-second change, no code required for effect changes; only genuinely new
*actions* need a new recipe function.

### Gotchas when writing a new recipe

- **Not every text box is a real `<input>`.** GraphQL/gRPC's URL bars are
  DUI's `HighlightedInputView` — a `contentEditable` div with a decorative
  placeholder `<span>`, not a real `placeholder` attribute — so
  `page.getByPlaceholder(...)` silently finds nothing. Target
  `.dui_highlighted-input__editor` and type into it directly instead (see
  `grpcMessageType`). SOAP/MCP/REST's URL bars, by contrast, *are* real
  inputs with real placeholders — check the component before assuming either
  way.
- **Buttons with a running-state pulse animation aren't "stable."**
  Playwright's click waits for an element to be visible *and geometrically
  stable* before clicking; a CSS animation (e.g. the Mock Server rail icon's
  `mock-server-running` pulse once a server is up) never settles, so the
  click hangs until timeout. Pass `{ force: true }` to skip that check on
  buttons you know are legitimately mid-animation.
- **Settings' side-nav items are `<div onClick>`, not buttons or tabs** —
  use `page.getByText('Section Name', { exact: true })`, not
  `getByRole('button', ...)`.
- **Nothing carries over between segments.** `record.js` opens a fresh
  browser context per clip. A recipe that wants to show History/DevTools
  Network populated with something must fire its own request first, in the
  same recipe.
- **Mock servers created by `mockServerRun` persist** in the local-server
  backend across runs (it's a real server, not a mock of a mock) — re-running
  `npm run showcase` repeatedly accumulates "Demo Mock Server" entries. Not
  cleaned up automatically; restart `local-server` if that annoys you.
