/**
 * HeapExplainView — the only screen in the Doctor tab that talks to a model.
 *
 * Two rules shape it. The evidence is shown *before* it can be sent, in full,
 * because anyone running this against a production dump is entitled to see
 * exactly what leaves their machine. And nothing is sent until the user asks —
 * there is no analyse-on-load.
 *
 * The model receives numbers, class names and string *shapes*. Contents were
 * withheld in the worker by the redaction gate, which also refuses to build a
 * pack that contains anything credential-shaped.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';
import { AIButtonView, CopyButtonView } from '@salilvnair/dui';
import { LockIcon, ChevronRightIcon } from '../../icons';
import { heapQuery, bytes } from './heap-query';

const ACCENT = 'var(--color-doctor)';

interface Evidence {
  pack: {
    totals: { liveBytes: number; objects: number };
    suspects: { className: string; retainedPercent: number }[];
    strings: {
      scanned: number; population: number; coverage: number;
      secrets: { kind: string; note: string; matches: number }[];
      duplicates: { shape: string; length: number; count: number; wastedBytes: number }[];
    };
    anomalies: string[];
  };
  systemPrompt: string;
  userMessage: string;
}

export function HeapExplainView() {
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [loadError, setLoadError] = useState('');
  const [showPayload, setShowPayload] = useState(false);
  const [answer, setAnswer] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [aiError, setAiError] = useState('');
  const acc = useRef('');

  useEffect(() => {
    let live = true;
    heapQuery<Evidence>({ type: 'evidence' })
      .then(e => { if (live) { setEvidence(e); setLoadError(''); } })
      .catch(e => { if (live) setLoadError(e.message); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { acc.current += msg.chunk; setAnswer(acc.current); }
      else if (msg?.type === 'aiStream:done') { setAnswer(acc.current); setStreaming(false); }
      else if (msg?.type === 'aiStream:error') { setAiError(msg.error || 'The AI request failed.'); setStreaming(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const explain = useCallback(() => {
    if (!evidence || streaming) return;
    acc.current = '';
    setAnswer(''); setAiError(''); setStreaming(true);
    postMsg({
      type: 'aiStream',
      payload: {
        systemPrompt: evidence.systemPrompt,
        userMessage: evidence.userMessage,
        templateKey: 'doctor.heap.explain',
      },
    });
  }, [evidence, streaming]);

  if (loadError) return <p className="text-[12px] text-[var(--color-error)] px-4 py-4 m-0">{loadError}</p>;
  if (!evidence) return <p className="text-[12px] text-[var(--color-text-muted)] px-4 py-4 m-0">Preparing evidence…</p>;

  const { pack, userMessage } = evidence;
  const s = pack.strings;
  const wasted = s.duplicates.reduce((t, d) => t + d.wastedBytes, 0);

  return (
    <div className="flex flex-col gap-3.5 px-4 py-4 overflow-y-auto h-full">
      {/* What stays behind */}
      <div className="rounded-lg p-3.5 flex flex-col gap-2"
           style={{ border: '1px solid color-mix(in srgb, var(--color-doctor) 34%, transparent)',
                    background: 'color-mix(in srgb, var(--color-doctor) 8%, transparent)' }}>
        <div className="flex items-center gap-2">
          <LockIcon size={14} style={{ color: ACCENT }} />
          <span className="text-[12.5px] font-medium text-[var(--color-text-primary)]">
            String contents stay on this machine
          </span>
        </div>
        <p className="text-[11.5px] text-[var(--color-text-secondary)] m-0 leading-relaxed">
          A heap dump holds every string that was in memory — tokens, passwords, customer records.
          The scan reads them here to look for credentials, then sends only shapes and counts.
          {' '}<strong>{s.scanned.toLocaleString()}</strong> of {s.population.toLocaleString()} text
          buffers were sampled ({(s.coverage * 100).toFixed(1)}%, spread evenly across the dump).
        </p>

        {s.secrets.length > 0 ? (
          <div className="flex flex-col gap-1 mt-0.5">
            <span className="text-[11px] font-medium" style={{ color: 'var(--color-warning)' }}>
              Credential-shaped values found in memory
            </span>
            {s.secrets.map(sec => (
              <span key={sec.kind} className="text-[11.5px] text-[var(--color-text-secondary)]">
                · <strong>{sec.kind}</strong> — {sec.matches.toLocaleString()} sampled values · {sec.note}
              </span>
            ))}
            <span className="text-[11px] text-[var(--color-text-muted)]">
              Counts only. The values were not read out of the worker process.
            </span>
          </div>
        ) : (
          <span className="text-[11.5px] text-[var(--color-text-muted)]">
            No credential-shaped values in the sample.
          </span>
        )}

        {wasted > 0 && (
          <span className="text-[11.5px] text-[var(--color-text-secondary)]">
            Duplicate content: about {bytes(wasted)} wasted across the sample, the largest being{' '}
            {s.duplicates[0].count.toLocaleString()} copies of a {s.duplicates[0].length}-character value
            shaped <span className="font-mono">{s.duplicates[0].shape}</span>.
          </span>
        )}
      </div>

      {/* Exactly what will be sent */}
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-surface-border)' }}>
        <button
          type="button"
          onClick={() => setShowPayload(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer text-left"
          style={{ background: 'var(--color-surface)', border: 'none' }}
        >
          <ChevronRightIcon size={12} style={{ color: 'var(--color-text-muted)', transform: showPayload ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }} />
          <span className="text-[12px] text-[var(--color-text-primary)]">View what will be sent</span>
          <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
            {(userMessage.length / 1024).toFixed(1)} KB · ~{Math.round(userMessage.length / 4).toLocaleString()} tokens
          </span>
          <div className="flex-1" />
          {showPayload && <CopyButtonView text={userMessage} title="Copy payload" accentColor={ACCENT} />}
        </button>
        {showPayload && (
          <pre className="m-0 px-3 py-2 text-[10.5px] font-mono overflow-auto"
               style={{ maxHeight: 300, background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>
            {userMessage}
          </pre>
        )}
      </div>

      {/* Action */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <AIButtonView
          label={streaming ? 'Analyzing…' : answer ? 'Regenerate' : 'Explain this heap'}
          size="md" accentColor={ACCENT} loading={streaming} disabled={streaming}
          onClick={explain}
        />
        {/* The same evidence, but the model may ask for more.
            Explain answers from the pack alone; Investigate lets it open a
            suspect and see what is inside — which is the difference between
            "a HashMap holds 62%" and naming what is in the HashMap. */}
        <AIButtonView
          label={streaming ? 'Investigating…' : 'Investigate'}
          size="md" accentColor={ACCENT} loading={streaming} disabled={streaming}
          onClick={() => postMsg({ type: 'dk8s:heapInvestigate' })}
        />
        {answer && !streaming && <CopyButtonView text={answer} title="Copy analysis" accentColor={ACCENT} />}
        <span className="text-[11px] text-[var(--color-text-muted)]">
          Nothing is sent until you press this.
        </span>
      </div>

      {aiError && (
        <p className="text-[11.5px] m-0 px-3 py-2 rounded-md"
           style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}>
          {aiError}
        </p>
      )}

      {answer && (
        <div className="rounded-lg p-3.5"
             style={{ border: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }}>
          <MdViewer content={answer} />
        </div>
      )}

      {!answer && !streaming && (
        <p className="text-[11.5px] text-[var(--color-text-muted)] m-0 leading-relaxed max-w-[620px]">
          The analyzer already found the leak — {pack.suspects[0]?.className ?? 'no clear suspect'}
          {pack.suspects[0] && ` at ${pack.suspects[0].retainedPercent.toFixed(1)}% of the live heap`}.
          The model is asked to explain why it is still reachable and what to check in the code, using
          only these numbers. It is not asked to find anything.
        </p>
      )}
    </div>
  );
}
