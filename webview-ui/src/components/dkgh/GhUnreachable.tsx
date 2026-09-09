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
import { ButtonView, CalloutView, CodeBlockView, EmptyStateView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';
import { RefreshIcon, CheckIcon, CloseIcon, CopyIcon, TerminalIcon, WarningTriangleIcon } from '../../icons';
import { ACCENT } from './types';

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
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto px-6 py-8 flex flex-col items-center" style={{ maxWidth: 640 }}>
        <EmptyStateView
          variant="medallion"
          accentColor="var(--color-error)"
          icon={<WarningTriangleIcon size={26} />}
          title="gh cannot reach github.com"
          message={
            'The binary is fine and you are signed in. '
            + (data?.timedOut
              ? 'The request timed out rather than being refused, which on a corporate machine almost always means a proxy.'
              : 'The request did not get through.')
          }
          compact
        />

        {/* What we tried — verbatim, because a verdict without a transcript is not one */}
        <div className="w-full mt-4 rounded-lg border overflow-hidden"
             style={{ borderColor: 'var(--color-surface-border)', background: 'var(--color-panel)' }}>
          <div className="px-3 py-1.5 text-[9.5px] font-bold uppercase tracking-wider"
               style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-surface-border)' }}>
            What we tried
          </div>
          {(data?.steps ?? []).map(s => (
            <div key={s.command} className="px-3 py-2 flex flex-col gap-1"
                 style={{ borderTop: '1px solid color-mix(in srgb, var(--color-surface-border) 55%, transparent)' }}>
              <div className="flex items-center gap-2">
                {s.ok
                  ? <CheckIcon size={11} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                  : <CloseIcon size={11} style={{ color: 'var(--color-error)', flexShrink: 0 }} />}
                <code className="text-[10.5px]" style={{ color: 'var(--color-text-primary)' }}>
                  $ {s.command}
                </code>
                <span className="flex-1" />
                <span className="text-[9.5px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  {s.ms}ms
                </span>
              </div>
              {s.output && (
                <pre className="text-[10px] m-0 whitespace-pre-wrap"
                     style={{ color: s.ok ? 'var(--color-text-muted)' : 'var(--color-error)',
                              overflowWrap: 'anywhere' }}>
                  {s.output}
                </pre>
              )}
            </div>
          ))}
          {running && (
            <div className="px-3 py-2 text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
              running…
            </div>
          )}
        </div>

        {/* Most likely: a proxy */}
        <div className="w-full mt-3 flex flex-col gap-2">
          <div className="text-[9.5px] font-bold uppercase tracking-wider"
               style={{ color: 'var(--color-text-muted)' }}>
            Most likely: a proxy
          </div>
          <CodeBlockView
            code={`gh config set http_proxy ${data?.envProxy ?? 'http://proxy.example.internal:8080'}`}
            language="bash" fill showCopyButton accentColor={ACCENT}
          />
          {data?.envProxy ? (
            <CalloutView variant="warning" title="A proxy is set in your environment"
                         style={{ margin: 0 }}>
              <span className="font-mono">{data.envProxy}</span> — but gh is not using it. The
              editor's extension host does not inherit your shell profile, so a proxy exported
              in <code>.bashrc</code> or <code>.zshrc</code> never reaches it. The command above
              writes it into gh's own config, where it will be read every time.
            </CalloutView>
          ) : (
            <CalloutView variant="info" title="No proxy in this environment" style={{ margin: 0 }}>
              If your network needs one, the command above is where it goes. Replace the address
              with whatever your organisation uses.
            </CalloutView>
          )}
          <CalloutView variant="info" title="Or a blocked host" style={{ margin: 0 }}>
            Some networks allow <code>github.com</code> and block <code>api.github.com</code>.
            dkgh only uses the API, so that configuration looks like a total outage from here
            even though the website loads.
          </CalloutView>
          <CalloutView variant="tip" title="dkgh does not configure your proxy for you"
                       style={{ margin: 0 }}>
            Writing a proxy address into your gh config changes a tool you use outside Daakia.
            It is one command and you can read it, so it is yours to run.
          </CalloutView>
        </div>

        <div className="flex gap-2 justify-center flex-wrap mt-4">
          <ButtonView size="md" variant="primary" accentColor={ACCENT}
                      iconLeft={<RefreshIcon size={12} />} onClick={onRetry}>
            {running ? 'Trying…' : 'Try again'}
          </ButtonView>
          <ButtonView size="md" accentColor="var(--color-text-muted)"
                      iconLeft={<CopyIcon size={12} />} onClick={copy}>
            Copy the diagnostics
          </ButtonView>
          <ButtonView size="md" accentColor="var(--color-text-muted)"
                      iconLeft={<TerminalIcon size={12} />}
                      onClick={() => postMsg({ type: 'terminal:open' })}>
            Open a terminal here
          </ButtonView>
          {onBack && (
            <ButtonView size="md" accentColor="var(--color-text-muted)" onClick={onBack}>
              Back
            </ButtonView>
          )}
        </div>
      </div>
    </div>
  );
}
