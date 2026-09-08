/**
 * Anything → Daakia.
 *
 * ── What changed, and why ──
 *
 * This was the Postman translator: one source tool, named in the title, with
 * its mapping table written into the component. People arriving at Daakia are
 * arriving from Bruno, Insomnia, Thunder Client and a terminal full of HTTPie
 * and cURL as well, and every one of those was a "paste it and hope" before.
 *
 * ── The detection is not a convenience ──
 *
 * Asking which tool wrote a snippet is asking a question the snippet already
 * answers: `pm.response.json()` could not have come from anywhere else. The
 * dialect is detected, shown, and overridable — shown because a silent guess
 * that picks the wrong mapping table produces a plausible translation into the
 * wrong dialect, and overridable because the detector is allowed to be unsure.
 *
 * ── The prompt is the library's, not this file's ──
 *
 * The old version built its prompt inline, which meant the one in the prompt
 * library sat unused and anyone editing it changed nothing. The mapping table
 * arrives as a variable, so the template stays one editable thing across five
 * source tools.
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import {
  ModalView, AIButtonView, EditorView, CopyButtonView,
  SelectInputView, BadgeChipView, ButtonView,
} from '@salilvnair/dui';
import { SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { registerPmLanguageSupport, registerDkLanguageSupport } from '../../services/dk-repl';
import {
  detectDialect, dialectLabel, DIALECTS, type Dialect,
} from '../../services/translate/detect-dialect';
import { mappingsFor } from '../../services/translate/mappings';

interface Props {
  onClose: () => void;
  /** Pre-fill, for the "convert this" offer raised elsewhere. */
  initialSource?: string;
  /** Handed the translated script when the caller wants it back. */
  onAccept?: (translated: string) => void;
}

const ACCENT = 'var(--color-protocol-ai)';

/*
  Models occasionally leak reasoning before the requested fence despite being
  told not to. Pull out the fenced block — or, mid-stream, the tail after a
  fence that has opened but not closed — so stray prose never reaches the
  editor or the clipboard.
*/
function extractCode(raw: string): string {
  const trimmed = raw.trim();
  const closed = trimmed.match(/```(?:\w+)?\n?([\s\S]*?)```/);
  if (closed) return closed[1].trim();
  const openIdx = trimmed.indexOf('```');
  if (openIdx !== -1) return trimmed.slice(openIdx).replace(/^```(?:\w+)?\n?/, '').trim();
  return trimmed;
}

const EXAMPLE = `pm.test("Status is 200", function() {
  pm.response.to.have.status(200);
});

pm.test("Has user array", function() {
  const body = pm.response.json();
  pm.expect(body.users).to.be.an("array");
  pm.expect(body.users.length).to.be.greaterThan(0);
});

pm.environment.set("userId", pm.response.json().users[0].id);`;

/** 'auto' defers to the detector; anything else is the user overruling it. */
type Choice = 'auto' | Dialect;

export function AiScriptTranslatorModal({ onClose, initialSource, onAccept }: Props) {
  const resolve = useAiPromptTemplatesStore(s => s.resolve);

  const [input, setInput] = useState(initialSource ?? EXAMPLE);
  const [choice, setChoice] = useState<Choice>('auto');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');

  const detected = useMemo(() => detectDialect(input), [input]);
  const dialect: Dialect = choice === 'auto' ? detected.dialect : choice;

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setOutput(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setOutput(streamRef.current); setLoading(false); }
      else if (msg?.type === 'aiStream:error') { setError(msg.error || 'The model did not answer.'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const translate = () => {
    if (!input.trim() || loading) return;
    streamRef.current = ''; setOutput(''); setError(''); setLoading(true);
    postMsg({ type: 'aiStream', payload: {
      systemPrompt: resolve('platform.postman.translator.system', {}),
      userMessage: resolve('platform.postman.translator', {
        dialect: dialect === 'unknown' ? 'an unidentified API client' : dialectLabel(dialect),
        mappings: mappingsFor(dialect),
        source: input.trim(),
      }),
      templateKey: 'platform.postman.translator',
    }});
  };

  const displayOutput = useMemo(() => extractCode(output), [output]);
  const isCommand = dialect !== 'unknown' && DIALECTS[dialect]?.kind === 'command';

  const options = [
    { value: 'auto', label: detected.dialect === 'unknown' ? 'Detect (nothing recognised)' : `Detect — ${dialectLabel(detected.dialect)}` },
    ...Object.values(DIALECTS).map(d => ({ value: d.id, label: d.label })),
  ];

  return (
    <ModalView
      open
      onClose={onClose}
      title="Anything → Daakia"
      subtitle="Paste a script or a command from another API client"
      size="xxl"
      height="64vh"
      /* Full-bleed: the two editor panes run edge to edge with a divider
         between them, and the body's padding is asymmetric — faking it with a
         negative margin is what put a horizontal scrollbar here before. */
      noPadding
      headerColor={ACCENT}
      headerIcon={
        <div style={{
          width: 28, height: 28, borderRadius: 6, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: `color-mix(in srgb, ${ACCENT} 20%, transparent)`,
        }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      headerRight={output ? <CopyButtonView text={displayOutput} size="md" /> : undefined}
      footerLeft={
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Source</span>
          {/* The chip sits against the dropdown, not adrift in the footer: it
              qualifies that control and nothing else. */}
          <div className="flex items-center gap-1.5">
            <div style={{ width: 210 }}>
              <SelectInputView
                value={choice}
                onChange={v => setChoice(String(v) as Choice)}
                options={options}
                size="sm"
                width="fw"
                accentColor={ACCENT}
              />
            </div>
            {/* The evidence, not just the verdict — a wrong guess is correctable
                only if you can see what it was reading. */}
            {choice === 'auto' && detected.dialect !== 'unknown' && (
              <BadgeChipView
                tone={ACCENT}
                size="xs"
                title={`Matched: ${detected.signals.join(', ')}`}
              >
                {Math.round(detected.confidence * 100)}% sure
              </BadgeChipView>
            )}
          </div>
        </div>
      }
      footerRight={
        <div className="flex items-center gap-1.5">
          {onAccept && displayOutput && !loading && (
            <ButtonView size="md" variant="primary" accentColor={ACCENT}
                        onClick={() => onAccept(displayOutput)}>
              Use this
            </ButtonView>
          )}
          <AIButtonView
            label={loading ? 'Translating…' : 'Translate'}
            size="md"
            accentColor={ACCENT}
            disabled={!input.trim() || loading}
            loading={loading}
            onClick={translate}
          />
        </div>
      }
    >
      <div className="flex flex-1 min-h-0 gap-0 w-full overflow-x-hidden h-full">
        {/* Left: whatever they pasted */}
        <div className="flex flex-col flex-1 border-r min-w-0 min-h-0"
             style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="px-3 py-1.5 border-b flex items-center gap-2 shrink-0"
               style={{ borderColor: 'var(--color-surface-border)' }}>
            <span className="text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--color-text-muted)' }}>
              {dialect === 'unknown' ? 'Source' : dialectLabel(dialect)}
            </span>
            {isCommand && (
              <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>
                command line — translates into a request, not a script
              </span>
            )}
          </div>
          <div className="flex-1 p-3 min-h-0">
            <EditorView
              value={input}
              onChange={setInput}
              /* dui has no shell grammar; a command line highlighted as
                 JavaScript is worse than one not highlighted at all. */
              language={isCommand ? 'plaintext' : 'javascript'}
              height="100%"
              size="md"
              placeholder="Paste a Postman, Bruno, Insomnia or Thunder Client script — or an HTTPie or cURL command…"
              bordered={false}
              onEditorMount={(_editor, monaco) => registerPmLanguageSupport(monaco)}
            />
          </div>
        </div>

        {/* Right: Daakia */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <div className="px-3 py-1.5 border-b flex items-center gap-2 shrink-0"
               style={{ borderColor: 'var(--color-surface-border)' }}>
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: ACCENT }}>
              Daakia dk.*
            </span>
          </div>
          {error && <p className="text-[11px] px-3 py-2 m-0" style={{ color: 'var(--color-error)' }}>{error}</p>}
          {loading && !output && (
            <p className="text-[11px] animate-pulse px-3 py-2 m-0" style={{ color: ACCENT }}>Translating…</p>
          )}
          {output ? (
            <div className="flex-1 p-3 min-h-0">
              <EditorView
                value={displayOutput}
                language="javascript"
                height="100%"
                size="md"
                readOnly
                bordered={false}
                onEditorMount={(_editor, monaco) => registerDkLanguageSupport(monaco)}
              />
            </div>
          ) : !loading && !error && (
            <p className="text-[11px] px-3 py-2 m-0" style={{ color: 'var(--color-text-muted)' }}>
              Translation will appear here…
            </p>
          )}
        </div>
      </div>
    </ModalView>
  );
}
