/**
 * Import into this workspace.
 *
 * ── Two sources, both of which work ──
 *
 * A file, or a URL. There is deliberately no Git or GitHub tab yet: a tab that
 * opens and then cannot do the thing it names is worse than one that is not
 * there, and cloning a repository needs host-side work this does not have.
 * When that lands it gets a tab; until then the modal only claims what it does.
 *
 * ── Format detection is the host's job ──
 *
 * The host already auto-detects Postman, OpenAPI/Swagger, HAR, Thunder, HTTPie,
 * Bruno and Daakia's own format when importing a collection. Sending the file
 * there rather than sniffing it here means one detector, and one place to add
 * the next format to.
 */
import { useState } from 'react';
import { postMsg } from '../../vscode';
import {
  CloseIcon, DocumentIcon, LinkIcon, DownloadIcon, SpinnerIcon, LayoutGridIcon,
} from '../../icons';
import './workspace.css';

type Source = 'file' | 'url' | 'workspace';

const SOURCES: { id: Source; label: string; icon: React.ReactNode }[] = [
  { id: 'file', label: 'File', icon: <DocumentIcon size={12} /> },
  { id: 'url', label: 'URL', icon: <LinkIcon size={12} /> },
  { id: 'workspace', label: 'Whole workspace', icon: <LayoutGridIcon size={12} /> },
];

export function ImportModal({ onClose }: { onClose: () => void }) {
  const [source, setSource] = useState<Source>('file');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const go = (msg: Record<string, unknown>) => {
    setBusy(true);
    postMsg(msg);
    /* The host answers with a toast or an error of its own; this only has to
       stop looking busy and get out of the way. */
    window.setTimeout(() => { setBusy(false); onClose(); }, 400);
  };

  return (
    <div className="ws-modal-scrim" onClick={onClose}>
      <div className="ws-modal" onClick={e => e.stopPropagation()}>
        <div className="ws-modal-head">
          <DownloadIcon size={13} />
          Import
          <button type="button" className="ws-modal-x" onClick={onClose} aria-label="Close">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="ws-modal-tabs">
          {SOURCES.map(s => (
            <button
              key={s.id}
              type="button"
              className={`ws-modal-tab${source === s.id ? ' ws-modal-tab--on' : ''}`}
              onClick={() => setSource(s.id)}
            >
              {s.icon}{s.label}
            </button>
          ))}
        </div>

        <div className="ws-modal-body">
          {source === 'file' && (
            <div className="ws-drop">
              <DocumentIcon size={26} />
              <button
                type="button"
                className="ws-modal-primary"
                disabled={busy}
                onClick={() => go({ type: 'importCollectionRequest' })}
              >
                {busy ? <SpinnerIcon size={11} /> : null}
                Choose a file
              </button>
              <p className="ws-drop-note">
                Daakia, Postman, Insomnia, OpenAPI 3.x, Swagger 2.0, HAR, HTTPie and
                Thunder Client. The format is detected from the file, so there is nothing
                to choose.
              </p>
              <p className="ws-drop-note">
                Bruno keeps a collection as a folder of .bru files rather than one document, so it
                has a picker of its own:
                <button type="button" className="ws-linkish"
                        onClick={() => go({ type: 'importBrunoRequest' })}>
                  choose a Bruno folder
                </button>
              </p>
            </div>
          )}

          {source === 'url' && (
            <div className="ws-url">
              <input
                className="ws-url-input"
                value={url}
                autoFocus
                placeholder="https://example.com/openapi.json"
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && url.trim()) go({ type: 'importCollectionUrl', url: url.trim() }); }}
              />
              <button
                type="button"
                className="ws-modal-primary"
                disabled={!url.trim() || busy}
                onClick={() => go({ type: 'importCollectionUrl', url: url.trim() })}
              >
                Import
              </button>
              <p className="ws-drop-note" style={{ width: '100%' }}>
                An OpenAPI, Swagger, Postman or Insomnia document, fetched over HTTPS. The
                request is made by the extension host, not the page, so it is not subject to
                the browser&rsquo;s cross-origin rules.
              </p>
            </div>
          )}

          {source === 'workspace' && (
            <div className="ws-drop">
              <LayoutGridIcon size={26} />
              <button
                type="button"
                className="ws-modal-primary"
                disabled={busy}
                onClick={() => go({ type: 'importWorkspace' })}
              >
                Choose a workspace file
              </button>
              <p className="ws-drop-note">
                A whole Daakia workspace — its collections, its environments and its
                documentation — imported into a new workspace of its own rather than
                merged into this one.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
