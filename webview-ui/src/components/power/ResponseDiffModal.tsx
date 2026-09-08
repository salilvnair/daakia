/**
 * ResponseDiffModal — compare two responses side-by-side with diff highlighting.
 * Feature 6B.3 — Response diff (compare)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { logUiEvent } from '../../store/ui-audit-store';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { postMsg } from '../../vscode';
import {
  ModalView,
  ButtonView,
  EditorView,
  SplitPanelView,
  ToggleSwitchView,
  LineDiffView,
  BadgeChipView,
  TabView,
  AIButtonView,
  diffLines,
  tallyDiff,
  type TabItem,
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

/* The same accent as the schema comparison. These are the two diff screens
   in the app and they should read as one family — the settings green made
   this one look like a preferences page that happened to show a diff. */
const ACCENT = 'var(--color-info)';


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
  const [view, setView] = useState<'diff' | 'analysis'>('diff');
  const [analysis, setAnalysis] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const streamRef = useRef('');
  const resolve = useAiPromptTemplatesStore(st => st.resolve);

  const tabs = useTabsStore(s => s.tabs);
  const responseTabs = tabs.filter(t => t.response);

  const processedA = pretty ? prettyJson(bodyA) : bodyA;
  const processedB = pretty ? prettyJson(bodyB) : bodyB;

  /* Counted here rather than inside the pane: the chips above the strip and
     the tally inside its headers have to agree, and two call sites computing
     the same thing is how they stop agreeing. */
  const counts = useMemo(
    () => tallyDiff(diffLines(processedA, processedB)),
    [processedA, processedB],
  );

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setAnalysis(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setAnalysis(streamRef.current); setBusy(false); }
      else if (msg?.type === 'aiStream:error') { setAiError(msg.error || 'The model did not answer.'); setBusy(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const analyse = () => {
    if (busy || (!processedA.trim() && !processedB.trim())) return;
    streamRef.current = '';
    setAnalysis('');
    setAiError('');
    setBusy(true);
    setView('analysis');
    postMsg({ type: 'aiStream', payload: {
      systemPrompt: resolve('rest.response.diff.system', {}),
      userMessage: resolve('rest.response.diff', {
        labelA, labelB,
        responseA: processedA.slice(0, 6000),
        responseB: processedB.slice(0, 6000),
      }),
      templateKey: 'rest.response.diff',
    }});
  };

  const loadFromTab = (tabId: string, side: 'a' | 'b') => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab?.response) return;
    const body = tab.response.body || '';
    const label = `${tab.method || 'GET'} ${tab.url?.split('/').slice(-2).join('/') || ''}`;
    if (side === 'a') { setBodyA(body); setLabelA(label); }
    else { setBodyB(body); setLabelB(label); }
  };

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
      size="xxl"
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ButtonView
            size="md"
            variant="primary"
            accentColor={showDiff ? 'var(--color-text-muted)' : ACCENT}
            onClick={() => { if (!showDiff) logUiEvent('settings.diff_compare'); setShowDiff(p => !p); }}
          >
            {showDiff ? '✎ Edit' : '⇄ Compare'}
          </ButtonView>
          <AIButtonView
            label={busy ? 'Analysing…' : 'Analyse differences'}
            size="md"
            accentColor={ACCENT}
            disabled={busy || (!bodyA.trim() && !bodyB.trim())}
            onClick={analyse}
          />
        </div>
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

        {/* The summary strip — the same shape the schema comparison uses, with
            line counts in place of severities: a response diff has no notion of
            critical, and what a reader wants at a glance is how much moved. */}
        {showDiff && (
          <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0 flex-wrap">
            <BadgeChipView tone="var(--color-success)" size="sm">{counts.added} added</BadgeChipView>
            <BadgeChipView tone="var(--color-error)" size="sm">{counts.removed} removed</BadgeChipView>
            <BadgeChipView tone="var(--color-text-muted)" size="sm">{counts.same} unchanged</BadgeChipView>
            {counts.added === 0 && counts.removed === 0 && (
              <BadgeChipView tone={ACCENT} size="sm">identical</BadgeChipView>
            )}
            <span className="flex-1" />
            {/* No Graph tab: the schema graph draws one node per database
                object, and two response bodies have no objects to draw. An
                empty pane behind a tab labelled Graph is worse than no tab. */}
            <TabView
              tabs={[
                { id: 'diff', label: 'Diff' },
                { id: 'analysis', label: 'Analysis' },
              ] as TabItem[]}
              activeTab={view}
              onChange={id => setView(id as 'diff' | 'analysis')}
              variant="underline"
              size="sm"
              accentColor={ACCENT}
            />
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
            /* The same pane the schema comparison uses. Monaco's diff editor
               brings its own scrollbars, minimap and selection model, and a
               decoration pass that has to be configured before it colours
               anything — a lot of machinery to look at two response bodies. */
            view === 'diff' ? (
              <div className="flex-1 min-h-0">
                <LineDiffView
                  left={processedA}
                  right={processedB}
                  leftLabel={labelA}
                  rightLabel={labelB}
                  showTally
                />
              </div>
            ) : (
              <div className="flex-1 min-h-0 p-4 overflow-auto">
                {aiError && (
                  <p className="text-[11px] px-3 py-2 rounded-lg mb-3 m-0" style={{
                    color: 'var(--color-error)',
                    backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
                  }}>{aiError}</p>
                )}
                {analysis ? (
                  <EditorView value={analysis} language="markdown" height="100%" readOnly wordWrap bordered />
                ) : (
                  <p className="text-[12px] text-center py-12 m-0" style={{ color: 'var(--color-text-muted)' }}>
                    {busy ? 'Reading the two responses…' : 'Use “Analyse differences” to have the model explain what changed.'}
                  </p>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </ModalView>
  );
}
