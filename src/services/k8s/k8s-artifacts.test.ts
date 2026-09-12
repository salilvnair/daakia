import { describe, it, expect } from 'vitest';
import { parseArtifactName, analyzerFor, artifactName, isDerived
} from './k8s-artifacts';

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

describe('isDerived', () => {
  it('hides the index an analyzer writes beside a dump', () => {
    // Parsing writes `<dump>.dkheap` next to the dump, and dumps live in the
    // artifact folder — so without this the cache appears as a thing you
    // collected, with an Analyze button that feeds binary to the log parser.
    expect(isDerived('pod__heapdump__2026-08-30_20-56-25.hprof.dkheap')).toBe(true);
    expect(isDerived('leak.hprof.dkheap')).toBe(true);
    expect(isDerived('LEAK.HPROF.DKHEAP')).toBe(true);
  });

  it('leaves the dump itself alone', () => {
    expect(isDerived('pod__heapdump__2026-08-30_20-56-25.hprof')).toBe(false);
  });

  it('does not hide files that merely have two extensions', () => {
    // The tempting rule is "anything with a second extension", which would
    // also swallow the rotated logs and compressed dumps people copy in.
    expect(isDerived('app.log.1')).toBe(false);
    expect(isDerived('dump.hprof.gz')).toBe(false);
    expect(isDerived('threads.txt.bak')).toBe(false);
  });
});

describe('analyzerFor on a sidecar', () => {
  it('would route it to the log analyzer, which is why it must be hidden', () => {
    // Documents the trap rather than the fix: `.hprof.dkheap` does not end in
    // `.hprof`, so nothing here recognises it and it falls through to logs.
    expect(analyzerFor('pod__heapdump__2026-08-30.hprof.dkheap')).toBe('logs');
    expect(analyzerFor('pod__heapdump__2026-08-30.hprof')).toBe('heap');
  });
});
