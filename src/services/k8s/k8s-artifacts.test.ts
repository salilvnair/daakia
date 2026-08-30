import { describe, it, expect } from 'vitest';
import { parseArtifactName, analyzerFor, artifactName } from './k8s-artifacts';

describe('parseArtifactName', () => {
  it('round-trips what artifactName writes', () => {
    // The filename is the only record of which pod a dump came from, so this
    // pair has to stay in step or the list loses that attribution.
    const at = new Date(Date.UTC(2026, 7, 30, 2, 41, 5));
    const name = artifactName('zp-backend-7d9f', 'heapdump', 'hprof', at);
    const parsed = parseArtifactName(name);
    expect(parsed.pod).toBe('zp-backend-7d9f');
    expect(parsed.kind).toBe('heapdump');
    expect(parsed.collectedAt).toBe(at.getTime());
  });

  it('round-trips a hyphenated kind', () => {
    const at = new Date(Date.UTC(2026, 7, 30, 2, 41, 5));
    const parsed = parseArtifactName(artifactName('p', 'threaddump-sigquit', 'txt', at));
    expect(parsed.kind).toBe('threaddump-sigquit');
  });

  it('returns nothing for a file dk8s did not name', () => {
    // An imported dump keeps whatever name it arrived with; guessing a pod
    // out of it would attribute someone else's heap to one of yours.
    expect(parseArtifactName('heap-from-prod.hprof')).toEqual({});
    expect(parseArtifactName('notes.txt')).toEqual({});
  });
});

describe('analyzerFor', () => {
  it('routes by what the file actually is', () => {
    expect(analyzerFor('x.hprof')).toBe('heap');
    expect(analyzerFor('pod__threaddump__2026-01-01_00-00-00.txt')).toBe('threads');
    expect(analyzerFor('pod__threaddump-sigquit__2026-01-01_00-00-00.txt')).toBe('threads');
    expect(analyzerFor('pod__stackdump__2026-01-01_00-00-00.txt')).toBe('threads');
    expect(analyzerFor('dump.tdump')).toBe('threads');
  });

  it('sends a histogram to the log analyzer, not the heap one', () => {
    // A histogram is text; the heap analyzer would reject it. Routing by what
    // the file IS rather than by which button produced it is what keeps this
    // right for imported files too.
    expect(analyzerFor('pod__histogram__2026-01-01_00-00-00.txt')).toBe('logs');
  });

  it('defaults anything unrecognised to logs rather than failing', () => {
    expect(analyzerFor('whatever.log')).toBe('logs');
  });
});
