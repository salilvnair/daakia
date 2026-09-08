/**
 * Import into this workspace.
 *
 * ── Four sources, all of which work ──
 *
 * A file, a URL, a GitHub file, or a whole Daakia workspace. There is no Git
 * clone tab: cloning needs host-side work this does not have, and a tab that
 * opens and cannot do the thing it names is worse than one that is not there.
 *
 * GitHub is not a separate fetch — a blob URL is a URL, so the host rewrites it
 * to its raw form and it goes down the same path. One place enforces https,
 * refuses redirects off the host you named, and caps the size before parsing.
 *
 * ── Format detection is the host's job ──
 *
 * `import-any.ts` recognises Daakia's own format, Postman, Insomnia, OpenAPI,
 * Swagger, HAR, HTTPie and Thunder Client, and every source funnels through it,
 * so they all read the same set and adding a format is one edit.
 */
import { useState } from 'react';
import { ModalView, ButtonView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import {
  DocumentIcon, LinkIcon, DownloadIcon, LayoutGridIcon, GitHubIcon,
} from '../../icons';
import './workspace.css';

type Source = 'file' | 'url' | 'github' | 'workspace';

const SOURCES: { id: Source; label: string; icon: React.ReactNode }[] = [
  { id: 'file', label: 'File', icon: <DocumentIcon size={12} /> },
  { id: 'url', label: 'URL', icon: <LinkIcon size={12} /> },
  { id: 'github', label: 'GitHub', icon: <GitHubIcon size={12} /> },
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

  const urlTab = (placeholder: string, note: React.ReactNode) => (
    <div className="ws-url">
      <input
        className="ws-url-input"
        value={url}
        autoFocus
        placeholder={placeholder}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && url.trim()) go({ type: 'importCollectionUrl', url: url.trim() });
        }}
      />
      <ButtonView
        size="sm"
        variant="primary"
        disabled={!url.trim() || busy}
        onClick={() => go({ type: 'importCollectionUrl', url: url.trim() })}
      >
        Import
      </ButtonView>
      <p className="ws-drop-note" style={{ width: '100%' }}>{note}</p>
    </div>
  );

  return (
    <ModalView
      open
      onClose={onClose}
      title="Import"
      headerIcon={<DownloadIcon size={15} style={{ color: 'var(--color-info)' }} />}
      headerColor="var(--color-info)"
      size="md"
      elevated
    >
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
            <ButtonView size="sm" variant="primary" disabled={busy}
                        onClick={() => go({ type: 'importCollectionRequest' })}>
              Choose a file
            </ButtonView>
            <p className="ws-drop-note">
              Daakia, Postman, Insomnia, OpenAPI 3.x, Swagger 2.0, HAR, HTTPie and
              Thunder Client. The format is detected from the file, so there is nothing
              to choose.
            </p>
            <p className="ws-drop-note">
              Bruno keeps a collection as a folder of .bru files rather than one document,
              so it has a picker of its own:
              <button type="button" className="ws-linkish"
                      onClick={() => go({ type: 'importBrunoRequest' })}>
                choose a Bruno folder
              </button>
            </p>
          </div>
        )}

        {source === 'url' && urlTab(
          'https://example.com/openapi.json',
          <>
            An OpenAPI, Swagger, Postman or Insomnia document, over https. The request is
            made by the extension host rather than the page, so it is not subject to the
            browser&rsquo;s cross-origin rules.
          </>,
        )}

        {source === 'github' && urlTab(
          'https://github.com/owner/repo/blob/main/openapi.json',
          <>
            Paste the address of the file as GitHub shows it &mdash; the blob URL is rewritten
            to its raw form for you. A repository URL on its own is not enough: a repo can
            hold any number of specs, and guessing which one is how the wrong collection
            gets imported. Private repositories are not supported yet.
          </>,
        )}

        {source === 'workspace' && (
          <div className="ws-drop">
            <LayoutGridIcon size={26} />
            <ButtonView size="sm" variant="primary" disabled={busy}
                        onClick={() => go({ type: 'importWorkspace' })}>
              Choose a workspace file
            </ButtonView>
            <p className="ws-drop-note">
              A whole Daakia workspace &mdash; its collections, its environments and its
              documentation &mdash; imported into a new workspace of its own rather than
              merged into this one.
            </p>
          </div>
        )}
      </div>
    </ModalView>
  );
}
