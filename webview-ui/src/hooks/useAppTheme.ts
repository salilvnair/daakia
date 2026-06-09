/**
 * useAppTheme — returns the current app theme ('dark' | 'light') and re-renders
 * whenever the `data-theme` attribute on <html> changes (e.g. user switches theme,
 * or OS preference changes when 'system' mode is active).
 */
import { useState, useEffect } from 'react';

function resolveTheme(): 'dark' | 'light' {
  return (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') || 'dark';
}

export function useAppTheme(): 'dark' | 'light' {
  const [theme, setTheme] = useState<'dark' | 'light'>(resolveTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(resolveTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}
