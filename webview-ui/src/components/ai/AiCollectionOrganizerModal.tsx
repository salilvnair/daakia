/**
 * AiCollectionOrganizerModal — AI-powered collection folder structure suggester (4.3.9)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { SparkleIcon, FolderIcon, DocumentIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';
import type { CollectionTreeNode, CollectionRequest } from '../../services/collections';
import { ModalView, ButtonView } from '../../dui';

interface OrganizerFolder { name: string; requestIds: string[]; }
interface OrganizerResult { folders: OrganizerFolder[]; uncategorized: string[]; }

interface Props {
  collectionNode: CollectionTreeNode;
  protocol: string;
  onClose: () => void;
  onApplied: () => void;
}

const ACCENT = 'var(--color-warning)';

function flattenRequests(node: CollectionTreeNode): CollectionRequest[] {
  const reqs: CollectionRequest[] = [...node.requests];
  for (const child of node.children) reqs.push(...flattenRequests(child));
  return reqs;
}

function parseResult(raw: string): OrganizerResult | null {
  const stripped = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
  try {
    const parsed = JSON.parse(stripped) as OrganizerResult;
    if (!parsed.folders || !Array.isArray(parsed.folders)) return null;
    return { folders: parsed.folders.filter(f => f.name && Array.isArray(f.requestIds)), uncategorized: Array.isArray(parsed.uncategorized) ? parsed.uncategorized : [] };
  } catch { return null; }
}

export function AiCollectionOrganizerModal({ collectionNode, protocol, onClose, onApplied }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OrganizerResult | null>(null);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const accumulatedRef = useRef('');
  const reqIdRef = useRef('');
  const resolve = useAiPromptTemplatesStore(s => s.resolve);
  const requests = flattenRequests(collectionNode);

  useEffect(() => { handleAnalyze(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;
      if (msg.type === 'ai:chunk') { accumulatedRef.current += (msg.delta as string) || (msg.text as string) || ''; }
      if (msg.type === 'ai:complete') {
        const content = accumulatedRef.current || ((msg.message as Record<string, unknown>)?.content as string) || '';
        const parsed = parseResult(content);
        if (parsed) setResult(parsed); else setError('AI returned an unexpected format. Try re-analyzing.');
        setLoading(false);
      }
      if (msg.type === 'ai:error') { setError((msg.message as string) || 'Analysis failed.'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleAnalyze = useCallback(() => {
    if (requests.length === 0) { setError('This collection has no requests to organize.'); return; }
    setLoading(true); setError(''); setResult(null); setApplied(false); accumulatedRef.current = '';
    const pid = `ai-organize-${Date.now()}`;
    reqIdRef.current = pid;
    const reqLines = requests.slice(0, 60).map(r => `${r.id} | ${r.method} | ${r.name} | ${r.url}`).join('\n');
    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'rest.collection.organize',
      systemPrompts: [resolve('rest.collection.organize.system')],
      userPrompt: resolve('rest.collection.organize', { collectionName: collectionNode.name, requests: reqLines }),
      conversation: [], tools: [],
      settings: { temperature: 0.1, maxTokens: 1024, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  }, [collectionNode, requests, resolve]);

  const reqMap = useCallback((id: string) => requests.find(r => r.id === id), [requests]);

  const handleApply = useCallback(async () => {
    if (!result) return;
    setApplying(true);
    for (const folder of result.folders) {
      const folderId = crypto.randomUUID();
      postMsg({ type: 'createFolder', id: folderId, name: folder.name, parentId: collectionNode.id, protocol });
      await new Promise(r => setTimeout(r, 80));
      for (const reqId of folder.requestIds) {
        postMsg({ type: 'moveRequest', requestId: reqId, collectionId: folderId });
        await new Promise(r => setTimeout(r, 20));
      }
    }
    setApplying(false);
    setApplied(true);
    setTimeout(() => { postMsg({ type: 'getCollections', protocol }); onApplied(); }, 300);
  }, [result, collectionNode, protocol, onApplied]);

  const coveredIds = result ? new Set([...result.folders.flatMap(f => f.requestIds), ...result.uncategorized]) : new Set<string>();
  const totalCovered = coveredIds.size;

  const footerLeft = result && !applied && !loading ? (
    <button type="button" onClick={handleAnalyze}
      className="text-[11px] underline cursor-pointer transition-colors"
      style={{ color: 'var(--color-text-muted)' }}>
      Re-analyze
    </button>
  ) : undefined;

  const footerRight = result && !applied ? (
    <ButtonView size="sm" accentColor={ACCENT} variant="primary" disabled={applying} onClick={handleApply}>
      {applying ? 'Applying…' : 'Apply Structure'}
    </ButtonView>
  ) : undefined;

  return (
    <ModalView
      open
      onClose={onClose}
      title="Organize Collection with AI"
      subtitle={`${collectionNode.name} · ${requests.length} requests`}
      size="md"
      elevated
      headerColor={ACCENT}
      headerIcon={<SparkleIcon size={16} style={{ color: ACCENT }} />}
      footerLeft={footerLeft}
      footerRight={footerRight}
    >
      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center gap-3 py-10">
          <div className="flex gap-1">
            {[0, 150, 300].map(d => (
              <span key={d} className="w-[6px] h-[6px] rounded-full animate-pulse"
                style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
            ))}
          </div>
          <p className="text-[12px] text-[var(--color-text-muted)]">Analyzing URL patterns…</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && <div className="text-[12px] py-2" style={{ color: 'var(--color-error)' }}>{error}</div>}

      {/* Applied success */}
      {applied && (
        <div className="flex items-center gap-2 text-[12px] py-4" style={{ color: 'var(--color-success)' }}>
          <CheckIcon size={14} />
          <span>Collection reorganized! Folders created and requests moved.</span>
        </div>
      )}

      {/* Result preview */}
      {result && !applied && (
        <>
          <p className="text-[11px] text-[var(--color-text-muted)] mb-3">
            AI suggests <strong style={{ color: ACCENT }}>{result.folders.length} folder{result.folders.length !== 1 ? 's' : ''}</strong> for {totalCovered} requests.
            {' '}Review the structure below, then click Apply.
          </p>
          <div className="flex flex-col gap-2">
            {result.folders.map((folder, i) => (
              <FolderPreviewCard key={i} folder={folder} reqMap={reqMap} />
            ))}
            {result.uncategorized.length > 0 && (
              <div className="rounded-lg border px-3 py-2.5"
                style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <FolderIcon size={13} style={{ color: 'var(--color-text-muted)' }} />
                  <span className="text-[12px] font-medium text-[var(--color-text-muted)] italic">Uncategorized</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-surface-border)] text-[var(--color-text-muted)]">
                    {result.uncategorized.length}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {result.uncategorized.slice(0, 5).map(id => {
                    const req = reqMap(id);
                    return req ? (
                      <span key={id} className="text-[10px] text-[var(--color-text-muted)] font-mono">{req.method} {req.name || req.url}</span>
                    ) : null;
                  })}
                  {result.uncategorized.length > 5 && (
                    <span className="text-[10px] text-[var(--color-text-muted)] italic">+{result.uncategorized.length - 5} more</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </ModalView>
  );
}

function FolderPreviewCard({ folder, reqMap }: { folder: OrganizerFolder; reqMap: (id: string) => CollectionRequest | undefined }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="rounded-lg border overflow-hidden"
      style={{ borderColor: `color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`, backgroundColor: `color-mix(in srgb, ${ACCENT} 3%, var(--color-panel))` }}>
      <button type="button" onClick={() => setExpanded(e => !e)} className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer">
        <FolderIcon size={13} style={{ color: ACCENT }} />
        <span className="flex-1 text-[12px] font-medium text-left text-[var(--color-text-primary)]">{folder.name}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 15%, transparent)`, color: ACCENT }}>
          {folder.requestIds.length}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 border-t flex flex-col gap-0.5"
          style={{ borderColor: `color-mix(in srgb, ${ACCENT} 15%, transparent)` }}>
          {folder.requestIds.slice(0, 8).map(id => {
            const req = reqMap(id);
            return req ? (
              <div key={id} className="flex items-center gap-1.5 py-0.5">
                <DocumentIcon size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                <span className="text-[10px] font-mono text-[var(--color-text-muted)]">{req.method}</span>
                <span className="text-[10px] text-[var(--color-text-secondary)] truncate">{req.name || req.url}</span>
              </div>
            ) : null;
          })}
          {folder.requestIds.length > 8 && (
            <span className="text-[10px] text-[var(--color-text-muted)] italic pl-4">+{folder.requestIds.length - 8} more requests</span>
          )}
        </div>
      )}
    </div>
  );
}
