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
import { ModalView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';
import { Ico, type IcoName } from './GhIcons';
import { Dk, GhCommand, GhNote } from './GhShell';
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
        <Dk><button type="button" className="btn" onClick={onClose}>Close</button></Dk>
      }
    >
      <Dk>
      <div className="flex flex-col gap-3" style={{ minWidth: 520 }}>
        {/* The board's own sub-tab row, which is what these four are. */}
        <div className="subtabs" style={{ padding: 0 }}>
          {([
            { id: 'scopes', label: 'Scopes', icon: 'lock' as IcoName },
            { id: 'hosts', label: 'Hosts', icon: 'repo' as IcoName, count: hosts.length },
            { id: 'accounts', label: 'Accounts', icon: 'person' as IcoName, count: accounts.length },
            { id: 'commands', label: 'Commands', icon: 'term' as IcoName, count: commands.length },
          ]).map(t => (
            <button key={t.id} type="button" className={`s${tab === t.id ? ' on' : ''}`}
                    onClick={() => setTab(t.id)}>
              <Ico name={t.icon} />{t.label}
              {t.count !== undefined && t.count > 0 && <span className="cnt">{t.count}</span>}
            </button>
          ))}
        </div>

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
      </Dk>
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
      <div className="tblw prose">
        <table className="tbl">
          <thead>
            <tr>{['Scope', 'Unlocks', 'Without it', ''].map(h => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const have = hasScope(account, r.scope);
              return (
                <tr key={r.scope}>
                  <td className="dt">{r.scope}</td>
                  <td style={{ color: 'var(--dk-text)' }}>{r.unlocks}</td>
                  <td>{r.without}</td>
                  <td>
                    {have
                      ? <span className="chip c-xl">granted</span>
                      : r.need === 'required'
                        ? <span className="chip c-prod">required</span>
                        : r.need === 'on-demand'
                          ? <span className="chip">when needed</span>
                          : <span className="chip">optional</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Labelled title="Add one later">
        <GhCommand text="gh auth refresh --scopes project" prompt="$" />
        <Note>Adds a scope to the existing credential. It does not sign you out and does not
          touch the others.</Note>
      </Labelled>

      <Labelled title="See what you have">
        <GhCommand text="gh auth status" prompt="$" />
        <Note>The same command dkgh runs. The table above is its output, not our record of what
          we asked for.</Note>
      </Labelled>

      <GhNote title="Write access is asked for when it is needed" style={{ margin: 0 }}>
        Never at sign-in. A board that only reads should not have been holding the ability to
        edit somebody&rsquo;s Project since Tuesday — the first drag is what asks, and the
        drag completes once it is granted rather than being thrown away.
      </GhNote>
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
      <div className="opt" style={{ gap: 10 }}>
        {hosts.map(h => {
          const on = accounts.filter(a => a.host === h);
          const enterprise = h !== 'github.com';
          return (
            <div key={h} className="flex flex-col gap-1">
              <div className="oh">
                <span style={{ fontFamily: 'var(--mono)' }}>{h}</span>
                {enterprise && <span className="chip">enterprise</span>}
                {on.some(a => a.active) && <span className="chip c-gh">active</span>}
              </div>
              {on.map(a => (
                <div key={a.login} className="flex items-center gap-2 sub">
                  <span style={{ color: 'var(--dk-muted)' }}>{a.login}</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>
                    {a.scopes.join(' · ') || 'no scopes reported'}
                  </span>
                  {!hasScope(a, 'read:project') && (
                    <span style={{ color: 'var(--dk-amber)' }}>— dates unavailable there</span>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <GhNote title="The host is chosen by the repository" icon="repo" style={{ margin: 0 }}>
        {repo ? <><code>{repo}</code> uses whichever host can see it.</> : 'Whichever host can see it.'}
        {' '}Not by a setting — nobody has to remember to switch, and there is no way to
        accidentally file a work bug with a personal account.
      </GhNote>

      <Labelled title="Signing into an Enterprise host">
        <GhCommand text="gh auth login --hostname git.acme.internal --scopes read:project"
                   prompt="$" />
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
        <Labelled key={host} title={`Accounts on ${host}`}>
          <div className="opt" style={{ gap: 2, padding: 4 }}>
            {list.map(a => (
              <div key={a.login} className="fct" style={{ cursor: 'default' }}>
                <Ico name={a.active ? 'check' : 'x'}
                     style={{ color: a.active ? 'var(--dk-green)' : 'var(--dk-faint)',
                              flexShrink: 0 }} />
                <span style={{ color: 'var(--dk-text)', fontWeight: 600 }}>{a.login}</span>
                {a.active && repo && <span className="chip c-gh">active for {repo}</span>}
                <span className="n">{a.scopes.join(' · ') || 'no scopes reported'}</span>
              </div>
            ))}
          </div>
        </Labelled>
      ))}

      <GhNote title="Chosen by access, not by preference" icon="person" style={{ margin: 0 }}>
        The account used is the one that can see the repository. When only one can, there is no
        decision to make and no way to get it wrong. When both can — two accounts with access
        to the same public repo — dkgh asks, once, per repository, because guessing there
        means an issue filed under a name the reporter did not intend.
      </GhNote>

      <Labelled title="Add another account">
        <GhCommand text="gh auth login" prompt="$" />
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
        <button type="button" className={`pill${kind === 'all' ? ' on' : ''}`}
                onClick={() => setKind('all')}>
          All
        </button>
        <button type="button" className={`pill${kind === 'read' ? ' on' : ''}`}
                onClick={() => setKind('read')}>
          Reads<b>{reads}</b>
        </button>
        <button type="button" className={`pill${kind === 'write' ? ' on' : ''}`}
                onClick={() => setKind('write')}>
          Writes<b>{writes}</b>
        </button>
        <span className="sp" style={{ flex: 1 }} />
        <button
          type="button"
          className="btn"
          onClick={() => {
            navigator.clipboard?.writeText(
              rows.map(r => `${r.kind.toUpperCase().padEnd(5)} ${r.command}  — ${r.when}`).join('\n'));
            addToast({ type: 'success', message: 'Command list copied' });
          }}
        >
          <Ico name="copy" />Copy the list
        </button>
      </div>

      <div className="tblw prose">
        {/*
          Fixed layout, and the widths are declared.

          Auto layout hands the width to whichever column cannot wrap — the
          mono commands — and leaves `When` a three-line ribbon beside a column
          of short strings with room to spare.
        */}
        <table className="tbl" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ width: '44%' }}>Command</th>
              <th style={{ width: '38%' }}>When</th>
              <th style={{ width: '10%' }}>Kind</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.command}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 12,
                             color: 'var(--dk-text)', overflowWrap: 'anywhere' }}>
                  {r.command}
                </td>
                <td>{r.when}</td>
                <td><span className={r.kind === 'write' ? 'chip c-stale' : 'chip'}>{r.kind}</span></td>
                <td>
                  {/* A list that mixed what runs today with what is planned would
                      be the same kind of lie as one that was simply wrong. */}
                  {!r.live && <span className="chip">not built yet</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <GhNote title="Every write is preceded by a screen showing it" icon="check"
              style={{ margin: 0 }}>
        There is no row here that can happen without you having read it first. The command shown
        and the command run come out of one function, so a confirmation that displays one thing
        and runs another is not something this code can express.
      </GhNote>

      <GhNote title="What is not on this list" style={{ margin: 0 }}>
        <code>gh auth token</code>, ever. There is no code path in dkgh that reads your
        credential — the whole reason it shells out to gh rather than calling the API itself
        is that the token stays in the OS keychain where gh put it. A test asserts this.
      </GhNote>
    </div>
  );
}

// ── small shared bits ───────────────────────────────────────────────────────

/** A heading and the thing it names. */
function Labelled({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="fl">{title}</div>
      {children}
    </div>
  );
}

/** The small grey line under a command. */
function Note({ children }: { children: React.ReactNode }) {
  return <div className="sub" style={{ lineHeight: 1.6 }}>{children}</div>;
}
