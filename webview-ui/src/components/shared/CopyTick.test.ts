/**
 * Every copy button says it copied the same way: the green tick from
 * CopyTick.tsx, popping in where the copy glyph was.
 *
 * It kept being missed — the scratchpad's copy sent a toast and left its glyph
 * alone, a GraphQL event's copy did nothing visible at all — because nothing
 * stopped a new button drawing a bare <CopyIcon>. This does.
 *
 * The rule, read from the source: a <CopyIcon> may stand on its own only as a
 * menu item's `icon:`. A menu closes on the click, so there is no glyph left to
 * turn into a tick and its toast is the answer. Anywhere else — a button's
 * child, an `icon={…}` or `iconLeft={…}` — it has to be <CopyGlyph>.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      sourceFiles(full, out);
    } else if (/\.tsx$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/*
  Not copy buttons, or not Daakia's:
  - the tick itself;
  - the wiki and the dui showcase, which draw pictures of the app;
  - "Duplicate" and "Save a copy", which wear the copy glyph and copy nothing
    to the clipboard — they are menu items anyway;
  - the editor right-click menu's icon strip, a menu that closes on the click.
*/
const EXEMPT = [
  ['components', 'shared', 'CopyTick.tsx'].join(sep),
  ['components', 'shared', 'menus', 'RightClickMenu.tsx'].join(sep),
  ['pages', 'wiki'].join(sep),
  ['pages', 'dui'].join(sep),
  ['icons'].join(sep),
];

const FILES = sourceFiles(SRC)
  .map(f => ({ path: relative(SRC, f), text: readFileSync(f, 'utf8') }))
  .filter(f => !EXEMPT.some(e => f.path === e || f.path.startsWith(e + sep)));

describe('copy buttons', () => {
  it('turn into the shared green tick — no bare <CopyIcon> outside a menu item', () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      f.text.split(/\r?\n/).forEach((line, i) => {
        if (!/<CopyIcon\b(?!\w)/.test(line)) return;
        /* A menu item: `icon: <CopyIcon …>`. */
        if (/\bicon:\s*<CopyIcon/.test(line)) return;
        offenders.push(`${f.path}:${i + 1}  ${line.trim().slice(0, 100)}`);
      });
    }
    expect(offenders, 'Use useCopyTick + <CopyGlyph> from components/shared/CopyTick (or the shared CopyButton)').toEqual([]);
  });
});
