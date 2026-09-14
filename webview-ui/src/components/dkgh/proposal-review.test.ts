/**
 * The review claims, for each field, whose value it is. Those claims are the
 * reason to trust the screen, so they are the thing worth pinning down.
 */
import { describe, it, expect } from 'vitest';
import {
  reviewRows, untaken, takeAll, filledCount, missingRequired, titleState,
} from './proposal-review';
import type { FormField } from './board-types';

const field = (label: string, extra: Partial<FormField> = {}): FormField => ({
  type: 'textarea', label, options: [], required: false, ...extra,
});

const FIELDS: FormField[] = [
  field('Steps to reproduce'),
  field('Module', { type: 'dropdown', options: ['checkout', 'search'], required: true }),
  field('Evidence'),
  field('Severity', { type: 'dropdown', options: ['low', 'high'] }),
];

const PROPOSAL = {
  answers: { 'Steps to reproduce': 'Click Pay, wait.', Module: 'checkout' },
  unanswered: [{ label: 'Severity', why: 'the description does not say' }],
};

describe('reviewRows', () => {
  it('gives every declared field a row, in the template’s order', () => {
    const rows = reviewRows(FIELDS, PROPOSAL, {});
    expect(rows.map(r => r.label)).toEqual(
      ['Steps to reproduce', 'Module', 'Evidence', 'Severity'],
    );
  });

  it('leaves the template’s own prose out of it', () => {
    // A `markdown` block is the form telling the reporter what to write. It has
    // no answer, so a row for it is a row that can never be filled in.
    const rows = reviewRows([field('Please read', { type: 'markdown' }), ...FIELDS], PROPOSAL, {});
    expect(rows.find(r => r.label === 'Please read')).toBeUndefined();
    expect(rows).toHaveLength(4);
  });

  it('calls a proposal nobody has acted on “offered”', () => {
    const rows = reviewRows(FIELDS, PROPOSAL, {});
    expect(rows.find(r => r.label === 'Module')!.state).toBe('offered');
  });

  it('calls a proposal taken verbatim “taken”', () => {
    const rows = reviewRows(FIELDS, PROPOSAL, { Module: 'checkout' });
    expect(rows.find(r => r.label === 'Module')!.state).toBe('taken');
  });

  it('calls a proposal the reader changed “edited”, and keeps the original', () => {
    const rows = reviewRows(FIELDS, PROPOSAL, { Module: 'search' });
    const row = rows.find(r => r.label === 'Module')!;
    expect(row.state).toBe('edited');
    // The original has to survive, or "put it back" is a button with nothing
    // behind it.
    expect(row.proposed).toBe('checkout');
    expect(row.value).toBe('search');
  });

  it('does not credit the model with a value it never proposed', () => {
    const rows = reviewRows(FIELDS, PROPOSAL, { Evidence: 'a screenshot' });
    expect(rows.find(r => r.label === 'Evidence')!.state).toBe('yours');
  });

  it('keeps a field the model refused on the list, with its reason', () => {
    const rows = reviewRows(FIELDS, PROPOSAL, {});
    const row = rows.find(r => r.label === 'Severity')!;
    expect(row.state).toBe('open');
    expect(row.why).toBe('the description does not say');
    // …and the template's own options come with it, so the row can offer them.
    expect(row.options).toEqual(['low', 'high']);
  });

  it('is blank when the model said nothing about a field at all', () => {
    const rows = reviewRows(FIELDS, PROPOSAL, {});
    expect(rows.find(r => r.label === 'Evidence')!.state).toBe('blank');
  });

  it('treats whitespace as nothing, on both sides', () => {
    const rows = reviewRows(FIELDS, { answers: { Module: '  checkout  ' } }, { Module: 'checkout' });
    expect(rows.find(r => r.label === 'Module')!.state).toBe('taken');
    const blank = reviewRows(FIELDS, { answers: { Evidence: '   ' } }, {});
    expect(blank.find(r => r.label === 'Evidence')!.state).toBe('blank');
  });

  it('hands the value back exactly as it is held, spaces and all', () => {
    /*
      The row binds an editor to `value`. This came back trimmed once, and the
      symptom was that the space bar did nothing: type "one two", the draft
      holds "one ", the row hands back "one", and React puts that back into the
      box before the "t" arrives. Every space in the review was being eaten.
    */
    const rows = reviewRows(FIELDS, PROPOSAL, { Evidence: 'one ' });
    expect(rows.find(r => r.label === 'Evidence')!.value).toBe('one ');

    // …while a value that is only whitespace still counts as nothing written.
    const blank = reviewRows(FIELDS, PROPOSAL, { Evidence: '   ' });
    const row = blank.find(r => r.label === 'Evidence')!;
    expect(row.state).toBe('blank');
    expect(filledCount(blank).filled).toBe(0);
    expect(missingRequired(reviewRows(FIELDS, PROPOSAL, { Module: '  ' }))
      .map(r => r.label)).toEqual(['Module']);
  });

  it('survives having no proposal at all', () => {
    const rows = reviewRows(FIELDS, null, { Module: 'search' });
    expect(rows.map(r => r.state)).toEqual(['blank', 'yours', 'blank', 'blank']);
  });
});

describe('take all', () => {
  it('takes every proposal that is still going spare', () => {
    const rows = reviewRows(FIELDS, PROPOSAL, {});
    expect(untaken(rows).map(r => r.label)).toEqual(['Steps to reproduce', 'Module']);
    expect(takeAll(rows, {})).toEqual({
      'Steps to reproduce': 'Click Pay, wait.',
      Module: 'checkout',
    });
  });

  it('does not overwrite what the reader wrote', () => {
    // The one thing a button called "take all" must never do.
    const mine = { Module: 'search', Evidence: 'a screenshot' };
    const rows = reviewRows(FIELDS, PROPOSAL, mine);
    expect(takeAll(rows, mine)).toEqual({
      Module: 'search',
      Evidence: 'a screenshot',
      'Steps to reproduce': 'Click Pay, wait.',
    });
  });

  it('has nothing left to do once everything is taken', () => {
    const all = takeAll(reviewRows(FIELDS, PROPOSAL, {}), {});
    expect(untaken(reviewRows(FIELDS, PROPOSAL, all))).toHaveLength(0);
  });
});

describe('counts', () => {
  it('counts what would actually be written', () => {
    expect(filledCount(reviewRows(FIELDS, PROPOSAL, {}))).toEqual({ filled: 0, total: 4 });
    expect(filledCount(reviewRows(FIELDS, PROPOSAL, { Module: 'checkout' })))
      .toEqual({ filled: 1, total: 4 });
  });

  it('names the required fields that are still empty', () => {
    expect(missingRequired(reviewRows(FIELDS, PROPOSAL, {})).map(r => r.label))
      .toEqual(['Module']);
    expect(missingRequired(reviewRows(FIELDS, PROPOSAL, { Module: 'checkout' })))
      .toHaveLength(0);
  });
});

describe('the title', () => {
  it('is offered when there is nothing to lose', () => {
    expect(titleState('Checkout hangs', '')).toBe('offered');
  });

  it('is yours when the model had nothing to say', () => {
    expect(titleState(undefined, 'Checkout hangs')).toBe('yours');
    expect(titleState('', 'Checkout hangs')).toBe('yours');
  });

  it('says so when the two disagree, rather than picking one', () => {
    expect(titleState('Checkout hangs after Pay', 'Checkout hangs')).toBe('differs');
  });

  it('is taken when they are the same', () => {
    expect(titleState('Checkout hangs', '  Checkout hangs  ')).toBe('taken');
  });

  it('is nothing when there is nothing', () => {
    expect(titleState(undefined, '')).toBe('none');
  });
});
