/**
 * `.dkheap` sidecar — the parsed index, serialized next to the dump.
 *
 * Parsing is three full reads of the file. Doing that again every time someone
 * reopens a dump they looked at yesterday is the difference between a tool you
 * reach for and one you avoid, so the index is written once and memory-mapped
 * back on the next open.
 *
 * The format is deliberately dumb: a JSON header describing the arrays, then the
 * arrays themselves back to back. Typed arrays are already the on-disk shape —
 * there is nothing to encode, only to concatenate — so writing is a few memcpys
 * and reading is a slice per column.
 *
 * A sidecar is only reused when it matches the dump it came from. It carries the
 * dump's size and mtime and a format version, and any mismatch means a re-parse
 * rather than a wrong answer: a stale index would be indistinguishable from a
 * correct one right up until the numbers were wrong.
 */
import { readFileSync, writeFileSync, statSync, existsSync, unlinkSync } from 'fs';
import type { HeapIndex, HeapClass, GcRoot } from './heap-index';

/** Bump on any change to the arrays or their meaning. Old sidecars are then ignored. */
const FORMAT_VERSION = 1;
const MAGIC = 'DKHEAP\0';

interface SidecarHeader {
  magic: string;
  version: number;
  /** Identity of the dump this was built from. */
  source: { size: number; mtimeMs: number };
  count: number;
  totalBytes: number;
  idSize: number;
  timestamp: number;
  textCandidates: number;
  textSamples: string[];
  classes: HeapClass[];
  roots: GcRoot[];
  /** Byte length of each column, in the order they are written. */
  columns: { name: string; kind: string; bytes: number }[];
}

const COLUMNS = [
  { name: 'classOf', ctor: Int32Array },
  { name: 'shallow', ctor: Int32Array },
  { name: 'kind', ctor: Uint8Array },
  { name: 'flags', ctor: Uint8Array },
  { name: 'refOffset', ctor: Uint32Array },
  { name: 'refTarget', ctor: Int32Array },
  { name: 'refWeak', ctor: Uint8Array },
] as const;

export function sidecarPath(dumpPath: string): string {
  return `${dumpPath}.dkheap`;
}

/**
 * Write the index beside the dump.
 *
 * Failure is never fatal — a cache that cannot be written just means the next
 * open re-parses, which is exactly what happened before this existed.
 */
export function writeSidecar(dumpPath: string, index: HeapIndex): boolean {
  try {
    const src = statSync(dumpPath);
    const arrays = COLUMNS.map(c => index[c.name as keyof HeapIndex] as unknown as ArrayBufferView);

    const header: SidecarHeader = {
      magic: MAGIC,
      version: FORMAT_VERSION,
      source: { size: src.size, mtimeMs: Math.floor(src.mtimeMs) },
      count: index.count,
      totalBytes: index.totalBytes,
      idSize: index.idSize,
      timestamp: index.timestamp,
      textCandidates: index.textCandidates,
      // Kept so the redaction scan does not need the dump re-read. These are
      // sampled contents, so the sidecar is as sensitive as the dump itself and
      // lives beside it rather than anywhere shared.
      textSamples: index.textSamples,
      classes: index.classes,
      roots: index.roots,
      columns: COLUMNS.map((c, i) => ({ name: c.name, kind: c.ctor.name, bytes: arrays[i].byteLength })),
    };

    const headerJson = Buffer.from(JSON.stringify(header), 'utf8');
    const lengthPrefix = Buffer.alloc(8);
    lengthPrefix.writeUInt32BE(headerJson.length, 0);

    writeFileSync(sidecarPath(dumpPath), Buffer.concat([
      lengthPrefix,
      headerJson,
      ...arrays.map(a => Buffer.from(a.buffer, a.byteOffset, a.byteLength)),
    ]));
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a sidecar, or return null when there isn't a usable one.
 *
 * Every rejection path is silent and falls back to parsing. The only thing that
 * must never happen is returning an index that does not match the dump.
 */
export function readSidecar(dumpPath: string): HeapIndex | null {
  const path = sidecarPath(dumpPath);
  try {
    if (!existsSync(path)) return null;
    const src = statSync(dumpPath);
    const buf = readFileSync(path);
    if (buf.length < 8) return null;

    const headerLen = buf.readUInt32BE(0);
    if (headerLen <= 0 || headerLen + 8 > buf.length) return null;
    const header = JSON.parse(buf.toString('utf8', 8, 8 + headerLen)) as SidecarHeader;

    if (header.magic !== MAGIC || header.version !== FORMAT_VERSION) return null;
    // A dump edited or replaced under the same name must not reuse the index.
    if (header.source.size !== src.size || header.source.mtimeMs !== Math.floor(src.mtimeMs)) return null;

    const index: Record<string, unknown> = {
      count: header.count,
      totalBytes: header.totalBytes,
      idSize: header.idSize,
      timestamp: header.timestamp,
      textCandidates: header.textCandidates,
      textSamples: header.textSamples ?? [],
      classes: header.classes,
      roots: header.roots,
    };

    let at = 8 + headerLen;
    for (const col of COLUMNS) {
      const meta = header.columns.find(c => c.name === col.name);
      if (!meta || meta.kind !== col.ctor.name) return null;
      if (at + meta.bytes > buf.length) return null;
      // Copy rather than view the file buffer: the arrays outlive it, and a view
      // would pin the whole sidecar in memory for the sake of one column.
      const slice = buf.subarray(at, at + meta.bytes);
      const arr = new col.ctor(meta.bytes / col.ctor.BYTES_PER_ELEMENT);
      Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).set(slice);
      index[col.name] = arr;
      at += meta.bytes;
    }
    if (at !== buf.length) return null;   // trailing bytes mean a different format

    return index as unknown as HeapIndex;
  } catch {
    return null;
  }
}

/** Remove a sidecar — used when it is found to be unusable. */
export function clearSidecar(dumpPath: string): void {
  try { unlinkSync(sidecarPath(dumpPath)); } catch { /* nothing to remove */ }
}
