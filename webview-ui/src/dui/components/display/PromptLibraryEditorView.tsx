import { useState, useRef, useCallback } from 'react';
import './PromptLibraryEditorView.css';

export interface PromptLibraryVariable {
  pill: string;    // displayed label, e.g. "{{curlCommand}}"
  insert: string;  // text inserted on click
  title?: string;  // tooltip
}

export interface PromptLibraryEditorTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface PromptLibraryEditorViewProps {
  title: string;
  description?: string;
  /** Trigger breadcrumb shown below description */
  triggerLabel?: string;
  avatarColor?: string;
  isCustom?: boolean;
  isDirty?: boolean;
  variables?: PromptLibraryVariable[];
  tabs?: PromptLibraryEditorTab[];
  activeTabId?: string;
  onTabChange?: (id: string) => void;
  content: string;
  onContentChange?: (content: string) => void;
  viewMode?: 'preview' | 'edit';
  onViewModeChange?: (mode: 'preview' | 'edit') => void;
  onSave?: () => void;
  onVariableInsert?: (insert: string) => void;
  accentColor?: string;
  className?: string;
}

function getInitials(title: string): string {
  const words = title.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return title.slice(0, 2).toUpperCase();
}

const VAR_RE = /(\{\{[a-zA-Z_][a-zA-Z0-9_.]*\}\}|\{[a-zA-Z_][a-zA-Z0-9_.]*\})/g;

/** Preview mode — splits text on {{vars}} and renders colored inline pills */
function PromptPreview({ text }: { text: string }) {
  if (!text) {
    return (
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
        No prompt — switch to Edit to add one.
      </p>
    );
  }
  const parts = text.split(VAR_RE);
  return (
    <div style={{
      fontSize: 12, fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      lineHeight: 1.8, color: 'var(--color-text-secondary)',
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>
      {parts.map((part, i) => {
        if (VAR_RE.test(part)) {
          return (
            <span key={i} style={{
              display: 'inline-block', borderRadius: 3, padding: '0 5px',
              background: 'var(--color-var-pill-bg)', color: 'var(--color-var-pill-text)',
              border: '1px solid var(--color-var-pill-border)', fontWeight: 600, lineHeight: 1.6,
            }}>{part}</span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

/** Edit mode — textarea with {{var}} tokens highlighted via backdrop overlay */
function HighlightedTextarea({ value, onChange, accent, minHeight = 220 }: {
  value: string;
  onChange: (v: string) => void;
  accent: string;
  minHeight?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  const syncScroll = useCallback(() => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // Build highlighted HTML — escape HTML first, then wrap var tokens
  const html = (value + '\n')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/(\{\{[a-zA-Z_][a-zA-Z0-9_.]*\}\}|\{[a-zA-Z_][a-zA-Z0-9_.]*\})/g,
      '<mark class="graphify-var-mark">$1</mark>',
    );

  const sharedStyle: React.CSSProperties = {
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    padding: '10px 12px', boxSizing: 'border-box',
    fontSize: 12, lineHeight: 1.8,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word',
    border: '1px solid transparent',
    borderRadius: 6,
    overflowY: 'auto', overflowX: 'hidden',
  };

  return (
    <div style={{ position: 'relative', width: '100%', minHeight }}>
      {/* Backdrop — shows highlighted HTML */}
      <div
        ref={backdropRef}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: html }}
        style={{
          ...sharedStyle,
          background: 'var(--color-input-bg)',
          border: `1px solid ${focused ? accent : 'var(--color-input-border)'}`,
          color: 'var(--color-text-primary)',
          pointerEvents: 'none',
          userSelect: 'none',
          transition: 'border-color 120ms',
        }}
      />
      {/* Actual textarea — transparent text, cursor visible */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onScroll={syncScroll}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          ...sharedStyle,
          background: 'transparent',
          color: 'transparent',
          caretColor: 'var(--color-text-primary)',
          resize: 'vertical',
          outline: 'none',
          cursor: 'text',
          position: 'absolute',
          zIndex: 1,
        }}
        spellCheck={false}
      />
      {/* Spacer so the container has correct height */}
      <div style={{ visibility: 'hidden', fontSize: 12, lineHeight: 1.8, fontFamily: 'Menlo, Monaco, "Courier New", monospace', padding: '10px 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight }}>
        {value || ' '}
      </div>
    </div>
  );
}

export function PromptLibraryEditorView({
  title,
  description,
  triggerLabel,
  avatarColor,
  isCustom = false,
  isDirty = false,
  variables = [],
  tabs = [],
  activeTabId,
  onTabChange,
  content,
  onContentChange,
  viewMode = 'preview',
  onViewModeChange,
  onSave,
  onVariableInsert,
  accentColor,
  className = '',
}: PromptLibraryEditorViewProps) {
  const [localViewMode, setLocalViewMode] = useState<'preview' | 'edit'>(viewMode);
  const resolvedViewMode = onViewModeChange ? viewMode : localViewMode;
  const setViewMode = onViewModeChange ?? setLocalViewMode;

  const accent = avatarColor ?? accentColor ?? 'var(--color-protocol-ai)';
  const resolvedActiveTab = activeTabId ?? tabs[0]?.id ?? '';

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
    >
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px 16px',
        borderBottom: '1px solid var(--color-surface-border)',
        flexShrink: 0,
      }}>
        {/* Avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: 9, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: accent, color: '#fff',
          fontSize: 13, fontWeight: 700, letterSpacing: '0.02em',
          userSelect: 'none',
        }}>
          {getInitials(title)}
        </div>

        {/* Title + description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: description || triggerLabel ? 2 : 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {title}
            </span>
            {isCustom && !isDirty && (
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 99, fontWeight: 700,
                background: `color-mix(in srgb, ${accent} 15%, transparent)`,
                color: accent, letterSpacing: '0.04em',
              }}>CUSTOM</span>
            )}
            {isDirty && (
              <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>● unsaved</span>
            )}
          </div>
          {description && (
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: triggerLabel ? 3 : 0, lineHeight: 1.4 }}>
              {description}
            </div>
          )}
          {triggerLabel && (
            <div style={{ fontSize: 10, color: accent, opacity: 0.82, fontStyle: 'italic', lineHeight: 1.4 }}>
              ↳ {triggerLabel}
            </div>
          )}
        </div>

        {/* Save button */}
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={!isDirty}
            style={{
              height: 28, padding: '0 14px', borderRadius: 6, border: 'none',
              background: isDirty
                ? accent
                : 'color-mix(in srgb, var(--color-text-muted) 12%, transparent)',
              color: isDirty ? '#fff' : 'var(--color-text-muted)',
              fontSize: 11, fontWeight: 600, cursor: isDirty ? 'pointer' : 'default',
              transition: 'background 120ms, color 120ms',
              flexShrink: 0,
            }}
          >
            Save
          </button>
        )}
      </div>

      {/* ── Variable chips ── */}
      {variables.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          padding: '7px 16px',
          borderBottom: '1px solid var(--color-surface-border)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 600, flexShrink: 0 }}>
            Variables — click to insert:
          </span>
          {variables.map(v => (
            <button
              key={v.pill}
              type="button"
              title={v.title}
              onClick={() => onVariableInsert?.(v.insert)}
              className="dui_prompt-editor__var-chip"
              style={{
                display: 'inline-block', borderRadius: 4, padding: '2px 7px',
                background: 'var(--color-var-pill-bg)', color: 'var(--color-var-pill-text)',
                border: '1px solid var(--color-var-pill-border)',
                fontSize: 11, fontWeight: 600, fontFamily: 'Menlo, Monaco, monospace',
                cursor: onVariableInsert ? 'pointer' : 'default',
              }}
            >
              {v.pill}
            </button>
          ))}
        </div>
      )}

      {/* ── Tab bar + view mode toggle ── */}
      {tabs.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 0,
          padding: '0 16px',
          borderBottom: '1px solid var(--color-surface-border)',
          flexShrink: 0, minHeight: 34,
        }}>
          {/* Tabs — with optional icon */}
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: 0 }}>
            {tabs.map(tab => {
              const isActive = tab.id === resolvedActiveTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange?.(tab.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    height: 34, padding: '0 12px', border: 'none', background: 'transparent',
                    fontSize: 11, fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    cursor: 'pointer',
                    borderBottom: isActive ? `2px solid ${accent}` : '2px solid transparent',
                    transition: 'color 100ms, border-color 100ms',
                  }}
                >
                  {tab.icon && (
                    <span style={{
                      color: isActive ? accent : 'var(--color-text-muted)',
                      display: 'flex', alignItems: 'center', transition: 'color 100ms',
                    }}>
                      {tab.icon}
                    </span>
                  )}
                  {!tab.icon && isActive && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0 }} />
                  )}
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Preview / Edit toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
            {(['preview', 'edit'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                style={{
                  height: 24, padding: '0 10px', border: 'none',
                  borderRadius: mode === 'preview' ? '4px 0 0 4px' : '0 4px 4px 0',
                  background: resolvedViewMode === mode
                    ? `color-mix(in srgb, ${accent} 15%, transparent)`
                    : 'color-mix(in srgb, var(--color-text-muted) 8%, transparent)',
                  color: resolvedViewMode === mode ? accent : 'var(--color-text-muted)',
                  fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  transition: 'background 100ms, color 100ms',
                  outline: resolvedViewMode === mode ? `1px solid color-mix(in srgb, ${accent} 30%, transparent)` : '1px solid transparent',
                }}
              >
                {mode === 'preview' ? '◉ Preview' : '⇌ Edit'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Content area ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        {resolvedViewMode === 'preview' ? (
          <PromptPreview text={content} />
        ) : (
          <HighlightedTextarea
            value={content}
            onChange={v => onContentChange?.(v)}
            accent={accent}
          />
        )}
      </div>
    </div>
  );
}
