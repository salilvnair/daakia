/**
 * SequencePanel — Response sequences for round-robin / sequential / random responses (6A.22).
 */
import { useState } from 'react';
import { StyledDropdown, CodeEditor, ResizablePanel, type DropdownOption } from '../../shared';
import { ChevronDownIcon, PlusIcon, TrashIcon } from '../../../icons';
import type { MockRoute, ResponseSequenceItem, SequenceMode } from '../mock-types';

const MOCK_ACCENT = 'var(--color-mock-server)';

const SEQUENCE_MODE_OPTIONS: DropdownOption[] = [
  { value: 'sequential',  label: 'Sequential (return A, then B, then C...)' },
  { value: 'round-robin', label: 'Round-robin (cycle: A→B→C→A...)' },
  { value: 'random',      label: 'Random (pick randomly each call)' },
];

interface Props {
  route: MockRoute;
  onUpdate: (patch: Partial<MockRoute>) => void;
}

export function SequencePanel({ route, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const responses = route.responses ?? [];
  const enabled = responses.length > 0;

  const addResponse = () => {
    const newItem: ResponseSequenceItem = {
      id: crypto.randomUUID(),
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: '{"message":"response ' + (responses.length + 1) + '"}',
    };
    onUpdate({ responses: [...responses, newItem] });
  };

  const updateResponse = (idx: number, patch: Partial<ResponseSequenceItem>) => {
    const updated = [...responses];
    updated[idx] = { ...updated[idx], ...patch };
    onUpdate({ responses: updated });
  };

  const removeResponse = (idx: number) => {
    const updated = responses.filter((_, i) => i !== idx);
    onUpdate({ responses: updated, sequenceMode: updated.length > 0 ? route.sequenceMode : undefined });
  };

  return (
    <div className="border border-dashed border-[rgba(255,255,255,0.1)] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="transition-transform duration-150 text-[var(--color-text-muted)]" style={{ display: 'inline-flex', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
            <ChevronDownIcon size={12} />
          </span>
          <span className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Response Sequences</span>
          {enabled && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: `color-mix(in srgb, ${MOCK_ACCENT} 15%, transparent)`, color: MOCK_ACCENT }}>
              {responses.length} responses · {route.sequenceMode ?? 'sequential'}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); addResponse(); setExpanded(true); }}
          className="flex items-center gap-1 h-[20px] px-2 text-[10px] rounded cursor-pointer"
          style={{ color: MOCK_ACCENT, background: `color-mix(in srgb, ${MOCK_ACCENT} 10%, transparent)` }}
        >
          <PlusIcon size={9} /> Add Response
        </button>
      </button>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-[rgba(255,255,255,0.07)]">
          {responses.length === 0 ? (
            <div className="pt-3 text-center">
              <p className="text-[11px] text-[var(--color-text-muted)] opacity-60">No sequence responses yet.</p>
              <p className="text-[10px] text-[var(--color-text-muted)] opacity-40 mt-1">Add multiple responses to rotate through. Overrides the main Body above.</p>
              <button
                type="button"
                onClick={addResponse}
                className="mt-2 flex items-center gap-1 mx-auto h-[24px] px-3 text-[11px] rounded cursor-pointer"
                style={{ color: MOCK_ACCENT, background: `color-mix(in srgb, ${MOCK_ACCENT} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${MOCK_ACCENT} 25%, transparent)` }}
              >
                <PlusIcon size={10} /> Add First Response
              </button>
            </div>
          ) : (
            <>
              {/* Mode selector */}
              <div className="flex items-center gap-2 pt-2">
                <span className="text-[10px] text-[var(--color-text-muted)]">Rotation mode</span>
                <StyledDropdown
                  size="sm"
                  options={SEQUENCE_MODE_OPTIONS}
                  value={route.sequenceMode ?? 'sequential'}
                  onChange={v => onUpdate({ sequenceMode: v as SequenceMode })}
                  accentColor={MOCK_ACCENT}
                />
              </div>

              {/* Response items */}
              {responses.map((item, idx) => (
                <SequenceItem
                  key={item.id}
                  item={item}
                  index={idx}
                  onUpdate={patch => updateResponse(idx, patch)}
                  onRemove={() => removeResponse(idx)}
                />
              ))}

              <button
                type="button"
                onClick={addResponse}
                className="flex items-center gap-1 self-start h-[24px] px-2 text-[10px] rounded cursor-pointer"
                style={{ color: MOCK_ACCENT, background: `color-mix(in srgb, ${MOCK_ACCENT} 10%, transparent)` }}
              >
                <PlusIcon size={9} /> Add Response
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Single sequence item ─────────────────────────────────────────────────────

function SequenceItem({ item, index, onUpdate, onRemove }: {
  item: ResponseSequenceItem;
  index: number;
  onUpdate: (patch: Partial<ResponseSequenceItem>) => void;
  onRemove: () => void;
}) {
  const [bodyExpanded, setBodyExpanded] = useState(false);

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[rgba(255,255,255,0.02)]">
        <span className="text-[10px] font-medium text-[var(--color-text-muted)] flex-shrink-0">
          #{index + 1}
        </span>
        <input
          type="number"
          value={item.statusCode}
          onChange={e => onUpdate({ statusCode: parseInt(e.target.value) || 200 })}
          className="w-[50px] h-[22px] px-1.5 text-[11px] text-center font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none"
        />
        <input
          type="number"
          value={item.delayMs ?? ''}
          onChange={e => onUpdate({ delayMs: e.target.value ? parseInt(e.target.value) : undefined })}
          placeholder="delay ms"
          className="w-[80px] h-[22px] px-1.5 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-muted)] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setBodyExpanded(v => !v)}
          className="flex-1 text-left text-[10px] text-[var(--color-text-muted)] cursor-pointer truncate hover:text-[var(--color-text-primary)]"
        >
          {item.body.slice(0, 40)}{item.body.length > 40 ? '…' : ''}
        </button>
        <button type="button" onClick={onRemove} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer flex-shrink-0">
          <TrashIcon size={11} />
        </button>
      </div>

      {bodyExpanded && (
        <div className="px-2.5 pb-2">
          <ResizablePanel id={`seq.${item.id}`} defaultHeight={80} minHeight={40} maxHeight={300}>
            <CodeEditor value={item.body} onChange={v => onUpdate({ body: v })} language="json" height="100%" />
          </ResizablePanel>
        </div>
      )}
    </div>
  );
}
