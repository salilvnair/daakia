#!/usr/bin/env node
/**
 * A model that is not a model.
 *
 * Every AI screen in Daakia was unprovable without a key. The failure they
 * showed was also a lie: "the model did not answer" is what appeared when
 * nothing had been asked, because the socket to the configured provider was
 * refused before a request was ever written to it. So the one screen you could
 * not check was also the one telling you the most confident wrong thing.
 *
 * This answers. It speaks the OpenAI chat-completions shape — the one the
 * `daakia-mock` provider is pointed at — streams like the real thing, and
 * makes up content that fits whatever was asked for:
 *
 *   - A prompt that ends in a JSON sketch gets that sketch back, filled in.
 *     Most of the ninety-odd templates in the Prompt Library end that way, so
 *     most of them get something their parser accepts without this file
 *     knowing anything about them.
 *   - dkgh's issue composer gets a real answer: its fields are parsed out of
 *     the prompt, the dropdowns are answered from their own options, and some
 *     are deliberately left unanswered, because a proposal where everything is
 *     filled in never exercises the half of that screen that asks questions.
 *   - Anything else gets prose.
 *
 * It is not a language model and does not pretend to be one. The words are
 * filler. What it proves is the wiring: request built, sent, streamed, parsed,
 * rendered.
 *
 *   node scripts/mock-ai-server.js [--port 8000]
 *
 * Then in Settings → AI Providers, pick DaakiaAI (Mock) and set its base URL
 * to http://localhost:8000/v1 — every AI screen in the app then answers.
 *
 * Loopback only, by deliberate choice: it answers anything to anyone and has
 * no business being reachable from another machine. Both loopbacks, though —
 * on Windows `localhost` resolves to ::1 first, so a server bound to 127.0.0.1
 * alone is refused by a client that was configured with the name rather than
 * the number. That refusal is exactly the failure this file exists to remove,
 * and it would have been blamed on the model again.
 */
const http = require('http');

const argv = process.argv.slice(2);
const portAt = argv.indexOf('--port');
const PORT = Number(portAt >= 0 ? argv[portAt + 1] : process.env.PORT || 8000);
const HOSTS = ['127.0.0.1', '::1'];

const MODEL = 'mock1-model';

// ── Making things up ────────────────────────────────────────────────────────

const FILLER = [
  'this is mock output',
  'nothing here was inferred from your data',
  'the wiring works; the words do not mean anything',
  'replace this provider with a real one for real answers',
];
let fillerAt = 0;
const filler = () => FILLER[fillerAt++ % FILLER.length];

/** The last balanced `{...}` block in a string — the schema a prompt asks for. */
function lastObject(text) {
  const to = text.lastIndexOf('}');
  if (to < 0) return null;
  let depth = 0;
  for (let i = to; i >= 0; i--) {
    if (text[i] === '}') depth++;
    else if (text[i] === '{') {
      depth--;
      if (depth === 0) return text.slice(i, to + 1);
    }
  }
  return null;
}

/**
 * Fill a schema's leaves.
 *
 * The sketch in a prompt is JSON-shaped rather than JSON — `"<field label>"`,
 * `"one line"` — so its keys are the part worth keeping and its values are
 * placeholders by construction. Replacing every leaf means the answer has the
 * schema's shape whatever the schema was.
 */
function fill(node, key) {
  if (Array.isArray(node)) return node.length ? [fill(node[0], key)] : [];
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = fill(v, k);
    return out;
  }
  if (typeof node === 'number') return 1;
  if (typeof node === 'boolean') return true;
  const name = String(key || '').toLowerCase();
  if (/^(title|name|summary|headline)$/.test(name)) return 'Mock answer — not a real finding';
  if (/(score|count|ms|seconds|percent)/.test(name)) return 1;
  return filler();
}

/** dkgh's field list, back out of the prompt it was rendered into. */
function parseFields(text) {
  const out = [];
  const block = /Fields:\n([\s\S]*?)\n\s*\n/.exec(text);
  const body = block ? block[1] : text;
  for (const line of body.split('\n')) {
    const m = /^- (.+?) \((.+?)\)(\s*\[required\])?\s*$/.exec(line.trim());
    if (!m) continue;
    const options = m[2].startsWith('one of: ')
      ? m[2].slice('one of: '.length).split(',').map(s => s.trim()).filter(Boolean)
      : [];
    out.push({ label: m[1], options, required: !!m[3] });
  }
  return out;
}

/** What the reporter wrote, for quoting back at them. */
function describedIn(text) {
  const m = /What the reporter wrote:\n([\s\S]*)$/.exec(text);
  return (m ? m[1] : '').trim();
}

/**
 * The issue composer's answer.
 *
 * Half the fields answered and half not, on purpose. A proposal with nothing
 * left open renders one panel and exercises none of the question flow that is
 * most of that screen.
 */
function composeAnswer(prompt) {
  const fields = parseFields(prompt);
  const description = describedIn(prompt);
  const first = (description.split(/(?<=[.!?])\s/)[0] || description).slice(0, 80);

  const answers = {};
  const unanswered = [];
  fields.forEach((f, i) => {
    if (i % 2 === 1) {
      unanswered.push({
        label: f.label,
        why: 'the description does not say, and a mock model will not invent one',
      });
      return;
    }
    answers[f.label] = f.options.length
      ? f.options[0]
      : (description.slice(0, 140) || 'mock value');
  });

  return {
    title: first || 'Mock issue from the mock model',
    answers,
    unanswered,
    notes: 'Answered by the local mock server — no model was involved.',
  };
}

/** What to say, given everything the caller sent. */
function answerFor(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const text = messages.map(m => (typeof m.content === 'string'
    ? m.content
    : (Array.isArray(m.content) ? m.content.map(c => c.text || '').join(' ') : ''))).join('\n\n');

  const wantsJson = body.response_format?.type === 'json_object'
    || /answer with json|respond with json|json and nothing else/i.test(text);

  if (/"unanswered"/.test(text) && /Fields:/.test(text)) {
    return JSON.stringify(composeAnswer(text), null, 2);
  }

  if (wantsJson) {
    const sketch = lastObject(text);
    if (sketch) {
      try {
        return JSON.stringify(fill(JSON.parse(sketch)), null, 2);
      } catch {
        /* JSON-shaped rather than JSON, which is the usual case for a sketch
           written for a human to read. Fall through to something generic that
           still parses. */
      }
    }
    return JSON.stringify({
      summary: 'Mock answer — the local mock server replied, no model was involved.',
      details: filler(),
    }, null, 2);
  }

  return [
    'This came from the local mock AI server, not from a model.',
    '',
    `It read ${messages.length} message${messages.length === 1 ? '' : 's'} and `
      + `${text.length.toLocaleString()} characters of prompt, and answered without `
      + 'looking at any of it.',
    '',
    'The point is the wiring: the request was built, sent, streamed back and '
      + 'rendered. Point the provider at a real endpoint for a real answer.',
  ].join('\n');
}

// ── Serving ─────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', c => {
      size += c.length;
      /* A mock with no ceiling is a way to fill a laptop's memory from a typo
         in a loop somewhere. */
      if (size > 8 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); return; }
      raw += c;
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

/** Roughly a word at a time, so the stream is visible rather than instant. */
function chunksOf(text) {
  return text.match(/[\s\S]{1,18}/g) || [];
}

const json = (res, code, obj) => {
  const s = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
  res.end(s);
};

async function handle(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && (path === '/models' || path === '/v1/models')) {
    return json(res, 200, {
      object: 'list',
      data: [{ id: MODEL, object: 'model', owned_by: 'daakia-mock' }],
    });
  }

  if (req.method === 'GET' && path === '/') {
    return json(res, 200, { ok: true, service: 'daakia mock ai', model: MODEL });
  }

  if (req.method !== 'POST' || !/\/chat\/completions$/.test(path)) {
    return json(res, 404, { error: { message: `nothing at ${req.method} ${path}` } });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return json(res, 400, { error: { message: String(e.message || e) } });
  }

  const content = answerFor(body);
  const id = `mock-${Date.now().toString(36)}`;
  const created = Math.floor(Date.now() / 1000);
  const model = body.model || MODEL;
  /* Not a token count. Nothing here tokenises anything, and a number that
     looks like one invites somebody to read it as a cost. */
  const usage = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  console.log(`${new Date().toISOString().slice(11, 19)}  ${req.method} ${path}`
    + `  stream=${!!body.stream}  ${content.length} chars out`);

  if (!body.stream) {
    return json(res, 200, {
      id, object: 'chat.completion', created, model,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage,
    });
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  const parts = chunksOf(content);
  let at = 0;
  const tick = setInterval(() => {
    if (at >= parts.length) {
      clearInterval(tick);
      res.write(`data: ${JSON.stringify({
        id, object: 'chat.completion.chunk', created, model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage,
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify({
      id, object: 'chat.completion.chunk', created, model,
      choices: [{ index: 0, delta: { content: parts[at++] }, finish_reason: null }],
    })}\n\n`);
  }, 18);

  req.on('close', () => clearInterval(tick));
}

let listening = 0;
for (const host of HOSTS) {
  const server = http.createServer(handle);
  server.on('error', err => {
    /* One loopback family missing is not a failure — a machine with IPv6 off
       has no ::1 to bind, and the other half still serves. */
    if (err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT') return;
    console.error(`${host}:${PORT} — ${err.message}`);
    if (!listening) process.exit(1);
  });
  server.listen(PORT, host, () => {
    listening++;
    console.log(`mock ai on http://${host.includes(':') ? `[${host}]` : host}:${PORT}`);
    if (listening < HOSTS.length) return;
    console.log(`  POST /chat/completions   (and /v1/chat/completions)`);
    console.log(`  GET  /models`);
    console.log('');
    console.log(`Settings -> AI Providers -> DaakiaAI (Mock), base URL http://localhost:${PORT}/v1`);
  });
}
