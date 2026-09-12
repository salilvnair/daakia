/**
 * Screenshots attached to an issue.
 *
 * The evidence field is the reason the card board is cards rather than rows: a
 * screenshot in the list is worth more than any three fields beside it, because
 * it is how a reader recognises the bug they already know about.
 *
 * Getting one onto the screen is less obvious than it looks. The webview cannot
 * load the URL itself — its content policy allows images only from the
 * extension and from `data:`, and widening that to the whole web so a thumbnail
 * can render would be a poor trade — and on a private repository the asset is
 * behind the same credential as everything else. So the bytes come through
 * `gh`, like every other byte in dkgh, and arrive as a data URI.
 *
 * Two limits, both deliberate:
 *
 * - **One at a time.** A board of sixty cards asking at once is sixty
 *   subprocesses, and the machine notices. They queue.
 * - **A size cap.** Somebody's 8 MB screenshot becomes an 11 MB data URI on the
 *   way through `postMessage`, and a thumbnail 120 pixels tall does not need
 *   it. Past the cap the answer is "too big", which the card renders as the
 *   marker it would have shown anyway.
 *
 * Nothing is written to disk. The cache is this process's memory and dies with
 * the window, because a screenshot cache on a tester's laptop is somebody
 * else's product under test sitting in a temp folder.
 */
import { runBinary } from './gh';

/** Past this, a thumbnail is not worth what it costs to move. 4 MB. */
const MAX_BYTES = 4 * 1024 * 1024;

/** How many distinct images are kept. Sixty cards, some sharing an image. */
const MAX_CACHED = 80;

export interface Evidence {
  url: string;
  /** `data:image/png;base64,…`, ready for an `<img src>`. */
  dataUri?: string;
  /** Why there is no image — said, never swallowed into a blank box. */
  error?: string;
}

/*
  Markdown images and raw <img> tags, which is what GitHub's own uploader
  produces in a body. Both spellings, because a body is written by people and
  half of them paste HTML.
*/
const MD_IMAGE = /!\[[^\]]*\]\(\s*(https?:\/\/[^\s)]+)\s*\)/g;
const HTML_IMAGE = /<img[^>]+src\s*=\s*["'](https?:\/\/[^"']+)["']/gi;

/** Bare links to an attachment, which GitHub renders as an image anyway. */
const BARE_ATTACHMENT =
  /https:\/\/(?:github\.com\/user-attachments\/assets|user-images\.githubusercontent\.com)\/[^\s)"'<]+/g;

/**
 * Every image URL in an issue body, in the order they appear.
 *
 * Order matters: the first one is what the card shows, and the first image in a
 * bug report is almost always the screenshot of the thing going wrong rather
 * than the console log somebody added underneath.
 */
export function imageUrls(body: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (u: string) => {
    const clean = u.replace(/[.,;]+$/, '');
    if (seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  };

  for (const m of body.matchAll(MD_IMAGE)) add(m[1]);
  for (const m of body.matchAll(HTML_IMAGE)) add(m[1]);
  for (const m of body.matchAll(BARE_ATTACHMENT)) add(m[0]);
  return out;
}

/** What has already been fetched. Insertion-ordered, so the oldest goes first. */
const cache = new Map<string, Evidence>();

/** One in flight at a time, and one promise per URL for concurrent askers. */
const inFlight = new Map<string, Promise<Evidence>>();
let queue: Promise<unknown> = Promise.resolve();

function remember(entry: Evidence): Evidence {
  cache.set(entry.url, entry);
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return entry;
}

/** What an image's bytes say it is, so the data URI carries the right type. */
function sniff(data: Buffer): string | undefined {
  if (data.length < 12) return undefined;
  if (data[0] === 0x89 && data[1] === 0x50) return 'image/png';
  if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg';
  if (data[0] === 0x47 && data[1] === 0x49) return 'image/gif';
  if (data.subarray(0, 4).toString('ascii') === 'RIFF'
    && data.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (data.subarray(0, 5).toString('ascii').trim().startsWith('<svg')) return 'image/svg+xml';
  return undefined;
}

async function fetchOne(url: string): Promise<Evidence> {
  /*
    `gh api` with an absolute URL sends the credential and follows GitHub's
    redirect to wherever the asset actually lives. Anything else — a link to a
    screenshot on somebody's own server — is refused rather than fetched: dkgh
    talks to GitHub, and quietly turning into a general-purpose downloader for
    URLs found in issue bodies is not a thing a tool should do.
  */
  if (!/^https:\/\/(github\.com|[a-z0-9-]+\.githubusercontent\.com|api\.github\.com)\//i.test(url)) {
    return remember({ url, error: 'Not a GitHub-hosted image — open the issue to see it.' });
  }

  const r = await runBinary(['api', url], { timeoutMs: 30_000, maxBuffer: MAX_BYTES + 1024 });
  if (!r.ok) {
    return remember({ url, error: (r.stderr || r.failure || 'gh could not fetch it').trim() });
  }
  if (r.data.length === 0) return remember({ url, error: 'Empty response.' });
  if (r.data.length > MAX_BYTES) {
    return remember({ url, error: `Too large to preview (${Math.round(r.data.length / 1024)} KB).` });
  }

  const mime = sniff(r.data);
  if (!mime) return remember({ url, error: 'That attachment is not an image.' });
  return remember({ url, dataUri: `data:${mime};base64,${r.data.toString('base64')}` });
}

/**
 * One image, fetched at most once.
 *
 * Serialised behind a single queue. A board that renders sixty cards asks sixty
 * times in the same tick, and sixty concurrent subprocesses is a stall the user
 * feels as the whole editor.
 */
export function fetchEvidence(url: string): Promise<Evidence> {
  const hit = cache.get(url);
  if (hit) return Promise.resolve(hit);

  const running = inFlight.get(url);
  if (running) return running;

  const job = queue.then(() => fetchOne(url)).finally(() => inFlight.delete(url));
  /* The queue swallows failures so one bad asset does not stop the rest of the
     board's images from ever being fetched. */
  queue = job.catch(() => undefined);
  inFlight.set(url, job);
  return job;
}
