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
import { CodeEditor } from '../../shared';
import { StyledDropdown, type DropdownOption } from '../../shared';
import { useAiProvidersStore } from '../../../store/ai-providers-store';
import { useTabsStore } from '../../../store/tabs-store';
import { generateSchema, downloadBlob, SCHEMA_LANG_META, LANG_GROUP_ORDER, GROUP_BADGE_COLORS, buildSchemaPrompt, type SchemaLang } from '../../../services/response';
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

// ─── Build dropdown options with group headers ────────────────────────────────

function buildLangOptions(): DropdownOption[] {
  const groups: Record<string, SchemaLang[]> = {};
  for (const [lang, meta] of Object.entries(SCHEMA_LANG_META) as [SchemaLang, typeof SCHEMA_LANG_META[SchemaLang]][]) {
    if (!groups[meta.group]) groups[meta.group] = [];
    groups[meta.group].push(lang);
  }

  const opts: DropdownOption[] = [];
  for (const groupName of LANG_GROUP_ORDER) {
    const langs = groups[groupName];
    if (!langs?.length) continue;
    opts.push({ value: `__header__${groupName}`, label: groupName, isHeader: true });
    for (const lang of langs) {
      const meta = SCHEMA_LANG_META[lang];
      const color = GROUP_BADGE_COLORS[groupName] ?? '#6366f1';
      opts.push({
        value: lang,
        label: meta.label,
        color,
        icon: (
          <span
            className="text-[8px] font-bold px-1 py-px rounded-sm leading-none"
            style={{ backgroundColor: color + '22', color }}
          >
            {meta.badge}
          </span>
        ),
      });
    }
  }
  return opts;
}

const LANG_OPTIONS = buildLangOptions();

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
  const editorLang = meta.editorLang;
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
            className="w-7 h-7 flex items-center justify-center rounded text-[#ef4444] hover:text-[#dc2626] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-colors"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* ── Controls row ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--color-surface-border)]">
          {/* Language picker */}
          <div className="flex-1 max-w-[280px]">
            <StyledDropdown
              options={LANG_OPTIONS}
              value={lang}
              onChange={handleLangChange}
              size="sm"
              accentColor={AI_ACCENT}
            />
          </div>

          {/* AI / Static mode toggle */}
          <div
            className="flex items-center rounded-lg overflow-hidden border"
            style={{ borderColor: 'var(--color-surface-border)' }}
          >
            <button
              type="button"
              onClick={() => { resetAi(); setAiMode(true); }}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium cursor-pointer transition-all"
              style={{
                backgroundColor: aiMode ? `color-mix(in srgb, ${AI_ACCENT} 12%, transparent)` : 'transparent',
                color: aiMode ? AI_ACCENT : 'var(--color-text-muted)',
              }}
            >
              <SparkleIcon size={10} style={{ color: aiMode ? AI_ACCENT : 'var(--color-text-muted)' }} />
              AI
            </button>
            <button
              type="button"
              onClick={() => {
                if (!meta.hasStatic) return; // can't use static for this lang
                resetAi();
                setAiMode(false);
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium cursor-pointer transition-all"
              style={{
                backgroundColor: !aiMode ? 'var(--color-surface-hover)' : 'transparent',
                color: !aiMode ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                opacity: !meta.hasStatic ? 0.35 : 1,
                cursor: !meta.hasStatic ? 'not-allowed' : 'pointer',
              }}
              title={!meta.hasStatic ? 'Static generation not available for this language' : undefined}
            >
              Static
            </button>
          </div>

          {/* Regenerate button (AI mode only) */}
          {aiMode && (
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-all border"
              style={{
                borderColor: `color-mix(in srgb, ${AI_ACCENT} 30%, transparent)`,
                color: isGenerating ? 'var(--color-text-muted)' : AI_ACCENT,
                backgroundColor: isGenerating ? 'transparent' : `color-mix(in srgb, ${AI_ACCENT} 8%, transparent)`,
                cursor: isGenerating ? 'not-allowed' : 'pointer',
              }}
            >
              <SparkleIcon size={10} />
              {isGenerating ? 'Generating…' : 'Regenerate'}
            </button>
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

          {/* Editor — explicit 480px height so Monaco resolves height: 100% correctly
                (flex-1 without a definite ancestor height would give Monaco 0px) */}
          <div className="relative" style={{ height: 480 }}>
            {/* Empty / loading state overlay */}
            {aiMode && !aiCode && isGenerating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-[var(--color-panel)]">
                <div className="flex gap-1">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ backgroundColor: AI_ACCENT, animationDelay: `${d}ms` }} />
                  ))}
                </div>
                <p className="text-[12px] text-[var(--color-text-muted)]">
                  Generating {meta.label} schema…
                </p>
                <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
                  Using {providerLabel} {model ? `/ ${model}` : ''}
                </p>
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
            <CodeEditor
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
