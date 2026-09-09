/**
 * Screen 03 — signed in, and no repository chosen yet.
 *
 * One way in for now — type `owner/name`. The workspace's git remote, a
 * searchable list and a recents list all belong here too, and are named as
 * absent rather than drawn as controls that do nothing.
 *
 * The scope readout at the bottom is here rather than buried in Settings for
 * one reason: this is the last screen before the board, and "why is my roadmap
 * empty" is answered by a line on it. Saying so now costs a glance; discovering
 * it on screen 07 costs an afternoon.
 */
import { useState } from 'react';
import { ButtonView, SearchFieldView, SetupOptionView } from '@salilvnair/dui';
import { RepoIcon, CheckIcon, WarningTriangleIcon } from '../../icons';
import { GhEmpty, GhLede, GhNote, GhCommand } from './GhShell';
import { ACCENT, activeAccount, hasScope, type GhEnv } from './types';

/** `owner/name`, and nothing that would make gh reinterpret it as a URL or path. */
const VALID = /^[^/\s]+\/[^/\s]+$/;

/** What each scope buys, in the order they matter. */
const SCOPES = [
  { name: 'repo',         buys: 'Reading issues, and creating them',    required: true },
  { name: 'read:project', buys: 'Status, Priority, Start date and ETA', required: false },
];

export function GhPickRepository({ env, onPick }: {
  env: GhEnv;
  onPick: (repo: string) => void;
}) {
  const [typed, setTyped] = useState('');
  const account = activeAccount(env);
  const missingProject = !hasScope(account, 'read:project');
  const ready = VALID.test(typed.trim());

  return (
    <GhEmpty icon={<RepoIcon size={30} />} title="Which repository?">
      <GhLede>
        Signed in as <span style={{ color: 'var(--color-text-primary)' }}>{account?.login}</span>
        {' '}on {account?.host}. Pick the repository whose issues you want to read and write.
      </GhLede>

      <div className="w-full flex flex-col gap-2" style={{ maxWidth: 520 }}>
        {/*
          Typed entry is the only route wired. It is also the only one that
          works for a repository outside this workspace, which is why it is the
          one that came first rather than the one left over.
        */}
        <SetupOptionView
          accentColor={ACCENT}
          title="Type owner/name"
          recommended
          note="Anything gh can see, including private and organisation repositories."
          action={
            <ButtonView size="sm" variant="primary" accentColor={ACCENT}
                        disabled={!ready} onClick={() => onPick(typed.trim())}>
              Use this
            </ButtonView>
          }
        >
          <SearchFieldView
            value={typed}
            onChange={setTyped}
            /* Enter does what the button does, because typing a repository name
               and reaching for a mouse is a step nobody wants. */
            onSearch={v => { if (VALID.test(v.trim())) onPick(v.trim()); }}
            placeholder="salilvnair/dk-gh"
            size="md"
            accentColor={ACCENT}
            width="100%"
          />
        </SetupOptionView>

        <GhNote title="Not wired yet">
          The guess from this workspace's <code>git remote</code>, a searchable list, and the
          recent repositories for this workspace. Each needs its own host call, and an option
          that looks available and does nothing is worse than one that is honestly absent.
        </GhNote>
      </div>

      {/* What this account can currently do */}
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
                : <WarningTriangleIcon size={11}
                    style={{ color: s.required ? 'var(--color-error)' : 'var(--color-warning)' }} />}
              <code style={{ color: have ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                {s.name}
              </code>
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
