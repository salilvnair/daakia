/**
 * AiGrpcProtoExplainerModal — AI explains every service, RPC method, and message
 * type in the loaded proto file / reflection schema in plain English.
 *
 * Task 8.17 — gRPC Proto Explainer ✦
 * Gate: grpcProtoExplainer feature flag
 */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTabsStore } from '../../store/tabs-store';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { CloseIcon, SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-grpc)';

const SYSTEM_PROMPT = `You are a gRPC and Protocol Buffers expert. Given a gRPC service definition (from reflection or a proto file), explain it in plain English for a developer who is new to this service.

Structure your response as:
1. **Overview** — what this service does in 1-2 sentences
2. **Services & Methods** — for each service, list every RPC method with:
   - Method type (Unary / Server streaming / Client streaming / Bidirectional)
   - What it does in one sentence
   - Key request and response fields
3. **Message Types** — explain the most important protobuf message types and their fields
4. **Streaming Patterns** — if any streaming RPCs exist, explain when to use each
5. **Quick Start** — show a simple example invocation for the most common method

Keep explanations concise, practical, and developer-friendly.`;

export function AiGrpcProtoExplainerModal({ onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const getTemplate = useAiPromptTemplatesStore(s => s.getTemplate);
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');

  const hasProto = !!(activeTab?.grpcServices?.length || activeTab?.grpcProtoFile);

  useEffect(() => {
    if (hasProto) startExplain();
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') {
        streamRef.current += msg.chunk;
        setExplanation(streamRef.current);
      } else if (msg?.type === 'aiStream:done') {
        setLoading(false);
      } else if (msg?.type === 'aiStream:error') {
        setError(msg.error || 'AI request failed');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const startExplain = () => {
    if (!activeTab || loading) return;
    let protoContext = '';
    if (activeTab.grpcServices?.length) {
      protoContext = JSON.stringify(activeTab.grpcServices, null, 2).slice(0, 4000);
    } else if (activeTab.grpcProtoFile) {
      protoContext = `Proto file: ${activeTab.grpcProtoFile}`;
    }
    if (!protoContext) return;

    const template = getTemplate('grpc.schema.view');
    streamRef.current = '';
    setExplanation('');
    setError('');
    setLoading(true);
    postMsg({
      type: 'aiChat',
      tabId: activeTab.id,
      messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\nService definition:\n${protoContext}` }],
      systemPrompt: template || SYSTEM_PROMPT,
      stream: true,
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div
        className="relative flex flex-col rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--color-panel)',
          borderColor: `color-mix(in srgb, ${ACCENT} 30%, var(--color-surface-border))`,
          width: 620,
          maxHeight: '82vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0"
          style={{ borderColor: 'var(--color-surface-border)' }}
        >
          <div className="flex items-center gap-2">
            <SparkleIcon size={14} style={{ color: ACCENT }} />
            <span className="text-[13px] font-semibold" style={{ color: ACCENT }}>Proto Explainer ✦</span>
          </div>
          <div className="flex items-center gap-2">
            {!loading && explanation && (
              <button
                type="button"
                onClick={startExplain}
                className="text-[11px] px-3 py-1 rounded-md cursor-pointer transition-all"
                style={{ color: ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 10%, transparent)` }}
              >
                Refresh
              </button>
            )}
            <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-[var(--color-hover)] cursor-pointer transition-colors" style={{ color: 'var(--color-text-muted)' }}>
              <CloseIcon size={13} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-5 min-h-0">
          {!hasProto && !loading && !explanation && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <SparkleIcon size={24} style={{ color: ACCENT, opacity: 0.4 }} />
              <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                No proto/service definition loaded. Connect to a gRPC server with reflection enabled, or upload a .proto file.
              </p>
            </div>
          )}

          {error && (
            <p className="text-[11px] px-3 py-2 rounded-lg mb-4" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>
              {error}
            </p>
          )}

          {loading && !explanation && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <SparkleIcon size={20} style={{ color: ACCENT }} className="animate-pulse" />
              <p className="text-[11px] animate-pulse" style={{ color: ACCENT }}>Analyzing proto definition…</p>
            </div>
          )}

          {explanation && <MdViewer content={explanation} />}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0"
          style={{ borderColor: 'var(--color-surface-border)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[12px] font-medium cursor-pointer transition-all hover:bg-[var(--color-hover)]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
