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
import { ButtonView, SegmentedControlView, SetupOptionView } from '@salilvnair/dui';
import { TerminalIcon, RefreshIcon, DownloadIcon, FolderOpenIcon } from '../../icons';
import { GhEmpty, GhLede, GhNote, GhActions, GhPrimary } from './GhShell';
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

export function GhNotInstalled({ env, envOverride, checking, onRecheck, onLocate }: {
  env: GhEnv;
  envOverride?: string;
  checking: boolean;
  onRecheck: () => void;
  /** Screen 01B. The route that actually works on a locked-down machine. */
  onLocate: () => void;
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
          <GhNote title="DAAKIA_GH is set" tone="warn">
            Only that path was tried — nothing else was looked at.
            <span className="font-mono block mt-1">{envOverride}</span>
          </GhNote>
        </div>
      )}

      {/* Platform tabs — open on what the host reported, marked with a dot. */}
      <div className="mb-3">
        <SegmentedControlView
          size="sm"
          accentColor={ACCENT}
          value={plat}
          onChange={v => setPlat(v as Plat)}
          options={(['win32', 'darwin', 'linux'] as Plat[]).map(p => ({
            value: p,
            label: p === detected ? `${LABEL[p]} ·` : LABEL[p],
          }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 w-full">
        {ROUTES[plat].map(r => (
          <SetupOptionView
            key={r.title}
            title={r.title}
            tag={r.tag}
            recommended={r.tag === 'recommended'}
            command={r.command}
            note={r.note}
            accentColor={ACCENT}
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
        <GhNote title="Daakia never asks for a GitHub token">
          Signing in is the next screen and it happens inside <code>gh</code>, which stores the
          credential in your OS keychain. Nothing is written to Daakia's database.
        </GhNote>
      </div>

      {env.triedPaths?.length ? (
        <div className="w-full mt-2">
          <GhNote title="Where it looked">
            <span className="font-mono">{env.triedPaths.join(' · ')}</span>
            {!envOverride && ' — if gh is somewhere else, set the path in Settings → GitHub CLI.'}
          </GhNote>
        </div>
      ) : null}

      <GhActions>
        <GhPrimary iconLeft={<RefreshIcon size={12} />} onClick={onRecheck}>
          {checking ? 'Checking…' : 'Check again'}
        </GhPrimary>
        {/*
          Placed beside "Check again" rather than buried, because the machine
          most likely to be on this screen is the one where gh is already
          present — unpacked somewhere nobody put on PATH.
        */}
        <ButtonView size="md" accentColor={ACCENT} iconLeft={<FolderOpenIcon size={12} />}
                    onClick={onLocate}>
          I already have it — locate gh
        </ButtonView>
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
