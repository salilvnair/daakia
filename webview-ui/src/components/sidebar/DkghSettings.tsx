/**
 * Where gh is, and what it can currently do.
 *
 * Two jobs. The first is a path field, for the machine where gh is installed
 * somewhere unusual or not on PATH at all — which is the common case on a
 * locked-down laptop where somebody unpacked a zip.
 *
 * The second is a status readout, because the questions people ask about this
 * feature are all answered by the same probe: is gh here, which one, am I
 * signed in, and which scopes do I have. Showing them together means "why is my
 * roadmap empty" has a visible answer rather than needing a support thread.
 */
import { useEffect, useState } from 'react';
import { ButtonView, TextInputView, CalloutView, CodeBlockView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';
import { RefreshIcon, CheckIcon, WarningTriangleIcon } from '../../icons';

const ACCENT = 'var(--color-settings)';

interface GhAccount { host: string; login: string; active: boolean; scopes: string[] }
interface GhEnv {
  present: boolean;
  binary?: string;
  version?: { version?: string; raw: string };
  capabilities?: { project: boolean; issueJson: boolean; searchIssues: boolean };
  auth?: { loggedIn: boolean; accounts: GhAccount[]; hosts: string[] };
  platform: string;
  triedPaths?: string[];
}

/** The scopes dkgh actually asks about, and what each one buys. */
const SCOPES: { name: string; buys: string; required: boolean }[] = [
  { name: 'repo',         buys: 'Reading issues, and creating them', required: true },
  { name: 'read:project', buys: 'Status, Priority, Start and ETA',   required: false },
  { name: 'project',      buys: 'Dragging a card, editing a date',   required: false },
  { name: 'read:org',     buys: 'Team names in the assignee filter', required: false },
];

function hasScope(account: GhAccount | undefined, scope: string): boolean {
  if (!account) return false;
  if (account.scopes.includes(scope)) return true;
  /* GitHub grants the narrower scope with the wider one. Treating them as
     unrelated strings is how a board with write access decides it cannot read. */
  if (scope === 'read:project') return account.scopes.includes('project');
  if (scope.startsWith('read:') && account.scopes.includes(scope.slice(5))) return true;
  return false;
}

export function DkghSettings() {
  const [env, setEnv] = useState<GhEnv | null>(null);
  const [configuredPath, setConfiguredPath] = useState('');
  const [envOverride, setEnvOverride] = useState<string | undefined>();
  const [draft, setDraft] = useState('');
  const [checking, setChecking] = useState(true);
  const [pathError, setPathError] = useState('');
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'dkgh:probe:result') {
        setEnv(msg.env as GhEnv);
        const saved = (msg.configuredPath as string) || '';
        setConfiguredPath(saved);
        setDraft(d => (d ? d : saved));
        setEnvOverride(msg.envOverride as string | undefined);
        setChecking(false);
      }
      if (msg.type === 'dkgh:setPath:result') {
        if (msg.ok) {
          setPathError('');
          addToast({
            type: 'success',
            message: msg.cleared ? 'Cleared — gh will be found automatically' : `Using gh ${msg.version ?? ''}`.trim(),
          });
        } else {
          /* Not saved: a path that does not run is a typo, not a preference. */
          setPathError(String(msg.error ?? 'That path did not work.'));
        }
      }
    };
    window.addEventListener('message', handler);
    postMsg({ type: 'dkgh:probe' });
    return () => window.removeEventListener('message', handler);
  }, [addToast]);

  const recheck = () => { setChecking(true); postMsg({ type: 'dkgh:recheck' }); };
  const save = () => { setPathError(''); postMsg({ type: 'dkgh:setPath', path: draft.trim() }); };

  const account = env?.auth?.accounts.find(a => a.active) ?? env?.auth?.accounts[0];

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

      {/* ── Where gh is ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <div>
          <h3 className="text-[13px] font-semibold m-0" style={{ color: 'var(--color-text-primary)' }}>
            GitHub CLI
          </h3>
          <p className="text-[11px] m-0 mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            dkgh drives the official <code>gh</code> command, so your GitHub credential stays in
            the OS keychain and never reaches Daakia.
          </p>
        </div>

        {/*
          The environment wins, and says so. An env var quietly outranked by a
          saved setting — or the reverse — is the kind of thing somebody debugs
          for an hour, so whichever is in force is stated rather than implied.
        */}
        {envOverride && (
          <CalloutView variant="warning" title="DAAKIA_GH is set" style={{ margin: 0 }}>
            It is being used, and the path below is ignored for this session.
            <span className="font-mono block mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {envOverride}
            </span>
          </CalloutView>
        )}

        <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Path to gh <span style={{ color: 'var(--color-text-muted)' }}>— leave empty to find it automatically</span>
        </label>
        <div className="flex gap-2 items-start">
          <TextInputView
            value={draft}
            onChange={e => { setDraft(e.target.value); setPathError(''); }}
            placeholder={env?.binary && !configuredPath ? env.binary : 'C:\\Program Files\\GitHub CLI\\gh.exe'}
            size="md"
            accentColor={pathError ? 'var(--color-error)' : ACCENT}
            style={{ flex: 1, fontFamily: 'monospace' }}
          />
          <ButtonView size="md" variant="primary" accentColor={ACCENT} onClick={save}>
            {draft.trim() ? 'Use this' : 'Clear'}
          </ButtonView>
        </div>
        {pathError && (
          <p className="text-[10.5px] m-0" style={{ color: 'var(--color-error)' }}>{pathError}</p>
        )}
        <p className="text-[10.5px] m-0" style={{ color: 'var(--color-text-muted)' }}>
          Checked by running it, not by its name. Order of precedence:
          {' '}<code>DAAKIA_GH</code>, then this setting, then PATH and the usual install locations.
        </p>
      </section>

      {/* ── What it can do ──────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-semibold m-0" style={{ color: 'var(--color-text-primary)' }}>Status</h3>
          <span className="flex-1" />
          <ButtonView size="sm" variant="ghost" accentColor={ACCENT}
                      iconLeft={<RefreshIcon size={11} />} onClick={recheck}>
            {checking ? 'Checking…' : 'Check again'}
          </ButtonView>
        </div>

        {!env ? (
          <p className="text-[11px] m-0" style={{ color: 'var(--color-text-muted)' }}>Checking…</p>
        ) : !env.present ? (
          <CalloutView variant="danger" title="Not found" style={{ margin: 0 }}>
            <span className="font-mono block" style={{ color: 'var(--color-text-muted)' }}>
              Looked in: {env.triedPaths?.join(', ')}
            </span>
            Install it, or set the path above.
          </CalloutView>
        ) : (
          <div className="flex flex-col gap-2">
            <Row label="Binary" value={env.binary} mono />
            <Row label="Version" value={env.version?.version ?? env.version?.raw} mono />
            <Row
              label="Signed in"
              value={env.auth?.loggedIn ? `${account?.login} on ${account?.host}` : 'no'}
              tone={env.auth?.loggedIn ? 'ok' : 'warn'}
            />

            {!env.auth?.loggedIn ? (
              <CommandHint
                text="gh auth login --hostname github.com --git-protocol ssh --scopes read:project --web"
                note="Opens your browser. The credential goes to the OS keychain, never to Daakia."
              />
            ) : (
              <div className="flex flex-col gap-1 mt-1">
                <div className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Scopes</div>
                {SCOPES.map(s => {
                  const have = hasScope(account, s.name);
                  return (
                    <div key={s.name} className="flex items-center gap-2 text-[11px]">
                      {have
                        ? <CheckIcon size={11} style={{ color: 'var(--color-success)' }} />
                        : <WarningTriangleIcon size={11} style={{ color: s.required ? 'var(--color-error)' : 'var(--color-text-muted)' }} />}
                      <code style={{ color: have ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{s.name}</code>
                      <span style={{ color: 'var(--color-text-muted)' }}>{s.buys}</span>
                    </div>
                  );
                })}
                {!hasScope(account, 'read:project') && (
                  <CommandHint
                    text="gh auth refresh -s read:project"
                    note="Adds the scope in place — keeps your account, your protocol and your existing scopes. Without it the roadmap and the date columns stay empty."
                  />
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, mono, tone }: {
  label: string; value?: string; mono?: boolean; tone?: 'ok' | 'warn';
}) {
  return (
    <div className="flex items-baseline gap-2 text-[11px]">
      <span style={{ color: 'var(--color-text-muted)', width: 68, flexShrink: 0 }}>{label}</span>
      <span style={{
        color: tone === 'warn' ? 'var(--color-warning)' : tone === 'ok' ? 'var(--color-success)' : 'var(--color-text-primary)',
        fontFamily: mono ? 'monospace' : undefined,
        wordBreak: 'break-all',
      }}>
        {value ?? '—'}
      </span>
    </div>
  );
}

/**
 * A command to run, with a copy button.
 *
 * Never a button that runs it: `gh auth login` is interactive, opens a browser
 * and asks for a one-time code, and a credential flow is not something a
 * settings page should be driving on somebody's behalf.
 */
function CommandHint({ text, note }: { text: string; note: string }) {
  return (
    <div className="flex flex-col gap-1.5 mt-1">
      <CodeBlockView code={text} language="bash" fill showCopyButton accentColor={ACCENT} />
      <p className="text-[10px] m-0" style={{ color: 'var(--color-text-muted)' }}>{note}</p>
    </div>
  );
}

export default DkghSettings;
