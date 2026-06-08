/**
 * AiSmartVariableSuggest — AI-powered {{variable}} suggestions in input fields.
 * Feature 4.6.9 — AI Smart Variable Suggest
 *
 * When user types `{{`, shows AI-ranked variable suggestions based on context
 * (token for Auth header, baseUrl for URL field, etc.)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { SparkleIcon } from '../../icons';
import { useEnvStore } from '../../store/env-store';

interface Props {
  value: string;
  onChange: (val: string) => void;
  fieldType: 'url' | 'header-value' | 'header-key' | 'param-value' | 'body';
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  onBlur?: () => void;
}

const AI_ACCENT = 'var(--color-protocol-ai)';

// Heuristic scoring — no AI call needed for instant suggestions
function scoreVariables(
  variables: Array<{ key: string; value: string }>,
  fieldType: Props['fieldType'],
  prefix: string
): Array<{ key: string; value: string; score: number; reason: string }> {
  return variables
    .filter(v => v.key.toLowerCase().includes(prefix.toLowerCase()))
    .map(v => {
      let score = 0;
      let reason = '';
      const k = v.key.toLowerCase();

      if (fieldType === 'url') {
        if (k.includes('url') || k.includes('host') || k.includes('base') || k.includes('endpoint')) { score += 10; reason = 'URL field'; }
        if (k.includes('port') || k.includes('path')) { score += 5; }
      }
      if (fieldType === 'header-value') {
        if (k.includes('token') || k.includes('auth') || k.includes('key') || k.includes('secret') || k.includes('bearer')) { score += 10; reason = 'Auth token'; }
        if (k.includes('api') || k.includes('client')) { score += 5; }
      }
      if (fieldType === 'param-value') {
        if (k.includes('id') || k.includes('page') || k.includes('limit') || k.includes('cursor')) { score += 8; reason = 'Query param'; }
      }
      if (fieldType === 'body') {
        if (k.includes('id') || k.includes('name') || k.includes('email') || k.includes('user')) { score += 5; reason = 'Body field'; }
      }

      // Boost exact prefix matches
      if (v.key.toLowerCase().startsWith(prefix.toLowerCase())) score += 3;

      return { ...v, score, reason };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

export function AiSmartVariableSuggest({ value, onChange, fieldType, placeholder, className, style, onBlur }: Props) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ key: string; value: string; reason: string }>>([]);
  const [cursorPos, setCursorPos] = useState(0);
  const [varPrefix, setVarPrefix] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { activeEnvId, environments } = useEnvStore();
  const activeEnv = environments.find(e => e.id === activeEnvId);
  const variables = activeEnv?.variables || [];

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart ?? 0;
    onChange(val);
    setCursorPos(pos);

    // Detect `{{` trigger
    const before = val.slice(0, pos);
    const match = before.match(/\{\{([^}]*)$/);
    if (match) {
      const prefix = match[1];
      setVarPrefix(prefix);
      const scored = scoreVariables(variables, fieldType, prefix);
      setSuggestions(scored);
      setShowSuggestions(scored.length > 0);
    } else {
      setShowSuggestions(false);
    }
  }, [onChange, variables, fieldType]);

  const applySuggestion = (varKey: string) => {
    const before = value.slice(0, cursorPos);
    const after = value.slice(cursorPos);
    const match = before.match(/\{\{([^}]*)$/);
    if (!match) return;
    const insertIdx = before.lastIndexOf('{{');
    const newVal = before.slice(0, insertIdx) + `{{${varKey}}}` + after;
    onChange(newVal);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSuggestions(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onBlur={() => { setTimeout(() => setShowSuggestions(false), 150); onBlur?.(); }}
        placeholder={placeholder}
        className={className}
        style={style}
      />

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 z-50 mt-1 min-w-[220px] rounded-xl border shadow-xl overflow-hidden"
          style={{ backgroundColor: 'var(--color-surface-bg)', borderColor: `color-mix(in srgb, ${AI_ACCENT} 30%, var(--color-surface-border))` }}>
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b"
            style={{ borderColor: 'var(--color-surface-border)', backgroundColor: `color-mix(in srgb, ${AI_ACCENT} 5%, transparent)` }}>
            <SparkleIcon size={10} style={{ color: AI_ACCENT }} />
            <span className="text-[9.5px] font-medium" style={{ color: AI_ACCENT }}>Smart suggestions</span>
          </div>
          {suggestions.map(s => (
            <button key={s.key} type="button"
              onMouseDown={e => { e.preventDefault(); applySuggestion(s.key); }}
              className="w-full text-left flex items-center justify-between px-3 py-1.5 hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors border-b last:border-b-0"
              style={{ borderColor: 'var(--color-surface-border)' }}>
              <div>
                <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-primary)' }}>{`{{${s.key}}}`}</p>
                {s.value && <p className="text-[9.5px] font-mono truncate max-w-[180px]" style={{ color: 'var(--color-text-muted)' }}>{s.value || '(empty)'}</p>}
              </div>
              {s.reason && <span className="text-[9px] ml-2 flex-shrink-0" style={{ color: AI_ACCENT }}>{s.reason}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
