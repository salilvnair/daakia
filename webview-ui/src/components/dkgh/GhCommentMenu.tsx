/**
 * The `…` on a comment, as github.com has it.
 *
 * ── What is here, and what is not ──
 *
 * Copy link, Copy Markdown, Quote reply, Reference in a new issue, Edit and
 * Delete. Pin and Hide are not here.
 *
 * Edit and Delete are offered **only on comments you wrote** — `viewerDidAuthor`
 * off the same payload the board already reads. A repository admin can delete
 * anybody's comment on github.com; dkgh does not offer to, because a menu that
 * lets you delete someone else's writing in two clicks from a board view is a
 * menu that will eventually be clicked by accident.
 *
 * Both go through the board's own confirm flow, like every other write here:
 * the exact `gh api --method PATCH` or `DELETE` is on screen before it runs.
 * That is the whole guard on Delete, and it is the same guard closing an issue
 * gets, because there is no undo on either.
 *
 * Pin and Hide stay on github.com. Hiding a comment as "Spam" or "Abuse" is a
 * judgement about somebody else's writing with a moderation queue behind it,
 * and the last row of this menu says where it lives rather than pretending to
 * a moderation UI that has not been built.
 *
 * ── Quote reply ──
 *
 * The one entry worth the most and the one everybody forgets exists. It puts
 * the comment into the composer with every line prefixed `> `, a blank line
 * after it, and the caret below — which is exactly what the site does, and
 * what people otherwise do by hand and get wrong.
 */
import { useCallback, useRef, useState } from 'react';
import { Ico, type IcoName } from './GhIcons';
import { commentId } from './edit-flow';
import { dropPortal, dropStyle, useDropPanel } from './drop-panel';

export interface CommentRef {
  author?: string;
  body: string;
  createdAt?: string;
  url?: string;
  mine?: boolean;
}

export function GhCommentMenu({
  comment, issueUrl, onQuote, onReference, onEdit, onDelete, editing, body,
}: {
  comment: CommentRef;
  /** Where the issue lives, for the entries that need a page rather than a row. */
  issueUrl: string;
  /** Drops the comment into the composer, quoted. */
  onQuote: (quoted: string) => void;
  /** Opens the composer on a new issue that points back at this one. */
  onReference: (seed: string) => void;
  /** Turns this comment into an editor in place. */
  onEdit?: (id: number) => void;
  /** Proposes the delete — the confirm bar is what actually runs it. */
  onDelete?: (id: number) => void;
  /**
   * This comment is currently the editor.
   *
   * The whole `…` goes away, the way it does on the site. Quote reply and
   * Copy Markdown on a comment you are half-way through rewriting would each
   * be reading a body that no longer exists, and Delete beside your own
   * unsaved edit is a trap.
   */
  editing?: boolean;
  /**
   * This is the issue's own description, not a comment.
   *
   * github.com draws a shorter menu there — Copy link, Copy Markdown, Quote
   * reply, Edit — and it is shorter for reasons rather than by omission.
   * "Reference in a new issue" on the opening post would mean referencing the
   * issue you are already reading, and the description cannot be deleted
   * without deleting the issue, which is not a thing this menu should offer.
   *
   * `onEdit` is called with `0`: there is no comment id, because the
   * description is a field on the issue and is written with
   * `gh issue edit --body-file -`. The caller knows which it asked for.
   */
  body?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | undefined>();
  const box = useRef<HTMLDivElement>(null);
  /*
    Portalled and fixed — see `useDropPanel`.

    A comment card is `overflow: hidden` (it has to be, or the header strip's
    square corners would poke out of its rounded ones) and the pane it sits in
    scrolls. A panel drawn inside the card was cut off at its bottom edge with
    Delete half-drawn.
  */
  const close = useCallback(() => setOpen(false), []);
  const { panel, at } = useDropPanel(open, close, box);

  /* The tick that says it worked, and takes itself away. A menu that closes on
     the click is a menu you cannot tell fired. */
  const say = (what: string) => {
    setDone(what);
    window.setTimeout(() => { setDone(undefined); setOpen(false); }, 700);
  };

  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).then(() => say(what), () => say(what));
  };

  const link = comment.url || issueUrl;

  const items: {
    id: string; label: string; icon: IcoName; run: () => void; note?: string;
  }[] = [
    {
      id: 'link', label: 'Copy link', icon: 'link',
      run: () => copy(link, 'link'),
      note: comment.url ? undefined : 'the issue — this comment has no permalink',
    },
    {
      id: 'md', label: 'Copy Markdown', icon: 'md',
      run: () => copy(comment.body, 'md'),
    },
    {
      id: 'quote', label: 'Quote reply', icon: 'cmt',
      run: () => { onQuote(quote(comment.body)); setOpen(false); },
    },
  ];

  if (!body) {
    items.push({
      id: 'ref', label: 'Reference in a new issue', icon: 'issue',
      run: () => { onReference(reference(comment, link)); setOpen(false); },
    });
  }

  /*
    Yours, and readable.

    Both conditions are real: `mine` is what github.com uses to decide, and an
    id we could not parse out of the permalink means there is no endpoint to
    address — better to leave the row out than to draw one that fails.
  */
  /* The description has no comment id to address — `0` says so, and the
     caller turns it into `gh issue edit` rather than an api call. */
  const id = body ? 0 : commentId(comment.url);
  const owned = comment.mine && id !== undefined;
  if (owned && onEdit) {
    items.push({
      id: 'edit', label: 'Edit', icon: 'pen',
      run: () => { onEdit(id); setOpen(false); },
    });
  }

  if (editing) return null;

  return (
    <div className="ghmenu" ref={box}>
      <button
        type="button"
        className={`iconbtn${open ? ' on' : ''}`}
        title="More"
        aria-label="More actions on this comment"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <Ico name="dots" />
      </button>

      {open && dropPortal(box.current, (
        <div ref={panel} className="ghmenu-p" role="menu" style={dropStyle(at)}>
          {items.map(it => (
            <button
              key={it.id}
              type="button"
              role="menuitem"
              className={`ghmenu-r${done === it.id ? ' ok' : ''}`}
              onClick={it.run}
            >
              <Ico name={done === it.id ? 'check' : it.icon}
                   className={done === it.id ? 'popped' : undefined} />
              <span className="ghmenu-t">
                {it.label}
                {it.note && <i>{it.note}</i>}
              </span>
            </button>
          ))}

          {owned && onDelete && !body && (
            <>
              <div className="ghmenu-s" />
              <button
                type="button"
                role="menuitem"
                className="ghmenu-r danger"
                onClick={() => { onDelete(id); setOpen(false); }}
              >
                <Ico name="trash" />
                <span className="ghmenu-t">
                  Delete
                  <i>you will see the call before it runs</i>
                </span>
              </button>
            </>
          )}

          <div className="ghmenu-s" />

          {/*
            Said rather than drawn as two disabled rows. Pin and Hide are the
            two this menu does not do, and this is where they are.
          */}
          <a className="ghmenu-r" href={link} target="_blank" rel="noreferrer"
             role="menuitem" onClick={() => setOpen(false)}>
            <Ico name="gh" />
            <span className="ghmenu-t">
              Open on github.com
              <i>{body ? 'pin, lock and transfer live there' : 'pin and hide live there'}</i>
            </span>
          </a>
        </div>
      ))}
    </div>
  );
}


/** Every line prefixed, a blank line after — which is what the site writes. */
export function quote(body: string): string {
  const lines = body.replace(/\r\n/g, '\n').trimEnd().split('\n');
  return `${lines.map(l => (l ? `> ${l}` : '>')).join('\n')}\n\n`;
}

/** A new issue that says where it came from, in the first line. */
export function reference(comment: CommentRef, link: string): string {
  const who = comment.author ? `@${comment.author}` : 'a comment';
  return `Referencing ${who} in ${link}\n\n${quote(comment.body)}`;
}
