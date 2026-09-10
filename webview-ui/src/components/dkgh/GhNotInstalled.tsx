/**
 * Screen 01 — the GitHub CLI is not here.
 *
 * The whole tab is this placeholder. No Board behind it, no empty table
 * teasing what you cannot have yet: there is exactly one thing to do, so it is
 * the only thing on screen, and it disappears the moment gh is found.
 *
 * The platform tabs open on whatever the host reported, and each carries every
 * install route that platform actually has — including the plain download,
 * because the locked-down corporate laptop with no package manager is the
 * machine most likely to reach this screen, and telling it to run winget is
 * telling it nothing.
 */
import { useState } from 'react';
import { Ico } from './GhIcons';
import {
  GhEmpty, GhLede, GhNote, GhActions, GhPrimary, GhButton, CopyWord,
} from './GhShell';
import type { GhEnv } from './types';

type Plat = 'win32' | 'darwin' | 'linux';

const LABEL: Record<Plat, string> = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
const PLATS: Plat[] = ['win32', 'darwin', 'linux'];

interface Route {
  title: string;
  tag?: string;
  command?: string;
  /** The file to fetch, when there is no package manager to ask. */
  file?: string;
  note?: string;
}

const ROUTES: Record<Plat, Route[]> = {
  win32: [
    { title: 'winget', tag: 'recommended', command: 'winget install --id GitHub.cli',
      note: 'Ships with Windows 11. No admin prompt on most machines.' },
    { title: 'Scoop', command: 'scoop install gh',
      note: 'If you already use Scoop for your dev tools.' },
    { title: 'Chocolatey', command: 'choco install gh',
      note: 'Needs an elevated shell.' },
    { title: 'Download', file: 'gh_2.x_windows_amd64.zip',
      note: 'Installer and portable zip at github.com/cli/cli/releases — for a locked-down machine with no package manager.' },
  ],
  darwin: [
    { title: 'Homebrew', tag: 'recommended', command: 'brew install gh',
      note: 'What almost every Mac dev machine already has.' },
    { title: 'MacPorts', command: 'sudo port install gh',
      note: 'If Homebrew is not the one you keep up to date.' },
    { title: 'Download', file: 'gh_2.x_macOS_universal.pkg',
      note: 'The .pkg at github.com/cli/cli/releases. Gatekeeper will quarantine it on first open.' },
  ],
  linux: [
    { title: 'Debian · Ubuntu', tag: 'apt', command: 'sudo apt install gh',
      note: 'Several distros ship an old gh — see 01C if it installs but cannot do everything.' },
    { title: 'Fedora · RHEL', command: 'sudo dnf install gh' },
    { title: 'Arch', command: 'sudo pacman -S github-cli' },
    { title: 'Download', file: 'gh_2.x_linux_amd64.tar.gz',
      note: 'The tarball at github.com/cli/cli/releases — for a container, or a machine with no sudo.' },
  ],
};

const RELEASES = 'https://github.com/cli/cli/releases';
const DOCS = 'https://github.com/cli/cli#installation';

export function GhNotInstalled({ env, envOverride, checking, onRecheck, onLocate }: {
  env: GhEnv;
  envOverride?: string;
  checking: boolean;
  onRecheck: () => void;
  /** Screen 01B. The route that actually works on a locked-down machine. */
  onLocate: () => void;
}) {
  const detected = PLATS.includes(env.platform as Plat) ? (env.platform as Plat) : 'linux';
  const [plat, setPlat] = useState<Plat>(detected);

  return (
    <GhEmpty icon="term" title="GitHub CLI not found">
      <GhLede>
        dkgh drives the official <code>gh</code> command, so your GitHub credential
        stays in the OS keychain and never reaches Daakia. Install it once, then
        come back to this tab.
      </GhLede>

      {/*
        An explicit path that did not work is the likeliest reason to be here on
        a machine that has gh, so it is said first and named — otherwise the
        install list is advice for a problem you do not have.
      */}
      {envOverride && (
        <GhNote title="DAAKIA_GH is set" tone="warn">
          Only that path was tried — nothing else was looked at.
          <div style={{ fontFamily: 'var(--mono)', marginTop: 4, color: 'var(--dk-muted)' }}>
            {envOverride}
          </div>
        </GhNote>
      )}

      {/* The platform tabs, open on what the host reported. */}
      <div className="plat">
        {PLATS.map(p => (
          <button
            key={p}
            type="button"
            className={p === plat ? 'on' : undefined}
            onClick={() => setPlat(p)}
            title={p === detected ? 'What this machine reports' : undefined}
          >
            {LABEL[p]}{p === detected ? ' ·' : ''}
          </button>
        ))}
      </div>

      <div className="opts">
        {ROUTES[plat].map(r => (
          <div key={r.title} className={`opt${r.tag === 'recommended' ? ' pick' : ''}`}>
            <div className="oh">
              {r.title}
              {r.tag && <span className="tag">{r.tag}</span>}
              <span className="sp" />
            </div>
            {r.command ? (
              <div className="cmd">
                <span className="p">{plat === 'win32' ? '>' : '$'}</span>
                {r.command}
                <span className="sp" />
                <CopyWord text={r.command} />
              </div>
            ) : (
              <div className="cmd">
                <Ico name="dl" style={{ color: 'var(--dk-muted)' }} />
                {r.file}
                <span className="sp" />
                <button type="button" className="copy"
                        onClick={() => window.open(RELEASES, '_blank')}>
                  open
                </button>
              </div>
            )}
            {r.note && <div className="sub">{r.note}</div>}
          </div>
        ))}
      </div>

      <GhNote title="Daakia never asks for a GitHub token">
        Signing in is the next screen and it happens inside <code>gh</code>, which stores the
        credential in your OS keychain. Nothing is written to Daakia&rsquo;s database.
      </GhNote>

      {env.triedPaths?.length ? (
        <GhNote title="Where it looked" icon="search">
          <span style={{ fontFamily: 'var(--mono)' }}>{env.triedPaths.join(' · ')}</span>
          {!envOverride && ' — if gh is somewhere else, point at it below.'}
        </GhNote>
      ) : null}

      <GhActions>
        <GhPrimary icon="refresh" onClick={onRecheck}>
          {checking ? 'Checking…' : 'Check again'}
        </GhPrimary>
        {/*
          Beside "Check again" rather than buried, because the machine most
          likely to be on this screen is the one where gh is already present —
          unpacked somewhere nobody put on PATH.
        */}
        <GhButton icon="repo" onClick={onLocate}>I already have it — locate gh</GhButton>
        <GhButton onClick={() => window.open(DOCS, '_blank')}>Installation docs</GhButton>
      </GhActions>

      <div style={{ textAlign: 'center', marginTop: 14, fontSize: 11, color: 'var(--dk-faint)' }}>
        Checking every few seconds while this screen is open.
      </div>
    </GhEmpty>
  );
}
