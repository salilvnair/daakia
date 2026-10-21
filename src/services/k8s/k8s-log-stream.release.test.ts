/**
 * The opening lines of a read come first, and before "ended".
 *
 * The stream holds a read's first lines while it works out the log's format,
 * and that lookup can run kubectl. It used to let go of the held lines before
 * the lookup: lines arriving meanwhile went out first, without the format, and
 * a kubectl that exited during the lookup said "ended" before the first two
 * hundred lines arrived. In a split pane — no pod probe to warm the lookup —
 * the opening of the log landed at the bottom.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill() { return true; }
}
let child: FakeChild;
vi.mock('./kubectl', () => ({
  run: vi.fn(),
  spawnKubectl: vi.fn(async () => child),
}));

import { streamLogs, FORMAT_SAMPLE_LINES } from './k8s-log-stream';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('releasing the held lines', () => {
  it('keeps arrival order and ends after every line, however slow the format lookup', async () => {
    child = new FakeChild();
    let lookupDone!: () => void;
    const lookup = new Promise<void>(r => { lookupDone = r; });
    const events: string[] = [];

    streamLogs('c', 'n', 'p', {
      follow: false, timestamps: false,
      resolveFormat: async () => { await lookup; return undefined; },
    } as never, {
      onLines: lines => events.push(...lines.map(l => l.text)),
      onStatus: s => { if (s !== 'streaming') events.push(`<${s}>`); },
      onDropped: () => {},
    });
    await wait(5);

    const first = Array.from({ length: FORMAT_SAMPLE_LINES }, (_, i) => `line ${i}`);
    child.stdout.write(first.join('\n') + '\n');
    await wait(5);
    // Arrives while the format is still being worked out.
    child.stdout.write('line late\n');
    await wait(5);
    // And kubectl is done before the lookup is.
    child.emit('exit', 0);
    await wait(5);
    expect(events).toEqual([]);

    lookupDone();
    await wait(100);
    expect(events[0]).toBe('line 0');
    expect(events.at(-2)).toBe('line late');
    expect(events.at(-1)).toBe('<ended>');
    expect(events).toHaveLength(FORMAT_SAMPLE_LINES + 2);
  });
});
