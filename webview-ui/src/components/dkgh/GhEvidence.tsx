/**
 * A screenshot, on a card or in a peek.
 *
 * The image cannot be loaded from its URL. The webview's content policy allows
 * images from the extension and from `data:` and nothing else, and on a private
 * repository the asset needs the credential that only `gh` holds. So the bytes
 * come through the host and arrive here already encoded — see
 * `services/gh/evidence.ts` for the queue and the size cap.
 *
 * One request per distinct URL for the whole tab, because two cards can carry
 * the same screenshot and the answer is the same both times. The cache is a
 * module-level map: it dies with the webview, which is the right lifetime for
 * somebody else's product under test.
 *
 * While it is coming, the slot holds a tinted rectangle at the height the image
 * will occupy. Nothing below it moves when the picture lands — which is the
 * whole reason the placeholder has a height at all.
 */
import { useEffect, useState } from 'react';
import { postMsg } from '../../vscode';
import { Ico } from './GhIcons';
import { GhLightbox } from './GhLightbox';

export interface Answer { dataUri?: string; error?: string }

/** URL → what came back, or the promise of it. Shared by every card. */
const answers = new Map<string, Answer>();
const waiting = new Map<string, Set<(a: Answer) => void>>();
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('message', (evt: MessageEvent) => {
    const msg = evt.data as Record<string, unknown>;
    if (msg.type !== 'dkgh:evidence:result') return;
    const url = String(msg.url ?? '');
    const answer: Answer = {
      dataUri: msg.dataUri as string | undefined,
      error: msg.error as string | undefined,
    };
    answers.set(url, answer);
    const waiters = waiting.get(url);
    waiting.delete(url);
    waiters?.forEach(fn => fn(answer));
  });
}

/**
 * Ask the host for one image, and be told when it is here.
 *
 * Exported because avatars take exactly this road — same queue, same cache,
 * same size cap. Returns the unsubscribe, for a component that goes away
 * before the bytes arrive.
 */
export function requestEvidence(url: string, done: (a: Answer) => void): () => void {
  return request(url, done);
}

function request(url: string, done: (a: Answer) => void): () => void {
  listen();
  const known = answers.get(url);
  if (known) { done(known); return () => undefined; }

  const set = waiting.get(url);
  if (set) {
    /* Somebody already asked. Join them rather than sending a second request
       for bytes that are already on their way. */
    set.add(done);
  } else {
    waiting.set(url, new Set([done]));
    postMsg({ type: 'dkgh:evidence', url });
  }
  return () => waiting.get(url)?.delete(done);
}

export function GhEvidence({ url, height, alt, full = false }: {
  url: string;
  height: number;
  alt?: string;
  /**
   * Draw it at its own shape rather than as a fixed-height thumbnail.
   *
   * A card wants a strip — consistent rows, a hint that evidence exists. An
   * issue body wants the screenshot: `object-fit: cover` at 84px showed the
   * top-left corner of somebody's screen and cut off the error they attached
   * it for.
   */
  full?: boolean;
}) {
  const [answer, setAnswer] = useState<Answer | undefined>(() => answers.get(url));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setAnswer(answers.get(url));
    return request(url, setAnswer);
  }, [url]);

  const frame = {
    height,
    borderRadius: 5,
    overflow: 'hidden',
    border: '1px solid var(--dk-border)',
  } as const;

  if (answer?.dataUri) {
    if (full) {
      return (
        <>
          <img
            className="dkgh-shot"
            src={answer.dataUri}
            alt={alt ?? 'Evidence attached to this issue'}
            style={{ maxHeight: 520 }}
            onClick={() => setOpen(true)}
            title="Click to open it full size"
          />
          {open && (
            <GhLightbox src={answer.dataUri} alt={alt} onClose={() => setOpen(false)} />
          )}
        </>
      );
    }
    return (
      <>
        <div style={{ ...frame, cursor: 'zoom-in' }} onClick={() => setOpen(true)}>
          <img
            src={answer.dataUri}
            alt={alt ?? 'Evidence attached to this issue'}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
        {open && (
          <GhLightbox src={answer.dataUri} alt={alt} onClose={() => setOpen(false)} />
        )}
      </>
    );
  }

  /*
    A failure keeps its slot and says so quietly.

    Collapsing the card when a screenshot cannot be fetched would reflow a board
    somebody is reading, and it would hide the one fact worth knowing: there IS
    evidence on this issue, it just is not on this screen.
  */
  return (
    <div
      title={answer?.error ?? 'Fetching the screenshot through gh…'}
      style={{
        ...frame,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        background: answer?.error
          ? 'var(--dk-panel)'
          : 'color-mix(in srgb, var(--dk-gh) 8%, var(--dk-panel))',
        color: 'var(--dk-faint)',
        fontSize: 11.4,
      }}
      className={answer?.error ? undefined : 'animate-pulse'}
    >
      <Ico name="img" />
      {answer?.error && <span>screenshot on github.com</span>}
    </div>
  );
}
