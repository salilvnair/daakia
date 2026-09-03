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
import { readCpuSamples, hotSpots, sampleCount, idleCount } from '../../../services/jfr/jfr-cpu';
import { readTelemetry, groupsOf } from '../../../services/jfr/jfr-telemetry';
import { readWaits, readGc, readWaitSpans } from '../../../services/jfr/jfr-waits';
import { readAllocation } from '../../../services/jfr/jfr-allocation';

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

    /*
      The telemetry travels with the hot spots rather than being fetched
      separately: it is the axis the samples sit on, and a view that has one
      without the other cannot say when the CPU it is showing was being spent.
    */
    const telemetry = readTelemetry(chunks);

    /*
      The two views the CPU profile cannot provide.

      An application that spends its life blocked produces almost no execution
      samples — true, and useless. Waits explain where that time went, and
      allocation names the line that made the garbage, which is the one thing a
      heap dump structurally cannot tell you.
    */
    /*
      Two reads, because Blocking and Probes ask different questions.

      Blocking asks what cost time, so a sub-millisecond park is noise and the
      1 ms floor is right. Probes asks what this process talked to, where a
      fast call is still a real dependency and the floor is wrong — a service
      whose database is on loopback did not stop having a database.

      One call cannot serve both: the floor either hides the endpoints or fills
      the Blocking list with hundreds of 0.3 ms reads, and `waits.count` on the
      Blocking tab counts whatever was let through. Two calls, two honest
      answers.
    */
    const waits = readWaits(chunks, { minMs: 1, ioMinMs: Infinity });
    const probes = readWaits(chunks, { minMs: Infinity, ioMinMs: 0 });
    /*
      The same waits, kept individually for the timeline.

      A second pass rather than a second shape out of the first: the totals and
      the lanes want opposite things, and computing both in one function would
      mean the aggregation carrying every event around for a view that may
      never be opened.
    */
    const timeline = readWaitSpans(chunks, { minMs: 1, limit: 4000 });
    const allocation = readAllocation(chunks);
    const gc = readGc(chunks);

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
        // Runnable, but caught in a wait syscall. Excluded from CPU and said
        // so, because on any server with sockets this is most of the samples.
        idle: idleCount(samples),
        states: [...states].map(([state, count]) => ({ state, count }))
          .sort((a, b) => b.count - a.count),
        threads: [...new Set(samples.map(s => s.threadName))].sort(),
      },
      telemetry: {
        fromMs: telemetry.fromMs,
        toMs: telemetry.toMs,
        groups: groupsOf(telemetry),
      },
      waits: {
        totalMs: waits.totalMs, count: waits.count, wallMs: waits.wallMs,
        sites: waits.sites.slice(0, MAX_ROWS),
        truncated: Math.max(0, waits.sites.length - MAX_ROWS),
        // Socket and file sites, kept apart from the blocking ones so each
        // view's totals describe only what that view shows.
        probes: probes.sites.slice(0, MAX_ROWS),
      },
      allocation: {
        totalBytes: allocation.totalBytes,
        samples: allocation.samples,
        weighted: allocation.weighted,
        sites: allocation.sites.slice(0, MAX_ROWS),
        truncated: Math.max(0, allocation.sites.length - MAX_ROWS),
      },
      gc,
      timeline,
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
