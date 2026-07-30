/**
 * Named Playwright "recipes" — each one drives the real running Daakia app
 * (webview-ui's Vite dev server, backed by local-server) through one live
 * action sequence. config.json's segments reference these by name. Add a
 * new recipe here, then reference its name from config.json to add a new
 * segment to the video — no other file needs to change.
 */

const rail = (page, title) => page.locator(`button[title="${title}"]`).first();

async function typeSlow(page, locator, text, delay = 45) {
  await locator.click({ timeout: 4000 });
  await page.waitForTimeout(200);
  await locator.pressSequentially(text, { delay });
}

// Monaco auto-closes brackets/quotes as you type — typing the literal
// closing chars ourselves on top of that produces duplicated/malformed JSON
// on screen. Disable ONLY that. Auto-indent stays on (its default) so
// pressing Enter mid-object lands the cursor at the right indentation the
// same way a real developer typing would see it — recipe JSON strings
// below rely on this and never include manual leading-space indentation.
async function disableMonacoAutoClose(page) {
  await page.evaluate(() => {
    if (!window.monaco) return;
    window.monaco.editor.getEditors().forEach((ed) =>
      ed.updateOptions({
        autoClosingBrackets: 'never',
        autoClosingQuotes: 'never',
        autoSurround: 'never',
      })
    );
  });
}

async function typeIntoMonaco(page, text, { delay = 32, verifyAsJson = true } = {}) {
  await disableMonacoAutoClose(page);
  const editor = page.locator('.monaco-editor').first();
  await editor.click({ timeout: 4000 });
  await page.waitForTimeout(150);
  // Some editors (e.g. WS Communication) start with default placeholder
  // content already in them — clear it first, otherwise the typed text is
  // just inserted at the cursor and produces malformed, duplicated content.
  const isMac = process.platform === 'darwin';
  await page.keyboard.press(isMac ? 'Meta+A' : 'Control+A');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(100);
  await page.keyboard.type(text, { delay });
  await page.waitForTimeout(150);

  if (!verifyAsJson) return;
  // Safety net: some Monaco language modes (JSON's included) auto-insert a
  // closing bracket via their own onEnterRules/bracket logic independent of
  // the `autoClosingBrackets` editor option above, which the option alone
  // doesn't catch — verified live, typing `{...}` can still leave a stray
  // trailing `}` even with auto-close "disabled". Compare semantically (not
  // string-equal — auto-indent legitimately adds whitespace `text` doesn't
  // have, that's fine and worth keeping); only overwrite when the on-screen
  // content isn't actually the same JSON, which is exactly the "error
  // visible in the video" bug this exists to catch.
  const actual = await page.evaluate(() => window.monaco?.editor.getEditors()[0]?.getValue());
  let matches = false;
  try {
    matches = actual !== undefined && JSON.stringify(JSON.parse(actual)) === JSON.stringify(JSON.parse(text));
  } catch { /* actual isn't valid JSON at all — needs correction */ }
  if (!matches) {
    let corrected = text;
    try { corrected = JSON.stringify(JSON.parse(text), null, 2); } catch { /* text itself isn't JSON; use as-is */ }
    await page.evaluate((value) => {
      window.monaco.editor.getEditors()[0].getModel().setValue(value);
    }, corrected);
  }
}

// Click a "Prettify"/"Prettify JSON" toolbar button if the panel has one
// (REST's Body tab does; WS's Communication tab doesn't) — a nice finishing
// beat after typing, and a safety net if auto-indent alone isn't perfectly
// tidy. No-ops quietly if there's no such button in the current panel.
async function clickPrettifyIfPresent(page) {
  const btn = page.locator('button[title="Prettify"], button[title="Prettify JSON"]').first();
  if (await btn.count()) {
    await btn.click({ timeout: 2000 }).catch(() => {});
  }
}

const recipes = {
  async restRequest(page, opts = {}) {
    const url = opts.url || 'https://jsonplaceholder.typicode.com/users/1';
    await rail(page, 'REST').click();
    await page.getByRole('button', { name: 'New Tab' }).click();
    await page.waitForTimeout(400);
    const urlBox = page.getByPlaceholder('Enter a URL or paste a cURL command').first();
    await typeSlow(page, urlBox, url, opts.typeDelay || 45);
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForTimeout(opts.settleMs ?? 2200);
  },

  async jsonBodyType(page, opts = {}) {
    const url = opts.url || 'https://jsonplaceholder.typicode.com/posts';
    // No manual leading-space indentation here — Monaco auto-indents each
    // new line as it's typed, same as a real developer would see.
    const json = opts.json || '{\n"title": "Daakia is fast",\n"body": "Live JSON typing demo",\n"userId": 1\n}';
    await rail(page, 'REST').click();
    await page.getByRole('button', { name: 'New Tab' }).click();
    await page.waitForTimeout(400);
    const urlBox = page.getByPlaceholder('Enter a URL or paste a cURL command').first();
    await urlBox.fill(url);
    await page.waitForTimeout(300);
    await page.getByRole('tab', { name: 'Body', exact: true }).click({ timeout: 4000 });
    await page.waitForTimeout(500);
    await page.getByText('None', { exact: true }).first().click({ timeout: 4000 });
    await page.waitForTimeout(300);
    await page.getByText('application/json', { exact: true }).first().click({ timeout: 4000 });
    await page.waitForTimeout(500);
    await typeIntoMonaco(page, json, { delay: opts.typeDelay || 35 });
    await page.waitForTimeout(400);
    await clickPrettifyIfPresent(page);
    await page.waitForTimeout(opts.settleMs ?? 1000);
  },

  async aiChatType(page, opts = {}) {
    const message = opts.message || 'How do I generate a mock server from this collection?';
    await page.locator('button[title="Daakia AI"]').first().click();
    await page.waitForTimeout(600);
    const chatInput = page.getByPlaceholder('Ask anything about APIs, REST, GraphQL, mocks, cURL, tests…');
    await typeSlow(page, chatInput, message, opts.typeDelay || 40);
    await page.waitForTimeout(opts.settleMs ?? 1200);
  },

  async wsMessageType(page, opts = {}) {
    // No manual indentation — see jsonBodyType's comment. WS's Communication
    // tab has no Prettify button, so auto-indent-while-typing is the only pass.
    const json = opts.json || '{\n"type": "subscribe",\n"channel": "orders"\n}';
    await rail(page, 'Real time').click();
    await page.getByRole('button', { name: 'New Tab' }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Connect', exact: true }).click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(900);
    await typeIntoMonaco(page, json, { delay: opts.typeDelay || 35 });
    await page.waitForTimeout(opts.settleMs ?? 900);
  },

  async graphqlQueryType(page, opts = {}) {
    const query = opts.query || '{\nusers {\nid\nname\n}\n}';
    await rail(page, 'GraphQL').click();
    await page.getByRole('button', { name: 'New Tab' }).click();
    await page.waitForTimeout(500);
    // GraphQL query syntax isn't valid JSON — skip the JSON-correctness
    // safety net (it would misfire and overwrite good content).
    await typeIntoMonaco(page, query, { delay: opts.typeDelay || 35, verifyAsJson: false });
    await page.waitForTimeout(300);
    // Running a query doesn't require Connect/introspection first — this
    // still fires a real request; failures (unreachable endpoint) are caught
    // so the clip keeps recording either way.
    await page.locator('button[title="Run query"]').click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(opts.settleMs ?? 1200);
  },

  async grpcMessageType(page, opts = {}) {
    const endpoint = opts.endpoint || 'localhost:50051';
    const message = opts.message || '{\n"name": "Daakia"\n}';
    await rail(page, 'gRPC').click();
    await page.getByRole('button', { name: 'New Tab' }).click();
    await page.waitForTimeout(400);
    // gRPC's endpoint bar is DUI's HighlightedInputView — a contentEditable
    // div with a decorative placeholder <span>, not a real <input>, so
    // getByPlaceholder never matches it. Click + type into the editor div
    // directly instead (same trick works for any HighlightedInputView).
    const endpointBox = page.locator('.dui_highlighted-input__editor').first();
    await typeSlow(page, endpointBox, endpoint, opts.typeDelay || 45);
    await page.waitForTimeout(300);
    await page.getByRole('tab', { name: 'Message', exact: true }).click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(400);
    // No real endpoint is reachable here, so this demonstrates the message
    // editor rather than a live Invoke — Invoke also needs a method picked
    // via reflection/proto upload first, which needs a real gRPC server.
    await typeIntoMonaco(page, message, { delay: opts.typeDelay || 35 });
    await page.waitForTimeout(opts.settleMs ?? 900);
  },

  async soapEnvelopeType(page, opts = {}) {
    const endpoint = opts.endpoint || 'http://localhost:8080/soap';
    const envelope = opts.envelope
      || '<?xml version="1.0"?>\n<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">\n<soap:Body>\n<GetData xmlns="http://example.com/">\n<id>1</id>\n</GetData>\n</soap:Body>\n</soap:Envelope>';
    await rail(page, 'SOAP').click();
    await page.getByRole('button', { name: 'New Tab' }).click();
    await page.waitForTimeout(400);
    const endpointBox = page.getByPlaceholder('http://localhost:8080/soap').first();
    await typeSlow(page, endpointBox, endpoint, opts.typeDelay || 45);
    await page.waitForTimeout(300);
    // Envelope is the default-active sub-tab — no tab click needed.
    await typeIntoMonaco(page, envelope, { delay: opts.typeDelay || 30, verifyAsJson: false });
    await page.waitForTimeout(opts.settleMs ?? 900);
  },

  async mcpServerType(page, opts = {}) {
    const command = opts.command || 'npx @modelcontextprotocol/server-filesystem /workspace';
    await rail(page, 'MCP').click();
    await page.getByRole('button', { name: 'New Tab' }).click();
    await page.waitForTimeout(400);
    // Whichever transport is default-selected (STDIO or HTTP/SSE) shows one
    // of these two placeholders — match either rather than driving the
    // transport dropdown, which is a fragile interaction to script.
    const cmdBox = page.locator('input[placeholder^="npx"], input[placeholder^="http://localhost:3000"]').first();
    await typeSlow(page, cmdBox, command, opts.typeDelay || 40);
    await page.waitForTimeout(opts.settleMs ?? 900);
  },

  async mockServerRun(page, opts = {}) {
    const name = opts.name || 'Demo Mock Server';
    // Title is dynamic ("Mock Server" / "Mock Server (N running)") — match
    // by prefix, not the exact-title `rail()` helper. When a server from a
    // prior run is already running, this button carries a pulsing
    // `mock-server-running` CSS animation class, which Playwright's
    // actionability check reads as "element is not stable" forever — force
    // the click to skip that check.
    await page.locator('button[title^="Mock Server"]').first().click({ force: true });
    await page.waitForTimeout(500);
    await page.locator('button[title="New mock server"]').click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(400);
    const nameBox = page.getByPlaceholder('Mock server name').first();
    await typeSlow(page, nameBox, name, opts.typeDelay || 45);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Create', exact: true }).click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(800);
    // Button text is literally "▶ Start" / "⏹ Stop" — match by substring.
    await page.getByRole('button', { name: /Start/ }).first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1200);
    // "Try" is disabled until the server actually reports running.
    await page.getByRole('button', { name: 'Try', exact: true }).click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(opts.settleMs ?? 1500);
  },

  async devToolsShow(page, opts = {}) {
    const url = opts.url || 'https://jsonplaceholder.typicode.com/users/1';
    // Fire a real request first so the Network tab has something to show.
    await rail(page, 'REST').click();
    await page.getByRole('button', { name: 'New Tab' }).click();
    await page.waitForTimeout(400);
    const urlBox = page.getByPlaceholder('Enter a URL or paste a cURL command').first();
    await typeSlow(page, urlBox, url, opts.typeDelay || 40);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForTimeout(1500);
    await page.locator('button[title="DevTools (Console / Timeline)"]').click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Network', exact: true }).first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(opts.settleMs ?? 1200);
  },

  async collectionsCreate(page, opts = {}) {
    const name = opts.name || 'Demo Collection';
    await rail(page, 'REST').click();
    await page.waitForTimeout(300);
    await rail(page, 'Collections').click();
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: 'New', exact: true }).first().click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(600);
    const nameBox = page.getByPlaceholder('Collection name').first();
    await typeSlow(page, nameBox, name, opts.typeDelay || 45).catch(() => {});
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Save', exact: true }).click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(opts.settleMs ?? 1200);
  },

  async historyShow(page, opts = {}) {
    const url = opts.url || 'https://jsonplaceholder.typicode.com/todos/1';
    // Fire a real request first so History has an entry to display — each
    // recipe runs in a fresh browser context, nothing carries over between
    // segments.
    await rail(page, 'REST').click();
    await page.getByRole('button', { name: 'New Tab' }).click();
    await page.waitForTimeout(400);
    const urlBox = page.getByPlaceholder('Enter a URL or paste a cURL command').first();
    await typeSlow(page, urlBox, url, opts.typeDelay || 40);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForTimeout(1800);
    await rail(page, 'History').click();
    await page.waitForTimeout(opts.settleMs ?? 1000);
  },

  async environmentCreate(page, opts = {}) {
    const varKey = opts.varKey || 'baseUrl';
    const varValue = opts.varValue || 'https://api.example.com';
    await rail(page, 'REST').click();
    await page.waitForTimeout(300);
    await rail(page, 'Environments').click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'New', exact: true }).first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('button[title="Add new row"]').first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(300);
    const keyBox = page.getByPlaceholder('Variable name').first();
    await typeSlow(page, keyBox, varKey, opts.typeDelay || 40);
    const valueBox = page.getByPlaceholder('Initial value').first();
    await typeSlow(page, valueBox, varValue, opts.typeDelay || 40);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Save', exact: true }).click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(opts.settleMs ?? 900);
  },

  async mockServerShow(page) {
    await rail(page, 'Mock Server').click();
    await page.waitForTimeout(900);
  },

  async settingsShow(page) {
    await page.locator('button[title="Settings"]').click();
    await page.waitForTimeout(900);
  },

  async settingsProviderShow(page) {
    await page.locator('button[title="Settings"]').click();
    await page.waitForTimeout(700);
    // Settings side-nav items are plain <div>s, not role="button" — match
    // by text, not getByRole.
    await page.getByText('LLM Provider', { exact: true }).first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(900);
  },

  async settingsPromptShow(page) {
    await page.locator('button[title="Settings"]').click();
    await page.waitForTimeout(700);
    await page.getByText('Prompt Library', { exact: true }).first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(900);
  },
};

module.exports = { recipes, rail, typeSlow, typeIntoMonaco, disableMonacoAutoClose, clickPrettifyIfPresent };
