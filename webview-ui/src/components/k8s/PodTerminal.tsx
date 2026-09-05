/**
 * A real terminal in the pod, in the panel.
 *
 * The tab used to be a launcher: a button that opened a VS Code terminal and
 * left you looking at the button. That is still offered — someone who wants
 * their own font, scrollback and shell integration should have it — but the
 * common case is one command and a glance at the output, and for that, leaving
 * the pod you are reading is the wrong trade.
 *
 * ── What makes this a terminal rather than a text box ──
 *
 * The far end has a PTY, so the shell echoes, `top` and `vi` draw properly,
 * Ctrl-C reaches the process, and the window size is negotiated rather than
 * assumed. All of that comes from the transport (`pod-terminal` on the host);
 * what this file owns is the surface and the fact that it is disposed of
 * properly, because a terminal that leaks is a shell process left running in
 * someone's production container.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  BadgeChipView, EmptyStateView, IconSize, SwatchPickerView, TableSkeletonView,
  resolveTerminalTheme, groundMode,
} from '@salilvnair/dui';
import {
  TerminalIcon, SparkleIcon, CopyIcon, TrashIcon, RefreshIcon, CloseIcon, LockIcon,
} from '../../icons';
import { postMsg } from '../../vscode';
import { useK8sStore } from '../../store/k8s-store';
import { useDk8sAiStore } from '../../store/dk8s-ai-store';
import { useDk8sTerminalStore } from '../../store/dk8s-terminal-store';
import { ACCENT, AI, OK, BAD, WARN, MUTED } from './tone';

type Phase = 'idle' | 'opening' | 'live' | 'ended' | 'error';

/**
 * The panel's own ground, which the palette does not touch.
 *
 * A terminal that picked its own background would stop matching the panel the
 * moment the panel changed — and the complaint was never the background, it
 * was that `ls` came back in an acid green nobody chose.
 */
function groundOf(el: HTMLElement): string {
  const cs = getComputedStyle(el);
  return cs.getPropertyValue('--color-surface').trim() || '#1e1e1e';
}

/**
 * The three `ls` colours that arrive with a green background.
 *
 * `ow` and `tw` are world-writable directories and `st` is the sticky bit, and
 * GNU coreutils paints all three black-on-green as a warning. In a container —
 * where `/tmp`, `/config` and any mounted volume are routinely world-writable
 * — that is most of a listing highlighted like an alarm.
 *
 * Only these three are set. `ls` falls back to its compiled-in defaults for
 * every key absent from LS_COLORS, so this leaves ordinary directories,
 * symlinks and executables exactly as they were; verified against a pod, where
 * /etc stayed its usual bold blue while /tmp and /config lost their green.
 *
 * The `clear` after it is what keeps the export from being the first thing in
 * the scrollback.
 */
const TIDY_LS = "export LS_COLORS='ow=01;36:tw=01;36:st=01;36'; clear\r";


export function PodTerminal() {
  const detail = useK8sStore(s => s.detail);
  const logContainer = useK8sStore(s => s.logContainer);
  const capabilities = useK8sStore(s => s.capabilities);
  const openVsCodeShell = useK8sStore(s => s.openVsCodeShell);
  const ask = useDk8sAiStore(s => s.ask);

  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const idRef = useRef<string>('');

  const [phase, setPhase] = useState<Phase>('opening');
  /*
    The palette, remembered per person rather than per pod.

    A terminal theme is a preference about how you like to read, not a property
    of the cluster — so it is stored, and it is the one thing here that
    survives closing the tab.
  */
  /*
    The palette and the preferences come from the settings store.

    They used to be a `useState` and a localStorage key right here, which was
    the right size for one swatch row and the wrong size the moment themes
    could be imported: the Settings tab and the terminal have to agree on
    which six are on the strip, and two copies of that never do.
  */
  const prefs = useDk8sTerminalStore(st => st.prefs);
  const activeId = useDk8sTerminalStore(st => st.active);
  const setActive = useDk8sTerminalStore(st => st.setActive);
  const palette = useDk8sTerminalStore(st => st.theme)();
  const strip = useDk8sTerminalStore(st => st.strip)();

  const [shell, setShell] = useState<string>();
  const [problem, setProblem] = useState<{
    error: string; suggestion?: string; suggestionLabel?: string;
  } | null>(null);

  const container = logContainer ?? detail?.containers[0]?.name ?? '';

  /*
    Held in a ref because the xterm key handler is attached once, on mount, and
    would otherwise close over the first render's `end` forever.
  */
  const endRef = useRef<() => void>(() => {});

  /*
    One session id per mount, generated here.

    The host validates it against a fixed shape and refuses anything else, so
    it is not a secret — it is a key. Generating it in the component means a
    remount is unambiguously a NEW terminal rather than a second claim on the
    old one, which is what leaves orphaned shells behind.
  */
  const newId = () => `t${Math.random().toString(36).slice(2, 10)}`;

  const start = useCallback(() => {
    if (!detail || !container) return;
    const id = newId();
    idRef.current = id;
    setProblem(null);
    setPhase('opening');
    termRef.current?.clear();
    postMsg({
      type: 'term:open', id,
      context: detail.context, namespace: detail.namespace,
      pod: detail.name, container,
    });
  }, [detail, container]);

  /*
    Opened on arrival, not on a button.

    The tab is called Terminal and there is exactly one thing it does; a
    splash screen explaining that, with a button that does the only available
    action, is a click between the reader and the thing they asked for. The
    explanation it carried is worth keeping — it now lives in the footer,
    where it does not stand in the way.

    Guarded on the id so a re-render never opens a second shell.
  */
  useEffect(() => {
    const noShell = capabilities && !capabilities.shell && !capabilities.unreachable;
    if (noShell) { setPhase('idle'); return; }
    if (!prefs.openOnArrival) { setPhase(p => (p === 'opening' ? 'idle' : p)); return; }
    if (!idRef.current && phase === 'opening' && detail && container) start();
  }, [detail, container, phase, start, capabilities, prefs.openOnArrival]);

  // ── the xterm instance, created once ──────────────────────────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily: prefs.fontFamily,
      fontSize: prefs.fontSize,
      lineHeight: prefs.lineHeight,
      cursorBlink: prefs.cursorBlink,
      cursorStyle: prefs.cursorStyle,
      /*
        Ten thousand lines, not the default thousand.

        A `kubectl logs`-sized dump or a `find /` inside a container blows past
        a thousand instantly, and losing the top of the output is losing the
        part that said what went wrong. Ten thousand lines of a 200-column
        terminal is a few megabytes, which is affordable for something that
        lives as long as a tab.
      */
      scrollback: prefs.scrollback,
      theme: resolveTerminalTheme(palette, groundMode(groundOf(host)), groundOf(host)),
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    /*
      Copy on select, when it is asked for.

      Off by default because this terminal lives inside an editor, where
      selecting text does NOT usually put it on the clipboard — matching the
      surrounding application beats matching xterm's own tradition. On, it
      behaves the way a terminal does.
    */
    const onSel = term.onSelectionChange(() => {
      if (!useDk8sTerminalStore.getState().prefs.copyOnSelect) return;
      const sel = term.getSelection();
      if (sel) void navigator.clipboard?.writeText(sel);
    });

    const onData = term.onData(d => {
      if (idRef.current) postMsg({ type: 'term:input', id: idRef.current, data: d });
    });

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        if (idRef.current) {
          postMsg({
            type: 'term:resize', id: idRef.current,
            cols: term.cols, rows: term.rows,
          });
        }
      } catch { /* the panel is mid-layout; the next tick will settle it */ }
    });
    ro.observe(host);

    return () => {
      /*
        Disposed in this order, and always.

        Closing the session first means the far end stops writing before the
        renderer goes away; disposing first would leave data arriving for a
        terminal that no longer exists. And the session must close on unmount
        at all — a shell that outlives its tab is a process in a container that
        nobody can see and nobody will end.
      */
      if (idRef.current) postMsg({ type: 'term:close', id: idRef.current });
      idRef.current = '';
      ro.disconnect();
      onSel.dispose();
      onData.dispose();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  /*
    Repainting a live terminal, rather than rebuilding it.

    xterm applies a new theme to everything already on screen, so switching
    mid-session keeps the scrollback — recreating the instance would clear it,
    and losing the output you were reading to change its colour is a bad trade.
  */
  useEffect(() => {
    const host = hostRef.current;
    const term = termRef.current;
    if (!term || !host) return;
    const bg = groundOf(host);
    term.options.theme = resolveTerminalTheme(palette, groundMode(bg), bg);
    /*
      Type and cursor are applied the same way, and for the same reason.

      Every one of these is a live option on the instance; rebuilding the
      terminal to change a font size would clear the scrollback, and losing the
      output you were reading in order to make it bigger is a bad trade.
      Re-fitting after is what keeps the column count honest — a larger font in
      the same box is fewer columns, and the far end has to be told.
    */
    term.options.fontFamily = prefs.fontFamily;
    term.options.fontSize = prefs.fontSize;
    term.options.lineHeight = prefs.lineHeight;
    term.options.cursorBlink = prefs.cursorBlink;
    term.options.cursorStyle = prefs.cursorStyle;
    term.options.scrollback = prefs.scrollback;
    try {
      fitRef.current?.fit();
      if (idRef.current) {
        postMsg({ type: 'term:resize', id: idRef.current, cols: term.cols, rows: term.rows });
      }
    } catch { /* mid-layout; the observer will settle it */ }
  }, [palette, prefs]);

  // ── host messages ─────────────────────────────────────────────────────
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const m = e.data;
      if (!m || typeof m.type !== 'string') return;
      if (m.id && m.id !== idRef.current) return;

      switch (m.type) {
        case 'term:opened':
          setPhase('live');
          setShell(String(m.shell ?? ''));
          {
            const t = termRef.current;
            if (t) {
              postMsg({ type: 'term:resize', id: idRef.current, cols: t.cols, rows: t.rows });
              if (useDk8sTerminalStore.getState().prefs.tidyLsColors) {
                postMsg({ type: 'term:input', id: idRef.current, data: TIDY_LS });
              }
              t.focus();
            }
          }
          break;
        case 'term:data':
          termRef.current?.write(String(m.data ?? ''));
          break;
        case 'term:exit':
          setPhase('ended');
          idRef.current = '';
          termRef.current?.write(`\r\n\x1b[38;5;244m── ${String(m.reason ?? 'ended')} ──\x1b[0m\r\n`);
          break;
        case 'term:error':
          setPhase('error');
          idRef.current = '';
          setProblem({
            error: String(m.error ?? 'The terminal could not be opened.'),
            suggestion: m.suggestion ? String(m.suggestion) : undefined,
            suggestionLabel: m.suggestionLabel ? String(m.suggestionLabel) : undefined,
          });
          break;
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  /** Everything on screen, for copy and for the model. */
  const buffer = () => {
    const t = termRef.current;
    if (!t) return '';
    const lines: string[] = [];
    for (let i = 0; i < t.buffer.active.length; i++) {
      lines.push(t.buffer.active.getLine(i)?.translateToString(true) ?? '');
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  };

  const askAi = () => {
    if (!detail) return;
    const sel = termRef.current?.getSelection()?.trim();
    /*
      The selection when there is one, the visible buffer when there is not.

      A terminal is mostly prompt and echo; sending all ten thousand lines of
      scrollback would bury the thing being asked about in shell noise. What is
      ON SCREEN is what the reader is looking at, which is the same rule the
      file viewer's Ask AI follows.
    */
    const text = sel || buffer().split('\n').slice(-120).join('\n');
    ask({
      promptKey: 'dk8s.log.askWhy',
      title: sel ? 'Explain this output' : 'Explain what this shell shows',
      evidence: text,
      evidenceLabel: sel
        ? `TERMINAL SELECTION (${sel.split('\n').length} lines)`
        : 'TERMINAL, LAST 120 LINES',
      podContext: {
        pod: detail.name, namespace: detail.namespace, phase: detail.phase,
        restarts: detail.restarts, reason: detail.reason,
        image: detail.containers[0]?.image, container,
      },
    });
  };

  const end = useCallback(() => {
    if (idRef.current) postMsg({ type: 'term:close', id: idRef.current });
    idRef.current = '';
    setPhase('ended');
  }, []);
  endRef.current = end;

  /*
    Escape closes the terminal, the way it closes an opened file.

    On `window`, in the capture phase, for the same reason the file viewer's is
    — the pod detail listens for Escape too and goes back to the grid, and a
    key that ended your shell AND threw away the pod would be worse than no
    key at all. Capture runs before anything deeper in the path, and
    `stopImmediatePropagation` is what actually stops the pod's handler, which
    is registered on the same object.

    It also means xterm never sees the key, so the shell is not sent an ESC on
    its way out. Nothing is lost by that: Ctrl-[ IS Escape on every terminal,
    it does not match here, and it still reaches the shell untouched — which is
    what vi users reach for anyway. The footer says so, because a key that ends
    a shell should not be a surprise.

    Only while a shell is live. Once it has ended, Escape means what it means
    everywhere else in the pod: go back.
  */
  useEffect(() => {
    if (phase !== 'live' || !prefs.escapeCloses) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      endRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [phase, prefs.escapeCloses]);

  const distroless = capabilities && !capabilities.shell && !capabilities.unreachable;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── bar ── */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 flex-shrink-0 flex-wrap"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <TerminalIcon size={IconSize.action} color={ACCENT} />
        <span className="text-[11px] font-mono" style={{ color: 'var(--color-text-primary)' }}>
          {container || 'no container'}
        </span>

        {phase === 'live' && <BadgeChipView tone={OK} size="xs">live</BadgeChipView>}
        {phase === 'opening' && <BadgeChipView tone={ACCENT} size="xs">connecting</BadgeChipView>}
        {phase === 'ended' && <BadgeChipView tone={MUTED} size="xs">ended</BadgeChipView>}
        {phase === 'error' && <BadgeChipView tone={BAD} size="xs">failed</BadgeChipView>}
        {shell && phase === 'live' && (
          <BadgeChipView tone={ACCENT} size="xs">{shell}</BadgeChipView>
        )}
        {phase === 'live' && <BadgeChipView tone={WARN} size="xs">tty</BadgeChipView>}

        <span className="flex-1" />

        {/* The palette, chosen by looking at it. Names are tooltips: nobody
            picks a terminal theme from a word. */}
        <SwatchPickerView
          options={strip.map(t => ({ id: t.id, label: t.label, color: t.swatch }))}
          value={activeId}
          onChange={setActive}
          size={16}
          initials
          style={{ marginRight: 4 }}
        />

        {phase === 'live' && (
          <button type="button" onClick={askAi} title="Ask AI about what is on screen"
                  className="border-none bg-transparent p-0 cursor-pointer">
            <BadgeChipView tone={AI} style={{ gap: 3 }}>
              <SparkleIcon size={IconSize.chip} /> Ask AI
            </BadgeChipView>
          </button>
        )}
        <IconBtn label="Copy everything on screen"
                 onClick={() => void navigator.clipboard?.writeText(buffer())}>
          <CopyIcon size={IconSize.inline} />
        </IconBtn>
        <IconBtn label="Clear the screen" onClick={() => termRef.current?.clear()}>
          <TrashIcon size={IconSize.inline} />
        </IconBtn>
        {(phase === 'ended' || phase === 'error') && (
          <IconBtn label="Open a new shell" onClick={start}>
            <RefreshIcon size={IconSize.inline} />
          </IconBtn>
        )}
        {phase === 'live' && (
          <IconBtn label="End this shell (Esc)" onClick={end}>
            <CloseIcon size={IconSize.inline} />
          </IconBtn>
        )}
      </div>

      {/* ── the terminal itself, always mounted ──
          Kept in the tree rather than swapped out, because xterm measures the
          font on open and a hidden element measures as zero — which is how an
          embedded terminal ends up one column wide. */}
      <div className="flex-1 min-h-0 relative" style={{ background: 'var(--color-surface)' }}>
        <div ref={hostRef} className="absolute inset-0"
             style={{
               padding: '6px 8px',
               opacity: phase === 'live' || phase === 'ended' ? 1 : 0,
             }} />

        {/* Connecting: a prompt-shaped skeleton rather than a spinner.
            The shell probe and the socket take a beat, and an empty black
            rectangle for that beat reads as broken. This reads as loading
            because it is the shape of what is about to arrive. */}
        {phase === 'opening' && (
          <div className="absolute inset-0" style={{ padding: '10px 12px' }}>
            <TableSkeletonView rows={7} columns={[{ width: '14%' }, { width: '46%' }]} />
          </div>
        )}

        {(phase === 'idle' || phase === 'error') && (
          <div className="absolute inset-0 grid place-items-center px-8">
            <EmptyStateView
              variant="medallion"
              icon={phase === 'error' ? <LockIcon size={IconSize.medallion} />
                : <TerminalIcon size={IconSize.medallion} />}
              title={phase === 'error' ? 'That shell did not open'
                : distroless ? 'No shell in this container'
                  : 'Open a shell in this pod'}
              message={problem?.error ?? (distroless
                ? 'This container looks distroless — there is nothing to exec into. '
                  + 'A debug container with a shell in it is the way in.'
                : 'A real PTY in this pod, over the Kubernetes exec API — no port is '
                  + 'opened and no credential leaves your machine.')}
              accentColor={phase === 'error' ? WARN : ACCENT}
              action={distroless ? undefined
                : { label: phase === 'error' ? 'Try again' : 'Open terminal', onClick: start }}
              hints={problem?.suggestion
                ? [{ key: <TerminalIcon size={IconSize.action} />, text: problem.suggestion }]
                : undefined}
            />
          </div>
        )}
      </div>

      {/* ── the other way, kept ──
          `py-2`, not `py-1`: the chip is 15px in a 23px strip, which left it
          sitting on the panel's bottom edge with nothing under it. A control
          flush against an edge reads as clipped rather than as placed. */}
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
           style={{ borderTop: '1px solid var(--color-surface-border)' }}>
        <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {phase === 'live'
            ? 'Esc closes this shell · Ctrl-[ still sends Escape to it'
            : 'Prefer your own terminal, with your font and shell integration?'}
        </span>
        <button type="button" onClick={openVsCodeShell}
                className="border-none bg-transparent p-0 cursor-pointer">
          <BadgeChipView tone={MUTED} size="xs">open in vs code</BadgeChipView>
        </button>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, children }: {
  label: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button" title={label} aria-label={label} onClick={onClick}
      className="flex items-center justify-center rounded"
      style={{
        width: 20, height: 18, cursor: 'pointer',
        color: 'var(--color-text-muted)', background: 'transparent', border: 'none',
      }}
    >{children}</button>
  );
}
