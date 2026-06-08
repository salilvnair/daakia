/**
 * GrpcClientPanel — load .proto, browse services, send unary/streaming requests.
 * Feature 6B.10 — gRPC client
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, PlusIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';

interface ProtoService {
  name: string;
  methods: ProtoMethod[];
}

interface ProtoMethod {
  name: string;
  inputType: string;
  outputType: string;
  clientStreaming: boolean;
  serverStreaming: boolean;
}

interface GrpcHeader {
  key: string;
  value: string;
  enabled: boolean;
}

interface GrpcResponse {
  status: 'ok' | 'error' | 'streaming';
  code?: string;          // gRPC status code name
  message?: string;
  body: string;
  durationMs: number;
  streamMessages?: string[];
}

interface Props {
  onClose: () => void;
}

const EXAMPLE_PROTO = `syntax = "proto3";

package greet;

service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply);
  rpc SayHelloStream (HelloRequest) returns (stream HelloReply);
}

message HelloRequest {
  string name = 1;
}

message HelloReply {
  string message = 1;
}`;

const EXAMPLE_REQUEST = `{
  "name": "World"
}`;

export function GrpcClientPanel({ onClose }: Props) {
  const [serverUrl, setServerUrl] = useState('localhost:50051');
  const [protoContent, setProtoContent] = useState('');
  const [protoFile, setProtoFile] = useState('');
  const [services, setServices] = useState<ProtoService[]>([]);
  const [selectedService, setSelectedService] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('');
  const [requestBody, setRequestBody] = useState('{\n  \n}');
  const [headers, setHeaders] = useState<GrpcHeader[]>([{ key: 'content-type', value: 'application/grpc', enabled: true }]);
  const [response, setResponse] = useState<GrpcResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [tlsEnabled, setTlsEnabled] = useState(false);
  const [tab, setTab] = useState<'request' | 'headers' | 'proto'>('request');

  const addToast = useToastStore(s => s.addToast);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'grpc:response') {
        setSending(false);
        setResponse({
          status: msg.error ? 'error' : 'ok',
          code: msg.code as string,
          message: msg.error as string | undefined,
          body: msg.body as string || '',
          durationMs: msg.durationMs as number || 0,
        });
      }
      if (msg.type === 'grpc:stream-message') {
        setResponse(prev => prev ? {
          ...prev,
          status: 'streaming',
          streamMessages: [...(prev.streamMessages || []), msg.message as string],
        } : null);
      }
      if (msg.type === 'grpc:stream-end') {
        setSending(false);
        setResponse(prev => prev ? { ...prev, status: 'ok' } : null);
      }
      if (msg.type === 'grpc:proto-parsed') {
        const parsed = msg.services as ProtoService[];
        if (parsed?.length > 0) {
          setServices(parsed);
          setSelectedService(parsed[0].name);
          setSelectedMethod(parsed[0].methods[0]?.name || '');
          addToast({ type: 'success', message: `Parsed ${parsed.length} service(s)` });
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [addToast]);

  const parseProto = () => {
    if (!protoContent.trim()) {
      addToast({ type: 'warning', message: 'Paste or load a .proto file first' });
      return;
    }
    postMsg({ type: 'grpc:parse-proto', content: protoContent });
    // Simulate parsing for UI (real parsing happens in extension host)
    // Basic regex-based preview
    const serviceMatches = [...protoContent.matchAll(/service\s+(\w+)\s*\{([^}]*)\}/gs)];
    const parsed: ProtoService[] = serviceMatches.map(m => {
      const name = m[1];
      const body = m[2];
      const methodMatches = [...body.matchAll(/rpc\s+(\w+)\s*\((\w+)\)\s*returns\s*\((stream\s+)?(\w+)\)/g)];
      const methods: ProtoMethod[] = methodMatches.map(mm => ({
        name: mm[1],
        inputType: mm[2],
        outputType: mm[4],
        clientStreaming: false,
        serverStreaming: !!mm[3],
      }));
      return { name, methods };
    });
    if (parsed.length > 0) {
      setServices(parsed);
      setSelectedService(parsed[0].name);
      setSelectedMethod(parsed[0].methods[0]?.name || '');
    }
  };

  const loadFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProtoFile(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      const content = ev.target?.result as string;
      setProtoContent(content);
    };
    reader.readAsText(file);
  };

  const sendRequest = () => {
    if (!serverUrl.trim() || !selectedService || !selectedMethod) {
      addToast({ type: 'warning', message: 'Server URL, service, and method are required' });
      return;
    }
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(requestBody); } catch {
      addToast({ type: 'error', message: 'Request body is not valid JSON' });
      return;
    }

    setSending(true);
    setResponse({ status: 'streaming', body: '', durationMs: 0, streamMessages: [] });

    const activeHeaders = headers.filter(h => h.enabled && h.key);
    postMsg({
      type: 'grpc:send',
      serverUrl: (tlsEnabled ? 'https://' : '') + serverUrl,
      service: selectedService,
      method: selectedMethod,
      body: parsed,
      headers: Object.fromEntries(activeHeaders.map(h => [h.key, h.value])),
      tls: tlsEnabled,
    });
  };

  const currentService = services.find(s => s.name === selectedService);
  const currentMethod = currentService?.methods.find(m => m.name === selectedMethod);
  const isStreaming = currentMethod?.serverStreaming || currentMethod?.clientStreaming;

  const statusColor = response
    ? response.status === 'error' ? 'var(--color-error)'
    : response.status === 'streaming' ? 'var(--color-warning)'
    : 'var(--color-success)'
    : 'var(--color-text-muted)';

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[900px] max-h-[92vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-surface-bg)', borderColor: 'var(--color-surface-border)' }}>

        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">gRPC Client</p>
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Load .proto → browse services → send unary/streaming requests</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        {/* Server URL bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-hover)' }}>
          <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
            <input type="checkbox" checked={tlsEnabled} onChange={e => setTlsEnabled(e.target.checked)} />
            <span className="text-[10.5px] font-mono font-bold" style={{ color: tlsEnabled ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
              {tlsEnabled ? 'https://' : 'http://'}
            </span>
          </label>
          <input value={serverUrl} onChange={e => setServerUrl(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-lg text-[11.5px] font-mono outline-none"
            placeholder="localhost:50051"
            style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left sidebar — proto + service browser */}
          <div className="w-[240px] flex-shrink-0 border-r flex flex-col" style={{ borderColor: 'var(--color-surface-border)' }}>
            <div className="p-3 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>Proto Definition</p>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md cursor-pointer border flex-1 justify-center"
                  style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                  📂 {protoFile || 'Load .proto'}
                </button>
                <button type="button" onClick={() => { setProtoContent(EXAMPLE_PROTO); setTab('proto'); }}
                  className="px-2 py-1 text-[10px] rounded-md cursor-pointer border"
                  style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-info)' }}>
                  Example
                </button>
              </div>
              <input ref={fileRef} type="file" accept=".proto" className="hidden" onChange={loadFromFile} />
              {protoContent && (
                <button type="button" onClick={parseProto}
                  className="w-full mt-1.5 py-1 text-[10.5px] font-medium rounded-md cursor-pointer text-white"
                  style={{ backgroundColor: 'var(--color-info)' }}>
                  Parse Proto
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
              {services.length === 0 && (
                <div className="p-3 text-center">
                  <p className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>No services. Load a .proto and click Parse.</p>
                </div>
              )}
              {services.map(svc => (
                <div key={svc.name}>
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: 'var(--color-text-muted)', backgroundColor: 'var(--color-surface-hover)' }}>
                    {svc.name}
                  </div>
                  {svc.methods.map(method => (
                    <button key={method.name} type="button"
                      onClick={() => { setSelectedService(svc.name); setSelectedMethod(method.name); setRequestBody(EXAMPLE_REQUEST); }}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 border-b cursor-pointer"
                      style={{
                        borderColor: 'var(--color-surface-border)',
                        backgroundColor: selectedService === svc.name && selectedMethod === method.name
                          ? 'color-mix(in srgb, var(--color-info) 12%, transparent)' : 'transparent',
                      }}>
                      <span className="text-[8.5px] font-bold px-1 py-0.5 rounded flex-shrink-0"
                        style={{
                          backgroundColor: method.serverStreaming ? 'color-mix(in srgb, var(--color-warning) 20%, transparent)' : 'color-mix(in srgb, var(--color-success) 20%, transparent)',
                          color: method.serverStreaming ? 'var(--color-warning)' : 'var(--color-success)',
                        }}>
                        {method.serverStreaming ? 'STREAM' : 'UNARY'}
                      </span>
                      <span className="text-[11px] truncate" style={{ color: 'var(--color-text-primary)' }}>{method.name}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Right panel */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Tab bar */}
            <div className="flex border-b flex-shrink-0 px-3" style={{ borderColor: 'var(--color-surface-border)' }}>
              {(['request', 'headers', 'proto'] as const).map(t => (
                <button key={t} type="button" onClick={() => setTab(t)}
                  className="px-3 py-2 text-[11px] capitalize cursor-pointer border-b-2 transition-colors"
                  style={{
                    borderBottomColor: tab === t ? 'var(--color-info)' : 'transparent',
                    color: tab === t ? 'var(--color-info)' : 'var(--color-text-muted)',
                  }}>
                  {t}
                </button>
              ))}
              <div className="flex-1" />
              <button type="button" onClick={sendRequest} disabled={sending}
                className="my-1.5 px-4 text-[11px] font-semibold rounded-md cursor-pointer text-white disabled:opacity-50"
                style={{ backgroundColor: sending ? 'var(--color-surface-border)' : 'var(--color-info)' }}>
                {sending ? (isStreaming ? '◼ Streaming…' : '⏳ Sending…') : (isStreaming ? '▶ Start Stream' : '▶ Send')}
              </button>
            </div>

            {/* Tab content + response split */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-hidden">
                {tab === 'request' && (
                  <textarea value={requestBody} onChange={e => setRequestBody(e.target.value)}
                    className="w-full h-full p-4 text-[11px] font-mono resize-none outline-none"
                    style={{ backgroundColor: 'var(--color-panel)', color: 'var(--color-text-primary)' }} />
                )}

                {tab === 'headers' && (
                  <div className="p-4 flex flex-col gap-2 overflow-y-auto h-full">
                    {headers.map((h, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input type="checkbox" checked={h.enabled} onChange={e => setHeaders(prev => prev.map((hh, j) => j === i ? { ...hh, enabled: e.target.checked } : hh))} />
                        <input value={h.key} onChange={e => setHeaders(prev => prev.map((hh, j) => j === i ? { ...hh, key: e.target.value } : hh))}
                          className="flex-1 px-2 py-1 rounded text-[10.5px] outline-none font-mono"
                          placeholder="key"
                          style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
                        <input value={h.value} onChange={e => setHeaders(prev => prev.map((hh, j) => j === i ? { ...hh, value: e.target.value } : hh))}
                          className="flex-1 px-2 py-1 rounded text-[10.5px] outline-none"
                          placeholder="value"
                          style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
                        <button type="button" onClick={() => setHeaders(prev => prev.filter((_, j) => j !== i))}
                          className="text-[10px] opacity-50 hover:opacity-100 cursor-pointer px-1" style={{ color: 'var(--color-error)' }}>✕</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setHeaders(prev => [...prev, { key: '', value: '', enabled: true }])}
                      className="flex items-center gap-1 text-[10.5px] cursor-pointer w-fit"
                      style={{ color: 'var(--color-info)' }}>
                      <PlusIcon size={10} />Add Header
                    </button>
                  </div>
                )}

                {tab === 'proto' && (
                  <textarea value={protoContent} onChange={e => setProtoContent(e.target.value)}
                    className="w-full h-full p-4 text-[11px] font-mono resize-none outline-none"
                    placeholder={EXAMPLE_PROTO}
                    style={{ backgroundColor: 'var(--color-panel)', color: 'var(--color-text-primary)' }} />
                )}
              </div>

              {/* Response */}
              <div className="h-[220px] flex-shrink-0 border-t flex flex-col" style={{ borderColor: 'var(--color-surface-border)' }}>
                <div className="flex items-center gap-2.5 px-3 py-1.5 flex-shrink-0"
                  style={{ backgroundColor: 'var(--color-surface-hover)', borderBottom: '1px solid var(--color-surface-border)' }}>
                  <span className="text-[10.5px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Response</span>
                  {response && (
                    <>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)', color: statusColor }}>
                        {response.status === 'streaming' ? 'STREAMING' : (response.code || (response.status === 'ok' ? 'OK' : 'ERROR'))}
                      </span>
                      {response.durationMs > 0 && (
                        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{response.durationMs}ms</span>
                      )}
                      {response.streamMessages && response.streamMessages.length > 0 && (
                        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{response.streamMessages.length} messages</span>
                      )}
                    </>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-3 font-mono text-[10.5px]" style={{ color: 'var(--color-text-primary)' }}>
                  {!response && <p style={{ color: 'var(--color-text-muted)' }}>Send a request to see the response</p>}
                  {response?.status === 'error' && (
                    <p style={{ color: 'var(--color-error)' }}>{response.message || 'Unknown error'}</p>
                  )}
                  {response?.status === 'streaming' && response.streamMessages?.map((msg, i) => (
                    <div key={i} className="mb-1">
                      <span className="text-[9px] mr-1.5" style={{ color: 'var(--color-text-muted)' }}>#{i + 1}</span>
                      <span>{msg}</span>
                    </div>
                  ))}
                  {(response?.status === 'ok' || response?.status === 'streaming') && response.body && (
                    <pre className="whitespace-pre-wrap">{response.body}</pre>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
