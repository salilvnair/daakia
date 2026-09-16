/**
 * The ladders every "how many lines" dropdown in dk8s is built from.
 *
 * The failure that matters is not a wrong number — it is a dropdown with
 * nothing in it, or one whose selected value is not among its options. Both
 * render as a control that works and then fetches something else, so every
 * fallback here is tested.
 */
import { describe, it, expect } from 'vitest';
import {
  ladder, ladderText, defaultOf, onLadder, logLineSettings, contextLabel, tailLabel,
  DEFAULT_TAIL_LADDER, DEFAULT_CONTEXT_LADDER, DEFAULT_ARCHIVE_LADDER,
  DEFAULT_TAIL, DEFAULT_CONTEXT, MAX_LINES,
  LOG_TAIL_LADDER_KEY, LOG_TAIL_DEFAULT_KEY,
  LOG_CONTEXT_LADDER_KEY, LOG_CONTEXT_DEFAULT_KEY, LOG_ARCHIVE_LADDER_KEY,
  ALL_LINES, searchDepthLabel, readsEverything,
} from './log-settings';

describe('a stored ladder', () => {
  it('is the built-in one when nothing is stored', () => {
    expect(ladder(undefined, DEFAULT_TAIL_LADDER)).toEqual([...DEFAULT_TAIL_LADDER]);
    expect(ladder('', DEFAULT_TAIL_LADDER)).toEqual([...DEFAULT_TAIL_LADDER]);
  });

  it('is the built-in one when nothing in it is a number', () => {
    /* An empty `<select>` cannot be used at all, which is worse than a ladder
       somebody dislikes. */
    expect(ladder('lots, more', DEFAULT_TAIL_LADDER)).toEqual([...DEFAULT_TAIL_LADDER]);
  });

  it('takes commas or spaces, because people type both', () => {
    expect(ladder('50, 100 250', DEFAULT_TAIL_LADDER)).toEqual([50, 100, 250]);
  });

  it('sorts and de-duplicates, so the list does not jump around', () => {
    expect(ladder('500,100,500,200', DEFAULT_TAIL_LADDER)).toEqual([100, 200, 500]);
  });

  it('drops what cannot be a number of lines', () => {
    expect(ladder('-5, 100, 3.7, 99999999', DEFAULT_TAIL_LADDER)).toEqual([4, 100]);
  });

  it('keeps zero, which is a real answer for context lines', () => {
    expect(ladder('0, 5', DEFAULT_CONTEXT_LADDER)).toEqual([0, 5]);
  });

  it('accepts the cap and refuses what is past it', () => {
    expect(ladder(String(MAX_LINES), DEFAULT_TAIL_LADDER)).toEqual([MAX_LINES]);
    expect(ladder(String(MAX_LINES + 1), DEFAULT_TAIL_LADDER)).toEqual([...DEFAULT_TAIL_LADDER]);
  });

  it('round-trips through the box', () => {
    expect(ladder(ladderText([100, 500]), DEFAULT_TAIL_LADDER)).toEqual([100, 500]);
  });
});

describe('which rung it starts on', () => {
  it('is the stored one when the ladder still has it', () => {
    expect(defaultOf('500', [100, 500, 1000], DEFAULT_TAIL)).toBe(500);
  });

  it('falls back to the built-in default when nothing is stored', () => {
    expect(defaultOf(undefined, [100, 200, 500], DEFAULT_TAIL)).toBe(200);
  });

  it('never picks a rung the ladder does not have', () => {
    /* A default of 200 against a ladder without 200 selects nothing, and the
       control then renders the first option while the state says 200. */
    expect([100, 500, 1000]).toContain(defaultOf('200', [100, 500, 1000], DEFAULT_TAIL));
  });

  it('takes the nearest rung rather than the smallest', () => {
    // Dropping silently to "0 lines" looks like a fetch that came back empty.
    expect(defaultOf(undefined, [0, 1000, 5000], 200)).toBe(0);
    expect(defaultOf(undefined, [150, 900], 200)).toBe(150);
  });

  it('snaps a value stored before the ladder changed', () => {
    expect(onLadder(200, [100, 200, 500], DEFAULT_TAIL)).toBe(200);
    expect(onLadder(333, [100, 200, 500], DEFAULT_TAIL)).toBe(200);
  });
});

describe('everything together', () => {
  it('is the built-in ladders from an empty store', () => {
    expect(logLineSettings({})).toEqual({
      tailLadder: [...DEFAULT_TAIL_LADDER],
      tailDefault: DEFAULT_TAIL,
      contextLadder: [...DEFAULT_CONTEXT_LADDER],
      contextDefault: DEFAULT_CONTEXT,
      archiveLadder: [...DEFAULT_ARCHIVE_LADDER],
    });
  });

  it('reaches past five lines of context out of the box', () => {
    /* ±5 does not answer "what happened around this logger", which is the
       question somebody is asking when they turn context on at all. */
    expect(Math.max(...DEFAULT_CONTEXT_LADDER)).toBeGreaterThanOrEqual(50);
  });

  it('carries what was set', () => {
    expect(logLineSettings({
      [LOG_TAIL_LADDER_KEY]: '50,100',
      [LOG_TAIL_DEFAULT_KEY]: '100',
      [LOG_CONTEXT_LADDER_KEY]: '0,3',
      [LOG_CONTEXT_DEFAULT_KEY]: '3',
      [LOG_ARCHIVE_LADDER_KEY]: '2000',
    })).toEqual({
      tailLadder: [50, 100], tailDefault: 100,
      contextLadder: [0, 3], contextDefault: 3,
      archiveLadder: [2000],
    });
  });

  it('keeps the default on the ladder even when both were set badly', () => {
    const s = logLineSettings({
      [LOG_TAIL_LADDER_KEY]: '50,100',
      [LOG_TAIL_DEFAULT_KEY]: '9000',
    });
    expect(s.tailLadder).toContain(s.tailDefault);
  });
});

describe('the labels', () => {
  it('says what no context means in words', () => {
    expect(contextLabel(0)).toBe('no surrounding lines');
  });

  it('gets the singular right', () => {
    expect(contextLabel(1)).toBe('±1 line around');
    expect(contextLabel(25)).toBe('±25 lines around');
    expect(tailLabel(1)).toBe('1 line');
  });

  it('groups the thousands, because 100000 is unreadable', () => {
    expect(tailLabel(100000)).toBe('100,000 lines');
  });
});

describe('how far back a search reads', () => {
  it('names a bound as a bound', () => {
    expect(searchDepthLabel(5000)).toBe('last 5,000');
    expect(searchDepthLabel(100000)).toBe('last 100,000');
  });

  it('does not pretend everything is a number', () => {
    /* `last -1` and `last 999,999` both read as a limit. It is not one — it
       is kubectl's `--tail=-1`, which is the whole log. */
    expect(searchDepthLabel(ALL_LINES)).toBe('everything the pod holds');
  });

  it('is the flag kubectl already uses, so nothing has to translate it', () => {
    /* `searchArgs` interpolates this straight into `--tail=`. A sentinel that
       needed unwrapping somewhere would be a sentinel somebody forgets to
       unwrap. */
    expect(ALL_LINES).toBe(-1);
  });

  it('knows which depth is going to read the lot', () => {
    expect(readsEverything(ALL_LINES)).toBe(true);
    expect(readsEverything(100000)).toBe(false);
    expect(readsEverything(0)).toBe(false);
  });
});
