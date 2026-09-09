/**
 * Screen 01B — locate gh manually.
 *
 * The machine that reaches the install screen most often is the one with no
 * package manager, and on that machine the binary usually exists — unpacked to
 * a folder nobody put on PATH. So this is not a fallback; for that machine it
 * is the route.
 *
 * The path is verified by RUNNING it, never by trusting the name. A file called
 * `gh.exe` is not evidence of anything; a binary that answers `--version` with
 * a version dkgh understands is. A path that fails is not saved — it is a typo,
 * not a preference.
 */
import { useEffect, useState } from 'react';
import {
  ModalView, ButtonView, TextInputView, CalloutView, SkeletonView,
} from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import {
  CheckIcon, CloseIcon, SearchIcon, FolderOpenIcon, TerminalIcon,
} from '../../icons';
import { ACCENT } from './types';

interface Found { path: string; version?: string }

interface Checked {
  ok: boolean;
  path: string;
  version?: string;
  error?: string;
}

export function GhLocate({ open, envOverride, onClose }: {
  open: boolean;
  /** DAAKIA_GH, which outranks whatever is typed here. */
  envOverride?: string;
  onClose: () => void;
}) {
  const [path, setPath] = useState('');
  const [checked, setChecked] = useState<Checked | null>(null);
  const [checking, setChecking] = useState(false);
  const [found, setFound] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pickerNote, setPickerNote] = useState('');

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'dkgh:findGh:loading') { setSearching(true); return; }
      if (msg.type === 'dkgh:findGh:result') {
        setSearching(false);
        setFound((msg.found as Found[]) ?? []);
        return;
      }
      if (msg.type === 'dkgh:browseGh:result') {
        if (msg.unavailable) { setPickerNote(msg.unavailable as string); return; }
        if (msg.path) { setPath(msg.path as string); setChecked(null); }
        return;
      }
      if (msg.type === 'dkgh:setPath:result') {
        setChecking(false);
        setChecked({
          ok: msg.ok === true,
          path: (msg.path as string) ?? '',
          version: msg.version as string | undefined,
          error: msg.error as string | undefined,
        });
        /* Saved and working — the screen behind this has already re-probed. */
        if (msg.ok === true && msg.path) onClose();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onClose]);

  if (!open) return null;

  const use = () => {
    const p = path.trim();
    if (!p) return;
    setChecking(true);
    setChecked(null);
    /* One message does both: the host verifies before it saves, so there is no
       window in which a broken path is the configured one. */
    postMsg({ type: 'dkgh:setPath', path: p });
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="Where is gh?"
      size="md"
      headerColor={ACCENT}
      footerRight={
        <>
          <ButtonView size="md" accentColor="var(--color-text-muted)" onClick={onClose}>
            Cancel
          </ButtonView>
          <ButtonView size="md" variant="primary" accentColor={ACCENT}
                      disabled={!path.trim() || checking} onClick={use}>
            {checking ? "Checking…" : "Use this gh"}
          </ButtonView>
        </>
      }
    >
      <div className="flex flex-col gap-3" style={{ minWidth: 420 }}>

        {/*
          The override is said first and said plainly. Somebody who launched
          with DAAKIA_GH set and then typed a path here would otherwise watch it
          save successfully and change nothing.
        */}
        {envOverride && (
          <CalloutView variant="warning" title="DAAKIA_GH is set" style={{ margin: 0 }}>
            It outranks this field for the life of this window. Saving here still works —
            it takes effect next time you launch without the variable.
            <span className="font-mono block mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {envOverride}
            </span>
          </CalloutView>
        )}

        <div>
          <label className="text-[11px] font-medium block mb-1.5"
                 style={{ color: 'var(--color-text-secondary)' }}>
            Path to the executable
          </label>
          <div className="flex gap-2">
            <TextInputView
              value={path}
              onChange={e => { setPath(e.target.value); setChecked(null); }}
              placeholder={navigator.platform.startsWith('Win')
                ? 'C:\\tools\\gh_2.63.2\\bin\\gh.exe'
                : '/opt/gh_2.63.2/bin/gh'}
              size="md"
              accentColor={ACCENT}
              style={{ flex: 1, fontFamily: 'monospace' }}
            />
            <ButtonView size="md" accentColor="var(--color-text-muted)"
                        iconLeft={<FolderOpenIcon size={12} />}
                        onClick={() => { setPickerNote(''); postMsg({ type: 'dkgh:browseGh' }); }}>
              Browse
            </ButtonView>
          </div>
          {pickerNote && (
            <div className="text-[10px] mt-1.5" style={{ color: 'var(--color-warning)' }}>
              {pickerNote}
            </div>
          )}
        </div>

        {/* Search common locations */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <ButtonView size="sm" variant="ghost" accentColor={ACCENT}
                        iconLeft={<SearchIcon size={11} />}
                        onClick={() => { setFound(null); postMsg({ type: 'dkgh:findGh' }); }}>
              Search common locations
            </ButtonView>
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              {searching ? 'looking…' : 'C:\\tools, Programs, ~/bin, /opt'}
            </span>
          </div>

          {searching && (
            <div className="flex flex-col gap-1.5 animate-pulse">
              <SkeletonView variant="block" width="70%" height={13} />
              <SkeletonView variant="block" width="52%" height={13} />
            </div>
          )}

          {found !== null && !searching && (
            found.length === 0 ? (
              <div className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                Nothing in the usual places. If you know where it is, type or browse to it —
                a portable archive often unpacks somewhere only you remember.
              </div>
            ) : (
              <div className="flex flex-col rounded-lg border overflow-hidden"
                   style={{ borderColor: 'var(--color-surface-border)' }}>
                {found.map(f => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => { setPath(f.path); setChecked(null); }}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-left cursor-pointer"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      borderTop: '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)',
                    }}
                  >
                    <CheckIcon size={11} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                    <span className="text-[10.5px] font-mono truncate"
                          style={{ color: 'var(--color-text-primary)' }}>
                      {f.path}
                    </span>
                    <span className="flex-1" />
                    {f.version && (
                      <span className="text-[10px] font-mono whitespace-nowrap"
                            style={{ color: 'var(--color-text-muted)' }}>
                        {f.version}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )
          )}
        </div>

        {/* What was actually established about this path */}
        {(checking || checked) && (
          <div className="rounded-lg border p-2.5 flex flex-col gap-1.5"
               style={{ borderColor: 'var(--color-surface-border)', background: 'var(--color-panel)' }}>
            <div className="text-[9.5px] font-bold uppercase tracking-wider"
                 style={{ color: 'var(--color-text-muted)' }}>
              {checking ? 'Checking' : 'Checked'}
            </div>
            {checking ? (
              <div className="flex flex-col gap-1.5 animate-pulse">
                <SkeletonView variant="block" width="64%" height={11} />
                <SkeletonView variant="block" width="48%" height={11} />
              </div>
            ) : checked?.ok ? (
              <>
                <Line ok>The file exists and is executable</Line>
                <Line ok>
                  gh version {checked.version} — ran <code>gh --version</code> and it answered
                </Line>
                <Line ok>Saved, and in force from now on</Line>
                {/* Not a failure of the path, and saying so stops the next question. */}
                <Line neutral>
                  Signed in is the next screen, not a problem with this path
                </Line>
              </>
            ) : (
              <Line bad>{checked?.error ?? 'That path did not run.'}</Line>
            )}
          </div>
        )}

        {/*
          Precedence, stated where somebody is about to depend on it. A named
          path is exclusive — it never falls back to PATH — because a setting
          that looks honoured while a different binary runs is a question nobody
          can answer.
        */}
        <CalloutView variant="info" title="Three sources, first one wins outright"
                     style={{ margin: 0 }}>
          <code>DAAKIA_GH</code> beats this field, which beats <code>PATH</code> and the usual
          install locations. The environment goes first because it is the temporary override.
          A named path never falls back: named and broken is an error worth reporting, not a
          reason to quietly run something else. Stored per machine, never synced.
        </CalloutView>

      </div>
    </ModalView>
  );
}

function Line({ ok, bad, neutral, children }: {
  ok?: boolean; bad?: boolean; neutral?: boolean; children: React.ReactNode;
}) {
  const color = ok ? 'var(--color-success)' : bad ? 'var(--color-error)' : 'var(--color-text-muted)';
  const Icon = ok ? CheckIcon : bad ? CloseIcon : TerminalIcon;
  return (
    <div className="flex items-start gap-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
      <Icon size={11} style={{ color, flexShrink: 0, marginTop: 2 }} />
      <span style={neutral ? { color: 'var(--color-text-muted)' } : undefined}>{children}</span>
    </div>
  );
}
