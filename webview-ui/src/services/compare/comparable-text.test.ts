/**
 * When "Compare with clipboard" is offered, and on what.
 *
 * The entry has to appear wherever there is data — a response body, a request
 * body someone typed, a script, a docs draft — and stay out of the way
 * everywhere else. A right-click on a button label offering to diff the word
 * "Send" against the clipboard is the failure mode this guards.
 */
import { describe, it, expect } from 'vitest';
import { pickComparable, candidatesFrom, MIN_COMPARE_CHARS } from './comparable-text';

const long = (s: string) => s.padEnd(MIN_COMPARE_CHARS + 4, '.');

describe('what gets compared', () => {
  it('prefers a selection, because highlighting is an explicit choice', () => {
    expect(pickComparable({
      selection: long('picked this'),
      editorValue: long('the whole document'),
    })).toMatchObject({ text: long('picked this'), label: 'Selection' });
  });

  it('falls back to the editor when nothing is selected', () => {
    expect(pickComparable({ editorValue: '{"a":1,"b":2}' }))
      .toMatchObject({ text: '{"a":1,"b":2}', label: 'Editor' });
  });

  it('reads a field the user typed into', () => {
    expect(pickComparable({ inputValue: long('typed value') }))
      .toMatchObject({ label: 'Field' });
  });

  it('reads an element that opted in, and uses the name it gave', () => {
    expect(pickComparable({ markedText: long('body text'), markedLabel: 'Response body' }))
      .toMatchObject({ label: 'Response body' });
  });

  it('lets an opted-in name override the generic one', () => {
    expect(pickComparable({ editorValue: long('x'), markedLabel: 'Pre-request script' }))
      .toMatchObject({ label: 'Pre-request script' });
  });
});

describe('when it is not offered', () => {
  it('says nothing when there is nothing', () => {
    expect(pickComparable({})).toBeNull();
  });

  /* A button label, a table cell, a tab title. Offering to diff "Send"
     against the clipboard is worse than not offering at all. */
  it('ignores a scrap of text too short to be data', () => {
    expect(pickComparable({ selection: 'Send' })).toBeNull();
    expect(pickComparable({ markedText: '200 OK' })).toBeNull();
  });

  it('ignores whitespace dressed up as content', () => {
    expect(pickComparable({ editorValue: '   \n\n\t  \n   ' })).toBeNull();
  });

  /* A short selection inside a long document still means the document: the
     user asked for a comparison while pointing at data. */
  it('falls through a too-short selection to the document under it', () => {
    expect(pickComparable({ selection: 'id', editorValue: '{"id":1,"name":"x"}' }))
      .toMatchObject({ text: '{"id":1,"name":"x"}', label: 'Editor' });
  });

  it('keeps the original text, not a trimmed copy', () => {
    const value = '\n{\n  "a": 1\n}\n';
    expect(pickComparable({ editorValue: value })!.text).toBe(value);
  });
});

describe('reading the DOM', () => {
  const mount = (html: string) => {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
  };

  it('finds the field under the pointer', () => {
    const host = mount('<textarea>{"hello":"world"}</textarea>');
    const el = host.querySelector('textarea')!;
    expect(candidatesFrom(el).inputValue).toBe('{"hello":"world"}');
    host.remove();
  });

  /* Diffing a password against the clipboard is not a feature anyone asked
     for, and putting one on screen in a diff pane is a way to leak it. */
  it('never reads a password field', () => {
    const host = mount('<input type="password" value="hunter2hunter2" />');
    const el = host.querySelector('input')!;
    expect(candidatesFrom(el).inputValue).toBeUndefined();
    expect(pickComparable(candidatesFrom(el))).toBeNull();
    host.remove();
  });

  it('picks up an element that marked itself comparable, and its label', () => {
    const host = mount('<div data-comparable data-comparable-label="Response body"><span>{"a":1,"b":22}</span></div>');
    const el = host.querySelector('span')!;
    const c = candidatesFrom(el);
    expect(c.markedLabel).toBe('Response body');
    expect(pickComparable(c)).toMatchObject({ label: 'Response body' });
    host.remove();
  });

  it('offers nothing on ordinary chrome', () => {
    const host = mount('<button>Send</button>');
    const el = host.querySelector('button')!;
    expect(pickComparable(candidatesFrom(el))).toBeNull();
    host.remove();
  });
});
