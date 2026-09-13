/**
 * The bug this exists for, stated as a test.
 *
 * Node reports a refused connection to `localhost` as an AggregateError whose
 * `message` is `''`, because it tried both ::1 and 127.0.0.1 and neither
 * answered. Every layer above read `err.message`, got nothing, and the screen
 * that asked the question fell back to "The model did not answer" — for a
 * request that was never written to a socket.
 */
import { describe, it, expect } from 'vitest';
import { describeConnectionError, connectionErrorCode } from './net-error';

const URL_ = 'http://localhost:8000/v1/chat/completions';

/** Exactly what Node hands us for a refused dual-stack localhost. */
const aggregate = () => ({
  name: 'AggregateError',
  message: '',
  code: 'ECONNREFUSED',
  errors: [
    { name: 'Error', message: 'connect ECONNREFUSED ::1:8000', code: 'ECONNREFUSED' },
    { name: 'Error', message: 'connect ECONNREFUSED 127.0.0.1:8000', code: 'ECONNREFUSED' },
  ],
});

describe('the empty message', () => {
  it('never passes one on', () => {
    expect(describeConnectionError(aggregate(), URL_).trim()).not.toBe('');
  });

  it('says nothing is listening, and where', () => {
    const msg = describeConnectionError(aggregate(), URL_);
    expect(msg).toContain('http://localhost:8000');
    expect(msg).toMatch(/listening|refused/i);
  });

  it('does not blame the far end for answering badly', () => {
    /* The whole point: a refused socket is not a model that said nothing. */
    expect(describeConnectionError(aggregate(), URL_)).not.toMatch(/model|answer/i);
  });

  it('still says something for an error with no message and no code at all', () => {
    const msg = describeConnectionError({ name: 'Error' }, URL_);
    expect(msg).toContain('http://localhost:8000');
    expect(msg.trim()).not.toBe('');
  });

  it('falls back to an inner message when the parent has none and the code is unknown', () => {
    const msg = describeConnectionError(
      { name: 'AggregateError', message: '', errors: [{ message: 'something specific' }] },
      URL_,
    );
    expect(msg).toContain('something specific');
  });

  it('handles no error object at all', () => {
    expect(describeConnectionError(undefined, URL_)).toContain('http://localhost:8000');
  });
});

describe('finding the code', () => {
  it('reads it off the error', () => {
    expect(connectionErrorCode({ code: 'ENOTFOUND' })).toBe('ENOTFOUND');
  });

  it('reads it off the cause', () => {
    expect(connectionErrorCode({ cause: { code: 'ECONNRESET' } })).toBe('ECONNRESET');
  });

  it('reads it off the first of an AggregateError’s errors', () => {
    expect(connectionErrorCode({ errors: [{}, { code: 'ETIMEDOUT' }] })).toBe('ETIMEDOUT');
  });

  it('is empty rather than undefined when there is none', () => {
    expect(connectionErrorCode({ message: 'plain' })).toBe('');
    expect(connectionErrorCode(undefined)).toBe('');
  });
});

describe('the messages name the place', () => {
  it('reduces a URL to its origin, so the path is not quoted back', () => {
    expect(describeConnectionError({ code: 'ECONNREFUSED' }, URL_))
      .toContain('http://localhost:8000');
    expect(describeConnectionError({ code: 'ECONNREFUSED' }, URL_))
      .not.toContain('/chat/completions');
  });

  it('survives a URL that will not parse', () => {
    expect(describeConnectionError({ code: 'ECONNREFUSED' }, 'not a url')).toContain('not a url');
  });

  it('covers the codes worth telling apart', () => {
    const of = (code: string) => describeConnectionError({ code }, URL_);
    expect(of('ENOTFOUND')).toMatch(/resolve/i);
    expect(of('ETIMEDOUT')).toMatch(/timeout/i);
    expect(of('ECONNRESET')).toMatch(/closed the connection/i);
    expect(of('EHOSTUNREACH')).toMatch(/cannot be reached/i);
    expect(of('SELF_SIGNED_CERT_IN_CHAIN')).toMatch(/certificate/i);
  });

  it('prefers a real message to a generic one', () => {
    expect(describeConnectionError({ message: 'socket hang up' }, URL_)).toBe('socket hang up');
  });
});
