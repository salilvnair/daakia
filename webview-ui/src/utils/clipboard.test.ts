/**
 * The AI tab's code card said "Copied!" with an empty clipboard: the button
 * awaited nothing, and `navigator.clipboard.writeText` had rejected with
 * "Document is not focused" — the usual answer inside a VS Code webview when the
 * click arrives before the webview owns focus.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyText } from './clipboard';

const original = navigator.clipboard;

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

beforeEach(() => {
  // jsdom has no execCommand at all.
  (document as unknown as { execCommand: unknown }).execCommand = vi.fn(() => true);
});

afterEach(() => {
  setClipboard(original);
  vi.restoreAllMocks();
});

describe('copyText', () => {
  it('uses the async clipboard when it works', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    expect(await copyText('const a = 1;')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('const a = 1;');
    expect(document.execCommand).not.toHaveBeenCalled();
  });

  it('falls back when the document is not focused', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Document is not focused'));
    setClipboard({ writeText });

    expect(await copyText('{"a":1}')).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('falls back when there is no clipboard API at all', async () => {
    setClipboard(undefined);

    expect(await copyText('plain text')).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('leaves no textarea behind', async () => {
    setClipboard(undefined);
    await copyText('plain text');

    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('reports failure instead of claiming success', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('no')) });
    (document as unknown as { execCommand: unknown }).execCommand = vi.fn(() => false);

    expect(await copyText('nope')).toBe(false);
  });
});
