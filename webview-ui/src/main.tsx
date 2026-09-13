import { createRoot } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import { DuiProvider } from '@salilvnair/dui';
import './index.css';
import 'highlight.js/styles/github-dark.css';
import '@salilvnair/dui/style.css';
import '@salilvnair/dui/monaco-setup';

const isDuiShowcase = import.meta.env.DEV && window.location.hash === '#dui';

const Component = isDuiShowcase
  ? lazy(() => import('./pages/dui/DuiShowcase').then(m => ({ default: m.DuiShowcase })))
  : lazy(() => import('./App'));

createRoot(document.getElementById('root')!).render(
  /*
    One chip look for the whole product.

    `BadgeChipView` ships fifty; the mark appears in twenty files, and the
    thing that makes it read as one system is that they all agree. `recessed`
    is a well cut into the surface rather than the raised face it was — five
    raised chips across a status bar look like five buttons, and none of them
    are. Its two colours come from the theme (`--dui-chip-sunken-*` in
    index.css) because a recess in white paper is not a recess in a dark
    panel. A chip that genuinely needs to differ still says `variant` itself.

    `size` is the same 'md' the provider defaults to, so nothing else changes.
  */
  <DuiProvider chipVariant="recessed">
    <Suspense fallback={<div style={{ padding: 20, color: 'var(--color-text-muted)', fontSize: 12 }}>Loading…</div>}>
      <Component />
    </Suspense>
  </DuiProvider>
);
