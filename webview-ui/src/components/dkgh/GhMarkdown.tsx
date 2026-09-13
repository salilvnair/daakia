/**
 * The box you write an issue in, and the box you reply in.
 *
 * **This is the editor the rest of Daakia already has.** A request's Docs tab
 * is `MarkdownEditorView`: a Rich Text view and a Markdown view of one
 * document, with a real toolbar over both. dkgh had its own — Write/Preview
 * and nine buttons that emitted markdown into a `<textarea>` — which was a
 * second editor to learn, a second one to maintain, and visibly the poorer of
 * the two the moment you had used the other.
 *
 * So there is one editor now, and the difference between filing an issue and
 * documenting a request is the thing you are writing about.
 *
 * ── One component, not three stacked ──
 *
 * It used to be drawn as a card with a header strip saying "You", the editor
 * in its own bordered box inside that, and a row of buttons under both. Three
 * rectangles for one thing. It is one rounded box now: the tabs on its top
 * edge, the writing surface in the middle, the buttons on its bottom edge
 * floated right — which is the shape github.com's own composer has.
 *
 * The "You" strip is gone with it. The reader is the only person who can type
 * in this box, and a row whose entire content is their own name is a row that
 * costs height and says nothing.
 *
 * ── Write and Preview, which is what the site calls them ──
 *
 * Not "Rich Text" and "Markdown". Those name two ways of *editing*, and the
 * question anybody actually has at this point is "what will this look like
 * when I post it" — which is Preview, and which the old switch could not
 * answer at all. Preview renders exactly what `GhProse` renders in the thread,
 * images and all, so what you see is what the comment will be.
 *
 * The source view is still here, on the toolbar's right end behind the
 * Markdown mark: pasting a table or a details block is worth keeping and does
 * not deserve a labelled switch beside the tabs.
 *
 * ── Dragging it taller ──
 *
 * A grip in the bottom-right corner, as github.com's textarea has. It is not
 * the CSS `resize` handle: the surface being resized is a `contenteditable` in
 * one view and a `<textarea>` in the other, and a native handle on either
 * would move only that one. The drag sets the height both of them read.
 *
 * ── The one thing that is dkgh's own ──
 *
 * Paste. The composer takes a screenshot straight out of the clipboard — see
 * `Dropzone` — and that is a `paste` listener on whatever holds the caret.
 * `MarkdownEditorView` does not forward one, so it is attached to the wrapper
 * and catches the event on its way up. Files still arrive; text still lands in
 * the editor, because nothing here calls `preventDefault`.
 */
import { useRef, useState } from 'react';
import { MarkdownEditorView } from '@salilvnair/dui';
import { GhMention, completed, readCaret } from './GhMention';
import { GhProse } from './GhProse';
import { Ico } from './GhIcons';
import { ACCENT } from './types';
import type { BoardIssue } from './board-types';

/** How short the drag is allowed to make it. Below this it is not a box. */
const FLOOR = 64;

export function GhMarkdown({
  value, onChange, placeholder, minHeight = 120, onPaste, right, id, issues, footer,
  repo, onOpenIssue,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** The composer's screenshot paste. Left to the caller, which owns the draft. */
  onPaste?: (e: React.ClipboardEvent<HTMLElement>) => void;
  /** Anything the tab strip should carry on its right — a hint, a word count. */
  right?: React.ReactNode;
  id?: string;
  /** The board, so `#` offers the issues instead of asking for a number. */
  issues?: BoardIssue[];
  /**
   * Which repository a bare `#15` in the Preview belongs to.
   *
   * Preview claims to render exactly what the thread will, and without this it
   * did not: `#15` was a link once posted and plain text in the Preview of the
   * very comment that would post it. The one thing a preview must not do is
   * disagree with the thing it is previewing.
   */
  repo?: string;
  /** Opens a previewed reference in dkgh, the same as one in a posted comment. */
  onOpenIssue?: (number: number) => void;
  /**
   * The buttons, on the box's own bottom edge.
   *
   * Passed in rather than drawn here because what they do differs on every
   * screen — Comment, Create, Close with comment — but where they sit does
   * not, and a footer floated right inside the same border is the half of that
   * which is this component's business.
   */
  footer?: React.ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'write' | 'preview'>('write');
  /** The markdown source instead of the rich surface. Off by default. */
  const [source, setSource] = useState(false);
  /** What the grip has been dragged to, if it has. */
  const [height, setHeight] = useState<number>();

  const tall = height ?? minHeight;

  /*
    Listeners on the window, not the grip: the pointer leaves a 12px handle
    within the first few pixels of any real drag, and a `pointermove` bound to
    the handle stops firing the moment it does.
  */
  const drag = (e: React.PointerEvent) => {
    e.preventDefault();
    const from = tall;
    const start = e.clientY;
    const move = (ev: PointerEvent) => setHeight(Math.max(FLOOR, from + ev.clientY - start));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      id={id}
      ref={host}
      className="dkgh-cmp"
      onPaste={onPaste}
      style={{ '--dkgh-mde-min': `${tall}px`, position: 'relative' } as React.CSSProperties}
    >
      <div className="dkgh-cmp-tabs">
        {(['write', 'preview'] as const).map(v => (
          <button
            key={v}
            type="button"
            className={`dkgh-cmp-tab${view === v ? ' on' : ''}`}
            onClick={() => setView(v)}
          >
            {v === 'write' ? 'Write' : 'Preview'}
          </button>
        ))}
        <span className="dkgh-cmp-sp" />
        {right}
        {view === 'write' && (
          <button
            type="button"
            className={`iconbtn${source ? ' on' : ''}`}
            title={source ? 'Back to the formatted view' : 'Edit the Markdown source'}
            aria-label={source ? 'Back to the formatted view' : 'Edit the Markdown source'}
            aria-pressed={source}
            onClick={() => setSource(s => !s)}
          >
            <Ico name="md" />
          </button>
        )}
      </div>

      <div className="dkgh-cmp-body">
        {/*
          ── Why these carry keys ──

          Both branches are a `<div>` in the same slot, so React reuses the DOM
          node and only swaps its class and children. That was enough to let
          the preview's own chrome survive the switch back: write a code block,
          look at Preview, come back, and the fence's language chip and its
          Copy button were *in the document* — "cssCopy" typed above your code,
          and one more copy of it every round trip.

          A key on each branch makes them two different nodes, so the editor
          always mounts onto a surface of its own and the preview is torn down
          rather than inherited.
        */}
        {view === 'write' ? (
          <div key="write" className="dkgh-mde">
            <MarkdownEditorView
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              /* dkgh's own accent, so the active view and the focus ring are
                 the tab's colour rather than the app's default. */
              accentColor={ACCENT}
              mode={source ? 'markdown' : 'rich'}
              onModeChange={m => setSource(m === 'markdown')}
              /* The tabs above are the switch now. */
              showModeToggle={false}
            />
          </div>
        ) : (
          <div key="preview" className="dkgh-cmp-prev">
            {value.trim()
              ? <GhProse content={value} repo={repo} onOpenIssue={onOpenIssue} full />
              : <span className="sub">Nothing to preview yet.</span>}
          </div>
        )}

        {/* github.com's own grip, in the same corner. */}
        <span
          className="dkgh-grip"
          title="Drag to resize"
          role="separator"
          aria-orientation="horizontal"
          onPointerDown={drag}
        />
      </div>

      {footer && <div className="dkgh-cmp-foot">{footer}</div>}

      {/*
        `#` offers the issues rather than asking for a number nobody knows.
        The board is already in memory, so it costs no call.
      */}
      {issues && issues.length > 0 && view === 'write' && (
        <GhMention
          host={host}
          issues={issues}
          onPick={(hit, node) => {
            const { text, caret } = readCaret(node);
            const next = completed(text, caret, hit);
            if (node instanceof HTMLTextAreaElement) {
              /* Through the native setter, so React's onChange fires and the
                 editor's own state is the one that moved. */
              const set = Object.getOwnPropertyDescriptor(
                HTMLTextAreaElement.prototype, 'value',
              )?.set;
              set?.call(node, next.text);
              node.dispatchEvent(new Event('input', { bubbles: true }));
              node.setSelectionRange(next.caret, next.caret);
            } else {
              /* `insertText` keeps the contenteditable's undo stack, which
                 replacing `textContent` would throw away. */
              const query = text.slice(0, caret).split('#').pop() ?? '';
              const sel = window.getSelection();
              for (let i = 0; i <= query.length; i++) sel?.modify('extend', 'backward', 'character');
              document.execCommand('insertText', false, `#${hit.number} `);
            }
            node.focus();
          }}
        />
      )}
    </div>
  );
}
