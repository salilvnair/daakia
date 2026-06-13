/**
 * AiResponseActionsMenu — 3-dot AI actions button in the response tab bar.
 * Owns all AI modal/popover state so nothing else needs to track it.
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
import { DataSchemaModal } from './DataSchemaModal';
import type { ResponseData } from '../../../store/tabs-store';

interface Props {
  tabId: string;
  response: ResponseData;
  requestMethod: string;
  requestUrl: string;
}

interface FloatingCoords {
  top?: number;
  bottom?: number;
  right: number;
}

// ── Reusable menu item ────────────────────────────────────────────────────────

function AiMenuItem({ label, accentColor, onClick }: { label: string; accentColor: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="w-full flex items-center gap-2.5 px-3 py-2 text-[11.5px] cursor-pointer transition-all text-left"
      style={{ color: 'var(--color-text-primary)' }}
      onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, ${accentColor} 8%, transparent)`; e.currentTarget.style.color = accentColor; }}
      onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
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

  const [dropdownCoords, setDropdownCoords] = useState<FloatingCoords | null>(null);

  const [showNaturalAssert, setShowNaturalAssert] = useState(false);
  const [showSemanticVal, setShowSemanticVal] = useState(false);
  const [showTransformer, setShowTransformer] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showSchemaVal, setShowSchemaVal] = useState(false);
  const [showDataSchema, setShowDataSchema] = useState(false);

  const btnRef = useRef<HTMLButtonElement>(null);

  const hasBody = !!response.body?.trim();
  const isJson = !!response.contentType?.includes('json');

  const hasAnyAction =
    aiEnabled('assertGeneration') ||
    aiEnabled('semanticValidator') ||
    aiEnabled('responseTransformer') ||
    aiEnabled('responseDiff') ||
    aiEnabled('schemaRest') ||
    (isJson && hasBody); // Generate Data Schema always available for JSON responses

  const isOpen = !!dropdownCoords;

  const calcCoords = useCallback((estimatedMenuH = 220): FloatingCoords => {
    const rect = btnRef.current!.getBoundingClientRect();
    return {
      ...(window.innerHeight - rect.bottom > estimatedMenuH ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
      right: window.innerWidth - rect.right,
    };
  }, []);

  const openDropdown = useCallback(() => setDropdownCoords(calcCoords()), [calcCoords]);
  const closeDropdown = useCallback(() => setDropdownCoords(null), []);

  const handleAssert = useCallback(() => {
    setShowNaturalAssert(p => !p);
    closeDropdown();
  }, [closeDropdown]);

  if (!hasBody || !hasAnyAction) return null;

  const cached = getTabActions(tabId);
  const hasCachedResult = !!(cached.assert?.result || cached.semantic?.result || cached.transform?.result);

  return (
    <>
      {/* 3-dot trigger */}
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
          {hasCachedResult && (
            <span
              className="absolute top-[3px] right-[3px] w-[5px] h-[5px] rounded-full pointer-events-none"
              style={{ backgroundColor: 'var(--color-protocol-ai)' }}
            />
          )}
        </button>
      </div>

      {/* Dropdown */}
      {dropdownCoords && (
        <>
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
            <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
              <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                AI Actions
              </p>
            </div>

            {aiEnabled('assertGeneration') && (
              <AiMenuItem label="Assert (plain English)" accentColor="var(--color-protocol-ai)" onClick={handleAssert} />
            )}
            {aiEnabled('semanticValidator') && (
              <AiMenuItem label="Semantic Validate" accentColor="var(--color-success)" onClick={() => { setShowSemanticVal(true); closeDropdown(); }} />
            )}
            {aiEnabled('responseTransformer') && (
              <AiMenuItem label="Transform Response" accentColor="var(--color-warning)" onClick={() => { setShowTransformer(true); closeDropdown(); }} />
            )}
            {aiEnabled('responseDiff') && (
              <AiMenuItem label="Compare with AI" accentColor="var(--color-warning)" onClick={() => { setShowDiff(true); closeDropdown(); }} />
            )}
            {aiEnabled('schemaRest') && (
              <AiMenuItem label="Validate Schema with AI" accentColor="var(--color-info)" onClick={() => { setShowSchemaVal(true); closeDropdown(); }} />
            )}
            {isJson && hasBody && (
              <AiMenuItem label="Generate Data Schema" accentColor="var(--color-primary)" onClick={() => { setShowDataSchema(true); closeDropdown(); }} />
            )}
          </div>
        </>
      )}

      {/* Assert popover */}
      {showNaturalAssert && (
        <AiNaturalAssertPopover
          tabId={tabId}
          response={{ body: response.body, status: response.status ?? 200, contentType: response.contentType }}
          requestMethod={requestMethod}
          requestUrl={requestUrl}
          onClose={() => setShowNaturalAssert(false)}
          anchorEl={btnRef.current}
        />
      )}

      {showSemanticVal && (
        <AiSemanticValidatorModal
          tabId={tabId}
          responseBody={response.body || ''}
          method={requestMethod}
          url={requestUrl}
          status={String(response.status || '')}
          onClose={() => setShowSemanticVal(false)}
        />
      )}

      {showTransformer && (
        <AiResponseTransformer
          tabId={tabId}
          responseBody={response.body || ''}
          contentType={response.contentType}
          method={requestMethod}
          url={requestUrl}
          onClose={() => setShowTransformer(false)}
        />
      )}

      {showDiff && (
        <AiResponseDiffModal
          currentResponseBody={response.body || ''}
          method={requestMethod}
          url={requestUrl}
          onClose={() => setShowDiff(false)}
        />
      )}

      {showSchemaVal && (
        <AiSchemaValidatorModal
          responseBody={response.body || ''}
          method={requestMethod}
          url={requestUrl}
          status={String(response.status || '')}
          onClose={() => setShowSchemaVal(false)}
        />
      )}

      {showDataSchema && (
        <DataSchemaModal body={response.body} onClose={() => setShowDataSchema(false)} />
      )}
    </>
  );
}
