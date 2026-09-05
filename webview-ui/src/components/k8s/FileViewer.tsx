/**
 * Reading one file out of a pod.
 *
 * Hand-built rather than Monaco, and Monaco is already a dependency here — so
 * "it costs nothing, it is installed" was the argument, and it is the weaker
 * one once the view is read-only. Almost everything Monaco carries goes unused:
 * the editing model, the undo stack, IntelliSense, the worker per language.
 * What is left is syntax colour and line numbers, and mounting a second engine
 * inside the same tab buys a different find widget and a different scrollbar.
 *
 * Redaction decided it. Masking a value and hanging a chip off it is one span
 * in a view we render; in Monaco it is a decoration plus a view zone arguing
 * with a tokenizer that already classified the line as a string. When the
 * security-relevant behaviour is easier to get right in our own renderer, that
 * is where it belongs.
 *
 * What that costs, stated: real highlighting for real programming languages.
 * The tokenizer here covers key/value, YAML, JSON, shell and logs — nearly
 * everything in a container that is not shipping its own source.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CopyIcon, DownloadIcon, EyeIcon, CloseIcon, SparkleIcon } from '../../icons';
import { ContextMenuView, BadgeChipView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useDk8sAiStore } from '../../store/dk8s-ai-store';
import { useK8sStore } from '../../store/k8s-store';
import { redactLines, copyText, type RedactedLine } from './file-redact';

const ACCENT = 'var(--color-dk8s)';
/** The one control here that sends the file somewhere, so it keeps its violet. */
const AI_TONE = 'var(--color-primary-light)';

type Line = RedactedLine;

export function FileViewer({
  context, namespace, pod, container, path, name, size, onClose,
}: {
  context: string; namespace: string; pod: string; container?: string;
  path: string; name: string; size?: number; onClose: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [tooLarge, setTooLarge] = useState(false);
  const [binary, setBinary] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  /*
    The viewer's own menu, because the browser's is wrong here.

    Right-clicking a read-only file offered Copy and Select All — and Copy was
    the dangerous one: it takes the raw selection, which on a masked line is
    the bullets, and on a REVEALED line is a secret the panel is careful about
    everywhere else. The menu below routes through `copyText`, which is the
    rule the copy button already follows.
  */
  const [menu, setMenu] = useState<{ x: number; y: number; selection: string } | null>(null);
  const seq = useRef(0);
  const askAi = useDk8sAiStore(s => s.ask);
  const detail = useK8sStore(s => s.detail);

  useEffect(() => {
    const requestId = `fv-${++seq.current}`;
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMsg);
      setError('The pod did not answer in time.');
    }, 30_000);
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== 'files:read' || e.data?.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener('message', onMsg);
      if (e.data.error) setError(e.data.error);
      else if (e.data.tooLarge) setTooLarge(true);
      else if (e.data.binary) setBinary(true);
      else setText(e.data.text ?? '');
    };
    window.addEventListener('message', onMsg);
    postMsg({ type: 'files:read', requestId, context, namespace, pod, container, path, size });
    return () => { clearTimeout(timer); window.removeEventListener('message', onMsg); };
  }, [context, namespace, pod, container, path, size]);

  const lines: Line[] = useMemo(
    () => (text === null ? [] : redactLines(text)), [text]);

  /*
    Shell files get the shell renderer.

    By extension, plus the shebang — a container is full of executable scripts
    with no extension at all, and `#!/bin/sh` is a better statement of what a
    file is than its name ever was.
  */
  const isShell = /\.(sh|bash|zsh|ksh)$/i.test(name)
    || /^#!.*(sh|bash|zsh|ksh)/.test(text?.slice(0, 80) ?? '');

  /*
    Escape closes the file, and stops there.

    Without it the key reached the pod detail's own Escape handler, which goes
    back to the grid — so dismissing a file you had just opened threw away the
    pod as well.

    `stopImmediatePropagation`, not `stopPropagation`. Both handlers listen on
    `window`; the pod's is a bubble listener and this is a capture one, so this
    runs first, but `stopPropagation` only stops the event reaching the NEXT
    object in the path and window is already the last. Listeners on the same
    object keep running unless the immediate form is used — which is exactly
    the case here, and why the first attempt still closed the pod.
  */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const maskedCount = lines.filter(
    l => l.secretFrom !== undefined && !revealed.has(l.n)).length;

  /**
   * Copy takes what is on screen.
   *
   * That is the whole rule, and it is what makes masking safe to offer: a
   * masked value copies masked, so pasting into a ticket cannot leak something
   * the screen was hiding. Revealing is the deliberate act, and from then on
   * copy carries it — because copy has not stopped meaning "what I can see".
   * The alternative, a clipboard quietly holding a secret the screen did not
   * show, is the version that gets somebody in trouble.
   */
  const copy = () => {
    void navigator.clipboard?.writeText(copyText(lines, revealed));
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const save = () => postMsg({
    type: 'files:download', context, namespace, pod, container, path, name,
  });

  const ask = () => {
    if (text === null) return;
    askAi({
      promptKey: 'dk8s.file.explain',
      title: `Explain ${name}`,
      evidence: copyText(lines, revealed),
      evidenceLabel: `FILE ${path} (${lines.length} line${lines.length === 1 ? '' : 's'}`
        + `${maskedCount ? `, ${maskedCount} value${maskedCount === 1 ? '' : 's'} masked` : ''})`,
      podContext: {
        pod, namespace, phase: detail?.phase,
        restarts: detail?.restarts, reason: detail?.reason,
        image: detail?.containers?.[0]?.image,
        file: path,
      },
    });
  };

  return (
    <div
      className="absolute inset-0 flex flex-col z-20"
      style={{ background: 'var(--color-bg)' }}
      role="dialog"
      aria-label={`${name} — read only`}
      onContextMenu={e => {
        e.preventDefault();
        setMenu({
          x: e.clientX, y: e.clientY,
          selection: String(window.getSelection() ?? ''),
        });
      }}
    >
      {/* ── bar ── */}
      {/*
        A thin strip, because it is a caption and not a toolbar.

        It carries a filename, three facts about it and three optional actions,
        and at full padding with bordered buttons it was as tall as four lines
        of the file underneath — which is the thing anyone opened this to read.
      */}
      <div className="flex items-center gap-2 px-2.5 py-1 flex-shrink-0 flex-wrap"
           style={{ borderBottom: '1px solid var(--color-surface-border)',
                    background: 'var(--color-panel)' }}>
        <span className="text-[11px] font-mono font-semibold"
              style={{ color: 'var(--color-text-primary)' }}>{name}</span>
        <span className="text-[9.5px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {parentOf(path)} · {size !== undefined ? bytes(size) : '—'} · read-only
        </span>
        {maskedCount > 0 && (
          <BadgeChipView tone="var(--color-error)">
            {maskedCount} masked
          </BadgeChipView>
        )}
        <span className="flex-1" />
        {/*
          Ask AI sends what the SCREEN shows, masking included.

          The same rule as copy, and for a stronger reason: this is the one
          control here that takes the file off the machine. `copyText` is
          reused rather than reimplemented so a value cannot be masked on
          screen, masked in the clipboard, and then quietly sent in full to a
          model — which is the exact failure the redaction exists to prevent.
          A line the reader deliberately revealed goes as they revealed it.
        */}
        <button
          type="button"
          onClick={ask}
          disabled={text === null}
          title="Ask AI what this file configures and whether anything looks wrong"
          /*
            The badge recipe, in this button's own colour.

            It sat between two chips — the masked count on one side, the mount
            chip in Get Info on the other — wearing a flatter version of the
            same idea, which read as an odd one out rather than as a button.
            Same geometry and the same three shadows as those, keeping the
            violet: it is still the one control here that sends the file
            somewhere, and that is worth a colour of its own.
          */
          className="border-none bg-transparent p-0"
          style={{ cursor: text === null ? 'default' : 'pointer' }}
        >
          {/* A chip that happens to be clickable, so it matches the two beside
              it rather than inventing a third shape for the same row. */}
          <BadgeChipView
            tone={AI_TONE}
            style={{ opacity: text === null ? 0.4 : 1, gap: 3 }}
          >
            <SparkleIcon size={8} /> Ask AI
          </BadgeChipView>
        </button>
        {copied && (
          <span className="text-[10px]" style={{ color: 'var(--color-success)' }}>copied</span>
        )}
        <IconBtn label="Copy what is shown" onClick={copy} disabled={text === null}>
          <CopyIcon size={11} />
        </IconBtn>
        <IconBtn label="Save to disk" onClick={save}>
          <DownloadIcon size={11} />
        </IconBtn>
        <IconBtn label="Close" onClick={onClose}>
          <CloseIcon size={11} />
        </IconBtn>
      </div>

      {/* ── body ── */}
      {/*
        The reading surface is the darker grey, not the input grey.

        `--color-input-bg` is the fill for a form field — lighter, because a
        field has to look like somewhere you can type. A file you cannot edit
        should not: this is a page of read-only text, and it sits better on the
        same dark surface the file list uses, with the header panel a shade
        darker still so the two read as one panel rather than three.
      */}
      <div className="flex-1 min-h-0 overflow-auto"
           style={{ background: 'var(--color-surface)' }}>
        {error && <Note tone="error">{error}</Note>}

        {tooLarge && (
          <Note>
            {/*
              A size refusal is not a failure, and the only useful thing to say
              is what CAN be done — so the download is right there.
            */}
            This file is {size !== undefined ? bytes(size) : 'larger'} — too much to render
            here without freezing the panel.
            <button type="button" onClick={save} className="ml-2 underline"
                    style={{ color: ACCENT, cursor: 'pointer', background: 'none', border: 'none' }}>
              Save it to disk instead
            </button>
          </Note>
        )}

        {binary && (
          <Note>
            Nothing here can render this — it is binary, whatever the name says.
            <button type="button" onClick={save} className="ml-2 underline"
                    style={{ color: ACCENT, cursor: 'pointer', background: 'none', border: 'none' }}>
              Save it to disk
            </button>
          </Note>
        )}

        {text !== null && (
          <div style={{ display: 'flex', fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }}>
            <div style={{
              padding: '10px 10px 10px 14px', textAlign: 'right', userSelect: 'none',
              color: 'var(--color-text-muted)', opacity: 0.65,
              borderRight: '1px solid var(--color-surface-border)', flexShrink: 0,
              lineHeight: 1.75,
            }}>
              {lines.map(l => <div key={l.n}>{l.n}</div>)}
            </div>
            <div style={{ padding: '10px 14px', minWidth: 0, flex: 1, lineHeight: 1.75 }}>
              {lines.map(l => (
                <LineRow
                  key={l.n}
                  line={l}
                  sh={isShell}
                  revealed={revealed.has(l.n)}
                  onReveal={() => setRevealed(prev => new Set(prev).add(l.n))}
                />
              ))}
            </div>
          </div>
        )}

        {text === null && !error && !tooLarge && !binary && (
          <Note>reading the file…</Note>
        )}
      </div>

      <ContextMenuView
        open={!!menu}
        anchorEl={null}
        position={menu ? { x: menu.x, y: menu.y } : undefined}
        onClose={() => setMenu(null)}
        items={!menu ? [] : [
          /*
            The selection first, when there is one — that is what a right-click
            on highlighted text is asking about. It copies verbatim because it
            is what the screen shows: a masked line selects as bullets.
          */
          ...(menu.selection.trim() ? [{
            id: 'copySel', label: 'Copy selection',
            icon: <CopyIcon size={12} />, iconColor: ACCENT,
            onClick: () => {
              setMenu(null);
              void navigator.clipboard?.writeText(menu.selection);
            },
          }] : []),
          {
            id: 'copyAll', label: 'Copy what is shown',
            icon: <CopyIcon size={12} />, iconColor: ACCENT,
            onClick: () => { setMenu(null); copy(); },
          },
          {
            id: 'copyPath', label: 'Copy path',
            icon: <CopyIcon size={12} />, iconColor: 'var(--color-text-secondary)',
            onClick: () => { setMenu(null); void navigator.clipboard?.writeText(path); },
          },
          { id: 'sep', label: '', separator: true },
          {
            id: 'ask', label: 'Ask AI about this file',
            icon: <SparkleIcon size={12} />, iconColor: 'var(--color-primary-light)',
            disabled: text === null,
            onClick: () => { setMenu(null); ask(); },
          },
          {
            id: 'save', label: 'Save to disk',
            icon: <DownloadIcon size={12} />, iconColor: 'var(--color-success)',
            onClick: () => { setMenu(null); save(); },
          },
          ...(maskedCount ? [
            { id: 'sep2', label: '', separator: true },
            {
              id: 'reveal',
              label: revealed.size >= maskedCount
                ? 'All values revealed'
                : `Reveal all ${maskedCount} masked value${maskedCount === 1 ? '' : 's'}`,
              icon: <EyeIcon size={12} />, iconColor: 'var(--color-error)',
              disabled: revealed.size >= maskedCount,
              /*
                Offered because hunting six eye icons down a properties file to
                read the one you needed is worse than one deliberate act — and
                it is still deliberate: nothing here is revealed until asked,
                and copy keeps following what is on screen.
              */
              onClick: () => {
                setMenu(null);
                setRevealed(new Set(lines.filter(l => l.secretFrom !== undefined).map(l => l.n)));
              },
            },
          ] : []),
        ]}
      />
    </div>
  );
}

/*
  Every row occupies one line, including the ones with nothing on them.

  A blank line rendered as an empty div is zero pixels tall, while its number
  in the gutter beside it is a full line — so the two columns drift apart by
  one line for every blank in the file, and the numbers run on past the end of
  the text. On a shell script with 21 blank lines it put `exec "$@"` — line 123
  — next to the number 102, and left 22 numbered rows below the last line of
  code. Nothing was ever missing; the columns had simply stopped agreeing.
*/
const ROW = { minHeight: '1.75em' } as const;

function LineRow({ line, revealed, onReveal, sh }: {
  line: Line; revealed: boolean; onReveal: () => void; sh?: boolean;
}) {
  if (line.secretFrom === undefined) {
    return <div style={{ whiteSpace: 'pre', ...ROW, ...colourFor(line.text) }}>{render(line.text, sh)}</div>;
  }
  const head = line.text.slice(0, line.secretFrom);
  const value = line.text.slice(line.secretFrom);
  return (
    <div style={{ whiteSpace: 'pre', ...ROW }}>
      {render(head, sh)}
      {revealed ? (
        <span style={{ color: 'var(--color-success)' }}>{value}</span>
      ) : (
        <>
          <span style={{ color: 'var(--color-error)' }}>{'•'.repeat(8)}</span>
          <BadgeChipView tone="var(--color-error)" size="xs" style={{ marginLeft: 8 }}>
            redacted
          </BadgeChipView>
          <button
            type="button"
            onClick={onReveal}
            title="Reveal this value"
            aria-label="Reveal this value"
            style={{
              marginLeft: 6, verticalAlign: 'middle', cursor: 'pointer',
              display: 'inline-grid', placeItems: 'center', width: 21, height: 16,
              borderRadius: 4, color: 'var(--color-text-muted)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-surface-border)',
            }}
          >
            <EyeIcon size={10} />
          </button>
        </>
      )}
    </div>
  );
}

/**
 * A key/value line, coloured.
 *
 * Deliberately small. This is not a language server — it is the difference
 * between a wall of one colour and a file you can find a key in, and the
 * formats that turn up on a pod are nearly all `key = value` or a comment.
 */
/*
  Shell keywords, and the reason this list is short.

  There is no highlight.js here and there was never meant to be — the plan
  chose a small tokenizer for the formats a container actually holds over a
  second syntax engine with its own theme, keybindings and worker. What that
  bought in weight it owed in coverage, and a shell script was the gap: three
  rules (comment, key=value, everything else) left `if`, `echo`, `export` and
  every quoted string reading as plain text, which is most of a .sh file.

  These are the words that change what a line DOES. Command names are
  deliberately absent: there is no list of them, `trust` and `keytool` and
  `csplit` are as much commands as `cp` is, and colouring a guessed subset
  would say the unguessed ones are something else.
*/
const SH_WORD_LIST = [
  'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done',
  'case', 'esac', 'in', 'function', 'return', 'exit', 'continue', 'break',
  'local', 'export', 'readonly', 'declare', 'shift', 'source', 'eval', 'set', 'trap',
];

/*
  Built from the list rather than written as a literal.

  The first version spelled the boundary as '\b' inside a STRING, where it is a
  backspace character rather than a word boundary — so the pattern hunted for
  a control code and matched nothing, and every keyword rendered plain while
  the strings around it coloured correctly. Deriving both the splitter and the
  test from one array means there is no second place for that to go wrong.
*/
const SH_WORDS = new RegExp(String.raw`\b(${SH_WORD_LIST.join('|')})\b`, 'g');
const SH_IS_WORD = new Set(SH_WORD_LIST);

/**
 * A line, in as many colours as we can honestly claim.
 *
 * Ordered by confidence: a comment is unambiguous, a quoted run is nearly so,
 * a `$VAR` is, and a keyword is once the quotes are already accounted for.
 * Everything left stays in the plain colour rather than being guessed at.
 */
function render(s: string, sh = false): React.ReactNode {
  if (/^\s*[#;]/.test(s) || /^\s*\/\//.test(s)) {
    return <span style={{ color: 'var(--color-text-muted)', opacity: 0.8 }}>{s}</span>;
  }

  if (sh) return renderShell(s);

  const eq = s.search(/[=:]/);
  if (eq > 0 && !/^\s/.test(s)) {
    return (
      <>
        <span style={{ color: ACCENT }}>{s.slice(0, eq)}</span>
        <span style={{ color: 'var(--color-text-muted)' }}>{s[eq]}</span>
        <span style={{ color: 'var(--color-success)' }}>{s.slice(eq + 1)}</span>
      </>
    );
  }
  return <span style={{ color: 'var(--color-text-secondary)' }}>{s}</span>;
}

/**
 * One pass, quotes first.
 *
 * Quoted text wins over everything inside it — a keyword in a message is not a
 * keyword, and `"$JRE_CACERTS_PATH"` is one string rather than a string
 * wrapped round a variable. Doing it in a single scan is what keeps that true;
 * three independent regex passes would each colour the others' output.
 */
function renderShell(s: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  let i = 0;
  let plain = '';
  const flush = () => {
    if (!plain) return;
    // Keywords and variables, inside the run that is not quoted.
    const parts = plain.split(/(\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*)/g);
    parts.forEach((p, k) => {
      if (!p) return;
      if (p.startsWith('$')) {
        out.push(<span key={`v${i}-${k}`} style={{ color: 'var(--color-warning)' }}>{p}</span>);
        return;
      }
      const words = p.split(SH_WORDS);
      words.forEach((w, j) => {
        if (!w) return;
        out.push(SH_IS_WORD.has(w)
          ? <span key={`k${i}-${k}-${j}`} style={{ color: 'var(--color-primary-light)' }}>{w}</span>
          : <span key={`p${i}-${k}-${j}`} style={{ color: 'var(--color-text-secondary)' }}>{w}</span>);
      });
    });
    plain = '';
  };

  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'") {
      flush();
      let j = i + 1;
      while (j < s.length && s[j] !== c) j += s[j] === '\\' ? 2 : 1;
      out.push(
        <span key={`s${i}`} style={{ color: 'var(--color-success)' }}>{s.slice(i, j + 1)}</span>,
      );
      i = j + 1;
      continue;
    }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) {
      flush();
      out.push(
        <span key={`c${i}`} style={{ color: 'var(--color-text-muted)', opacity: 0.8 }}>
          {s.slice(i)}
        </span>,
      );
      return <>{out}</>;
    }
    plain += c;
    i++;
  }
  flush();
  return <>{out}</>;
}

function colourFor(s: string): React.CSSProperties {
  return /^\s*[#;]/.test(s) ? { opacity: 0.85 } : {};
}

function IconBtn({ label, onClick, disabled, children }: {
  label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled}
      className="flex items-center justify-center rounded"
      /*
        The glyph, and nothing around it.

        Three bordered boxes in a row read as a toolbar, which is more
        structure than three optional actions on a header deserve — and the
        boxes were most of what made the strip look heavy. The shapes are
        distinct enough to find without a frame drawn round each one.
      */
      style={{
        width: 20, height: 18, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        color: 'var(--color-text-muted)',
        background: 'transparent',
        border: 'none',
      }}
    >{children}</button>
  );
}

function Note({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <div className="px-4 py-4 text-[11.5px] leading-relaxed"
         style={{ color: tone === 'error' ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
      {children}
    </div>
  );
}

function parentOf(p: string): string {
  const cut = p.replace(/\/+$/, '').lastIndexOf('/');
  return cut <= 0 ? '/' : p.slice(0, cut);
}

function bytes(v: number): string {
  if (v < 1024) return `${v} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`;
  return `${(v / 1024 ** 3).toFixed(2)} GB`;
}
