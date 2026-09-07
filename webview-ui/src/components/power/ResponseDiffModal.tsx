/**
 * ResponseDiffModal — compare two responses side-by-side with diff highlighting.
 * Feature 6B.3 — Response diff (compare)
 */
import { useEffect, useRef, useState } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { logUiEvent } from '../../store/ui-audit-store';
import {
  ModalView,
  ButtonView,
  EditorView,
  SplitPanelView,
  DiffEditorView,
  ToggleSwitchView,
  type EditorLanguage,
} from '@salilvnair/dui';
import { detectLanguage } from '../../services/editor/detect-language';

interface Props {
  onClose: () => void;
  /**
   * Seed both sides.
   *
   * "Compare with clipboard" arrives with the two texts already in hand, so
   * the modal opens on the diff rather than on two empty panes asking to be
   * pasted into.
   */
  initialA?: string;
  initialB?: string;
  initialLabelA?: string;
  initialLabelB?: string;
  /**
   * Put the cursor in the right pane on open.
   *
   * "Compare with clipboard" cannot always read the clipboard — the host may
   * simply refuse — so it opens with that pane empty and focused, and the
   * Ctrl+V the user was going to press anyway lands in the right place.
   */
  focusB?: boolean;
}

const ACCENT = 'var(--color-settings)';


function prettyJson(body: string): string {
  try { return JSON.stringify(JSON.parse(body), null, 2); }
  catch { return body; }
}

export function ResponseDiffModal({
  onClose, initialA = '', initialB = '', initialLabelA, initialLabelB, focusB = false,
}: Props) {
  const [bodyA, setBodyA] = useState(initialA);
  const [bodyB, setBodyB] = useState(initialB);
  const [labelA, setLabelA] = useState(initialLabelA ?? 'Response A');
  const [labelB, setLabelB] = useState(initialLabelB ?? 'Response B');
  // Opened with both sides already filled: show the comparison, not the form.
  const [showDiff, setShowDiff] = useState(Boolean(initialA && initialB));
  const [pretty, setPretty] = useState(true);

  const tabs = useTabsStore(s => s.tabs);
  const responseTabs = tabs.filter(t => t.response);

  const processedA = pretty ? prettyJson(bodyA) : bodyA;
  const processedB = pretty ? prettyJson(bodyB) : bodyB;

  const loadFromTab = (tabId: string, side: 'a' | 'b') => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab?.response) return;
    const body = tab.response.body || '';
    const label = `${tab.method || 'GET'} ${tab.url?.split('/').slice(-2).join('/') || ''}`;
    if (side === 'a') { setBodyA(body); setLabelA(label); }
    else { setBodyB(body); setLabelB(label); }
  };

  const diffLanguage = detectLanguage(processedA || processedB);

  /*
    Focus the right pane once Monaco has mounted into it. Clicking its textarea
    is what actually moves the caret — focusing the container does not, and a
    paste would land wherever the caret happened to be.
  */
  const paneBRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusB) return;
    const t = setTimeout(() => {
      paneBRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    }, 300);
    return () => clearTimeout(t);
  }, [focusB]);

  return (
    <ModalView
      open
      title="Response Diff"
      subtitle={showDiff ? undefined : 'Paste two responses to compare them side-by-side'}
      headerColor={ACCENT}
      size="xl"
      onClose={onClose}
      footerLeft={
        <ToggleSwitchView
          checked={pretty}
          onChange={v => setPretty(v)}
          label="Pretty JSON"
          accentColor={ACCENT}
          size="sm"
        />
      }
      footerRight={
        <ButtonView
          size="md"
          variant="primary"
          accentColor={showDiff ? 'var(--color-text-muted)' : ACCENT}
          onClick={() => { if (!showDiff) logUiEvent('settings.diff_compare'); setShowDiff(p => !p); }}
        >
          {showDiff ? '✎ Edit' : '⇄ Compare'}
        </ButtonView>
      }
    >
      <div className="flex flex-col" style={{ height: 560 }}>
        {/* Tab source pickers */}
        {responseTabs.length > 0 && (
          <div className="flex px-4 py-2 gap-4 border-b flex-shrink-0"
            style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-hover)' }}>
            <div className="flex items-center gap-2 text-[11px]">
              <span style={{ color: 'var(--color-text-muted)' }}>A:</span>
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
            <div className="flex items-center gap-2 text-[11px]">
              <span style={{ color: 'var(--color-text-muted)' }}>B:</span>
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
            <SplitPanelView
              direction="horizontal"
              defaultSplit={50}
              minFirst={200}
              minSecond={200}
              accentColor={ACCENT}
              first={
                <div className="flex flex-col h-full">
                  <div className="px-3 py-1.5 border-b text-[11px] font-medium flex items-center gap-2 flex-shrink-0"
                    style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>
                    <span>{labelA}</span>
                    {bodyA && <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>{bodyA.length} chars</span>}
                  </div>
                  <div className="flex-1 min-h-0">
                    <EditorView
                      value={bodyA}
                      onChange={v => setBodyA(v ?? '')}
                      language={detectLanguage(bodyA)}
                      height="100%"
                      placeholder="Paste response A here…"
                    />
                  </div>
                </div>
              }
              second={
                <div className="flex flex-col h-full">
                  <div className="px-3 py-1.5 border-b text-[11px] font-medium flex items-center gap-2 flex-shrink-0"
                    style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>
                    <span>{labelB}</span>
                    {bodyB && <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>{bodyB.length} chars</span>}
                  </div>
                  <div className="flex-1 min-h-0" ref={paneBRef}>
                    <EditorView
                      value={bodyB}
                      onChange={v => setBodyB(v ?? '')}
                      language={detectLanguage(bodyB)}
                      height="100%"
                      placeholder="Press Ctrl+V to paste the clipboard here…"
                    />
                  </div>
                </div>
              }
              style={{ flex: 1 }}
            />
          ) : (
            <div className="flex-1 min-h-0">
              <DiffEditorView
                original={processedA}
                modified={processedB}
                language={diffLanguage}
                height="100%"
                readOnly={false}
                renderSideBySide
              />
            </div>
          )}
        </div>
      </div>
    </ModalView>
  );
}
