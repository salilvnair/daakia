/**
 * Columnar heap index — the store every later stage queries.
 *
 * Objects become rows in parallel typed arrays and references become a
 * compressed-sparse-row adjacency list, because that is the only shape that
 * holds a real dump. A 4 GB hprof is ~45M objects and ~130M references; one JS
 * object per heap object would need tens of gigabytes and collapse the GC, while
 * CSR stores the whole edge set in a single flat Int32Array with no per-edge
 * overhead — roughly 620 MB resident for that dump.
 *
 * Everything is index-based, never id-based, after parsing: an object is its row
 * number. Ids only exist to resolve references during the parse, which is what
 * IdMap is for.
 */

/**
 * Open-addressing hash from 64-bit object id to dense row index.
 *
 * A Map<bigint, number> would allocate two boxed values per entry and is the
 * single fastest way to make a large parse run out of memory. This keeps keys in
 * a Float64Array instead: heap addresses on 64-bit VMs fit in 48 bits, well
 * inside the 53 bits a double represents exactly, so a Number key is lossless.
 *
 * Id 0 is the null reference and never names an object, which makes 0 a safe
 * empty sentinel and avoids a separate occupancy bitmap.
 */
export class IdMap {
  private keys: Float64Array;
  private vals: Int32Array;
  private mask: number;
  private _size = 0;

  constructor(expected: number) {
    // Load factor 0.5, rounded up to a power of two so the probe can mask.
    let cap = 16;
    while (cap < expected * 2) cap *= 2;
    this.keys = new Float64Array(cap);
    this.vals = new Int32Array(cap);
    this.mask = cap - 1;
  }

  get size(): number { return this._size; }

  /** Fibonacci-ish scramble — object ids are addresses and cluster hard on their low bits. */
  private slot(key: number): number {
    let h = Math.imul(key >>> 0, 0x9e3779b1) ^ Math.imul((key / 0x100000000) >>> 0, 0x85ebca6b);
    return (h >>> 0) & this.mask;
  }

  set(key: number, value: number): void {
    if (key === 0) return;
    let i = this.slot(key);
    for (;;) {
      const k = this.keys[i];
      if (k === 0) { this.keys[i] = key; this.vals[i] = value; this._size++; return; }
      if (k === key) { this.vals[i] = value; return; }
      i = (i + 1) & this.mask;
    }
  }

  /** Row index for this id, or -1. Callers must treat -1 as "outside the dump". */
  get(key: number): number {
    if (key === 0) return -1;
    let i = this.slot(key);
    for (;;) {
      const k = this.keys[i];
      if (k === 0) return -1;
      if (k === key) return this.vals[i];
      i = (i + 1) & this.mask;
    }
  }
}

/** Object kinds, kept in a byte alongside the flags. */
export const KIND_INSTANCE = 0;
export const KIND_OBJECT_ARRAY = 1;
export const KIND_PRIMITIVE_ARRAY = 2;
export const KIND_CLASS = 3;

/** Bit flags per object. */
export const FLAG_GC_ROOT = 1 << 0;
export const FLAG_REACHABLE = 1 << 1;

export interface HeapClass {
  /** Object id of the java.lang.Class instance for this type. */
  classId: number;
  /** JVM-internal name as it appears in the dump, e.g. "java/lang/String". */
  name: string;
  superId: number;
  instanceSize: number;
  /** Own instance fields only — the superclass chain is walked separately. */
  fields: { nameId: number; type: number }[];
  /** Filled after parsing: how many instances and how many bytes they occupy. */
  instanceCount: number;
  shallowBytes: number;
}

/** A GC root, kept separately because roots are few and carry a reason. */
export interface GcRoot {
  objectIndex: number;
  /** Heap sub-record tag that produced it — 0x05 sticky class, 0x03 java frame, etc. */
  tag: number;
}

/**
 * The parsed dump. Field arrays are all length `count` and share row indices;
 * `refOffset` has length `count + 1` in the usual CSR fashion, so an object's
 * outbound edges are refTarget[refOffset[i] .. refOffset[i+1]).
 */
export interface HeapIndex {
  /** Number of objects (rows). */
  count: number;
  /** Row → index into `classes`. */
  classOf: Int32Array;
  /** Row → shallow size in bytes. */
  shallow: Int32Array;
  /** Row → KIND_* */
  kind: Uint8Array;
  /** Row → FLAG_* bitfield. */
  flags: Uint8Array;
  /** CSR offsets, length count + 1. */
  refOffset: Uint32Array;
  /** CSR targets — row indices. -1 for references that leave the dump. */
  refTarget: Int32Array;

  classes: HeapClass[];
  roots: GcRoot[];

  /** Sum of `shallow`, i.e. total bytes of all objects in the dump. */
  totalBytes: number;
  /** Identifier width the dump declared: 4 or 8. */
  idSize: number;
  /** Milliseconds since epoch, from the dump header. */
  timestamp: number;
}

/** `java/lang/String` → `java.lang.String`. Display only; keys stay internal. */
export function displayClassName(internal: string): string {
  return internal.replace(/\//g, '.');
}
