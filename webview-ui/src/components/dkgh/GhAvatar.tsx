/**
 * Somebody's actual face, where there was a letter in a circle.
 *
 * ── Through the host, like every other image here ──
 *
 * The webview's content policy is `img-src ${cspSource} data:`, so an
 * `<img src="https://avatars.githubusercontent.com/…">` renders nothing and
 * says nothing about why. The bytes come through `gh` and arrive as a data
 * URI, which is the same road a screenshot takes — see `GhEvidence` and
 * `services/gh/evidence.ts`, whose queue, size cap and cache this reuses
 * unchanged.
 *
 * `https://github.com/<login>.png` rather than an avatar id: the login is what
 * the board already knows, and that URL is GitHub's own documented redirect to
 * whatever the avatar currently is. It costs one extra hop and saves carrying
 * an id through the timeline parser, the comment parser and two message types.
 *
 * ── The letter is not a fallback, it is the floor ──
 *
 * It renders first, every time, and the picture replaces it if one arrives.
 * A signed-out `gh`, a deleted account, a bot with no avatar and a slow network
 * all land in the same place: the circle that was always there. Nothing shifts
 * when the image loads, because the circle is already the right size.
 */
import { useEffect, useState } from 'react';
import { requestEvidence } from './GhEvidence';
import { Ico } from './GhIcons';

/** What GitHub serves for a login. 48px covers the 2× of every size we draw. */
export function avatarUrl(login: string): string {
  return `https://github.com/${encodeURIComponent(login)}.png?size=48`;
}

/**
 * A login that cannot have a picture.
 *
 * `github-project-automation[bot]` is a real actor on a real timeline and the
 * brackets are part of its name — `github.com/<that>.png` is a 404, and asking
 * for it is a subprocess spent to be told so.
 */
export function canHaveAvatar(login: string | undefined): login is string {
  return !!login && !login.includes('[') && /^[A-Za-z0-9-]+$/.test(login);
}

/**
 * GitHub's own actors, which wear GitHub's own mark.
 *
 * `github-project-automation[bot]` moving a card is GitHub doing it, and a
 * circle with a `G` in it says nothing a reader can use. The mark says which
 * of the actors on this timeline is not a person, at a glance, which is the
 * one thing worth knowing about that row.
 */
export function isGitHub(login: string | undefined): boolean {
  return !!login && /\[bot\]$/.test(login);
}

export function GhAvatar({ who, className }: {
  who?: string;
  /** The circle's own class — `av`, `av-s`, whichever size the row wants. */
  className: string;
}) {
  const [src, setSrc] = useState<string | undefined>();

  useEffect(() => {
    setSrc(undefined);
    if (!canHaveAvatar(who)) return;
    let alive = true;
    const stop = requestEvidence(avatarUrl(who), a => {
      if (alive && a.dataUri) setSrc(a.dataUri);
    });
    return () => { alive = false; stop(); };
  }, [who]);

  const letter = (who ?? '?')[0]?.toUpperCase() ?? '?';

  if (isGitHub(who)) {
    return (
      <span className={`${className} avbot`} title={who}>
        <Ico name="gh" />
      </span>
    );
  }

  return (
    <span className={className} title={who}>
      {src
        ? <img src={src} alt="" className="avimg" />
        : letter}
    </span>
  );
}
