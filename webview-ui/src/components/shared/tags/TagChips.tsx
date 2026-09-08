/**
 * Tags, shown and edited.
 *
 * `TagChips` is read-only and turns up wherever a request does — the sidebar,
 * history, the workspace overview. `TagInput` is the editor in the Settings tab.
 * Both draw dui's ChipView, so a tag is the same object as every other chip in
 * the app: same height, same padding, its dismiss control inside its own border
 * and its long labels ellipsised rather than stretching the row.
 *
 * The editor's layout is label, then a full-width input on its own row, then the
 * chips wrapping underneath. Chips inside the input box looked fine with two and
 * fell apart with eight: the box grew a line at a time and pushed the settings
 * below it down the page as you typed.
 */
import { useState } from 'react';
import { ChipView } from '@salilvnair/dui';
import { normaliseTag, tagColor } from './request-tags';
import { PinIcon } from '../../../icons';
import './tags.css';

/** Past this a tag is ellipsised. Long enough for a real tag, short enough that
    one pasted sentence cannot take a whole row. */
const MAX_CHIP_WIDTH = 150;

export function TagChips({ tags, max, size = 'xs' }: {
  tags: string[];
  /** Show this many, then a count. A sidebar row is one line, and a wrapping
      strip of chips pushes everything under it down the list. */
  max?: number;
  size?: 'xs' | 'sm';
}) {
  if (!tags.length) return null;
  const shown = max ? tags.slice(0, max) : tags;
  const rest = tags.length - shown.length;

  return (
    <span className="dk-tags">
      {shown.map(tag => (
        <ChipView
          key={tag}
          label={tag}
          color={tagColor(tag)}
          size={size}
          rounded={false}
          maxLabelWidth={90}
        />
      ))}
      {rest > 0 && (
        <ChipView
          label={`+${rest}`}
          title={tags.join(', ')}
          color="var(--color-text-muted)"
          size={size}
          rounded={false}
        />
      )}
    </span>
  );
}

/**
 * The editor.
 *
 * Enter or a comma commits; Backspace on an empty box removes the last one,
 * which is what every tag field anyone has used already does. Blur commits too,
 * because a tag typed and left in the box is a tag somebody meant to add and
 * would otherwise be lost on tab-away.
 */
export function TagInput({ tags, onChange, placeholder = 'e.g. smoke, regression' }: {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const commit = (raw: string) => {
    const tag = normaliseTag(raw);
    if (!tag) { setDraft(''); setProblem(null); return; }
    if (tags.includes(tag)) {
      /* Say so rather than swallowing it: an input that clears itself and does
         nothing reads as broken, not as "you already have that one". */
      setProblem(`"${tag}" is already on this request`);
      return;
    }
    setDraft('');
    setProblem(null);
    onChange([...tags, tag]);
  };

  return (
    <div className="dk-tag-editor">
      <input
        className="dk-tag-input"
        value={draft}
        placeholder={placeholder}
        onChange={e => {
          // A pasted "smoke, regression" is two tags, not one with a comma in.
          if (/[,\n]/.test(e.target.value)) {
            e.target.value.split(/[,\n]/).forEach(commit);
          } else {
            setDraft(e.target.value);
            setProblem(null);
          }
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(draft); }
          if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={() => commit(draft)}
      />

      {problem && <p className="dk-tag-problem">{problem}</p>}

      {tags.length > 0 && (
        <div className="dk-tag-list">
          {tags.map(tag => (
            <ChipView
              key={tag}
              label={tag}
              color={tagColor(tag)}
              size="sm"
              rounded={false}
              icon={<PinIcon size={10} />}
              maxLabelWidth={MAX_CHIP_WIDTH}
              onRemove={() => onChange(tags.filter(t => t !== tag))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
