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
import { ButtonView } from '@salilvnair/dui';
import { TerminalIcon, RefreshIcon, LockIcon, DownloadIcon } from '../../icons';
import { GhEmpty, GhLede, GhOption, GhNote, GhActions, GhPrimary } from './GhShell';
import { ACCENT, type GhEnv } from './types';

type Plat = 'win32' | 'darwin' | 'linux';

const LABEL: Record<Plat, string> = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };

interface Route {
  title: string;
  tag?: string;
  command?: string;
  note?: string;
  download?: boolean;
}

const ROUTES: Record<Plat, Route[]> = {
  win32: [
    { title: 'winget', tag: 'recommended', command: 'winget install --id GitHub.cli',
      note: 'Ships with Windows 11. No admin prompt on most machines.' },
    { title: 'Scoop', command: 'scoop install gh',
      note: 'If you already use Scoop for your dev tools.' },
    { title: 'Chocolatey', command: 'choco install gh',
      note: 'Needs an elevated shell.' },
    { title: 'Download', download: true,
      note: 'Installer and portable zip at github.com/cli/cli/releases — for a locked-down machine with no package manager.' },
  ],
  darwin: [
    { title: 'Homebrew', tag: 'recommended', command: 'brew install gh',
      note: 'What almost every Mac dev machine already has.' },
    { title: 'MacPorts', command: 'sudo port install gh' },
    { title: 'Download', download: true,
      note: 'The .pkg at github.com/cli/cli/releases. Gatekeeper will quarantine it on first open.' },
  ],
  linux: [
    { title: 'Debian · Ubuntu', tag: 'apt', command: 'sudo apt install gh' },
    { title: 'Fedora · RHEL', command: 'sudo dnf install gh' },
    { title: 'Arch', command: 'sudo pacman -S github-cli' },
    { title: 'Download', download: true,
      note: 'The tarball at github.com/cli/cli/releases — for a container, or a machine with no sudo. Several distros ship an old gh in their default repos.' },
  ],
};

const RELEASES = 'https://github.com/cli/cli/releases';

export function GhNotInstalled({ env, envOverride, checking, onRecheck }: {
  env: GhEnv;
  envOverride?: string;
  checking: boolean;
  onRecheck: () => void;
}) {
  const detected = (['win32', 'darwin', 'linux'] as Plat[]).includes(env.platform as Plat)
    ? (env.platform as Plat)
    : 'linux';
  const [plat, setPlat] = useState<Plat>(detected);

  return (
    <GhEmpty icon={<TerminalIcon size={38} />} title="GitHub CLI not found">
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
        <div className="w-full mb-3">
          <GhNote icon={<LockIcon size={12} />} tone="warn">
            <b style={{ color: 'var(--color-text-primary)' }}>DAAKIA_GH is set</b>, so only that
            path was tried — nothing else was looked at.
            <span className="font-mono block mt-1">{envOverride}</span>
          </GhNote>
        </div>
      )}

      {/* Platform tabs — open on what the host reported. */}
      <div className="flex gap-1 mb-3">
        {(['win32', 'darwin', 'linux'] as Plat[]).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setPlat(p)}
            className="text-[11px] px-3 py-1 rounded-md cursor-pointer"
            style={{
              border: '1px solid',
              borderColor: p === plat ? 'var(--color-surface-border)' : 'transparent',
              backgroundColor: p === plat ? 'var(--color-surface)' : 'transparent',
              color: p === plat ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              fontWeight: p === plat ? 600 : 400,
            }}
          >
            {LABEL[p]}
            {p === detected && <span style={{ color: ACCENT }}> ·</span>}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 w-full">
        {ROUTES[plat].map(r => (
          <GhOption
            key={r.title}
            title={r.title}
            tag={r.tag}
            recommended={r.tag === 'recommended'}
            command={r.command}
            note={r.note}
            action={r.download ? (
              <ButtonView size="sm" variant="ghost" accentColor={ACCENT}
                          iconLeft={<DownloadIcon size={11} />}
                          onClick={() => window.open(RELEASES, '_blank')}>
                Open releases
              </ButtonView>
            ) : undefined}
          />
        ))}
      </div>

      <div className="w-full mt-3">
        <GhNote icon={<LockIcon size={12} />}>
          <b style={{ color: 'var(--color-text-primary)' }}>Daakia never asks for a GitHub token.</b>
          {' '}Signing in is the next screen and it happens inside <code>gh</code>, which stores the
          credential in your OS keychain. Nothing is written to Daakia's database.
        </GhNote>
      </div>

      {env.triedPaths?.length ? (
        <div className="w-full mt-2">
          <GhNote icon={<TerminalIcon size={12} />}>
            <b style={{ color: 'var(--color-text-primary)' }}>Looked in:</b>{' '}
            <span className="font-mono">{env.triedPaths.join(' · ')}</span>
            {!envOverride && ' — if gh is somewhere else, set the path in Settings → GitHub CLI.'}
          </GhNote>
        </div>
      ) : null}

      <GhActions>
        <GhPrimary iconLeft={<RefreshIcon size={12} />} onClick={onRecheck}>
          {checking ? 'Checking…' : 'Check again'}
        </GhPrimary>
        <ButtonView size="md" accentColor="var(--color-text-muted)"
                    onClick={() => window.open('https://github.com/cli/cli#installation', '_blank')}>
          Installation docs
        </ButtonView>
      </GhActions>

      <p className="text-[10px] mt-3" style={{ color: 'var(--color-text-muted)' }}>
        Checking every few seconds while this screen is open.
      </p>
    </GhEmpty>
  );
}
