import { describe, it, expect } from 'vitest';
import { compileMarks, markOf, countMarks } from './logger-marks';
import { fromLoggerCall } from './logger-pattern';
import { parseCatalogue, patternsFor, markedIn, type CataloguePattern } from '../../store/dk8s-logger-store';

const pattern = (over: Partial<CataloguePattern>): CataloguePattern => ({
  id: 'p1',
  template: 'order {orderId} accepted',
  holes: ['orderId'],
  source: 'paste',
  scope: 'prod/payments/Deployment/orders',
  added: 1,
  ...over,
});

describe('compiling what is marked', () => {
  it('takes only the marked ones', () => {
    const marks = compileMarks([
      pattern({ id: 'a', marked: true, color: 0 }),
      pattern({ id: 'b', template: 'never mind {x}', marked: false }),
    ]);
    expect(marks.map(m => m.id)).toEqual(['a']);
  });

  it('defaults a mark with no colour to the first one', () => {
    expect(compileMarks([pattern({ marked: true })])[0].color).toBe(0);
  });
});

describe('matching a line', () => {
  const marks = compileMarks([
    pattern({ id: 'accept', marked: true, color: 0 }),
    pattern({
      id: 'retry', marked: true, color: 1,
      ...fromLoggerCall('log.info("scheduling retry {} of {} for {}", attempt, max, orderId)')!,
    }),
  ]);

  it('claims the line and names the values in it', () => {
    const hit = markOf('order A-4470 accepted', marks)!;
    expect(hit.id).toBe('accept');
    expect(hit.fields).toEqual({ orderId: 'A-4470' });
  });

  it('picks the mark that actually matches, not the first one', () => {
    const hit = markOf('scheduling retry 1 of 3 for A-4470', marks)!;
    expect(hit.id).toBe('retry');
    expect(hit.fields).toEqual({ attempt: '1', max: '3', orderId: 'A-4470' });
    expect(hit.color).toBe(1);
  });

  it('leaves a line no mark claims alone', () => {
    expect(markOf('heartbeat ok', marks)).toBeUndefined();
  });
});

describe('counting what each mark found', () => {
  /*
    A mark that has never fired is the most useful row in the catalogue: either
    the path it watches was not taken, or the pattern is wrong. Both need the
    count to be zero rather than absent.
  */
  it('reports zero for a mark nothing matched', () => {
    const marks = compileMarks([
      pattern({ id: 'accept', marked: true }),
      pattern({ id: 'gone', template: 'this never happens', holes: [], marked: true }),
    ]);
    const counts = countMarks([
      { text: 'order A-4470 accepted' },
      { text: 'order A-4471 accepted' },
      { text: 'heartbeat ok' },
    ], marks);
    expect(counts).toEqual({ accept: 2, gone: 0 });
  });
});

describe('the catalogue itself', () => {
  it('survives a stored value that is not a catalogue', () => {
    // Half-written, or somebody else's key. Empty beats a crash on load.
    expect(parseCatalogue('not json').patterns).toEqual([]);
    expect(parseCatalogue('{"patterns":"nope"}').patterns).toEqual([]);
    expect(parseCatalogue(undefined).patterns).toEqual([]);
  });

  it('drops an entry that is missing what a pattern needs', () => {
    const raw = JSON.stringify({ patterns: [{ id: 'x' }, pattern({ id: 'ok' })] });
    expect(parseCatalogue(raw).patterns.map(p => p.id)).toEqual(['ok']);
  });

  it('gives a workload its own patterns and the ones that apply everywhere', () => {
    const catalogue = {
      patterns: [
        pattern({ id: 'mine', scope: 'prod/payments/Deployment/orders', added: 1 }),
        pattern({ id: 'everyones', scope: '*', added: 2 }),
        pattern({ id: 'theirs', scope: 'prod/billing/Deployment/invoices', added: 3 }),
      ],
    };
    const mine = patternsFor(catalogue, 'prod/payments/Deployment/orders');
    expect(mine.map(p => p.id)).toEqual(['everyones', 'mine']);
  });

  it('lists the newest first', () => {
    const catalogue = {
      patterns: [
        pattern({ id: 'old', added: 1 }),
        pattern({ id: 'new', added: 9 }),
      ],
    };
    expect(patternsFor(catalogue, pattern({}).scope).map(p => p.id)).toEqual(['new', 'old']);
  });

  it('knows which are marked', () => {
    expect(markedIn([pattern({ id: 'a', marked: true }), pattern({ id: 'b' })]).map(p => p.id))
      .toEqual(['a']);
  });
});
