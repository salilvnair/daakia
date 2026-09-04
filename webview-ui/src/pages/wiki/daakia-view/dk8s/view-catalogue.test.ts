/**
 * The catalogue has to describe the product, not a memory of it.
 *
 * A wiki page listing views is worthless the moment it drifts — worse than
 * worthless, because it sends someone looking for a tab that no longer exists.
 * These read the analyzer SOURCES and assert the ids match, so renaming a tab
 * or deleting a view fails here instead of quietly leaving a lie on the page.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CATALOGUE, byArtifact, ARTIFACT_ORDER, ARTIFACT_LABEL, ARTIFACT_HOW } from './view-catalogue';

const DOCTOR = join(__dirname, '../../../../components/doctor');
const read = (f: string) => readFileSync(join(DOCTOR, f), 'utf8');

describe('the catalogue', () => {
  it('has no duplicate ids', () => {
    const ids = CATALOGUE.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every artifact kind, and every kind is described', () => {
    for (const kind of ARTIFACT_ORDER) {
      expect(byArtifact(kind).length, kind).toBeGreaterThan(0);
      expect(ARTIFACT_LABEL[kind], kind).toBeTruthy();
      expect(ARTIFACT_HOW[kind], kind).toBeTruthy();
    }
    // Nothing filed under a kind the page does not render.
    for (const e of CATALOGUE) expect(ARTIFACT_ORDER).toContain(e.needs);
  });

  it('says what each view settles, not what it draws', () => {
    for (const e of CATALOGUE) {
      // An MCP tool is one call and one sentence; a view has a case to make.
      expect(e.answers.length, e.id).toBeGreaterThan(e.needs === 'mcp' ? 25 : 60);
      expect(e.label.length, e.id).toBeGreaterThan(0);
    }
  });
});

describe('against the recording analyzer', () => {
  const src = read('CpuAnalyzerView.tsx');

  it('lists exactly the tabs it renders', () => {
    /*
      Pulled out of the segmented-control options rather than hand-copied, so
      adding an eighth tab without a catalogue entry fails right here.
    */
    const rendered = [...src.matchAll(/\{ value: '([a-z]+)', label: [`']/g)]
      .map(m => m[1])
      // The frame filter is a control on the view, not a view.
      .filter(v => !['all', 'app'].includes(v));

    expect(new Set(byArtifact('recording').map(e => e.id))).toEqual(new Set(rendered));
  });
});

describe('against the heap analyzer', () => {
  const src = read('HeapAnalyzerView.tsx');

  it('lists exactly the tabs it renders', () => {
    const rendered = [...src.matchAll(/\{ id: '([a-z]+)',\s+label: '/g)].map(m => m[1]);
    expect(rendered.length).toBeGreaterThan(0);
    expect(new Set(byArtifact('heap').map(e => e.id))).toEqual(new Set(rendered));
  });

  it('uses the analyzer’s own label for each tab', () => {
    for (const e of byArtifact('heap')) {
      const m = new RegExp(`\\{ id: '${e.id}',\\s+label: '([^']+)'`).exec(src);
      expect(m, e.id).toBeTruthy();
      expect(m![1], e.id).toBe(e.label);
    }
  });
});

describe('against the MCP tools', () => {
  const src = readFileSync(
    join(__dirname, '../../../../../../src/mcp/dk8s-tools.ts'), 'utf8');

  it('lists exactly the tools the server exposes', () => {
    const exposed = [...src.matchAll(/^\s{4}name: '(dk8s_[a-z_]+)'/gm)].map(m => m[1]);
    expect(exposed.length).toBeGreaterThan(0);
    expect(new Set(byArtifact('mcp').map(e => e.id))).toEqual(new Set(exposed));
  });
});

describe('the claims marked "only dk8s has this"', () => {
  it('are the ones worth making, and are few', () => {
    /*
      A badge on everything says nothing, so this pins the exact set.

      Retention is deliberately NOT here: a dominator tree is standard in every
      serious heap tool and claiming it would be the kind of overreach that
      makes the other five unbelievable.
    */
    const only = CATALOGUE.filter(e => e.only).map(e => e.id).sort();
    expect(only).toEqual(
      ['allocation', 'dk8s_open_source', 'growth', 'locks', 'threads'].sort(),
    );
  });
});
