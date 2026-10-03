import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../store/ui-audit-store', () => ({ logUiEvent: () => {} }));

import { describeRun, readAnswer, lineChange } from './AskPyAi';

describe('what Ask AI is told, and what it makes of the answer', () => {
  it('tells the last run as how it ended and the end of its output', () => {
    expect(describeRun(undefined)).toBe('not run yet');
    const run = {
      status: 'failed', code: 1, durationMs: 194, problems: [],
      chunks: [{ stream: 'meta', text: '$ python3 x.py\n' }, { stream: 'stderr', text: 'AttributeError: nope\n' }],
    } as never;
    expect(describeRun(run)).toBe('exit 1 after 194ms\nAttributeError: nope');
  });

  it('reads a JSON answer, fenced or not, and falls back to plain text', () => {
    expect(readAnswer('{"answer":"Fixed it.","code":"print(1)"}')).toEqual({ answer: 'Fixed it.', code: 'print(1)' });
    expect(readAnswer('```json\n{"answer":"ok","code":""}\n```')).toEqual({ answer: 'ok', code: '' });
    expect(readAnswer('Just prose.')).toEqual({ answer: 'Just prose.', code: '' });
  });

  it('counts a proposed change by line', () => {
    expect(lineChange('a\nb\nc', 'a\nB\nc\nd')).toEqual({ added: 2, removed: 1 });
  });
});

describe('an answer cut off by its length', () => {
  it('still reads as the answer and as much of the script as came, marked cut', () => {
    const cut = String.raw`{"answer": "Wrote a connectivity test.", "code": "import socket\nprint(\"hi\")\nscheme = (parts.scheme or "`;
    expect(readAnswer(cut)).toEqual({ answer: 'Wrote a connectivity test.', code: 'import socket\nprint("hi")\nscheme = (parts.scheme or ', cut: true });
  });

  it('a cut before the script began is the answer alone', () => {
    expect(readAnswer('{"answer": "Partly writ')).toEqual({ answer: 'Partly writ', code: '', cut: true });
  });
});
