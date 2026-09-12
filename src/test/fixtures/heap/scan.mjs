/**
 * Throwaway-grade validation scanner for the HPROF format model.
 *
 * Its only job is to prove, against a real dump, that the record and sub-record
 * walk is correct before ~900 lines of parser get written on top of it. If the
 * walk is right it consumes every byte of every segment exactly, lands on the
 * final record boundary, and reports fixture class counts that match the planted
 * ground truth. If the walk is wrong it desynchronises and throws almost at once.
 *
 * Run:  node scan.mjs out/leak.hprof
 */
import { openSync, readSync, closeSync, statSync } from 'fs';

const file = process.argv[2] ?? 'out/leak.hprof';
const fd = openSync(file, 'r');
const size = statSync(file).size;

// ── Buffered sequential reader ────────────────────────────────────────────────
const BUF = 1 << 20;
let buf = Buffer.alloc(BUF);
let bufStart = 0;      // file offset of buf[0]
let bufLen = 0;
let pos = 0;           // absolute file offset of the cursor

function fill(need) {
  if (pos >= bufStart && pos + need <= bufStart + bufLen) return;
  bufStart = pos;
  bufLen = readSync(fd, buf, 0, BUF, bufStart);
  if (bufLen < need) throw new Error(`short read at ${pos}: wanted ${need}, got ${bufLen}`);
}
const at = () => pos - bufStart;
function u1() { fill(1); const v = buf.readUInt8(at()); pos += 1; return v; }
function u2() { fill(2); const v = buf.readUInt16BE(at()); pos += 2; return v; }
function u4() { fill(4); const v = buf.readUInt32BE(at()); pos += 4; return v; }
function id() { fill(idSize); const v = idSize === 8 ? buf.readBigUInt64BE(at()) : BigInt(buf.readUInt32BE(at())); pos += idSize; return v; }
function bytes(n) { fill(Math.min(n, BUF)); const v = buf.subarray(at(), at() + n); pos += n; return v; }
function skip(n) { pos += n; }

// ── Header ────────────────────────────────────────────────────────────────────
let idSize = 8;
{
  fill(64);
  const nul = buf.indexOf(0, 0);
  const magic = buf.toString('latin1', 0, nul);
  pos = nul + 1;
  idSize = u4();
  u4(); u4();  // timestamp hi/lo
  console.log(`magic=${JSON.stringify(magic)} idSize=${idSize} bodyStart=${pos}`);
}

// JVM basic type codes → width in bytes (index = type tag)
const TYPE_SIZE = { 2: idSize, 4: 1, 5: 2, 6: 4, 7: 8, 8: 1, 9: 2, 10: 4, 11: 8 };

const strings = new Map();        // stringId → text
const classNameByClassId = new Map();
const tagCount = {};
const subCount = {};
const instancesByClass = new Map();  // classObjectId → count
let rootCount = 0;

function readValue(type) {
  const w = TYPE_SIZE[type];
  if (w === undefined) throw new Error(`bad basic type ${type} at ${pos}`);
  skip(w);
}

function heapSubRecord() {
  const tag = u1();
  subCount[tag] = (subCount[tag] ?? 0) + 1;
  switch (tag) {
    // ── GC roots ──
    case 0xFF: id(); rootCount++; break;                                  // UNKNOWN
    case 0x01: id(); id(); rootCount++; break;                            // JNI GLOBAL
    case 0x02: id(); u4(); u4(); rootCount++; break;                      // JNI LOCAL
    case 0x03: id(); u4(); u4(); rootCount++; break;                      // JAVA FRAME
    case 0x04: id(); u4(); rootCount++; break;                            // NATIVE STACK
    case 0x05: id(); rootCount++; break;                                  // STICKY CLASS
    case 0x06: id(); u4(); rootCount++; break;                            // THREAD BLOCK
    case 0x07: id(); rootCount++; break;                                  // MONITOR USED
    case 0x08: id(); u4(); u4(); rootCount++; break;                      // THREAD OBJECT
    // ── CLASS_DUMP ──
    case 0x20: {
      id(); u4(); id(); id(); id(); id(); id(); id(); u4();               // ids + instanceSize
      const cpCount = u2();
      for (let i = 0; i < cpCount; i++) { u2(); readValue(u1()); }
      const staticCount = u2();
      for (let i = 0; i < staticCount; i++) { id(); readValue(u1()); }
      const fieldCount = u2();
      for (let i = 0; i < fieldCount; i++) { id(); u1(); }
      break;
    }
    // ── INSTANCE_DUMP ──
    case 0x21: {
      id(); u4();
      const cls = id();
      const nBytes = u4();
      skip(nBytes);
      instancesByClass.set(cls, (instancesByClass.get(cls) ?? 0) + 1);
      break;
    }
    // ── OBJECT_ARRAY_DUMP ──
    case 0x22: { id(); u4(); const n = u4(); id(); skip(n * idSize); break; }
    // ── PRIMITIVE_ARRAY_DUMP ──
    case 0x23: { id(); u4(); const n = u4(); const t = u1(); skip(n * TYPE_SIZE[t]); break; }
    default:
      throw new Error(`unknown heap sub-record 0x${tag.toString(16)} at ${pos - 1}`);
  }
}

// ── Top-level record walk ─────────────────────────────────────────────────────
while (pos < size) {
  const tag = u1();
  u4();                       // time delta
  const len = u4();
  const end = pos + len;
  tagCount[tag] = (tagCount[tag] ?? 0) + 1;

  switch (tag) {
    case 0x01: {              // STRING_IN_UTF8
      const sid = id();
      strings.set(sid, bytes(len - idSize).toString('utf8'));
      break;
    }
    case 0x02: {              // LOAD_CLASS
      u4();                   // class serial
      const classObjId = id();
      u4();                   // stack trace serial
      const nameId = id();
      classNameByClassId.set(classObjId, nameId);
      break;
    }
    case 0x0C:                // HEAP_DUMP
    case 0x1C:                // HEAP_DUMP_SEGMENT
      while (pos < end) heapSubRecord();
      if (pos !== end) throw new Error(`segment overrun: at ${pos}, expected ${end}`);
      break;
    default:
      skip(len);              // STACK_FRAME / STACK_TRACE / HEAP_DUMP_END / others
  }

  if (pos !== end) {
    if (pos > end) throw new Error(`record 0x${tag.toString(16)} overran by ${pos - end}`);
    pos = end;                // tolerate under-read on records we skip
  }
}
closeSync(fd);

// ── Report ────────────────────────────────────────────────────────────────────
const name = (classObjId) => strings.get(classNameByClassId.get(classObjId)) ?? '<unknown>';
const hex = (o) => Object.entries(o).map(([k, v]) => `0x${(+k).toString(16).padStart(2, '0')}:${v}`).join('  ');

console.log(`\nconsumed ${pos} of ${size} bytes  ${pos === size ? 'EXACT' : 'MISMATCH'}`);
console.log(`top-level tags   ${hex(tagCount)}`);
console.log(`heap sub-records ${hex(subCount)}`);
console.log(`strings=${strings.size}  classes=${classNameByClassId.size}  gcRoots=${rootCount}`);

let totalInstances = 0;
for (const c of instancesByClass.values()) totalInstances += c;
console.log(`instance records ${totalInstances}`);

const want = ['LeakedEntry', 'DupHolder', 'DeepNode'];
console.log('\nfixture classes:');
for (const [cls, count] of instancesByClass) {
  const n = name(cls);
  if (want.some((w) => n.endsWith(w))) console.log(`  ${count.toString().padStart(7)}  ${n}`);
}

console.log('\ntop 8 by instance count:');
[...instancesByClass.entries()]
  .sort((a, b) => b[1] - a[1]).slice(0, 8)
  .forEach(([cls, count]) => console.log(`  ${count.toString().padStart(7)}  ${name(cls)}`));
