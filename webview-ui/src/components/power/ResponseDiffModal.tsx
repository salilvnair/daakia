/**
 * ResponseDiffModal — compare two responses side-by-side with diff highlighting.
 * Feature 6B.3 — Response diff (compare)
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../../icons';
import { useTabsStore } from '../../store/tabs-store';

interface Props {
  onClose: () => void;
}

interface DiffLine {
  type: 'same' | 'added' | 'removed' | 'changed';
  leftLine: string;
  rightLine: string;
  lineNum: number;
}

function computeDiff(left: string, right: string): DiffLine[] {
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const maxLen = Math.max(leftLines.length, rightLines.length);
  const result: DiffLine[] = [];

  for (let i = 0; i < maxLen; i++) {
    const l = leftLines[i] ?? '';
    const r = rightLines[i] ?? '';
    let type: DiffLine['type'] = 'same';
    if (!leftLines[i] && rightLines[i]) type = 'added';
    else if (leftLines[i] && !rightLines[i]) type = 'removed';
    else if (l !== r) type = 'changed';
    result.push({ type, leftLine: l, rightLine: r, lineNum: i + 1 });
  }

  return result;
}

function prettyJson(body: string): string {
  try { return JSON.stringify(JSON.parse(body), null, 2); }
  catch { return body; }
}

const DIFF_COLORS: Record<DiffLine['type'], { bg: string; color: string }> = {
  same: { bg: 'transparent', color: 'var(--color-text-primary)' },
  added: { bg: 'color-mix(in srgb, var(--color-success) 12%, transparent)', color: 'var(--color-success)' },
  removed: { bg: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' },
  changed: { bg: 'color-mix(in srgb, var(--color-warning) 12%, transparent)', color: 'var(--color-warning)' },
};

export function ResponseDiffModal({ onClose }: Props) {
  const [bodyA, setBodyA] = useState('');
  const [bodyB, setBodyB] = useState('');
  const [labelA, setLabelA] = useState('Response A');
  const [labelB, setLabelB] = useState('Response B');
  const [showDiff, setShowDiff] = useState(false);
  const [pretty, setPretty] = useState(true);

  const tabs = useTabsStore(s => s.tabs);
  const responseTabs = tabs.filter(t => t.response);

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  // Sync scrolling
  useEffect(() => {
    const syncScroll = (source: HTMLDivElement, target: HTMLDivElement) => {
      target.scrollTop = source.scrollTop;
      target.scrollLeft = source.scrollLeft;
    };
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;
    const handleLeft = () => syncScroll(left, right);
    const handleRight = () => syncScroll(right, left);
    left.addEventListener('scroll', handleLeft);
    right.addEventListener('scroll', handleRight);
    return () => { left.removeEventListener('scroll', handleLeft); right.removeEventListener('scroll', handleRight); };
  }, [showDiff]);

  const processedA = pretty ? prettyJson(bodyA) : bodyA;
  const processedB = pretty ? prettyJson(bodyB) : bodyB;

  const diff = showDiff ? computeDiff(processedA, processedB) : [];

  const changedCount = diff.filter(d => d.type !== 'same').length;
  const addedCount = diff.filter(d => d.type === 'added').length;
  const removedCount = diff.filter(d => d.type === 'removed').length;

  const loadFromTab = (tabId: string, side: 'a' | 'b') => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab?.response) return;
    const body = tab.response.body || '';
    const label = `${tab.method || 'GET'} ${tab.url?.split('/').slice(-2).join('/') || ''}`;
    if (side === 'a') { setBodyA(body); setLabelA(label); }
    else { setBodyB(body); setLabelB(label); }
  };

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[900px] max-h-[92vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-surface-bg)', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Response Diff</p>
            {showDiff && (
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                <span style={{ color: 'var(--color-error)' }}>-{removedCount}</span>
                {' '}<span style={{ color: 'var(--color-success)' }}>+{addedCount}</span>
                {' '}{changedCount - addedCount - removedCount > 0 && <span style={{ color: 'var(--color-warning)' }}>~{changedCount - addedCount - removedCount} changed</span>}
              </p>
            )}
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer text-[10.5px]" style={{ color: 'var(--color-text-secondary)' }}>
            <input type="checkbox" checked={pretty} onChange={e => setPretty(e.target.checked)} />
            Pretty JSON
          </label>
          <button type="button" onClick={() => setShowDiff(p => !p)}
            className="h-[28px] px-3 text-[10.5px] font-medium rounded-md cursor-pointer text-white"
            style={{ backgroundColor: showDiff ? 'var(--color-surface-border)' : 'var(--color-info)', color: showDiff ? 'var(--color-text-secondary)' : 'white' }}>
            {showDiff ? 'Edit' : 'Compare'}
          </button>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        {/* Tab source pickers */}
        {responseTabs.length > 0 && (
          <div className="flex px-4 py-2 gap-3 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-hover)' }}>
            <div className="flex items-center gap-2 text-[10.5px]">
              <span style={{ color: 'var(--color-text-muted)' }}>A from:</span>
              <div className="flex gap-1 flex-wrap">
                {responseTabs.slice(0, 5).map(t => (
                  <button key={t.id} type="button" onClick={() => loadFromTab(t.id, 'a')}
                    className="px-1.5 py-0.5 rounded border cursor-pointer text-[9.5px]"
                    style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                    {t.method} /{t.url?.split('/').pop()}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10.5px]">
              <span style={{ color: 'var(--color-text-muted)' }}>B from:</span>
              <div className="flex gap-1 flex-wrap">
                {responseTabs.slice(0, 5).map(t => (
                  <button key={t.id} type="button" onClick={() => loadFromTab(t.id, 'b')}
                    className="px-1.5 py-0.5 rounded border cursor-pointer text-[9.5px]"
                    style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                    {t.method} /{t.url?.split('/').pop()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex flex-1 min-h-0">
          {!showDiff ? (
            <>
              {/* Edit mode — two text areas */}
              <div className="flex flex-col flex-1 border-r" style={{ borderColor: 'var(--color-surface-border)' }}>
                <div className="px-3 py-1.5 border-b text-[11px] font-medium flex items-center gap-2"
                  style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>
                  <span>{labelA}</span>
                  {bodyA && <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>{bodyA.length} chars</span>}
                </div>
                <textarea value={bodyA} onChange={e => setBodyA(e.target.value)}
                  className="flex-1 p-3 text-[10.5px] font-mono resize-none outline-none"
                  placeholder="Paste response A here…"
                  style={{ backgroundColor: 'var(--color-panel)', color: 'var(--color-text-primary)' }} />
              </div>
              <div className="flex flex-col flex-1">
                <div className="px-3 py-1.5 border-b text-[11px] font-medium flex items-center gap-2"
                  style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>
                  <span>{labelB}</span>
                  {bodyB && <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>{bodyB.length} chars</span>}
                </div>
                <textarea value={bodyB} onChange={e => setBodyB(e.target.value)}
                  className="flex-1 p-3 text-[10.5px] font-mono resize-none outline-none"
                  placeholder="Paste response B here…"
                  style={{ backgroundColor: 'var(--color-panel)', color: 'var(--color-text-primary)' }} />
              </div>
            </>
          ) : (
            <>
              {/* Diff mode — synchronized scrolling */}
              <div ref={leftRef} className="flex-1 overflow-auto border-r font-mono text-[10.5px]" style={{ borderColor: 'var(--color-surface-border)' }}>
                <div className="px-3 py-1.5 border-b sticky top-0 text-[11px] font-medium font-sans"
                  style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>
                  {labelA}
                </div>
                {diff.map((line, i) => (
                  <div key={i} className="flex px-3 py-0.5 leading-5"
                    style={{ backgroundColor: DIFF_COLORS[line.type].bg }}>
                    <span className="w-[30px] flex-shrink-0 text-right mr-3 select-none" style={{ color: 'var(--color-text-muted)', fontSize: '9px' }}>
                      {line.lineNum}
                    </span>
                    {line.type === 'removed' && <span className="mr-1 flex-shrink-0" style={{ color: 'var(--color-error)' }}>−</span>}
                    {line.type === 'changed' && <span className="mr-1 flex-shrink-0" style={{ color: 'var(--color-warning)' }}>~</span>}
                    {line.type === 'same' && <span className="mr-1 flex-shrink-0 opacity-0">·</span>}
                    <span className="whitespace-pre" style={{ color: DIFF_COLORS[line.type].color }}>{line.leftLine}</span>
                  </div>
                ))}
              </div>
              <div ref={rightRef} className="flex-1 overflow-auto font-mono text-[10.5px]">
                <div className="px-3 py-1.5 border-b sticky top-0 text-[11px] font-medium font-sans"
                  style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>
                  {labelB}
                </div>
                {diff.map((line, i) => (
                  <div key={i} className="flex px-3 py-0.5 leading-5"
                    style={{ backgroundColor: DIFF_COLORS[line.type === 'removed' ? 'added' : line.type === 'added' ? 'removed' : line.type].bg }}>
                    <span className="w-[30px] flex-shrink-0 text-right mr-3 select-none" style={{ color: 'var(--color-text-muted)', fontSize: '9px' }}>
                      {line.lineNum}
                    </span>
                    {line.type === 'added' && <span className="mr-1 flex-shrink-0" style={{ color: 'var(--color-success)' }}>+</span>}
                    {line.type === 'changed' && <span className="mr-1 flex-shrink-0" style={{ color: 'var(--color-warning)' }}>~</span>}
                    {(line.type === 'same' || line.type === 'removed') && <span className="mr-1 flex-shrink-0 opacity-0">·</span>}
                    <span className="whitespace-pre" style={{ color: DIFF_COLORS[line.type === 'removed' ? 'added' : line.type === 'added' ? 'removed' : line.type].color }}>
                      {line.rightLine}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <button type="button" onClick={onClose}
            className="h-[30px] px-4 text-[11px] font-medium rounded-md cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
