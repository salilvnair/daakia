/**
 * DataSchemaModal — AI-powered schema generation from JSON API responses.
 *
 * Modes:
 *   AI (default) — uses the user's active AI provider to generate a schema via streaming.
 *   Static       — deterministic AST-based generator (TS / JS / Python dataclass / Java only).
 *
 * Tasks: 4.3.12 — AI Data Schema Generator
 */
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { SelectInputView, AIButtonView, EditorView, SegmentedControlView, type SelectOption, type EditorLanguage } from '../../../dui';
import { useAiProvidersStore } from '../../../store/ai-providers-store';
import { useTabsStore } from '../../../store/tabs-store';
import { generateSchema, downloadBlob, SCHEMA_LANG_META, SCHEMA_LANG_OPTIONS, buildSchemaPrompt, type SchemaLang } from '../../../services/response';
import { WrapLinesIcon, DownloadIcon, CopyIcon, CloseIcon, SparkleIcon } from '../../../icons';
import { ToolbarBtn } from './ToolbarBtn';
import { useAiStream } from '../../../hooks/useAiStream';

// ─── Constants ───────────────────────────────────────────────────────────────

const AI_ACCENT = 'var(--color-protocol-ai)';
const MAX_JSON_CHARS = 3000; // truncate response body for the AI prompt

// ─── Schema cache (module-level — survives modal open/close within a session) ─

const schemaCache = new Map<string, string>();

function getBodyFingerprint(body: string): string {
  return `${body.length}:${body.slice(0, 150)}`;
}

// SCHEMA_LANG_OPTIONS is the single source of truth — shared with DuiShowcase.
// Cast is safe: the plain objects are structurally compatible with SelectOption[].
const LANG_OPTIONS = SCHEMA_LANG_OPTIONS as SelectOption[];

// ─── Component ───────────────────────────────────────────────────────────────

export function DataSchemaModal({ body, onClose }: { body: string; onClose: () => void }) {
  const [lang, setLang] = useState<SchemaLang>('typescript');
  const [aiMode, setAiMode] = useState(true);
  const [wrapLines, setWrapLines] = useState(false);
  const [generationMs, setGenerationMs] = useState(0);
  const generationStartRef = useRef(0);
  // Holds cached schema so we can display it without re-generating
  const [overrideCode, setOverrideCode] = useState('');

  // Provider info — used only for the display label ("Generated via X")
  const providers = useAiProvidersStore(s => s.providers);
  const defaultProviderId = useAiProvidersStore(s => s.defaultProviderId);
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const providerId = activeTab?.aiProvider || defaultProviderId || providers.find(p => p.enabled)?.id || 'openai';
  const model = activeTab?.aiModel || providers.find(p => p.id === providerId)?.models.find(m => m.enabled)?.id || '';

  // ── Centralized AI stream (via useAiStream hook) ───────────────────────────
  const { text: aiCode, streaming: aiStreaming, error: aiError, trigger: triggerAi, reset: resetAi } = useAiStream();

  const meta = SCHEMA_LANG_META[lang];

  // Static generation (memoized)
  const staticCode = useMemo(() => {
    if (aiMode) return '';
    try {
      const parsed = JSON.parse(body);
      return generateSchema(parsed, lang);
    } catch {
      return '// Unable to parse JSON response body';
    }
  }, [body, lang, aiMode]);

  // ── AI generation ──────────────────────────────────────────────────────────

  const triggerAiGeneration = useCallback(() => {
    if (!aiMode) return;

    generationStartRef.current = Date.now();
    setGenerationMs(0);

    const jsonPreview = body.length > MAX_JSON_CHARS
      ? body.slice(0, MAX_JSON_CHARS) + '\n// ... (truncated)'
      : body;

    triggerAi(buildSchemaPrompt(lang, jsonPreview), {
      systemPrompts: ['You are a precise code generation assistant. Output only code — no explanations, no markdown code fences, no preamble.'],
      settings: { temperature: 0.2, maxTokens: 1500 },
    });
  }, [aiMode, body, lang, triggerAi]);

  // Record generation time when streaming ends; save result to cache
  useEffect(() => {
    if (!aiStreaming && generationStartRef.current > 0 && aiCode) {
      setGenerationMs(Date.now() - generationStartRef.current);
      schemaCache.set(`${lang}:${getBodyFingerprint(body)}`, aiCode);
    }
  }, [aiStreaming, aiCode, lang, body]);

  // ── Auto-generate on open and when lang/mode changes ──────────────────────
  // Checks the module-level cache first — skips generation if body + lang hit.

  useEffect(() => {
    if (!aiMode) { resetAi(); setOverrideCode(''); return; }
    const key = `${lang}:${getBodyFingerprint(body)}`;
    const cached = schemaCache.get(key);
    if (cached) {
      resetAi();
      setOverrideCode(cached);
    } else {
      setOverrideCode('');
      triggerAiGeneration();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, aiMode]);

  // ── Switch to AI if lang has no static generator ──────────────────────────

  const handleLangChange = (newLang: string) => {
    const sl = newLang as SchemaLang;
    setLang(sl);
    if (!SCHEMA_LANG_META[sl].hasStatic && !aiMode) {
      setAiMode(true); // force AI mode for langs without static generator
    }
  };

  // ── Regenerate — clears cache for current key then triggers generation ──────

  const handleRegenerate = useCallback(() => {
    const key = `${lang}:${getBodyFingerprint(body)}`;
    schemaCache.delete(key);
    setOverrideCode('');
    triggerAiGeneration();
  }, [lang, body, triggerAiGeneration]);

  // ── Derived display values ─────────────────────────────────────────────────

  const displayCode = aiMode ? (aiCode || overrideCode) : staticCode;
  const editorLang = meta.editorLang as EditorLanguage;
  const isGenerating = aiMode && aiStreaming;

  const providerLabel = providers.find(p => p.id === providerId)?.name || providerId;

  // ── Download ───────────────────────────────────────────────────────────────

  const handleDownload = () => {
    downloadBlob(displayCode, `schema.${meta.fileExt}`);
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    // IMPORTANT: backdrop does NOT close modal — only X button closes it (per project rules)
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-surface-border)] rounded-xl shadow-2xl w-[980px] max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-surface-border)]">
          <div className="flex items-center gap-2">
            <SparkleIcon size={15} style={{ color: AI_ACCENT }} />
            <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)]">Data Schema Generator</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors"
            style={{ color: 'var(--color-error)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-error) 10%, transparent)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* ── Controls row ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--color-surface-border)]">
          {/* Language picker */}
          <div className="flex-1 max-w-[280px]">
            <SelectInputView
              options={LANG_OPTIONS}
              value={lang}
              onChange={handleLangChange}
              size="md"
              accentColor={AI_ACCENT}
              style={{ width: '100%' }}
            />
          </div>

          {/* AI / Static mode toggle — DUI SegmentedControlView */}
          <SegmentedControlView
            size="md"
            accentColor={AI_ACCENT}
            value={aiMode ? 'ai' : 'static'}
            onChange={(v) => {
              if (v === 'ai') { resetAi(); setAiMode(true); }
              else if (meta.hasStatic) { resetAi(); setAiMode(false); }
            }}
            options={[
              { value: 'ai', label: 'AI', icon: <SparkleIcon size={10} /> },
              { value: 'static', label: 'Static', disabled: !meta.hasStatic },
            ]}
          />

          {/* Regenerate button (AI mode only) */}
          {aiMode && (
            <AIButtonView
              label={isGenerating ? 'Generating…' : 'Regenerate'}
              size="md"
              accentColor={AI_ACCENT}
              disabled={isGenerating}
              onClick={handleRegenerate}
            />
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Status indicator */}
          <div className="flex items-center gap-2">
            {isGenerating && (
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
                  {[0, 120, 240].map(d => (
                    <span key={d} className="w-[4px] h-[4px] rounded-full animate-pulse" style={{ backgroundColor: AI_ACCENT, animationDelay: `${d}ms` }} />
                  ))}
                </div>
                <span className="text-[10px]" style={{ color: AI_ACCENT }}>Generating with {providerLabel}…</span>
              </div>
            )}
            {!isGenerating && !aiError && aiMode && overrideCode && !aiCode && (
              <span className="text-[10px] text-[var(--color-text-muted)]">Cached · Regenerate to refresh</span>
            )}
            {!isGenerating && !aiError && aiMode && aiCode && (
              <span className="text-[10px] text-[var(--color-text-muted)]">
                Generated in {(generationMs / 1000).toFixed(1)}s via {providerLabel}
              </span>
            )}
            {aiError && (
              <span className="text-[10px] text-[var(--color-error)] max-w-[240px] truncate" title={aiError}>
                ⚠️ {aiError}
              </span>
            )}
          </div>
        </div>

        {/* ── Code area ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-2">
            <span className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5">
              {aiMode ? (
                <>
                  <SparkleIcon size={10} style={{ color: AI_ACCENT }} />
                  AI-generated {meta.label}
                </>
              ) : (
                `Static ${meta.label}`
              )}
            </span>
            <div className="flex items-center gap-1">
              <ToolbarBtn title="Wrap lines" onClick={() => setWrapLines(w => !w)}>
                <WrapLinesIcon size={14} />
              </ToolbarBtn>
              <ToolbarBtn
                title="Download"
                onClick={handleDownload}
              >
                <DownloadIcon size={14} />
              </ToolbarBtn>
              <ToolbarBtn
                title="Copy to clipboard"
                onClick={() => navigator.clipboard.writeText(displayCode)}
              >
                <CopyIcon size={14} />
              </ToolbarBtn>
            </div>
          </div>

          {/* Editor — explicit 480px height so Monaco resolves height: 100% correctly */}
          <div className="relative" style={{ height: 480 }}>
            {/* Loading state overlay */}
            {aiMode && !aiCode && isGenerating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-[var(--color-panel)]">
                <div className="flex gap-1">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ backgroundColor: AI_ACCENT, animationDelay: `${d}ms` }} />
                  ))}
                </div>
                <p className="text-[12px] text-[var(--color-text-muted)]">Generating {meta.label} schema…</p>
                <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">Using {providerLabel} {model ? `/ ${model}` : ''}</p>
              </div>
            )}
            {/* Error state */}
            {aiMode && aiError && !aiCode && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 bg-[var(--color-panel)]">
                <p className="text-[13px] text-[var(--color-error)]">⚠️ Generation failed</p>
                <p className="text-[11px] text-[var(--color-text-muted)] max-w-[400px] text-center">{aiError}</p>
                <button
                  type="button"
                  onClick={triggerAiGeneration}
                  className="mt-2 px-3 py-1.5 rounded-lg text-[11px] cursor-pointer border"
                  style={{ color: AI_ACCENT, borderColor: `color-mix(in srgb, ${AI_ACCENT} 30%, transparent)` }}
                >
                  Try again
                </button>
              </div>
            )}
            <EditorView
              value={displayCode}
              language={editorLang}
              readOnly
              height="480px"
              wordWrap={wrapLines}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
