/**
 * Ask the log — what happened, with the lines behind it.
 *
 * A question over a window of this pod's log, by id ("orderId A-4470") or in
 * words ("what went wrong in the last 10 minutes"), answered as a timeline in
 * which every step carries the line it came from, each a click away in the
 * Logs tab. Evidence, not a summary somebody has to trust.
 *
 * ── What is sent ──
 *
 * The window's lines, numbered (`ask-log.ts` chooses them when there are too
 * many), and the catalogue: every logger with its count in the window and its
 * patterns with theirs. The catalogue is what makes "which loggers went quiet"
 * answerable — a logger that wrote nothing has no line to cite, and only the
 * catalogue knows it exists. Secrets are replaced on the host before anything
 * leaves; WHAT IT READ says what was read, and the redaction note what was
 * taken out.
 *
 * ── The prompt ──
 *
 * `dk8s.log.askTheLog` in the Prompt Library: its system half says how to
 * answer (JSON, every claim cited), its user half carries the window, the
 * catalogue, the lines and the question. Both can be edited there.
 *
 * ── How it is drawn ──
 *
 * Value for value from the AiSearch board: the question box edged in the Ask
 * colour with its hint on the right, the window as a clock button, the answer
 * in a card with its ids and values coloured, IN ORDER as one bordered table
 * whose failed rows are tinted, and the rail's cited lines as cards. The
 * colours are `asklog-tone.ts`, where each is written beside the board value
 * it stands for, so this file and the board can be read against each other.
 */
import { useMemo, useRef, useState } from 'react';
import { ButtonView, ChipView, IconSize } from '@salilvnair/dui';
import { useK8sStore, type LogLine } from '../../store/k8s-store';
import { useDk8sAskLogStore, type AskRun } from '../../store/dk8s-ask-log-store';
import {
  usePatternsFor, useLoggersFor, useChecksFor, saveCheck, removeCheck,
} from '../../store/dk8s-logger-store';
import {
  buildEvidence, catalogueBlock, windowBlock, citeLabel, citedLines,
  answerText, answerSpans, filterForLines, suggestions,
} from './ask-log';
import {
  parseScope, scopeFromPlan, defaultScope, linesInScope, bufferCovers, MAX_SCOPE_LINES, type AskScope,
} from './ask-scope';
import { askOnce } from '../../services/ai/ai-once';
import { capLines, ASK_LINE_CAP, ASK_SEND_MORE_PREF, type Capped } from './ask-cap';
import { useUiStateStore } from '../../store/ui-state-store';
import { useTabsStore } from '../../store/tabs-store';
import type { LogLine as CapLine } from '../../store/k8s-store';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { buildRows, shortName } from './logger-catalogue';
import { useMarkIndex } from './LogMarks';
import { formatLogTime } from './log-view';
import { scopeOf } from './LoggersTab';
import {
  SparkleIcon, ClockIcon, CheckIcon, CloseIcon, WarningTriangleIcon,
  SpinnerIcon, StopSquareIcon, ExternalLinkIcon, FilterIcon, SendIcon, PencilIcon, SaveIcon,
} from '../../icons';
import { useSurfaceMenu, copyItem, selectionItems, textInputAt, SEP, type ContextMenuItem } from './surface-menu';
import {
  PANEL, CARD, DIVIDER, EDGE, TEXT, LABEL, QUIET, ASK, ASK_INK, ASK_LINK, ASK_ID, ASK_VALUE,
  ASK_ERROR, ASK_WARN, ASK_ERROR_ROW, ASK_YES, ASK_NO, MONO, OUTLINE_BUTTON, OUTLINE_PILL,
} from './asklog-tone';
import { useCopyTick, CopyGlyph } from '../shared/CopyTick';

/** The small caps the board heads every section with. */
const HEAD = { fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' } as const;
const RAIL_HEAD = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: LABEL } as const;

/** IN ORDER's columns: number, time, what happened, the logger it came from. */
const STEP_COLUMNS = '26px 96px 1fr 128px';
const AGGREGATE_COLUMNS = '26px 1fr 128px';

export function AskLogTab() {
  const detail = useK8sStore(s => s.detail);
  const logs = useK8sStore(s => s.logs);
  const logContainer = useK8sStore(s => s.logContainer);
  const runtime = useK8sStore(s => s.runtime);
  const scope = scopeOf(detail);
  const patterns = usePatternsFor(scope);
  const stored = useLoggersFor(scope);
  const checks = useChecksFor(scope);
  const runs = useDk8sAskLogStore(s => s.runs);
  const activeId = useDk8sAskLogStore(s => s.activeId);
  const ask = useDk8sAskLogStore(s => s.ask);
  const cancel = useDk8sAskLogStore(s => s.cancel);

  /* The answer on screen: the newest for this pod. */
  const run = runs.find(r => r.scope === scope);

  /* The box holds the question the answer below is for — coming back to the
     tab shows the pair, not an answer under an empty box. */
  const [question, setQuestion] = useState(() => run?.question ?? '');
  const boxRef = useRef<HTMLInputElement>(null);
  const resolvePrompt = useAiPromptTemplatesStore(s => s.resolve);
  /* Between Ask and the answer starting: working out the scope, fetching it. */
  const [preparing, setPreparing] = useState<string>();
  /* Why there is nothing to ask about — the scope held no lines. */
  const [note, setNote] = useState<string>();
  /* The last scope asked over: a follow-up with no time of its own reads it again. */
  const lastScope = useRef<AskScope | undefined>(undefined);
  /* What the cap did to the last question's scope, for the bar above the answer. */
  const [capped, setCapped] = useState<Capped<CapLine> & { cap: number } | undefined>();
  const sendMore = useUiStateStore(s => s.prefs[ASK_SEND_MORE_PREF] === 'on');
  const busyRef = useRef(0);

  /* An id to offer from the marks: the commonest value of the first hole
     any marked pattern has filled. */
  const markIdx = useMarkIndex(patterns, logs);
  const idFacet = markIdx.facets[0];
  const tries = suggestions({ idField: idFacet?.field, idValue: idFacet?.values[0]?.[0] });

  /*
    Ask: the question says what to read. "last 100 lines", "since 09:30",
    "what went wrong in the last hour" are read off it here; anything else is
    put to the model as kubectl logs flags (`dk8s.log.askScope`); a question
    with no time in it reads the last half hour. What is not already in the
    Logs tab's buffer is fetched through it — the same read-only kubectl
    logs, with --tail or --since-time — and then the lines go to the answer.
  */
  const send = async (q: string, given?: AskScope) => {
    const text = q.trim();
    if (!text || !detail) return;
    const turn = ++busyRef.current;
    const stale = () => turn !== busyRef.current;
    setQuestion(text);
    setNote(undefined);

    let target = parseScope(text) ?? given;
    if (!target) {
      setPreparing('Working out what part of the log that is about…');
      target = await planScope(text) ?? defaultScope();
      if (stale()) return;
    }

    const k = useK8sStore.getState();
    if (!bufferCovers(k.logs, target, { direction: k.logDirection, since: k.logSince, tail: k.logTail })) {
      setPreparing(`Reading the ${target.label} from ${detail.name}…`);
      await fetchScope(target);
      if (stale()) return;
    }
    setPreparing(undefined);

    const buffer = useK8sStore.getState().logs;
    const lines = linesInScope(buffer, target);
    if (!lines.length) {
      const newest = [...buffer].reverse().find(l => l.ts !== undefined)?.ts;
      setNote(`The pod wrote nothing in the ${target.label}${newest !== undefined ? ` — its newest line is from ${formatLogTime(newest).slice(0, 8)}` : ''}. Ask over a longer stretch, or "the last 200 lines".`);
      return;
    }
    lastScope.current = target;
    /* At most 2,000 lines unless Settings says more: grepped for what the
       question names, then the newest (ask-cap.ts). */
    const cap = sendMore ? MAX_SCOPE_LINES : ASK_LINE_CAP;
    const cut = capLines(lines, text, cap);
    setCapped(cut.how ? { ...cut, cap } : undefined);
    const sent = cut.lines;
    const stamped = sent.filter(l => l.ts !== undefined);
    const from = stamped[0]?.ts;
    const to = stamped[stamped.length - 1]?.ts;
    const evidence = buildEvidence(sent, text, { maxEvents: cap, maxChars: sendMore ? 360_000 : 160_000 });
    const rows = buildRows(stored, patterns, buffer, sent);
    ask({
      question: text, window: target.label, from, to, scope,
      evidence,
      windowBlock: windowBlock(target.label, from, to, evidence),
      catalogue: catalogueBlock(rows),
      loggersKnown: rows.filter(r => r.key).length,
      podContext: {
        pod: detail?.name, namespace: detail?.namespace, container: logContainer, runtime: runtime?.runtime,
      },
    });
  };

  /* The model's reading of the question's time, when the tab has none. */
  const planScope = async (text: string): Promise<AskScope | undefined> => {
    try {
      const call = askOnce({
        stage: 'dk8s.log.askScope',
        screen: 'dk8s · Logs',
        systemPrompts: [resolvePrompt('dk8s.log.askScope.system', {})],
        userPrompt: resolvePrompt('dk8s.log.askScope', {
          now: new Date().toString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'local',
          pod: detail?.name ?? '',
          question: text,
        }),
        settings: { temperature: 0, maxTokens: 300, responseFormat: 'json_object', thinking: 'off' },
      }, 15_000);
      return scopeFromPlan(await call.text);
    } catch {
      return undefined;
    }
  };

  const canAsk = !!question.trim() && !!detail && !preparing;

  /* Put a question in the box to be edited, rather than asked as it stands. */
  const draft = (q: string) => {
    setQuestion(q);
    requestAnimationFrame(() => { boxRef.current?.focus(); boxRef.current?.select(); });
  };

  /* Right-click: what was clicked says what it is through `data-ask-*`. A
     selection's Copy comes first wherever there is one; the question box gets
     its editing entries from the surface menu. */
  const menu = useSurfaceMenu((target, selection) => {
    if (textInputAt(target)) return [];
    const sel = selectionItems(selection);
    const lead = (items: ContextMenuItem[]) => (sel.length ? [...sel, SEP('sel-sep'), ...items] : items);
    const a = run?.answer;
    const at = (n: number) => run?.numbered.get(n);

    const cite = target.closest('[data-ask-line]') as HTMLElement | null;
    if (cite) {
      const l = at(Number(cite.dataset.askLine));
      if (!l) return sel;
      const msg = (l.message ?? l.text).trim();
      return lead([
        { id: 'open-line', label: 'Open in Logs', icon: <ExternalLinkIcon size={14} />, iconColor: ASK_LINK, onClick: () => openLine(l) },
        { id: 'ask-line', label: 'Ask what led to this…', icon: <SparkleIcon size={14} />, iconColor: ASK, onClick: () => draft(`What led to this: ${msg.slice(0, 160)}`) },
        SEP('line-sep'),
        copyItem('copy-line', 'Copy line', l.text),
        ...(l.message && l.message !== l.text ? [copyItem('copy-message', 'Copy message', l.message)] : []),
      ]);
    }

    const step = target.closest('[data-ask-step]') as HTMLElement | null;
    if (step && a) {
      const s = a.steps[Number(step.dataset.askStep)];
      if (!s) return sel;
      const lines = s.lines.map(at).filter((l): l is LogLine => !!l);
      return lead([
        ...(lines[0] ? [{ id: 'open-step', label: 'Open the line in Logs', icon: <ExternalLinkIcon size={14} />, iconColor: ASK_LINK, onClick: () => openLine(lines[0]) }] : []),
        ...(lines.length > 1 ? [{ id: 'open-step-all', label: `Show its ${lines.length} lines in Logs`, icon: <FilterIcon size={14} />, iconColor: ASK_LINK, onClick: () => openLines(lines) }] : []),
        { id: 'ask-step', label: 'Ask about this step…', icon: <SparkleIcon size={14} />, iconColor: ASK, onClick: () => draft(`Why: ${s.text}`) },
        SEP('step-sep'),
        copyItem('copy-step', 'Copy step', s.text),
        ...(lines[0] ? [copyItem('copy-step-line', 'Copy the line', lines[0].text)] : []),
      ]);
    }

    const agg = target.closest('[data-ask-agg]') as HTMLElement | null;
    if (agg && a) {
      const g = a.aggregates[Number(agg.dataset.askAgg)];
      if (!g) return sel;
      const lines = g.lines.map(at).filter((l): l is LogLine => !!l);
      return lead([
        ...(lines.length ? [{ id: 'open-agg', label: `Show the ${lines.length} line${lines.length === 1 ? '' : 's'} in Logs`, icon: <FilterIcon size={14} />, iconColor: ASK_LINK, onClick: () => openLines(lines) }] : []),
        copyItem('copy-agg', 'Copy', g.text),
      ]);
    }

    const check = target.closest('[data-ask-check]') as HTMLElement | null;
    if (check) {
      const c = checks.find(x => x.id === check.dataset.askCheck);
      if (!c) return sel;
      return [
        { id: 'ask-check', label: 'Ask this again', icon: <SendIcon size={14} />, iconColor: ASK, onClick: () => void send(c.question) },
        { id: 'edit-check', label: 'Edit before asking', icon: <PencilIcon size={14} />, iconColor: 'var(--color-ctx-rename)', onClick: () => draft(c.question) },
        copyItem('copy-check', 'Copy question', c.question),
        SEP('check-sep'),
        { id: 'forget', label: 'Forget this check', danger: true, icon: <CloseIcon size={14} />, onClick: () => removeCheck(c.id) },
      ];
    }

    const q = target.closest('[data-ask-q]') as HTMLElement | null;
    if (q) {
      const text = q.dataset.askQ!;
      const same = q.dataset.askSame === 'true' ? lastScope.current : undefined;
      return [
        { id: 'ask-q', label: 'Ask this', icon: <SendIcon size={14} />, iconColor: ASK, onClick: () => void send(text, same) },
        { id: 'edit-q', label: 'Edit before asking', icon: <PencilIcon size={14} />, iconColor: 'var(--color-ctx-rename)', onClick: () => draft(text) },
        copyItem('copy-q', 'Copy question', text),
      ];
    }

    if (run && target.closest('[data-ask-answer]')) {
      const cited = a ? citedLines(a).map(at).filter((l): l is LogLine => !!l) : [];
      return lead([
        ...(a || run.text ? [copyItem('copy-answer', 'Copy answer', a ? answerText(a, run.numbered) : run.text)] : []),
        ...(cited.length ? [{ id: 'open-all', label: `Show the ${cited.length} cited line${cited.length === 1 ? '' : 's'} in Logs`, icon: <FilterIcon size={14} />, iconColor: ASK_LINK, onClick: () => openLines(cited) }] : []),
        ...(run.question ? [
          SEP('ans-sep'),
          { id: 'again', label: 'Ask it again', disabled: !!activeId || !!preparing, icon: <SendIcon size={14} />, iconColor: ASK, onClick: () => void send(run.question, lastScope.current) },
          { id: 'save-check', label: 'Save as a check', icon: <SaveIcon size={14} />, iconColor: 'var(--color-info)', onClick: () => saveCheck(run.scope, run.question, run.window) },
        ] : []),
      ]);
    }

    return sel;
  });

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: PANEL, color: TEXT, fontSize: 13 }}
         data-context-menu="ask-log" onContextMenu={menu.onContextMenu}>
      {menu.element}
      {/* ── The question ── */}
      <div className="flex items-center shrink-0" style={{ gap: 8, padding: '12px 14px 10px' }}>
        <div className="flex items-center flex-1 min-w-0"
             style={{ gap: 8, height: 34, padding: '0 12px', border: `1px solid ${ASK}`, borderRadius: 8, background: CARD }}>
          <SparkleIcon size={14} color={ASK} style={{ flexShrink: 0 }} />
          <input
            ref={boxRef}
            type="text"
            aria-label="Ask about this window"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canAsk) void send(question); }}
            placeholder="what went wrong in the last hour · the last 200 lines · orderId A-4470 since 09:30"
            className="flex-1 min-w-0"
            style={{ border: 'none', background: 'none', color: TEXT, fontSize: 13, outline: 'none', padding: 0 }}
          />
          <span className="shrink-0" style={{ fontSize: 11, color: QUIET }}>say how far back — or it reads the last 30 minutes</span>
        </div>


        {activeId || preparing ? (
          <ButtonView variant="secondary" onClick={() => { busyRef.current++; setPreparing(undefined); if (activeId) cancel(); }}
                      iconLeft={<StopSquareIcon size={IconSize.action} />}
                      style={{ ...OUTLINE_BUTTON, height: 34, padding: '0 14px', borderRadius: 8, background: CARD, color: TEXT, fontSize: 12.5 }}>
            Stop
          </ButtonView>
        ) : (
          <ButtonView variant="primary" accentColor={ASK} disabled={!canAsk}
                      onClick={() => send(question)}
                      style={{
                        height: 34, padding: '0 14px', border: 'none', borderRadius: 8,
                        background: ASK, color: ASK_INK, fontSize: 12.5, fontWeight: 600,
                      }}>
            Ask
          </ButtonView>
        )}
      </div>

      <div className="flex items-center flex-wrap shrink-0" style={{ gap: 6, padding: '0 14px 10px' }}>
        {tries.map(t => (
          <span key={t} className="contents" data-ask-q={t}>
            <AskChip text={t} onAsk={() => void send(t)} />
          </span>
        ))}
        {checks.length > 0 && <span className="self-stretch" style={{ width: 1, margin: '4px 4px', background: EDGE }} />}
        {checks.map(c => (
          <span key={c.id} className="contents" data-ask-check={c.id}>
            <AskChip text={c.question} saved onAsk={() => void send(c.question)} onRemove={() => removeCheck(c.id)} />
          </span>
        ))}

      </div>

      {capped && run && !preparing && !note && (
        <div className="flex items-start shrink-0" role="status"
             style={{
               gap: 9, padding: '8px 14px', borderTop: `1px solid ${EDGE}`,
               background: `color-mix(in srgb, ${ASK_WARN} 9%, transparent)`,
               color: TEXT, fontSize: 12, lineHeight: 1.55,
             }}>
          <WarningTriangleIcon size={14} color={ASK_WARN} style={{ flexShrink: 0, marginTop: 2 }} />
          <span className="flex-1 min-w-0">
            The {run.window} had <b>{capped.total.toLocaleString()}</b> lines — too many to send, so{' '}
            {capped.how === 'grep'
              ? <>only the {capped.lines.length.toLocaleString()} that mention {capped.terms.map(t => `“${t}”`).join(', ')} went</>
              : capped.how === 'grep-newest'
                ? <>the newest {capped.lines.length.toLocaleString()} that mention {capped.terms.map(t => `“${t}”`).join(', ')} went</>
                : <>the newest {capped.lines.length.toLocaleString()} went — name an id or a word in the question to search for it instead</>}
            .{' '}
            <span style={{ color: LABEL }}>
              {sendMore
                ? 'That is the most one fetch holds.'
                : <>Need more? Turn on sending more than {ASK_LINE_CAP.toLocaleString()} lines in Settings — it costs more AI tokens.</>}
            </span>
          </span>
          {!sendMore && (
            <button type="button" onClick={() => useTabsStore.getState().openSettingsTab('dk8s-logs')}
                    className="shrink-0 border-none bg-transparent cursor-pointer p-0"
                    style={{ color: ASK_LINK, fontSize: 12, fontWeight: 600 }}>
              Settings ›
            </button>
          )}
          <button type="button" onClick={() => setCapped(undefined)} aria-label="Dismiss"
                  className="shrink-0 border-none bg-transparent cursor-pointer p-0 inline-flex" style={{ color: QUIET, marginTop: 2 }}>
            <CloseIcon size={12} />
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0" style={{ borderTop: `1px solid ${EDGE}` }}>
        {preparing || note ? (
          <div className="flex-1 flex items-start" style={{ padding: '18px 16px' }}>
            <span className="flex items-center" style={{ gap: 8, fontSize: 12.5, color: note ? ASK_WARN : QUIET, maxWidth: 640, lineHeight: 1.6 }}>
              {preparing && <SpinnerIcon size={IconSize.action} color={ASK} />}
              {note && <ClockIcon size={13} color={ASK_WARN} strokeWidth={2} style={{ flexShrink: 0 }} />}
              {preparing ?? note}
            </span>
          </div>
        ) : run ? <Answer run={run} logs={logs} onAsk={q => void send(q, lastScope.current)} /> : (
          <div className="flex-1 flex items-center justify-center px-8">
            <span className="leading-relaxed text-center" style={{ fontSize: 12, color: QUIET, maxWidth: 520 }}>
              Ask by id or in words, and say how far back — &ldquo;the last 200 lines&rdquo;, &ldquo;since 09:30&rdquo;,
              &ldquo;in the last hour&rdquo;. What is not loaded yet is read from the pod first. Every claim in the answer
              carries the lines it came from, each a click away in the Logs tab — evidence, not a summary you must trust.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A question to ask with one click — a suggestion, or a check you saved.
 *
 * A soft pill in the Ask colour with an icon saying what kind of question it
 * is — something went wrong, a stretch of time, the loggers, a summary — so
 * the row reads as things to ask rather than a line of grey outlines.
 */
function AskChip({ text, onAsk, onRemove, saved }: {
  text: string; onAsk: () => void; onRemove?: () => void; saved?: boolean;
}) {
  const t = text.toLowerCase();
  const [Icon, tone] = saved ? [CheckIcon, ASK]
    : /wrong|error|fail|exception/.test(t) ? [WarningTriangleIcon, ASK_WARN]
      : /since|last \d+ min|hour|yesterday|today/.test(t) ? [ClockIcon, ASK_LINK]
        : [SparkleIcon, ASK];
  return (
    <span className="ask-chip inline-flex items-center"
          style={{
            height: 26, borderRadius: 999, gap: 6, padding: onRemove ? '0 4px 0 10px' : '0 11px',
            background: `color-mix(in srgb, ${tone} 8%, ${CARD})`,
            border: `1px solid color-mix(in srgb, ${tone} 26%, transparent)`,
            ['--chip-tone' as string]: tone,
          }}>
      <button type="button" onClick={onAsk} title={saved ? 'Ask this saved check again' : 'Ask this'}
              className="inline-flex items-center border-none bg-transparent cursor-pointer p-0"
              style={{ gap: 6, color: LABEL, fontSize: 11.5, whiteSpace: 'nowrap' }}>
        <Icon size={12} color={tone} style={{ flexShrink: 0 }} />
        {text}
      </button>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Forget this check" title="Forget this check"
                className="ask-chip-x inline-flex items-center justify-center border-none bg-transparent cursor-pointer"
                style={{ width: 18, height: 18, borderRadius: 999, color: QUIET, padding: 0 }}>
          <CloseIcon size={10} />
        </button>
      )}
      <style>{`.ask-chip { transition: background-color 120ms, border-color 120ms, transform 120ms; }
.ask-chip:hover { background: color-mix(in srgb, var(--chip-tone) 16%, ${CARD}) !important; border-color: color-mix(in srgb, var(--chip-tone) 50%, transparent) !important; transform: translateY(-1px); }
.ask-chip:hover > button:first-child { color: ${TEXT} !important; }
.ask-chip-x:hover { color: var(--color-error) !important; }`}</style>
    </span>
  );
}

/** Put one line on screen in the Logs tab, highlighted. */
function openLine(line: LogLine) {
  useK8sStore.setState({ linkedLine: { seq: line.seq, text: line.text }, pendingLink: undefined });
  useK8sStore.getState().setDetailTab('logs');
}

/**
 * Fetch what a scope needs through the Logs tab — `kubectl logs` with --tail,
 * --since or --since-time, read-only — and wait for the lines to arrive.
 *
 * The Logs tab shows the same read afterwards, so what the answer cites is
 * what is on screen there; it stops following, since a window with an end
 * cannot also be live.
 */
function fetchScope(target: AskScope): Promise<void> {
  const k = useK8sStore;
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      + `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const tail = k.getState().logTail;
  switch (target.kind) {
    case 'tail':
      k.setState({ logDirection: 'last', logLive: false, logSince: 'all', logTail: Math.max(target.n, 200) });
      break;
    case 'head':
      k.setState({ logDirection: 'first', logLive: false, logSince: 'all', logTail: target.n });
      break;
    case 'restart':
      k.setState({ logDirection: 'last', logLive: false, logSince: 'restart', logTail: MAX_SCOPE_LINES });
      break;
    case 'all':
      k.setState({ logDirection: 'last', logLive: false, logSince: 'all', logTail: MAX_SCOPE_LINES });
      break;
    case 'range':
      k.setState({
        logDirection: 'between', logLive: false,
        logFrom: local(target.fromMs), logTo: local(target.toMs ?? Date.now()),
        logTail: Math.max(tail, MAX_SCOPE_LINES),
      });
      break;
  }
  k.getState().reloadLogs();
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); unsub(); resolve(); };
    const unsub = k.subscribe(s => {
      if (s.logStatus === 'ended' || s.logStatus === 'error' || s.logStatus === 'idle') done();
    });
    const timer = setTimeout(done, 90_000);
  });
}

/** Show exactly these lines in the Logs tab, as one filter. */
function openLines(lines: LogLine[]) {
  const s = useK8sStore.getState();
  s.clearFieldFilters();
  s.setLogFilter(filterForLines(lines));
  s.setDetailTab('logs');
}

/**
 * A sentence of the answer, with its ids in teal, its values in amber and its
 * times and quoted names monospaced — see `answerSpans` for what counts as
 * which. Everything else takes the colour of the paragraph it is in.
 */
function Spans({ text }: { text: string }) {
  return (
    <>
      {answerSpans(text).map((s, i) => {
        switch (s.kind) {
          case 'id': return <span key={i} style={{ fontFamily: MONO, color: ASK_ID }}>{s.text}</span>;
          case 'value': return <span key={i} style={{ fontFamily: MONO, color: ASK_VALUE }}>{s.text}</span>;
          case 'time': return <span key={i} style={{ fontFamily: MONO, color: TEXT }}>{s.text}</span>;
          case 'code': return <span key={i} style={{ fontFamily: MONO }}>{s.text}</span>;
          case 'count': return <span key={i} style={{ color: TEXT }}>{s.text}</span>;
          default: return <span key={i}>{s.text}</span>;
        }
      })}
    </>
  );
}

/** "[1–6]" after a sentence: the lines it stands on, opened as one filter. */
function Cite({ lines, onOpen }: { lines: number[]; onOpen: () => void }) {
  if (!lines.length) return null;
  return (
    <button type="button" onClick={onOpen} title="Open these lines in Logs"
            className="border-none bg-transparent cursor-pointer p-0"
            style={{ color: ASK, font: 'inherit' }}>
      {' '}[{citeLabel(lines)}]
    </button>
  );
}

/** A link into the Logs tab — "OrderService ›", "see them ›". */
function LogLink({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={title}
            className="border-none bg-transparent cursor-pointer p-0 truncate"
            style={{ fontSize: 11.5, textAlign: 'right', color: ASK_LINK }}>
      {children} &rsaquo;
    </button>
  );
}

function Answer({ run, logs, onAsk }: { run: AskRun; logs: LogLine[]; onAsk: (q: string) => void }) {
  const setVerdict = useDk8sAskLogStore(s => s.setVerdict);
  const { copied, flash } = useCopyTick();
  const a = run.answer;
  const cited = useMemo(() => (a ? citedLines(a) : []), [a]);
  const citedLog = useMemo(
    () => cited.map(n => run.numbered.get(n)).filter((l): l is LogLine => !!l),
    [cited, run.numbered],
  );
  const seconds = run.finishedAt ? ((run.finishedAt - run.startedAt) / 1000).toFixed(1) : undefined;
  const hms = (ts?: number) => (ts === undefined ? '?' : formatLogTime(ts).slice(0, 8));

  /* The exception under a cited line — the red line on the board's ERROR
     card. The numbered map holds the event; its first continuation line is
     still in the buffer right after it, found in one pass. */
  const exceptionOf = useMemo(() => {
    const out = new Map<number, string>();
    const want = new Set(citedLog.slice(0, 40).map(l => l.seq));
    if (!want.size) return out;
    for (let i = 0; i < logs.length - 1; i++) {
      if (want.has(logs[i].seq) && logs[i + 1].continuation) out.set(logs[i].seq, logs[i + 1].text.trim());
    }
    return out;
  }, [logs, citedLog]);

  const copy = () => {
    void navigator.clipboard?.writeText(a ? answerText(a, run.numbered) : run.text).then(flash);
  };

  const at = (n: number) => run.numbered.get(n);
  const linesOf = (ns: number[]) => ns.map(at).filter((l): l is LogLine => !!l);
  const hasTable = !!a && (a.steps.length > 0 || a.aggregates.length > 0);

  return (
    <>
      {/* ── The answer ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-auto" style={{ padding: '14px 16px', gap: 12 }}>
        <div className="flex items-center shrink-0" style={{ gap: 8 }}>
          <span style={{ ...HEAD, color: ASK }}>ANSWER</span>
          <span style={{ fontSize: 11, color: QUIET }}>
            <span style={{ color: ASK }}>{run.window}</span> · read {run.total.toLocaleString()} lines · {hms(run.from)}&ndash;{hms(run.to)}
            {seconds ? ` · ${seconds}s` : ''}
          </span>
          <div className="flex-1" />
          <ButtonView variant="secondary" disabled={run.streaming || (!a && !run.text)} onClick={copy}
                      iconLeft={<CopyGlyph copied={copied} size={12} />} style={OUTLINE_BUTTON}>
            Copy
          </ButtonView>
          <ButtonView variant="secondary" disabled={!citedLog.length} onClick={() => openLines(citedLog)}
                      style={OUTLINE_BUTTON}>
            Open all in Logs
          </ButtonView>
        </div>

        <div className="shrink-0" data-ask-answer
             style={{ padding: '12px 14px', border: `1px solid ${EDGE}`, borderRadius: 9, background: CARD, fontSize: 13, lineHeight: 1.65 }}>
          {run.streaming && (
            <div className="flex items-center" style={{ gap: 8, fontSize: 12, color: QUIET }}>
              <SpinnerIcon size={IconSize.action} color={ASK} />
              Reading {run.sent.toLocaleString()} of {run.total.toLocaleString()} lines{run.text ? ` · ${run.text.length.toLocaleString()} characters back` : '…'}
            </div>
          )}
          {run.error && (
            <div style={{ fontSize: 12, color: ASK_ERROR }}>{run.error}</div>
          )}

          {/* Prose when the model sent no JSON: shown as it came, with no
              citations drawn, because none were given. */}
          {!run.streaming && !a && run.text && (
            <div className="whitespace-pre-wrap" style={{ fontSize: 12.5, color: TEXT }}>
              {run.text}
              <div style={{ marginTop: 8, fontSize: 11, color: ASK_WARN }}>
                This answer came back without its line numbers, so nothing in it links to the log.
              </div>
            </div>
          )}

          {/* The first paragraph is the answer; the ones after it are what
              surrounds it, a step quieter — the board's two voices. */}
          {a && a.answer.map((p, i) => (i === 0 ? (
            <span key={i} style={{ color: TEXT }}>
              <Spans text={p.text} />
              <Cite lines={p.cites} onOpen={() => openLines(linesOf(p.cites))} />
            </span>
          ) : (
            <div key={i} style={{ marginTop: 8, color: LABEL, fontSize: 12.5 }}>
              <Spans text={p.text} />
              <Cite lines={p.cites} onOpen={() => openLines(linesOf(p.cites))} />
            </div>
          )))}
          {!run.streaming && !run.error && !run.text && !a && (
            <span style={{ fontSize: 12, color: QUIET }}>Nothing came back.</span>
          )}
        </div>

        {a && hasTable && (
          <>
            <div className="flex items-center shrink-0" style={{ gap: 8 }}>
              <span style={{ ...HEAD, color: LABEL }}>IN ORDER</span>
              <span style={{ fontSize: 11, color: QUIET }}>every step carries the line it came from</span>
            </div>

            <div className="flex flex-col overflow-hidden"
                 style={{ flex: '1 0 auto', border: `1px solid ${EDGE}`, borderRadius: 9, background: CARD }}>
              {a.steps.map((s, i) => {
                const line = at(s.lines[0]);
                const time = s.time ?? (line?.ts !== undefined ? formatLogTime(line.ts) : '');
                const logger = s.logger ?? (line?.logger ? shortName(line.logger) : undefined);
                const tone = line?.level === 'error' ? ASK_ERROR : line?.level === 'warn' ? ASK_WARN : undefined;
                const last = i === a.steps.length - 1 && !a.aggregates.length;
                return (
                  <div key={i} className="grid items-center" data-ask-step={i}
                       style={{
                         gridTemplateColumns: STEP_COLUMNS, gap: 10, padding: '8px 12px',
                         borderBottom: last ? undefined : `1px solid ${DIVIDER}`,
                         background: line?.level === 'error' ? ASK_ERROR_ROW : undefined,
                       }}>
                    <span style={{ fontSize: 11, color: ASK }}>{i + 1}</span>
                    <span className="truncate" style={{ fontFamily: MONO, fontSize: 11.5, color: QUIET }}>{time}</span>
                    {/* A failed or warning step is one colour end to end, as
                        on the board; a plain one gets its ids coloured. */}
                    <span className="min-w-0" title={s.text} style={{ fontSize: 12.5, color: tone ?? TEXT }}>
                      {tone ? s.text : <Spans text={s.text} />}
                    </span>
                    {line ? (
                      <LogLink title={`Open line ${s.lines[0]} in Logs`} onClick={() => openLine(line)}>
                        {logger ?? `line ${s.lines[0]}`}
                      </LogLink>
                    ) : <span />}
                  </div>
                );
              })}
              {a.aggregates.map((g, i) => (
                <div key={`g${i}`} className="grid items-center" data-ask-agg={i}
                     style={{
                       gridTemplateColumns: AGGREGATE_COLUMNS, gap: 10, padding: '8px 12px',
                       borderBottom: i === a.aggregates.length - 1 ? undefined : `1px solid ${DIVIDER}`,
                     }}>
                  <span style={{ fontSize: 11, color: ASK }}>{a.steps.length + i + 1}</span>
                  <span className="min-w-0" style={{ fontSize: 12.5, color: LABEL }}>
                    {g.text}
                    {g.lines.length > 0 && (
                      <>
                        {' — '}
                        <span style={{ color: QUIET }}>{g.lines.length} line{g.lines.length === 1 ? '' : 's'} behind this</span>
                      </>
                    )}
                  </span>
                  {g.lines.length > 0 ? (
                    <LogLink title="Open these lines in Logs" onClick={() => openLines(linesOf(g.lines))}>
                      see them
                    </LogLink>
                  ) : <span />}
                </div>
              ))}
            </div>
          </>
        )}

        {a && a.followUps.length > 0 && (
          <div className="flex flex-wrap shrink-0" style={{ gap: 8 }}>
            {a.followUps.map(f => (
              <span key={f} className="contents" data-ask-q={f} data-ask-same="true">
                <ChipView label={f} size="md" onClick={() => onAsk(f)} title="Ask this over the same window"
                          style={{ ...OUTLINE_PILL, height: 28, padding: '0 11px' }} />
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── The lines behind it, and what it read ── */}
      <div className="shrink-0 flex flex-col min-h-0"
           style={{ width: 330, borderLeft: `1px solid ${EDGE}`, background: CARD }}>
        <div className="flex items-center shrink-0" style={{ gap: 8, padding: '12px 14px 8px' }}>
          <span style={RAIL_HEAD}>THE LINES BEHIND IT</span>
          <span style={{ fontSize: 10.5, color: QUIET }}>{cited.length} cited</span>
        </div>
        <div className="flex flex-col min-h-0 overflow-auto" style={{ flex: '0 1 auto', gap: 6, padding: '0 10px 10px' }}>
          {cited.slice(0, 40).map(n => {
            const l = at(n);
            if (!l) return null;
            const exception = exceptionOf.get(l.seq);
            return (
              <button key={n} type="button" onClick={() => openLine(l)} title="Open this line in Logs" data-ask-line={n}
                      className="flex flex-col text-left cursor-pointer shrink-0"
                      style={{
                        padding: '7px 9px', border: `1px solid ${EDGE}`, borderLeft: `2px solid ${ASK}`, borderRadius: 6,
                        background: PANEL, fontFamily: MONO, fontSize: 11, lineHeight: 1.5,
                      }}>
                <span style={{ color: QUIET }}>
                  [{n}] {[
                    l.ts !== undefined ? formatLogTime(l.ts) : '',
                    l.level !== 'other' ? l.level.toUpperCase() : '',
                    l.logger ? shortName(l.logger) : '',
                  ].filter(Boolean).join(' ')}
                </span>
                <span className="break-words" style={{ color: TEXT }}>{(l.message ?? l.text).slice(0, 240)}</span>
                {exception && <span className="break-words" style={{ color: ASK_ERROR }}>{exception.slice(0, 240)}</span>}
              </button>
            );
          })}
          {!cited.length && (
            <span style={{ fontSize: 11, color: QUIET, padding: '0 4px' }}>
              {run.streaming ? 'The lines appear with the answer.' : 'Nothing cited.'}
            </span>
          )}
        </div>

        <div className="shrink-0" style={{ ...RAIL_HEAD, padding: '10px 14px 8px', borderTop: `1px solid ${EDGE}` }}>WHAT IT READ</div>
        <div className="shrink-0" style={{ padding: '0 14px 10px', fontSize: 11.5, lineHeight: 1.8, color: LABEL }}>
          <Fact label="window">{hms(run.from)} &ndash; {hms(run.to)}</Fact>
          <Fact label="lines">
            {run.total.toLocaleString()}{run.sent < run.total ? ` · ${run.sent.toLocaleString()} sent` : ''}
          </Fact>
          <Fact label="loggers touched">
            {(a?.loggers.length || run.loggersTouched.length).toLocaleString()} of {run.loggersKnown.toLocaleString()}
          </Fact>
          <Fact label="pod" mono>{run.pod ? `…${run.pod.slice(-5)}` : '—'}</Fact>
        </div>

        <div className="flex shrink-0"
             style={{ margin: '0 14px', padding: '9px 10px', gap: 8, border: `1px solid ${EDGE}`, borderRadius: 7, background: PANEL }}>
          <WarningTriangleIcon size={13} color={ASK_WARN} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 11, lineHeight: 1.55, color: LABEL }}>
            Secret values in the window are replaced before anything is sent, and the answer never carries one.
            {run.redactionNote ? ` Taken out of this one: ${run.redactionNote}.` : ''} Which provider answers the
            question is yours to choose in Settings.
          </div>
        </div>

        <div className="flex-1" />
        <div className="flex items-center shrink-0" style={{ gap: 8, padding: '10px 14px', borderTop: `1px solid ${EDGE}` }}>
          <span style={{ fontSize: 11, color: QUIET }}>Was this right?</span>
          <Verdict on={run.verdict === 'right'} color={ASK_YES} label="Yes, this was right"
                   disabled={run.streaming || !!run.error} onClick={() => setVerdict(run.id, 'right')}
                   icon={<CheckIcon size={12} />} />
          <Verdict on={run.verdict === 'wrong'} color={ASK_NO} label="No, this was wrong"
                   disabled={run.streaming || !!run.error} onClick={() => setVerdict(run.id, 'wrong')}
                   icon={<CloseIcon size={12} />} />
          <div className="flex-1" />
          <ButtonView variant="secondary" disabled={!run.question}
                      title="Keep this question, to ask it again over the same length of window"
                      onClick={() => saveCheck(run.scope, run.question, run.window)}
                      style={OUTLINE_BUTTON}>
            Save as a check
          </ButtonView>
        </div>
      </div>
    </>
  );
}

/** ✓ or ✗: a 24px square, the glyph in its colour, filled faintly once chosen. */
function Verdict({ on, color, label, disabled, onClick, icon }: {
  on: boolean; color: string; label: string; disabled: boolean; onClick: () => void; icon: React.ReactNode;
}) {
  return (
    <ButtonView variant="secondary" aria-label={label} title={label} disabled={disabled} onClick={onClick}
                aria-pressed={on}
                style={{
                  ...OUTLINE_BUTTON, width: 24, padding: 0, color,
                  border: `1px solid ${on ? color : EDGE}`,
                  background: on ? `color-mix(in srgb, ${color} 16%, transparent)` : 'none',
                }}>
      {icon}
    </ButtonView>
  );
}

/** One row of WHAT IT READ: the name on the left, the value right-aligned. */
function Fact({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex">
      <span className="flex-1">{label}</span>
      <span style={{ color: TEXT, fontFamily: mono ? MONO : undefined }}>{children}</span>
    </div>
  );
}
