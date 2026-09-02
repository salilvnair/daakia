/**
 * The byte layer of a Flight Recording.
 *
 * JFR is not a format you can read with fixed offsets. Almost every number in
 * it is a variable-length integer, so field N cannot be located without having
 * decoded field N-1, and the type of each field is itself declared inside the
 * file. That is why this is a cursor rather than a set of struct definitions:
 * nothing here knows what it is reading, only how wide it is.
 *
 * Written by hand rather than pulled in, because the parsers that exist are
 * either a JDK dependency we cannot ship into a webview or a Java library. The
 * format is stable and documented; the work is in getting the varints right.
 */

/** JFR's varints are little-endian base-128, up to 9 bytes. */
const CONTINUE = 0x80;
const PAYLOAD = 0x7f;

export class JfrReader {
  constructor(readonly buf: Buffer, public pos = 0) {}

  get remaining(): number { return this.buf.length - this.pos; }

  seek(pos: number): this { this.pos = pos; return this; }

  u1(): number { return this.buf[this.pos++]; }
  u2(): number { const v = this.buf.readUInt16BE(this.pos); this.pos += 2; return v; }
  u4(): number { const v = this.buf.readUInt32BE(this.pos); this.pos += 4; return v; }
  i8(): bigint { const v = this.buf.readBigInt64BE(this.pos); this.pos += 8; return v; }

  /**
   * A variable-length integer, as a `number`.
   *
   * Values beyond 2^53 lose precision here, which is fine for everything this
   * is used for — counts, indices, sizes, field ids — and wrong for timestamps
   * and durations, which are nanosecond ticks and routinely exceed it. Those
   * call `varlong` instead. Keeping both, rather than making everything a
   * BigInt, is the difference between a parser that walks a 200MB recording in
   * a second and one that does not.
   */
  varint(): number {
    let value = 0;
    let shift = 0;
    for (let i = 0; i < 8; i++) {
      const b = this.buf[this.pos++];
      value += (b & PAYLOAD) * 2 ** shift;
      if ((b & CONTINUE) === 0) return value;
      shift += 7;
    }
    // The ninth byte carries all eight bits and always terminates.
    return value + this.buf[this.pos++] * 2 ** 56;
  }

  /** The same encoding, kept exact. For ticks, timestamps and durations. */
  varlong(): bigint {
    let value = 0n;
    let shift = 0n;
    for (let i = 0; i < 8; i++) {
      const b = this.buf[this.pos++];
      value |= BigInt(b & PAYLOAD) << shift;
      if ((b & CONTINUE) === 0) return value;
      shift += 7n;
    }
    return value | (BigInt(this.buf[this.pos++]) << 56n);
  }

  /** Zig-zag: how JFR stores anything that can be negative. */
  svarint(): number {
    const v = this.varint();
    return (v % 2 === 0) ? v / 2 : -(v + 1) / 2;
  }

  /**
   * A string, in one of the six ways JFR writes one.
   *
   * The encoding byte matters more than it looks: `2` means the string is not
   * here at all but in the constant pool, and treating that as text yields a
   * plausible-looking wrong answer rather than an error.
   */
  string(pool?: (index: number) => string | null): string | null {
    const kind = this.u1();
    switch (kind) {
      case 0: return null;          // null
      case 1: return '';            // empty
      case 2: {                     // a reference into the string pool
        const idx = this.varint();
        return pool ? pool(idx) : null;
      }
      case 3: {                     // UTF-8 bytes
        const len = this.varint();
        const s = this.buf.toString('utf8', this.pos, this.pos + len);
        this.pos += len;
        return s;
      }
      case 4: {                     // a char array, one varint per character
        const len = this.varint();
        let s = '';
        for (let i = 0; i < len; i++) s += String.fromCharCode(this.varint());
        return s;
      }
      case 5: {                     // Latin-1
        const len = this.varint();
        const s = this.buf.toString('latin1', this.pos, this.pos + len);
        this.pos += len;
        return s;
      }
      default:
        throw new Error(`Unknown string encoding ${kind} at ${this.pos - 1}`);
    }
  }
}

/** The 68-byte chunk header, which is the one part at fixed offsets. */
export interface ChunkHeader {
  major: number;
  minor: number;
  /** Total bytes of this chunk, including the header. */
  size: number;
  constantPoolOffset: number;
  metadataOffset: number;
  /** Wall-clock nanoseconds at the chunk's start. */
  startNanos: bigint;
  durationNanos: bigint;
  /** The tick reading at the same instant, for converting event ticks. */
  startTicks: bigint;
  ticksPerSecond: bigint;
  features: number;
}

export const CHUNK_HEADER_BYTES = 68;
const MAGIC = 0x464c5200; // "FLR\0"

export function readChunkHeader(buf: Buffer, at = 0): ChunkHeader {
  if (buf.length - at < CHUNK_HEADER_BYTES) {
    throw new Error('Not a Flight Recording: file is shorter than one chunk header.');
  }
  if (buf.readUInt32BE(at) !== MAGIC) {
    throw new Error('Not a Flight Recording: missing FLR magic.');
  }
  const r = new JfrReader(buf, at + 4);
  const major = r.u2();
  const minor = r.u2();
  if (major < 2) {
    // JDK 8's recordings are a different format entirely, not an older dialect
    // of this one. Saying so beats failing later with a varint error.
    throw new Error(`Flight Recording version ${major}.${minor} is not supported — JDK 9 or newer writes version 2.`);
  }
  return {
    major, minor,
    size: Number(r.i8()),
    constantPoolOffset: Number(r.i8()),
    metadataOffset: Number(r.i8()),
    startNanos: r.i8(),
    durationNanos: r.i8(),
    startTicks: r.i8(),
    ticksPerSecond: r.i8(),
    features: r.u4(),
  };
}
