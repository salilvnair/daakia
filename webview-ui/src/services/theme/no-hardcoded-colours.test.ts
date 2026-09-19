import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A colour a theme cannot reach.
 *
 * ── Why this is a test and not a sweep ──
 *
 * There are hundreds of hard-coded hex values in this app, in inline styles
 * and in a few component stylesheets. A sweep that fixes them and leaves
 * nothing to stop the next one is a sweep you do twice, so the guard comes
 * first and the sweep lands against it over time.
 *
 * The budget below is the count on the day this was written. It may go DOWN
 * freely — that is the sweep working. Going up means a new literal that a
 * palette will never touch, and the fix is `var(--color-…)`, not a bigger
 * number. If a file genuinely needs a fixed colour, exempt the file by path
 * and say why, so the exemption is a decision somebody made rather than a
 * number nobody reads.
 */

/* vitest runs from webview-ui, which is where `src` lives. */
const ROOT = process.cwd();

/**
 * Files whose colours are deliberately fixed.
 *
 * `icons` are brand marks — a GraphQL pink and a Kubernetes blue are those
 * products' colours, not this app's, and theming them would be wrong rather
 * than thorough. `pages/dui` is the component showcase, which exists to
 * demonstrate colours. `services/theme` is the palettes themselves.
 */
const EXEMPT = [
  'src/icons/',
  /* Prompt text sent to a model, and console colour codes. Neither is a
     surface anybody looks at through a theme. */
  'src/store/prompt-template.ts',
  'src/app/protocol-logger.ts',
  'src/pages/dui/',
  'src/services/theme/',
  'src/colors/',
];

/**
 * The wiki's captures, which are recorded screens rather than code.
 *
 * `captures.ts` holds serialised snapshots of the app — tens of thousands of
 * colours that were the theme at the moment the shot was taken. Theming them
 * would mean repainting a photograph.
 */
const EXEMPT_FILES = /\/captures\.ts$/;

/** Where things stand today, measured. Lower is better; higher is a regression. */
const BUDGET = 347;

const HEX = /#[0-9a-fA-F]{6}\b/g;
/*
  A hex inside `var(--x, #fallback)` is not a hard-coded colour.

  The variable wins whenever it is defined, which under a theme is always —
  the literal is the answer for a context where the palette has not loaded.
  Counting those would push authors towards leaving the fallback out, which
  is the opposite of what this is for.
*/
const VAR_FALLBACK = /var\([^()]*(?:\([^()]*\)[^()]*)*\)/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(full, out);
    } else if (/\.(tsx|ts)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('colours a theme can reach', () => {
  const files = walk(join(ROOT, 'src'));

  const counted = files
    .map(f => {
      const rel = relative(ROOT, f).replace(/\\/g, '/');
      if (EXEMPT.some(e => rel.startsWith(e)) || EXEMPT_FILES.test(rel)) return null;
      const source = readFileSync(f, 'utf8').replace(VAR_FALLBACK, 'var()');
      const hits = source.match(HEX)?.length ?? 0;
      return hits > 0 ? { rel, hits } : null;
    })
    .filter((x): x is { rel: string; hits: number } => x !== null);

  const total = counted.reduce((n, f) => n + f.hits, 0);

  it(`has no more than ${BUDGET} hard-coded colours in app code`, () => {
    const worst = [...counted].sort((a, b) => b.hits - a.hits).slice(0, 8);
    expect(
      total,
      `Hard-coded colours went up. A palette cannot reach these; use var(--color-…).\n`
      + `Worst offenders:\n${worst.map(f => `  ${f.hits}  ${f.rel}`).join('\n')}`,
    ).toBeLessThanOrEqual(BUDGET);
  });

  it('keeps every exemption pointing at something that exists', () => {
    // An exemption for a path that has been deleted is an exemption nobody
    // is checking, quietly widening whenever a folder gets reused.
    for (const e of EXEMPT) {
      expect(files.some(f => relative(ROOT, f).replace(/\\/g, '/').startsWith(e)), e).toBe(true);
    }
  });
});
