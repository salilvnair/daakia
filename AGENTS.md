# Working in this codebase

## Every AI call goes through one door

`webview-ui/src/services/ai/ai-client.ts` — `sendAiRequest({ stage, screen, … })`,
or `new AiClient(screen)` for a panel that makes several.

```ts
sendAiRequest({
  stage: 'rest.docs.generate',   // the feature — must be a prompt-library key
  screen: 'REST · Docs',         // where the user was standing
  systemPrompts: [resolve('rest.docs.generate.system')],
  userPrompt: resolve('rest.docs.generate', { … }),
});
```

Do **not** post `ai:send` by hand — `ai-client.test.ts` fails if any other file
does. Every feature that built its own payload was a copy of a contract free to
get a field name wrong, and four of them did: they posted `reqId`,
`systemPrompt` and `messages`, none of which the host reads, so those buttons
spun forever and answered nothing. It is also how the audit trail came to have
no AI in it at all.

That test guards three things at once: only the client builds the message,
every call site passes a `screen`, and every `stage` it passes is one the audit
can put a name to.

### The three things a feature needs

1. **A prompt key** in `webview-ui/src/store/prompt-template.ts` — the user
   half and the `.system` half, plus an entry in the labels, the variables and
   the colour maps. `src/panel/chat/prompt-keys.test.ts` fails if a key is sent
   and never registered.
2. **A stage** equal to that key. The audit event, its checkbox and its name in
   both audit screens are generated from it — see
   `webview-ui/src/store/ai-audit-events.ts`. Nothing to add by hand.
   A call whose prompt genuinely cannot live in the library — the chat takes
   its instructions from the tab — is named in `EXTRA_AI_FEATURES` in that same
   file. Prefer a library key: the user can edit those.
3. **A screen** from the `AiScreen` union. If a new one is needed, add it there
   and to the prefix table in `ai-audit-events.ts`.

### Read the reply the way the host sends it

`ai:chunk` carries `delta` (sometimes `text`), `ai:complete` carries
`message.content`, and all three arrive under **`tabId`** — the id
`sendAiRequest` returns. Listening for `reqId`, or reading `msg.chunk`, is the
exact shape of the four dead buttons above: the request goes out, the answer
comes back, and nothing is listening on the name it came under.

## Auditing, generally

`logUiEvent(id, metadata)` in `webview-ui/src/store/ui-audit-store.ts`, with the
event declared in `AUDIT_EVENT_DEFS`. Two rules learned the hard way:

- **A declared event with no call site is worse than no event.** It offers the
  user a checkbox for something that can never happen. Twenty-six dk8s events
  lived like that for months.
- **A module missing from `MODULE_ORDER` in `AuditConfigTab.tsx` is invisible**,
  even though its events fire — twenty-three of them were, including all of AI.
  Anything not listed now falls in at the end rather than vanishing.

Never put a value in audit metadata that could be a secret. Chained variables
are recorded by **name only**: an extracted value is a token as often as not.

## No emoji in the UI

Not in labels, not in status marks, not in console output the DevTools panel
shows. Emoji render differently on every platform, sit off the baseline of
every icon beside them, and cannot take the theme's colour. Use the icon set —
`webview-ui/src/icons/daakia-icons.tsx`, or dui's, which the package re-exports.

The one exception is the wiki pages under `webview-ui/src/pages/wiki/`, whose
section headings use them as a deliberate part of that design.

Geometric marks are not emoji and stay: the caret that rotates to expand a row,
the direction arrows in the protocol console. What goes is the picture in front
of words that already say the thing — "Run All", not "▶ Run All".

When you take one out, look at what it was holding up. Stripping the paperclip
from the multipart body display left `startsWith('')`, true of every line, so
every text field rendered as a file card; stripping the icons from the welcome
sidebar left sixty rows indented past an empty 16px gutter.

## Reusable UI belongs to dui

`@salilvnair/dui` is a `file:` symlink to `../../dui`. After changing dui, run
`npm run build:lib` **there** and restart Vite — it pre-bundles the package and
serves the old copy until it re-optimises. If a component is being written for
the second time in the webview, it belongs in dui instead: the app carried its
own `StyledDropdown` beside dui's `SelectInputView` for months, and the two
drifted apart in exactly the ways you would expect.
