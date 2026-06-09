/**
 * AiChangelogModal — generate a human-readable API changelog by comparing collection versions (4.4.10)
 *
 * The user pastes a previous version of the collection (JSON export or plain request list).
 * The current collection is automatically formatted as the "current" version.
 * AI generates a structured changelog: Breaking Changes, New Endpoints, Modified, Removed.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { CloseIcon, SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';
import { CopyButton } from '../shared';
import { type CollectionTreeNode } from '../../services/collections';

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
  const resolve = useAiPromptTemplatesStore(s => s.resolve);

  const currentSummary = serializeCollection(collectionNode);

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

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="w-[640px] max-h-[90vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">API Changelog Generator</p>
            <p className="text-[11px] text-[var(--color-text-muted)] truncate">{collectionNode.name}</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {/* Current version preview */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                Current version <span className="font-normal italic text-[var(--color-text-muted)]">(auto-loaded)</span>
              </label>
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 12%, transparent)', color: 'var(--color-success)' }}
              >
                live
              </span>
            </div>
            <pre
              className="w-full px-3 py-2 rounded-lg text-[10.5px] font-mono max-h-[100px] overflow-y-auto resize-none"
              style={{
                backgroundColor: 'var(--color-input-bg)',
                border: '1px solid var(--color-input-border)',
                color: 'var(--color-text-muted)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {currentSummary.slice(0, 800)}{currentSummary.length > 800 ? '\n...(truncated)' : ''}
            </pre>
          </div>

          {/* Previous version paste */}
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Previous version <span className="font-normal italic text-[var(--color-text-muted)]">(paste exported JSON, cURL list, or request names)</span>
            </label>
            <textarea
              autoFocus
              value={previousVersion}
              onChange={e => { setPreviousVersion(e.target.value); setError(''); setChangelog(''); }}
              rows={7}
              className="w-full px-3 py-2 rounded-lg text-[11px] font-mono resize-none outline-none"
              placeholder={`Paste the old version here — any format works:\n• Exported Daakia JSON\n• List of "METHOD /path — Name" lines\n• Postman/Insomnia collection JSON\n• Just a list of endpoint names`}
              style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
            />
          </div>

          {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

          {!changelog && !loading && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!previousVersion.trim()}
              className="h-[30px] px-4 text-[12px] font-medium rounded-md text-white cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 self-start flex items-center gap-1.5"
              style={{ backgroundColor: ACCENT }}
            >
              <SparkleIcon size={12} />
              Generate Changelog
            </button>
          )}

          {loading && !changelog && (
            <div className="flex gap-1 items-center py-2">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                  style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
              ))}
              <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Comparing versions…</span>
            </div>
          )}

          {changelog && (
            <div
              className="rounded-lg border p-4"
              style={{
                borderColor: `color-mix(in srgb, ${ACCENT} 20%, var(--color-surface-border))`,
                backgroundColor: `color-mix(in srgb, ${ACCENT} 3%, var(--color-panel))`,
              }}
            >
              <MdViewer content={changelog} />
              {isStreaming && (
                <span className="inline-block w-[2px] h-[12px] ml-0.5 animate-pulse align-text-bottom"
                  style={{ backgroundColor: ACCENT }} />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex items-center gap-3">
            {changelog && !loading && (
              <button type="button" onClick={handleGenerate}
                className="text-[11px] underline cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                Regenerate
              </button>
            )}
            {changelog && !loading && (
              <CopyButton text={changelog} size={13} title="Copy changelog" className="w-6 h-6" />
            )}
          </div>
          <button type="button" onClick={onClose}
            className="h-[30px] px-4 text-[12px] font-medium rounded-md cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
