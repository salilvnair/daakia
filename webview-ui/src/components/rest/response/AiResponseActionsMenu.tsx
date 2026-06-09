/**
 * AiResponseActionsMenu — 3-dot AI actions button in the response tab bar.
 * Lives next to Record Baseline. Opens a fixed dropdown with all 5 AI response actions.
 * Owns all AI modal/popover state so the JSON ⋮ menu stays clean (Clear Response only).
 */
import { useState, useRef, useCallback } from 'react';
import { useAiFeaturesStore } from '../../../store/ai-features-store';
import { useAiResponseActionsStore } from '../../../store/ai-response-actions-store';
import { SparkleIcon, MoreVerticalIcon } from '../../../icons';
import { AiNaturalAssertPopover } from '../../ai/AiNaturalAssertPopover';
import { AiSemanticValidatorModal } from '../../ai/AiSemanticValidatorModal';
import { AiResponseTransformer } from '../../ai/AiResponseTransformer';
import { AiResponseDiffModal } from '../../ai/AiResponseDiffModal';
import { AiSchemaValidatorModal } from '../../ai/AiSchemaValidatorModal';
import type { ResponseData } from '../../../store/tabs-store';

interface Props {
  tabId: string;
  response: ResponseData;
  requestMethod: string;
  requestUrl: string;
}

interface DropdownCoords {
  top?: number;
  bottom?: number;
  right: number;
}

interface AssertCoords {
  top?: number;
  bottom?: number;
  right: number;
}

// ── Reusable menu item button ─────────────────────────────────────────────────

function AiMenuItem({
  label,
  accentColor,
  onClick,
}: {
  label: string;
  accentColor: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="w-full flex items-center gap-2.5 px-3 py-2 text-[11.5px] cursor-pointer transition-all text-left"
      style={{ color: 'var(--color-text-primary)' }}
      onMouseEnter={e => {
        e.currentTarget.style.background = `color-mix(in srgb, ${accentColor} 8%, transparent)`;
        e.currentTarget.style.color = accentColor;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = '';
        e.currentTarget.style.color = 'var(--color-text-primary)';
      }}
      onClick={onClick}
    >
      <SparkleIcon size={11} style={{ color: accentColor, flexShrink: 0 }} />
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function AiResponseActionsMenu({ tabId, response, requestMethod, requestUrl }: Props) {
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);
  const { getTabActions } = useAiResponseActionsStore();

  const [dropdownCoords, setDropdownCoords] = useState<DropdownCoords | null>(null);
  const [assertCoords, setAssertCoords] = useState<AssertCoords | null>(null);

  const [showNaturalAssert, setShowNaturalAssert] = useState(false);
  const [showSemanticVal, setShowSemanticVal] = useState(false);
  const [showTransformer, setShowTransformer] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showSchemaVal, setShowSchemaVal] = useState(false);

  const btnRef = useRef<HTMLButtonElement>(null);

  const hasBody = !!response.body?.trim();
  const hasAnyAction =
    aiEnabled('assertGeneration') ||
    aiEnabled('semanticValidator') ||
    aiEnabled('responseTransformer') ||
    aiEnabled('responseDiff') ||
    aiEnabled('schemaRest');

  const isOpen = !!dropdownCoords;

  const openDropdown = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const estimatedMenuH = 220;
    const hasRoomBelow = window.innerHeight - rect.bottom > estimatedMenuH;
    setDropdownCoords({
      ...(hasRoomBelow ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
      right: window.innerWidth - rect.right,
    });
  }, []);

  const closeDropdown = useCallback(() => setDropdownCoords(null), []);

  const closeAllModals = useCallback(() => {
    setShowNaturalAssert(false);
    setAssertCoords(null);
    setShowSemanticVal(false);
    setShowTransformer(false);
    setShowDiff(false);
    setShowSchemaVal(false);
  }, []);

  const handleAssert = useCallback(() => {
    const btn = btnRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const estimatedHeight = 220;
      const hasRoomBelow = window.innerHeight - rect.bottom > estimatedHeight;
      setAssertCoords({
        ...(hasRoomBelow ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
        right: window.innerWidth - rect.right,
      });
    }
    setShowNaturalAssert(p => !p);
    closeDropdown();
  }, [closeDropdown]);

  if (!hasBody || !hasAnyAction) return null;

  // Badge: show a dot if any tab has a cached result for this tab
  const cached = getTabActions(tabId);
  const hasCachedResult = !!(cached.assert?.result || cached.semantic?.result || cached.transform?.result);

  return (
    <>
      {/* 3-dot button — ditto ToolbarBtn style */}
      <div className="relative">
        <button
          ref={btnRef}
          type="button"
          onClick={isOpen ? closeDropdown : openDropdown}
          title="AI Actions"
          className={`w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors ${
            isOpen
              ? 'text-[var(--color-primary)] bg-[rgba(99,102,241,0.12)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)]'
          }`}
        >
          <MoreVerticalIcon size={14} />
          {/* Cached result dot — tiny AI-tinted badge */}
          {hasCachedResult && (
            <span
              className="absolute top-[3px] right-[3px] w-[5px] h-[5px] rounded-full pointer-events-none"
              style={{ backgroundColor: 'var(--color-protocol-ai)' }}
            />
          )}
        </button>
      </div>

      {/* Dropdown — fixed position */}
      {dropdownCoords && (
        <>
          {/* Backdrop for click-outside */}
          <div className="fixed inset-0 z-[9998]" onClick={closeDropdown} />
          <div
            className="rounded-xl border shadow-2xl overflow-hidden min-w-[210px]"
            style={{
              position: 'fixed',
              ...(dropdownCoords.top !== undefined ? { top: dropdownCoords.top } : { bottom: dropdownCoords.bottom }),
              right: dropdownCoords.right,
              zIndex: 9999,
              backgroundColor: 'var(--color-panel)',
              borderColor: 'var(--color-surface-border)',
            }}
          >
            {/* Header */}
            <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
              <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                AI Actions
              </p>
            </div>

            {aiEnabled('assertGeneration') && (
              <AiMenuItem
                label="Assert (plain English)"
                accentColor="var(--color-protocol-ai)"
                onClick={handleAssert}
              />
            )}
            {aiEnabled('semanticValidator') && (
              <AiMenuItem
                label="Semantic Validate"
                accentColor="var(--color-success)"
                onClick={() => { setShowSemanticVal(true); closeDropdown(); }}
              />
            )}
            {aiEnabled('responseTransformer') && (
              <AiMenuItem
                label="Transform Response"
                accentColor="var(--color-warning)"
                onClick={() => { setShowTransformer(true); closeDropdown(); }}
              />
            )}
            {aiEnabled('responseDiff') && (
              <AiMenuItem
                label="Compare with AI"
                accentColor="#f59e0b"
                onClick={() => { setShowDiff(true); closeDropdown(); }}
              />
            )}
            {aiEnabled('schemaRest') && (
              <AiMenuItem
                label="Validate Schema with AI"
                accentColor="var(--color-info)"
                onClick={() => { setShowSchemaVal(true); closeDropdown(); }}
              />
            )}
          </div>
        </>
      )}

      {/* AI Assert popover — fixed position */}
      {showNaturalAssert && assertCoords && (
        <div
          style={{
            position: 'fixed',
            ...(assertCoords.top !== undefined ? { top: assertCoords.top } : { bottom: assertCoords.bottom }),
            right: assertCoords.right,
            zIndex: 9999,
            width: 440,
          }}
        >
          <AiNaturalAssertPopover
            tabId={tabId}
            response={{ body: response.body, status: response.status ?? 200, contentType: response.contentType }}
            requestMethod={requestMethod}
            requestUrl={requestUrl}
            onClose={() => { setShowNaturalAssert(false); setAssertCoords(null); }}
          />
        </div>
      )}

      {/* AI Semantic Validator Modal */}
      {showSemanticVal && (
        <AiSemanticValidatorModal
          tabId={tabId}
          responseBody={response.body || ''}
          method={requestMethod}
          url={requestUrl}
          status={String(response.status || '')}
          onClose={() => { setShowSemanticVal(false); }}
        />
      )}

      {/* AI Response Transformer Modal */}
      {showTransformer && (
        <AiResponseTransformer
          tabId={tabId}
          responseBody={response.body || ''}
          contentType={response.contentType}
          method={requestMethod}
          url={requestUrl}
          onClose={() => { setShowTransformer(false); }}
        />
      )}

      {/* AI Diff Modal */}
      {showDiff && (
        <AiResponseDiffModal
          currentResponseBody={response.body || ''}
          method={requestMethod}
          url={requestUrl}
          onClose={() => { setShowDiff(false); }}
        />
      )}

      {/* AI Schema Validator Modal */}
      {showSchemaVal && (
        <AiSchemaValidatorModal
          responseBody={response.body || ''}
          method={requestMethod}
          url={requestUrl}
          status={String(response.status || '')}
          onClose={() => { setShowSchemaVal(false); }}
        />
      )}
    </>
  );
}
