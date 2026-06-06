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
import { postMsg } from '../../../vscode';

// ─── Constants ───────────────────────────────────────────────────────────────

const AI_ACCENT = 'var(--color-protocol-ai)';
const MAX_JSON_CHARS = 3000; // truncate response body for the AI prompt

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

  // AI streaming state
  const [aiCode, setAiCode] = useState('');
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiError, setAiError] = useState('');
  const [generationMs, setGenerationMs] = useState(0);

  const generationStartRef = useRef(0);
  const popoverIdRef = useRef('');

  // Provider info
  const providers = useAiProvidersStore(s => s.providers);
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const providerId = activeTab?.aiProvider || providers.find(p => p.enabled)?.id || 'openai';
  const model = activeTab?.aiModel || providers.find(p => p.id === providerId)?.models.find(m => m.enabled)?.id || '';

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

    // Reset state
    setAiCode('');
    setAiError('');
    setAiStreaming(true);
    generationStartRef.current = Date.now();

    // Unique ID for this generation run — isolates responses from real AI tab
    const pid = `ai-schema-${Date.now()}`;
    popoverIdRef.current = pid;

    // Build truncated JSON preview for the prompt
    const jsonPreview = body.length > MAX_JSON_CHARS
      ? body.slice(0, MAX_JSON_CHARS) + '\n// ... (truncated)'
      : body;

    const prompt = buildSchemaPrompt(lang, jsonPreview);

    postMsg({
      type: 'ai:send',
      tabId: pid,
      provider: providerId,
      model,
      baseUrl: activeTab?.url || '',
      systemPrompts: ['You are a precise code generation assistant. Output only code — no explanations, no markdown code fences, no preamble.'],
      userPrompt: prompt,
      conversation: [],
      tools: [],
      settings: { temperature: 0.2, maxTokens: 1500, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
      authType: activeTab?.authType,
      authData: activeTab?.authData,
      envId: activeTab?.envId,
    });
  }, [aiMode, body, lang, providerId, model, activeTab]);

  // ── Message listener for AI responses ─────────────────────────────────────

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== popoverIdRef.current) return;

      if (msg.type === 'ai:chunk') {
        const delta = (msg.delta as string) || (msg.text as string) || '';
        setAiCode(prev => prev + delta);
      }
      if (msg.type === 'ai:complete') {
        const msgPayload = msg.message as Record<string, unknown> | undefined;
        const content = (msgPayload?.content as string) || '';
        if (content) setAiCode(prev => prev || content);
        setAiStreaming(false);
        setGenerationMs(Date.now() - generationStartRef.current);
      }
      if (msg.type === 'ai:error') {
        setAiError((msg.message as string) || 'AI generation failed');
        setAiStreaming(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── Auto-generate on open and when lang/mode changes ──────────────────────

  useEffect(() => {
    if (aiMode) triggerAiGeneration();
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

  // ── Derived display values ─────────────────────────────────────────────────

  const displayCode = aiMode ? aiCode : staticCode;
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
              onClick={() => setAiMode(true)}
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
              onClick={triggerAiGeneration}
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
        <div className="flex-1 min-h-0 flex flex-col">
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

          {/* Editor */}
          <div className="flex-1 min-h-[400px] max-h-[560px] relative">
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
              height="100%"
              wordWrap={wrapLines}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
