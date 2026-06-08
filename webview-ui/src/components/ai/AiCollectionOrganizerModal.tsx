/**
 * AiCollectionOrganizerModal — AI-powered collection folder structure suggester (4.3.9)
 *
 * Analyzes URL patterns in a flat collection and suggests logical folder groupings.
 * The user reviews the proposed structure and clicks "Apply" to reorganize the collection.
 *
 * Accessible from the collection context menu: "Organize with AI"
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { CloseIcon, SparkleIcon, FolderIcon, DocumentIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';
import type { CollectionTreeNode, CollectionRequest } from '../../services/collections';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrganizerFolder {
  name: string;
  requestIds: string[];
}

interface OrganizerResult {
  folders: OrganizerFolder[];
  uncategorized: string[];
}

interface Props {
  collectionNode: CollectionTreeNode;
  protocol: string;
  onClose: () => void;
  onApplied: () => void;
}

const ACCENT = 'var(--color-warning)';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flattenRequests(node: CollectionTreeNode): CollectionRequest[] {
  const reqs: CollectionRequest[] = [...node.requests];
  for (const child of node.children) reqs.push(...flattenRequests(child));
  return reqs;
}

function parseResult(raw: string): OrganizerResult | null {
  const stripped = raw
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();
  try {
    const parsed = JSON.parse(stripped) as OrganizerResult;
    if (!parsed.folders || !Array.isArray(parsed.folders)) return null;
    return {
      folders: parsed.folders.filter(f => f.name && Array.isArray(f.requestIds)),
      uncategorized: Array.isArray(parsed.uncategorized) ? parsed.uncategorized : [],
    };
  } catch {
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

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

  // ── Auto-start analysis on mount ─────────────────────────────────────────
  useEffect(() => {
    handleAnalyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Listen for AI stream ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;

      if (msg.type === 'ai:chunk') {
        const delta = (msg.delta as string) || (msg.text as string) || '';
        accumulatedRef.current += delta;
      }
      if (msg.type === 'ai:complete') {
        const msgPayload = msg.message as Record<string, unknown> | undefined;
        const content = accumulatedRef.current || (msgPayload?.content as string) || '';
        const parsed = parseResult(content);
        if (parsed) {
          setResult(parsed);
        } else {
          setError('AI returned an unexpected format. Try re-analyzing.');
        }
        setLoading(false);
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'Analysis failed. Check your AI provider settings.');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── Trigger analysis ──────────────────────────────────────────────────────
  const handleAnalyze = useCallback(() => {
    if (requests.length === 0) {
      setError('This collection has no requests to organize.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setApplied(false);
    accumulatedRef.current = '';

    const pid = `ai-organize-${Date.now()}`;
    reqIdRef.current = pid;

    const reqLines = requests
      .slice(0, 60)
      .map(r => `${r.id} | ${r.method} | ${r.name} | ${r.url}`)
      .join('\n');

    const systemPrompt = resolve('rest.collection.organize.system');
    const userPrompt = resolve('rest.collection.organize', {
      collectionName: collectionNode.name,
      requests: reqLines,
    });

    postMsg({
      type: 'ai:send',
      tabId: pid,
      provider: '', model: '', baseUrl: '',
      stage: 'rest.collection.organize',
      systemPrompts: [systemPrompt],
      userPrompt,
      conversation: [],
      tools: [],
      settings: { temperature: 0.1, maxTokens: 1024, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  }, [collectionNode, requests, resolve]);

  // ── Request lookup map ────────────────────────────────────────────────────
  const reqMap = useCallback((id: string): CollectionRequest | undefined => {
    return requests.find(r => r.id === id);
  }, [requests]);

  // ── Apply the structure ───────────────────────────────────────────────────
  const handleApply = useCallback(async () => {
    if (!result) return;
    setApplying(true);

    // Create each folder and move requests
    for (const folder of result.folders) {
      const folderId = crypto.randomUUID();
      // Create the folder under the collection
      postMsg({
        type: 'createFolder',
        id: folderId,
        name: folder.name,
        parentId: collectionNode.id,
        protocol,
      });

      // Small delay to let the folder be created before moving requests
      await new Promise(r => setTimeout(r, 80));

      // Move each request into the new folder
      for (const reqId of folder.requestIds) {
        postMsg({ type: 'moveRequest', requestId: reqId, collectionId: folderId });
        await new Promise(r => setTimeout(r, 20));
      }
    }

    setApplying(false);
    setApplied(true);

    // Refresh collections tree after a short delay
    setTimeout(() => {
      postMsg({ type: 'getCollections', protocol });
      onApplied();
    }, 300);
  }, [result, collectionNode, protocol, onApplied]);

  // ── Count requests covered ────────────────────────────────────────────────
  const coveredIds = result
    ? new Set([...result.folders.flatMap(f => f.requestIds), ...result.uncategorized])
    : new Set<string>();
  const totalCovered = coveredIds.size;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="w-[560px] max-h-[82vh] flex flex-col rounded-xl border shadow-2xl"
        style={{
          backgroundColor: 'var(--color-surface-bg)',
          borderColor: 'var(--color-surface-border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--color-surface-border)' }}
        >
          <SparkleIcon size={16} style={{ color: ACCENT, flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Organize Collection with AI</p>
            <p className="text-[11px] text-[var(--color-text-muted)] truncate">{collectionNode.name} · {requests.length} requests</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer transition-opacity"
          >
            <CloseIcon size={12} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]">
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
          {error && !loading && (
            <div className="text-[12px] text-[var(--color-error)] py-2">{error}</div>
          )}

          {/* Applied */}
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
                  <FolderPreviewCard
                    key={i}
                    folder={folder}
                    reqMap={reqMap}
                  />
                ))}
                {result.uncategorized.length > 0 && (
                  <div
                    className="rounded-lg border px-3 py-2.5"
                    style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'rgba(255,255,255,0.02)' }}
                  >
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
                          <span key={id} className="text-[10px] text-[var(--color-text-muted)] font-mono">
                            {req.method} {req.name || req.url}
                          </span>
                        ) : null;
                      })}
                      {result.uncategorized.length > 5 && (
                        <span className="text-[10px] text-[var(--color-text-muted)] italic">
                          +{result.uncategorized.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3 border-t flex-shrink-0"
          style={{ borderColor: 'var(--color-surface-border)' }}
        >
          <div>
            {result && !applied && !loading && (
              <button
                type="button"
                onClick={handleAnalyze}
                className="text-[11px] underline cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              >
                Re-analyze
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {result && !applied && (
              <button
                type="button"
                onClick={handleApply}
                disabled={applying}
                className="h-[30px] px-4 rounded-md text-[12px] font-medium text-white cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: ACCENT }}
              >
                {applying ? 'Applying…' : 'Apply Structure'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="h-[30px] px-4 rounded-md text-[12px] font-medium cursor-pointer transition-colors bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              {applied ? 'Done' : 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ─── Single folder preview card ───────────────────────────────────────────────

function FolderPreviewCard({
  folder,
  reqMap,
}: {
  folder: OrganizerFolder;
  reqMap: (id: string) => CollectionRequest | undefined;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        borderColor: `color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`,
        backgroundColor: `color-mix(in srgb, ${ACCENT} 3%, var(--color-surface-bg))`,
      }}
    >
      {/* Folder header */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer"
      >
        <FolderIcon size={13} style={{ color: ACCENT }} />
        <span className="flex-1 text-[12px] font-medium text-left text-[var(--color-text-primary)]">
          {folder.name}
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
          style={{
            backgroundColor: `color-mix(in srgb, ${ACCENT} 15%, transparent)`,
            color: ACCENT,
          }}
        >
          {folder.requestIds.length}
        </span>
      </button>

      {/* Requests list */}
      {expanded && (
        <div
          className="px-3 pb-2 border-t flex flex-col gap-0.5"
          style={{ borderColor: `color-mix(in srgb, ${ACCENT} 15%, transparent)` }}
        >
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
            <span className="text-[10px] text-[var(--color-text-muted)] italic pl-4">
              +{folder.requestIds.length - 8} more requests
            </span>
          )}
        </div>
      )}
    </div>
  );
}
