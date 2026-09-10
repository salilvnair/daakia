/**
 * The markdown box — one of them, everywhere prose is written.
 *
 * The composer had the mock's `.mdbar` drawn above its textarea and none of it
 * did anything: Write and Preview did not switch, and the nine buttons were
 * spans. A toolbar that does nothing is worse than no toolbar, because it says
 * the feature is there.
 *
 * The issue page's reply box had no toolbar at all, which is the other half of
 * the same problem — on github.com the box you reply in is the box you filed
 * in, and having two different ones here is how somebody learns that one of
 * them cannot do bold.
 *
 * So: one component. The composer's description, the reply on screen 14, and
 * the comment inside the close dialog are all this.
 *
 * ── What the buttons actually do ──
 *
 * They wrap the selection, or insert a snippet where the caret is, and then
 * **put the selection back** — including when it moved, which is the part that
 * separates a working toolbar from one that makes you re-select every time. A
 * list button on several selected lines prefixes each of them, because that is
 * what somebody means by pressing it with three lines selected.
 */
import { useEffect, useRef, useState } from 'react';
import { MarkdownView } from '@salilvnair/dui';
import { Ico, type IcoName } from './GhIcons';

interface Action {
  icon: IcoName;
  title: string;
  /** Wrap the selection in this, both sides. */
  wrap?: string;
  /** Put this at the start of each selected line. */
  prefix?: string;
  /** Drop this in at the caret when nothing is selected. */
  snippet?: string;
  /** What to leave selected afterwards, when the selection was empty. */
  placeholder?: string;
}

const ACTIONS: (Action | 'sep')[] = [
  { icon: 'h', title: 'Heading', prefix: '### ', placeholder: 'Heading' },
  { icon: 'b', title: 'Bold  (Ctrl+B)', wrap: '**', placeholder: 'bold' },
  { icon: 'i', title: 'Italic  (Ctrl+I)', wrap: '_', placeholder: 'italic' },
  { icon: 'code', title: 'Code', wrap: '`', placeholder: 'code' },
  { icon: 'link', title: 'Link  (Ctrl+K)', snippet: '[text](url)', placeholder: 'text' },
  'sep',
  { icon: 'list', title: 'Bulleted list', prefix: '- ', placeholder: 'item' },
  { icon: 'task', title: 'Task list', prefix: '- [ ] ', placeholder: 'to do' },
  'sep',
  { icon: 'at', title: 'Mention somebody', snippet: '@', placeholder: '' },
  { icon: 'img', title: 'Image — or just paste one', snippet: '![alt](url)',
    placeholder: 'alt' },
];

export function GhMarkdown({
  value, onChange, placeholder, minHeight = 120, autoFocus, onPaste, right, id,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: number;
  autoFocus?: boolean;
  /** The composer's screenshot paste. Left to the caller, which owns the draft. */
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  /** Anything the bar should carry on its right — a word count, a hint. */
  right?: React.ReactNode;
  id?: string;
}) {
  const [preview, setPreview] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  /** Where to put the selection after the next render. */
  const next = useRef<[number, number] | undefined>(undefined);

  useEffect(() => {
    if (!next.current || !box.current) return;
    const [from, to] = next.current;
    next.current = undefined;
    box.current.focus();
    box.current.setSelectionRange(from, to);
  }, [value]);

  const apply = (action: Action) => {
    const el = box.current;
    if (!el) return;
    const from = el.selectionStart;
    const to = el.selectionEnd;
    const picked = value.slice(from, to);

    if (action.prefix) {
      /*
        A line prefix works on lines, not on characters. Pressing it with three
        lines selected has one obvious meaning, and it is not "put a dash in
        front of the first one".
      */
      const lineStart = value.lastIndexOf('\n', from - 1) + 1;
      const lineEnd = to === from ? lineOf(value, from) : endOfLine(value, to);
      const block = value.slice(lineStart, lineEnd) || (action.placeholder ?? '');
      const done = block.split('\n').map(l => (l.startsWith(action.prefix!)
        ? l.slice(action.prefix!.length)
        : action.prefix! + l)).join('\n');
      onChange(value.slice(0, lineStart) + done + value.slice(lineEnd));
      next.current = [lineStart, lineStart + done.length];
      return;
    }

    if (action.wrap) {
      const inner = picked || (action.placeholder ?? '');
      const already = value.slice(from - action.wrap.length, from) === action.wrap
        && value.slice(to, to + action.wrap.length) === action.wrap;
      if (already) {
        /* Pressing bold on something already bold takes it off, which is what
           every editor does and what nobody thinks about until it does not. */
        onChange(
          value.slice(0, from - action.wrap.length) + inner + value.slice(to + action.wrap.length),
        );
        next.current = [from - action.wrap.length, from - action.wrap.length + inner.length];
        return;
      }
      const done = action.wrap + inner + action.wrap;
      onChange(value.slice(0, from) + done + value.slice(to));
      next.current = [from + action.wrap.length, from + action.wrap.length + inner.length];
      return;
    }

    if (action.snippet) {
      const done = picked && action.placeholder
        ? action.snippet.replace(action.placeholder, picked)
        : action.snippet;
      onChange(value.slice(0, from) + done + value.slice(to));
      /* Land on the part somebody has to fill in, not at the end. */
      const at = done.indexOf('url') >= 0 ? done.indexOf('url') : done.length;
      const length = done.indexOf('url') >= 0 ? 3 : 0;
      next.current = [from + at, from + at + length];
    }
  };

  const shortcuts = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    const action = key === 'b' ? ACTIONS[1] : key === 'i' ? ACTIONS[2]
      : key === 'k' ? ACTIONS[4] : undefined;
    if (!action || action === 'sep') return;
    e.preventDefault();
    apply(action);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="mdbar">
        <span className="tg">
          <span className={preview ? undefined : 'on'} role="button" tabIndex={0}
                onClick={() => setPreview(false)}
                onKeyDown={e => { if (e.key === 'Enter') setPreview(false); }}>
            Write
          </span>
          <span className={preview ? 'on' : undefined} role="button" tabIndex={0}
                onClick={() => setPreview(true)}
                onKeyDown={e => { if (e.key === 'Enter') setPreview(true); }}>
            Preview
          </span>
        </span>
        {!preview && ACTIONS.map((action, i) => (action === 'sep'
          ? <span className="sep" key={`sep-${i}`} />
          : (
            <button
              key={action.icon}
              type="button"
              className="ic"
              title={action.title}
              /* The box loses focus to a button on mousedown, and with it the
                 selection the button is about to act on. */
              onMouseDown={e => e.preventDefault()}
              onClick={() => apply(action)}
            >
              <Ico name={action.icon} />
            </button>
          )))}
        <span className="sp" style={{ flex: 1 }} />
        {right}
      </div>

      {preview ? (
        <div
          className="mdbody dkgh-md"
          style={{ minHeight, overflowY: 'auto', whiteSpace: 'normal' }}
        >
          {value.trim()
            ? <MarkdownView content={value} />
            : <span style={{ color: 'var(--dk-faint)' }}>Nothing to preview yet.</span>}
        </div>
      ) : (
        <textarea
          id={id}
          ref={box}
          className="mdbody"
          autoFocus={autoFocus}
          style={{ minHeight }}
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          onKeyDown={shortcuts}
          onPaste={onPaste}
        />
      )}
    </div>
  );
}

/** The end of the line the caret is on. */
function lineOf(text: string, at: number): number {
  const end = text.indexOf('\n', at);
  return end < 0 ? text.length : end;
}

function endOfLine(text: string, at: number): number {
  const end = text.indexOf('\n', at === 0 ? 0 : at - 1);
  return end < 0 ? text.length : end;
}
