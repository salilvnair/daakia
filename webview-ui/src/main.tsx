import { createRoot } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import './index.css';
import 'highlight.js/styles/github-dark.css';
import './monaco-setup';

const isDuiShowcase = import.meta.env.DEV && window.location.hash === '#dui';

const Component = isDuiShowcase
  ? lazy(() => import('./pages/dui/DuiShowcase').then(m => ({ default: m.DuiShowcase })))
  : lazy(() => import('./App'));

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={<div style={{ padding: 20, color: 'var(--color-text-muted)', fontSize: 12 }}>Loading…</div>}>
    <Component />
  </Suspense>
);
