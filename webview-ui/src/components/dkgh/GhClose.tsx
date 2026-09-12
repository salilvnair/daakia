/**
 * The close control, once.
 *
 * Every full-screen section in the tab — export, import, labels, generate —
 * had its own `<button className="btn">×</button>`: a bordered pill with a
 * multiplication sign in it, which reads as a button that says "times" rather
 * than as a close. Four of them, all slightly different paddings.
 *
 * **This is the app's own close, not a new one.** `ModalView` already has a
 * close that everybody in Daakia recognises — muted until you reach it, a red
 * wash on hover, a deeper wash and a small squash on the press. Those are
 * dui's numbers (`.dui_modal__close-btn`), in dkgh's palette, so a dialog's
 * close and a screen's close behave identically.
 */
import { Ico } from './GhIcons';

export function GhClose({ onClick, title = 'Close', size = 26.4 }: {
  onClick: () => void;
  title?: string;
  /** The tab bar's one is smaller than a section header's. */
  size?: number;
}) {
  return (
    <button
      type="button"
      className="ghx"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{ width: size, height: size }}
    >
      <Ico name="x" />
    </button>
  );
}
