/**
 * `kubectl_run` — Daakia AI reading the cluster the user is looking at.
 *
 * The model asks for a kubectl command in words it already knows ("get pods
 * -o wide", "describe pod zp-backend-…", "rollout status deploy/zp-ui"); this
 * decides whether it may run, pins it to the context and namespace on screen,
 * runs it through the same `run()` every dk8s call goes through (so it lands
 * in the Commands audit), and hands back the output — masked, capped, and
 * with the watched pods it mentions picked out so the card can link to them.
 *
 * ── What it will and will not do ──
 *
 * Reads run. Anything that changes the cluster — delete, scale, apply, exec,
 * rollout restart — is never run: it comes back as a proposal the card shows
 * with a Copy button, and the model is told to say so. An assistant that can
 * be talked into `delete` is not one anybody should leave a cluster open to.
 *
 * The command is parsed, never passed to a shell: no pipes, no `;`, no `$()`.
 * The context is always the one on screen; `--context`, `--kubeconfig`,
 * `--token`, `--as` and friends are refused rather than stripped, so a
 * command never silently means something other than what it said.
 */
import type { AiToolDef } from '../ai-types';
import { maskForModel } from './dk8s-search';

export const KUBECTL_RUN_TOOL: AiToolDef = {
  id: 'kubectl_run',
  type: 'function',
  function: {
    name: 'kubectl_run',
    description:
      'Run a READ-ONLY kubectl command against the cluster the user is watching in dk8s and get its output. '
      + 'Use it to answer questions about the state of pods, deployments, services, events, resource usage, rollouts '
      + 'and configuration: get, describe, logs, top, events, explain, rollout status/history, auth can-i. '
      + 'The context and namespace are filled in for you. Commands that change the cluster (delete, scale, apply, '
      + 'patch, edit, exec, rollout restart/undo, cordon, drain…) are NOT run — they come back as a proposal the user '
      + 'can copy and run themselves; say so plainly. No pipes or shell syntax.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The kubectl arguments, with or without the leading "kubectl", e.g. "get pods -o wide", '
            + '"describe deploy zp-backend", "logs zp-ui-5dff4b-hqjcc --tail=100", "top pods", "get events --sort-by=.lastTimestamp".',
        },
        why: {
          type: 'string',
          description: 'One short sentence, shown to the user, on what this command will tell them.',
        },
      },
      required: ['command'],
    },
  },
};

export interface KubectlScope {
  context: string;
  namespace: string;
  /** The pods on screen, for linking the ones the output names. */
  pods: string[];
}

export interface KubectlRunResult {
  kind: 'kubectl';
  /** Exactly what was (or would be) run, `kubectl` included — for the card and for copying. */
  command: string;
  why?: string;
  verb: string;
  /** Run and finished. */
  ok: boolean;
  code: number | null;
  /** stdout, masked and capped; stderr appended when it has something to say. */
  output: string;
  truncated: boolean;
  elapsedMs: number;
  /** Why it was not run. With `proposal`, it is the user's to run; without, it is refused. */
  refused?: string;
  proposal?: boolean;
  context: string;
  namespace: string;
  /** Watched pods the output names — the card links each to dk8s. */
  links: { pod: string; context: string; namespace: string }[];
}

// ── Reading the command ────────────────────────────────────────────────────

/** Split like a shell would for plain words and quotes — and refuse the rest. */
export function tokenize(input: string): string[] | { error: string } {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | undefined;
  let has = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = undefined;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; has = true; continue; }
    if (/\s/.test(ch)) {
      if (has || cur) { out.push(cur); cur = ''; has = false; }
      continue;
    }
    if ('|;&<>`'.includes(ch) || (ch === '$' && input[i + 1] === '(')) {
      return { error: `"${ch}" is shell syntax — this runs one kubectl command, not a shell.` };
    }
    cur += ch; has = true;
  }
  if (quote) return { error: 'An opening quote was never closed.' };
  if (has || cur) out.push(cur);
  return out;
}

const READ_VERBS = new Set([
  'get', 'describe', 'logs', 'top', 'events', 'explain', 'api-resources', 'api-versions', 'version', 'cluster-info',
]);
const READ_SUBVERBS: Record<string, Set<string>> = {
  rollout: new Set(['status', 'history']),
  auth: new Set(['can-i', 'whoami']),
};
/** Never, in any form: they would point the command somewhere other than the screen. */
const FORBIDDEN_FLAGS = ['--context', '--kubeconfig', '--server', '-s', '--token', '--as', '--as-group', '--as-uid',
  '--user', '--cluster', '--username', '--password', '--client-key', '--client-certificate', '--certificate-authority'];
const NAMESPACE_FLAGS = ['-n', '--namespace', '-A', '--all-namespaces'];

function flagName(tok: string): string {
  return tok.split('=')[0];
}

export type Plan =
  | { run: true; args: string[]; verb: string }
  | { run: false; verb: string; refused: string; proposal: boolean; display: string[] };

/**
 * A suggested command's `--context`, dropped when it names the context on
 * screen — the one it would be pinned to anyway. Any other context stays, and
 * `planKubectl` refuses it: Run never reaches a cluster the user is not
 * looking at.
 */
export function dropOwnContext(command: string, context: string): string {
  const esc = context.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return command.trim().replace(/^\$\s+/, '')
    .replace(new RegExp(`\\s--context(?:=|\\s+)(['"]?)${esc}\\1(?=\\s|$)`, 'g'), '');
}

/** Decide what, if anything, runs — and with which context and namespace. */
export function planKubectl(command: string, scope: KubectlScope): Plan {
  const tokens = tokenize(command.trim().replace(/^kubectl\s+/, ''));
  if (!Array.isArray(tokens)) return { run: false, verb: '', refused: tokens.error, proposal: false, display: [] };
  if (!tokens.length) return { run: false, verb: '', refused: 'No command was given.', proposal: false, display: [] };

  for (const t of tokens) {
    if (FORBIDDEN_FLAGS.includes(flagName(t))) {
      return { run: false, verb: '', refused: `${flagName(t)} is not allowed — commands run against the context on screen.`, proposal: false, display: tokens };
    }
  }

  const words = tokens.filter(t => !t.startsWith('-'));
  const verb = words[0] ?? '';
  const sub = words[1] ?? '';
  const display = [...tokens];

  const readOnly = READ_VERBS.has(verb) || (READ_SUBVERBS[verb]?.has(sub) ?? false);
  if (!readOnly) {
    return {
      run: false, verb, proposal: true, display: withScope(display, scope),
      refused: `"${verb}${READ_SUBVERBS[verb] ? ` ${sub}` : ''}" changes the cluster or opens a session, so Daakia AI does not run it. It is here to copy and run yourself.`,
    };
  }

  if (tokens.some(t => ['-f', '--follow', '-w', '--watch', '--watch-only'].includes(flagName(t)))) {
    return { run: false, verb, proposal: false, display, refused: 'Following or watching never ends, so it cannot be answered — ask for a snapshot instead.' };
  }
  if (verb === 'cluster-info' && sub === 'dump') {
    return { run: false, verb, proposal: false, display, refused: 'cluster-info dump pulls every log in the cluster — too much to read here.' };
  }

  /* A secret's values do not leave the cluster through a chat. Its name, type and key sizes (get, describe) do. */
  const namesSecret = words.some(w => /^secrets?($|\/)/i.test(w) || /^secrets?,/i.test(w));
  const dumps = tokens.some((t, i) => {
    const f = flagName(t);
    const val = t.includes('=') ? t.split('=')[1] : tokens[i + 1] ?? '';
    return (f === '-o' || f === '--output') && /^(ya?ml|json|jsonpath|go-template|custom-columns)/i.test(val);
  }) || tokens.some(t => /^-o(ya?ml|json|jsonpath|go-template)/i.test(t));
  if (namesSecret && dumps) {
    return { run: false, verb, proposal: false, display, refused: 'A secret\'s values are not read into a conversation. Its keys and sizes are: `describe secret <name>`.' };
  }

  const args = withScope(tokens, scope);
  if (verb === 'logs' && !tokens.some(t => ['--tail', '--since', '--since-time'].includes(flagName(t)))) {
    args.push('--tail=200');
  }
  return { run: true, args, verb };
}

/** The context always; the namespace unless the command names one (or all). */
function withScope(tokens: string[], scope: KubectlScope): string[] {
  const hasNs = tokens.some(t => NAMESPACE_FLAGS.includes(flagName(t)));
  return ['--context', scope.context, ...(hasNs || !scope.namespace ? [] : ['-n', scope.namespace]), ...tokens];
}

/** Quote an argument only when it needs it, so the command reads as typed. */
export function displayCommand(args: string[]): string {
  return ['kubectl', ...args.map(a => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`))].join(' ');
}

// ── Running it ─────────────────────────────────────────────────────────────

const CARD_CAP = 60_000;
const MODEL_CAP = 12_000;

export interface KubectlDeps {
  scope: KubectlScope;
  run: (args: string[], opts: { timeoutMs: number; maxBuffer: number }) =>
    Promise<{ ok: boolean; code: number | null; stdout: string; stderr: string; failure?: string }>;
}

export async function runKubectlTool(
  input: { command?: string; why?: string },
  deps: KubectlDeps,
): Promise<KubectlRunResult> {
  const started = Date.now();
  const { scope } = deps;
  const plan = planKubectl(input.command ?? '', scope);
  const base = {
    kind: 'kubectl' as const, why: input.why?.trim() || undefined,
    context: scope.context, namespace: scope.namespace, links: [] as KubectlRunResult['links'],
  };

  if (!plan.run) {
    return {
      ...base, verb: plan.verb, command: plan.display.length ? displayCommand(plan.display) : `kubectl ${input.command ?? ''}`.trim(),
      ok: false, code: null, output: '', truncated: false, elapsedMs: 0,
      refused: plan.refused, proposal: plan.proposal,
    };
  }

  const res = await deps.run(plan.args, { timeoutMs: 20_000, maxBuffer: 5 * 1024 * 1024 });
  const raw = [res.stdout.trimEnd(), res.ok ? '' : (res.stderr || res.failure || '').trim()].filter(Boolean).join('\n');
  const masked = maskForModel(raw);
  const truncated = masked.length > CARD_CAP;
  const output = truncated ? `${masked.slice(0, CARD_CAP)}\n… (${(masked.length - CARD_CAP).toLocaleString()} more characters)` : masked;

  const links = scope.pods
    .filter(p => output.includes(p))
    .slice(0, 12)
    .map(pod => ({ pod, context: scope.context, namespace: scope.namespace }));

  return {
    ...base, verb: plan.verb, command: displayCommand(plan.args),
    ok: res.ok, code: res.code, output, truncated, elapsedMs: Date.now() - started, links,
  };
}

/** What the model reads back: the command, how it went, and the output — capped. */
export function kubectlToModelText(r: KubectlRunResult): string {
  if (r.refused) {
    return r.proposal
      ? `NOT RUN — it would change the cluster. Proposed command, shown to the user to run themselves:\n${r.command}\n`
        + 'Tell the user what it would do and that they can copy and run it; do not claim it ran.'
      : `REFUSED: ${r.refused}\nCommand: ${r.command}\nExplain this to the user and offer a read-only alternative if one fits.`;
  }
  const out = r.output.length > MODEL_CAP ? `${r.output.slice(0, MODEL_CAP)}\n… (output continues on the card)` : r.output;
  return [
    `$ ${r.command}`,
    `exit ${r.code ?? '?'} · ${r.elapsedMs}ms${r.ok ? '' : ' · FAILED'}`,
    '',
    out || '(no output)',
    '',
    'The full output is shown to the user as a card under your answer. Explain what it means; quote only the lines that matter.',
  ].join('\n');
}
