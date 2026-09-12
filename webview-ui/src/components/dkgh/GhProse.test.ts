/**
 * Somebody else's markdown, where remote images cannot load.
 *
 * The webview's content policy is `img-src ${cspSource} data:`, so a markdown
 * image pointing at GitHub's own asset host is blocked — silently, with a
 * broken-image box where the evidence was. These are the three shapes an
 * issue body actually uses, and none of them may be left in the prose.
 */
import { describe, it, expect } from 'vitest';
import { imagesIn, withoutImages } from './GhProse';

const SHOT = 'https://user-images.githubusercontent.com/1/ab12cd.png';

describe('imagesIn', () => {
  it('finds a markdown image', () => {
    expect(imagesIn(`before\n![shot](${SHOT})\nafter`)).toEqual([SHOT]);
  });

  it('finds an HTML one, which GitHub’s own editor writes for a resized image', () => {
    expect(imagesIn(`<img width="600" src="${SHOT}" alt="x">`)).toEqual([SHOT]);
  });

  it('finds a bare URL on its own line, which GitHub renders as an image', () => {
    expect(imagesIn(`see this\n\n${SHOT}\n`)).toEqual([SHOT]);
  });

  it('does not take a link that merely mentions one', () => {
    expect(imagesIn(`[the shot](${SHOT}) is attached`)).toEqual([]);
  });

  it('says each one once, however many times it appears', () => {
    expect(imagesIn(`![a](${SHOT})\n![b](${SHOT})`)).toEqual([SHOT]);
  });

  it('is empty on prose with no pictures in it', () => {
    expect(imagesIn('The spinner never resolves.')).toEqual([]);
  });
});

describe('withoutImages', () => {
  it('leaves the prose and takes the picture', () => {
    expect(withoutImages(`Steps:\n\n![shot](${SHOT})\n\nActual: it hangs`))
      .toBe('Steps:\n\nActual: it hangs');
  });

  it('leaves a link to one alone — that is text, and it still works', () => {
    const text = `see [the shot](${SHOT})`;
    expect(withoutImages(text)).toBe(text);
  });

  it('is empty when the body was only a screenshot', () => {
    expect(withoutImages(`![shot](${SHOT})`)).toBe('');
  });
});
