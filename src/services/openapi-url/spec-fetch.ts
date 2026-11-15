/**
 * Fetch a spec from a URL — or from the Swagger UI page in front of it.
 *
 * People paste whatever is in the address bar, and for most running services
 * that is the Swagger UI page (`/swagger-ui/index.html`, `/docs`), not the
 * document. So an HTML answer is read for the spec it loads: the `url` in its
 * inline config, the `url` in `swagger-initializer.js`, or the `configUrl`
 * springdoc points at. Only then are the usual paths tried.
 *
 * ── What it will fetch ──
 *
 * https anywhere; plain http only to this machine (`localhost`, `127.0.0.1`,
 * `[::1]`, `*.localhost`), where a service under development lives and the
 * request never crosses a network. A redirect is followed only within the
 * same origin, so a URL you checked cannot become one you did not. Every body
 * is size-capped before it is parsed.
 */
import { parseSpec } from './spec-outline';

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

export interface FetchedSpec {
  specUrl: string;
  text: string;
  status: number;
  bytes: number;
  ms: number;
  /** The URL given was a docs page; the spec was found behind it. */
  foundFromUi: boolean;
}

export type FetchFn = (url: string, init: { headers: Record<string, string>; redirect: 'manual'; signal: AbortSignal }) => Promise<{
  status: number; ok: boolean; headers: { get(name: string): string | null }; text(): Promise<string>;
}>;

export function isAllowedUrl(u: URL): string | null {
  if (u.protocol === 'https:') return null;
  if (u.protocol !== 'http:') return 'Only http and https URLs can be imported.';
  const h = u.hostname.toLowerCase();
  const local = h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1' || h.endsWith('.localhost');
  return local ? null : 'Plain http is only allowed to this machine — use https for anything else.';
}

/** A GitHub page address points at a rendered page; fetch the raw file instead. */
export function rawGitHub(u: URL): URL {
  if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return u;
  const parts = u.pathname.split('/').filter(Boolean);
  const at = parts.indexOf('blob');
  if (at < 2 || parts.length < at + 3) return u;
  return new URL(`https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts.slice(at + 1).join('/')}`);
}

function looksLikeHtml(text: string, contentType: string): boolean {
  return /text\/html/i.test(contentType) || /^\s*<(!doctype|html|head|body)/i.test(text);
}

/** Spec URLs a Swagger UI page or script names, most specific first. */
export function specUrlsIn(source: string): { urls: string[]; configUrls: string[]; scripts: string[] } {
  const urls: string[] = [];
  const configUrls: string[] = [];
  const scripts: string[] = [];
  const add = (list: string[], v: string) => { if (v && !list.includes(v)) list.push(v); };
  // `urls: [{ url: "...", name: "..." }]` — the first entry is the default.
  for (const m of source.matchAll(/urls\s*:\s*\[\s*\{[^}]*?url\s*:\s*["'`]([^"'`]+)["'`]/g)) add(urls, m[1]);
  // `url: "..."`, but not `configUrl:`, `oauth2RedirectUrl:` or `validatorUrl:`.
  for (const m of source.matchAll(/(?<![A-Za-z])url\s*:\s*["'`]([^"'`]+)["'`]/g)) add(urls, m[1]);
  for (const m of source.matchAll(/configUrl\s*:\s*["'`]([^"'`]+)["'`]/g)) add(configUrls, m[1]);
  for (const m of source.matchAll(/<script[^>]+src=["']([^"']*(?:initializer|swagger-config|swagger-ui-init)[^"']*\.js)["']/gi)) add(scripts, m[1]);
  // ReDoc and Scalar name the spec on an element.
  for (const m of source.matchAll(/(?:spec-url|data-url)=["']([^"']+)["']/gi)) add(urls, m[1]);
  /*
    Last, anything that looks like a spec address. Swagger UI's own
    initializer chooses the URL in code — petstore3's keeps it in a
    `host=url,host=url` string and passes a variable — so there is no
    `url: "..."` to read. Addresses on another site are dropped later.
  */
  const looksLikeSpec = /(openapi|swagger|api-docs)[^/]*$|\.(json|ya?ml)$/i;
  for (const m of source.matchAll(/https?:\/\/[^\s"'`,=<>()]+|["'`](\.{0,2}\/[^\s"'`<>()]+)["'`]/g)) {
    const u = m[1] ?? m[0];
    if (looksLikeSpec.test(u.split(/[?#]/)[0]) && !/swagger-ui|\.css|\.png|favicon|package\.json|manifest\.json/i.test(u)) add(urls, u);
  }
  return { urls, configUrls, scripts };
}

const FALLBACK_PATHS = ['/v3/api-docs', '/openapi.json', '/swagger.json', '/openapi.yaml', '/api-docs', '/v2/api-docs', '/swagger/v1/swagger.json'];

export async function fetchSpec(rawUrl: string, extraHeaders: Record<string, string> = {}, fetchFn: FetchFn = fetch as unknown as FetchFn): Promise<FetchedSpec> {
  let start: URL;
  try { start = rawGitHub(new URL(rawUrl.trim())); } catch { throw new Error('That is not a URL.'); }
  const refused = isAllowedUrl(start);
  if (refused) throw new Error(refused);
  const origin = start.origin;
  const t0 = Date.now();

  const get = async (url: URL): Promise<{ text: string; status: number; contentType: string; finalUrl: URL }> => {
    let current = url;
    for (let hop = 0; hop < 5; hop++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      try {
        const res = await fetchFn(current.toString(), {
          headers: { accept: 'application/json, application/yaml, text/yaml, text/html;q=0.8, */*;q=0.5', ...extraHeaders },
          redirect: 'manual',
          signal: ctl.signal,
        });
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get('location');
          if (!loc) throw new Error(`The server answered ${res.status} with nowhere to go.`);
          const next = new URL(loc, current);
          if (next.origin !== origin) throw new Error(`It redirects to ${next.origin}, a different site — paste that address if you mean it.`);
          current = next;
          continue;
        }
        const length = Number(res.headers.get('content-length') ?? 0);
        if (length > MAX_BYTES) throw new Error('That document is too large to import.');
        const text = await res.text();
        if (text.length > MAX_BYTES) throw new Error('That document is too large to import.');
        return { text, status: res.status, contentType: res.headers.get('content-type') ?? '', finalUrl: current };
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') throw new Error(`${current.host} did not answer within 15 seconds.`);
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error('Too many redirects.');
  };

  const asSpec = (r: { text: string; status: number; finalUrl: URL }, fromUi: boolean): FetchedSpec | null => {
    if (r.status < 200 || r.status >= 300) return null;
    try { parseSpec(r.text); } catch { return null; }
    return { specUrl: r.finalUrl.toString(), text: r.text, status: r.status, bytes: r.text.length, ms: Date.now() - t0, foundFromUi: fromUi };
  };

  const first = await get(start);
  if (first.status === 401 || first.status === 403) throw new Error(`The server answered ${first.status} — add the header it needs and fetch again.`);
  if (first.status >= 400) throw new Error(`The server answered ${first.status}.`);
  if (!looksLikeHtml(first.text, first.contentType)) {
    const direct = asSpec(first, false);
    if (direct) return direct;
    // Parse again for the reason, so the message says what is wrong with it.
    try { parseSpec(first.text); } catch (e) { throw new Error((e as Error).message); }
  }

  // A docs page. Find the spec it loads.
  const tryUrl = async (candidate: string, base: URL): Promise<FetchedSpec | null> => {
    let u: URL;
    try { u = new URL(candidate, base); } catch { return null; }
    if (u.origin !== origin) return null;
    try { return asSpec(await get(u), true); } catch { return null; }
  };
  const page = first.finalUrl;
  const found = specUrlsIn(first.text);
  for (const s of found.scripts) {
    try {
      const js = await get(new URL(s, page));
      const inner = specUrlsIn(js.text);
      found.urls.push(...inner.urls);
      found.configUrls.push(...inner.configUrls);
    } catch { /* a missing script is not the end of the search */ }
  }
  for (const c of found.configUrls) {
    try {
      const cfg = await get(new URL(c, page));
      const parsed = JSON.parse(cfg.text) as { url?: string; urls?: { url?: string }[] };
      const named = parsed.url ?? parsed.urls?.[0]?.url;
      if (named) found.urls.unshift(named);
    } catch { /* fall through to the other candidates */ }
  }
  for (const u of found.urls) {
    const hit = await tryUrl(u, page);
    if (hit) return hit;
  }
  for (const p of FALLBACK_PATHS) {
    const hit = await tryUrl(p, new URL(origin));
    if (hit) return hit;
  }
  throw new Error('That page is not a spec, and no spec was found behind it. Paste the address of the JSON or YAML document.');
}
