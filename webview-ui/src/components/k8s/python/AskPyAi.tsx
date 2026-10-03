/**
 * "Ask AI" for the open script: a question, or a change, about THIS script in
 * THIS container.
 *
 * What the model is handed is what a colleague would be shown: the script,
 * the lines selected in it, the last run's output and exit, and the problems
 * the container's own python found. The prompt is the Prompt Library's
 * "Ask AI (Python)" — its system half says who the model is and to answer as
 * JSON (what and why, and the whole script when it changes), its user half
 * carries these values — so it can be read and changed in Settings like every
 * other prompt.
 *
 * A proposed script is never applied on its own. It is shown with how many
 * lines it changes, and "Apply to script" puts it in the editor as an unsaved
 * change, where Ctrl+Z still has the old one.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ButtonView, PopoverView, MarkdownView, IconSize } from '@salilvnair/dui';
import { SparkleIcon, PythonIcon, CloseIcon } from '../../../icons';
import { ColoredCode } from './ColoredCode';
import { usePyStore, type PyRun, type PyTarget } from '../../../store/dk8s-python-store';
import { usePyIntelStore } from '../../../store/dk8s-py-intel-store';
import { useAiPromptTemplatesStore } from '../../../store/prompt-template';
import { askOnce, type AiOnce } from '../../../services/ai/ai-once';
import { copyText } from '../../../utils/clipboard';
import { selectionOf } from './PyEditor';
import { AI as AI_ACCENT, MUTED, BAD } from '../tone';
import { useCopyTick, CopyGlyph } from '../../shared/CopyTick';

/** Python's own green, for the proposed-script card. */
const PY_GREEN = 'var(--color-success)';

const label: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED,
};

/** Open Ask AI with a question — sent straight away when `send` is set. */
export const PY_ASK_EVENT = 'daakia:py-ask';
export function askPyAi(question: string, send = false): void {
  window.dispatchEvent(new CustomEvent(PY_ASK_EVENT, { detail: { question, send } }));
}

/** The last run, told briefly: how it ended and the end of what it printed. */
export function describeRun(run: PyRun | undefined): string {
  if (!run) return 'not run yet';
  const out = run.chunks.filter(c => c.stream !== 'meta').map(c => c.text).join('');
  const tail = out.split('\n').slice(-40).join('\n').trim();
  const how = run.refused ? `refused: ${run.refused}`
    : run.status === 'running' ? 'still running'
      : `exit ${run.code ?? '—'}${run.durationMs !== undefined ? ` after ${run.durationMs}ms` : ''}`;
  return `${how}${tail ? `\n${tail}` : ''}`;
}

/**
 * One string field out of JSON that may have been cut off — the value up to
 * where it stops, and whether its closing quote ever came.
 */
function jsonStringField(body: string, key: string): { value: string; closed: boolean } | undefined {
  const m = new RegExp(`"${key}"\\s*:\\s*"`).exec(body);
  if (!m) return undefined;
  let i = m.index + m[0].length;
  let raw = '';
  while (i < body.length) {
    const c = body[i];
    if (c === '\\') { raw += body.slice(i, i + 2); i += 2; continue; }
    if (c === '"') return { value: decodeJsonString(raw), closed: true };
    raw += c; i++;
  }
  /* Cut mid-escape: drop the half of it that arrived. */
  return { value: decodeJsonString(raw.replace(/\\(u[0-9a-fA-F]{0,3})?$/, '')), closed: false };
}

function decodeJsonString(raw: string): string {
  try { return JSON.parse(`"${raw}"`) as string; } catch { return raw.replace(/\\n/g, '\n').replace(/\\"/g, '"'); }
}

/**
 * The answer, read leniently: a fenced or bare JSON object, else the text as
 * the answer. A reply cut off by its length limit is still JSON up to where it
 * stopped — the answer and as much of the script as came, marked `cut`, rather
 * than the raw object on screen.
 */
export function readAnswer(text: string): { answer: string; code: string; cut?: true } {
  const body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    const v = JSON.parse(body) as { answer?: unknown; code?: unknown };
    return { answer: String(v.answer ?? ''), code: typeof v.code === 'string' ? v.code : '' };
  } catch {
    const answer = body.startsWith('{') ? jsonStringField(body, 'answer') : undefined;
    if (!answer) return { answer: text.trim(), code: '' };
    const code = jsonStringField(body, 'code');
    return { answer: answer.value, code: code?.value ?? '', cut: true };
  }
}

/** "+3 −1 lines" — how much a proposed script changes, counted by line. */
export function lineChange(before: string, after: string): { added: number; removed: number } {
  const a = before.split('\n');
  const b = after.split('\n');
  const count = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
  const ca = count(a);
  const cb = count(b);
  let added = 0;
  let removed = 0;
  for (const [line, n] of cb) added += Math.max(0, n - (ca.get(line) ?? 0));
  for (const [line, n] of ca) removed += Math.max(0, n - (cb.get(line) ?? 0));
  return { added, removed };
}

/** The popover's width; its hidden anchor is as wide, so it opens leftward from the button.
    Wide enough for a script to read without wrapping every other line. */
const POP_W = 'min(780px, 92vw)';

export function AskPyAi({ scriptId, target, pythonVersion, lastRun, size = 'md', dock, hideButton }: {
  /** The button's height — see `PyToolbarSize`. */
  size?: 'sm' | 'md';
  /** No button of its own: opened from a menu, through `askPyAi`. */
  hideButton?: boolean;
  /**
   * A side panel to answer in instead of a popover — the Scripts screen's.
   * The button opens and closes it, lit while it is open.
   */
  dock?: { el: HTMLElement | null; open: boolean; setOpen: (open: boolean) => void };
  scriptId?: string;
  target?: PyTarget;
  pythonVersion?: string;
  lastRun?: PyRun;
}) {
  const script = usePyStore(s => s.scripts.find(x => x.id === scriptId));
  const draft = usePyStore(s => (scriptId ? s.drafts[scriptId] : undefined));
  const editSource = usePyStore(s => s.editSource);
  const intel = usePyIntelStore(s => (scriptId ? s.byScript[scriptId] : undefined));
  const resolve = useAiPromptTemplatesStore(s => s.resolve);
  const [popOpen, setPopOpen] = useState(false);
  const open = dock ? dock.open : popOpen;
  const setOpen = (next: boolean | ((o: boolean) => boolean)) => {
    const v = typeof next === 'function' ? next(open) : next;
    if (dock) dock.setOpen(v); else setPopOpen(v);
  };
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ answer: string; code: string; asked: string; cut?: true } | undefined>();
  const { copied, flash } = useCopyTick();
  const pending = useRef<AiOnce | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const popAnchor = useRef<HTMLSpanElement>(null);

  const source = draft?.source ?? script?.source ?? '';
  const name = draft?.name ?? script?.name ?? 'script.py';
  const failed = !!lastRun && (lastRun.status === 'failed' || !!lastRun.refused);

  const chips = useMemo(() => [
    ...(failed ? ['Fix the last error'] : []),
    ...(intel?.diagnostics.length ? ['Fix the problems the container found'] : []),
    'Explain what this script does',
    'Add error handling and a clear exit code',
    'Print the result as JSON',
  ], [failed, intel?.diagnostics.length]);

  const ask = (q: string) => {
    const text = q.trim();
    if (!text || !scriptId) return;
    pending.current?.cancel();
    setBusy(true);
    setError('');
    setResult(undefined);
    const problems = [
      ...(intel?.diagnostics ?? []).map(d => `line ${d.line}: ${d.message}`),
      ...(lastRun?.problems ?? []).map(p => `line ${p.line}: ${p.message} (at run time)`),
    ];
    const vars = {
      pythonVersion: pythonVersion ?? 'the container’s',
      container: target?.container ?? 'the pod’s default container',
    };
    const call = askOnce({
      stage: 'dk8s.python.ask',
      screen: 'dk8s · Python',
      systemPrompts: [resolve('dk8s.python.ask.system', vars)],
      userPrompt: resolve('dk8s.python.ask', {
        question: text,
        scriptName: name,
        script: source,
        selection: selectionOf(scriptId) || 'none',
        lastRun: describeRun(lastRun),
        problems: problems.length ? problems.join('\n') : 'none',
      }),
      /* A whole script comes back inside the JSON, so it needs the room: at 2,400 a
         longer one was cut off mid-line. */
      settings: { temperature: 0.2, maxTokens: 8000, responseFormat: 'json_object' },
    }, 60_000);
    pending.current = call;
    call.text.then(
      t => { setResult({ ...readAnswer(t), asked: text }); setBusy(false); },
      e => { if ((e as Error).message !== 'cancelled') setError((e as Error).message); setBusy(false); },
    );
  };

  /* The editor's right-click menu asks through here: "Explain this", "Ask AI about the selection". */
  const askRef = useRef(ask);
  askRef.current = ask;
  useEffect(() => {
    const onAsk = (e: Event) => {
      const q = String((e as CustomEvent).detail?.question ?? '');
      setOpenRef.current(true);
      /* Opened from a menu with nothing to ask: keep what was typed. */
      if (q) setQuestion(q);
      if (q && (e as CustomEvent).detail?.send) askRef.current(q);
    };
    window.addEventListener(PY_ASK_EVENT, onAsk);
    return () => window.removeEventListener(PY_ASK_EVENT, onAsk);
  }, []);

  const change = result?.code ? lineChange(source, result.code) : undefined;

  const docked = !!dock;
  const body = (
        <div className="flex flex-col"
             style={docked
               ? { width: '100%', height: '100%', minHeight: 0, background: 'var(--color-surface-secondary, var(--color-surface))' }
               : { width: POP_W, maxHeight: 'min(860px, 88vh)', overflow: 'hidden', borderRadius: 'inherit' }}>
          <div className="flex items-center gap-2 px-3.5 py-2.5 flex-shrink-0"
               style={{
                 borderBottom: '1px solid var(--color-surface-border)',
                 background: `linear-gradient(135deg, color-mix(in srgb, ${AI_ACCENT} 18%, transparent), transparent 70%)`,
               }}>
            <SparkleIcon size={IconSize.action} color={AI_ACCENT} />
            <span className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>Ask AI about {name}</span>
            <span className="text-[11px] ml-auto flex-shrink-0" style={{ color: MUTED }}>
              {pythonVersion ? `python ${pythonVersion}` : 'python'}{target?.container ? ` · ${target.container}` : ''}
            </span>
            {docked && (
              <button type="button" onClick={() => setOpen(false)} aria-label="Close Ask AI" title="Close"
                      className="inline-flex items-center justify-center border-none bg-transparent cursor-pointer rounded"
                      style={{ width: 22, height: 22, color: MUTED }}>
                <CloseIcon size={IconSize.action} />
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2 p-3.5 flex-shrink-0">
            <textarea
              autoFocus
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ask(question); }}
              rows={3}
              placeholder="Fix the error · add retries to the request · explain what this does"
              className="w-full rounded-md px-2.5 py-2 text-[12px] resize-y"
              style={{ background: 'var(--color-panel, var(--color-surface))', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)', outlineColor: AI_ACCENT }}
            />
            <div className="flex flex-wrap gap-1.5">
              {chips.map(c => (
                <button key={c} type="button" onClick={() => { setQuestion(c); ask(c); }}
                        className="px-2.5 rounded-full text-[11px] cursor-pointer"
                        style={{ height: 22, border: `1px solid color-mix(in srgb, ${AI_ACCENT} 45%, transparent)`, background: `color-mix(in srgb, ${AI_ACCENT} 8%, transparent)`, color: 'var(--color-text-secondary)' }}>
                  {c}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10.5px]" style={{ color: MUTED }}>
                Sends the script, the selection, the last run and the problems found. Ctrl+Enter asks.
              </span>
              <span className="flex-1" />
              {busy ? (
                <ButtonView size="sm" variant="secondary" onClick={() => { pending.current?.cancel(); setBusy(false); }}>Stop</ButtonView>
              ) : (
                <ButtonView size="sm" variant="secondary" accentColor={AI_ACCENT} color={AI_ACCENT}
                            disabled={!question.trim()} onClick={() => ask(question)}>
                  Ask
                </ButtonView>
              )}
            </div>
          </div>

          {(busy || error || result) && (
            <div className="flex flex-col gap-2 px-3.5 pb-3.5 overflow-y-auto overflow-x-hidden min-h-0"
                 style={{ borderTop: '1px solid var(--color-surface-border)', ...(docked ? { flex: 1 } : {}) }}>
              <div className="pt-2.5" style={label}>answer</div>
              {busy && <span className="text-[12px]" style={{ color: MUTED }}>Thinking about {name}…</span>}
              {error && <span className="text-[12px]" style={{ color: BAD }}>{error}</span>}
              {result && (
                <>
                  {result.answer && (
                    <div className="text-[12.5px]" style={{ color: 'var(--color-text-primary)' }}>
                      <MarkdownView content={result.answer} />
                    </div>
                  )}
                  {result.cut && (
                    <div role="alert" className="text-[11.5px] px-2.5 py-1.5 rounded-md"
                         style={{ color: 'var(--color-warning)', background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)',
                           border: '1px solid color-mix(in srgb, var(--color-warning) 35%, transparent)' }}>
                      The answer stopped before it was finished{result.code ? ', so the script below is only part of one and cannot be applied' : ''}.
                      Ask again, or ask for something shorter.
                    </div>
                  )}
                  {result.code && change && (
                    <div className="flex flex-col rounded-lg overflow-hidden"
                         style={{ border: `1px solid color-mix(in srgb, ${PY_GREEN} 35%, var(--color-surface-border))` }}>
                      <div className="flex items-center gap-2 px-2.5 py-1.5"
                           style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${PY_GREEN} 14%, transparent), color-mix(in srgb, ${AI_ACCENT} 10%, transparent))` }}>
                        <PythonIcon size={IconSize.action} color={PY_GREEN} />
                        {change.added || change.removed ? (
                          <>
                            <span className="text-[11px] font-mono" style={{ color: 'var(--color-success)' }}>+{change.added}</span>
                            <span className="text-[11px] font-mono" style={{ color: BAD }}>−{change.removed}</span>
                            <span className="text-[11px]" style={{ color: MUTED }}>lines in the proposed {name}</span>
                          </>
                        ) : (
                          <span className="text-[11px]" style={{ color: MUTED }}>No change to {name} — it already reads like this</span>
                        )}
                        <span className="flex-1" />
                        <ButtonView size="xs" variant="secondary"
                                    iconLeft={<CopyGlyph copied={copied} size={IconSize.chip} />}
                                    onClick={async () => { if (await copyText(result.code)) flash(); }}>
                          Copy code
                        </ButtonView>
                        {!result.cut && (change.added > 0 || change.removed > 0) && (
                          <ButtonView size="xs" variant="secondary" accentColor="var(--color-success)" color="var(--color-success)"
                                      onClick={() => { if (scriptId) editSource(scriptId, result.code); if (!docked) setOpen(false); }}>
                            Apply to script
                          </ButtonView>
                        )}
                      </div>
                      <ColoredCode code={result.code} maxHeight={docked ? 620 : 480} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {docked && !busy && !error && !result && (
            <div className="flex-1 grid place-items-center px-6 text-center text-[11.5px] leading-relaxed" style={{ color: MUTED }}>
              Ask about the script beside it — fix the last error, change what it does, or explain a line.
              Right-click a line or a selection in the editor to ask about just that.
            </div>
          )}
        </div>
  );

  return (
    <span ref={anchor} className="inline-flex relative">
      {!hideButton && <ButtonView size={size} variant="secondary" accentColor={AI_ACCENT} color={AI_ACCENT}
                  aria-pressed={docked ? open : undefined}
                  iconLeft={<SparkleIcon size={IconSize.action} color={AI_ACCENT} />}
                  disabled={!scriptId}
                  title={docked
                    ? open ? 'Hide the Ask AI panel' : 'Ask AI about this script, in a panel beside it'
                    : 'Ask AI about this script — fix it, change it, or explain it'}
                  onClick={() => setOpen(o => !o)}
                  style={docked && open
                    ? { background: `color-mix(in srgb, ${AI_ACCENT} 18%, transparent)`, borderColor: `color-mix(in srgb, ${AI_ACCENT} 50%, transparent)` }
                    : undefined}>
        Ask AI
      </ButtonView>}
      {/* The popover opens at its anchor's left edge; an invisible anchor as
          wide as the popover and flush with the button's right edge makes it
          open leftward, under the button, instead of off the window's edge. */}
      <span ref={popAnchor} aria-hidden className="absolute pointer-events-none"
            style={{ right: 0, top: 0, bottom: 0, width: POP_W, visibility: 'hidden' }} />
      {docked
        ? (open && dock.el ? createPortal(body, dock.el) : null)
        : (
          <PopoverView open={open} onClose={() => setOpen(false)} anchorEl={popAnchor.current} placement="bottom" borderRadius={12} className="dk-pop-flush">
            {body}
          </PopoverView>
        )}
    </span>
  );
}
