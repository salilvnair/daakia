import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JfrChunk } from './jfr-chunk';
import { readChunkHeader, JfrReader } from './jfr-reader';
import { readMetadata } from './jfr-metadata';

/*
  Tested against a real recording rather than a synthesised one.

  Every interesting property of this format — the backwards-linked checkpoints,
  the reference chains, the fact that a field's width depends on a type table
  inside the same file — is exactly what a hand-built fixture would get wrong
  in the same way the parser does. `leaky.jfr` is 25 seconds of
  `settings=profile` taken off the jdk-leaky pod with `jcmd JFR.start`, which
  is the command dk8s itself runs.
*/
const FIXTURE = join(__dirname, '../../../test/fixtures/jfr/leaky.jfr');
const buf = readFileSync(FIXTURE);

describe('readChunkHeader', () => {
  it('reads the fixed part of a chunk', () => {
    const h = readChunkHeader(buf);
    expect(h.major).toBe(2);
    expect(h.size).toBe(buf.length);
    // Both point inside the chunk; the pool sits near the end, the metadata
    // wherever the JVM flushed it.
    expect(h.metadataOffset).toBeGreaterThan(0);
    expect(h.constantPoolOffset).toBeLessThan(h.size);
    expect(h.ticksPerSecond).toBeGreaterThan(0n);
  });

  it('refuses something that is not a recording', () => {
    // Long enough to get past the length check, so this really is the magic
    // being rejected rather than the size.
    expect(() => readChunkHeader(Buffer.alloc(120, 0x41)))
      .toThrow(/FLR magic/);
  });

  it('says a truncated file is truncated, not malformed', () => {
    expect(() => readChunkHeader(Buffer.from('too short')))
      .toThrow(/shorter than one chunk header/);
  });

  it('names the version when it is one we cannot read', () => {
    // JDK 8 wrote a different format under the same extension. Saying so beats
    // failing later inside a varint with an offset nobody can act on.
    const old = Buffer.from(buf.subarray(0, 68));
    old.writeUInt16BE(1, 4);
    expect(() => readChunkHeader(old)).toThrow(/version 1\..* not supported/);
  });
});

describe('readMetadata', () => {
  it('recovers the recording’s own type table', () => {
    const h = readChunkHeader(buf);
    const m = readMetadata(buf, h.metadataOffset);
    expect(m.types.size).toBeGreaterThan(200);
    expect(m.byName.has('jdk.ExecutionSample')).toBe(true);
  });

  it('describes a type by its fields, including which are references', () => {
    const h = readChunkHeader(buf);
    const m = readMetadata(buf, h.metadataOffset);
    const es = m.byName.get('jdk.ExecutionSample')!;
    expect(es.fields.map(f => f.name)).toEqual(['startTime', 'sampledThread', 'stackTrace', 'state']);
    // The three that matter are pool references, not inline values — reading
    // them as literals is the failure that produces plausible nonsense.
    expect(es.fields.find(f => f.name === 'stackTrace')!.constantPool).toBe(true);
    expect(es.fields.find(f => f.name === 'startTime')!.constantPool).toBe(false);
  });
});

describe('JfrChunk', () => {
  const chunk = JfrChunk.parseAll(buf)[0];

  it('finds every chunk in the file', () => {
    expect(JfrChunk.parseAll(buf)).toHaveLength(1);
  });

  it('walks the whole checkpoint chain, not just the last one', () => {
    /*
      The delta between checkpoints is a SIGNED 64-bit value pointing
      backwards. Read as unsigned it becomes ~1.8e19, the walk leaves the file
      on its first step, and exactly one pool survives — which still parses,
      still resolves nothing, and looks like a recording with no stacks in it.
    */
    const pools = (chunk as unknown as { pools: Map<number, unknown> }).pools;
    expect(pools.size).toBeGreaterThan(20);
  });

  it('indexes events by type', () => {
    const counts = chunk.counts();
    expect(counts.size).toBeGreaterThan(10);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(500);
    // Metadata and checkpoint events are structure, not observations.
    expect(counts.has('jdk.Metadata')).toBe(false);
  });

  it('decodes an event into named fields', () => {
    const [first] = [...chunk.events('jdk.ExecutionSample')];
    expect(Object.keys(first)).toEqual(['startTime', 'sampledThread', 'stackTrace', 'state']);
    expect(JfrChunk.isRef(first.stackTrace!)).toBe(true);
  });

  it('resolves a reference chain down to source-level names', () => {
    const [first] = [...chunk.events('jdk.ExecutionSample')];
    const s = chunk.resolve(first) as Record<string, any>;

    expect(s.state?.name).toMatch(/^STATE_/);
    expect(typeof s.sampledThread?.javaName).toBe('string');

    const frames = s.stackTrace?.frames ?? [];
    expect(frames.length).toBeGreaterThan(0);
    const f = frames[0];
    // Four hops from the event: sample → stackTrace → frame → method → type.
    expect(typeof f.method?.name?.string).toBe('string');
    expect(typeof f.method?.type?.name?.string).toBe('string');
    expect(typeof f.lineNumber).toBe('number');
  });

  it('returns nothing for a type the recording does not contain', () => {
    expect([...chunk.events('jdk.NotARealEventType')]).toEqual([]);
  });

  it('converts event ticks to wall-clock time inside the recording', () => {
    const start = chunk.startMs;
    const end = start + Number(chunk.header.durationNanos / 1_000_000n);
    const [first] = [...chunk.events('jdk.ExecutionSample')];
    const at = chunk.ticksToMs(first.startTime as bigint);
    expect(at).toBeGreaterThanOrEqual(start);
    expect(at).toBeLessThanOrEqual(end + 1000);
  });
});

describe('JfrReader', () => {
  it('round-trips the varint encoding at a byte boundary', () => {
    // 127 fits in one byte, 128 is the first that needs two. Off-by-one in the
    // continuation bit shows up here and nowhere else.
    for (const n of [0, 1, 127, 128, 255, 16_383, 16_384, 1 << 20]) {
      const bytes: number[] = [];
      let v = n;
      do { const b = v & 0x7f; v = Math.floor(v / 128); bytes.push(v ? b | 0x80 : b); } while (v);
      expect(new JfrReader(Buffer.from(bytes)).varint()).toBe(n);
    }
  });

  it('reads a null string, an empty one, and text as three different things', () => {
    expect(new JfrReader(Buffer.from([0])).string()).toBeNull();
    expect(new JfrReader(Buffer.from([1])).string()).toBe('');
    expect(new JfrReader(Buffer.from([3, 2, 0x68, 0x69])).string()).toBe('hi');
  });

  it('does not invent text for a pooled string', () => {
    // Encoding 2 means "the value is elsewhere". Treating it as text would
    // produce a plausible wrong answer rather than an obvious absence.
    expect(new JfrReader(Buffer.from([2, 7])).string()).toBeNull();
    expect(new JfrReader(Buffer.from([2, 7])).string(i => `pooled-${i}`)).toBe('pooled-7');
  });
});
