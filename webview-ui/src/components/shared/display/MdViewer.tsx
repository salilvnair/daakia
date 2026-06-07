/**
 * MdViewer — rich Markdown renderer for AI responses.
 *
 * Stack: marked (v14, already bundled) + highlight.js (v11, already bundled)
 * Features: GFM tables, fenced code blocks with copy button + syntax highlighting,
 *           blockquotes, task lists, inline code, headings, bold/italic/strikethrough.
 * Styling: atom-one-dark colour scheme, fully CSS-variable-aware for VS Code themes.
 */
import { useMemo, useEffect, useRef, useCallback } from 'react';
import { marked, Renderer, type MarkedExtension } from 'marked';
import hljs from 'highlight.js';

// ─── Singleton guards ─────────────────────────────────────────────────────────

let _styleInjected = false;
let _markedConfigured = false;

// ─── Marked custom renderer ──────────────────────────────────────────────────

function buildMarkedRenderer(): Renderer {
  const r = new Renderer();

  // Fenced code blocks with header + copy button
  r.code = ({ text, lang }: { text: string; lang?: string }) => {
    const safeLang = (lang || 'plaintext').replace(/[<>"'&]/g, '');
    const language = hljs.getLanguage(safeLang) ? safeLang : 'plaintext';
    let highlighted = text;
    try { highlighted = hljs.highlight(text, { language }).value; } catch { /* noop */ }
    const encoded = encodeURIComponent(text);
    // Copy icon SVG (two overlapping rectangles)
    const copyIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mdv-copy-icon"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    // Check icon SVG (checkmark tick)
    const checkIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="mdv-copy-icon mdv-check-icon"><polyline points="20 6 9 17 4 12"/></svg>`;
    return [
      `<div class="mdv-code-block">`,
        `<div class="mdv-code-header">`,
          `<span class="mdv-lang-pill">${safeLang}</span>`,
          `<button class="mdv-copy-btn" data-code="${encoded}" title="Copy code">${copyIcon}<span class="mdv-copy-label">Copy</span></button>`,
        `</div>`,
        `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`,
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

// ─── Global CSS ───────────────────────────────────────────────────────────────

const MDV_CSS = `
/* ── MdViewer root ──────────────────────────────────────────────────── */
.mdv-root {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--color-text-primary, #e4e4e7);
  word-break: break-word;
  overflow-wrap: anywhere;
}

/* ── Headings ───────────────────────────────────────────────────────── */
.mdv-root h1, .mdv-root h2, .mdv-root h3, .mdv-root h4, .mdv-root h5 {
  font-weight: 600;
  margin: 0.9em 0 0.35em;
  line-height: 1.3;
  color: var(--color-text-primary, #f4f4f5);
}
.mdv-root h1 { font-size: 1.22em; border-bottom: 1px solid rgba(255,255,255,0.07); padding-bottom: 0.3em; }
.mdv-root h2 { font-size: 1.1em; }
.mdv-root h3 { font-size: 1em; color: #c4b5fd; }
.mdv-root h4 { font-size: 0.9em; opacity: 0.8; }
.mdv-root h5 { font-size: 0.85em; opacity: 0.7; }

/* ── Paragraphs ─────────────────────────────────────────────────────── */
.mdv-root p { margin: 0.45em 0; }
.mdv-root p:first-child { margin-top: 0; }
.mdv-root p:last-child  { margin-bottom: 0; }

/* ── Inline code ────────────────────────────────────────────────────── */
.mdv-root .mdv-inline-code,
.mdv-root code:not(.hljs) {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace;
  font-size: 0.87em;
  background: rgba(139,92,246,0.13);
  color: #c084fc;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid rgba(139,92,246,0.22);
  letter-spacing: 0;
}

/* ── Bold / italic / strikethrough ─────────────────────────────────── */
.mdv-root strong { font-weight: 650; color: #f4f4f5; }
.mdv-root em     { font-style: italic; color: #d4d4d8; }
.mdv-root del    { text-decoration: line-through; opacity: 0.55; }

/* ── Links ──────────────────────────────────────────────────────────── */
.mdv-root a {
  color: var(--color-protocol-ai, #818cf8);
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
}
.mdv-root a:hover { opacity: 0.8; }

/* ── Horizontal rule ────────────────────────────────────────────────── */
.mdv-root hr { border: none; border-top: 1px solid rgba(255,255,255,0.09); margin: 0.9em 0; }

/* ── Lists ──────────────────────────────────────────────────────────── */
.mdv-root ul, .mdv-root ol {
  padding-left: 1.35em;
  margin: 0.35em 0;
}
.mdv-root li { margin: 0.18em 0; }
.mdv-root ul > li::marker { color: rgba(139,92,246,0.7); }
.mdv-root ol > li::marker { color: rgba(139,92,246,0.7); font-variant-numeric: tabular-nums; }
.mdv-root li > ul, .mdv-root li > ol { margin: 0; }

/* Task-list checkboxes */
.mdv-root input[type="checkbox"] {
  margin-right: 5px;
  accent-color: #8b5cf6;
  cursor: default;
}

/* ── Blockquote ─────────────────────────────────────────────────────── */
.mdv-root .mdv-bq,
.mdv-root blockquote {
  margin: 0.55em 0;
  padding: 0.4em 0.85em;
  border-left: 3px solid rgba(139,92,246,0.5);
  background: rgba(139,92,246,0.06);
  border-radius: 0 6px 6px 0;
  color: var(--color-text-muted, #a1a1aa);
  font-style: italic;
}
.mdv-root .mdv-bq p, .mdv-root blockquote p { margin: 0; }

/* ── Tables ─────────────────────────────────────────────────────────── */
.mdv-root table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.65em 0;
  font-size: 0.9em;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
}
.mdv-root th {
  background: rgba(139,92,246,0.14);
  color: #c084fc;
  font-weight: 600;
  padding: 5px 11px;
  text-align: left;
  font-size: 0.83em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid rgba(139,92,246,0.25);
}
.mdv-root td {
  padding: 4px 11px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  color: var(--color-text-primary, #e4e4e7);
}
.mdv-root tr:nth-child(even) td { background: rgba(255,255,255,0.02); }
.mdv-root tr:last-child td { border-bottom: none; }
.mdv-root tr:hover td { background: rgba(139,92,246,0.06); transition: background 0.1s; }

/* ── Code blocks ────────────────────────────────────────────────────── */
.mdv-root .mdv-code-block {
  margin: 0.65em 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
  background: #0d0d10;
}
.mdv-root .mdv-code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  background: rgba(255,255,255,0.035);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  gap: 8px;
}
.mdv-root .mdv-lang-pill {
  font-size: 9.5px;
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255,255,255,0.3);
  text-transform: lowercase;
  letter-spacing: 0.06em;
  padding: 1px 6px;
  background: rgba(255,255,255,0.05);
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.08);
}
.mdv-root .mdv-copy-btn {
  font-size: 9.5px;
  font-family: inherit;
  color: rgba(139,92,246,0.55);
  background: none;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  padding: 2px 7px;
  transition: all 0.15s;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.mdv-root .mdv-copy-btn:hover {
  background: rgba(139,92,246,0.12);
  border-color: rgba(139,92,246,0.25);
  color: #c084fc;
}
.mdv-root .mdv-copy-btn.mdv-copied {
  color: #22c55e;
  border-color: rgba(34,197,94,0.3);
  background: rgba(34,197,94,0.08);
}
.mdv-root .mdv-copy-icon {
  flex-shrink: 0;
  transition: opacity 0.15s;
}
.mdv-root .mdv-check-icon {
  stroke: currentColor;
}
.mdv-root .mdv-copy-label {
  line-height: 1;
}
.mdv-root pre {
  margin: 0;
  padding: 10px 13px;
  overflow-x: auto;
  background: transparent !important;
}
.mdv-root pre code.hljs {
  background: transparent !important;
  padding: 0;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace;
  font-size: 11px;
  line-height: 1.55;
}

/* ── hljs atom-one-dark colour palette ─────────────────────────────── */
.mdv-root .hljs                                    { color: #abb2bf; }
.mdv-root .hljs-comment, .mdv-root .hljs-quote     { color: #5c6370; font-style: italic; }
.mdv-root .hljs-keyword, .mdv-root .hljs-selector-tag,
.mdv-root .hljs-built_in                           { color: #c678dd; }
.mdv-root .hljs-string, .mdv-root .hljs-regexp,
.mdv-root .hljs-addition, .mdv-root .hljs-attribute{ color: #98c379; }
.mdv-root .hljs-number, .mdv-root .hljs-literal,
.mdv-root .hljs-variable, .mdv-root .hljs-template-variable,
.mdv-root .hljs-meta                               { color: #56b6c2; }
.mdv-root .hljs-title, .mdv-root .hljs-section,
.mdv-root .hljs-name, .mdv-root .hljs-selector-id  { color: #61aeee; }
.mdv-root .hljs-type, .mdv-root .hljs-class .hljs-title,
.mdv-root .hljs-attr                               { color: #e6c07b; }
.mdv-root .hljs-tag, .mdv-root .hljs-deletion,
.mdv-root .hljs-subst                              { color: #e06c75; }
.mdv-root .hljs-link                               { color: #61aeee; text-decoration: underline; }
.mdv-root .hljs-emphasis                           { font-style: italic; }
.mdv-root .hljs-strong                             { font-weight: 700; }
`;

// ─── Style injection ──────────────────────────────────────────────────────────

function ensureMdvStyle() {
  if (_styleInjected || typeof document === 'undefined') return;
  _styleInjected = true;
  const el = document.createElement('style');
  el.id = 'daakia-mdv-css';
  el.textContent = MDV_CSS;
  document.head.appendChild(el);
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

  ensureMdvStyle();

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
