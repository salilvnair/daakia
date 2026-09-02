/**
 * Opening a Flight Recording.
 *
 * Parsed in the extension host rather than forked into the heap worker: the
 * worker exists because a 45M-object graph needs its own heap ceiling, and a
 * recording is a stream of small events that is indexed by offset rather than
 * materialised. A minute of `settings=profile` is a few megabytes.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { readFileSync } from 'fs';
import { JfrChunk } from '../../../services/jfr/jfr-chunk';
import { readCpuSamples, hotSpots, sampleCount } from '../../../services/jfr/jfr-cpu';

type PostMessage = (msg: Record<string, unknown>) => void;

/**
 * How many hot spots travel to the webview.
 *
 * The tail of a profile is a very long list of methods sampled once, and it
 * is never what anyone is looking for. The count of what was dropped goes
 * with it, so the table can say so rather than implying the list ended.
 */
const MAX_ROWS = 200;

export async function handleJfrOpen(postMessage: PostMessage) {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    title: 'Open flight recording',
    openLabel: 'Analyze',
    filters: { 'Flight recordings': ['jfr'], 'All files': ['*'] },
  });
  if (!picked?.[0]) return;
  handleJfrAnalyze({ path: picked[0].fsPath }, postMessage);
}

export function handleJfrAnalyze(msg: Record<string, unknown>, postMessage: PostMessage) {
  const file = msg.path as string;
  if (!file) {
    postMessage({ type: 'jfr:error', message: 'No recording path was provided.' });
    return;
  }

  try {
    const chunks = JfrChunk.parseAll(readFileSync(file));
    if (!chunks.length) {
      postMessage({ type: 'jfr:error', message: 'That file contains no recording chunks.' });
      return;
    }

    const samples = readCpuSamples(chunks);
    /*
      Every state present, counted.

      The view defaults to runnable, and a recording of a parked application
      would otherwise show an empty table with no way to tell whether the
      filter or the recording was at fault. Handing over the other states, with
      their sizes, makes that visible and switchable.
    */
    const states = new Map<string, number>();
    for (const s of samples) states.set(s.state, (states.get(s.state) ?? 0) + 1);

    const totals = new Map<string, number>();
    for (const chunk of chunks) {
      for (const [name, n] of chunk.counts()) totals.set(name, (totals.get(name) ?? 0) + n);
    }

    const first = chunks[0];
    const durationMs = chunks.reduce(
      (a, c) => a + Number(c.header.durationNanos / 1_000_000n), 0);

    const rows = hotSpots(samples);
    postMessage({
      type: 'jfr:done',
      name: path.basename(file),
      recording: {
        startMs: first.startMs,
        durationMs,
        chunks: chunks.length,
        events: [...totals.values()].reduce((a, b) => a + b, 0),
        // The ten commonest event types: what this recording is mostly made of,
        // and the map of what the other viewers will have to work with.
        topEvents: [...totals].sort((a, b) => b[1] - a[1]).slice(0, 10)
          .map(([name, count]) => ({ name, count })),
      },
      samples: {
        total: samples.length,
        runnable: sampleCount(samples),
        states: [...states].map(([state, count]) => ({ state, count }))
          .sort((a, b) => b.count - a.count),
        threads: [...new Set(samples.map(s => s.threadName))].sort(),
      },
      hotSpots: rows.slice(0, MAX_ROWS),
      truncated: Math.max(0, rows.length - MAX_ROWS),
    });
  } catch (err) {
    /*
      The message is the whole error handling.

      Every throw the parser raises names what was wrong with the file — the
      magic, the version, a type id the stream referred to but the metadata did
      not declare. Wrapping those in "Could not open the recording" would throw
      away the only part worth reading.
    */
    postMessage({
      type: 'jfr:error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
