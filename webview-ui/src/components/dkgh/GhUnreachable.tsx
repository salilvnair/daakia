/**
 * Screen 01D — gh works, the network does not.
 *
 * Installed, signed in, and every call times out. On a corporate machine this
 * is almost always a proxy, and it is `gh`'s configuration to fix — not
 * something dkgh should paper over with a retry.
 *
 * The transcript is the point. A timeout with no transcript is
 * indistinguishable from a bug in Daakia, and the person who has to fix the
 * proxy is usually not the person looking at the screen — "Copy the
 * diagnostics" is what gets pasted into a ticket for whoever owns it.
 *
 * dkgh does not configure your proxy for you. Writing a proxy address into
 * somebody's gh config is a change to a tool they use outside Daakia, and it is
 * one command they can read. We show it; they run it.
 */
import { useEffect, useState } from 'react';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';
import { Ico } from './GhIcons';
import {
  GhActions, GhButton, GhCommand, GhEmpty, GhLede, GhNote, GhPrimary, GhTerminalButton,
} from './GhShell';

interface Step { command: string; ok: boolean; output: string; ms: number }
export interface Reachability {
  reachable: boolean;
  timedOut: boolean;
  steps: Step[];
  envProxy?: string;
}

/** Ask the host to run the two diagnostic calls. */
export function diagnose() { postMsg({ type: 'dkgh:diagnose' }); }

export function useReachability(): { data: Reachability | null; running: boolean } {
  const [data, setData] = useState<Reachability | null>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'dkgh:diagnose:loading') { setRunning(true); return; }
      if (msg.type !== 'dkgh:diagnose:result') return;
      setRunning(false);
      setData(msg as unknown as Reachability);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);
  return { data, running };
}

export function GhUnreachable({ account, data, running, onRetry, onBack }: {
  account?: string;
  data: Reachability | null;
  running: boolean;
  onRetry: () => void;
  onBack?: () => void;
}) {
  const addToast = useToastStore(s => s.addToast);

  const transcript = [
    '# dkgh diagnostics',
    account ? `# signed in as ${account}` : '',
    ...(data?.steps ?? []).flatMap(s => [
      `$ ${s.command}    (${s.ms}ms)`,
      `${s.ok ? 'ok' : 'FAILED'}: ${s.output || '(no output)'}`,
      '',
    ]),
    data?.envProxy ? `# environment proxy: ${data.envProxy}` : '# no proxy in the environment',
  ].filter(Boolean).join('\n');

  const copy = () => {
    navigator.clipboard?.writeText(transcript);
    addToast({ type: 'success', message: 'Diagnostics copied' });
  };

  return (
    <GhEmpty icon="warn" title="gh cannot reach github.com">
      <GhLede>
        The binary is fine and you are signed in.{' '}
        {data?.timedOut
          ? 'The request timed out rather than being refused, which on a corporate machine almost always means a proxy.'
          : 'The request did not get through.'}
      </GhLede>

      <div className="opts">
        {/* What we tried — verbatim, because a verdict without a transcript is not one */}
        <div className="opt">
          <div className="fl">What we tried</div>
          {(data?.steps ?? []).map(s => (
            <div key={s.command} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Ico name={s.ok ? 'check' : 'x'}
                     style={{ color: s.ok ? 'var(--dk-green)' : 'var(--dk-red)', flexShrink: 0 }} />
                <code>$ {s.command}</code>
                <span className="sp" style={{ flex: 1 }} />
                <span className="n" style={{ fontFamily: 'var(--mono)', fontSize: 11.4,
                                             color: 'var(--dk-faint)' }}>
                  {s.ms}ms
                </span>
              </div>
              {s.output && (
                <pre className="code" style={{ color: s.ok ? 'var(--dk-faint)' : 'var(--dk-red)' }}>
                  {s.output}
                </pre>
              )}
            </div>
          ))}
          {running && <div className="sub">running…</div>}
        </div>

        {/* Most likely: a proxy */}
        <div className="opt pick">
          <div className="oh">
            <Ico name="term" style={{ color: 'var(--dk-gh)' }} />
            Most likely: a proxy
          </div>
          <GhCommand
            prompt="$"
            text={`gh config set http_proxy ${data?.envProxy ?? 'http://proxy.example.internal:8080'}`}
          />
          <div className="sub">
            {data?.envProxy ? (
              <>
                <code>{data.envProxy}</code> is set in your environment — but gh is not using
                it. The editor&rsquo;s extension host does not inherit your shell profile, so a
                proxy exported in <code>.bashrc</code> or <code>.zshrc</code> never reaches it.
                The command above writes it into gh&rsquo;s own config, where it will be read
                every time.
              </>
            ) : (
              <>
                There is no proxy in this environment. If your network needs one, the command
                above is where it goes — replace the address with whatever your organisation
                uses.
              </>
            )}
          </div>
        </div>
      </div>

      <GhNote title="Or a blocked host" icon="warn">
        Some networks allow <code>github.com</code> and block <code>api.github.com</code>.
        dkgh only uses the API, so that configuration looks like a total outage from here
        even though the website loads.
      </GhNote>

      <GhNote title="dkgh does not configure your proxy for you">
        Writing a proxy address into your gh config changes a tool you use outside Daakia.
        It is one command and you can read it, so it is yours to run.
      </GhNote>

      <GhActions>
        <GhPrimary icon="refresh" onClick={onRetry}>
          {running ? 'Trying…' : 'Try again'}
        </GhPrimary>
        <GhButton icon="copy" onClick={copy}>Copy the diagnostics</GhButton>
        <GhTerminalButton />
        {onBack && <GhButton onClick={onBack}>Back</GhButton>}
      </GhActions>
    </GhEmpty>
  );
}
