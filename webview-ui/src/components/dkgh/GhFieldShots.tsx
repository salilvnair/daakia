/**
 * A screenshot pasted into the box you are writing in.
 *
 * The composer had one place to attach an image — the strip under the
 * description — and every template field that asks for one, and they do ask
 * ("Evidence", "Screenshots", "Steps to reproduce"), had nowhere to put it. So
 * the picture and the sentence it belongs to ended up in different halves of
 * the issue, and the reader had to work out which was which.
 *
 * This is that strip, per field. Ctrl+V into the box works, because that is the
 * gesture — straight out of the Snipping Tool, into the field being written —
 * and drop and click work for the times it is a file on disk.
 *
 * Nothing is uploaded here. An image is a data URL in the draft until somebody
 * presses the button on screen 12, which is the right default for a screenshot
 * of a production console, and the reason each thumbnail says `local`.
 */
import { useState } from 'react';
import { Ico } from './GhIcons';
import { GhClose } from './GhClose';
import { attachShot, dropShot, shotsFor, type Draft } from './composer-model';

/**
 * Read whatever was dropped or pasted, and hand back data URLs.
 *
 * Images only — a dropped `.docx` is not a screenshot, and the alternative to
 * ignoring it is embedding a megabyte of base64 nobody can see.
 */
function readImages(files: FileList | null | undefined, take: (url: string) => void) {
  for (const file of Array.from(files ?? [])) {
    if (!file.type.startsWith('image/')) continue;
    const reader = new FileReader();
    reader.onload = () => take(String(reader.result));
    reader.readAsDataURL(file);
  }
}

/**
 * The paste and drop handlers for one field's editor.
 *
 * Spread onto the `<textarea>` itself rather than onto a zone beside it: a
 * paste goes to whatever has focus, and what has focus while somebody is
 * writing about a bug is the box they are writing in.
 *
 * A paste carrying no image is left alone — `onPaste` without `preventDefault`
 * still pastes text, which is what Ctrl+V does the other 99 times.
 */
export function shotHandlers(
  label: string,
  draft: Draft,
  onDraft: (change: Partial<Draft>) => void,
) {
  /* One at a time through the current draft: two files read in parallel both
     close over the draft as it was, and the second patch drops the first. */
  let pending = draft;
  const take = (url: string) => {
    const patch = attachShot(pending, url, label);
    if (!patch.evidence) return;
    pending = { ...pending, ...patch } as Draft;
    onDraft(patch);
  };

  return {
    onPaste: (e: React.ClipboardEvent) => {
      if (!e.clipboardData?.files?.length) return;
      readImages(e.clipboardData.files, take);
    },
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      readImages(e.dataTransfer.files, take);
    },
  };
}

/**
 * What is attached to this field, and the invitation to attach more.
 *
 * The invitation stays even when there is nothing attached, because a field
 * that can hold a screenshot and does not say so is a field nobody tries.
 */
export function GhFieldShots({ label, draft, onDraft, compact }: {
  label: string;
  draft: Draft;
  onDraft: (change: Partial<Draft>) => void;
  /** Tighter, for the review rows, where the row is already inside a list. */
  compact?: boolean;
}) {
  const [hot, setHot] = useState(false);
  const shots = shotsFor(draft, label);

  const take = (files: FileList | null | undefined) => {
    let pending = draft;
    readImages(files, url => {
      const patch = attachShot(pending, url, label);
      if (!patch.evidence) return;
      pending = { ...pending, ...patch } as Draft;
      onDraft(patch);
    });
  };

  return (
    <div style={{ marginTop: 5 }}>
      {/*
        A row of thumbnails rather than the description's `.gallery`, which is
        a three-column grid: in a grid each picture sits in a third of the
        width and the button that takes it off floats away from it, pointing at
        nothing. These are sized to the image, so the cross is on the corner of
        the thing it removes.
      */}
      {shots.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          {shots.map(u => (
            <div key={u} style={{ position: 'relative', width: compact ? 74 : 104 }}>
              <div
                title={u.startsWith('data:') ? 'Still on this machine' : u}
                style={{
                  width: '100%', height: compact ? 52 : 70, borderRadius: 6,
                  border: '1px solid var(--dk-border)', background: 'var(--dk-raised)',
                  backgroundImage: `url(${u})`, backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              {/* Not "uploading" — nothing is, until screen 12 says so. */}
              {u.startsWith('data:') && (
                <span className="chip c-stale" style={{ marginTop: 3 }}>local</span>
              )}
              <span style={{ position: 'absolute', top: 2, right: 2 }}>
                <GhClose
                  size={18}
                  title="Take this screenshot off"
                  onClick={() => onDraft(dropShot(draft, u))}
                />
              </span>
            </div>
          ))}
        </div>
      )}

      <label
        className={`dropzone${hot ? ' hot' : ''}`}
        style={{ cursor: 'pointer', padding: compact ? '4px 8px' : undefined, fontSize: 11.4 }}
        onDragOver={e => { e.preventDefault(); setHot(true); }}
        onDragLeave={() => setHot(false)}
        onDrop={e => { e.preventDefault(); setHot(false); take(e.dataTransfer?.files); }}
      >
        <Ico name="clip" />
        {shots.length > 0
          ? `Add another to ${label}`
          : `Paste, drop or choose a screenshot for ${label}`}
        {/* A real file input, hidden: the picker is the browser's, and a
            button that fakes one cannot open it. */}
        <input
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => { take(e.target.files); e.target.value = ''; }}
        />
      </label>
    </div>
  );
}
