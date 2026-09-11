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
 * **The props are the ones dkgh's own box had**, because three screens call
 * this and none of them should have to care which editor is underneath.
 *
 * ── The one thing that is dkgh's own ──
 *
 * Paste. The composer takes a screenshot straight out of the clipboard — see
 * `Dropzone` — and that is a `paste` listener on whatever holds the caret.
 * `MarkdownEditorView` does not forward one, so it is attached to the wrapper
 * and catches the event on its way up. Files still arrive; text still lands in
 * the editor, because nothing here calls `preventDefault`.
 *
 * `autoFocus` is gone with the textarea. The editor owns its own surface and
 * does not take the prop, and stealing focus into it from out here would fight
 * whatever it does on mount.
 */
import { MarkdownEditorView } from '@salilvnair/dui';
import { ACCENT } from './types';

export function GhMarkdown({
  value, onChange, placeholder, minHeight = 120, onPaste, right, id,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** The composer's screenshot paste. Left to the caller, which owns the draft. */
  onPaste?: (e: React.ClipboardEvent<HTMLElement>) => void;
  /** Anything the bar should carry on its right — a word count, a hint. */
  right?: React.ReactNode;
  id?: string;
}) {
  return (
    <div
      id={id}
      className="dkgh-mde"
      onPaste={onPaste}
      style={{ '--dkgh-mde-min': `${minHeight}px` } as React.CSSProperties}
    >
      <MarkdownEditorView
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        /* dkgh's own accent, so the active view and the focus ring are the
           tab's colour rather than the app's default. */
        accentColor={ACCENT}
        toolbarRight={right}
      />
    </div>
  );
}
