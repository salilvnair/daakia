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
 */
import { useMemo, useState } from 'react';
import {
  ButtonView, TextInputView, SelectInputView, ChipView, IconSize,
} from '@salilvnair/dui';
import { useK8sStore, type LogLine } from '../../store/k8s-store';
import { useDk8sAskLogStore, type AskRun } from '../../store/dk8s-ask-log-store';
import {
  usePatternsFor, useLoggersFor, useChecksFor, saveCheck, removeCheck,
} from '../../store/dk8s-logger-store';
import {
  askWindowLines, buildEvidence, catalogueBlock, windowBlock, windowRange, citeLabel, citedLines,
  answerText, filterForLines, suggestions, ASK_WINDOW_NAME, type AskWindow,
} from './ask-log';
import { buildRows, shortName } from './logger-catalogue';
import { useMarkIndex } from './LogMarks';
import { formatLogTime } from './log-view';
import { scopeOf } from './LoggersTab';
import {
  SparkleIcon, CopyIcon, FileTextIcon, ThumbUpIcon, ThumbDownIcon, ClockIcon, ShieldIcon,
  SpinnerIcon, ChevronRightIcon, StopSquareIcon,
} from '../../icons';
import { AI, AI_INK } from './tone';

const WINDOWS: AskWindow[] = ['10m', '30m', '1h', '2h', 'all'];

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

  const [question, setQuestion] = useState('');
  const [win, setWin] = useState<AskWindow>('10m');

  /* The answer on screen: the newest for this pod. */
  const run = runs.find(r => r.scope === scope);

  /* The window's clock times, for the select's labels. */
  const ranges = useMemo(() => Object.fromEntries(WINDOWS.map(w => {
    const lw = askWindowLines(logs, w);
    return [w, windowRange(lw.from, lw.to)];
  })) as Record<AskWindow, string>, [logs]);

  /* An id to offer from the marks: the commonest value of the first hole
     any marked pattern has filled. */
  const markIdx = useMarkIndex(patterns, logs);
  const idFacet = markIdx.facets[0];
  const tries = suggestions({ idField: idFacet?.field, idValue: idFacet?.values[0]?.[0], win });

  const send = (q: string, w: AskWindow = win) => {
    const text = q.trim();
    if (!text || !logs.length) return;
    const lw = askWindowLines(logs, w);
    const evidence = buildEvidence(lw.lines, text);
    const rows = buildRows(stored, patterns, logs, lw.lines);
    ask({
      question: text, window: w, from: lw.from, to: lw.to, scope,
      evidence,
      windowBlock: windowBlock(w, lw.from, lw.to, evidence),
      catalogue: catalogueBlock(rows),
      loggersKnown: rows.filter(r => r.key).length,
      podContext: {
        pod: detail?.name, namespace: detail?.namespace, container: logContainer, runtime: runtime?.runtime,
      },
    });
    setQuestion(text);
    setWin(w);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── The question ── */}
      <div className="flex flex-col gap-2.5 px-5 pt-4 pb-3 shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <span className="text-[11px] font-bold" style={{ letterSpacing: '0.05em', color: 'var(--color-text-secondary)' }}>
          Ask about this window
        </span>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <TextInputView
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(question); }}
              placeholder="an id, or a question"
              size="lg"
              accentColor={AI}
              width="fullWidth"
              prefixIcon={<SparkleIcon size={IconSize.action} color={AI} />}
            />
          </div>
          <SelectInputView
            value={win}
            onChange={v => setWin(v as AskWindow)}
            size="lg"
            accentColor={AI}
            menuMinWidth={260}
            options={WINDOWS.map(w => ({ value: w, label: `${ranges[w]} · ${ASK_WINDOW_NAME[w]}` }))}
          />
          {activeId ? (
            <ButtonView size="lg" variant="secondary" onClick={cancel}
                        iconLeft={<StopSquareIcon size={IconSize.action} />}>
              Stop
            </ButtonView>
          ) : (
            <ButtonView size="lg" variant="primary" accentColor={AI} disabled={!question.trim() || !logs.length}
                        onClick={() => send(question)}
                        style={question.trim() && logs.length
                          ? { background: AI, borderColor: AI, color: AI_INK, fontWeight: 600 } : undefined}>
              Ask
            </ButtonView>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] mr-1" style={{ color: 'var(--color-text-muted)' }}>try</span>
          {tries.map(t => (
            <ChipView key={t} label={t} size="sm" onClick={() => send(t)} title="Ask this" />
          ))}
          {checks.length > 0 && (
            <span className="text-[11px] ml-3 mr-1" style={{ color: 'var(--color-text-muted)' }}>your checks</span>
          )}
          {checks.map(c => (
            <ChipView key={c.id} label={`${c.question} · ${ASK_WINDOW_NAME[c.window as AskWindow] ?? c.window}`} size="sm"
                      color={AI} onClick={() => send(c.question, c.window as AskWindow)}
                      onRemove={() => removeCheck(c.id)} removeLabel="Forget this check" title="Ask this again" />
          ))}
        </div>
        {!logs.length && (
          <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
            There is no log in view to ask about — open the Logs tab and fetch a window first.
          </span>
        )}
      </div>

      {run ? <Answer run={run} onAsk={q => send(q, run.window)} /> : (
        <div className="flex-1 flex items-center justify-center px-8">
          <span className="text-[12px] leading-relaxed text-center" style={{ color: 'var(--color-text-muted)', maxWidth: 520 }}>
            Ask by id or in words over a time window. Every claim in the answer carries the lines it came from,
            each a click away in the Logs tab — evidence, not a summary you must trust.
          </span>
        </div>
      )}
    </div>
  );
}

/** Put one line on screen in the Logs tab, highlighted. */
function openLine(line: LogLine) {
  useK8sStore.setState({ linkedLine: { seq: line.seq, text: line.text }, pendingLink: undefined });
  useK8sStore.getState().setDetailTab('logs');
}

/** Show exactly these lines in the Logs tab, as one filter. */
function openLines(lines: LogLine[]) {
  const s = useK8sStore.getState();
  s.clearFieldFilters();
  s.setLogFilter(filterForLines(lines));
  s.setDetailTab('logs');
}

function Answer({ run, onAsk }: { run: AskRun; onAsk: (q: string) => void }) {
  const setVerdict = useDk8sAskLogStore(s => s.setVerdict);
  const [copied, setCopied] = useState(false);
  const a = run.answer;
  const cited = a ? citedLines(a) : [];
  const citedLog = cited.map(n => run.numbered.get(n)).filter((l): l is LogLine => !!l);
  const seconds = run.finishedAt ? ((run.finishedAt - run.startedAt) / 1000).toFixed(1) : undefined;
  const hms = (ts?: number) => (ts === undefined ? '?' : formatLogTime(ts).slice(0, 8));

  const copy = () => {
    void navigator.clipboard?.writeText(a ? answerText(a, run.numbered) : run.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const at = (n: number) => run.numbered.get(n);

  return (
    <div className="flex flex-1 min-h-0">
      {/* ── The answer ── */}
      <div className="flex-1 min-w-0 overflow-auto px-5 py-4 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold" style={{ letterSpacing: '0.05em', color: 'var(--color-text-secondary)' }}>ANSWER</span>
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            read {run.total.toLocaleString()} lines · {hms(run.from)}&ndash;{hms(run.to)}
            {seconds ? ` · ${seconds}s` : ''}
          </span>
          <div className="flex-1" />
          <ButtonView size="xs" variant="secondary" disabled={run.streaming || (!a && !run.text)} onClick={copy}
                      iconLeft={<CopyIcon size={IconSize.inline} />}>
            {copied ? 'Copied' : 'Copy'}
          </ButtonView>
          <ButtonView size="xs" variant="secondary" disabled={!citedLog.length} onClick={() => openLines(citedLog)}
                      iconLeft={<FileTextIcon size={IconSize.inline} />}>
            Open all in Logs
          </ButtonView>
        </div>

        <div className="text-[13px]" style={{ color: 'var(--color-text-primary)' }}>{run.question}</div>

        {run.streaming && (
          <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
            <SpinnerIcon size={IconSize.action} color={AI} />
            Reading {run.sent.toLocaleString()} of {run.total.toLocaleString()} lines{run.text ? ` · ${run.text.length.toLocaleString()} characters back` : '…'}
          </div>
        )}
        {run.error && (
          <div className="px-3 py-2 rounded-md text-[12px]"
               style={{ color: 'var(--color-error)', background: 'color-mix(in srgb, var(--color-error) 10%, transparent)' }}>
            {run.error}
          </div>
        )}

        {/* Prose when the model sent no JSON: shown as it came, with no
            citations drawn, because none were given. */}
        {!run.streaming && !a && run.text && (
          <div className="text-[12.5px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-primary)' }}>
            {run.text}
            <div className="mt-2 text-[11px]" style={{ color: 'var(--color-warning)' }}>
              This answer came back without its line numbers, so nothing in it links to the log.
            </div>
          </div>
        )}

        {a && (
          <>
            <div className="flex flex-col gap-2.5">
              {a.answer.map((p, i) => (
                <p key={i} className="m-0 text-[13px] leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
                  {p.text}
                  {p.cites.length > 0 && (
                    <button type="button" onClick={() => openLines(p.cites.map(at).filter((l): l is LogLine => !!l))}
                            title="Open these lines in Logs"
                            className="ml-1 px-1 rounded border-none cursor-pointer text-[11px] font-mono"
                            style={{ color: AI, background: `color-mix(in srgb, ${AI} 14%, transparent)` }}>
                      [{citeLabel(p.cites)}]
                    </button>
                  )}
                </p>
              ))}
            </div>

            {a.steps.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-bold" style={{ letterSpacing: '0.05em', color: 'var(--color-text-secondary)' }}>IN ORDER</span>
                  <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>every step carries the line it came from</span>
                </div>
                {a.steps.map((s, i) => {
                  const line = at(s.lines[0]);
                  const time = s.time ?? (line?.ts !== undefined ? formatLogTime(line.ts) : '');
                  const logger = s.logger ?? (line?.logger ? shortName(line.logger) : undefined);
                  return (
                    <div key={i} className="flex items-center gap-3 py-1.5 px-2 rounded"
                         style={{ background: 'var(--color-surface)' }}>
                      <span className="shrink-0 flex items-center justify-center rounded-full text-[10.5px] font-bold"
                            style={{ width: 20, height: 20, color: AI, background: `color-mix(in srgb, ${AI} 16%, transparent)` }}>
                        {i + 1}
                      </span>
                      <span className="shrink-0 font-mono text-[11.5px]" style={{ color: 'var(--color-text-muted)', width: 96 }}>{time}</span>
                      <span className="flex-1 min-w-0 text-[12.5px] truncate" title={s.text}
                            style={{ color: line?.level === 'error' ? 'var(--color-error)' : line?.level === 'warn' ? 'var(--color-warning)' : 'var(--color-text-primary)' }}>
                        {s.text}
                      </span>
                      {line && (
                        <button type="button" onClick={() => openLine(line)}
                                title={`Open line ${s.lines[0]} in Logs`}
                                className="shrink-0 flex items-center gap-0.5 border-none bg-transparent cursor-pointer text-[11.5px] font-mono"
                                style={{ color: 'var(--color-text-secondary)' }}>
                          {logger ?? `line ${s.lines[0]}`} <ChevronRightIcon size={IconSize.inline} />
                        </button>
                      )}
                    </div>
                  );
                })}
                {a.aggregates.map((g, i) => (
                  <div key={`g${i}`} className="flex items-center gap-3 py-1.5 px-2 rounded"
                       style={{ border: '1px dashed var(--color-surface-border)' }}>
                    <span className="shrink-0 flex items-center justify-center rounded-full text-[10.5px] font-bold"
                          style={{ width: 20, height: 20, color: 'var(--color-warning)', background: 'color-mix(in srgb, var(--color-warning) 16%, transparent)' }}>
                      {a.steps.length + i + 1}
                    </span>
                    <span className="flex-1 min-w-0 text-[12.5px]" style={{ color: 'var(--color-text-primary)' }}>
                      {g.text}{g.lines.length ? ` — ${g.lines.length} line${g.lines.length === 1 ? '' : 's'} behind this` : ''}
                    </span>
                    {g.lines.length > 0 && (
                      <button type="button" onClick={() => openLines(g.lines.map(at).filter((l): l is LogLine => !!l))}
                              className="shrink-0 flex items-center gap-0.5 border-none bg-transparent cursor-pointer text-[11.5px]"
                              style={{ color: 'var(--color-text-secondary)' }}>
                        see them <ChevronRightIcon size={IconSize.inline} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {a.followUps.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {a.followUps.map(f => (
                  <ChipView key={f} label={f} size="sm" onClick={() => onAsk(f)} title="Ask this over the same window" />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── What it read, and the lines behind it ── */}
      <div className="shrink-0 flex flex-col min-h-0 overflow-auto"
           style={{ width: 330, borderLeft: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }}>
        <div className="px-4 pt-4 pb-2 flex items-baseline gap-2">
          <span className="text-[11px] font-bold" style={{ letterSpacing: '0.05em', color: 'var(--color-text-secondary)' }}>THE LINES BEHIND IT</span>
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{cited.length} cited</span>
        </div>
        <div className="flex flex-col gap-2 px-4 pb-3">
          {cited.slice(0, 40).map(n => {
            const l = at(n)!;
            if (!l) return null;
            return (
              <button key={n} type="button" onClick={() => openLine(l)} title="Open this line in Logs"
                      className="flex flex-col gap-0.5 text-left border-none cursor-pointer px-2 py-1.5 rounded"
                      style={{ background: 'var(--color-panel)' }}>
                <span className="font-mono text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                  [{n}] {l.ts !== undefined ? formatLogTime(l.ts) : ''} {l.level !== 'other' ? l.level.toUpperCase() : ''} {l.logger ? shortName(l.logger) : ''}
                </span>
                <span className="font-mono text-[11px] break-words"
                      style={{ color: l.level === 'error' ? 'var(--color-error)' : l.level === 'warn' ? 'var(--color-warning)' : 'var(--color-text-primary)' }}>
                  {(l.message ?? l.text).slice(0, 240)}
                </span>
              </button>
            );
          })}
          {!cited.length && (
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              {run.streaming ? 'The lines appear with the answer.' : 'Nothing cited.'}
            </span>
          )}
        </div>

        <div className="px-4 py-3 flex flex-col gap-1.5" style={{ borderTop: '1px solid var(--color-surface-border)' }}>
          <span className="text-[11px] font-bold mb-1" style={{ letterSpacing: '0.05em', color: 'var(--color-text-secondary)' }}>WHAT IT READ</span>
          <Fact label="window" icon={<ClockIcon size={IconSize.inline} />}>{hms(run.from)} &ndash; {hms(run.to)}</Fact>
          <Fact label="lines">
            {run.total.toLocaleString()}{run.sent < run.total ? ` · ${run.sent.toLocaleString()} sent` : ''}
          </Fact>
          <Fact label="loggers touched">
            {(a?.loggers.length || run.loggersTouched.length).toLocaleString()} of {run.loggersKnown.toLocaleString()}
          </Fact>
          <Fact label="pod">{run.pod ? `…${run.pod.slice(-5)}` : '—'}</Fact>
          <div className="flex items-start gap-2 mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            <span className="shrink-0 pt-0.5"><ShieldIcon size={IconSize.action} /></span>
            <span>
              Secret values in the window are replaced before anything is sent, and the answer never carries one.
              {run.redactionNote ? ` Taken out of this one: ${run.redactionNote}.` : ''} Which provider answers the
              question is yours to choose in Settings.
            </span>
          </div>
        </div>

        <div className="mt-auto px-4 py-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--color-surface-border)' }}>
          <span className="text-[11.5px]" style={{ color: 'var(--color-text-secondary)' }}>Was this right?</span>
          <ButtonView size="xs" variant="secondary" disabled={run.streaming || !!run.error}
                      aria-label="Yes, this was right" title="Yes, this was right"
                      color={run.verdict === 'right' ? 'var(--color-success)' : undefined}
                      onClick={() => setVerdict(run.id, 'right')}
                      iconLeft={<ThumbUpIcon size={IconSize.inline} color="var(--color-success)" />} />
          <ButtonView size="xs" variant="secondary" disabled={run.streaming || !!run.error}
                      aria-label="No, this was wrong" title="No, this was wrong"
                      color={run.verdict === 'wrong' ? 'var(--color-error)' : undefined}
                      onClick={() => setVerdict(run.id, 'wrong')}
                      iconLeft={<ThumbDownIcon size={IconSize.inline} color="var(--color-error)" />} />
          <div className="flex-1" />
          <ButtonView size="xs" variant="secondary" disabled={!run.question}
                      title="Keep this question, to ask it again over the same length of window"
                      onClick={() => saveCheck(run.scope, run.question, run.window)}>
            Save as a check
          </ButtonView>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[11.5px]">
      <span className="flex items-center gap-1" style={{ color: 'var(--color-text-muted)', width: 110 }}>{icon}{label}</span>
      <span className="font-mono" style={{ color: 'var(--color-text-primary)' }}>{children}</span>
    </div>
  );
}
