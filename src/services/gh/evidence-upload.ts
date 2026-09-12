/**
 * Getting a pasted screenshot onto GitHub — screen 12.
 *
 * Worth being straight about the problem. GitHub's own paste-to-upload is a
 * private endpoint its web UI calls with a session cookie. It is not in the
 * REST API, it is not in `gh`, and nothing here can call it. What is available
 * is the contents API, which is ours to use — so an image becomes a commit, and
 * the commit's blob URL goes in the issue body.
 *
 * **Not on the default branch.** Screenshots are not source, and a repository
 * whose `main` fills up with `.dkgh/evidence/8f2c41.png` is one whose owner is
 * entitled to be annoyed. They go on a branch of their own, created once, off
 * whatever the default branch happens to be.
 *
 * **The URL is the `?raw=1` blob URL, not `raw.githubusercontent.com`.** The
 * raw host needs its own token on a private repository, so an issue written
 * with a raw URL renders as a broken image for everybody who can read the
 * issue — which is the case screenshots matter most in. The blob URL follows
 * the reader's own session.
 *
 * Every failure this can hit is somebody else's rule rather than a bug: a
 * protected branch, no write access, a file too big to be kind to whoever opens
 * the issue. They are reported by name, and the composer keeps working through
 * all of them — see screen 12B.
 */
import { run } from './gh';

/** Anything past this makes an issue slow for everybody who opens it. */
export const COMFORTABLE_BYTES = 5 * 1024 * 1024;

/** Where the images live, on a branch of their own. */
export const EVIDENCE_BRANCH = 'dkgh-evidence';
export const EVIDENCE_DIR = '.dkgh/evidence';

export interface EvidenceFile {
  /** What to call it in the repository. Already made safe by `safeName`. */
  name: string;
  /** The image, base64, without the `data:` prefix. */
  base64: string;
  /** What the reader called it, for the body's link text. */
  label?: string;
}

export interface UploadStep {
  kind: 'branch' | 'file';
  name: string;
  does: string;
  argv: string[];
  display: string;
}

export interface UploadPlan {
  repo: string;
  branch: string;
  steps: UploadStep[];
  /** Files over the comfortable size, named so the screen can offer a resize. */
  heavy: { name: string; bytes: number }[];
  refusal?: string;
}

export interface UploadOutcome {
  name: string;
  ok: boolean;
  /** The blob URL, for the body. Set only when the file actually landed. */
  url?: string;
  error?: string;
}

/**
 * A file name a repository can hold and a URL can carry.
 *
 * Pasted images arrive called `image.png` or `Screenshot 2026-09-10 at
 * 09.14.22.png`; neither is unique and the second is not a path anybody wants
 * to type. The hash keeps them apart and the extension keeps them renderable.
 */
export function safeName(label: string, base64: string): string {
  const ext = (/\.(png|jpe?g|gif|webp)$/i.exec(label)?.[1] ?? 'png').toLowerCase();
  let sum = 0;
  /* Enough to separate a handful of screenshots on one issue. This is a file
     name, not a checksum — collisions cost a name, not correctness. */
  for (let i = 0; i < base64.length; i += 97) {
    sum = (sum * 31 + base64.charCodeAt(i)) % 0xffffff;
  }
  return `${sum.toString(16).padStart(6, '0')}.${ext === 'jpg' ? 'jpeg' : ext}`;
}

/** Base64 is 4 characters per 3 bytes, less whatever padding is on the end. */
export function bytesOf(base64: string): number {
  const pad = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - pad;
}

/** The URL that renders for whoever can read the issue, private or not. */
export function blobUrl(repo: string, branch: string, name: string): string {
  return `https://github.com/${repo}/blob/${branch}/${EVIDENCE_DIR}/${name}?raw=1`;
}

async function json<T>(argv: string[]): Promise<T | undefined> {
  const r = await run(argv, { timeoutMs: 30_000 });
  if (!r.ok) return undefined;
  try {
    return JSON.parse(r.stdout) as T;
  } catch {
    return undefined;
  }
}

/**
 * What uploading these would run, unrun.
 *
 * The branch step is planned only when the branch is missing, and it is shown
 * as its own line because creating a branch on somebody's repository is a
 * different act from adding a file to one that already exists.
 */
export async function planUpload(repo: string, files: EvidenceFile[]): Promise<UploadPlan> {
  const branch = EVIDENCE_BRANCH;
  const empty = { repo, branch, steps: [], heavy: [] };
  if (files.length === 0) return { ...empty, refusal: 'There is nothing to upload.' };

  const steps: UploadStep[] = [];

  const ref = await json<{ object?: { sha?: string } }>(
    ['api', `/repos/${repo}/git/ref/heads/${branch}`],
  );
  if (!ref?.object?.sha) {
    const head = await json<{ default_branch?: string }>(['api', `/repos/${repo}`]);
    const from = head?.default_branch ?? 'main';
    const base = await json<{ object?: { sha?: string } }>(
      ['api', `/repos/${repo}/git/ref/heads/${from}`],
    );
    if (!base?.object?.sha) {
      return { ...empty, refusal: `gh could not read ${repo} — is it there, and readable?` };
    }
    const argv = [
      'api', '--method', 'POST', `/repos/${repo}/git/refs`,
      '-f', `ref=refs/heads/${branch}`,
      '-f', `sha=${base.object.sha}`,
    ];
    steps.push({
      kind: 'branch',
      name: branch,
      does: `Creates the ${branch} branch off ${from}`,
      argv,
      display: `gh ${argv.join(' ')}`,
    });
  }

  const heavy: { name: string; bytes: number }[] = [];
  for (const file of files) {
    const bytes = bytesOf(file.base64);
    if (bytes > COMFORTABLE_BYTES) heavy.push({ name: file.label ?? file.name, bytes });
    const path = `${EVIDENCE_DIR}/${file.name}`;
    const argv = [
      'api', '--method', 'PUT', `/repos/${repo}/contents/${path}`,
      '-f', `message=Evidence for an issue filed from dkgh`,
      '-f', `branch=${branch}`,
      '-f', `content=${file.base64}`,
    ];
    steps.push({
      kind: 'file',
      name: file.name,
      does: `Commits ${file.label ?? file.name} (${kb(bytes)})`,
      argv,
      /* The base64 is megabytes nobody reads. The line says what it does and
         how big it is, which is the part somebody can act on. */
      display: `gh api --method PUT /repos/${repo}/contents/${path}`
        + `  --field branch=${branch}  # ${kb(bytes)}`,
    });
  }

  return { repo, branch, steps, heavy };
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Run it, and answer with a URL per file.
 *
 * A file that fails does not stop the others: three screenshots where one is
 * too big should get you two hosted images and one honest gap, not nothing.
 */
export async function applyUpload(plan: UploadPlan): Promise<UploadOutcome[]> {
  const out: UploadOutcome[] = [];
  for (const step of plan.steps) {
    const r = await run(step.argv, { timeoutMs: 120_000 });
    if (step.kind === 'branch') {
      /*
        A branch that already exists is not a failure. Two composers uploading
        at once is ordinary, and the second one's 422 means the branch is
        there — which is all this step was for.
      */
      const already = /already exists/i.test(r.stderr ?? '');
      if (!r.ok && !already) {
        out.push({
          name: step.name,
          ok: false,
          error: (r.stderr || r.failure || 'the branch could not be created').trim(),
        });
        /* Without the branch there is nowhere to put anything. */
        return out;
      }
      continue;
    }
    out.push({
      name: step.name,
      ok: r.ok,
      url: r.ok ? blobUrl(plan.repo, plan.branch, step.name) : undefined,
      error: r.ok ? undefined : (r.stderr || r.failure || `gh exited with ${r.code}`).trim(),
    });
  }
  return out;
}
