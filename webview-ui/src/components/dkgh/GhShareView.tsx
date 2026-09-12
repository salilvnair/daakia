/**
 * Screens 09E and 09F — share a view, and take one.
 *
 * The single most common request a lead gets is "how did you find those?" A
 * view is a string, so the answer is a paste — and the receiving end has to
 * make that paste land somewhere, which is the half people forget to build.
 *
 * **Three links, and the dialog is honest about which one loses something.**
 * A github.com URL is the most useful thing to send, because it needs nothing
 * installed — and it is also the one that silently widens your filter, because
 * Module and Environment are template headings GitHub cannot search on. Saying
 * "this link shows 4, you were looking at 2" is the whole value of the screen;
 * a link that quietly means something else is worse than no link.
 *
 * **The receiving end validates before it applies.** A pasted query is checked
 * against this repository's field map and reports what it understood and how
 * many issues it matches. An unknown term is named and dropped, never guessed
 * at — that is the failure everybody has had with a shared search string, where
 * a term is quietly ignored and you spend ten minutes reading the wrong list.
 */
import { useMemo, useState } from 'react';
import { ModalView } from '@salilvnair/dui';
import { ShareIcon } from '../../icons';
import { Ico, type IcoName } from './GhIcons';
import { CopyWord, Dk, GhNote } from './GhShell';
import { formatQuery, type FilterState, type MatchContext } from './filter-model';
import {
  daakiaLink, importQuery, toGithubQuery, widening, type SavedView,
} from './views-model';
import type { BoardIssue } from './board-types';
import { ACCENT } from './types';

export function GhShareView({
  open, repo, view, state, issues, formFields, ctx, onClose, onApply,
}: {
  open: boolean;
  repo: string;
  /** The view being shared, when it came from the view menu. */
  view?: SavedView;
  /** What is on screen — which is what actually gets shared. */
  state: FilterState;
  issues: BoardIssue[];
  formFields: string[];
  ctx: MatchContext;
  onClose: () => void;
  /** Take a pasted query — 09E's receiving end. */
  onApply: (next: FilterState, andSave: boolean) => void;
}) {
  const [tab, setTab] = useState<'out' | 'in'>('out');
  const [pasted, setPasted] = useState('');

  const link = useMemo(
    () => toGithubQuery(repo, state, formFields),
    [repo, state, formFields],
  );
  const spread = useMemo(
    () => widening(issues, state, link, ctx),
    [issues, state, link, ctx],
  );
  const taken = useMemo(
    () => (pasted.trim() ? importQuery(pasted, issues, formFields, ctx) : undefined),
    [pasted, issues, formFields, ctx],
  );

  const query = formatQuery(state);

  return (
    <ModalView
      open={open}
      onClose={onClose}
      size="lg"
      headerGradient
      headerColor={ACCENT}
      headerIcon={<ShareIcon size={14} />}
      title={view ? `Share “${view.name}”` : 'Share this filter'}
      footerLeft={
        <Dk><span className="sub">
          {spread.here} issue{spread.here === 1 ? '' : 's'} · {state.terms.length} filter
          {state.terms.length === 1 ? '' : 's'}
          {link.dropped.length > 0 && (
            <> · <span style={{ color: 'var(--dk-amber)' }}>
              {link.dropped.length} will not survive the github.com link
            </span></>
          )}
        </span></Dk>
      }
      footerRight={
        <Dk><button type="button" className="btn" onClick={onClose}>Close</button></Dk>
      }
    >
      <Dk>
      <div className="flex flex-col gap-3">
        <div className="flex gap-1 flex-wrap">
          <button type="button" className={`pill${tab === 'out' ? ' on' : ''}`}
                  onClick={() => setTab('out')}>
            Send one
          </button>
          <button type="button" className={`pill${tab === 'in' ? ' on' : ''}`}
                  onClick={() => setTab('in')}>
            Somebody sent you one
          </button>
        </div>

        {tab === 'out' ? (
          <>
            <Row
              title="A github.com link"
              note="Works for anyone with repository access — nothing installed."
              value={link.url}
              icon="gh"
            >
              {link.dropped.length > 0 ? (
                <Warn>
                  <b>What the github.com link cannot carry.</b> This filter uses{' '}
                  {link.dropped.map(t => <code key={t.field}>{t.field}</code>)
                    .reduce<React.ReactNode[]>((acc, el, i) =>
                      i === 0 ? [el] : [...acc, ', ', el], [])}
                  {link.dropped.length === 1 ? ', which is a heading' : ', which are headings'} in
                  your issue template and not something GitHub can search. The link drops
                  {link.dropped.length === 1 ? ' it' : ' them'} and would show{' '}
                  <b>
                    {spread.there} issue{spread.there === 1 ? '' : 's'} instead of {spread.here}
                  </b>{' '}
                  — said here rather than letting somebody act on a wider list than the one you
                  were looking at.
                </Warn>
              ) : link.frozen.length > 0 ? (
                <Warn>
                  <b>A relative date became an absolute one.</b>{' '}
                  {link.frozen.map(t => t.field).join(', ')} is “the last so many days” here and a
                  fixed date on github.com — the link will still mean today&rsquo;s dates next
                  month.
                </Warn>
              ) : (
                <Good>Everything in this filter survives the translation.</Good>
              )}
            </Row>

            <Row
              title="A dkgh link"
              note="Keeps every filter, including the ones from your issue templates."
              value={daakiaLink(repo, state)}
            />

            <Row
              title="A query string"
              note="Paste into chat, or into anyone else’s dkgh."
              value={query}
            />
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <textarea
              autoFocus
              className="inp mono"
              value={pasted}
              onChange={e => setPasted(e.target.value)}
              placeholder="state:open module:checkout priority:urgent"
              rows={2}
              spellCheck={false}
            />

            {taken && (
              <>
                <div className="opt">
                  <span style={{ color: 'var(--dk-text)' }}>
                    Understood{' '}
                    <b>{taken.understood.length} filter
                      {taken.understood.length === 1 ? '' : 's'}</b>. Matches{' '}
                    <b>{taken.matches} issue{taken.matches === 1 ? '' : 's'}</b> on this board.
                  </span>
                  <span className="flex gap-1 flex-wrap">
                    {taken.understood.map(t => (
                      <span key={t.field} className="chip c-gh">
                        {t.field}: {t.values.join(', ')}
                      </span>
                    ))}
                  </span>
                </div>

                {taken.unknown.length > 0 && (
                  <Warn>
                    <b>Dropped, not guessed at.</b>{' '}
                    {taken.unknown.map(t => `${t.field}:${t.values.join(',')}`).join(', ')}{' '}
                    {taken.unknown.length === 1 ? 'names a field' : 'name fields'}{' '}
                    <code>{repo}</code> does not have — probably from a repository whose templates
                    declare {taken.unknown.length === 1 ? 'it' : 'them'}. Applying the rest would
                    show a wider list than the sender saw, so it is named here first.
                  </Warn>
                )}

                <div className="flex items-center gap-2">
                  <span className="sp" style={{ flex: 1 }} />
                  <button type="button" className="btn"
                          onClick={() => { onApply(taken.state, false); onClose(); }}>
                    Just apply it
                  </button>
                  <button type="button" className="btn go"
                          onClick={() => { onApply(taken.state, true); onClose(); }}>
                    Apply and save as a view
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      </Dk>
    </ModalView>
  );
}

/** One link, its caveat, and the copy that is the whole point of the screen. */
function Row({ title, note, value, icon, children }: {
  title: string;
  note: string;
  value: string;
  icon?: IcoName;
  children?: React.ReactNode;
}) {
  return (
    <div className="opt">
      <div className="oh">
        {icon && <Ico name={icon} style={{ color: 'var(--dk-muted)' }} />}
        {title}
        <span className="sub" style={{ fontWeight: 400 }}>— {note}</span>
      </div>
      <div className="cmd">
        <span className="truncate" style={{ flex: 1 }}>{value}</span>
        <CopyWord text={value} />
      </div>
      {children}
    </div>
  );
}

/** A caveat that changes what the reader is about to send. */
function Warn({ children }: { children: React.ReactNode }) {
  return <GhNote tone="warn" style={{ margin: 0 }}>{children}</GhNote>;
}

/** The other answer, and it is worth saying out loud. */
function Good({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 sub">
      <Ico name="check" style={{ color: 'var(--dk-green)', flexShrink: 0 }} />
      {children}
    </span>
  );
}
