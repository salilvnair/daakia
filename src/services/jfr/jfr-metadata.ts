/**
 * The recording's description of itself.
 *
 * A JFR chunk carries the schema for its own events: every type, its fields,
 * each field's type id, and whether the field is an array or a reference into
 * the constant pool. Nothing can be decoded without this — the event stream is
 * a sequence of varints whose meaning is entirely determined by the type table
 * parsed here.
 *
 * That is also what makes one parser worth building. A viewer for CPU samples
 * and a viewer for socket reads are the same code reading two rows of this
 * table, so the twelve views this unlocks are one implementation and twelve
 * queries, not twelve features.
 */
import { JfrReader } from './jfr-reader';

export interface JfrField {
  name: string;
  /** Index into the type table — resolve with `types.get(typeId)`. */
  typeId: number;
  /** A `varint` count precedes the values. */
  array: boolean;
  /** The value is an index into this type's constant pool, not a literal. */
  constantPool: boolean;
}

export interface JfrType {
  id: number;
  name: string;
  fields: JfrField[];
  /**
   * Primitives are read directly rather than field by field.
   *
   * The type table describes them like any other type but with no fields, so
   * without this they would decode as zero-field structs and consume nothing,
   * and every event after the first would be misaligned.
   */
  primitive: boolean;
}

export interface JfrMetadata {
  types: Map<number, JfrType>;
  byName: Map<string, JfrType>;
}

/** The element tree the metadata event carries, before it means anything. */
interface Element {
  name: string;
  attrs: Map<string, string>;
  children: Element[];
}

function readElement(r: JfrReader, strings: (string | null)[]): Element {
  const name = strings[r.varint()] ?? '';
  const attrCount = r.varint();
  const attrs = new Map<string, string>();
  for (let i = 0; i < attrCount; i++) {
    const k = strings[r.varint()] ?? '';
    const v = strings[r.varint()] ?? '';
    attrs.set(k, v);
  }
  const childCount = r.varint();
  const children: Element[] = [];
  for (let i = 0; i < childCount; i++) children.push(readElement(r, strings));
  return { name, attrs, children };
}

/**
 * Java's primitives, which the metadata declares but does not describe.
 *
 * `java.lang.String` is in here because it is read by the string encoding
 * rather than as a struct, which makes it a primitive as far as decoding is
 * concerned even though Java would disagree.
 */
const PRIMITIVES = new Set([
  'boolean', 'byte', 'char', 'short', 'int', 'long', 'float', 'double',
  'java.lang.String',
]);

/**
 * Reads the metadata event at `offset` and returns the type table.
 *
 * The event's own header — size, type id, start time, duration, metadata id —
 * is read here rather than by the caller, because its width is variable and
 * skipping it by a constant is how a parser drifts.
 */
export function readMetadata(buf: Buffer, offset: number): JfrMetadata {
  const r = new JfrReader(buf, offset);
  r.varint();            // event size
  const typeId = r.varint();
  if (typeId !== 0) {
    throw new Error(`Expected the metadata event (type 0) at ${offset}, found type ${typeId}.`);
  }
  r.varlong();           // start ticks
  r.varlong();           // duration
  r.varlong();           // metadata id

  // A string table local to this event; every name below is an index into it.
  const count = r.varint();
  const strings: (string | null)[] = new Array(count);
  for (let i = 0; i < count; i++) strings[i] = r.string();

  const root = readElement(r, strings);
  const types = new Map<number, JfrType>();
  const byName = new Map<string, JfrType>();

  // root › <metadata> › <class>… — the region element beside it holds locale
  // and gmtOffset, which nothing here needs.
  for (const region of root.children) {
    if (region.name !== 'metadata') continue;
    for (const cls of region.children) {
      if (cls.name !== 'class') continue;
      const id = Number(cls.attrs.get('id'));
      const name = cls.attrs.get('name') ?? '';
      const fields: JfrField[] = [];
      for (const f of cls.children) {
        if (f.name !== 'field') continue;
        fields.push({
          name: f.attrs.get('name') ?? '',
          typeId: Number(f.attrs.get('class')),
          // Both are written as "true"/absent rather than as flags.
          array: f.attrs.get('dimension') === '1',
          constantPool: f.attrs.get('constantPool') === 'true',
        });
      }
      const type: JfrType = { id, name, fields, primitive: PRIMITIVES.has(name) };
      types.set(id, type);
      byName.set(name, type);
    }
  }

  if (!types.size) throw new Error('The recording declares no types — its metadata is unreadable.');
  return { types, byName };
}
