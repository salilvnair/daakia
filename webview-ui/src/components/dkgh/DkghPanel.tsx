/**
 * dkgh — the tab.
 *
 * Right now this is only the way in: three first-run states, chosen by one
 * probe. They are three states of the same question — is gh here, am I signed
 * in, which repository — so they come from a single `dkgh:probe` rather than
 * three calls that can disagree with each other on a slow machine.
 *
 * Each one is the whole tab. There is deliberately no Board behind an install
 * screen: an empty table teasing what you cannot have yet is worse than a
 * placeholder, and there is exactly one thing to do on each of these screens.
 */
import { useEffect, useRef, useState } from 'react';
import { postMsg } from '../../vscode';
import { GhNotInstalled } from './GhNotInstalled';
import { GhSignIn } from './GhSignIn';
import { GhPickRepository } from './GhPickRepository';
import type { GhEnv } from './types';

export function DkghPanel() {
  const [env, setEnv] = useState<GhEnv | null>(null);
  const [envOverride, setEnvOverride] = useState<string | undefined>();
  const [checking, setChecking] = useState(true);
  /** Set once a repository is chosen. Nothing reads it yet — the board is next. */
  const [repo, setRepo] = useState<string | undefined>();

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type !== 'dkgh:probe:result') return;
      setEnv(msg.env as GhEnv);
      setEnvOverride(msg.envOverride as string | undefined);
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

  if (!env) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
          Looking for the GitHub CLI…
        </span>
      </div>
    );
  }

  if (!env.present) {
    return <GhNotInstalled env={env} envOverride={envOverride} checking={checking} onRecheck={recheck} />;
  }

  if (!env.auth?.loggedIn) {
    return <GhSignIn env={env} checking={checking} onRecheck={recheck} />;
  }

  return <GhPickRepository env={env} repo={repo} onPick={setRepo} />;
}

export default DkghPanel;
