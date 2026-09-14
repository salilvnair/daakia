import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';
const file = process.argv[2];
const dom = new JSDOM(readFileSync(file, 'utf8'));
const out = [];
for (const el of dom.window.document.querySelectorAll('*')) {
  if (el.children.length) continue;
  const t = el.textContent?.trim();
  if (!t || t.length > 40) continue;
  out.push(t);
}
const seen = new Map();
for (const t of out) seen.set(t, (seen.get(t) || 0) + 1);
console.log([...seen.entries()].map(([t, n]) => n > 1 ? `${t} (x${n})` : t).join(' | '));
