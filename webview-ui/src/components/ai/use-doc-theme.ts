/**
 * Daakia's own light/dark choice, as the root element carries it.
 *
 * The chat library keeps a dark/light mode of its own, seeded once when it
 * mounts; left at dark, a light Daakia showed a dark thread with dark text on
 * it. Reading the attribute Daakia sets keeps the two in step.
 */
import { useEffect, useState } from 'react';

function read(): 'light' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function useDocTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return theme;
}
