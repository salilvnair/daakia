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
import { CopyIcon, DownloadIcon, EyeIcon, CloseIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { redactLines, copyText, type RedactedLine } from './file-redact';

const ACCENT = 'var(--color-dk8s)';

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
  const seq = useRef(0);

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

  return (
    <div
      className="absolute inset-0 flex flex-col z-20"
      style={{ background: 'var(--color-bg)' }}
      role="dialog"
      aria-label={`${name} — read only`}
    >
      {/* ── bar ── */}
      <div className="flex items-center gap-3 px-3 py-2 flex-shrink-0 flex-wrap"
           style={{ borderBottom: '1px solid var(--color-surface-border)',
                    background: 'var(--color-panel)' }}>
        <span className="text-[12px] font-mono font-semibold"
              style={{ color: 'var(--color-text-primary)' }}>{name}</span>
        <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {parentOf(path)} · {size !== undefined ? bytes(size) : '—'} · read-only
        </span>
        {maskedCount > 0 && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  color: 'var(--color-error)',
                  background: 'color-mix(in srgb, var(--color-error) 14%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-error) 30%, transparent)',
                }}>
            {maskedCount} masked
          </span>
        )}
        <span className="flex-1" />
        {copied && (
          <span className="text-[10px]" style={{ color: 'var(--color-success)' }}>copied</span>
        )}
        <IconBtn label="Copy what is shown" onClick={copy} disabled={text === null}>
          <CopyIcon size={12} />
        </IconBtn>
        <IconBtn label="Save to disk" onClick={save}>
          <DownloadIcon size={12} />
        </IconBtn>
        <IconBtn label="Close" onClick={onClose}>
          <CloseIcon size={12} />
        </IconBtn>
      </div>

      {/* ── body ── */}
      <div className="flex-1 min-h-0 overflow-auto"
           style={{ background: 'var(--color-input-bg, var(--color-surface))' }}>
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
    </div>
  );
}

function LineRow({ line, revealed, onReveal }: {
  line: Line; revealed: boolean; onReveal: () => void;
}) {
  if (line.secretFrom === undefined) {
    return <div style={{ whiteSpace: 'pre', ...colourFor(line.text) }}>{render(line.text)}</div>;
  }
  const head = line.text.slice(0, line.secretFrom);
  const value = line.text.slice(line.secretFrom);
  return (
    <div style={{ whiteSpace: 'pre' }}>
      {render(head)}
      {revealed ? (
        <span style={{ color: 'var(--color-success)' }}>{value}</span>
      ) : (
        <>
          <span style={{ color: 'var(--color-error)' }}>{'•'.repeat(8)}</span>
          <span style={{
            marginLeft: 8, fontSize: 8.5, fontWeight: 700, letterSpacing: '.05em',
            textTransform: 'uppercase', padding: '1px 5px', borderRadius: 4,
            color: 'var(--color-error)',
            background: 'color-mix(in srgb, var(--color-error) 14%, transparent)',
          }}>redacted</span>
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
function render(s: string): React.ReactNode {
  if (/^\s*[#;]/.test(s) || /^\s*\/\//.test(s)) {
    return <span style={{ color: 'var(--color-text-muted)', opacity: 0.8 }}>{s}</span>;
  }
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

function colourFor(s: string): React.CSSProperties {
  return /^\s*[#;]/.test(s) ? { opacity: 0.85 } : {};
}

function IconBtn({ label, onClick, disabled, children }: {
  label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled}
      className="flex items-center justify-center rounded-md"
      style={{
        width: 25, height: 20, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        color: 'var(--color-text-muted)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
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
