/**
 * A collection as one self-contained HTML page.
 *
 * ── Why not the Markdown export ──
 *
 * That produces a single `.md` — fine for a diff, poor for reading, and
 * nobody's docs site takes it as-is. The AI generator produces HTML into a
 * modal you copy out of, which is not a file at all. Neither is the thing
 * people actually want: something to drop in `docs/`, open in a browser, and
 * send a colleague a link to.
 *
 * ── Self-contained, to the letter ──
 *
 * One file. No CDN, no fonts, no scripts fetched at open time — because this
 * gets committed to a repo, opened from a file:// URL behind a VPN, and read
 * on a laptop with no network. A docs page that needs the internet to render
 * is a docs page that fails exactly when someone is debugging.
 *
 * Everything interpolated is escaped: the input is URLs, headers and response
 * bodies from whatever server the user talks to, and this file gets opened in
 * a browser. Treating that as trusted would be handing a page a script it
 * never wrote.
 */

interface DocsRequest {
  id: string;
  name: string;
  method?: string;
  url?: string;
  data?: string;
}

export interface DocsNode {
  id: string;
  name: string;
  children: DocsNode[];
  requests: DocsRequest[];
}

/** HTML text escaping, applied to every value that comes from a request. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The markdown people actually write in a Docs tab.
 *
 * Headings, bold, italics, inline code, fenced code, lists, links and
 * paragraphs — deliberately not a full parser. The webview has one and dui
 * has another; neither runs in the extension host, and a third full
 * implementation would be a third thing to keep in step. This covers what a
 * request description contains, and anything else survives as plain text
 * rather than as broken markup.
 *
 * Escaping happens FIRST, so markup in the source is text, and only the tags
 * this function adds are tags.
 */
export function renderMarkdown(source: string): string {
  const lines = esc(source).split('\n');
  const out: string[] = [];
  let inCode = false;
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith('```')) {
      closeList();
      out.push(inCode ? '</code></pre>' : '<pre class="code"><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) { out.push(line); continue; }

    if (!line.trim()) { closeList(); continue; }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = Math.min(6, heading[1]!.length + 2);
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (bullet || numbered) {
      const want = bullet ? 'ul' : 'ol';
      if (listType !== want) { closeList(); out.push(`<${want}>`); listType = want; }
      out.push(`<li>${inline((bullet ?? numbered)![1]!)}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  if (inCode) out.push('</code></pre>');
  return out.join('\n');
}

/** Inline marks, on already-escaped text. */
function inline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    // Only http(s) links become anchors. `javascript:` in a response body is
    // exactly the kind of thing this page must render as text.
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noreferrer noopener">$1</a>');
}

interface Section { anchor: string; title: string; depth: number }

function slug(parts: string[]): string {
  return parts.join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
}

/** Everything about one request, as a section of the page. */
function requestSection(request: DocsRequest, anchor: string): string {
  let data: Record<string, unknown> = {};
  try { data = request.data ? JSON.parse(request.data) as Record<string, unknown> : {}; } catch { /* unreadable */ }

  const parts: string[] = [
    `<section id="${esc(anchor)}">`,
    `<h3><span class="m m-${esc((request.method || 'get').toLowerCase())}">${esc(request.method || 'GET')}</span> ${esc(request.name)}</h3>`,
    `<p class="url">${esc(request.url || '')}</p>`,
  ];

  if (typeof data.docs === 'string' && data.docs.trim()) {
    parts.push(`<div class="docs">${renderMarkdown(data.docs)}</div>`);
  }

  const table = (title: string, rows: { key?: string; value?: string; enabled?: boolean }[]) => {
    const live = rows.filter(r => r && r.enabled !== false && r.key);
    if (live.length === 0) return;
    parts.push(`<h4>${esc(title)}</h4><table>`);
    for (const r of live) parts.push(`<tr><td class="k">${esc(r.key)}</td><td>${esc(r.value ?? '')}</td></tr>`);
    parts.push('</table>');
  };
  if (Array.isArray(data.params)) table('Query parameters', data.params as never);
  if (Array.isArray(data.headers)) table('Headers', data.headers as never);

  if (typeof data.bodyRaw === 'string' && data.bodyRaw.trim()) {
    parts.push('<h4>Request body</h4>');
    parts.push(`<pre class="code"><code>${esc(data.bodyRaw.trim())}</code></pre>`);
  }

  const examples = Array.isArray(data.examples) ? data.examples as Record<string, unknown>[] : [];
  if (examples.length > 0) {
    parts.push('<h4>Responses</h4>');
    for (const ex of examples) {
      const status = typeof ex.status === 'number' ? ex.status : 0;
      const tone = status >= 500 ? 'bad' : status >= 400 ? 'warn' : status >= 200 ? 'ok' : 'muted';
      parts.push(
        `<div class="ex"><div class="ex-head"><span class="st st-${tone}">${esc(status || '—')}</span>`
        + `<span>${esc(ex.name ?? ex.statusText ?? '')}</span></div>`
        + `<pre class="code"><code>${esc(typeof ex.body === 'string' ? ex.body : '')}</code></pre></div>`,
      );
    }
  }

  parts.push('</section>');
  return parts.join('\n');
}

/**
 * The whole page.
 *
 * A nav down the left with every collection, folder and request, and the
 * sections beside it — which is how anybody reads API documentation, and what
 * a single Markdown file cannot be.
 */
export function buildDocsHtml(nodes: DocsNode[], title = 'API Documentation'): string {
  const sections: Section[] = [];
  const body: string[] = [];

  const walk = (node: DocsNode, trail: string[], depth: number) => {
    const path = [...trail, node.name];
    const anchor = slug(path);
    sections.push({ anchor, title: node.name, depth });
    body.push(`<h2 id="${esc(anchor)}">${esc(node.name)}</h2>`);

    for (const request of node.requests) {
      const reqAnchor = slug([...path, request.name, request.id.slice(0, 6)]);
      sections.push({ anchor: reqAnchor, title: request.name, depth: depth + 1 });
      body.push(requestSection(request, reqAnchor));
    }
    for (const child of node.children) walk(child, path, depth + 1);
  };
  for (const node of nodes) walk(node, [], 0);

  const nav = sections
    .map(s => `<a class="d${s.depth}" href="#${esc(s.anchor)}">${esc(s.title)}</a>`)
    .join('\n');

  const generated = new Date().toISOString().split('T')[0];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#fff;--ink:#141416;--ink2:#585862;--line:#e4e4e9;--panel:#f7f7fa;--code:#f3f3f7;
--ok:#137a4a;--warn:#9a6400;--bad:#b4232b;--muted:#6a6a75;--accent:#4b4bd6}
@media (prefers-color-scheme:dark){:root{--bg:#131316;--ink:#e6e6ea;--ink2:#a3a3ad;--line:#2a2a31;
--panel:#191920;--code:#1d1d25;--ok:#4ec98a;--warn:#e0a54a;--bad:#f2777f;--muted:#8b8b96;--accent:#9a9aff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);display:flex;
font:14px/1.6 ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif}
nav{width:250px;flex:0 0 250px;height:100vh;overflow:auto;position:sticky;top:0;
padding:20px 12px;border-right:1px solid var(--line);background:var(--panel)}
nav a{display:block;padding:3px 8px;color:var(--ink2);text-decoration:none;border-radius:5px;
font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
nav a:hover{background:var(--bg);color:var(--ink)}
nav a.d0{font-weight:600;color:var(--ink);margin-top:10px}
nav a.d1{padding-left:18px}nav a.d2{padding-left:30px}nav a.d3{padding-left:42px}
main{flex:1;min-width:0;padding:28px 36px 80px;max-width:900px}
h1{font-size:26px;margin:0 0 4px;letter-spacing:-.02em}
h2{font-size:19px;margin:34px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--line)}
h3{font-size:15px;margin:22px 0 4px;display:flex;align-items:center;gap:8px}
h4{font-size:11px;margin:16px 0 4px;text-transform:uppercase;letter-spacing:.09em;color:var(--ink2)}
p{margin:6px 0}
.sub{color:var(--ink2);font-size:12.5px;margin-bottom:20px}
.url{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;color:var(--ink2);
word-break:break-all;margin:2px 0 0}
.m{font:700 10px/1 ui-monospace,monospace;letter-spacing:.06em;padding:3px 6px;border-radius:4px;
border:1px solid var(--line);color:var(--accent)}
.m-get{color:var(--ok)}.m-post{color:var(--accent)}.m-put{color:var(--warn)}
.m-patch{color:var(--warn)}.m-delete{color:var(--bad)}
table{border-collapse:collapse;width:100%;font-size:12.5px;margin:4px 0}
td{border-bottom:1px solid var(--line);padding:5px 8px;vertical-align:top;word-break:break-word}
td.k{width:34%;font-family:ui-monospace,monospace;color:var(--ink2)}
pre.code{background:var(--code);border:1px solid var(--line);border-radius:7px;padding:10px 12px;
overflow-x:auto;font-size:12px;margin:4px 0}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.docs{border-left:2px solid var(--line);padding-left:12px;margin:8px 0;color:var(--ink2)}
.docs h3,.docs h4,.docs h5{color:var(--ink);text-transform:none;letter-spacing:0;font-size:13.5px;margin:10px 0 2px}
.ex{margin:8px 0}
.ex-head{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink2)}
.st{font:700 11px/1 ui-monospace,monospace;padding:3px 6px;border-radius:4px;border:1px solid var(--line)}
.st-ok{color:var(--ok)}.st-warn{color:var(--warn)}.st-bad{color:var(--bad)}.st-muted{color:var(--muted)}
@media(max-width:760px){body{display:block}nav{width:auto;height:auto;position:static;border-right:0;
border-bottom:1px solid var(--line)}main{padding:20px}}
</style>
</head>
<body>
<nav>${nav}</nav>
<main>
<h1>${esc(title)}</h1>
<p class="sub">Generated by Daakia on ${esc(generated)}</p>
${body.join('\n')}
</main>
</body>
</html>
`;
}
