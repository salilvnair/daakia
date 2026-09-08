/**
 * Schema Diff & Anomaly Detection — SD-1, SD-2, SD-4, SD-5, SD-6, SD-8.
 *
 * ── The shape of it ──
 *
 * Pick two schemas, compare them, read what differs, ask the model what it
 * means, then get a migration out of it. The comparison itself is arithmetic
 * and happens here (`services/schema-diff`); the model is asked only for the
 * things a model is good for — what a change means for a consumer, and what
 * SQL would close it.
 *
 * ── Why severity is not the model's job ──
 *
 * The anomaly list is ranked before the model sees it. A severity that comes
 * back differently on two runs of the same comparison is not a severity, and a
 * migration decision made on one is a coin toss. What the model adds is the
 * paragraph under each finding.
 *
 * ── SD-7, and why this works without it ──
 *
 * The plan pairs this with a `compare_schemas` tool in pgsql_mcp that connects
 * to both databases and returns the diff. That tool is not built. Rather than
 * ship a screen that can only be driven by something that does not exist, the
 * DDL comes from wherever you have it — pasted, or from a saved MCP connection
 * profile — and `fromComparePayload` in the service is the seam the tool drops
 * into. Nothing here changes when it lands.
 */
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  ModalView, AIButtonView, ButtonView, SelectInputView, EditorView,
  BadgeChipView, CodeBlockView, TabView, IconButtonView, type TabItem,
} from '@salilvnair/dui';
import { SparkleIcon, DownloadIcon, LayersIcon, CollapseAllIcon, ExpandAllIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useSidebarDataStore } from '../../store/sidebar-data-store';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import {
  compareDdl, analysisDigest, type SchemaComparison, type SchemaAnomaly,
} from '../../services/schema-diff/schema-diff';
import { buildMarkdownReport, buildMigrationSql } from '../../services/schema-diff/report';
import { AnomalyCard } from './schema-diff/AnomalyCard';
import { SchemaGraphView } from './schema-diff/SchemaGraphView';

const ACCENT = 'var(--color-info)';

/** A schema you can compare against — SD-8's "any N environments". */
interface Env {
  id: string;
  label: string;
}

const PASTE: Env = { id: '__paste__', label: 'Paste DDL' };

/**
 * The environments to offer.
 *
 * SD-8 says these come from the user's configured MCP connections, "no
 * hardcoding". There is no separate registry of those — an MCP connection in
 * Daakia is a saved MCP request — so that is what this reads. Paste is always
 * first and always available: it is the one option that works before anything
 * has been configured, and the screen has to be usable on day one.
 */
function useEnvironments(): Env[] {
  const collections = useSidebarDataStore(s => s.getCollections('mcp'));
  return useMemo(() => {
    const out: Env[] = [PASTE];
    const walk = (nodes: { name: string; children?: unknown[]; requests?: { id: string; name: string }[] }[]) => {
      for (const n of nodes ?? []) {
        for (const r of n.requests ?? []) {
          out.push({ id: r.id, label: `${n.name} · ${r.name}` });
        }
        walk((n.children ?? []) as never);
      }
    };
    walk(collections as never);
    return out;
  }, [collections]);
}

type ViewMode = 'report' | 'graph' | 'migration';

interface Migration { deploy: string; verify: string; revert: string }

/** Pull the three scripts out of the model's answer. */
function parseMigration(text: string): Migration {
  const grab = (name: string) => {
    const re = new RegExp('```(?:sql)?\\s*(?:--\\s*)?' + name + '[\\s\\S]*?\\n([\\s\\S]*?)```', 'i');
    const m = re.exec(text);
    if (m) return m[1].trim();
    // Fall back to a heading followed by a fence.
    const alt = new RegExp('#{1,4}\\s*' + name + '[^\\n]*\\n+```(?:sql)?\\n([\\s\\S]*?)```', 'i');
    const m2 = alt.exec(text);
    return m2 ? m2[1].trim() : '';
  };
  const deploy = grab('deploy');
  const verify = grab('verify');
  const revert = grab('revert');
  if (deploy || verify || revert) return { deploy, verify, revert };

  /* No recognisable sections — hand the whole answer back as deploy rather
     than three empty boxes, so nothing the model produced is lost. */
  const fences = [...text.matchAll(/```(?:sql)?\n([\s\S]*?)```/g)].map(m => m[1].trim());
  return { deploy: fences[0] ?? text.trim(), verify: fences[1] ?? '', revert: fences[2] ?? '' };
}

export function AiSchemaDiffModal({ onClose }: { onClose: () => void }) {
  const envs = useEnvironments();
  const resolve = useAiPromptTemplatesStore(s => s.resolve);

  const [sourceEnv, setSourceEnv] = useState(PASTE.id);
  const [targetEnv, setTargetEnv] = useState(PASTE.id);
  const [sourceDdl, setSourceDdl] = useState('');
  const [targetDdl, setTargetDdl] = useState('');

  const [comparison, setComparison] = useState<SchemaComparison | null>(null);
  const [view, setView] = useState<ViewMode>('report');
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const [showInSync, setShowInSync] = useState(false);

  const [analysis, setAnalysis] = useState('');
  const [migration, setMigration] = useState<Migration | null>(null);
  const [busy, setBusy] = useState<null | 'analyse' | 'migrate'>(null);
  const [error, setError] = useState('');

  const streamRef = useRef('');
  const jobRef = useRef<null | 'analyse' | 'migrate'>(null);

  const labelOf = (id: string) => envs.find(e => e.id === id)?.label ?? 'Pasted DDL';
  const sourceLabel = sourceEnv === PASTE.id ? 'Pasted source' : labelOf(sourceEnv);
  const targetLabel = targetEnv === PASTE.id ? 'Pasted target' : labelOf(targetEnv);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') {
        streamRef.current += msg.chunk;
        if (jobRef.current === 'analyse') setAnalysis(streamRef.current);
      } else if (msg?.type === 'aiStream:done') {
        if (jobRef.current === 'migrate') setMigration(parseMigration(streamRef.current));
        else setAnalysis(streamRef.current);
        setBusy(null);
        jobRef.current = null;
      } else if (msg?.type === 'aiStream:error') {
        setError(msg.error || 'The model did not answer.');
        setBusy(null);
        jobRef.current = null;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── Compare ────────────────────────────────────────────────────────────────

  const canCompare = sourceDdl.trim().length > 0 || targetDdl.trim().length > 0;

  const handleCompare = useCallback(() => {
    setError('');
    setAnalysis('');
    setMigration(null);
    setOpenKeys(new Set());
    const c = compareDdl(sourceDdl, targetDdl);
    setComparison(c);
    setView('report');
  }, [sourceDdl, targetDdl]);

  /*
    Test-only hook for the wiki capture pipeline.

    A capture run has no database to compare and cannot type into a Monaco
    editor, so the two DDL dumps and the resulting comparison go in directly —
    the same pattern as the audit panel's and the realtime panels' seeds. It
    drives the real `compareDdl`, so the captured screen is the real screen and
    not a mock of it.
  */
  useEffect(() => {
    (window as never as Record<string, unknown>).__schemaDiffCaptureSeed = (
      seed: { source: string; target: string; view?: ViewMode; open?: string[]; analysis?: string },
    ) => {
      setSourceDdl(seed.source);
      setTargetDdl(seed.target);
      setComparison(compareDdl(seed.source, seed.target));
      setAnalysis(seed.analysis ?? '');
      setOpenKeys(new Set(seed.open ?? []));
      setView(seed.view ?? 'report');
      setError('');
    };
    return () => { delete (window as never as Record<string, unknown>).__schemaDiffCaptureSeed; };
  }, []);

  // ── Ask the model ──────────────────────────────────────────────────────────

  const handleAnalyse = useCallback(() => {
    if (!comparison || busy) return;
    streamRef.current = '';
    setAnalysis('');
    setError('');
    setBusy('analyse');
    jobRef.current = 'analyse';
    postMsg({ type: 'aiStream', payload: {
      systemPrompt: resolve('platform.schema.diff.system', {}),
      /* Bare names, not `{name}` — interpolateTemplate strips the braces
         before it looks the variable up. */
      userMessage: resolve('platform.schema.diff', {
        sourceLabel,
        targetLabel,
        digest: analysisDigest(comparison),
      }),
      templateKey: 'platform.schema.diff',
    }});
  }, [comparison, busy, resolve, sourceLabel, targetLabel]);

  const handleMigration = useCallback(() => {
    if (!comparison || busy) return;
    streamRef.current = '';
    setError('');
    setBusy('migrate');
    jobRef.current = 'migrate';
    setView('migration');
    /* The DDL of the drifted objects goes in here, unlike the analysis: you
       cannot write ALTER statements from a summary of what changed. Capped, so
       a hundred-table drift does not blow the context window silently. */
    const bodies = comparison.anomalies
      .filter(a => a.status !== 'in-sync')
      .slice(0, 40)
      .map(a => `-- ${a.type} ${a.name} (${a.status})\n-- source:\n${a.sourceDdl || '(absent)'}\n-- target:\n${a.targetDdl || '(absent)'}`)
      .join('\n\n');
    postMsg({ type: 'aiStream', payload: {
      systemPrompt: resolve('platform.schema.migration.system', {}),
      userMessage: resolve('platform.schema.migration', {
        sourceLabel,
        targetLabel,
        digest: analysisDigest(comparison),
        objects: bodies,
      }),
      templateKey: 'platform.schema.migration',
    }});
  }, [comparison, busy, resolve, sourceLabel, targetLabel]);

  // ── Export ─────────────────────────────────────────────────────────────────

  const exportReport = useCallback(() => {
    if (!comparison) return;
    postMsg({
      type: 'saveTextFile',
      content: buildMarkdownReport(comparison, {
        sourceLabel, targetLabel,
        analysis: analysis || undefined,
        migration: migration ?? undefined,
      }),
      filename: 'schema-comparison.md',
      title: 'Save schema comparison report',
    });
  }, [comparison, sourceLabel, targetLabel, analysis, migration]);

  const exportSql = useCallback(() => {
    if (!migration) return;
    postMsg({
      type: 'saveTextFile',
      content: buildMigrationSql(migration, { sourceLabel, targetLabel }),
      filename: 'schema-migration.sql',
      title: 'Save migration SQL',
    });
  }, [migration, sourceLabel, targetLabel]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const visible = useMemo(() => {
    if (!comparison) return [];
    return showInSync ? comparison.anomalies : comparison.anomalies.filter(a => a.status !== 'in-sync');
  }, [comparison, showInSync]);

  const toggle = (key: string) => setOpenKeys(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const tabs: TabItem[] = [
    { id: 'report', label: 'Report', badge: comparison ? visible.length : undefined },
    { id: 'graph', label: 'Graph' },
    { id: 'migration', label: 'Migration' },
  ];

  const summary = comparison && (
    <div className="flex items-center gap-2 flex-wrap">
      <BadgeChipView tone="var(--color-error)" size="sm">{comparison.counts.critical} critical</BadgeChipView>
      <BadgeChipView tone="var(--color-warning)" size="sm">{comparison.counts.warning} warning</BadgeChipView>
      <BadgeChipView tone="var(--color-info)" size="sm">{comparison.counts.info} info</BadgeChipView>
      <BadgeChipView tone="var(--color-success)" size="sm">{comparison.inSync} in sync</BadgeChipView>
      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
        of {comparison.total} object(s)
      </span>
    </div>
  );

  return (
    <ModalView
      open
      onClose={onClose}
      title="Schema Diff & Anomaly Detection"
      size="xl"
      headerColor={ACCENT}
      elevated
      headerIcon={
        <div style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `color-mix(in srgb, ${ACCENT} 18%, transparent)`,
        }}>
          <SparkleIcon size={13} style={{ color: ACCENT }} />
        </div>
      }
      footerLeft={
        comparison ? (
          <div className="flex items-center gap-1.5">
            <ButtonView size="sm" variant="ghost" iconLeft={<DownloadIcon size={12} />} onClick={exportReport}>
              Export report
            </ButtonView>
            {migration && (
              <ButtonView size="sm" variant="ghost" iconLeft={<DownloadIcon size={12} />} onClick={exportSql}>
                Download .sql
              </ButtonView>
            )}
          </div>
        ) : undefined
      }
      footerRight={
        <div className="flex items-center gap-1.5">
          {/* The accent, not a grey secondary: Compare is the action this
              screen exists for, and the two AI buttons beside it are already
              coloured. A grey primary between two tinted ones reads as
              disabled. */}
          <ButtonView size="sm" variant="primary" accentColor={ACCENT}
                      disabled={!canCompare} onClick={handleCompare}>
            Compare
          </ButtonView>
          <AIButtonView
            label={busy === 'analyse' ? 'Analysing…' : 'Analyse anomalies'}
            size="sm"
            accentColor={ACCENT}
            disabled={!comparison || busy !== null}
            onClick={handleAnalyse}
          />
          <AIButtonView
            label={busy === 'migrate' ? 'Generating…' : 'Generate migration'}
            size="sm"
            accentColor="var(--color-success)"
            disabled={!comparison || busy !== null}
            onClick={handleMigration}
          />
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* ── The two schemas ─────────────────────────────────────────────── */}
        <div className="flex gap-2">
          {([['Source', sourceEnv, setSourceEnv], ['Target', targetEnv, setTargetEnv]] as const).map(
            ([label, value, set]) => (
              <div key={label} className="flex-1 min-w-0">
                <label className="text-[10px] font-semibold block mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  {label}
                </label>
                <SelectInputView
                  value={value}
                  onChange={v => set(String(v))}
                  width="fw"
                  size="sm"
                  accentColor={ACCENT}
                  options={envs.map(e => ({ value: e.id, label: e.label }))}
                />
              </div>
            ),
          )}
        </div>

        {envs.length === 1 && (
          <p className="text-[10px] m-0" style={{ color: 'var(--color-text-muted)' }}>
            No MCP connections saved yet — paste the two schemas below. Any MCP request you save
            appears here as an environment.
          </p>
        )}

        {/* Tall enough to hold a real table definition without scrolling.
            At 150px a five-column CREATE TABLE was already cut off, which made
            the one thing you are here to read the thing you had to scroll. */}
        <div className="flex gap-2" style={{ height: 230 }}>
          <div className="flex-1 min-w-0 flex flex-col">
            <label className="text-[10px] mb-1" style={{ color: 'var(--color-text-muted)' }}>Source DDL</label>
            <div className="flex-1 min-h-0">
              <EditorView value={sourceDdl} onChange={setSourceDdl} language="sql" height="100%" bordered
                          placeholder="CREATE TABLE ... — paste the source schema" />
            </div>
          </div>
          <div className="flex-1 min-w-0 flex flex-col">
            <label className="text-[10px] mb-1" style={{ color: 'var(--color-text-muted)' }}>Target DDL</label>
            <div className="flex-1 min-h-0">
              <EditorView value={targetDdl} onChange={setTargetDdl} language="sql" height="100%" bordered
                          placeholder="CREATE TABLE ... — paste the target schema" />
            </div>
          </div>
        </div>

        {error && (
          <p style={{
            fontSize: 11, padding: '6px 10px', borderRadius: 6, margin: 0,
            background: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
            color: 'var(--color-error)',
          }}>{error}</p>
        )}

        {/* ── The result ──────────────────────────────────────────────────── */}
        {comparison && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              {summary}
            </div>

            <div className="flex items-center gap-2">
              <TabView tabs={tabs} activeTab={view} onChange={id => setView(id as ViewMode)}
                       variant="underline" size="sm" accentColor={ACCENT} />
              <span className="flex-1" />
              {view === 'report' && (
                <>
                  <ButtonView size="sm" variant="ghost" iconLeft={<LayersIcon size={12} />}
                              onClick={() => setShowInSync(v => !v)}>
                    {showInSync ? 'Hide in-sync' : 'Show in-sync'}
                  </ButtonView>
                  <IconButtonView
                    icon={<ExpandAllIcon size={13} />} size="sm" tooltip="Expand every definition"
                    onClick={() => setOpenKeys(new Set(visible.map(a => a.key)))}
                  />
                  <IconButtonView
                    icon={<CollapseAllIcon size={13} />} size="sm" tooltip="Collapse every definition"
                    onClick={() => setOpenKeys(new Set())}
                  />
                </>
              )}
            </div>

            {view === 'report' && (
              <div className="flex flex-col gap-1.5" style={{ maxHeight: 460, overflowY: 'auto' }}>
                {visible.length === 0 ? (
                  <p className="text-[12px] m-0 py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                    The two schemas match.
                  </p>
                ) : visible.map(a => (
                  <AnomalyCard key={a.key} anomaly={a} open={openKeys.has(a.key)} onToggle={() => toggle(a.key)} />
                ))}
              </div>
            )}

            {view === 'graph' && (
              <SchemaGraphView
                anomalies={comparison.anomalies}
                selectedKey={[...openKeys][0]}
                onSelect={(a: SchemaAnomaly) => { setOpenKeys(new Set([a.key])); setView('report'); }}
                height={360}
              />
            )}

            {view === 'migration' && (
              migration ? (
                <div className="flex flex-col gap-2">
                  {(['deploy', 'verify', 'revert'] as const).map(k => (
                    <CodeBlockView
                      key={k}
                      code={migration[k] || '-- nothing generated for this step'}
                      language="sql"
                      title={`${k}.sql`}
                      showCopyButton
                      maxHeight="150px"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-[12px] m-0 py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                  {busy === 'migrate' ? 'Generating the migration…' : 'Use “Generate migration” to write deploy, verify and revert scripts.'}
                </p>
              )
            )}

            {analysis && view === 'report' && (
              <div>
                <label className="text-[10px] font-semibold block mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Analysis
                </label>
                <EditorView value={analysis} language="markdown" height="200px" readOnly wordWrap bordered />
              </div>
            )}
          </>
        )}
      </div>
    </ModalView>
  );
}
