/**
 * A chunk, decoded: its constant pools and its events.
 *
 * Everything interesting in a recording is a reference. An execution sample
 * does not contain a stack — it contains an index into the stack-trace pool,
 * whose frames hold indices into the method pool, whose entries hold indices
 * into the class and symbol pools. Reading a sample means walking that chain,
 * and the chain is why a 200KB recording describes hundreds of thousands of
 * frames: nothing is written twice.
 *
 * Pools are decoded up front because they are small and every event needs
 * them; references are resolved lazily and memoised, because a recording holds
 * far more pool entries than any one view will ask about.
 */
import { JfrReader, readChunkHeader, CHUNK_HEADER_BYTES, type ChunkHeader } from './jfr-reader';
import { readMetadata, type JfrMetadata, type JfrType } from './jfr-metadata';

/** An unresolved pointer into a constant pool. */
export interface PoolRef { readonly pool: number; readonly index: number }

export type JfrValue =
  | null | boolean | number | bigint | string
  | PoolRef | JfrValue[] | { [field: string]: JfrValue };

const EVENT_METADATA = 0;
const EVENT_CHECKPOINT = 1;

export class JfrChunk {
  /** typeId → (constant index → raw value, references still unresolved). */
  private readonly pools = new Map<number, Map<number, JfrValue>>();
  private readonly resolved = new Map<string, JfrValue>();
  /** Where each event starts and which type it is — the index for queries. */
  private readonly index: { offset: number; typeId: number }[] = [];

  private constructor(
    readonly buf: Buffer,
    readonly base: number,
    readonly header: ChunkHeader,
    readonly meta: JfrMetadata,
  ) {}

  static parse(buf: Buffer, base = 0): JfrChunk {
    const header = readChunkHeader(buf, base);
    const meta = readMetadata(buf, base + header.metadataOffset);
    const chunk = new JfrChunk(buf, base, header, meta);
    chunk.readPools();
    chunk.readEvents();
    return chunk;
  }

  /** Every chunk in the file. A long recording is many, appended. */
  static parseAll(buf: Buffer): JfrChunk[] {
    const out: JfrChunk[] = [];
    let at = 0;
    while (at + CHUNK_HEADER_BYTES <= buf.length) {
      const chunk = JfrChunk.parse(buf, at);
      out.push(chunk);
      if (chunk.header.size <= 0) break;   // refuse to loop on a corrupt size
      at += chunk.header.size;
    }
    return out;
  }

  // ── Constant pools ────────────────────────────────────────────────────────

  /**
   * Checkpoints are a backwards-linked list.
   *
   * The header points at the LAST one, and each carries a negative delta to
   * the one before it. Walking forwards from the start would mean decoding
   * every event to find them.
   */
  private readPools(): void {
    let at = this.base + this.header.constantPoolOffset;
    const seen = new Set<number>();
    for (;;) {
      if (seen.has(at)) break;             // a cycle in a damaged file
      seen.add(at);
      const r = new JfrReader(this.buf, at);
      r.varint();                           // size
      const typeId = r.varint();
      if (typeId !== EVENT_CHECKPOINT) break;
      r.varlong();                          // start ticks
      r.varlong();                          // duration
      // Signed: the delta points BACKWARDS, and read as unsigned a negative
      // offset becomes ~1.8e19, which walks straight off the end of the file
      // and silently leaves every pool but the last one undecoded.
      const delta = Number(BigInt.asIntN(64, r.varlong()));
      r.u1();                               // typeMask: flush / header / etc.

      const poolCount = r.varint();
      for (let p = 0; p < poolCount; p++) {
        const poolType = r.varint();
        const count = r.varint();
        const type = this.meta.types.get(poolType);
        let pool = this.pools.get(poolType);
        if (!pool) this.pools.set(poolType, pool = new Map());
        for (let i = 0; i < count; i++) {
          const key = r.varint();
          const value = type ? this.readValue(r, type) : null;
          // Earlier checkpoints do not override later ones for the same key.
          if (!pool.has(key)) pool.set(key, value);
        }
      }

      if (delta === 0) break;
      at += delta;
      if (at < this.base || at >= this.buf.length) break;
    }
  }

  // ── Events ────────────────────────────────────────────────────────────────

  /**
   * One pass over the chunk, recording where each event begins.
   *
   * Only offsets and type ids are kept. Decoding every event up front would
   * mean materialising hundreds of thousands of objects to answer a question
   * about one type, and the recordings that matter are the big ones.
   */
  private readEvents(): void {
    const end = this.base + (this.header.size || this.buf.length - this.base);
    let at = this.base + CHUNK_HEADER_BYTES;
    while (at < end) {
      const r = new JfrReader(this.buf, at);
      const size = r.varint();
      if (size <= 0) break;                 // a zero size would never advance
      const typeId = r.varint();
      if (typeId !== EVENT_METADATA && typeId !== EVENT_CHECKPOINT) {
        this.index.push({ offset: at, typeId });
      }
      at += size;
    }
  }

  /** How many events of each type this chunk holds. */
  counts(): Map<string, number> {
    const out = new Map<string, number>();
    for (const e of this.index) {
      const name = this.meta.types.get(e.typeId)?.name ?? `type ${e.typeId}`;
      out.set(name, (out.get(name) ?? 0) + 1);
    }
    return out;
  }

  /** Every event of one type, decoded on demand. */
  *events(typeName: string): Generator<Record<string, JfrValue>> {
    const type = this.meta.byName.get(typeName);
    if (!type) return;
    for (const e of this.index) {
      if (e.typeId !== type.id) continue;
      const r = new JfrReader(this.buf, e.offset);
      r.varint();                            // size
      r.varint();                            // type id
      yield this.readFields(r, type) as Record<string, JfrValue>;
    }
  }

  // ── Values ────────────────────────────────────────────────────────────────

  private readValue(r: JfrReader, type: JfrType): JfrValue {
    if (type.primitive) return this.readPrimitive(r, type.name);
    return this.readFields(r, type);
  }

  private readFields(r: JfrReader, type: JfrType): JfrValue {
    const out: Record<string, JfrValue> = {};
    for (const f of type.fields) {
      const ft = this.meta.types.get(f.typeId);
      if (f.array) {
        const n = r.varint();
        const arr: JfrValue[] = new Array(n);
        for (let i = 0; i < n; i++) arr[i] = this.readOne(r, f.constantPool, f.typeId, ft);
        out[f.name] = arr;
      } else {
        out[f.name] = this.readOne(r, f.constantPool, f.typeId, ft);
      }
    }
    return out;
  }

  private readOne(r: JfrReader, isRef: boolean, typeId: number, type?: JfrType): JfrValue {
    // A constant-pool field is an index, whatever the pointed-at type is.
    if (isRef) return { pool: typeId, index: r.varint() };
    if (!type) throw new Error(`Unknown type id ${typeId} in the event stream.`);
    return this.readValue(r, type);
  }

  private readPrimitive(r: JfrReader, name: string): JfrValue {
    switch (name) {
      case 'boolean': return r.u1() !== 0;
      case 'byte': return r.u1();
      case 'char': return r.varint();
      case 'short': case 'int': return r.svarint();
      case 'long': return r.varlong();
      case 'float': { const v = this.buf.readFloatBE(r.pos); r.pos += 4; return v; }
      case 'double': { const v = this.buf.readDoubleBE(r.pos); r.pos += 8; return v; }
      case 'java.lang.String': return r.string();
      default: throw new Error(`Unhandled primitive ${name}`);
    }
  }

  // ── Resolution ────────────────────────────────────────────────────────────

  /** True for anything still pointing into a pool. */
  static isRef(v: JfrValue): v is PoolRef {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
      && 'pool' in v && 'index' in v;
  }

  /**
   * Follows a reference, and every reference inside it.
   *
   * Memoised per (pool, index) because the chain fans in hard: a thousand
   * samples share a handful of stack traces, and those share their frames.
   * Depth is capped because a damaged pool can point at itself, and a stack
   * overflow here would take the extension host down rather than the parse.
   */
  resolve(value: JfrValue, depth = 0): JfrValue {
    if (depth > 12) return null;
    if (Array.isArray(value)) return value.map(v => this.resolve(v, depth + 1));
    if (!JfrChunk.isRef(value)) {
      if (value && typeof value === 'object') {
        const out: Record<string, JfrValue> = {};
        for (const [k, v] of Object.entries(value)) out[k] = this.resolve(v, depth + 1);
        return out;
      }
      return value;
    }

    const key = `${value.pool}:${value.index}`;
    const cached = this.resolved.get(key);
    if (cached !== undefined) return cached;
    // Placed before the recursive call: a pool entry that refers to itself
    // would otherwise recurse until the depth cap, once per lookup.
    this.resolved.set(key, null);

    const raw = this.pools.get(value.pool)?.get(value.index);
    if (raw === undefined) return null;
    const out = this.resolve(raw, depth + 1);
    this.resolved.set(key, out);
    return out;
  }

  /** A chunk's wall-clock start, as epoch milliseconds. */
  get startMs(): number { return Number(this.header.startNanos / 1_000_000n); }

  /** Converts an event's tick reading to epoch milliseconds. */
  ticksToMs(ticks: bigint): number {
    const perSec = this.header.ticksPerSecond || 1_000_000_000n;
    const since = ticks - this.header.startTicks;
    return this.startMs + Number((since * 1000n) / perSec);
  }
}
