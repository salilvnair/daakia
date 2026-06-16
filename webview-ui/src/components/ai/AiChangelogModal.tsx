/**
 * AiChangelogModal — generate a human-readable API changelog by comparing collection versions (4.4.10)
 *
 * The user pastes a previous version of the collection (JSON export or plain request list).
 * The current collection is automatically formatted as the "current" version.
 * AI generates a structured changelog: Breaking Changes, New Endpoints, Modified, Removed.
 */
import { useState, useEffect, useRef } from 'react';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';
import { type CollectionTreeNode } from '../../services/collections';
import { ModalView, AIButtonView, ButtonView, MultilineInputView, CopyButtonView } from '../../dui';
import { useAiCollectionCacheStore } from '../../store/ai-collection-cache-store';

interface Props {
  collectionNode: CollectionTreeNode;
  onClose: () => void;
}

const ACCENT = 'var(--color-warning)';

/** Serialize a collection node into a compact text summary for the AI */
function serializeCollection(node: CollectionTreeNode): string {
  const lines: string[] = [`Collection: ${node.name}`];
  const walk = (n: CollectionTreeNode, depth: number) => {
    const indent = '  '.repeat(depth);
    n.requests.forEach(r => {
      lines.push(`${indent}[${r.method || 'GET'}] ${r.name || '(unnamed)'} — ${r.url || ''}`);
    });
    n.children.forEach(child => {
      lines.push(`${indent}Folder: ${child.name}`);
      walk(child, depth + 1);
    });
  };
  walk(node, 0);
  return lines.join('\n');
}

export function AiChangelogModal({ collectionNode, onClose }: Props) {
  const [previousVersion, setPreviousVersion] = useState('');
  const [loading, setLoading] = useState(false);
  const [changelog, setChangelog] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');

  const accRef = useRef('');
  const reqIdRef = useRef('');
  const previousVersionRef = useRef('');
  const resolve = useAiPromptTemplatesStore(s => s.resolve);
  const cacheGet = useAiCollectionCacheStore(s => s.get);
  const cacheSet = useAiCollectionCacheStore(s => s.set);
  const cacheKey = `changelog:${collectionNode.id}`;

  const currentSummary = serializeCollection(collectionNode);

  // Cache-first: reopening this action for the same collection shows the last
  // changelog instead of an empty form — Regenerate is always explicit.
  useEffect(() => {
    const cached = cacheGet(cacheKey);
    if (!cached) return;
    const p = cached.payload as { previousVersion: string; changelog: string };
    setPreviousVersion(p.previousVersion);
    previousVersionRef.current = p.previousVersion;
    setChangelog(p.changelog);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;

      if (msg.type === 'ai:chunk') {
        const delta = (msg.delta as string) || (msg.text as string) || '';
        accRef.current += delta;
        setChangelog(accRef.current);
      }
      if (msg.type === 'ai:complete') {
        const msgPayload = msg.message as Record<string, unknown> | undefined;
        const content = accRef.current || (msgPayload?.content as string) || '';
        setChangelog(content);
        setLoading(false);
        setIsStreaming(false);
        cacheSet(cacheKey, { previousVersion: previousVersionRef.current, changelog: content });
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'Changelog generation failed.');
        setLoading(false);
        setIsStreaming(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleGenerate = () => {
    if (!previousVersion.trim()) {
      setError('Paste the previous version of this collection to compare.');
      return;
    }
    setLoading(true);
    setIsStreaming(true);
    setChangelog('');
    setError('');
    accRef.current = '';

    const pid = `ai-changelog-${Date.now()}`;
    reqIdRef.current = pid;

    const systemPrompt = resolve('rest.changelog.generate.system');
    const userPrompt = resolve('rest.changelog.generate', {
      previousCollection: previousVersion.trim().slice(0, 4000),
      currentCollection: currentSummary.slice(0, 4000),
    });

    postMsg({
      type: 'ai:send',
      tabId: pid,
      provider: '', model: '', baseUrl: '',
      stage: 'rest.changelog.generate',
      systemPrompts: [systemPrompt],
      userPrompt,
      conversation: [],
      tools: [],
      settings: {
        temperature: 0.2,
        maxTokens: 1200,
        stream: true,
        topP: 1,
        stopSequences: [],
        responseFormat: 'text',
        frequencyPenalty: 0,
        presencePenalty: 0,
        seed: null,
      },
      mcpServerConfigs: [],
    });
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="API Changelog Generator"
      subtitle={collectionNode.name}
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--color-warning) 18%, transparent)',
        }}>
          <SparkleIcon size={13} style={{ color: ACCENT }} />
        </div>
      }
      footerLeft={changelog && !loading ? (
        <CopyButtonView text={changelog} size={13} title="Copy changelog" accentColor={ACCENT} />
      ) : undefined}
      footerRight={
        changelog && !loading ? (
          <ButtonView size="md" onClick={handleGenerate}>Regenerate</ButtonView>
        ) : (
          <AIButtonView
            label={loading ? 'Comparing…' : 'Generate Changelog'}
            size="md"
            accentColor={ACCENT}
            loading={loading}
            disabled={!previousVersion.trim() || loading}
            onClick={handleGenerate}
          />
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Current version preview */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
              Current version <span style={{ fontWeight: 400, fontStyle: 'italic', color: 'var(--color-text-muted)' }}>(auto-loaded)</span>
            </label>
            <span style={{
              padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 500,
              background: 'color-mix(in srgb, var(--color-success) 12%, transparent)', color: 'var(--color-success)',
            }}>
              live
            </span>
          </div>
          <pre
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 10.5, fontFamily: 'monospace',
              maxHeight: 100, overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap',
              background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-muted)',
            }}
          >
            {currentSummary.slice(0, 800)}{currentSummary.length > 800 ? '\n...(truncated)' : ''}
          </pre>
        </div>

        {/* Previous version paste */}
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, marginBottom: 4, color: 'var(--color-text-secondary)' }}>
            Previous version <span style={{ fontWeight: 400, fontStyle: 'italic', color: 'var(--color-text-muted)' }}>(paste exported JSON, cURL list, or request names)</span>
          </label>
          <MultilineInputView
            autoFocus
            value={previousVersion}
            onChange={e => { setPreviousVersion(e.target.value); previousVersionRef.current = e.target.value; setError(''); setChangelog(''); }}
            rows={7}
            size="md"
            width="fw"
            placeholder={`Paste the old version here — any format works:\n• Exported Daakia JSON\n• List of "METHOD /path — Name" lines\n• Postman/Insomnia collection JSON\n• Just a list of endpoint names`}
            style={{ fontFamily: 'monospace', fontSize: 11 }}
          />
        </div>

        {error && <p style={{ fontSize: 11, color: 'var(--color-error)', margin: 0 }}>{error}</p>}

        {loading && !changelog && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '8px 0' }}>
            {[0, 150, 300].map(d => (
              <span key={d} className="animate-pulse" style={{
                width: 5, height: 5, borderRadius: '50%', background: ACCENT, animationDelay: `${d}ms`,
              }} />
            ))}
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 6 }}>Comparing versions…</span>
          </div>
        )}

        {changelog && (
          <div
            style={{
              borderRadius: 8, padding: 16,
              border: `1px solid color-mix(in srgb, ${ACCENT} 20%, var(--color-surface-border))`,
              background: `color-mix(in srgb, ${ACCENT} 3%, var(--color-panel))`,
            }}
          >
            <MdViewer content={changelog} />
            {isStreaming && (
              <span className="animate-pulse" style={{
                display: 'inline-block', width: 2, height: 12, marginLeft: 2, verticalAlign: 'text-bottom',
                background: ACCENT,
              }} />
            )}
          </div>
        )}
      </div>
    </ModalView>
  );
}
