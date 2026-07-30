/**
 * SequencePanel — Response sequences for round-robin / sequential / random responses (6A.22).
 */
import { useState } from 'react';
import {
  SelectInputView, EditorView, ResizablePanelView, ButtonView, IconButtonView,
  TextInputView, type SelectOption,
} from '@salilvnair/dui';
import { ChevronDownIcon, PlusIcon, TrashIcon } from '../../../icons';
import type { MockRoute, ResponseSequenceItem, SequenceMode } from '../mock-types';

const MOCK_ACCENT = 'var(--color-mock-server)';

const SEQUENCE_MODE_OPTIONS: SelectOption[] = [
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
    <div className="border border-dashed border-[color-mix(in_srgb,var(--color-text-primary)_10%,transparent)] rounded-lg overflow-hidden">
      <div
        className="w-full flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-text-primary)_3%,transparent)] transition-colors"
        onClick={() => setExpanded(v => !v)}
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
        <ButtonView
          size="md"
          variant="ghost"
          accentColor={MOCK_ACCENT}
          iconLeft={<PlusIcon size={12} />}
          onClick={e => { e.stopPropagation(); addResponse(); setExpanded(true); }}
        >
          Add Response
        </ButtonView>
      </div>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)]">
          {responses.length === 0 ? (
            <div className="pt-3 text-center">
              <p className="text-[11px] text-[var(--color-text-muted)] opacity-60">No sequence responses yet.</p>
              <p className="text-[10px] text-[var(--color-text-muted)] opacity-40 mt-1">Add multiple responses to rotate through. Overrides the main Body above.</p>
              <div className="mt-2 flex justify-center">
                <ButtonView
                  size="md"
                  variant="ghost"
                  accentColor={MOCK_ACCENT}
                  iconLeft={<PlusIcon size={10} />}
                  onClick={addResponse}
                >
                  Add First Response
                </ButtonView>
              </div>
            </div>
          ) : (
            <>
              {/* Mode selector */}
              <div className="flex items-center gap-2 pt-2">
                <span className="text-[10px] text-[var(--color-text-muted)]">Rotation mode</span>
                <SelectInputView
                  size="md"
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

              <div>
                <ButtonView
                  size="md"
                  variant="ghost"
                  accentColor={MOCK_ACCENT}
                  iconLeft={<PlusIcon size={9} />}
                  onClick={addResponse}
                >
                  Add Response
                </ButtonView>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SequenceItem({ item, index, onUpdate, onRemove }: {
  item: ResponseSequenceItem;
  index: number;
  onUpdate: (patch: Partial<ResponseSequenceItem>) => void;
  onRemove: () => void;
}) {
  const [bodyExpanded, setBodyExpanded] = useState(false);

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--color-text-primary)_8%,transparent)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[color-mix(in_srgb,var(--color-text-primary)_2%,transparent)]">
        <span className="text-[10px] font-medium text-[var(--color-text-muted)] flex-shrink-0">
          #{index + 1}
        </span>
        <TextInputView
          type="number"
          value={String(item.statusCode)}
          onChange={e => onUpdate({ statusCode: parseInt(e.target.value) || 200 })}
          size="md"
          style={{ width: 50, fontFamily: 'monospace', textAlign: 'center' }}
        />
        <TextInputView
          type="number"
          value={String(item.delayMs ?? '')}
          onChange={e => onUpdate({ delayMs: e.target.value ? parseInt(e.target.value) : undefined })}
          placeholder="delay ms"
          size="md"
          style={{ width: 80, fontFamily: 'monospace' }}
        />
        <span
          className="flex-1 text-left text-[10px] text-[var(--color-text-muted)] cursor-pointer truncate hover:text-[var(--color-text-primary)]"
          onClick={() => setBodyExpanded(v => !v)}
        >
          {item.body.slice(0, 40)}{item.body.length > 40 ? '…' : ''}
        </span>
        <IconButtonView
          size="sm"
          icon={<TrashIcon size={11} />}
          accentColor="var(--color-error)"
          onClick={onRemove}
        />
      </div>

      {bodyExpanded && (
        <div className="px-2.5 pb-2">
          <ResizablePanelView defaultHeight={80} minHeight={40} maxHeight={300}>
            <EditorView value={item.body} onChange={v => onUpdate({ body: v })} language="json" height="100%" />
          </ResizablePanelView>
        </div>
      )}
    </div>
  );
}
