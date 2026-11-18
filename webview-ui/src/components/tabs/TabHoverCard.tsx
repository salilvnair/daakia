/**
 * Chrome's hover card, for a request: rest the pointer on a tab and see what
 * it would send and what it last got back, without switching to it.
 *
 * Full URL, the environment it sends with, the last status and time, the
 * collection it came from, and whether it has unsaved changes.
 */
import { createPortal } from 'react-dom';
import type { RequestTab } from '../../store/tabs-store';

export function TabHoverCard({ tab, anchor, envName, collectionName, badge }: {
  tab: RequestTab;
  anchor: DOMRect;
  envName?: string;
  collectionName?: string;
  badge: React.ReactNode;
}) {
  const r = tab.response;
  const ok = r && r.status >= 200 && r.status < 400;
  const width = 300;
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  return createPortal(
    <div className="dk-tabcard" style={{ left, top: anchor.bottom + 6, width }} role="tooltip">
      <div className="dk-tabcard__title">{tab.name || 'Untitled'}</div>
      <div className="dk-tabcard__url">
        <span className="dk-tabcard__badge">{badge}</span>
        <span>{tab.url || 'No URL yet'}</span>
      </div>
      <div className="dk-tabcard__meta">
        {r ? (
          <>
            <span style={{ color: ok ? 'var(--color-success)' : 'var(--color-error)' }}>{r.status} {r.statusText}</span>
            <span>{Math.round(r.time)} ms</span>
          </>
        ) : (
          <span>Not sent since it opened</span>
        )}
        <span>{envName ?? 'No environment'}</span>
      </div>
      {(collectionName || tab.dirty) && (
        <div className="dk-tabcard__meta">
          {collectionName && <span>{collectionName}</span>}
          {tab.dirty && <span style={{ color: 'var(--color-warning)' }}>Unsaved changes</span>}
        </div>
      )}
    </div>,
    document.body,
  );
}
