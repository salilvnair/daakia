/**
 * HPROF parser — binary dump to columnar index.
 *
 * The format is a header followed by tagged records; everything that matters
 * lives in HEAP_DUMP_SEGMENT sub-records. Validated against a real JDK 17 dump
 * (see src/test/fixtures/heap/README.md) where a correct walk consumes every
 * byte of the file exactly.
 *
 * Three passes, in this order, because each one needs what the last produced:
 *
 *   A  strings, classes, class layouts, and every object id registered to a row.
 *      Instance field bytes are skipped — they cannot be decoded yet, since a
 *      CLASS_DUMP may legally appear after instances of that class.
 *   B  with layouts known, count outbound references per object and prefix-sum
 *      them into CSR offsets.
 *   C  fill refTarget.
 *
 * Three file reads is the honest cost of not assuming record ordering. The
 * obvious optimisation later is to cache record offsets in pass A so B and C
 * seek rather than re-walk, which is why the walk is factored into one function.
 */
import { openSync, readSync, closeSync, statSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { gunzipSync } from 'zlib';
import { readSidecar, writeSidecar } from './heap-cache';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  IdMap, KIND_INSTANCE, KIND_OBJECT_ARRAY, KIND_PRIMITIVE_ARRAY, KIND_CLASS,
  FLAG_GC_ROOT, type HeapClass, type HeapIndex, type GcRoot,
} from './heap-index';

// ── Top-level record tags ────────────────────────────────────────────────────
const TAG_STRING = 0x01;
const TAG_LOAD_CLASS = 0x02;
const TAG_HEAP_DUMP = 0x0c;
const TAG_HEAP_DUMP_SEGMENT = 0x1c;

// ── Heap sub-record tags ─────────────────────────────────────────────────────
const SUB_CLASS_DUMP = 0x20;
const SUB_INSTANCE_DUMP = 0x21;
const SUB_OBJECT_ARRAY = 0x22;
const SUB_PRIMITIVE_ARRAY = 0x23;

/** GC root sub-records → number of extra u4 fields after the object id. */
const ROOT_EXTRA_U4: Record<number, number> = {
  0xff: 0, // UNKNOWN
  0x01: -1, // JNI GLOBAL — id + id
  0x02: 2, // JNI LOCAL
  0x03: 2, // JAVA FRAME
  0x04: 1, // NATIVE STACK
  0x05: 0, // STICKY CLASS
  0x06: 1, // THREAD BLOCK
  0x07: 0, // MONITOR USED
  0x08: 2, // THREAD OBJECT
};

/** JVM basic type tag → width in bytes. Index 2 (object) is the identifier size. */
function typeWidth(type: number, idSize: number): number {
  switch (type) {
    case 2: return idSize;
    case 4: case 8: return 1;   // boolean, byte
    case 5: case 9: return 2;   // char, short
    case 6: case 10: return 4;  // float, int
    case 7: case 11: return 8;  // double, long
    default: throw new Error(`unknown basic type ${type}`);
  }
}

export interface ParseProgress {
  /** 'A' | 'B' | 'C' — which pass. */
  pass: string;
  bytesRead: number;
  totalBytes: number;
}

export interface ParseOptions {
  /**
   * Reuse and write a `.dkheap` sidecar beside the dump. Default on — the point
   * of the cache is that nobody has to know it exists.
   */
  cache?: boolean;
  /**
   * How many byte[]/char[] payloads to sample the contents of, for the local
   * secret scan. Contents never leave this process — the redaction gate needs
   * to look at them precisely so that it can refuse to send them.
   */
  textSampleLimit?: number;
  onProgress?: (p: ParseProgress) => void;
  /** Polled between records; parsing aborts promptly when it returns true. */
  isCancelled?: () => boolean;
}

export class ParseCancelled extends Error {
  constructor() { super('Heap dump parsing cancelled'); this.name = 'ParseCancelled'; }
}

/** Buffered forward-only reader over a file descriptor. */
class Reader {
  private buf = Buffer.alloc(1 << 20);
  private bufStart = 0;
  private bufLen = 0;
  pos = 0;

  constructor(private fd: number, public readonly size: number) {}

  seek(p: number) { this.pos = p; }

  private fill(need: number) {
    if (this.pos >= this.bufStart && this.pos + need <= this.bufStart + this.bufLen) return;
    this.bufStart = this.pos;
    this.bufLen = readSync(this.fd, this.buf, 0, this.buf.length, this.bufStart);
    if (this.bufLen < need) throw new Error(`truncated dump: wanted ${need} bytes at ${this.pos}`);
  }
  private at() { return this.pos - this.bufStart; }

  u1(): number { this.fill(1); const v = this.buf.readUInt8(this.at()); this.pos += 1; return v; }
  u2(): number { this.fill(2); const v = this.buf.readUInt16BE(this.at()); this.pos += 2; return v; }
  u4(): number { this.fill(4); const v = this.buf.readUInt32BE(this.at()); this.pos += 4; return v; }

  /** Object id as a Number — exact for the ≤48-bit addresses real VMs produce. */
  id(idSize: number): number {
    this.fill(idSize);
    const v = idSize === 8
      ? this.buf.readUInt32BE(this.at()) * 0x100000000 + this.buf.readUInt32BE(this.at() + 4)
      : this.buf.readUInt32BE(this.at());
    this.pos += idSize;
    return v;
  }

  utf8(len: number): string {
    if (len <= 0) return '';
    if (len > this.buf.length) {  // rare: a very long string constant
      const tmp = Buffer.alloc(len);
      readSync(this.fd, tmp, 0, len, this.pos);
      this.pos += len;
      return tmp.toString('utf8');
    }
    this.fill(len);
    const v = this.buf.toString('utf8', this.at(), this.at() + len);
    this.pos += len;
    return v;
  }

  /** Raw bytes without decoding — the caller decides the encoding. */
  utf8Bytes(len: number): Buffer {
    if (len <= 0) return Buffer.alloc(0);
    if (len > this.buf.length) {
      const tmp = Buffer.alloc(len);
      readSync(this.fd, tmp, 0, len, this.pos);
      this.pos += len;
      return tmp;
    }
    this.fill(len);
    const out = Buffer.from(this.buf.subarray(this.at(), this.at() + len));
    this.pos += len;
    return out;
  }

  skip(n: number) { this.pos += n; }
}

/** UTF-16BE, as char[] is stored in a dump. */
function decodeUtf16(buf: Buffer): string {
  let out = '';
  for (let i = 0; i + 1 < buf.length; i += 2) out += String.fromCharCode(buf.readUInt16BE(i));
  return out;
}

/**
 * Is this array plausibly text rather than binary?
 *
 * Deliberately generous: a false positive costs one extra string in a local
 * scan, while a false negative means a credential slips past the gate unseen.
 */
function looksTextual(s: string): boolean {
  if (s.length < 4) return false;
  let printable = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)) printable++;
  }
  return printable / s.length > 0.85;
}

/**
 * Header: a NUL-terminated magic, then identifier size and a 64-bit timestamp.
 *
 * The three ways this can fail are distinguished deliberately. "Truncated" and
 * "not a heap dump" send someone looking in completely different places, and a
 * short non-HPROF file trips the truncation guard first unless the magic is
 * checked before anything else is read.
 */
const HPROF_MAGIC = 'JAVA PROFILE';

/**
 * Android dumps carry an HPROF-looking header but a different record dialect —
 * extra tags, different class metadata. Parsing one produces confident nonsense
 * rather than an error, so it is detected and refused by name.
 */
const ANDROID_MAGICS = ['JAVA PROFILE 1.0.3'];

/** gzip: 0x1f 0x8b. */
function isGzip(path: string): boolean {
  const fd = openSync(path, 'r');
  try {
    const head = Buffer.alloc(2);
    return readSync(fd, head, 0, 2, 0) === 2 && head[0] === 0x1f && head[1] === 0x8b;
  } finally { closeSync(fd); }
}

/**
 * Decompress a .hprof.gz to a temp file and parse that.
 *
 * The parser seeks backwards during pass C, so it needs a real file rather than
 * a stream. Decompressing once up front is simpler and faster than making every
 * read path handle compression, at the cost of temporary disk — which is the
 * right trade when the alternative is not supporting compressed dumps at all.
 */
function withDecompressed<T>(path: string, run: (p: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'daakia-heap-'));
  const out = join(dir, 'dump.hprof');
  try {
    writeFileSync(out, gunzipSync(readFileSync(path)));
    return run(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readHeader(r: Reader, fileSize: number): { idSize: number; timestamp: number } {
  if (fileSize === 0) throw new Error('the file is empty');
  if (fileSize < HPROF_MAGIC.length + 13) {
    throw new Error(`the file is ${fileSize} bytes — too short to be a heap dump`);
  }

  // Compare the magic before scanning for its terminator, so a text file fails
  // as "not a heap dump" rather than as a truncation.
  let prefix = '';
  for (let i = 0; i < HPROF_MAGIC.length; i++) prefix += String.fromCharCode(r.u1());
  if (prefix !== HPROF_MAGIC) {
    throw new Error(`not a heap dump — expected it to start with "${HPROF_MAGIC}", found ${JSON.stringify(prefix)}`);
  }

  let version = '';
  for (;;) {
    const c = r.u1();
    if (c === 0) break;
    version += String.fromCharCode(c);
    if (version.length > 32) throw new Error('heap dump header is malformed (no terminator after the version)');
  }
  const full = `${prefix}${version}`;
  if (ANDROID_MAGICS.includes(full)) {
    throw new Error(
      `this is an Android heap dump (${full}). Android uses a different record dialect that this parser ` +
      'would mis-read rather than reject. Convert it first with hprof-conv from the Android SDK.');
  }

  const idSize = r.u4();
  if (idSize !== 4 && idSize !== 8) {
    throw new Error(`unsupported identifier size ${idSize} — only 4 and 8 byte identifiers exist`);
  }
  const hi = r.u4(), lo = r.u4();
  return { idSize, timestamp: hi * 0x100000000 + lo };
}

/**
 * Walks every record and heap sub-record once, invoking the callbacks it is
 * given. All three passes share this so the format is decoded in exactly one
 * place — a second copy of this walk is how the two halves drift apart.
 */
function walk(
  r: Reader,
  idSize: number,
  bodyStart: number,
  handlers: {
    onString?: (id: number, text: string) => void;
    onLoadClass?: (classId: number, nameId: number) => void;
    onClassDump?: (c: { classId: number; superId: number; instanceSize: number; fields: { nameId: number; type: number }[]; staticRefs: number[] }) => void;
    onInstance?: (objId: number, classId: number, fieldBytesAt: number, fieldBytesLen: number) => void;
    onObjectArray?: (objId: number, arrayClassId: number, elementsAt: number, n: number) => void;
    onPrimitiveArray?: (objId: number, type: number, n: number, bytes: number, at: number) => void;
    onRoot?: (objId: number, tag: number) => void;
  },
  opts: ParseOptions,
  passLabel: string,
) {
  r.seek(bodyStart);
  let sinceCheck = 0;

  while (r.pos < r.size) {
    if (++sinceCheck >= 512) {
      sinceCheck = 0;
      if (opts.isCancelled?.()) throw new ParseCancelled();
      opts.onProgress?.({ pass: passLabel, bytesRead: r.pos, totalBytes: r.size });
    }

    const tag = r.u1();
    r.u4();                       // time delta
    const len = r.u4();
    const end = r.pos + len;

    if (tag === TAG_STRING) {
      const sid = r.id(idSize);
      if (handlers.onString) handlers.onString(sid, r.utf8(len - idSize));
    } else if (tag === TAG_LOAD_CLASS) {
      r.u4();
      const classId = r.id(idSize);
      r.u4();
      const nameId = r.id(idSize);
      handlers.onLoadClass?.(classId, nameId);
    } else if (tag === TAG_HEAP_DUMP || tag === TAG_HEAP_DUMP_SEGMENT) {
      while (r.pos < end) {
        const sub = r.u1();

        if (sub === SUB_CLASS_DUMP) {
          const classId = r.id(idSize);
          r.u4();                               // stack trace serial
          const superId = r.id(idSize);
          r.id(idSize); r.id(idSize); r.id(idSize); r.id(idSize); r.id(idSize); // loader, signers, domain, res1, res2
          const instanceSize = r.u4();
          const cpCount = r.u2();
          for (let i = 0; i < cpCount; i++) { r.u2(); r.skip(typeWidth(r.u1(), idSize)); }
          const staticCount = r.u2();
          const staticRefs: number[] = [];
          for (let i = 0; i < staticCount; i++) {
            r.id(idSize);                       // field name id
            const t = r.u1();
            if (t === 2) { const ref = r.id(idSize); if (ref !== 0) staticRefs.push(ref); }
            else r.skip(typeWidth(t, idSize));
          }
          const fieldCount = r.u2();
          const fields: { nameId: number; type: number }[] = [];
          for (let i = 0; i < fieldCount; i++) fields.push({ nameId: r.id(idSize), type: r.u1() });
          handlers.onClassDump?.({ classId, superId, instanceSize, fields, staticRefs });

        } else if (sub === SUB_INSTANCE_DUMP) {
          const objId = r.id(idSize);
          r.u4();
          const classId = r.id(idSize);
          const nBytes = r.u4();
          const at = r.pos;
          r.skip(nBytes);
          handlers.onInstance?.(objId, classId, at, nBytes);

        } else if (sub === SUB_OBJECT_ARRAY) {
          const objId = r.id(idSize);
          r.u4();
          const n = r.u4();
          const arrayClassId = r.id(idSize);
          const at = r.pos;
          r.skip(n * idSize);
          handlers.onObjectArray?.(objId, arrayClassId, at, n);

        } else if (sub === SUB_PRIMITIVE_ARRAY) {
          const objId = r.id(idSize);
          r.u4();
          const n = r.u4();
          const t = r.u1();
          const w = typeWidth(t, idSize);
          const at = r.pos;
          r.skip(n * w);
          handlers.onPrimitiveArray?.(objId, t, n, n * w, at);

        } else {
          const extra = ROOT_EXTRA_U4[sub];
          if (extra === undefined) {
            throw new Error(`unknown heap sub-record 0x${sub.toString(16)} at offset ${r.pos - 1}`);
          }
          const objId = r.id(idSize);
          if (extra === -1) r.id(idSize);       // JNI global has a second id
          else r.skip(extra * 4);
          handlers.onRoot?.(objId, sub);
        }
      }
      if (r.pos !== end) throw new Error(`heap segment overran by ${r.pos - end} bytes`);
    }

    r.seek(end);
  }
}

/**
 * Instance field bytes are laid out as the class's own fields, then its
 * superclass's, walking up the chain. Decoding a field without walking that
 * chain is the classic way to produce plausible-but-wrong output, so the
 * resolved layout is cached per class.
 */
interface RefSlot {
  offset: number;
  /**
   * True for the `referent` field of a weak, soft or phantom Reference.
   *
   * These edges do not keep their target alive, so counting them as normal
   * references overstates retained size and can put the blame for a leak on a
   * cache that is doing exactly what it should. Excluded from reachability and
   * from the dominator tree, which is what MAT does too.
   */
  weak: boolean;
}

/**
 * Is this class a Reference whose referent does NOT keep its target alive?
 *
 * FinalReference is deliberately excluded: an object awaiting finalization is
 * genuinely still alive and its memory genuinely cannot be reclaimed, so
 * treating a Finalizer edge as weak would under-report a real problem — and a
 * finalizer backlog is a problem the rule pack specifically looks for.
 */
function isWeakReferenceClass(classId: number, byId: Map<number, HeapClass>): boolean {
  let cursor = byId.get(classId);
  let sawReference = false;
  while (cursor) {
    if (cursor.name === 'java/lang/ref/FinalReference') return false;
    if (cursor.name === 'java/lang/ref/Reference') sawReference = true;
    cursor = cursor.superId ? byId.get(cursor.superId) : undefined;
  }
  return sawReference;
}

/**
 * Reference-field offsets within an instance's field bytes.
 *
 * The layout is the class's own fields, then its superclass's, walking up — so
 * the referent field declared on java.lang.ref.Reference sits at whatever offset
 * the subclass's own fields push it to, and has to be located by walking rather
 * than assumed.
 */
function resolveLayout(
  classId: number,
  byId: Map<number, HeapClass>,
  cache: Map<number, RefSlot[]>,
  idSize: number,
  fieldName: (nameId: number) => string,
): RefSlot[] {
  const hit = cache.get(classId);
  if (hit) return hit;

  const weakClass = isWeakReferenceClass(classId, byId);
  const refOffsets: RefSlot[] = [];
  let offset = 0;
  let cursor: HeapClass | undefined = byId.get(classId);
  while (cursor) {
    const declaredOnReference = cursor.name === 'java/lang/ref/Reference';
    for (const f of cursor.fields) {
      if (f.type === 2) {
        refOffsets.push({
          offset,
          weak: weakClass && declaredOnReference && fieldName(f.nameId) === 'referent',
        });
      }
      offset += typeWidth(f.type, idSize);
    }
    cursor = cursor.superId ? byId.get(cursor.superId) : undefined;
  }
  cache.set(classId, refOffsets);
  return refOffsets;
}

export function parseHprof(path: string, opts: ParseOptions = {}): HeapIndex {
  const useCache = opts.cache !== false;

  if (useCache) {
    const cached = readSidecar(path);
    if (cached) {
      // Report one progress tick so a caller showing a bar completes it rather
      // than appearing to hang on an instant load.
      opts.onProgress?.({ pass: 'cache', bytesRead: 1, totalBytes: 1 });
      return cached;
    }
  }

  // Compressed dumps are common, because a 4 GB dump compresses very well and
  // that is how it gets off the server in the first place.
  const index = isGzip(path)
    ? withDecompressed(path, (p) => parseHprofUncompressed(p, opts))
    : parseHprofUncompressed(path, opts);

  // Keyed on the original path, so a .gz reopens from cache without decompressing.
  if (useCache) writeSidecar(path, index);
  return index;
}

function parseHprofUncompressed(path: string, opts: ParseOptions = {}): HeapIndex {
  const size = statSync(path).size;
  const fd = openSync(path, 'r');
  try {
    const r = new Reader(fd, size);
    const { idSize, timestamp } = readHeader(r, size);
    const bodyStart = r.pos;

    // ── Pass A — metadata, and every object id given a row ──────────────────
    const strings = new Map<number, string>();
    const classNameId = new Map<number, number>();
    const classById = new Map<number, HeapClass>();
    const staticRefsByClass = new Map<number, number[]>();

    // Primitive arrays carry no CLASS_DUMP, so without synthetic entries byte[]
    // and char[] — usually the largest consumers in a heap — vanish from the
    // histogram entirely. MAT synthesises them for the same reason.
    const PRIM_NAMES: Record<number, string> = {
      4: '[Z', 5: '[C', 6: '[F', 7: '[D', 8: '[B', 9: '[S', 10: '[I', 11: '[J',
    };
    const primClassOf = new Map<number, HeapClass>();
    const primClass = (type: number): HeapClass => {
      let c = primClassOf.get(type);
      if (!c) {
        c = { classId: -type, name: PRIM_NAMES[type] ?? `[?${type}`, superId: 0,
              instanceSize: 0, fields: [], instanceCount: 0, shallowBytes: 0 };
        primClassOf.set(type, c);
      }
      return c;
    };

    // Rows are assigned in encounter order. Counting first would need a fourth
    // read, so ids go straight into a generously sized map and it is compacted
    // implicitly by only ever using indices below `count`.
    const estimate = Math.max(1024, Math.floor(size / 48));
    const ids = new IdMap(estimate);
    let count = 0;

    // Counted in pass A so pass C can stride evenly across the file rather than
    // taking the first N. Dump order is not representative — the early records
    // are dominated by whatever the VM allocated first, so a prefix sample can
    // miss duplicated values and credentials entirely.
    let textCandidates = 0;

    type Pending = { row: number; classId: number; kind: number; shallow: number };
    const pending: Pending[] = [];
    const rootsRaw: { objId: number; tag: number }[] = [];

    walk(r, idSize, bodyStart, {
      onString: (id, text) => strings.set(id, text),
      onLoadClass: (classId, nameId) => classNameId.set(classId, nameId),
      onClassDump: (c) => {
        classById.set(c.classId, {
          classId: c.classId, name: '', superId: c.superId,
          instanceSize: c.instanceSize, fields: c.fields,
          instanceCount: 0, shallowBytes: 0,
        });
        if (c.staticRefs.length) staticRefsByClass.set(c.classId, c.staticRefs);
        if (ids.get(c.classId) === -1) {
          ids.set(c.classId, count);
          pending.push({ row: count++, classId: c.classId, kind: KIND_CLASS, shallow: 0 });
        }
      },
      onInstance: (objId, classId, _at, nBytes) => {
        ids.set(objId, count);
        pending.push({ row: count++, classId, kind: KIND_INSTANCE, shallow: nBytes });
      },
      onObjectArray: (objId, arrayClassId, _at, n) => {
        ids.set(objId, count);
        pending.push({ row: count++, classId: arrayClassId, kind: KIND_OBJECT_ARRAY, shallow: n * idSize });
      },
      onPrimitiveArray: (objId, t, n, bytes) => {
        ids.set(objId, count);
        pending.push({ row: count++, classId: primClass(t).classId, kind: KIND_PRIMITIVE_ARRAY, shallow: bytes });
        if ((t === 8 || t === 5) && n > 0 && n <= 4096) textCandidates++;
      },
      onRoot: (objId, tag) => rootsRaw.push({ objId, tag }),
    }, opts, 'A');

    // Resolve class names now that the string table is complete.
    for (const c of primClassOf.values()) classById.set(c.classId, c);

    const classes: HeapClass[] = [];
    const classRowOf = new Map<number, number>();
    for (const [classId, c] of classById) {
      if (!c.name) c.name = strings.get(classNameId.get(classId) ?? -1) ?? '<unknown>';
      classRowOf.set(classId, classes.length);
      classes.push(c);
    }

    // ── Materialise the columnar arrays ─────────────────────────────────────
    const classOf = new Int32Array(count).fill(-1);
    const shallow = new Int32Array(count);
    const kind = new Uint8Array(count);
    const flags = new Uint8Array(count);
    let totalBytes = 0;

    for (const p of pending) {
      classOf[p.row] = classRowOf.get(p.classId) ?? -1;
      shallow[p.row] = p.shallow;
      kind[p.row] = p.kind;
      totalBytes += p.shallow;
      if (p.kind !== KIND_CLASS) {
        const c = classById.get(p.classId);
        if (c) { c.instanceCount++; c.shallowBytes += p.shallow; }
      }
    }
    pending.length = 0;

    const roots: GcRoot[] = [];
    for (const { objId, tag } of rootsRaw) {
      const row = ids.get(objId);
      if (row >= 0) { flags[row] |= FLAG_GC_ROOT; roots.push({ objectIndex: row, tag }); }
    }
    rootsRaw.length = 0;

    // ── Pass B — count outbound references, then prefix-sum to CSR offsets ──
    const refOffset = new Uint32Array(count + 1);
    const layouts = new Map<number, RefSlot[]>();
    const fieldName = (nameId: number) => strings.get(nameId) ?? '';
    const counter = new Int32Array(count);

    const countRefs = (row: number, n: number) => { if (row >= 0) counter[row] += n; };

    walk(r, idSize, bodyStart, {
      onClassDump: (c) => countRefs(ids.get(c.classId), (staticRefsByClass.get(c.classId) ?? []).length),
      onInstance: (objId, classId) => countRefs(ids.get(objId), resolveLayout(classId, classById, layouts, idSize, fieldName).length),
      onObjectArray: (objId, _cls, _at, n) => countRefs(ids.get(objId), n),
    }, opts, 'B');

    let acc = 0;
    for (let i = 0; i < count; i++) { refOffset[i] = acc; acc += counter[i]; }
    refOffset[count] = acc;

    // ── Pass C — fill the edge array ────────────────────────────────────────
    const textSampleLimit = opts.textSampleLimit ?? 20000;
    const textSamples: string[] = [];
    const MAX_SAMPLE_CHARS = 220;
    // Deterministic systematic sample: every stride-th candidate. Uniform across
    // the whole dump, and repeatable, which a reservoir sample would not be.
    const textStride = textCandidates > textSampleLimit
      ? Math.floor(textCandidates / textSampleLimit)
      : 1;
    let textSeen = 0;

    const refTarget = new Int32Array(acc);
    // Parallel to refTarget: 1 where the edge is a weak/soft/phantom referent.
    const refWeak = new Uint8Array(acc);
    const cursor = new Uint32Array(count);
    const push = (row: number, targetId: number, weak = false) => {
      if (row < 0) return;
      const at = refOffset[row] + cursor[row]++;
      refTarget[at] = ids.get(targetId);
      if (weak) refWeak[at] = 1;
    };

    walk(r, idSize, bodyStart, {
      onClassDump: (c) => {
        const row = ids.get(c.classId);
        for (const ref of staticRefsByClass.get(c.classId) ?? []) push(row, ref);
      },
      onInstance: (objId, classId, at, nBytes) => {
        const row = ids.get(objId);
        if (row < 0) return;
        const refs = resolveLayout(classId, classById, layouts, idSize, fieldName);
        if (!refs.length) return;
        r.seek(at);
        // Field bytes were already walked past; re-read only the slots that hold refs.
        for (const { offset, weak } of refs) {
          if (offset + idSize > nBytes) break;   // layout longer than the record: truncate rather than misread
          r.seek(at + offset);
          push(row, r.id(idSize), weak);
        }
        r.seek(at + nBytes);
      },
      onObjectArray: (objId, _cls, at, n) => {
        const row = ids.get(objId);
        if (row < 0) return;
        r.seek(at);
        for (let i = 0; i < n; i++) push(row, r.id(idSize));
        r.seek(at + n * idSize);
      },
      // Sample byte[] and char[] payloads — these back every String in the heap,
      // which is where credentials and personal data actually live.
      onPrimitiveArray: (_objId, type, n, byteLen, at) => {
        if (type !== 8 && type !== 5) return;          // byte, char
        if (n === 0 || n > 4096) return;               // huge buffers are rarely text
        if (textSeen++ % textStride !== 0) return;
        if (textSamples.length >= textSampleLimit) return;
        const take = Math.min(byteLen, MAX_SAMPLE_CHARS);
        r.seek(at);
        const raw = r.utf8Bytes(take);
        r.seek(at + byteLen);
        const text = type === 5 ? decodeUtf16(raw) : raw.toString('latin1');
        if (looksTextual(text)) textSamples.push(text);
      },
    }, opts, 'C');

    return {
      count, classOf, shallow, kind, flags, refOffset, refTarget,
      classes, roots, totalBytes, idSize, timestamp, textSamples, textCandidates, refWeak,
    };
  } finally {
    closeSync(fd);
  }
}
