/**
 * Screen 19D — taking a label set from somewhere else.
 *
 * A new repository starts with GitHub's nine defaults, none of which a testing
 * team uses. The set they want already exists on the repository next door.
 *
 * Staged, not pushed: the additions land in the same amber not-pushed state as
 * a hand edit, so an import and a manual change go through one review and one
 * push — and an import can be reconsidered before it reaches the repository.
 */
import { useEffect, useState } from 'react';
import { ModalView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { Ico } from './GhIcons';
import { Dk, GhNote } from './GhShell';
import { ACCENT } from './types';
import { diff, preview, stage, summary, type Label, type Side } from './label-import';

/** A label chip in its own colour, the way the Labels tab draws one. */
function Chip({ label }: { label: Label }) {
  const hex = `#${label.color.replace(/^#/, '')}`;
  return (
    <span className="chip" style={{ color: hex, borderColor: hex }}>{label.name}</span>
  );
}

export function GhImportLabels({ repo, mine, known, onCancel, onStage }: {
  repo: string;
  /** This repository's labels, as read. */
  mine: Label[];
  /** Repositories dkgh already knows, to offer as a source. */
  known: string[];
  onCancel: () => void;
  onStage: (edits: Record<string, {
    was?: string; name: string; color: string; description?: string; readAs?: Label;
  }>) => void;
}) {
  const [from, setFrom] = useState(known[0] ?? '');
  const [typed, setTyped] = useState('');
  const [theirs, setTheirs] = useState<Label[] | undefined>();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState('');
  /** Which side of each clash wins. Yours, unless somebody says otherwise. */
  const [sides, setSides] = useState<Record<string, Side>>({});

  const source = (typed.trim() || from).trim();

  useEffect(() => {
    if (!source.includes('/')) return;
    setLoading(true);
    setTheirs(undefined);
    setFailed('');
    const onMsg = (e: MessageEvent) => {
      const msg = e.data as Record<string, unknown>;
      if (msg?.type !== 'dkgh:labelsFrom:result' || msg.repo !== source) return;
      setLoading(false);
      if (msg.error) { setFailed(String(msg.error)); return; }
      setTheirs((msg.labels as Label[]) ?? []);
    };
    window.addEventListener('message', onMsg);
    postMsg({ type: 'dkgh:labelsFrom', repo: source });
    return () => window.removeEventListener('message', onMsg);
  }, [source]);

  const d = theirs ? diff(theirs, mine) : undefined;
  const { shown, more } = preview(d?.additions ?? []);

  return (
    <ModalView
      open
      onClose={onCancel}
      size="md"
      headerGradient
      headerColor={ACCENT}
      headerIcon={<Ico name="copy" />}
      title={source ? `Import labels from ${source}` : 'Import labels'}
      subtitle={repo}
      footerLeft={
        <Dk><span className="sub">{d ? summary(d, sides) : 'nothing read yet'}</span></Dk>
      }
      footerRight={
        <Dk>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
            <button
              type="button"
              className="btn go"
              disabled={!d || (d.additions.length === 0
                && !d.clashes.some(c => sides[c.name] === 'theirs'))}
              onClick={() => d && onStage(stage(d, sides))}
            >
              Stage {d?.additions.length ?? 0} addition
              {(d?.additions.length ?? 0) === 1 ? '' : 's'}
            </button>
          </span>
        </Dk>
      }
    >
      <Dk>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13.2 }}>
          <div className="fieldrow">
            <span className="fl">From</span>
            {known.length > 0 && (
              <select className="inp" value={from}
                      onChange={e => { setTyped(''); setFrom(e.target.value); }}>
                {known.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
            <input
              className="inp"
              style={{ fontFamily: 'var(--mono)', fontSize: 12.6 }}
              value={typed}
              placeholder="owner/name"
              onChange={e => setTyped(e.target.value)}
              aria-label="Another repository"
            />
          </div>

          {loading && <div className="sub">Reading {source}&hellip;</div>}
          {failed && <div style={{ fontSize: 12.6, color: 'var(--dk-red)' }}>{failed}</div>}

          {d && (
            <div className="fieldrow">
              <span className="fl">
                {d.there} label{d.there === 1 ? '' : 's'} there, {d.here} here
              </span>
              <div style={{ border: '1px solid var(--dk-border)', borderRadius: 9.6,
                            background: 'var(--dk-panel)', padding: '9.6px 12px',
                            display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="why-row pass">
                  <span className="mark">+</span>
                  <div>
                    <b>{d.additions.length} new</b>
                    {shown.length > 0 && <> &mdash; </>}
                    <span className="chips" style={{ display: 'inline-flex' }}>
                      {shown.map(l => <Chip key={l.name} label={l} />)}
                    </span>
                    {more > 0 && <> and {more} more</>}
                  </div>
                </div>
                <div className="why-row" style={{ color: 'var(--dk-muted)' }}>
                  <span className="mark">=</span>
                  <div>
                    <b>{d.identical.length} identical</b> &mdash; same name, same colour;
                    skipped
                  </div>
                </div>
                {d.clashes.length > 0 && (
                  <div className="why-row fail">
                    <span className="mark">~</span>
                    <div>
                      <b>{d.clashes.length} clash{d.clashes.length === 1 ? '' : 'es'}</b>
                      &mdash; same name, different colour
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {d && d.clashes.length > 0 && (
            <div className="fieldrow">
              <span className="fl">
                {d.clashes.length === 1 ? 'The clash' : `The ${d.clashes.length} clashes`}
              </span>
              <div style={{ border: '1px solid var(--dk-border)', borderRadius: 9.6,
                            overflow: 'hidden' }}>
                {d.clashes.map(c => {
                  const side = sides[c.name] ?? 'mine';
                  return (
                    <div className="vrow" key={c.name}>
                      <Chip label={c.mine} />
                      <span style={{ fontSize: 11.4, color: 'var(--dk-faint)' }}>
                        here #{c.mine.color.replace(/^#/, '')}
                      </span>
                      <span className="sp" />
                      <Chip label={c.theirs} />
                      <span style={{ fontSize: 11.4, color: 'var(--dk-faint)' }}>
                        there #{c.theirs.color.replace(/^#/, '')}
                      </span>
                      <button
                        type="button"
                        className={`btn${side === 'theirs' ? ' go' : ''}`}
                        style={{ padding: '2.4px 9.6px' }}
                        onClick={() => setSides(prev => ({
                          ...prev, [c.name]: side === 'mine' ? 'theirs' : 'mine',
                        }))}
                      >
                        {side === 'mine' ? 'Keep mine' : 'Take theirs'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <GhNote icon="check" style={{ margin: 0, maxWidth: 'none' }}>
            <b>Only additions and colour changes. Nothing here is deleted.</b> An import that
            made this repository match the other one exactly would strip labels somebody is
            using, and &ldquo;sync&rdquo; is not what anybody means when they ask for this.
          </GhNote>

          <GhNote icon="warn" style={{ margin: 0, maxWidth: 'none' }}>
            Descriptions come across too. A label with no description is a label people guess
            at.
          </GhNote>
        </div>
      </Dk>
    </ModalView>
  );
}
