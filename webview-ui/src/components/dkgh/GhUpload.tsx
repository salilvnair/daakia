/**
 * Screen 12 — getting a pasted screenshot onto GitHub.
 *
 * GitHub's own paste-to-upload is a private endpoint its web UI calls with a
 * session cookie: not in the REST API, not in `gh`, not ours to call. The route
 * that *is* ours is the contents API, so an image becomes a commit on a branch
 * of its own and the blob URL goes in the body.
 *
 * **The images sit local until you say so.** A pasted screenshot is a data URL
 * in the draft and nothing has left the machine — which is the right default,
 * because a screenshot of somebody's production console is exactly the thing
 * not to upload by reflex. This strip is where that becomes a decision, and it
 * shows the commits before it makes them.
 *
 * **12B — a refusal is somebody else's rule, not a bug.** A protected branch,
 * no write access, a 40 MB PNG: each one is named, the composer keeps working,
 * and an image that could not be hosted stays in the draft rather than
 * vanishing.
 *
 * **12D — the resize is offered, never applied quietly.** Anything past a few
 * megabytes makes an issue slow for everyone who opens it; recompressing is one
 * button and it says what it did.
 */
import { useEffect, useState } from 'react';
import { postMsg } from '../../vscode';
import { Ico } from './GhIcons';
import { CopyWord, GhNote } from './GhShell';
import type { Draft } from './composer-model';

interface Step { kind: 'branch' | 'file'; name: string; does: string; display: string }
interface Plan {
  repo: string;
  branch: string;
  steps: Step[];
  heavy: { name: string; bytes: number }[];
  refusal?: string;
}
interface Outcome { name: string; ok: boolean; url?: string; error?: string }

/** Past this an issue is slow for everybody who opens it. Mirrors the host. */
const COMFORTABLE_BYTES = 5 * 1024 * 1024;

/** The longest edge a recompressed screenshot keeps. Text stays readable. */
const MAX_EDGE = 2000;

export function GhUpload({ repo, draft, onDraft }: {
  repo: string;
  draft: Draft;
  onDraft: (change: Partial<Draft>) => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [busy, setBusy] = useState('');

  /* Only the ones that are still on this machine. A URL in the list is one
     that has already been through here, or one somebody pasted by hand. */
  const local = draft.evidence.filter(u => u.startsWith('data:'));

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'dkgh:planUpload:result') { setPlan(msg.plan as Plan); return; }
      if (msg.type === 'dkgh:applyUpload:running') { setRunning(true); return; }
      if (msg.type !== 'dkgh:applyUpload:result') return;
      setRunning(false);
      const answers = (msg.outcomes as Outcome[]) ?? [];
      setOutcomes(answers);
      setPlan(null);

      /*
        Swap each data URL for the URL it landed at, in place.

        In place, because the order of the gallery is the order of the story —
        see 12A — and an upload that reshuffled it would be rewriting what
        somebody meant to say.
      */
      const byName = new Map(answers.filter(o => o.ok && o.url).map(o => [o.name, o.url!]));
      if (byName.size === 0) return;
      onDraft({
        evidence: draft.evidence.map(u => {
          if (!u.startsWith('data:')) return u;
          return byName.get(nameOf(u)) ?? u;
        }),
      });
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [draft.evidence, onDraft]);

  if (local.length === 0 && !outcomes) return null;

  const files = local.map(u => ({
    name: nameOf(u),
    base64: bodyOf(u),
    label: 'pasted screenshot',
  }));

  const heavy = files.filter(f => bytesOf(f.base64) > COMFORTABLE_BYTES);

  /** 12D — recompress the oversized ones, in the browser, and say what it did. */
  const shrink = async () => {
    setBusy('Recompressing…');
    const next = await Promise.all(draft.evidence.map(async u => (
      u.startsWith('data:') && bytesOf(bodyOf(u)) > COMFORTABLE_BYTES ? recompress(u) : u
    )));
    setBusy('');
    onDraft({ evidence: next });
  };

  return (
    <div className="opt" style={{ marginTop: 10 }}>
      <div className="oh">
        <Ico name="img" style={{ color: 'var(--dk-gh)' }} />
        {local.length > 0
          ? `${local.length} screenshot${local.length === 1 ? '' : 's'} still on this machine`
          : 'Screenshots'}
        <span className="sp" />
        {local.length > 0 && (
          <button
            type="button"
            className="btn"
            onClick={() => postMsg({ type: 'dkgh:planUpload', repo, files })}
          >
            <Ico name="dl" />Show me what uploading runs
          </button>
        )}
      </div>

      {local.length > 0 && (
        <div className="sub">
          Nothing has left this machine. Uploading commits them to{' '}
          <code>.dkgh/evidence/</code> on a <code>dkgh-evidence</code> branch — never on the
          default one — and puts the blob URL in the body. GitHub&rsquo;s own paste-to-upload is
          a private endpoint its web UI calls with a session cookie; it is not in the API and
          not in <code>gh</code>, so this is the route that is actually ours to take.
        </div>
      )}

      {heavy.length > 0 && (
        <GhNote title={`${heavy.length} of these is over 5 MB`} tone="warn" style={{ margin: 0 }}>
          The contents API will take it, but an issue carrying it is slow for everybody who
          opens it. Recompressing keeps a screenshot visually identical.
          <span className="actions" style={{ marginTop: 7, justifyContent: 'flex-start' }}>
            <button type="button" className="btn go" disabled={!!busy} onClick={shrink}>
              {busy || `Recompress ${heavy.length === 1 ? 'it' : 'them'}`}
            </button>
          </span>
        </GhNote>
      )}

      {plan && (
        <>
          {plan.refusal
            ? <div className="sub" style={{ color: 'var(--dk-red)' }}>{plan.refusal}</div>
            : (
              <>
                <div className="cmd" style={{ alignItems: 'flex-start' }}>
                  <pre className="code" style={{ flex: 1 }}>
                    {plan.steps.map(s => s.display).join('\n')}
                  </pre>
                  <CopyWord text={plan.steps.map(s => s.display).join('\n')} />
                </div>
                <div className="sub">
                  {plan.steps.some(s => s.kind === 'branch')
                    ? `The ${plan.branch} branch does not exist yet, so the first call makes it.`
                    : `Committed to the ${plan.branch} branch, which is already there.`}
                  {' '}One commit per image, run in order.
                </div>
                <div className="actions" style={{ justifyContent: 'flex-start' }}>
                  <button type="button" className="btn" onClick={() => setPlan(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn go"
                    disabled={running}
                    onClick={() => postMsg({ type: 'dkgh:applyUpload', repo, files })}
                  >
                    {running ? 'Uploading…' : `Upload ${files.length} to ${repo}`}
                  </button>
                </div>
              </>
            )}
        </>
      )}

      {outcomes && outcomes.length > 0 && (
        <div className="opt" style={{ gap: 2, padding: 4 }}>
          {outcomes.map(o => (
            <div key={o.name} className="fct" style={{ cursor: 'default' }}>
              <Ico name={o.ok ? 'check' : 'warn'}
                   style={{ color: o.ok ? 'var(--dk-green)' : 'var(--dk-red)', flexShrink: 0 }} />
              <code>{o.name}</code>
              {o.error
                ? <span className="sub" style={{ color: 'var(--dk-red)' }}>{o.error}</span>
                : <span className="sub">hosted, and linked in the body</span>}
            </div>
          ))}
          {outcomes.some(o => !o.ok) && (
            <div className="fct" style={{ display: 'block', cursor: 'default',
                                          color: 'var(--dk-faint)', lineHeight: 1.5 }}>
              What did not upload is still in the draft. The issue can be filed without it —
              the body says the image is not hosted rather than linking somewhere broken.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** `data:image/png;base64,AAAA` → `AAAA`. */
function bodyOf(url: string): string {
  return url.slice(url.indexOf(',') + 1);
}

/**
 * The name this image will have in the repository.
 *
 * Derived from the bytes so the same paste twice is the same file, and so the
 * host and this screen agree without passing a name back and forth — the
 * algorithm is `safeName` in `services/gh/evidence-upload.ts`.
 */
function nameOf(url: string): string {
  const base64 = bodyOf(url);
  const ext = /image\/(png|jpeg|jpg|gif|webp)/.exec(url)?.[1] ?? 'png';
  let sum = 0;
  for (let i = 0; i < base64.length; i += 97) {
    sum = (sum * 31 + base64.charCodeAt(i)) % 0xffffff;
  }
  return `${sum.toString(16).padStart(6, '0')}.${ext === 'jpg' ? 'jpeg' : ext}`;
}

function bytesOf(base64: string): number {
  const pad = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - pad;
}

/**
 * 12D — smaller, and still a readable screenshot.
 *
 * Capped on the long edge rather than scaled by a factor, because what matters
 * is that the text in it is still legible; PNG becomes JPEG at a quality that
 * is indistinguishable for a screen capture and a fraction of the bytes.
 * Returns the original if anything at all goes wrong — a failed resize must not
 * cost somebody their evidence.
 */
async function recompress(url: string): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return url;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', 0.82);
    return out.length < url.length ? out : url;
  } catch {
    return url;
  }
}
