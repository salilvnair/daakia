/**
 * Saved response examples — what is kept, and how much of it.
 *
 * These ride in the request's `data` blob, which is one column read whole
 * every time the collection tree loads. So the interesting behaviour here is
 * all about size: what gets trimmed, what gets dropped, and what the list
 * does when it is full.
 */
import { describe, it, expect } from 'vitest';
import {
  addExample, defaultName, parseExamples, removeExample, renameExample,
  toExample, toResponseData, MAX_EXAMPLE_BODY, MAX_EXAMPLES_PER_REQUEST,
  type ResponseExample,
} from './examples';
import type { ResponseData } from '../../store/tabs-store';

const response = (over: Partial<ResponseData> = {}): ResponseData => ({
  status: 200, statusText: 'OK',
  headers: { 'content-type': 'application/json', 'set-cookie': 'session=abc', 'x-request-id': 'r1' },
  body: '{"ok":true}', size: 11, time: 42, contentType: 'application/json', cookies: [],
  ...over,
});

const example = (over: Partial<ResponseExample> = {}): ResponseExample => ({
  id: 'e1', name: '200 OK', status: 200, statusText: 'OK', headers: {},
  body: '{}', contentType: 'application/json', savedAt: '2026-09-06T00:00:00.000Z', ...over,
});

describe('turning a response into an example', () => {
  it('keeps what the server said', () => {
    const ex = toExample(response(), 'First');
    expect(ex.name).toBe('First');
    expect(ex.status).toBe(200);
    expect(ex.body).toBe('{"ok":true}');
    expect(ex.savedAt).not.toBe('');
  });

  /* Headers that describe the body or the outcome, and no others — a
     `set-cookie` in a saved example is a session token in a file that gets
     committed. */
  it('keeps describing headers and drops the rest', () => {
    const ex = toExample(response(), 'x');
    expect(ex.headers['content-type']).toBe('application/json');
    expect(ex.headers['x-request-id']).toBe('r1');
    expect('set-cookie' in ex.headers).toBe(false);
  });

  it('trims an oversized body and says that it did', () => {
    const ex = toExample(response({ body: 'x'.repeat(MAX_EXAMPLE_BODY + 500) }), 'big');
    expect(ex.body).toHaveLength(MAX_EXAMPLE_BODY);
    expect(ex.truncated).toBe(true);
  });

  it('does not mark a body that fit', () => {
    expect(toExample(response(), 'small').truncated).toBeUndefined();
  });

  /* Script logs, test results and timing are about the run, not about what
     the server said — and they would triple the size of the blob. */
  it('carries nothing about the run that produced it', () => {
    const ex = toExample(response({ scriptLogs: ['a'], testResults: [{ name: 't', passed: true }] }), 'x');
    expect(Object.keys(ex).sort()).toEqual(
      ['body', 'contentType', 'headers', 'id', 'name', 'savedAt', 'status', 'statusText'],
    );
  });
});

describe('naming', () => {
  it('names an example after its status', () => {
    expect(defaultName({ status: 404, statusText: 'Not Found' }, [])).toBe('404 Not Found');
  });

  /* Two different 200s is the normal case, not a mistake. */
  it('counts up rather than colliding', () => {
    const existing = [example({ name: '200 OK' }), example({ id: 'e2', name: '200 OK (2)' })];
    expect(defaultName({ status: 200, statusText: 'OK' }, existing)).toBe('200 OK (3)');
  });

  it('has a name even for a response with no status text', () => {
    expect(defaultName({ status: 0, statusText: '' }, [])).toBe('0');
  });
});

describe('the list', () => {
  it('puts the newest first', () => {
    const out = addExample([example({ id: 'old' })], example({ id: 'new' }));
    expect(out.map(e => e.id)).toEqual(['new', 'old']);
  });

  /* A click that silently does nothing is worse than a list that forgets its
     least recent entry — and the one just saved is the one wanted. */
  it('drops the oldest at the cap instead of refusing the save', () => {
    const full = Array.from({ length: MAX_EXAMPLES_PER_REQUEST }, (_, i) => example({ id: `e${i}` }));
    const out = addExample(full, example({ id: 'newest' }));
    expect(out).toHaveLength(MAX_EXAMPLES_PER_REQUEST);
    expect(out[0]!.id).toBe('newest');
    expect(out.some(e => e.id === `e${MAX_EXAMPLES_PER_REQUEST - 1}`)).toBe(false);
  });

  it('renames one, and ignores an empty name', () => {
    expect(renameExample([example()], 'e1', ' Login ')[0]!.name).toBe('Login');
    expect(renameExample([example()], 'e1', '   ')[0]!.name).toBe('200 OK');
  });

  it('removes one', () => {
    expect(removeExample([example(), example({ id: 'e2' })], 'e1').map(e => e.id)).toEqual(['e2']);
  });
});

describe('reading back what was stored', () => {
  it('reads a well-formed list', () => {
    expect(parseExamples([example()])).toHaveLength(1);
  });

  /* The blob is written by older versions, hand edits and git merges, so a
     malformed entry is a normal thing to meet — dropping one is better than
     throwing on the whole request. */
  it('drops entries it cannot read, and keeps the rest', () => {
    const out = parseExamples([example(), null, 'nope', { name: 'no id' }, { id: 'x2', name: 'ok' }]);
    expect(out.map(e => e.id)).toEqual(['e1', 'x2']);
  });

  it('is empty for anything that is not a list', () => {
    expect(parseExamples(undefined)).toEqual([]);
    expect(parseExamples({ id: 'e1' })).toEqual([]);
  });

  it('re-applies the caps to whatever was on disk', () => {
    const oversized = parseExamples([{ ...example(), body: 'x'.repeat(MAX_EXAMPLE_BODY * 2) }]);
    expect(oversized[0]!.body).toHaveLength(MAX_EXAMPLE_BODY);
    const many = parseExamples(Array.from({ length: 50 }, (_, i) => example({ id: `e${i}` })));
    expect(many).toHaveLength(MAX_EXAMPLES_PER_REQUEST);
  });

  it('fills in a missing field rather than producing a half-object', () => {
    const [out] = parseExamples([{ id: 'e1', name: 'x' }]);
    expect(out).toMatchObject({ status: 0, statusText: '', body: '', headers: {} });
  });
});

describe('rendering one', () => {
  /* Zero, because nothing was sent — reporting the original request's
     duration would make an example look like a run that happened. */
  it('reports no elapsed time and the body it holds', () => {
    const rd = toResponseData(example({ body: '{"a":1}' }));
    expect(rd.time).toBe(0);
    expect(rd.size).toBe(7);
    expect(rd.cookies).toEqual([]);
  });
});
