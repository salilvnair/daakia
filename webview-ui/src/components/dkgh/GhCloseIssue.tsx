/**
 * Screen 14E — closing it, and saying why.
 *
 * A closed issue with no reason is a question somebody asks again in three
 * months. GitHub has exactly two close reasons and neither of them says
 * anything; the useful reason is in the comment, which is why this dialog is
 * mostly a comment box.
 *
 * **The quick reasons are read from the repository, not invented here.** They
 * are the labels its own closed issues actually carry, most-used first — so a
 * team that says `duplicate` gets `duplicate`, and a team that has never used
 * the word is not offered it. When no closed issues are loaded there is
 * nothing honest to offer, and the row is absent rather than filled with
 * guesses.
 *
 * **Nothing here writes.** It builds an `EditRequest` and hands it to the same
 * confirm flow every other write on the board goes through — one comment call
 * and one close call, shown before they run.
 */
import { useMemo, useState } from 'react';
import { ModalView } from '@salilvnair/dui';
import { Ico } from './GhIcons';
import { Dk, GhNote } from './GhShell';
import { GhMarkdown } from './GhMarkdown';
import { ACCENT } from './types';
import type { BoardIssue } from './board-types';
import type { EditRequest } from './edit-flow';

/** How many quick reasons are worth offering before it is a list, not a row. */
const MOST = 6;

export function GhCloseIssue({ repo, issue, closed, onCancel, onClose }: {
  repo: string;
  issue: BoardIssue;
  /** The closed issues the board has read, for the reasons below. */
  closed: BoardIssue[];
  onCancel: () => void;
  onClose: (request: EditRequest) => void;
}) {
  const [reason, setReason] = useState<'completed' | 'not planned'>('completed');
  const [comment, setComment] = useState('');
  const [labels, setLabels] = useState<string[]>([]);

  /*
    The words this repository has actually closed things with.

    Counted off its own closed issues rather than taken from a list we wrote:
    "these five are what you use" is a true sentence, and "here are five words
    we like" is not worth a row.
  */
  const used = useMemo(() => {
    const counts = new Map<string, number>();
    for (const one of closed) {
      for (const l of one.labels) counts.set(l.name, (counts.get(l.name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MOST)
      .map(([name, n]) => ({ name, n }));
  }, [closed]);

  const toggle = (name: string) => setLabels(prev => (
    prev.includes(name) ? prev.filter(l => l !== name) : [...prev, name]
  ));

  return (
    <ModalView
      open
      onClose={onCancel}
      size="md"
      headerGradient
      headerColor={ACCENT}
      headerIcon={<Ico name="closed" />}
      title={`Close #${issue.number}`}
      subtitle={issue.title}
      footerLeft={
        <Dk><span className="sub">
          {reason === 'completed' ? 'Marked as done on GitHub' : 'Marked as not planned'}
          {comment.trim() ? ' · one comment, then the close' : ' · no comment'}
        </span></Dk>
      }
      footerRight={
        <Dk>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
            <button
              type="button"
              className="btn ok"
              onClick={() => onClose({
                repo,
                numbers: [issue.number],
                state: 'close',
                closeReason: reason,
                comment: comment.trim() || undefined,
                addLabels: labels.length ? labels : undefined,
              })}
            >
              <Ico name="closed" />
              {comment.trim() ? 'Close with comment' : 'Close'}
            </button>
          </span>
        </Dk>
      }
    >
      <Dk>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div className="fieldrow">
            <span className="fl">Reason — GitHub&rsquo;s own</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['completed', 'not planned'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  className={reason === r ? 'btn go' : 'btn'}
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setReason(r)}
                >
                  {r === 'completed' ? 'Completed' : 'Not planned'}
                </button>
              ))}
            </div>
          </div>

          {used.length > 0 && (
            <div className="fieldrow">
              <span className="fl">And what actually happened</span>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {used.map(l => (
                  <button
                    key={l.name}
                    type="button"
                    className={labels.includes(l.name) ? 'btn go' : 'btn'}
                    style={{ padding: '3px 9px' }}
                    title={`On ${l.n} closed issue${l.n === 1 ? '' : 's'} in this repository`}
                    onClick={() => toggle(l.name)}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
              <div className="sub">
                Adds the label. These are the ones this repository has actually closed things
                with — read from its own closed issues, not invented by us.
              </div>
            </div>
          )}

          <div className="fieldrow">
            <label className="fl" htmlFor="dkgh-close-comment">Comment</label>
            <GhMarkdown
              id="dkgh-close-comment"
              value={comment}
              onChange={setComment}
              autoFocus
              minHeight={84}
              placeholder="What actually happened. Markdown, and #43 links."
            />
          </div>

          <GhNote title="The comment goes first" icon="cmt" style={{ margin: 0 }}>
            GitHub notifies on both, and an explanation that lands after the close reads as an
            afterthought to everybody watching. You will see both calls before either runs.
          </GhNote>
        </div>
      </Dk>
    </ModalView>
  );
}
