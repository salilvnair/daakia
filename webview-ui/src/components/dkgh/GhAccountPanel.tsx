/**
 * Screens 02A, 02B, 02D and 02E — everything about the connection.
 *
 * One panel with four tabs rather than four screens, because they answer one
 * question asked four ways: what is dkgh allowed to do, where, as whom, and
 * with which commands. Somebody who opens any of them is usually about to read
 * at least one of the others.
 *
 * Reached from the identity chip in the board head, which is there permanently
 * because "who am I right now" should never require a click to find out — only
 * to find out more.
 */
import { useEffect, useState } from 'react';
import {
  ModalView, ButtonView, UnderlineTabsView, BadgeChipView, CalloutView,
  CodeBlockView, TogglePillView,
} from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';
import {
  CheckIcon, CloseIcon, LockIcon, CopyIcon, KeyIcon, UsersIcon, TerminalIcon,
} from '../../icons';
import { ACCENT, activeAccount, hasScope, type GhEnv, type GhAccount } from './types';

interface ScopeRow { scope: string; unlocks: string; without: string; need: string }
interface CommandRow {
  command: string; when: string; kind: 'read' | 'write'; confirmedBy?: string; live: boolean;
}

export function GhAccountPanel({ env, repo, open, onClose }: {
  env: GhEnv;
  repo?: string;
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState('scopes');
  const [scopes, setScopes] = useState<ScopeRow[]>([]);
  const [commands, setCommands] = useState<CommandRow[]>([]);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type !== 'dkgh:commands:result') return;
      setScopes((msg.scopes as ScopeRow[]) ?? []);
      setCommands((msg.commands as CommandRow[]) ?? []);
    };
    window.addEventListener('message', handler);
    if (open) postMsg({ type: 'dkgh:commands' });
    return () => window.removeEventListener('message', handler);
  }, [open]);

  if (!open) return null;

  const account = activeAccount(env);
  const accounts = env.auth?.accounts ?? [];
  const hosts = [...new Set(accounts.map(a => a.host))];

  return (
    <ModalView
      open
      onClose={onClose}
      title="This connection"
      subtitle={account ? `${account.login} on ${account.host}` : 'not signed in'}
      size="lg"
      headerColor={ACCENT}
      footerRight={
        <ButtonView size="md" accentColor="var(--color-text-muted)" onClick={onClose}>
          Close
        </ButtonView>
      }
    >
      <div className="flex flex-col gap-3" style={{ minWidth: 520 }}>
        <UnderlineTabsView
          accentColor={ACCENT}
          activeId={tab}
          onChange={setTab}
          tabs={[
            { id: 'scopes', label: 'Scopes', icon: <KeyIcon size={12} /> },
            { id: 'hosts', label: 'Hosts', icon: <LockIcon size={12} />, count: hosts.length },
            { id: 'accounts', label: 'Accounts', icon: <UsersIcon size={12} />, count: accounts.length },
            { id: 'commands', label: 'Commands', icon: <TerminalIcon size={12} />, count: commands.length },
          ]}
        />

        {/*
          One height for all four tabs.

          Scopes is a table and two commands; Commands is twenty-four rows. Left
          to size themselves, the dialog jumped by several hundred pixels every
          time somebody moved between them — the tab strip walking up the screen
          under the pointer that was still on it, which is how you click the
          wrong tab. So the body is a fixed pane that scrolls, and the tab you
          came from is still where you left it when you come back.
        */}
        <div className="overflow-y-auto" style={{ height: 460 }}>
          {tab === 'scopes' && <Scopes rows={scopes} account={account} />}
          {tab === 'hosts' && <Hosts hosts={hosts} accounts={accounts} repo={repo} />}
          {tab === 'accounts' && <Accounts accounts={accounts} repo={repo} />}
          {tab === 'commands' && <Commands rows={commands} />}
        </div>
      </div>
    </ModalView>
  );
}

/**
 * 02A — what each scope buys, and what it costs.
 *
 * Asking for permissions without saying what they unlock is how people either
 * grant everything or refuse everything. Four scopes, four sentences, and three
 * of them are optional.
 */
function Scopes({ rows, account }: { rows: ScopeRow[]; account?: GhAccount }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11.5px]">
          <thead>
            <tr>
              {['Scope', 'Unlocks', 'Without it', ''].map(h => (
                <th key={h} className="text-left px-2.5 py-1.5 text-[9.5px] font-semibold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-surface-border)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const have = hasScope(account, r.scope);
              return (
                <tr key={r.scope}>
                  <td className="px-2.5 py-1.5 font-mono whitespace-nowrap" style={cell()}>{r.scope}</td>
                  <td className="px-2.5 py-1.5" style={{ ...cell(), color: 'var(--color-text-primary)' }}>
                    {r.unlocks}
                  </td>
                  <td className="px-2.5 py-1.5" style={cell()}>{r.without}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap" style={cell()}>
                    {have
                      ? <BadgeChipView tone="var(--color-success)" size="xs">granted</BadgeChipView>
                      : r.need === 'required'
                        ? <BadgeChipView tone="var(--color-error)" size="xs">required</BadgeChipView>
                        : r.need === 'on-demand'
                          ? <BadgeChipView tone="var(--color-text-muted)" size="xs">when needed</BadgeChipView>
                          : <BadgeChipView tone="var(--color-text-muted)" size="xs">optional</BadgeChipView>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Labelled title="Add one later">
        <CodeBlockView code="gh auth refresh --scopes project" language="bash" fill
                       showCopyButton accentColor={ACCENT} />
        <Note>Adds a scope to the existing credential. It does not sign you out and does not
          touch the others.</Note>
      </Labelled>

      <Labelled title="See what you have">
        <CodeBlockView code="gh auth status" language="bash" fill showCopyButton accentColor={ACCENT} />
        <Note>The same command dkgh runs. The table above is its output, not our record of what
          we asked for.</Note>
      </Labelled>

      <CalloutView variant="tip" title="Write access is asked for when it is needed"
                   style={{ margin: 0 }}>
        Never at sign-in. A board that only reads should not have been holding the ability to
        edit somebody's Project since Tuesday — the first drag is what asks, and the drag
        completes once it is granted rather than being thrown away.
      </CalloutView>
    </div>
  );
}

/**
 * 02B — Enterprise, and being signed into two places.
 *
 * The host is chosen by the repository, not by a setting. Nobody has to
 * remember to switch, and there is no way to accidentally file a work bug with
 * a personal account.
 */
function Hosts({ hosts, accounts, repo }: {
  hosts: string[]; accounts: GhAccount[]; repo?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col rounded-lg border overflow-hidden"
           style={{ borderColor: 'var(--color-surface-border)' }}>
        {hosts.map(h => {
          const on = accounts.filter(a => a.host === h);
          const enterprise = h !== 'github.com';
          return (
            <div key={h} className="px-3 py-2 flex flex-col gap-1"
                 style={{ borderTop: '1px solid color-mix(in srgb, var(--color-surface-border) 55%, transparent)' }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11.5px] font-mono font-semibold"
                      style={{ color: 'var(--color-text-primary)' }}>{h}</span>
                {enterprise && <BadgeChipView tone="var(--color-text-muted)" size="xs">enterprise</BadgeChipView>}
                {on.some(a => a.active) && <BadgeChipView tone={ACCENT} size="xs">active</BadgeChipView>}
              </div>
              {on.map(a => (
                <div key={a.login} className="flex items-center gap-2 text-[10.5px]"
                     style={{ color: 'var(--color-text-muted)' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{a.login}</span>
                  <span className="font-mono">{a.scopes.join(' · ') || 'no scopes reported'}</span>
                  {!hasScope(a, 'read:project') && (
                    <span style={{ color: 'var(--color-warning)' }}>— dates unavailable there</span>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <CalloutView variant="info" title="The host is chosen by the repository" style={{ margin: 0 }}>
        {repo ? <><code>{repo}</code> uses whichever host can see it.</> : 'Whichever host can see it.'}
        {' '}Not by a setting — nobody has to remember to switch, and there is no way to
        accidentally file a work bug with a personal account.
      </CalloutView>

      <Labelled title="Signing into an Enterprise host">
        <CodeBlockView code="gh auth login --hostname git.acme.internal --scopes read:project"
                       language="bash" fill showCopyButton accentColor={ACCENT} />
        <Note>dkgh reads the host list back from <code>gh auth status</code> — you never type a
          URL into Daakia, and Daakia never stores one.</Note>
      </Labelled>

      <Note>
        An older Enterprise Server has fewer features, and dkgh degrades the same way it does
        for a repository with no templates. Projects v2 and issue types are recent; issues and
        labels are ancient. Whatever is not there is not offered, rather than being offered and
        failing.
      </Note>
    </div>
  );
}

/**
 * 02D — two accounts on one host.
 *
 * The account is chosen by which one can see the repository, not by a
 * preference. When both can, dkgh asks — once, per repository — because
 * guessing there means an issue filed under a name the reporter did not intend.
 */
function Accounts({ accounts, repo }: { accounts: GhAccount[]; repo?: string }) {
  const byHost = new Map<string, GhAccount[]>();
  for (const a of accounts) byHost.set(a.host, [...(byHost.get(a.host) ?? []), a]);

  return (
    <div className="flex flex-col gap-3">
      {[...byHost.entries()].map(([host, list]) => (
        <div key={host} className="flex flex-col gap-1.5">
          <div className="text-[9.5px] font-bold uppercase tracking-wider"
               style={{ color: 'var(--color-text-muted)' }}>
            Accounts on {host}
          </div>
          <div className="flex flex-col rounded-lg border overflow-hidden"
               style={{ borderColor: 'var(--color-surface-border)' }}>
            {list.map(a => (
              <div key={a.login} className="flex items-center gap-2 px-3 py-2 flex-wrap"
                   style={{ borderTop: '1px solid color-mix(in srgb, var(--color-surface-border) 55%, transparent)' }}>
                {a.active
                  ? <CheckIcon size={11} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                  : <CloseIcon size={11} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />}
                <span className="text-[11.5px] font-semibold"
                      style={{ color: 'var(--color-text-primary)' }}>{a.login}</span>
                {a.active && repo && (
                  <BadgeChipView tone={ACCENT} size="xs">active for {repo}</BadgeChipView>
                )}
                <span className="flex-1" />
                <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  {a.scopes.join(' · ') || 'no scopes reported'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <CalloutView variant="info" title="Chosen by access, not by preference" style={{ margin: 0 }}>
        The account used is the one that can see the repository. When only one can, there is no
        decision to make and no way to get it wrong. When both can — two accounts with access to
        the same public repo — dkgh asks, once, per repository, because guessing there means an
        issue filed under a name the reporter did not intend.
      </CalloutView>

      <Labelled title="Add another account">
        <CodeBlockView code="gh auth login" language="bash" fill showCopyButton accentColor={ACCENT} />
        <Note>gh keeps them side by side; dkgh reads the list and never switches the active one
          on your behalf.</Note>
      </Labelled>
    </div>
  );
}

/**
 * 02E — every command it will ever run.
 *
 * The table comes from the host, beside the code that runs, with a test that
 * fails if an invocation has no row. A hand-written list here would drift the
 * first time somebody added a call and forgot.
 */
function Commands({ rows }: { rows: CommandRow[] }) {
  const [kind, setKind] = useState<'all' | 'read' | 'write'>('all');
  const addToast = useToastStore(s => s.addToast);
  const shown = rows.filter(r => kind === 'all' || r.kind === kind);
  const reads = rows.filter(r => r.kind === 'read').length;
  const writes = rows.filter(r => r.kind === 'write').length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-[7px] flex-wrap">
        <TogglePillView accentColor={ACCENT} active={kind === 'all'} onClick={() => setKind('all')}>
          All
        </TogglePillView>
        <TogglePillView accentColor={ACCENT} active={kind === 'read'} count={reads}
                        onClick={() => setKind('read')}>
          Reads
        </TogglePillView>
        <TogglePillView accentColor={ACCENT} active={kind === 'write'} count={writes}
                        onClick={() => setKind('write')}>
          Writes
        </TogglePillView>
        <span className="flex-1" />
        <ButtonView size="sm" variant="ghost" accentColor={ACCENT} iconLeft={<CopyIcon size={11} />}
                    onClick={() => {
                      navigator.clipboard?.writeText(
                        rows.map(r => `${r.kind.toUpperCase().padEnd(5)} ${r.command}  — ${r.when}`).join('\n'));
                      addToast({ type: 'success', message: 'Command list copied' });
                    }}>
          Copy the list
        </ButtonView>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              {['Command', 'When', 'Kind', ''].map(h => (
                <th key={h} className="text-left px-2.5 py-1.5 text-[9.5px] font-semibold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-surface-border)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.command}>
                <td className="px-2.5 py-1.5 font-mono" style={{ ...cell(), color: 'var(--color-text-primary)' }}>
                  {r.command}
                </td>
                <td className="px-2.5 py-1.5" style={cell()}>{r.when}</td>
                <td className="px-2.5 py-1.5 whitespace-nowrap" style={cell()}>
                  <BadgeChipView tone={r.kind === 'write' ? 'var(--color-warning)' : 'var(--color-text-muted)'}
                                 size="xs">
                    {r.kind}
                  </BadgeChipView>
                </td>
                <td className="px-2.5 py-1.5 whitespace-nowrap" style={cell()}>
                  {/* A list that mixed what runs today with what is planned would
                      be the same kind of lie as one that was simply wrong. */}
                  {!r.live && (
                    <BadgeChipView tone="var(--color-text-muted)" size="xs">not built yet</BadgeChipView>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CalloutView variant="tip" title="Every write is preceded by a screen showing it"
                   style={{ margin: 0 }}>
        There is no row here that can happen without you having read it first. The command shown
        and the command run come out of one function, so a confirmation that displays one thing
        and runs another is not something this code can express.
      </CalloutView>

      <CalloutView variant="info" title="What is not on this list" style={{ margin: 0 }}>
        <code>gh auth token</code>, ever. There is no code path in dkgh that reads your
        credential — the whole reason it shells out to gh rather than calling the API itself is
        that the token stays in the OS keychain where gh put it. A test asserts this.
      </CalloutView>
    </div>
  );
}

// ── small shared bits ───────────────────────────────────────────────────────

function cell() {
  return {
    borderBottom: '1px solid color-mix(in srgb, var(--color-surface-border) 55%, transparent)',
    color: 'var(--color-text-secondary)',
    verticalAlign: 'top' as const,
  };
}

function Labelled({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[9.5px] font-bold uppercase tracking-wider"
           style={{ color: 'var(--color-text-muted)' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
      {children}
    </div>
  );
}
