/**
 * dkgh — the tab.
 *
 * The way in, and then the board. Four states, chosen by one probe: is gh
 * here, am I signed in, which repository, and then the issues themselves. The
 * first three are one question asked three times, so they come from a single
 * `dkgh:probe` rather than three calls that can disagree with each other on a
 * slow machine.
 *
 * Each one is the whole tab. There is deliberately no Board behind an install
 * screen: an empty table teasing what you cannot have yet is worse than a
 * placeholder, and there is exactly one thing to do on each of these screens.
 */
import { useEffect, useRef, useState } from 'react';
import { postMsg } from '../../vscode';
import { useSettledWait } from '../../hooks/useSettledWait';
import { GhNotInstalled } from './GhNotInstalled';
import { GhSignIn } from './GhSignIn';
import { GhPickRepository } from './GhPickRepository';
import { GhBoard } from './GhBoard';
import type { GhEnv } from './types';

export function DkghPanel() {
  const [env, setEnv] = useState<GhEnv | null>(null);
  const [envOverride, setEnvOverride] = useState<string | undefined>();
  const [checking, setChecking] = useState(true);
  /**
   * The repository the board is reading.
   *
   * Hydrated from the probe, because the host is where it is persisted — the
   * tab should open where it was left rather than asking the same question
   * every window reload.
   */
  const [repo, setRepo] = useState<string | undefined>();

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type !== 'dkgh:probe:result') return;
      setEnv(msg.env as GhEnv);
      setEnvOverride(msg.envOverride as string | undefined);
      /* Only on the first probe. A recheck must not drag somebody back to the
         saved repository after they pressed Switch. */
      setRepo(prev => prev ?? (msg.repo as string | undefined));
      setChecking(false);
    };
    window.addEventListener('message', handler);
    postMsg({ type: 'dkgh:probe' });
    return () => window.removeEventListener('message', handler);
  }, []);

  /*
    Poll while an install screen is open, and never otherwise.

    Somebody who installs gh in another window should not have to find a button,
    but a background process shelling out every few seconds for the life of the
    editor is not something a tab should do to a laptop. So: only while the
    answer is "not here yet", and only while this tab is the one on screen.
  */
  const waiting = !!env && (!env.present || !env.auth?.loggedIn);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!waiting) return;
    const tick = () => {
      if (document.visibilityState === 'visible') postMsg({ type: 'dkgh:recheck' });
    };
    timer.current = window.setInterval(tick, 3000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [waiting]);

  const recheck = () => { setChecking(true); postMsg({ type: 'dkgh:recheck' }); };

  /*
    A longer gate than the rest of the tab, on purpose.

    Finding gh is the first of two waits — the board's own read follows it —
    and two placeholders in a row reads as the tab breaking twice on its way to
    working. Under a second, this one stays silent and lets the board's
    placeholder, which has more to say, be the only one.
  */
  const slowProbe = useSettledWait(!env, { delayMs: 900 });

  /* Chosen here rather than inside the screen, because picking one is what
     persists it — and the host is the only thing that can. */
  const pick = (next: string) => {
    setRepo(next || undefined);
    postMsg({ type: 'dkgh:setRepo', repo: next });
  };

  if (!env) {
    /*
      Nothing at all until the probe has actually taken a moment.

      Finding gh is usually two fast subprocess calls, and a line of text that
      appears and vanishes before it can be read is pure flicker — followed, on
      this screen, by the board's own placeholder, so the tab appeared to break
      twice on the way to working.
    */
    return (
      <div className="flex-1 flex items-center justify-center">
        {slowProbe && (
          <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
            Looking for the GitHub CLI…
          </span>
        )}
      </div>
    );
  }

  if (!env.present) {
    return <GhNotInstalled env={env} envOverride={envOverride} checking={checking} onRecheck={recheck} />;
  }

  if (!env.auth?.loggedIn) {
    return <GhSignIn env={env} checking={checking} onRecheck={recheck} />;
  }

  if (repo) {
    return <GhBoard repo={repo} onChangeRepo={() => pick('')} />;
  }

  return <GhPickRepository env={env} onPick={pick} />;
}

export default DkghPanel;
