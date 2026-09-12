import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JfrChunk } from './jfr-chunk';
import { readEventTypes, readEventRows, displayValue } from './jfr-events';

const load = (f: string) =>
  JfrChunk.parseAll(readFileSync(join(__dirname, '../../../test/fixtures/jfr/', f)));
const chunks = load('under-load.jfr');

describe('readEventTypes', () => {
  const types = readEventTypes(chunks);

  it('finds far more than the built views read', () => {
    /*
      The reason this view exists. The recording holds many more event types
      than dk8s has charts for, and without a browser they are simply
      unreachable — the answer to "does it support event X" was no, whatever
      the JVM had written.
    */
    expect(types.length).toBeGreaterThan(20);
    const names = types.map(t => t.name);
    expect(names).toContain('jdk.ObjectAllocationSample');   // charted
    expect(names).toContain('jdk.BooleanFlag');              // not charted
    expect(names).toContain('jdk.ModuleExport');             // not charted
  });

  it('is ordered by how much of the recording each type is', () => {
    const counts = readEventTypes(chunks).map(t => t.count);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });

  it('never lists a type with no events', () => {
    for (const t of types) expect(t.count, t.name).toBeGreaterThan(0);
  });

  it('carries the field names the recording declares', () => {
    const gc = types.find(t => t.name === 'jdk.GarbageCollection');
    expect(gc).toBeDefined();
    expect(gc!.fields).toContain('cause');
    expect(gc!.fields).toContain('duration');
  });
});

describe('readEventRows', () => {
  it('decodes rows for a type the views never touch', () => {
    const { fields, rows, total } = readEventRows(chunks, 'jdk.BooleanFlag', { limit: 5 });
    expect(total).toBeGreaterThan(5);
    expect(rows).toHaveLength(5);
    expect(fields).toContain('name');
    // Every declared field is present on every row, even when the JVM left it
    // empty — a ragged table is unreadable.
    for (const r of rows) for (const f of fields) expect(r).toHaveProperty(f);
  });

  it('pages rather than decoding everything to show twenty', () => {
    const first = readEventRows(chunks, 'jdk.ObjectAllocationSample', { limit: 3 });
    const second = readEventRows(chunks, 'jdk.ObjectAllocationSample', { limit: 3, offset: 3 });
    expect(first.rows).toHaveLength(3);
    expect(second.rows).toHaveLength(3);
    expect(second.rows[0]).not.toEqual(first.rows[0]);
    // The total is the whole recording, not the page.
    expect(first.total).toBe(second.total);
    expect(first.total).toBeGreaterThan(1000);
  });

  it('resolves a constant-pool reference to something readable', () => {
    // `eventThread` is a struct, not a string. A table that printed
    // "[object Object]" for every thread would be worse than no table.
    const { rows } = readEventRows(chunks, 'jdk.JavaMonitorEnter', { limit: 3 });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.eventThread).not.toMatch(/object Object|\{…\}/);
      expect(r.eventThread.length).toBeGreaterThan(0);
    }
  });

  it('returns nothing for a type the recording does not have', () => {
    const { rows, total } = readEventRows(chunks, 'jdk.NotARealEvent');
    expect(rows).toHaveLength(0);
    expect(total).toBe(0);
  });
});

describe('displayValue', () => {
  it('distinguishes an absent field from an empty one', () => {
    // Different facts: the JVM chose not to fill it in, versus it is blank.
    expect(displayValue(undefined)).toBe('—');
    expect(displayValue('')).toBe('');
  });

  it('renders a bigint as a plain number', () => {
    // `String(1n)` is engine-dependent about the trailing n; ticks and byte
    // counts arrive as bigints and must not read as `123n`.
    expect(displayValue(123n)).toBe('123');
  });

  it('summarises an array instead of expanding it', () => {
    // A stack trace's frames would otherwise turn one row into forty.
    expect(displayValue([1, 2, 3] as never)).toBe('[3]');
  });

  it('opens a nameless struct rather than printing a shrug', () => {
    /*
      `GCHeapSummary.heapSpace` has no name field, so the shared reader returns
      nothing and the cell used to read `{…}` — a value exists, and we decline
      to say what. These records are plain numbers and fit in a cell.
    */
    const v = { start: 1n, committedSize: 4096, reservedSize: 8192 } as never;
    expect(displayValue(v)).toBe('start=1 committedSize=4096 reservedSize=8192');
  });

  it('still shrugs when there is genuinely nothing scalar inside', () => {
    expect(displayValue({ nested: { a: 1 } } as never)).toBe('{…}');
  });

  it('keeps a fractional number readable', () => {
    expect(displayValue(0.123456789)).toBe('0.123');
    expect(displayValue(42)).toBe('42');
  });
});
