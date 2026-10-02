/**
 * The first screen of a Daakia AI conversation: a question, and what to ask.
 *
 * Drawn inside the chat library's own landing area (portalled — the library
 * has no slot for it), so it goes away the moment the first message is sent
 * without this tab having to track that. A starter with a `{placeholder}` goes
 * into the composer for the user to finish; one without is sent as it is.
 */
import { createPortal } from 'react-dom';
import { ButtonView, KbdView } from '@salilvnair/dui';
import { useLibrarySlot } from './use-library-slot';
import { withPlaceholders, type AiPrompt } from './ai-prompts';
import { hasPlaceholder, prefill, send } from './ai-chat-actions';

function use(p: AiPrompt) {
  if (hasPlaceholder(p.text)) prefill(p.text); else send(p.text);
}

export function AiLandingPortal(props: {
  root: HTMLElement | null;
  dk8s?: { pods: number; namespace?: string };
  logPrompts: AiPrompt[];
  buildPrompts: AiPrompt[];
}) {
  const slot = useLibrarySlot(props.root, '.ce-landing', 'dai-landing-slot');
  if (!slot) return null;
  return createPortal(<AiLanding {...props} />, slot);
}

function AiLanding({ dk8s, logPrompts, buildPrompts }: {
  dk8s?: { pods: number; namespace?: string };
  logPrompts: AiPrompt[];
  buildPrompts: AiPrompt[];
}) {
  /* The six that answer "what went wrong" most often. */
  const featured = dk8s
    ? ['trace', 'errorsAround', 'timeouts', 'restarts', 'warnings', 'usage']
        .map(id => logPrompts.find(p => p.id === id)).filter((p): p is AiPrompt => !!p)
    : [];

  return (
    <div className="dai-landing">
      <div className="dai-hello">
        <h1>{dk8s ? 'What went wrong today?' : 'What are we building today?'}</h1>
        <p>
          {dk8s ? (
            <>Ask about a failure and Daakia reads the logs of the <strong>{dk8s.pods} pod{dk8s.pods === 1 ? '' : 's'} you're watching</strong>{dk8s.namespace ? ` in ${dk8s.namespace}` : ''} — or build, mock and test an API.</>
          ) : (
            <>Build, mock and test APIs by describing them. Watch pods in dk8s and you can ask their logs too.</>
          )}
        </p>
      </div>

      {featured.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Ask the logs">
          <div className="dai-eyebrow">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--dai-dk8s)" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" /></svg>
            Ask the logs
          </div>
          <div className="dai-starters">
            {featured.map(p => (
              <button key={p.id} type="button" className="dai-starter" onClick={() => use(p)} title={p.text}>
                <b>{p.label}</b>
                <span className="d">
                  {hasPlaceholder(p.text)
                    ? withPlaceholders(p.text).map((r, i) => r.ph ? <span key={i} className="dai-ph">{r.text}</span> : <span key={i}>{r.text}</span>)
                    : p.description}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {featured.length === 0 ? (
        <div className="dai-starters">
          {buildPrompts.slice(0, 6).map(p => (
            <button key={p.id} type="button" className="dai-starter" onClick={() => use(p)} title={p.text}>
              <b>{p.label}</b>
              <span className="d">{p.description}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="dai-pills">
          <span className="dai-eyebrow" style={{ marginRight: 4 }}>Build</span>
          {buildPrompts.slice(0, 4).map(p => (
            <ButtonView key={p.id} variant="ghost" size="sm" rounded accentColor="var(--color-ai-accent, #D97757)"
                        onClick={() => use(p)} title={p.text}>
              {p.label}
            </ButtonView>
          ))}
        </div>
      )}

      <div className="dai-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        Type <KbdView keys="/" size="md" /> in the message box for every prompt.
      </div>
    </div>
  );
}
