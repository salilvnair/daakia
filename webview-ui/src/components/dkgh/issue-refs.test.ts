/**
 * `#113` becomes a link, and nothing else does.
 *
 * GitHub linkifies these on its own site, so a body written there — "duplicate
 * of #113" — arrives as plain text and reads as a dead end: the reader has the
 * number and no way to use it without leaving for a browser.
 *
 * The risk is entirely in the false positives. A colour in a CSS block, a
 * comment in a shell snippet and a URL fragment all look like `#113`, and
 * turning any of them into a link corrupts the thing it is inside.
 */
import { describe, it, expect } from 'vitest';
import { linkIssueRefs } from './GhProse';

const REPO = 'acme/app';
const link = (n: number, slug = REPO) => `https://github.com/${slug}/issues/${n}`;

describe('what becomes a link', () => {
  it('a bare reference, against the repository being read', () => {
    expect(linkIssueRefs('duplicate of #113', REPO))
      .toBe(`duplicate of [#113](${link(113)})`);
  });

  it('a cross-repository reference, which carries its own slug', () => {
    expect(linkIssueRefs('see other/repo#42', REPO))
      .toBe(`see [other/repo#42](${link(42, 'other/repo')})`);
  });

  it('a full GitHub URL, shortened to the number when it is this repository', () => {
    expect(linkIssueRefs(`fixed by ${link(7)}`, REPO))
      .toBe(`fixed by [#7](${link(7)})`);
  });

  it('a full URL for another repository keeps the slug, so it is not misread', () => {
    expect(linkIssueRefs(`see ${link(7, 'other/repo')}`, REPO))
      .toContain('[other/repo#7]');
  });

  it('at the very start of the body, where there is no character before it', () => {
    expect(linkIssueRefs('#5 is the cause', REPO)).toBe(`[#5](${link(5)}) is the cause`);
  });

  it('after a bracket or punctuation, not only after a space', () => {
    expect(linkIssueRefs('(#5)', REPO)).toBe(`([#5](${link(5)}))`);
    expect(linkIssueRefs('caused by: #5', REPO)).toContain('[#5]');
  });
});

describe('what must be left alone', () => {
  it('a colour inside a fenced block', () => {
    const md = 'css:\n```css\n.a { color: #113; }\n```\n';
    expect(linkIssueRefs(md, REPO)).toBe(md);
  });

  it('a comment inside an inline code span', () => {
    expect(linkIssueRefs('run `kill -9 #113` now', REPO)).toBe('run `kill -9 #113` now');
  });

  it('the text of a link that already exists', () => {
    /* Rewriting inside this produces a link nested in a link, which renders as
       neither. */
    const md = `already [#113](${link(113)}) here`;
    expect(linkIssueRefs(md, REPO)).toBe(md);
  });

  it('an HTML attribute', () => {
    const md = '<a href="/x#113">x</a>';
    expect(linkIssueRefs(md, REPO)).toBe(md);
  });

  it('a fragment glued to a word, which is not a reference', () => {
    expect(linkIssueRefs('v2.4#113 and sha#113', REPO)).toBe('v2.4#113 and sha#113');
  });

  it('a hex colour written inline as prose', () => {
    /* Six hex digits are not an issue number — the pattern requires digits
       only, so #113 matches and #1133aa does not. */
    expect(linkIssueRefs('the brand is #1133aa', REPO)).toBe('the brand is #1133aa');
  });

  it('anything at all when there is no repository to point at', () => {
    /* A link that goes nowhere is worse than plain text. */
    expect(linkIssueRefs('duplicate of #113')).toBe('duplicate of #113');
  });
});

describe('a body with several', () => {
  it('links every one, and leaves the code between them', () => {
    const out = linkIssueRefs('dupe of #1, see #2\n```\n#3\n```\nand #4', REPO);
    expect(out).toContain(`[#1](${link(1)})`);
    expect(out).toContain(`[#2](${link(2)})`);
    expect(out).toContain('\n#3\n');
    expect(out).toContain(`[#4](${link(4)})`);
  });
});
