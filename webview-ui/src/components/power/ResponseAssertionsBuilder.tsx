/**
 * ResponseAssertionsBuilder — click on JSON response fields to create assertions.
 * Feature 6B.12 — Response assertions builder (visual)
 *
 * Renders JSON with clickable fields. Click a field → generates dk.* assertion.
 */
import { useState, useCallback } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useToastStore } from '../../store/toast-store';
import { CopyIcon, CheckIcon } from '../../icons';

interface Props {
  responseBody: string;
  tabId: string;
}

interface JsonNodeProps {
  path: string;
  value: unknown;
  depth: number;
  onAssert: (path: string, value: unknown) => void;
  hovered: string | null;
  setHovered: (path: string | null) => void;
}

function JsonNode({ path, value, depth, onAssert, hovered, setHovered }: JsonNodeProps) {
  const indent = depth * 16;
  const isHovered = hovered === path;

  const renderValue = () => {
    if (value === null) return <span style={{ color: 'var(--color-text-muted)' }}>null</span>;
    if (typeof value === 'boolean') return <span style={{ color: 'var(--color-warning)' }}>{String(value)}</span>;
    if (typeof value === 'number') return <span style={{ color: 'var(--color-info)' }}>{value}</span>;
    if (typeof value === 'string') return <span style={{ color: 'var(--color-success)' }}>&quot;{value}&quot;</span>;
    return null;
  };

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return (
      <div>
        <span style={{ color: 'var(--color-text-muted)' }}>{'{'}</span>
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} style={{ paddingLeft: indent + 16 }}>
            <JsonNode path={path ? `${path}.${k}` : k} value={v} depth={depth + 1} onAssert={onAssert} hovered={hovered} setHovered={setHovered} />
          </div>
        ))}
        <span style={{ color: 'var(--color-text-muted)' }}>{'}'}</span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div>
        <span style={{ color: 'var(--color-text-muted)' }}>[{value.length} items</span>
        {value.slice(0, 3).map((item, i) => (
          <div key={i} style={{ paddingLeft: 16 }}>
            <JsonNode path={`${path}[${i}]`} value={item} depth={depth + 1} onAssert={onAssert} hovered={hovered} setHovered={setHovered} />
          </div>
        ))}
        {value.length > 3 && <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>...{value.length - 3} more</span>}
        <span style={{ color: 'var(--color-text-muted)' }}>]</span>
      </div>
    );
  }

  // Leaf node — clickable
  const pathKey = path.split('.').pop() || path;
  return (
    <div
      className="flex items-center gap-1.5 rounded px-1 -mx-1 cursor-pointer transition-colors"
      style={{ backgroundColor: isHovered ? 'color-mix(in srgb, var(--color-info) 10%, transparent)' : 'transparent' }}
      onMouseEnter={() => setHovered(path)}
      onMouseLeave={() => setHovered(null)}
      onClick={() => onAssert(path, value)}
      title={`Click to assert: ${path} = ${JSON.stringify(value)}`}
    >
      <span className="text-[11px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>
        {pathKey}:
      </span>
      <span className="text-[11px] font-mono">{renderValue()}</span>
      {isHovered && (
        <span className="text-[9px] px-1.5 py-0.5 rounded ml-auto"
          style={{ backgroundColor: 'var(--color-info)', color: 'white' }}>
          + assert
        </span>
      )}
    </div>
  );
}

function generateAssertion(path: string, value: unknown): string {
  const accessor = path.split('.').reduce((acc, part) => {
    if (part.includes('[')) {
      const [key, idx] = part.split('[');
      return `${acc}.${key}[${idx.replace(']', '')}]`;
    }
    return `${acc}.${part}`;
  }, 'data');

  if (value === null) return `dk.expect(${accessor}).toBeNull();`;
  if (typeof value === 'boolean') return `dk.expect(${accessor}).toBe(${value});`;
  if (typeof value === 'number') return `dk.expect(${accessor}).toBe(${value});`;
  if (typeof value === 'string') {
    if (value.includes('@')) return `dk.expect(${accessor}).toMatch(/^[^@]+@[^@]+\\.[^@]+$/);`;
    return `dk.expect(${accessor}).toBe("${value}");`;
  }
  return `dk.expect(${accessor}).toBeTruthy();`;
}

export function ResponseAssertionsBuilder({ responseBody, tabId }: Props) {
  const [assertions, setAssertions] = useState<string[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);
  const updateTab = useTabsStore(s => s.updateTab);
  const addToast = useToastStore(s => s.addToast);

  let parsedBody: unknown = null;
  let parseError = '';
  try {
    parsedBody = JSON.parse(responseBody);
  } catch {
    parseError = 'Response is not valid JSON';
  }

  const handleAssert = useCallback((path: string, value: unknown) => {
    const assertion = generateAssertion(path, value);
    setAssertions(prev => prev.includes(assertion) ? prev : [...prev, assertion]);
  }, []);

  const removeAssertion = (idx: number) => {
    setAssertions(prev => prev.filter((_, i) => i !== idx));
  };

  const applyToScript = () => {
    if (assertions.length === 0) return;
    const script = `const data = dk.response.json();\ndk.test('Visual assertions', () => {\n${assertions.map(a => `  ${a}`).join('\n')}\n});`;
    const tab = useTabsStore.getState().tabs.find(t => t.id === tabId);
    const existing = tab?.postResponseScript || '';
    updateTab(tabId, { postResponseScript: existing + (existing ? '\n\n' : '') + script });
    setApplied(true);
    addToast({ type: 'success', message: `${assertions.length} assertions added to post-response script` });
    setTimeout(() => setApplied(false), 2000);
  };

  const copyScript = async () => {
    if (assertions.length === 0) return;
    const script = `const data = dk.response.json();\ndk.test('Visual assertions', () => {\n${assertions.map(a => `  ${a}`).join('\n')}\n});`;
    await navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (parseError) {
    return (
      <div className="p-3 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        {parseError} — switch to Raw view to see the response
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b text-[11px] flex-shrink-0"
        style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>
        Click any field to add an assertion
      </div>

      <div className="flex flex-1 min-h-0">
        {/* JSON tree */}
        <div className="flex-1 overflow-auto p-3 text-[11px] font-mono">
          {parsedBody !== null && (
            <JsonNode
              path=""
              value={parsedBody}
              depth={0}
              onAssert={handleAssert}
              hovered={hovered}
              setHovered={setHovered}
            />
          )}
        </div>

        {/* Assertions panel */}
        {assertions.length > 0 && (
          <div className="w-[260px] flex-shrink-0 border-l flex flex-col" style={{ borderColor: 'var(--color-surface-border)' }}>
            <div className="px-3 py-2 border-b text-[11px] font-medium flex items-center justify-between"
              style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>
              <span>Assertions ({assertions.length})</span>
              <button type="button" onClick={() => setAssertions([])} className="text-[9px] cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>Clear all</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
              {assertions.map((a, i) => (
                <div key={i} className="flex items-start gap-1.5 p-1.5 rounded border"
                  style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>
                  <code className="flex-1 text-[9.5px] break-all leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>{a}</code>
                  <button type="button" onClick={() => removeAssertion(i)}
                    className="flex-shrink-0 w-4 h-4 flex items-center justify-center opacity-40 hover:opacity-100 cursor-pointer">
                    <span style={{ fontSize: '10px' }}>✕</span>
                  </button>
                </div>
              ))}
            </div>
            <div className="p-2 border-t flex gap-1" style={{ borderColor: 'var(--color-surface-border)' }}>
              <button type="button" onClick={copyScript}
                className="flex-1 h-[26px] text-[11px] rounded cursor-pointer border flex items-center justify-center gap-1"
                style={{ borderColor: 'var(--color-surface-border)', color: copied ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
                <CopyIcon size={10} />
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button type="button" onClick={applyToScript}
                className="flex-1 h-[26px] text-[11px] rounded cursor-pointer text-white flex items-center justify-center gap-1"
                style={{ backgroundColor: applied ? 'var(--color-success)' : 'var(--color-info)' }}>
                {applied ? <><CheckIcon size={10} />Applied</> : 'Apply to Script'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
