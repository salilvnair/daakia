/**
 * Finding the screenshots in an issue body.
 *
 * The body is prose somebody typed, half of it pasted HTML, and the first image
 * in it is what the card shows — so order matters as much as the matching does.
 * A card that shows the console log somebody added underneath instead of the
 * screenshot of the thing going wrong is a card that has wasted its most
 * expensive element.
 */
import { describe, it, expect } from 'vitest';
import { imageUrls } from './evidence';

describe('imageUrls', () => {
  it('finds a markdown image', () => {
    expect(imageUrls('Steps:\n\n![screenshot](https://github.com/user-attachments/assets/abc)'))
      .toEqual(['https://github.com/user-attachments/assets/abc']);
  });

  it('finds a pasted <img> tag', () => {
    expect(imageUrls('<img width="700" src="https://user-images.githubusercontent.com/1/x.png">'))
      .toEqual(['https://user-images.githubusercontent.com/1/x.png']);
  });

  it('finds a bare attachment link, which GitHub renders as an image anyway', () => {
    expect(imageUrls('here it is https://github.com/user-attachments/assets/deadbeef'))
      .toEqual(['https://github.com/user-attachments/assets/deadbeef']);
  });

  it('keeps the order they appear in, because the first one is what a card shows', () => {
    const body = [
      '![the bug](https://github.com/user-attachments/assets/one)',
      'and the console after it:',
      '![log](https://github.com/user-attachments/assets/two)',
    ].join('\n\n');
    expect(imageUrls(body)).toEqual([
      'https://github.com/user-attachments/assets/one',
      'https://github.com/user-attachments/assets/two',
    ]);
  });

  it('lists each URL once even when it is written twice', () => {
    const url = 'https://github.com/user-attachments/assets/same';
    expect(imageUrls(`![a](${url})\n\n![b](${url})`)).toEqual([url]);
  });

  it('trims the punctuation a sentence leaves on the end of a bare link', () => {
    expect(imageUrls('see https://github.com/user-attachments/assets/x.'))
      .toEqual(['https://github.com/user-attachments/assets/x']);
  });

  it('finds nothing in a body with no images', () => {
    expect(imageUrls('### Steps\n\n1. Open the page\n2. Press submit')).toEqual([]);
  });

  it('does not mistake an ordinary link for an image', () => {
    expect(imageUrls('see [the docs](https://example.invalid/docs)')).toEqual([]);
  });
});
