/**
 * Screen 03 — signed in, and no repository chosen yet.
 *
 * Three ways in, ordered by how likely each is to be right. The workspace's
 * git remote comes first because the repository you are testing is usually the
 * one you have open.
 *
 * The scope readout at the bottom is here rather than buried in Settings for
 * one reason: this is the last screen before the board, and "why is my roadmap
 * empty" is answered by a line on it. Saying so now costs a glance; discovering
 * it on screen 07 costs an afternoon.
 */
import { useState } from 'react';
import { ButtonView, TextInputView } from '@salilvnair/dui';
import { GitHubIcon, SearchIcon, CheckIcon, WarningTriangleIcon } from '../../icons';
import { GhEmpty, GhLede, GhNote, GhCommand } from './GhShell';
import { ACCENT, activeAccount, hasScope, type GhEnv } from './types';

/** What each scope buys, in the order they matter. */
const SCOPES = [
  { name: 'repo',         buys: 'Reading issues, and creating them',    required: true },
  { name: 'read:project', buys: 'Status, Priority, Start date and ETA', required: false },
];

export function GhPickRepository({ env, repo, onPick }: {
  env: GhEnv;
  repo?: string;
  onPick: (repo: string) => void;
}) {
  const [typed, setTyped] = useState('');
  const account = activeAccount(env);
  const missingProject = !hasScope(account, 'read:project');

  /* Once picked, the board is what goes here. Until then, say so plainly rather
     than pretending — the board is the next thing to build, not a thing that is
     hidden. */
  if (repo) {
    return (
      <GhEmpty icon={<GitHubIcon size={38} />} title={repo}>
        <GhLede>
          Connected. The board is the next thing to be built — nothing reads this
          repository yet.
        </GhLede>
        <div className="w-full mt-1" style={{ maxWidth: 520 }}>
          <GhNote icon={<CheckIcon size={12} />}>
            Signed in as <b style={{ color: 'var(--color-text-primary)' }}>{account?.login}</b>
            {' '}on {account?.host}, using <code>{env.binary}</code>.
          </GhNote>
        </div>
        <div className="mt-4">
          <ButtonView size="md" accentColor="var(--color-text-muted)" onClick={() => onPick('')}>
            Choose a different repository
          </ButtonView>
        </div>
      </GhEmpty>
    );
  }

  return (
    <GhEmpty icon={<GitHubIcon size={38} />} title="Which repository?">
      <GhLede>
        Signed in as <span style={{ color: 'var(--color-text-primary)' }}>{account?.login}</span>
        {' '}on {account?.host}. Pick the repository whose issues you want to read and write.
      </GhLede>

      <div className="w-full flex flex-col gap-2" style={{ maxWidth: 520 }}>
        {/*
          Search is the only route wired for now. The git-remote guess and the
          recent list both need host work that belongs with the board, and an
          option that looks available and does nothing is worse than one that is
          honestly absent.
        */}
        <div className="rounded-xl border p-3 flex flex-col gap-2"
             style={{
               borderColor: `color-mix(in srgb, ${ACCENT} 50%, transparent)`,
               backgroundColor: `color-mix(in srgb, ${ACCENT} 7%, transparent)`,
             }}>
          <div className="flex items-center gap-2">
            <SearchIcon size={12} style={{ color: ACCENT }} />
            <span className="text-[11.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Type owner/name
            </span>
          </div>
          <div className="flex gap-2">
            <TextInputView
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder="salilvnair/dk-gh"
              size="md"
              accentColor={ACCENT}
              style={{ flex: 1, fontFamily: 'monospace' }}
            />
            <ButtonView size="md" variant="primary" accentColor={ACCENT}
                        disabled={!/^[^/\s]+\/[^/\s]+$/.test(typed.trim())}
                        onClick={() => onPick(typed.trim())}>
              Use this
            </ButtonView>
          </div>
          <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            Anything <code>gh</code> can see, including private and organisation repositories.
          </div>
        </div>

        <GhNote icon={<WarningTriangleIcon size={12} />}>
          <b style={{ color: 'var(--color-text-primary)' }}>Coming with the board:</b> the guess
          from this workspace's <code>git remote</code>, a searchable list, and the recent
          repositories for this workspace. They need host work that belongs with the board, and
          an option that looks available and does nothing is worse than one that is honestly
          absent.
        </GhNote>
      </div>

      {/* ── What this account can currently do ────────────────────────────── */}
      <div className="w-full mt-4 flex flex-col gap-1.5" style={{ maxWidth: 520 }}>
        <div className="text-[9.5px] font-bold uppercase tracking-wider"
             style={{ color: 'var(--color-text-muted)' }}>
          This account
        </div>
        {SCOPES.map(s => {
          const have = hasScope(account, s.name);
          return (
            <div key={s.name} className="flex items-center gap-2 text-[11px]">
              {have
                ? <CheckIcon size={11} style={{ color: 'var(--color-success)' }} />
                : <WarningTriangleIcon size={11} style={{ color: s.required ? 'var(--color-error)' : 'var(--color-warning)' }} />}
              <code style={{ color: have ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{s.name}</code>
              <span style={{ color: 'var(--color-text-muted)' }}>{s.buys}</span>
            </div>
          );
        })}

        {missingProject && (
          <div className="mt-1.5 flex flex-col gap-1.5">
            <GhCommand text="gh auth refresh --scopes read:project" />
            <div className="text-[10px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
              Adds the scope in place — keeps your account, your protocol and your existing
              scopes. Without it the board still works; the roadmap and the date columns say
              what is missing rather than showing blanks.
            </div>
          </div>
        )}
      </div>
    </GhEmpty>
  );
}
