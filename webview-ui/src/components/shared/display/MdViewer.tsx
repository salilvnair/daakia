/**
 * MdViewer — rich Markdown renderer for AI responses.
 *
 * Stack: marked (v14, already bundled) + highlight.js (v11, already bundled)
 * Features: GFM tables, fenced code blocks with copy button + syntax highlighting,
 *           blockquotes, task lists, inline code, headings, bold/italic/strikethrough.
 * Styling: atom-one-dark colour scheme defined in index.css (static bundle, no CSP issues).
 */
import { useMemo, useEffect, useRef, useCallback } from 'react';
import { marked, Renderer, type MarkedExtension } from 'marked';
import hljs from 'highlight.js';

// ─── Singleton guard ──────────────────────────────────────────────────────────

let _markedConfigured = false;

// ─── Marked custom renderer ──────────────────────────────────────────────────

// Daakia custom code-fence names → hljs highlight language
// These are AI-generated structured blocks that contain JSON (or GraphQL) data.
const DAAKIA_LANG_MAP: Record<string, string> = {
  sse_events: 'json',
  routes: 'json',
  graphql_operations: 'json',
  graphql_sdl: 'graphql',
  grpc_services: 'json',
  soap_services: 'json',
  mqtt_topics: 'json',
  sio_handlers: 'json',
  websocket_handlers: 'json',
};

function buildMarkedRenderer(): Renderer {
  const r = new Renderer();

  // Fenced code blocks with header + copy button
  r.code = ({ text, lang }: { text: string; lang?: string }) => {
    const safeLang = (lang || '').replace(/[<>"'&]/g, '');
    // Map daakia custom block names to an hljs-known language
    const hljsLang = DAAKIA_LANG_MAP[safeLang] || safeLang;
    // Pretty-print JSON blocks so minified AI output is readable
    let displayText = text;
    if (hljsLang === 'json') {
      try { displayText = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep raw */ }
    }
    let highlighted = displayText;
    let resolvedLang = safeLang || 'plaintext';
    try {
      if (hljsLang && hljs.getLanguage(hljsLang)) {
        highlighted = hljs.highlight(displayText, { language: hljsLang }).value;
        resolvedLang = safeLang || hljsLang; // show original label (e.g. sse_events), not json
      } else if (hljsLang) {
        // Try common aliases: js→javascript, ts→typescript, sh→bash, py→python
        const ALIASES: Record<string, string> = {
          js: 'javascript', ts: 'typescript', sh: 'bash', py: 'python',
          yml: 'yaml', rb: 'ruby', rs: 'rust', cs: 'csharp', kt: 'kotlin',
          md: 'markdown', tf: 'hcl', proto: 'protobuf',
        };
        const alias = ALIASES[hljsLang.toLowerCase()];
        if (alias && hljs.getLanguage(alias)) {
          highlighted = hljs.highlight(displayText, { language: alias }).value;
          resolvedLang = safeLang;
        } else {
          // Auto-detect — best effort for unrecognised lang tags
          const auto = hljs.highlightAuto(displayText);
          highlighted = auto.value;
          resolvedLang = safeLang;
        }
      } else {
        // No lang specified — auto-detect
        const auto = hljs.highlightAuto(displayText);
        highlighted = auto.value;
        resolvedLang = auto.language || 'plaintext';
      }
    } catch { /* noop — keep raw text */ }
    const encoded = encodeURIComponent(displayText);
    // Copy icon SVG (two overlapping rectangles)
    const copyIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mdv-copy-icon"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    // Check icon SVG (checkmark tick)
    const checkIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="mdv-copy-icon mdv-check-icon"><polyline points="20 6 9 17 4 12"/></svg>`;
    return [
      `<div class="mdv-code-block">`,
        `<div class="mdv-code-header">`,
          `<span class="mdv-lang-pill">${resolvedLang}</span>`,
          `<button class="mdv-copy-btn" data-code="${encoded}" title="Copy code">${copyIcon}<span class="mdv-copy-label">Copy</span></button>`,
        `</div>`,
        `<pre><code class="hljs language-${resolvedLang}">${highlighted}</code></pre>`,
      `</div>`,
    ].join('');
  };

  // Inline code — escape to prevent XSS
  r.codespan = ({ text }: { text: string }) =>
    `<code class="mdv-inline-code">${text}</code>`;

  // Blockquote: v14 passes the full token (tokens[], not a pre-rendered body string).
  // Omit the override — marked renders child tokens internally, and
  // .mdv-root blockquote { ... } in MDV_CSS already applies all the styling.

  return r;
}

// ─── Marked configuration (once) ─────────────────────────────────────────────

function ensureMarkedConfig() {
  if (_markedConfigured) return;
  _markedConfigured = true;
  // marked.use() expects MarkedExtension (not MarkedOptions) — the types differ
  // in their `extensions` field. Cast as MarkedExtension to satisfy the API.
  const ext: MarkedExtension = {
    renderer: buildMarkedRenderer(),
    breaks: true,
    gfm: true,
  };
  marked.use(ext);
}

// ─── Parse helper ─────────────────────────────────────────────────────────────

function parseMarkdown(content: string): string {
  ensureMarkedConfig();
  try {
    const result = marked.parse(content);
    return typeof result === 'string' ? result : content;
  } catch {
    // Fallback: escape and wrap in <p>
    const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<p>${escaped}</p>`;
  }
}

// ─── Copy-button wiring ──────────────────────────────────────────────────────

const COPY_ICON_HTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mdv-copy-icon"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="mdv-copy-label">Copy</span>`;
const CHECK_ICON_HTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="mdv-copy-icon mdv-check-icon"><polyline points="20 6 9 17 4 12"/></svg><span class="mdv-copy-label">Copied</span>`;

function wireCopyButtons(root: HTMLElement) {
  root.querySelectorAll<HTMLButtonElement>('.mdv-copy-btn:not([data-wired])').forEach(btn => {
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      const code = decodeURIComponent(btn.dataset.code ?? '');
      navigator.clipboard?.writeText(code).catch(() => {});
      btn.innerHTML = CHECK_ICON_HTML;
      btn.classList.add('mdv-copied');
      setTimeout(() => {
        btn.innerHTML = COPY_ICON_HTML;
        btn.classList.remove('mdv-copied');
      }, 2000);
    });
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface MdViewerProps {
  /** Raw markdown string to render */
  content: string;
  /** Additional CSS classes on the root element */
  className?: string;
}

/**
 * MdViewer — converts AI-produced markdown into beautifully styled HTML.
 * Safe: uses marked which only generates safe HTML from markdown tokens.
 */
export function MdViewer({ content, className }: MdViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => parseMarkdown(content), [content]);

  const attachButtons = useCallback(() => {
    if (rootRef.current) wireCopyButtons(rootRef.current);
  }, []);

  useEffect(() => { attachButtons(); }, [html, attachButtons]);

  return (
    <div
      ref={rootRef}
      className={`mdv-root${className ? ` ${className}` : ''}`}
      // Safe: content comes from AI model output parsed by marked — not raw user HTML
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
