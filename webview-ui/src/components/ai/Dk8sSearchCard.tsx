/**
 * The answer to "find it in the logs", drawn from what the search found.
 *
 * Two halves on purpose. Above: the model's explanation, which cites lines as
 * [n]. Below: the lines themselves, grouped by pod and thread, drawn from the
 * structured result the host kept — NOT from anything the model wrote. A model
 * can phrase a cause wrongly; it cannot put a line on this card that the search
 * did not return, and every [n] it cites is a line you can see and open.
 *
 * Open in dk8s goes to the place the line lives: a live hit opens the pod's
 * Logs tab with the line highlighted (the same link Copy link makes), an
 * archive hit opens the file inside the pod at that line.
 *
 * Lines are drawn the way the Logs tab draws them — time, level, message —
 * and wrap: a payload line is the one most worth reading, and a card that
 * scrolls sideways hides exactly that one. The same chips sit on the same
 * rows: a payload is a chip that opens as Tree / Pretty / Raw, a line that
 * names anything has `fields`, a stack trace folds its frames — and all of
 * them follow the Logs settings, so the card and the tab never disagree
 * about what a line holds.
 */
import { useMemo, useRef, useState } from 'react';
import { MdViewer } from '../shared/display/MdViewer';
import { useTabsStore } from '../../store/tabs-store';
import { useK8sStore } from '../../store/k8s-store';
import { postMsg } from '../../vscode';
import { podLogLink } from '../k8s/pod-link';
import { copyText } from '../../utils/clipboard';
import { prefill } from './ai-chat-actions';
import { KubectlRunCard, isKubectlResult, type KubectlRunResult } from './KubectlRunCard';
import { ButtonView, IconButtonView, SegmentedControlView, ChipView } from '@salilvnair/dui';
import { useCopyTick, CopyGlyph } from '../shared/CopyTick';
import { findPayload, sentenceWithout, type LogPayload } from '../k8s/log-payload';
import { usePayloadPrefs } from '../k8s/log-payload-prefs';
import { LogPayloadView } from '../k8s/LogPayloadView';
import { LineFieldsView } from '../k8s/LineFieldsView';
import { LogSourceProvider, type LogSource } from '../k8s/log-source';
import { readFields } from '../k8s/field-readers';
import { useFieldReaders } from '../k8s/follow-prefs';
import { ACCENT } from '../k8s/tone';
import type { LogLine, LogLevel } from '../../store/k8s-store';

const DK8S = 'var(--color-ai-accent, #D97757)';
const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';

/* The card's own few surfaces, mixed from the theme so it sits in light and dark. */
const C = {
  border: 'color-mix(in srgb, var(--color-ai-accent, #D97757) 16%, var(--color-surface-border))',
  card: 'color-mix(in srgb, var(--color-ai-accent, #D97757) 2%, var(--color-panel))',
  head: 'color-mix(in srgb, var(--color-ai-accent, #D97757) 6%, var(--color-panel))',
  well: 'var(--dai-well, color-mix(in srgb, black 22%, var(--color-panel)))',
  dim: 'var(--color-text-muted)',
  soft: 'color-mix(in srgb, var(--color-text-primary) 62%, var(--color-panel))',
  err: 'var(--color-error, #ef4444)',
};

type LineRole = 'before' | 'hit' | 'failure' | 'after';

interface ResultLine {
  ts?: number;
  level: string;
  text: string;
  role: LineRole;
  n?: number;
  fileLine?: number;
  /** Context that reads like a failure — often another request's. Tinted, not cited. */
  alarm?: boolean;
  msg?: string;
  logger?: string;
  /** MDC a structured layout carried, masked on the host. */
  fields?: Record<string, string>;
  frames?: string[];
  /** `text` with credentials masked, for a line no layout reads. */
  masked?: string;
}

interface ThreadGroup {
  pod: string;
  namespace: string;
  context: string;
  thread?: string;
  source: 'live' | 'archive';
  file?: string;
  /** The pod's owner — how its replacement is found after a rollout. */
  workload?: string;
  failures: number;
  lines: ResultLine[];
}

interface Dk8sRun {
  kind: 'live' | 'archive';
  pod: string;
  command: string;
  matched: number;
  elapsedMs: number;
  error?: string;
}

export interface Dk8sSearchResult {
  query: string;
  around: number;
  groups: ThreadGroup[];
  scanned: { pods: number; lines: number; archivePods: number; archiveFiles?: number };
  errors: { pod: string; error: string }[];
  truncated: boolean;
  elapsedMs: number;
  runs?: Dk8sRun[];
  liveMs?: number;
  archiveMs?: number;
}

export interface Dk8sSearchPayload {
  type: 'dk8s-search';
  rawText: string;
  /** What the answer's tools returned, in order: log searches, kubectl runs, manual look-ups. */
  results: (Dk8sSearchResult | KubectlRunResult | DocsResult)[];
}

export function isDk8sSearchPayload(p: unknown): p is Dk8sSearchPayload {
  return !!p && typeof p === 'object' && (p as { type?: unknown }).type === 'dk8s-search'
    && Array.isArray((p as { results?: unknown }).results);
}

/** `[3]` in the answer becomes a link to line 3 on the card. */
function linkCitations(text: string): string {
  return text.replace(/\[(\d{1,3})\](?!\()/g, '[[$1]](#dk8s-line-$1)');
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/* Scoped to the card: citations sit up as superscripts, like footnotes. */
const CARD_CSS = `
.dk8s-answer a[href^="#dk8s-line-"] {
  font-size: 10.5px; vertical-align: super; line-height: 0; margin-left: 1px;
  color: ${DK8S}; text-decoration: none; font-weight: 600;
}
.dk8s-answer a[href^="#dk8s-line-"]:hover { text-decoration: underline; }
.dk8s-btn { transition: background-color .12s, border-color .12s, color .12s; }
.dk8s-btn:focus-visible { outline: 2px solid ${DK8S}; outline-offset: 1px; }
.dk8s-ghost:hover { border-color: color-mix(in srgb, var(--color-ai-accent, #D97757) 45%, var(--color-surface-border)) !important; color: var(--color-text-primary) !important; }
.dk8s-fold:hover { color: ${DK8S} !important; }
`;

export function Dk8sSearchCard({ payload, submit }: {
  payload: Dk8sSearchPayload;
  submit?: (text: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  /* Follow-ups come from the last log search; a kubectl run has none of its own. */
  const lastSearch = [...payload.results].reverse()
    .find((r): r is Dk8sSearchResult => !isKubectlResult(r) && !isDocsResult(r));

  /* Citation clicks are handled here rather than followed: a `#` link in a
     webview would try to navigate the frame. Scroll to the line and flash it. */
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a');
    const href = a?.getAttribute('href') ?? '';
    if (!href.startsWith('#dk8s-line-')) return;
    e.preventDefault();
    const target = root.current?.querySelector(`[data-dk8s-line="${href.slice(11)}"]`) as HTMLElement | null;
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.animate?.(
      [{ boxShadow: `inset 0 0 0 1px ${DK8S}` }, { boxShadow: 'inset 0 0 0 1px transparent' }],
      { duration: 1600 },
    );
  };

  return (
    <div ref={root} className="daakia-chat-md flex flex-col gap-3" onClick={onClick}>
      <style>{CARD_CSS}</style>
      {payload.rawText.trim() && (
        <div className="dk8s-answer" style={{ fontSize: 13.5, lineHeight: 1.65 }}>
          <MdViewer content={linkCitations(payload.rawText)} />
        </div>
      )}
      {payload.results.map((r, i) => isDocsResult(r)
        ? null
        : isKubectlResult(r)
          ? <KubectlRunCard key={i} result={r} />
          : <ResultCard key={i} result={r} submit={submit} />)}
      <DocsSources results={payload.results} />
      {submit && lastSearch && (
        <FollowUps result={lastSearch} submit={submit} />
      )}
    </div>
  );
}

// ── Where a Daakia answer came from ────────────────────────────────────────

/** A look-up in the Daakia manual: which sections the answer was read from. */
export interface DocsResult {
  kind: 'docs';
  query: string;
  sources: string[];
}

function isDocsResult(r: unknown): r is DocsResult {
  return !!r && typeof r === 'object' && (r as { kind?: unknown }).kind === 'docs';
}

/**
 * "From the Daakia manual: Mock server › Rules, …" — so an answer about
 * Daakia says what it was read from, and one that found nothing says that.
 */
function DocsSources({ results }: { results: unknown[] }) {
  const docs = results.filter(isDocsResult);
  if (!docs.length) return null;
  const sources = [...new Set(docs.flatMap(d => d.sources))];
  return (
    <div className="flex items-center flex-wrap" style={{ gap: 6, fontSize: 11.5, color: 'var(--color-text-muted)' }}>
      <Svg size={12}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></Svg>
      {sources.length ? (
        <>
          <span>From the Daakia manual:</span>
          {sources.map(s => <ChipView key={s} size="xs" label={s} color={DK8S} />)}
        </>
      ) : (
        <span>The Daakia manual has nothing on “{docs.map(d => d.query).join('”, “')}”.</span>
      )}
    </div>
  );
}

// ── What to ask next ───────────────────────────────────────────────────────

/**
 * The next questions worth asking, built from what the search returned — the
 * failing line's own thread and time, the width it was run at — never from
 * the model's prose. One that needs something only the user knows goes into
 * the composer with a `{placeholder}` instead of being sent.
 */
function FollowUps({ result, submit }: { result: Dk8sSearchResult; submit: (text: string) => void }) {
  const failing = result.groups.find(g => g.failures > 0) ?? result.groups[0];
  const anchor = failing?.lines.find(l => l.role === 'failure') ?? failing?.lines.find(l => l.role === 'hit');
  const at = anchor?.ts !== undefined ? new Date(anchor.ts).toISOString() : undefined;

  const items: { label: string; run: () => void }[] = [];
  if (failing?.thread && at) {
    items.push({
      label: `Follow ${failing.thread} for two more minutes`,
      run: () => submit(`Search for thread ${failing.thread} and show me what it did in the two minutes after ${at}.`),
    });
  }
  if (result.groups.length && result.around < 100) {
    items.push({
      label: 'Show 100 lines each side',
      run: () => submit('Run that search again with 100 lines of the same thread before and after each failure.'),
    });
  }
  if (result.groups.length) {
    items.push({
      label: 'Compare with a request that worked',
      run: () => prefill(`${result.query} failed. Compare it with a request on the same API that worked: {goodId}`),
    });
  } else {
    items.push({
      label: 'Search for something else',
      run: () => prefill(`Nothing matched ${result.query}. Search for {term} instead.`),
    });
  }
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap" style={{ gap: 8 }} aria-label="Follow-up questions">
      {items.map(it => (
        <ButtonView key={it.label} variant="ghost" size="sm" rounded accentColor={DK8S} onClick={it.run}
                    iconLeft={<Svg size={12} stroke={DK8S} sw={2.2}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>}>
          {it.label}
        </ButtonView>
      ))}
    </div>
  );
}

// ── The card ───────────────────────────────────────────────────────────────

function ResultCard({ result, submit }: { result: Dk8sSearchResult; submit?: (text: string) => void }) {
  const failures = result.groups.reduce((n, g) => n + g.failures, 0);
  const pods = new Set(result.groups.map(g => g.pod)).size;
  const sources = new Set(result.groups.map(g => g.source));
  const where = sources.size === 1 && sources.has('archive') ? ' · from the archive'
    : sources.size === 2 ? ' · live and archive' : '';

  /* Pods whose archive was searched — `scanned.archivePods` counts only those
     that had files matching, so an archive that held nothing read as unsearched. */
  const archiveSearched = new Set((result.runs ?? []).filter(r => r.kind === 'archive').map(r => r.pod)).size
    || result.scanned.archivePods;

  const summary = result.groups.length === 0
    ? `nothing matched in ${plural(result.scanned.pods, 'pod')}`
      + (archiveSearched ? ` or their archives` : '')
    : `${plural(failures, 'failure')} · ${plural(result.groups.length, 'thread')} · ${plural(pods, 'pod')}${where}`;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}`, background: C.card }}>
      {/* Header: what was searched, what came back, how wide */}
      <div className="flex items-center gap-3 flex-wrap" style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, background: C.head }}>
        <SearchIcon />
        <span style={{ fontFamily: MONO, fontSize: 12.5, color: DK8S }}>{result.query}</span>
        <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>{summary}</span>
        <span className="flex-1" />
        {submit && result.groups.length > 0 && (
          <span className="flex items-center gap-2">
            <span style={{ fontSize: 11, color: C.dim }}>lines around the failure</span>
            <SegmentedControlView
              testId="dk8s-around"
              size="xs"
              variant="rounded"
              density="compact"
              accentColor={DK8S}
              value={String(result.around)}
              options={[20, 100, 500].map(n => ({ value: String(n), label: `±${n}` }))}
              onChange={v => {
                if (Number(v) !== result.around) {
                  submit(`Run that search again with ${v} lines of the same thread before and after each failure.`);
                }
              }}
            />
          </span>
        )}
      </div>

      {result.groups.length === 0 && (
        <div style={{ padding: '14px 16px', fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          No line in the live logs{archiveSearched ? ' or the archive' : ''} contains{' '}
          <span style={{ fontFamily: MONO, color: DK8S }}>{result.query}</span>.
          {!archiveSearched && ' The archive was not searched — turn it on in Settings → DK8S → Logs to look further back.'}
        </div>
      )}

      <div className="flex flex-col" style={{ padding: result.groups.length ? '4px 0 6px' : 0 }}>
        {result.groups.map((g, i) => <GroupView key={i} group={g} />)}
      </div>

      {result.errors.length > 0 && (
        <div style={{ padding: '6px 16px 8px', fontSize: 11.5, color: 'var(--color-warning)' }}>
          Could not read {result.errors.map(e => `${e.pod} (${e.error})`).join(', ')}.
        </div>
      )}

      <RunsView result={result} />

      <div className="flex items-center gap-3 flex-wrap"
           style={{ padding: '9px 16px', borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.dim }}>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          Searched {plural(result.scanned.pods, 'pod')} live
          {archiveSearched ? ` and the archive on ${plural(archiveSearched, 'pod')}` : ''}
          {archiveSearched && result.scanned.archiveFiles ? ` (${plural(result.scanned.archiveFiles, 'file')} with hits)` : ''}
          {' · '}
          {result.liveMs !== undefined && archiveSearched
            ? `${secs(result.liveMs)} + ${secs(result.archiveMs ?? 0)}`
            : secs(result.elapsedMs)}
          {result.truncated && ' · more threads matched than are shown'}
        </span>
        <span className="flex-1" />
        {result.groups.length > 0 && <span>Every [n] in the answer is one of these lines.</span>}
      </div>
    </div>
  );
}

// ── What ran ───────────────────────────────────────────────────────────────

function RunsView({ result }: { result: Dk8sSearchResult }) {
  const [open, setOpen] = useState(false);
  const runs = result.runs ?? [];
  if (!runs.length) return null;
  const live = runs.filter(r => r.kind === 'live').length;
  const archive = runs.length - live;

  return (
    <div style={{ borderTop: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2" style={{ padding: '6px 10px' }}>
        <ButtonView variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(o => !o)}
                    iconLeft={<span className="inline-flex items-center gap-1.5"><Chevron open={open} /><TerminalIcon /></span>}>
          What ran on the cluster
        </ButtonView>
        <span style={{ fontSize: 11.5, color: C.dim }}>
          {plural(live, 'kubectl logs', 'kubectl logs')}{archive ? ` · ${plural(archive, 'grep in a pod', 'greps in pods')}` : ''}
        </span>
      </div>
      {open && (
        <div style={{ padding: '0 16px 12px' }}>
          <div className="rounded-lg overflow-hidden" style={{ background: C.well, border: `1px solid ${C.border}` }}>
            {runs.map((r, i) => <RunRow key={i} run={r} first={i === 0} />)}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: C.dim, lineHeight: 1.55 }}>
            These are the commands Daakia ran, built by the same code that ran them. Live logs are read
            with <code style={{ fontFamily: MONO }}>kubectl logs</code> and filtered here; the archive is
            searched with one <code style={{ fontFamily: MONO }}>grep</code> inside the pod, so only the matching lines leave the cluster.
          </div>
        </div>
      )}
    </div>
  );
}

function RunRow({ run, first }: { run: Dk8sRun; first: boolean }) {
  const { copied, flash } = useCopyTick();
  return (
    <div className="dk8s-row flex items-start gap-3"
         style={{ padding: '8px 12px', borderTop: first ? 'none' : `1px solid ${C.border}` }}>
      <span className="shrink-0" style={{
        marginTop: 1, padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600, letterSpacing: '.02em',
        background: run.kind === 'live' ? 'color-mix(in srgb, var(--color-ai-accent, #D97757) 14%, transparent)' : 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
        color: run.kind === 'live' ? DK8S : 'var(--color-accent)',
      }}>
        {run.kind === 'live' ? 'LIVE' : 'ARCHIVE'}
      </span>
      <div className="flex-1 min-w-0">
        <div style={{ fontFamily: MONO, fontSize: 11.5, lineHeight: '18px', color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          <span style={{ color: C.dim, userSelect: 'none' }}>$ </span>{run.command}
        </div>
        <div style={{ marginTop: 2, fontSize: 10.5, color: run.error ? 'var(--color-warning)' : C.dim, fontVariantNumeric: 'tabular-nums' }}>
          {run.error ? run.error : `${plural(run.matched, 'match', 'matches')} · ${run.elapsedMs} ms`}
        </div>
      </div>
      <IconButtonView
        size="sm"
        tooltip={copied ? 'Copied' : 'Copy command'}
        aria-label="Copy command"
        active={copied}
        activeColor="var(--color-success)"
        icon={<CopyGlyph copied={copied} size={12} />}
        onClick={async () => { if (await copyText(run.command)) flash(); }}
      />
    </div>
  );
}

// ── One thread ─────────────────────────────────────────────────────────────

/** How many context lines show before "earlier lines" takes over, each side. */
const FOLD = 5;

function GroupView({ group }: { group: ThreadGroup }) {
  const { copied: linkCopied, flash: flashLink } = useCopyTick();
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<{ text: string; tone: 'ok' | 'warn'; pods?: string[] } | undefined>();

  const cited = (l: ResultLine) => l.role === 'hit' || l.role === 'failure';
  const first = group.lines.findIndex(cited);
  let last = -1;
  group.lines.forEach((l, i) => { if (cited(l)) last = i; });

  const { shown, hiddenBefore, hiddenAfter } = useMemo(() => {
    if (expanded || first === -1) return { shown: group.lines, hiddenBefore: 0, hiddenAfter: 0 };
    const from = Math.max(0, first - FOLD);
    const to = Math.min(group.lines.length, last + FOLD + 1);
    return { shown: group.lines.slice(from, to), hiddenBefore: from, hiddenAfter: group.lines.length - to };
  }, [expanded, first, last, group.lines]);

  /* The line to open: the first failure, else the first hit. */
  const anchor = group.lines.find(l => l.role === 'failure') ?? group.lines.find(l => l.role === 'hit');
  const hits = group.lines.filter(l => l.role === 'hit').length;

  /*
    The pod is not on screen any more — usually a rollout replaced it. Say
    which pod and which workload, and offer the workload's pods as they are
    now: they will not hold lines from before the rollout, but they are where
    the same request would be looked for next.
  */
  const podGone = () => {
    const now = group.workload
      ? useK8sStore.getState().pods.filter(p => p.namespace === group.namespace
          && (p.context ?? '') === group.context && p.workload?.name === group.workload)
      : [];
    setStatus({
      tone: 'warn',
      pods: now.map(p => p.name),
      text: `${group.pod} is not being watched any more${group.workload ? ` — ${group.workload} has probably rolled out since` : ''}. `
        + (now.length ? `The lines are still here; ${group.workload}'s pod${now.length === 1 ? ' is' : 's are'} now:`
          : group.workload ? `None of ${group.workload}'s pods are being watched; the lines are still here.`
            : 'The lines are still here.'),
    });
  };

  const open = () => {
    if (!anchor) return;
    const k8s = useK8sStore.getState();
    if (group.source === 'archive' && group.file) {
      /* The file lives inside the pod: the Explorer opens on its folder, with the file picked out. */
      const pod = k8s.pods.find(p => p.name === group.pod && p.namespace === group.namespace && (p.context ?? '') === group.context);
      if (!pod) { podGone(); return; }
      /* Back from the pod returns to this conversation. */
      const from = { kind: 'app' as const, tabId: useTabsStore.getState().activeTabId };
      useTabsStore.getState().openDk8sTab();
      k8s.openExplorerAt({ path: group.file.slice(0, group.file.lastIndexOf('/')) || '/', highlight: group.file });
      k8s.openDetail(pod, { from });
      /* openDetail brings back the tab last read on that pod — the Explorer is asked for after it. */
      useK8sStore.getState().setDetailTab('explorer', { noHistory: true });
      return;
    }
    const from = { kind: 'app' as const, tabId: useTabsStore.getState().activeTabId };
    useTabsStore.getState().openDk8sTab();
    const how = k8s.openPodLink({
      context: group.context, namespace: group.namespace, pod: group.pod,
      ts: anchor.ts, text: anchor.text,
    }, { from });
    if (how === 'no-pod') podGone();
  };

  /* An archive line, at its line number: the file copied out of the pod and opened in an editor. */
  const openAtLine = () => {
    if (!anchor || !group.file) return;
    postMsg({
      type: 'dk8s:openLogFile', file: group.file, line: anchor.fileLine,
      pod: group.pod, namespace: group.namespace, context: group.context,
    });
  };

  const openReplacement = (pod: string) => {
    if (!anchor) return;
    const from = { kind: 'app' as const, tabId: useTabsStore.getState().activeTabId };
    useTabsStore.getState().openDk8sTab();
    useK8sStore.getState().openPodLink({
      context: group.context, namespace: group.namespace, pod, ts: anchor.ts, text: anchor.text,
    }, { from });
  };

  const copyLink = async () => {
    if (!anchor) return;
    const link = podLogLink({ context: group.context, namespace: group.namespace, pod: group.pod, ts: anchor.ts, text: anchor.text });
    if (await copyText(link)) {
      flashLink();
      setStatus({ tone: 'ok', text: 'Link copied — it opens this line in dk8s.' });
      setTimeout(() => setStatus(undefined), 2200);
    }
  };

  const fileName = group.file?.split('/').pop();

  /*
    What the fields box under a line reads. On the Logs tab it counts the
    pod's buffer and Follow filters it; here the buffer is this thread's lines,
    and Follow opens the pod's Logs at this line with that filter on — the one
    place a filter can do what it says.
  */
  const logLines = useMemo(() => group.lines.map((l, i) => asLogLine(l, i, group.thread)), [group.lines, group.thread]);
  const source = useMemo((): LogSource => ({
    ...(useK8sStore.getState() as unknown as LogSource),
    logs: logLines,
    addFieldFilter: f => {
      const k8s = useK8sStore.getState();
      const from = { kind: 'app' as const, tabId: useTabsStore.getState().activeTabId };
      useTabsStore.getState().openDk8sTab();
      const how = k8s.openPodLink({
        context: group.context, namespace: group.namespace, pod: group.pod, ts: anchor?.ts, text: anchor?.text ?? '',
      }, { from });
      if (how === 'no-pod') { podGone(); return; }
      useK8sStore.getState().addFieldFilter(f);
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [logLines, group, anchor]);

  return (
    <div style={{ padding: '10px 16px 8px' }}>
      <div className="flex items-center flex-wrap" style={{ gap: 9, marginBottom: 7 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {group.thread ?? 'thread unknown'}
        </span>
        {group.failures > 0 ? (
          <Badge tone="err">{group.failures === 1 ? 'the failure' : `${group.failures} failures`}</Badge>
        ) : (
          <Badge tone="plain">{hits === 1 ? 'mentions it' : `mentions it ${hits}×`}</Badge>
        )}
        {group.source === 'archive' && <Badge tone="archive">archive</Badge>}
        <span className="truncate" style={{ fontFamily: MONO, fontSize: 11, color: C.dim, minWidth: 0 }}
              title={`${group.context} / ${group.namespace} / ${group.pod}${group.file ? ` · ${group.file}` : ''}`}>
          {group.pod}{fileName ? ` · ${fileName}` : ''}
        </span>
        <span className="flex-1" />
        <ButtonView variant="secondary" size="sm" accentColor={DK8S} color={DK8S} disabled={!anchor}
                    iconLeft={<ExternalIcon />} onClick={open}
                    title={group.source === 'archive' ? "Open the file's folder in the pod's Explorer" : "Open this line in the pod's Logs"}>
          Open in dk8s
        </ButtonView>
        {group.source === 'archive' && group.file && (
          <ButtonView variant="secondary" size="sm" disabled={!anchor} onClick={openAtLine}
                      title="Copy the file out of the pod and open it in an editor at this line">
            At line {anchor?.fileLine ?? ''}
          </ButtonView>
        )}
        {group.source === 'live' && (
          <IconButtonView size="sm" tooltip={linkCopied ? 'Copied' : 'Copy a link to this line'} aria-label="Copy a link to this line"
                          disabled={!anchor}
                          /* The link glyph turns into the green tick, like every copy in Daakia. */
                          icon={linkCopied ? <CopyGlyph copied size={12} /> : <LinkIcon />} onClick={copyLink} />
        )}
      </div>

      <div className="rounded-lg" style={{ fontFamily: MONO, fontSize: 11.5, lineHeight: '20px', background: C.well, padding: '5px 0' }}>
        {hiddenBefore > 0 && (
          <FoldButton onClick={() => setExpanded(true)}>··· {plural(hiddenBefore, 'earlier line')} on this thread</FoldButton>
        )}
        <LogSourceProvider value={source}>
          {shown.map((line, i) => (
            <LineRow key={i} line={line} logLine={logLines[group.lines.indexOf(line)]} pod={group.pod} />
          ))}
        </LogSourceProvider>
        {hiddenAfter > 0 && (
          <FoldButton onClick={() => setExpanded(true)}>··· {plural(hiddenAfter, 'later line')} on this thread</FoldButton>
        )}
        {expanded && (hiddenBefore === 0 && hiddenAfter === 0) && group.lines.length > (last - first + 1) + 2 * FOLD && (
          <FoldButton onClick={() => setExpanded(false)}>··· show less</FoldButton>
        )}
      </div>

      {status && (
        <div className="flex items-center flex-wrap" style={{ marginTop: 6, gap: 6, fontSize: 11, color: status.tone === 'warn' ? 'var(--color-warning)' : 'var(--color-text-secondary)' }}>
          <span>{status.text}</span>
          {status.pods?.map(pod => (
            <ButtonView key={pod} variant="secondary" size="sm" accentColor={DK8S} color={DK8S}
                        title={`Open ${pod}'s Logs at this time`} onClick={() => openReplacement(pod)}>
              <span style={{ fontFamily: MONO }}>{pod}</span>
            </ButtonView>
          ))}
        </div>
      )}
    </div>
  );
}

function FoldButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
            className="dk8s-btn dk8s-fold block w-full text-left cursor-pointer"
            style={{ padding: '0 12px', border: 'none', background: 'transparent', fontFamily: MONO, fontSize: 11, color: C.dim, lineHeight: '20px' }}>
      {children}
    </button>
  );
}

const LEVEL_COLOR: Record<string, string> = {
  error: 'var(--color-error)', fatal: 'var(--color-error)', warn: 'var(--color-warning)', warning: 'var(--color-warning)',
  info: 'var(--color-info)', debug: 'var(--color-accent)', trace: 'var(--color-text-muted)',
};

function levelLabel(level: string): string {
  const l = level.toLowerCase();
  if (l === 'other' || !l) return '';
  return l === 'warning' ? 'WARN' : l.toUpperCase();
}

/** A result line as the Logs tab's views read one. */
function asLogLine(l: ResultLine, seq: number, thread?: string): LogLine {
  const level = l.level.toLowerCase();
  return {
    seq, ts: l.ts,
    level: (level === 'warning' ? 'warn' : level === 'fatal' ? 'error' : level) as LogLevel,
    text: l.masked ?? l.text,
    ...(l.msg !== undefined ? { message: l.msg } : {}),
    ...(l.logger ? { logger: l.logger } : {}),
    ...(thread ? { thread } : {}),
    ...(l.fields ? { fields: l.fields } : {}),
  };
}

/** The Logs tab's row chip: a small tinted button with a chevron, the same size beside its neighbours. */
function RowChip({ open, tone, onClick, title, children }: {
  open: boolean; tone: string; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} title={title}
            className="shrink-0 flex items-center gap-1 px-1.5 rounded cursor-pointer border-none self-start"
            style={{
              marginTop: 2.5,
              background: tone === 'muted' ? 'var(--color-surface-hover)' : `color-mix(in srgb, ${tone} 16%, transparent)`,
              color: tone === 'muted' ? 'var(--color-text-muted)' : tone,
              fontFamily: 'var(--font-sans, system-ui)', fontSize: 10, lineHeight: '15px', whiteSpace: 'nowrap',
            }}>
      <ChipChevron open={open} />
      {children}
    </button>
  );
}

function ChipChevron({ open }: { open: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden
         style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 120ms' }}>
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}

function LineRow({ line, logLine, pod }: { line: ResultLine; logLine: LogLine; pod: string }) {
  const [framesOpen, setFramesOpen] = useState(false);
  const [payloadOpen, setPayloadOpen] = useState<boolean>();
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const prefs = usePayloadPrefs();
  const readers = useFieldReaders();
  const failure = line.role === 'failure';
  const hit = line.role === 'hit';
  const time = line.ts !== undefined ? new Date(line.ts).toISOString().slice(11, 23) : '';
  const level = levelLabel(line.level);
  const parsed = line.msg !== undefined;
  const full = parsed ? line.msg! : line.masked ?? line.text;

  /* The payload, found the way the Logs tab finds it and under its settings — off there, off here. */
  const payload: LogPayload | undefined = useMemo(
    () => prefs.shapes.length ? findPayload(full, { shapes: prefs.shapes, maxChars: prefs.maxChars }) : undefined,
    [full, prefs.shapes, prefs.maxChars],
  );
  const sentence = sentenceWithout(full, payload);
  /* "Collapsed" in the Logs settings means a payload is a chip until clicked; off, it is drawn open. */
  const showPayload = payload ? (payloadOpen ?? !prefs.collapsed) : false;
  const hasFields = Object.keys(line.fields ?? {}).length > 0 || payload?.value !== undefined
    || readFields(logLine, readers).length > 0;

  const color = failure ? 'color-mix(in srgb, var(--color-error) 22%, var(--color-text-primary))'
    : hit ? 'var(--color-text-primary)'
    : C.soft;

  return (
    <div
      data-dk8s-line={line.n}
      title={parsed ? line.text : undefined}
      style={{
        padding: failure ? '2px 12px 2px 10px' : '0 12px 0 10px',
        margin: failure ? '2px 0' : 0,
        background: failure ? 'color-mix(in srgb, var(--color-error, #ef4444) 13%, transparent)'
          : hit ? 'color-mix(in srgb, var(--color-ai-accent, #D97757) 6%, transparent)' : 'transparent',
        borderLeft: `2px solid ${failure ? C.err : hit ? 'color-mix(in srgb, var(--color-ai-accent, #D97757) 60%, transparent)' : 'transparent'}`,
        color,
      }}
    >
      <div className="flex" style={{ gap: 10 }}>
        <span className="shrink-0 select-none" style={{ width: 28, color: DK8S, fontWeight: 600 }}>{line.n ? `[${line.n}]` : ''}</span>
        {parsed && (
          <>
            <span className="shrink-0" style={{ color: failure || hit ? 'var(--color-text-secondary)' : C.dim, fontVariantNumeric: 'tabular-nums' }}>{time}</span>
            <span className="shrink-0" style={{ width: 44, color: LEVEL_COLOR[line.level.toLowerCase()] ?? C.dim, fontWeight: failure ? 600 : 400 }}>{level}</span>
          </>
        )}
        <span className="flex-1 min-w-0 flex flex-wrap items-start" style={{ columnGap: 6, rowGap: 2 }}>
          <span className="min-w-0" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontWeight: failure ? 600 : 400,
                                              color: line.alarm && !failure ? 'color-mix(in srgb, var(--color-error) 55%, var(--color-text-muted))' : undefined }}>
            {sentence}
          </span>
          {/* The chips the Logs tab puts on the same row, in the same order. */}
          {line.frames?.length ? (
            <RowChip open={framesOpen} tone="muted" onClick={() => setFramesOpen(o => !o)}
                     title={framesOpen ? 'Fold the stack frames' : 'Show the stack frames under this line'}>
              {plural(line.frames.length, 'frame')}
            </RowChip>
          ) : null}
          {payload && (
            <RowChip open={showPayload} tone={ACCENT} onClick={() => setPayloadOpen(!showPayload)}
                     title={showPayload ? 'Fold this payload back into the line' : `Draw this ${payload.shape.toUpperCase()} payload`}>
              {payload.shape.toUpperCase()} · {payload.summary}
            </RowChip>
          )}
          {hasFields && (
            <RowChip open={fieldsOpen} tone="muted" onClick={() => setFieldsOpen(o => !o)}
                     title={fieldsOpen ? 'Hide the fields' : 'What this line names, and what to follow'}>
              fields
            </RowChip>
          )}
        </span>
      </div>
      {framesOpen && line.frames && (
        <div style={{ margin: '2px 0 4px 38px', paddingLeft: 10, borderLeft: `1px solid ${C.border}`, color: C.dim, fontSize: 11 }}>
          {line.frames.map((f, i) => <div key={i} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{f}</div>)}
        </div>
      )}
      {/* Under the message, the way the Logs tab indents them — the card's gutter is the [n] column. */}
      {fieldsOpen && (
        <div style={{ fontFamily: 'var(--font-sans, system-ui)' }}>
          <LineFieldsView line={logLine} payload={payload} indent={38} />
        </div>
      )}
      {payload && showPayload && (
        <div style={{ fontFamily: 'var(--font-sans, system-ui)' }}>
          <LogPayloadView
            payload={payload}
            mode={prefs.mode}
            depth={prefs.depth}
            hideSecrets={prefs.hideSecrets}
            keepRaw={prefs.keepRaw}
            indent={38}
            title={[line.logger, time || undefined, pod].filter(Boolean).join(' · ')}
          />
        </div>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: 'err' | 'plain' | 'archive'; children: React.ReactNode }) {
  const style = tone === 'err'
    ? { background: 'color-mix(in srgb, var(--color-error, #ef4444) 16%, transparent)', color: 'var(--color-error)' }
    : tone === 'archive'
      ? { background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)', color: 'var(--color-accent)' }
      : { background: 'color-mix(in srgb, var(--color-text-primary) 9%, transparent)', color: 'var(--color-text-secondary)' };
  return <span style={{ padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 500, ...style }}>{children}</span>;
}

// ── Icons ──────────────────────────────────────────────────────────────────

const Svg = ({ size = 12, children, stroke = 'currentColor', sw = 2 }: { size?: number; children: React.ReactNode; stroke?: string; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw}
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const SearchIcon = () => <Svg size={14} stroke="var(--color-ai-accent, #D97757)"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>;
const ExternalIcon = () => <Svg size={11} sw={2.2}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14 21 3" /></Svg>;
const LinkIcon = () => <Svg size={12}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></Svg>;
const TerminalIcon = () => <Svg size={12}><path d="m4 7 5 5-5 5M12 19h8" /></Svg>;
const Chevron = ({ open }: { open: boolean }) => (
  <span style={{ display: 'inline-flex', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}>
    <Svg size={11} sw={2.4}><path d="m9 6 6 6-6 6" /></Svg>
  </span>
);
