/**
 * `analyzerFor` routes anything it does not recognise to the log analyzer,
 * which is right for an unfamiliar text file and wrong for a PNG. This pins
 * where that line sits.
 */
import { describe, it, expect } from 'vitest';
import { analysisRefusal, analyzerFor } from './k8s-artifacts';

describe('analysisRefusal', () => {
  it('refuses the binaries that would render as an empty log', () => {
    for (const f of [
      'screenshot.png', 'diagram.PNG', 'report.pdf', 'bundle.zip',
      'app.jar', 'lib.so', 'core.bin', 'data.sqlite3', 'clip.mp4',
      'Main.class', 'font.woff2', 'mod.wasm',
    ]) {
      expect(analysisRefusal(f), f).toBeTruthy();
    }
  });

  it('leaves every artifact dk8s actually analyses alone', () => {
    for (const f of [
      'pod__heap__2026-01-01_00-00-00.hprof',
      'pod__jfr__2026-01-01_00-00-00.jfr',
      'pod__threads__2026-01-01_00-00-00.tdump',
      'app.log', 'stdout.txt', 'server.out', 'notes',
    ]) {
      expect(analysisRefusal(f), f).toBeUndefined();
    }
  });

  it('names the format in the reason, since that is the whole message', () => {
    expect(analysisRefusal('a.png')).toContain('PNG');
    expect(analysisRefusal('a.zip')).toContain('ZIP');
  });

  it('agrees with analyzerFor: nothing it refuses is a real analyzer target', () => {
    // A file with a real analyzer must never be refused, or collecting a dump
    // would produce something dk8s then declines to open.
    for (const f of ['x.hprof', 'x.jfr', 'x.tdump', 'x.jstack']) {
      expect(analysisRefusal(f), f).toBeUndefined();
      expect(analyzerFor(f)).not.toBe('logs');
    }
  });
});
