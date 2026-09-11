/**
 * The `…` on the issue's own title, as github.com has it.
 *
 * ── Two of these need a scope you may not have ──
 *
 * Archiving an item or removing it from a Project are Projects v2 *writes*.
 * `read:project` — which is what dkgh asks for on connect, and what most
 * tokens end up with — can see the board and cannot change it, so those two
 * calls come back 403.
 *
 * They are drawn anyway, disabled, with the reason and the one command that
 * fixes it. Leaving them out would mean the menu quietly differs between two
 * people looking at the same issue, and the commonest question about a missing
 * feature is whether it exists at all. `gh auth refresh` opens a browser and
 * asks for a device code, so it is shown rather than run — the same thing
 * `GhAccountPanel` and `GhSignIn` already do.
 *
 * ── Archive is not Delete ──
 *
 * Archiving takes the card off the board and keeps the issue. Removing takes
 * it out of the Project entirely, also keeping the issue. Neither closes or
 * deletes anything, and both say so, because "Remove from project" beside a
 * red trash icon reads like it deletes the issue.
 */
import { useCallback, useRef, useState } from 'react';
import { Ico, type IcoName } from './GhIcons';
import { dropPortal, dropStyle, useDropPanel } from './drop-panel';
import { openExternal } from './open-external';

/** What `gh auth refresh` has to be given for the two writes to work. */
export const PROJECT_SCOPE_CMD = 'gh auth refresh --scopes project';

export interface IssueMenuItem {
  id: string;
  label: string;
  icon: IcoName;
  /** The smaller line under it — what it does, or why it cannot. */
  note?: string;
  danger?: boolean;
  disabled?: boolean;
  run?: () => void;
}

/**
 * Where an item sits inside its Project, if that is knowable.
 *
 * `itemId` is the node id of the *Project item*, not the issue — which is what
 * the project links and the project writes are addressed by. Without a Project
 * or without the item on it, the three project entries have nothing to act on
 * and are left out rather than drawn dead.
 */
export interface ProjectPlace {
  owner: string;
  number: number;
  title: string;
  itemId?: string;
}

export function GhIssueMenu({ url, place, canWriteProject, onArchive, onRemove }: {
  /** The issue on github.com. */
  url: string;
  place?: ProjectPlace;
  /** Whether the signed-in token carries `project`, not just `read:project`. */
  canWriteProject: boolean;
  onArchive?: (itemId: string) => void;
  onRemove?: (itemId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | undefined>();
  const box = useRef<HTMLDivElement>(null);
  /* Portalled and fixed, like every other dropdown here — see `useDropPanel`. */
  const close = useCallback(() => setOpen(false), []);
  const { panel, at } = useDropPanel(open, close, box);

  const say = (what: string) => {
    setDone(what);
    window.setTimeout(() => { setDone(undefined); setOpen(false); }, 700);
  };

  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).then(() => say(what), () => say(what));
  };

  const items: IssueMenuItem[] = [
    {
      id: 'tab', label: 'Open in new tab', icon: 'gh',
      run: () => { openExternal(url); setOpen(false); },
    },
    { id: 'link', label: 'Copy link', icon: 'link', run: () => copy(url, 'link') },
  ];

  if (place) {
    items.push({
      id: 'plink', label: 'Copy link in project', icon: 'board',
      note: place.title,
      run: () => copy(projectLink(place), 'plink'),
    });
    items.push({
      id: 'archive', label: 'Archive in project', icon: 'clip',
      note: canWriteProject
        ? 'Off the board, still an issue'
        : `Needs the project scope — ${PROJECT_SCOPE_CMD}`,
      disabled: !canWriteProject || !place.itemId,
      run: place.itemId && onArchive ? () => { onArchive(place.itemId!); setOpen(false); } : undefined,
    });
    items.push({
      id: 'remove', label: 'Remove from project', icon: 'trash',
      danger: true,
      note: canWriteProject
        ? 'Out of the project, still an issue'
        : `Needs the project scope — ${PROJECT_SCOPE_CMD}`,
      disabled: !canWriteProject || !place.itemId,
      run: place.itemId && onRemove ? () => { onRemove(place.itemId!); setOpen(false); } : undefined,
    });
  }

  const menu = (
    <div
      ref={panel}
      className="ghmenu-p"
      role="menu"
      style={{ ...dropStyle(at), minWidth: 218 }}
    >
      {items.map(it => (
        <button
          key={it.id}
          type="button"
          role="menuitem"
          disabled={it.disabled}
          className={`ghmenu-r${it.danger ? ' danger' : ''}${done === it.id ? ' ok' : ''}`}
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
    </div>
  );

  return (
    <div className="ghmenu" ref={box}>
      <button
        type="button"
        className={`iconbtn${open ? ' on' : ''}`}
        title="More"
        aria-label="More actions on this issue"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <Ico name="dots" />
      </button>
      {open && dropPortal(box.current, menu)}
    </div>
  );
}

/**
 * github.com's own "link in project" — the board, opened on this card.
 *
 * `?pane=issue&itemId=…` is the query the site puts in the address bar when a
 * card's side panel is open, which is what makes this different from the
 * issue's own URL: it lands the reader on the board, looking at the item.
 */
export function projectLink(place: ProjectPlace): string {
  const base = `https://github.com/orgs/${place.owner}/projects/${place.number}`;
  return place.itemId ? `${base}?pane=issue&itemId=${place.itemId}` : base;
}
