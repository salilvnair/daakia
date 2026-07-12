/** Regression — HighlightedInput must HTML-escape user input before injecting the mirror layer. */
import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { HighlightedInput } from '../components/shared/controls/HighlightedInput';

// React 19 act() environment flag
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function render(value: string): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<HighlightedInput value={value} onChange={() => {}} />);
  });
  return host;
}

describe('HighlightedInput mirror escaping', () => {
  it('does not inject HTML elements from typed markup', () => {
    const host = render('https://example.com/<img src=x onerror=alert(1)>');
    expect(host.querySelector('img')).toBeNull();
    const mirror = host.querySelector('.highlighted-input-mirror')!;
    expect(mirror.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('escapes angle brackets and ampersands as text', () => {
    const host = render('a < b & c > d');
    const mirror = host.querySelector('.highlighted-input-mirror')!;
    expect(mirror.textContent).toBe('a < b & c > d');
    expect(mirror.innerHTML).toContain('&lt;');
    expect(mirror.innerHTML).toContain('&amp;');
  });

  it('still highlights {{var}} tokens after escaping', () => {
    const host = render('{{baseUrl}}/users');
    const mirror = host.querySelector('.highlighted-input-mirror')!;
    const pill = mirror.querySelector('.var-highlight');
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toBe('{{baseUrl}}');
  });
});
