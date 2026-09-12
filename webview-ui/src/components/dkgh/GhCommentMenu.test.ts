/**
 * Quote reply, which is the entry worth the most and the easiest to get wrong.
 */
import { describe, it, expect } from 'vitest';
import { quote, reference } from './GhCommentMenu';
import { commentId } from './edit-flow';

describe('quote', () => {
  it('prefixes every line, the way the site does', () => {
    expect(quote('one\ntwo')).toBe('> one\n> two\n\n');
  });

  it('leaves a bare marker on a blank line rather than trailing whitespace', () => {
    expect(quote('one\n\ntwo')).toBe('> one\n>\n> two\n\n');
  });

  it('ends with a blank line, so the caret starts outside the quote', () => {
    expect(quote('hi').endsWith('\n\n')).toBe(true);
  });

  it('does not quote the trailing blank lines a comment came with', () => {
    expect(quote('hi\n\n\n')).toBe('> hi\n\n');
  });

  it('survives CRLF, which is what a Windows paste carries', () => {
    expect(quote('one\r\ntwo')).toBe('> one\n> two\n\n');
  });
});

describe('reference', () => {
  it('says who and where in the first line, then quotes them', () => {
    const out = reference({ author: 'salilvnair', body: 'it broke' }, 'https://x/#c1');
    expect(out.split('\n')[0]).toBe('Referencing @salilvnair in https://x/#c1');
    expect(out).toContain('> it broke');
  });

  it('does not invent an author it was not given', () => {
    expect(reference({ body: 'x' }, 'u')).toContain('Referencing a comment in u');
  });
});

/*
  Edit and Delete are offered on your own comments and nobody else's, and only
  when the permalink carried an id to address. `commentId` lives in `edit-flow`
  and is tested where the menu reads it, because that is the decision.
*/
describe('whose comment it is', () => {
  it('reads the id out of a permalink', () => {
    expect(commentId('https://github.com/o/r/issues/2#issuecomment-3456')).toBe(3456);
  });

  it('has nothing to address when the comment has no permalink', () => {
    expect(commentId(undefined)).toBeUndefined();
  });

  it('has nothing to address on an issue url', () => {
    expect(commentId('https://github.com/o/r/issues/2')).toBeUndefined();
  });
});
