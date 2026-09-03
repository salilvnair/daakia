import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { DK8S_TOOLS, dk8sTool, handleDk8sRecording } from './dk8s-tools';

const FIXTURE = join(__dirname, '../../test/fixtures/jfr/under-load.jfr');

describe('the tool surface', () => {
  it('exposes reading and analysis, and nothing that collects', () => {
    /*
      The safety property, asserted rather than assumed.

      A heap dump triggers a full GC and writes a file the size of the live
      set, which can OOM-kill the pod it came from. dk8s makes a person confirm
      that, and the confirmation is the feature — a model deciding on its own
      that a dump would be informative is exactly what it exists to prevent.

      If someone adds a collecting tool here, this test is what stops it.
    */
    const names = DK8S_TOOLS.map(t => t.name);
    for (const forbidden of ['dump', 'collect', 'exec', 'jfr_start', 'heap_dump', 'kill', 'delete']) {
      expect(names.some(n => n.includes(forbidden))).toBe(false);
    }
  });

  it('describes every tool and its arguments', () => {
    // An undescribed tool is one a model will use wrongly or not at all.
    for (const t of DK8S_TOOLS) {
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe('object');
      expect(Object.keys(t.inputSchema.properties).length).toBeGreaterThan(0);
    }
  });

  it('routes its own names and refuses anything else', () => {
    expect(dk8sTool('dk8s_pods')).toBeTypeOf('function');
    expect(dk8sTool('dk8s_analyze_recording')).toBeTypeOf('function');
    expect(dk8sTool('send_request')).toBeUndefined();
    expect(dk8sTool('dk8s_take_heap_dump')).toBeUndefined();
  });
});

describe('dk8s_analyze_recording', () => {
  it('says which view holds the answer, rather than making the model guess', async () => {
    /*
      A recording of a blocked application has almost no CPU samples, so a
      model asking for hot spots first gets nothing back and concludes there is
      no problem. The summary names the shape up front.
    */
    const out = await handleDk8sRecording({ path: FIXTURE });
    expect(out).toContain('BLOCKED');
    expect(out).toMatch(/start with the blocking view/);
    expect(out).toContain('OrderLoad$LedgerCache');
  });

  it('returns the lock, the method and the holder', async () => {
    const out = await handleDk8sRecording({ path: FIXTURE, view: 'blocking' });
    expect(out).toContain('OrderLoad$LedgerCache.post');
    expect(out).toMatch(/held by .*order-worker/);
  });

  it('returns the line that allocated', async () => {
    const out = await handleDk8sRecording({ path: FIXTURE, view: 'allocation' });
    expect(out).toContain('OrderLoad.validateSlow:46');
    expect(out).toContain('heap dump cannot give you this');
  });

  it('explains an empty CPU profile instead of returning nothing', async () => {
    // "No hot spots" reads as "no problem". It has to say why, and where to
    // look instead.
    const out = await handleDk8sRecording({ path: FIXTURE, view: 'cpu' });
    expect(out).toMatch(/not CPU-bound|self/);
  });

  it('caps how much it returns, whatever it was asked for', async () => {
    const out = await handleDk8sRecording({ path: FIXTURE, view: 'allocation', limit: 5000 });
    expect(out.split('\n').length).toBeLessThan(70);
  });

  it('names the problem when the file is not a recording', async () => {
    expect(await handleDk8sRecording({ path: 'nope.jfr' })).toMatch(/Could not read/);
    expect(await handleDk8sRecording({})).toMatch(/path .*required/i);
  });
});
