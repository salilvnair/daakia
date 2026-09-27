/**
 * How a script runs — which container, with what arguments, copied where —
 * as one chip that opens onto the three.
 *
 * They were a row of their own: a label and a select, a label and a text box,
 * and a path that wrapped onto a second line whenever the toolbar was narrow.
 * Each is set once and read now and then, so the toolbar says what they are
 * ("zp-python · --pool --json") and the popover is where they change.
 */
import { useRef, useState } from 'react';
import { ButtonView, PopoverView, SelectInputView, TextInputView, BadgeChipView, IconSize } from '@salilvnair/dui';
import { LayersIcon, ChevronDownIcon } from '../../../icons';
import { MUTED, WARN } from '../tone';

const label: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED,
};

export function RunSetup({
  container, containers, onContainer, args, onArgs, onEnter, path, copied, tmpReadOnly, streamed, size = 'md',
}: {
  /** The button's height — see `PyToolbarSize`. */
  size?: 'sm' | 'md';
  /** Absent where the container is chosen elsewhere — the Scripts screen picks it with the pods. */
  container?: string;
  containers?: string[];
  onContainer?: (c: string) => void;
  args: string;
  onArgs: (a: string) => void;
  /** Enter in the arguments box runs it, as it did when the box sat in the toolbar. */
  onEnter?: () => void;
  path?: string;
  /** The path is where the last run went, rather than where the next will. */
  copied?: boolean;
  tmpReadOnly?: boolean;
  /** Nothing writable in the container: the script goes in on stdin. */
  streamed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const summary = [container, args.trim() || 'no args'].filter(Boolean).join(' · ');

  return (
    <span ref={anchor} className="inline-flex min-w-0">
      <ButtonView size={size} variant="secondary"
                  iconLeft={<LayersIcon size={IconSize.action} />}
                  iconRight={<ChevronDownIcon size={IconSize.action} />}
                  title="Container, arguments, and where the file goes in the pod"
                  onClick={() => setOpen(o => !o)}
                  style={{ maxWidth: 280 }}>
        <span className="font-mono truncate text-[11.5px]">{summary}</span>
      </ButtonView>
      <PopoverView open={open} onClose={() => setOpen(false)} anchorEl={anchor.current} placement="bottom" borderRadius={10}>
        <div className="flex flex-col gap-3 p-3.5" style={{ width: 340 }}>
          <span className="text-[12.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>How it runs</span>

          {containers && onContainer && (
            <div className="flex flex-col gap-1">
              <span style={label}>container</span>
              <SelectInputView size="md" value={container ?? ''}
                               options={containers.map(c => ({ value: c, label: c }))}
                               onChange={onContainer}
                               disabled={containers.length < 2} />
              {containers.length < 2 && (
                <span className="text-[10.5px]" style={{ color: MUTED }}>The pod has one container, so it runs there.</span>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <span style={label}>arguments</span>
            <TextInputView size="md" value={args} placeholder="--pool --json" aria-label="Script arguments"
                           onChange={(e) => onArgs(e.target.value)}
                           onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) { setOpen(false); onEnter(); } }}
                           inputStyle={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }} />
            <span className="text-[10.5px]" style={{ color: MUTED }}>Passed after the script&rsquo;s name. Enter runs it.</span>
          </div>

          <div className="flex flex-col gap-1">
            <span style={label}>{copied ? 'copied to' : 'copies to'}</span>
            {path ? (
              <code className="text-[11.5px] px-2.5 py-1.5 rounded-md break-all"
                    style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>
                {path}
              </code>
            ) : (
              <span className="text-[11px]" style={{ color: MUTED }}>
                {streamed ? 'Nowhere — nothing in this container is writable, so it goes in on stdin.' : 'Worked out once the container is checked.'}
              </span>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              {tmpReadOnly && <BadgeChipView tone={WARN} size="xs" title="/tmp is read-only in this container">/tmp read-only</BadgeChipView>}
              {streamed && <BadgeChipView tone={WARN} size="xs">streamed on stdin · no Debug</BadgeChipView>}
            </div>
            <span className="text-[10.5px]" style={{ color: MUTED }}>Removed after the run, and the folder when the tab closes.</span>
          </div>
        </div>
      </PopoverView>
    </span>
  );
}
