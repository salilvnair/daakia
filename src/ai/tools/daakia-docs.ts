/**
 * `daakia_docs` — Daakia AI looking things up in Daakia's own manual.
 *
 * Asked "how do I make a mock route that 404s", a model with only a feature
 * list in its prompt answers the way a model does: plausibly, with hedges
 * ("if membership lists aren't offered…") and names for screens that may not
 * exist. The README is a real manual — every surface, protocol and setting —
 * and ships in the extension, so the answer can be read rather than guessed.
 *
 * Deliberately simple: the manual is split at its headings and the sections
 * are ranked by how many of the question's words they contain, a heading
 * match counting most. A manual of this size does not need an index, and a
 * search anyone can reason about is worth more here than a clever one.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { AiToolDef } from '../ai-types';

export const DAAKIA_DOCS_TOOL: AiToolDef = {
  id: 'daakia_docs',
  type: 'function',
  function: {
    name: 'daakia_docs',
    description:
      'Search the Daakia manual — every surface, protocol, setting and workflow in Daakia — and get back the '
      + 'sections that match. Call it before answering how to do something in Daakia, where a setting lives, '
      + 'or what a Daakia feature does, and answer from what it returns.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to look up, in a few words: "mock server rules", "environment variables", "dk8s archive search".',
        },
      },
      required: ['query'],
    },
  },
};

export interface DocSection {
  title: string;
  /** The heading path, e.g. "Daakia AI › Providers". */
  path: string;
  body: string;
}

/** Split Markdown at its ## and ### headings, remembering which ## a ### sits under. */
export function sections(md: string): DocSection[] {
  const out: DocSection[] = [];
  let parent = '';
  let cur: DocSection | undefined;
  let inFence = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^```/.test(line)) inFence = !inFence;
    const h = !inFence && /^(#{2,3})\s+(.*)$/.exec(line);
    if (h) {
      if (cur) out.push(cur);
      const title = h[2].trim();
      if (h[1] === '##') parent = title;
      cur = { title, path: h[1] === '##' ? title : `${parent} › ${title}`, body: '' };
      continue;
    }
    if (cur) cur.body += line + '\n';
  }
  if (cur) out.push(cur);
  return out.map(s => ({ ...s, body: s.body.trim() })).filter(s => s.body);
}

const STOP = new Set(['the', 'and', 'for', 'how', 'can', 'what', 'does', 'with', 'this', 'that', 'into', 'from',
  'you', 'your', 'are', 'is', 'do', 'in', 'to', 'of', 'a', 'an', 'on', 'it', 'my', 'i', 'use', 'using', 'daakia', 'where']);

function words(q: string): string[] {
  return q.toLowerCase().split(/[^a-z0-9.+#-]+/).filter(w => w.length > 1 && !STOP.has(w));
}

/** The sections that best answer `query`, best first. */
export function searchDocs(md: string, query: string, max = 3): DocSection[] {
  const terms = words(query);
  if (!terms.length) return [];
  const scored = sections(md).map(s => {
    const title = s.path.toLowerCase();
    const body = s.body.toLowerCase();
    let score = 0;
    let covered = 0;
    for (const t of terms) {
      const inTitle = title.includes(t);
      const hits = body.split(t).length - 1;
      if (inTitle || hits) covered++;
      score += (inTitle ? 8 : 0) + Math.min(hits, 6);
    }
    /* A section that has every word beats one that repeats a single word. */
    return { s, score: score * (covered / terms.length) };
  }).filter(x => x.score > 0);
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map(x => x.s);
}

let cached: string | undefined;

/**
 * The README that shipped with this build.
 *
 * The extension's bundle sits in `dist/`, the dev server's in
 * `local-server/dist/`; walking up from here finds the README in both without
 * either having to say where it is.
 */
export function loadManual(from = __dirname): string {
  if (cached !== undefined) return cached;
  let dir = from;
  for (let i = 0; i < 5; i++) {
    const file = path.join(dir, 'README.md');
    try {
      cached = fs.readFileSync(file, 'utf8');
      return cached;
    } catch { /* keep walking */ }
    dir = path.dirname(dir);
  }
  cached = '';
  return cached;
}

export interface DocsResult {
  kind: 'docs';
  query: string;
  /** The headings answered from — shown under the answer as its sources. */
  sources: string[];
}

const SECTION_CAP = 3500;

export function runDaakiaDocs(query: string, md = loadManual()): { result: DocsResult; text: string } {
  const hits = md ? searchDocs(md, query) : [];
  const result: DocsResult = { kind: 'docs', query, sources: hits.map(h => h.path) };
  if (!md) {
    return { result, text: 'The Daakia manual is not available in this build. Answer from what you know, and say you could not check the manual.' };
  }
  if (!hits.length) {
    return { result, text: `Nothing in the Daakia manual matches "${query}". Say so; do not describe a feature the manual does not.` };
  }
  const text = hits.map(h => {
    const body = h.body.length > SECTION_CAP ? `${h.body.slice(0, SECTION_CAP)}\n…` : h.body;
    return `## ${h.path}\n${body}`;
  }).join('\n\n');
  return {
    result,
    text: `${text}\n\nAnswer from these sections. Use the names they use for screens and settings. If they do not cover the question, say what they do cover rather than filling the gap.`,
  };
}
