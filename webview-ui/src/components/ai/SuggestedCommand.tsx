/**
 * A kubectl command the answer suggests — drawn as a command, with Run.
 *
 * An answer that says "worth checking whether the pod is being restarted:
 * ```kubectl get pods …```" used to leave the reader to copy it into a
 * terminal, pick the right context, and come back. Here it is the row the
 * search card draws for what it ran: the command as it WOULD run — context
 * and namespace pinned by the host, so what is on screen is what runs — with
 * Copy and Run. Run goes through the same guard as Daakia AI's own kubectl:
 * reads only, never the watch flags, never a secret's values, into the
 * Commands audit like every dk8s call. A command that would change the
 * cluster is shown as that, with Copy and no Run.
 *
 * The output lands under it in the same card the AI's own runs use.
 */
import { useEffect, useId, useState } from 'react';
import { ButtonView, IconButtonView } from '@salilvnair/dui';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { copyText } from '../../utils/clipboard';
import { useCopyTick, CopyGlyph } from '../shared/CopyTick';
import { KubectlRunCard, type KubectlRunResult } from './KubectlRunCard';

const ACCENT = 'var(--color-ai-accent, #D97757)';
const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';
const BORDER = 'color-mix(in srgb, var(--color-ai-accent, #D97757) 16%, var(--color-surface-border))';

/** What the host says about a command before it runs. */
interface KubectlPlan {
  runnable: boolean;
  /** As it would run: `kubectl --context … -n … get pods …`. */
  command: string;
  refused?: string;
  proposal?: boolean;
  context?: string;
  namespace?: string;
}

// ── Finding them in an answer ──────────────────────────────────────────────

export type AnswerPart = { kind: 'md'; text: string } | { kind: 'cmd'; command: string };

const SHELL = new Set(['', 'bash', 'sh', 'shell', 'console', 'zsh', 'powershell', 'ps', 'ps1', 'cmd', 'kubectl']);
const FENCE = /^```([\w-]*)[ \t]*\n([\s\S]*?)\n```[ \t]*$/gm;

/**
 * An answer split around its kubectl blocks.
 *
 * A fenced block counts when it is a shell block and every command in it is a
 * kubectl command — one row per command. Anything else (a script, a pipe
 * through grep, a YAML manifest) stays a code block: a Run button on half a
 * pipeline would run something other than what the block says.
 */
export function splitKubectlBlocks(text: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let last = 0;
  for (const m of text.matchAll(FENCE)) {
    const commands = kubectlCommands(m[1].toLowerCase(), m[2]);
    if (!commands) continue;
    const before = text.slice(last, m.index);
    if (before.trim()) parts.push({ kind: 'md', text: before });
    for (const command of commands) parts.push({ kind: 'cmd', command });
    last = m.index! + m[0].length;
  }
  const rest = text.slice(last);
  if (rest.trim() || !parts.length) parts.push({ kind: 'md', text: rest });
  return parts;
}

function kubectlCommands(lang: string, body: string): string[] | undefined {
  if (!SHELL.has(lang)) return undefined;
  const lines = body.replace(/\\\r?\n\s*/g, ' ').split(/\r?\n/)
    .map(l => l.trim().replace(/^\$\s+/, ''))
    .filter(l => l && !l.startsWith('#'));
  if (!lines.length || lines.length > 6) return undefined;
  if (!lines.every(l => /^kubectl\s+\S/.test(l) && !/[|;&<>`]|\$\(/.test(l))) return undefined;
  return lines;
}

/** Markdown with its kubectl blocks drawn as commands to run. */
export function AnswerMd({ text }: { text: string }) {
  const parts = splitKubectlBlocks(text);
  if (parts.length === 1 && parts[0].kind === 'md') return <MdViewer content={text} />;
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      {parts.map((p, i) => p.kind === 'md'
        ? <MdViewer key={i} content={p.text} />
        : <SuggestedCommand key={i} command={p.command} />)}
    </div>
  );
}

// ── One command ────────────────────────────────────────────────────────────

/** Ask the host, and hear back on this id only. */
function useHostReply<T>(id: string, onReply: (msg: T) => void) {
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as { type?: string; id?: string };
      if (msg?.type === 'ai:kubectlSuggested' && msg.id === id) onReply(msg as T);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
}

export function SuggestedCommand({ command }: { command: string }) {
  const id = `kc-${useId()}`;
  const [plan, setPlan] = useState<KubectlPlan>();
  const [result, setResult] = useState<KubectlRunResult>();
  const [running, setRunning] = useState(false);
  const { copied, flash } = useCopyTick();

  useHostReply<{ plan?: KubectlPlan; result?: KubectlRunResult }>(id, msg => {
    if (msg.plan) setPlan(msg.plan);
    if (msg.result) { setResult(msg.result); setRunning(false); }
  });
  /* The plan is asked for as soon as the row shows: it is what the row draws. Nothing runs. */
  useEffect(() => { postMsg({ type: 'ai:kubectlSuggest', id, command, mode: 'plan' }); }, [id, command]);

  const run = () => {
    setRunning(true);
    postMsg({ type: 'ai:kubectlSuggest', id, command, mode: 'run' });
  };

  const runButton = (label: string) => (
    <ButtonView variant="primary" size="sm" accentColor={ACCENT} disabled={running}
                iconLeft={<PlayIcon />} onClick={run}
                title={plan?.context ? `Run on ${plan.context} / ${plan.namespace}` : 'Run it'}>
      {running ? 'Running…' : label}
    </ButtonView>
  );

  if (result) return <KubectlRunCard result={result} action={plan?.runnable ? runButton('Run again') : undefined} />;

  const shown = plan?.command ?? command;
  const tone = !plan ? 'var(--color-text-muted)' : plan.runnable ? ACCENT : plan.proposal ? 'var(--color-warning)' : 'var(--color-error)';
  const tag = !plan ? 'KUBECTL' : plan.runnable ? 'READ' : plan.proposal ? 'CHANGES' : 'REFUSED';
  const note = !plan ? 'Checking what it would run…'
    : plan.runnable ? `Read-only · runs on ${plan.context} / ${plan.namespace}`
      : plan.refused ?? '';

  return (
    <div className="dk-embed flex items-start" style={{
      gap: 12, padding: '10px 12px 10px 14px', borderRadius: 12, border: `1px solid ${BORDER}`,
      background: 'color-mix(in srgb, var(--color-ai-accent, #D97757) 2%, var(--color-panel))',
    }}>
      <span className="shrink-0" style={{
        marginTop: 1, padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600, letterSpacing: '.02em',
        background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone,
      }}>
        {tag}
      </span>
      <div className="flex-1 min-w-0">
        <div style={{ fontFamily: MONO, fontSize: 12, lineHeight: '18px', color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          <span style={{ color: 'var(--color-text-muted)', userSelect: 'none' }}>$ </span>{shown}
        </div>
        <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.45, color: plan && !plan.runnable ? tone : 'var(--color-text-muted)' }}>
          {note}
        </div>
      </div>
      <div className="shrink-0 flex items-center" style={{ gap: 6 }}>
        {plan?.runnable && runButton('Run')}
        <IconButtonView
          size="sm"
          tooltip={copied ? 'Copied' : 'Copy command'}
          aria-label="Copy command"
          active={copied}
          activeColor="var(--color-success)"
          icon={<CopyGlyph copied={copied} size={12} />}
          onClick={async () => { if (await copyText(shown)) flash(); }}
        />
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
    </svg>
  );
}
