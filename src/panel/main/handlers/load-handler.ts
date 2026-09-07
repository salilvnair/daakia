/**
 * Load test runner — real requests, real numbers.
 *
 * ── Why this file exists ──
 *
 * The Load Tester panel used to run entirely in the webview and send nothing:
 * `setTimeout(80 + Math.random() * 400)` for the latency and
 * `Math.random() > 0.05 ? 200 : 500` for the status. It then reported those as
 * p50/p95/p99 for the user's endpoint. A capacity number that is invented is
 * worse than no number, because it looks exactly like a measured one.
 *
 * Everything here is measured: one socket per virtual user, wall-clock timing
 * around each request, and the status the server actually returned.
 *
 * ── The load model ──
 *
 * Two families, as every load tool has settled on:
 *
 *  - **Closed model** (`constant-vus`, `ramping-vus`) — N virtual users, each
 *    looping request → think time → request. Throughput is whatever the server
 *    allows, so a slowing server produces less load. This is what you want to
 *    model a fixed number of concurrent clients.
 *  - **Open model** (`constant-rate`, `ramping-rate`) — arrivals scheduled at a
 *    target rate regardless of how the server is coping, borrowing more VUs up
 *    to a cap. This is what you want to model traffic that does not wait for
 *    you, and it is the one that finds a breaking point.
 *
 * ── Guardrails ──
 *
 * This sends real traffic from the user's machine, so the caps below are hard.
 * They are generous enough for testing a service and low enough that a typo in
 * a duration field cannot leave a run hammering an endpoint for an hour.
 */
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

type PostMessage = (msg: unknown) => void;

/** Hard ceilings. A typo in a form field must not become an hour-long run. */
const LIMITS = {
  vus: 500,
  durationSeconds: 30 * 60,
  totalRequests: 1_000_000,
  /** Latencies kept for percentiles; beyond this we sample. */
  keptSamples: 200_000,
  timeoutMs: 120_000,
};

const TICK_MS = 500;

export interface LoadStage {
  /** VUs (closed model) or requests/second (open model) to reach. */
  target: number;
  seconds: number;
}

export interface LoadThresholds {
  p95Ms?: number;
  p99Ms?: number;
  errorRatePct?: number;
  minRps?: number;
}

interface KeyValueRow { key: string; value: string; enabled: boolean }

export type LoadProfile = 'constant-vus' | 'ramping-vus' | 'constant-rate' | 'ramping-rate';

export interface LoadConfig {
  runId: number;
  url: string;
  method: string;
  headers: KeyValueRow[];
  authType: string;
  authData: Record<string, string>;
  body: string;
  contentType: string;

  profile: LoadProfile;
  vus: number;
  /** 0 means "run for the duration instead of a fixed count". */
  totalRequests: number;
  durationSeconds: number;
  stages: LoadStage[];
  targetRps: number;
  maxVus: number;

  warmupSeconds: number;
  thinkTimeMinMs: number;
  thinkTimeMaxMs: number;

  timeoutMs: number;
  followRedirects: boolean;
  keepAlive: boolean;
  gzip: boolean;
  insecureTls: boolean;

  thresholds: LoadThresholds;
  abortOnThresholdBreach: boolean;
}

// ── Statistics ───────────────────────────────────────────────────────────────

/**
 * The p-th percentile by nearest-rank, over an already-sorted array.
 *
 * Exported because the numbers this tool prints are the whole point of it, so
 * they are tested rather than eyeballed.
 */
export function percentileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export interface LoadSummary {
  count: number;
  errors: number;
  errorRatePct: number;
  rps: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  statusCodes: Record<string, number>;
  bytes: number;
  elapsedMs: number;
}

export function summarise(
  latencies: number[],
  errors: number,
  statusCodes: Record<string, number>,
  bytes: number,
  elapsedMs: number,
  /** Completed requests, which is larger than `latencies` once sampling kicks in. */
  count: number,
): LoadSummary {
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count,
    errors,
    errorRatePct: count === 0 ? 0 : Math.round((errors / count) * 1000) / 10,
    rps: elapsedMs === 0 ? 0 : Math.round((count / (elapsedMs / 1000)) * 10) / 10,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    avg: sorted.length === 0 ? 0 : Math.round(sum / sorted.length),
    p50: percentileSorted(sorted, 50),
    p90: percentileSorted(sorted, 90),
    p95: percentileSorted(sorted, 95),
    p99: percentileSorted(sorted, 99),
    statusCodes,
    bytes,
    elapsedMs,
  };
}

export interface ThresholdResult {
  name: string;
  target: number;
  actual: number;
  /** True when the measured value is within the target. */
  passed: boolean;
}

/**
 * Thresholds are the pass/fail line — the reason a load test can fail a
 * pipeline rather than just print numbers.
 */
export function evaluateThresholds(s: LoadSummary, t: LoadThresholds): ThresholdResult[] {
  const out: ThresholdResult[] = [];
  if (t.p95Ms != null) out.push({ name: 'p95 < ' + t.p95Ms + 'ms', target: t.p95Ms, actual: s.p95, passed: s.p95 <= t.p95Ms });
  if (t.p99Ms != null) out.push({ name: 'p99 < ' + t.p99Ms + 'ms', target: t.p99Ms, actual: s.p99, passed: s.p99 <= t.p99Ms });
  if (t.errorRatePct != null) out.push({ name: 'errors < ' + t.errorRatePct + '%', target: t.errorRatePct, actual: s.errorRatePct, passed: s.errorRatePct <= t.errorRatePct });
  if (t.minRps != null) out.push({ name: 'throughput ≥ ' + t.minRps + '/s', target: t.minRps, actual: s.rps, passed: s.rps >= t.minRps });
  return out;
}

/**
 * How many VUs (closed) or requests/second (open) the run should be at, this
 * far in — linear between stage targets, the way every ramping executor works.
 */
export function targetAt(elapsedSeconds: number, stages: LoadStage[], startFrom = 0): number {
  let t = startFrom;
  let clock = 0;
  for (const stage of stages) {
    if (elapsedSeconds < clock + stage.seconds) {
      const within = (elapsedSeconds - clock) / Math.max(stage.seconds, 0.001);
      return t + (stage.target - t) * within;
    }
    clock += stage.seconds;
    t = stage.target;
  }
  return t;
}

/** Total seconds a stage list describes. */
export function stagesDuration(stages: LoadStage[]): number {
  return stages.reduce((a, s) => a + s.seconds, 0);
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

function buildHeaders(cfg: LoadConfig): Record<string, string> {
  const out: Record<string, string> = { 'User-Agent': 'Daakia-LoadTester/1.0' };
  if (cfg.body) out['Content-Type'] = cfg.contentType || 'application/json';
  if (cfg.gzip) out['Accept-Encoding'] = 'gzip, deflate';

  const { authType, authData } = cfg;
  if (authType === 'bearer' && authData.token) out['Authorization'] = `Bearer ${authData.token}`;
  else if (authType === 'basic' && authData.username) {
    out['Authorization'] = 'Basic ' + Buffer.from(`${authData.username}:${authData.password || ''}`).toString('base64');
  } else if (authType === 'api-key' && authData.apiKeyName && authData.apiKeyValue) {
    out[authData.apiKeyName] = authData.apiKeyValue;
  }

  for (const h of cfg.headers ?? []) if (h.enabled && h.key) out[h.key] = h.value;
  return out;
}

interface Attempt { status: number; ms: number; bytes: number; error?: string }

function once(
  cfg: LoadConfig,
  headers: Record<string, string>,
  agents: { http: http.Agent; https: https.Agent },
  redirectsLeft: number,
  urlStr: string,
): Promise<Attempt> {
  const t0 = Date.now();

  return new Promise((resolve) => {
    let parsed: URL;
    try { parsed = new URL(urlStr); } catch {
      resolve({ status: 0, ms: 0, bytes: 0, error: 'Invalid URL' });
      return;
    }

    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;
    const bodyBuffer = cfg.body ? Buffer.from(cfg.body, 'utf8') : null;

    const req = transport.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: cfg.method.toUpperCase(),
      timeout: cfg.timeoutMs,
      agent: isHttps ? agents.https : agents.http,
      headers: bodyBuffer ? { ...headers, 'Content-Length': bodyBuffer.length } : headers,
      rejectUnauthorized: !cfg.insecureTls,
    }, (res) => {
      const status = res.statusCode ?? 0;

      if (cfg.followRedirects && status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const next = new URL(res.headers.location, urlStr).toString();
        once(cfg, headers, agents, redirectsLeft - 1, next)
          .then(r => resolve({ ...r, ms: Date.now() - t0 }));
        return;
      }

      /* The body is counted, not kept: a load run can pull gigabytes and the
         only thing the panel shows is how many bytes came back. */
      let bytes = 0;
      res.on('data', (c: Buffer) => { bytes += c.length; });
      res.on('end', () => resolve({ status, ms: Date.now() - t0, bytes }));
      res.on('error', (e) => resolve({ status: 0, ms: Date.now() - t0, bytes, error: e.message }));
    });

    req.on('timeout', () => { req.destroy(); resolve({ status: 0, ms: Date.now() - t0, bytes: 0, error: 'Timeout' }); });
    req.on('error', (e) => resolve({ status: 0, ms: Date.now() - t0, bytes: 0, error: e.message }));

    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

// ── Runner ───────────────────────────────────────────────────────────────────

const running = new Map<number, { stop: boolean }>();

export function handleLoadStop(msg: Record<string, unknown>): void {
  const runId = msg.runId as number;
  const state = running.get(runId);
  if (state) state.stop = true;
}

function clampConfig(raw: Partial<LoadConfig>): LoadConfig {
  const n = (v: unknown, dflt: number, max: number) => {
    const num = Number(v);
    return Number.isFinite(num) && num > 0 ? Math.min(num, max) : dflt;
  };
  const stages = (raw.stages ?? []).slice(0, 20).map(s => ({
    target: n(s.target, 1, LIMITS.vus),
    seconds: n(s.seconds, 1, LIMITS.durationSeconds),
  }));

  return {
    runId: Number(raw.runId ?? 0),
    url: String(raw.url ?? ''),
    method: String(raw.method ?? 'GET'),
    headers: raw.headers ?? [],
    authType: String(raw.authType ?? 'none'),
    authData: raw.authData ?? {},
    body: String(raw.body ?? ''),
    contentType: String(raw.contentType ?? 'application/json'),

    profile: (raw.profile ?? 'constant-vus') as LoadProfile,
    vus: n(raw.vus, 10, LIMITS.vus),
    totalRequests: Math.min(Number(raw.totalRequests ?? 0) || 0, LIMITS.totalRequests),
    durationSeconds: n(raw.durationSeconds, 30, LIMITS.durationSeconds),
    stages,
    targetRps: n(raw.targetRps, 50, 100_000),
    maxVus: n(raw.maxVus, LIMITS.vus, LIMITS.vus),

    warmupSeconds: Math.min(Number(raw.warmupSeconds ?? 0) || 0, 300),
    thinkTimeMinMs: Math.min(Number(raw.thinkTimeMinMs ?? 0) || 0, 60_000),
    thinkTimeMaxMs: Math.min(Number(raw.thinkTimeMaxMs ?? 0) || 0, 60_000),

    timeoutMs: n(raw.timeoutMs, 10_000, LIMITS.timeoutMs),
    followRedirects: raw.followRedirects !== false,
    keepAlive: raw.keepAlive !== false,
    gzip: raw.gzip !== false,
    insecureTls: raw.insecureTls === true,

    thresholds: raw.thresholds ?? {},
    abortOnThresholdBreach: raw.abortOnThresholdBreach === true,
  };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function handleLoadStart(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const cfg = clampConfig(msg as Partial<LoadConfig>);
  const { runId } = cfg;

  if (!cfg.url.trim()) {
    postMessage({ type: 'load:error', runId, message: 'Enter a URL to test.' });
    return;
  }
  try { new URL(cfg.url); } catch {
    postMessage({ type: 'load:error', runId, message: `"${cfg.url}" is not a URL this can request.` });
    return;
  }

  const state = { stop: false };
  running.set(runId, state);

  const headers = buildHeaders(cfg);
  const agents = {
    http: new http.Agent({ keepAlive: cfg.keepAlive, maxSockets: Infinity }),
    https: new https.Agent({ keepAlive: cfg.keepAlive, maxSockets: Infinity }),
  };

  const latencies: number[] = [];
  const statusCodes: Record<string, number> = {};
  const errorMessages = new Map<string, number>();
  let count = 0, errors = 0, bytes = 0, seen = 0;
  let warming = cfg.warmupSeconds > 0;

  /* Once the kept-sample cap is reached we keep a uniform random subset, so
     the percentiles stay honest on a long run instead of describing only its
     first two hundred thousand requests. */
  const record = (a: Attempt) => {
    if (warming) return;
    seen++;
    count++;
    bytes += a.bytes;
    const key = a.error ? a.error : String(a.status);
    statusCodes[key] = (statusCodes[key] ?? 0) + 1;
    if (a.error || a.status === 0 || a.status >= 400) {
      errors++;
      if (a.error) errorMessages.set(a.error, (errorMessages.get(a.error) ?? 0) + 1);
    }
    if (latencies.length < LIMITS.keptSamples) latencies.push(a.ms);
    else {
      const idx = Math.floor(Math.random() * seen);
      if (idx < LIMITS.keptSamples) latencies[idx] = a.ms;
    }
  };

  const isOpen = cfg.profile === 'constant-rate' || cfg.profile === 'ramping-rate';
  const isRamping = cfg.profile === 'ramping-vus' || cfg.profile === 'ramping-rate';
  const plannedSeconds = isRamping && cfg.stages.length > 0
    ? stagesDuration(cfg.stages)
    : cfg.durationSeconds;

  const think = async () => {
    const { thinkTimeMinMs: lo, thinkTimeMaxMs: hi } = cfg;
    if (hi <= 0 && lo <= 0) return;
    await sleep(lo + Math.random() * Math.max(0, hi - lo));
  };

  const started = Date.now();
  let measuringFrom = started + cfg.warmupSeconds * 1000;
  let inFlight = 0;
  let breached: ThresholdResult[] = [];

  const done = () => state.stop
    || (cfg.totalRequests > 0 && count + inFlight >= cfg.totalRequests)
    || (cfg.totalRequests === 0 && Date.now() - started >= (cfg.warmupSeconds + plannedSeconds) * 1000);

  const fire = async () => {
    inFlight++;
    const a = await once(cfg, headers, agents, 5, cfg.url);
    inFlight--;
    record(a);
  };

  // The reporting tick, independent of the load itself.
  const buckets: { t: number; rps: number; p95: number; errPct: number }[] = [];
  let lastTickCount = 0, lastTickErrors = 0, lastTickAt = Date.now();
  const ticker = setInterval(() => {
    if (warming && Date.now() >= measuringFrom) warming = false;
    const now = Date.now();
    const windowMs = now - lastTickAt;
    const windowCount = count - lastTickCount;
    const windowErrors = errors - lastTickErrors;
    lastTickAt = now; lastTickCount = count; lastTickErrors = errors;

    const elapsed = Math.max(1, now - Math.max(started, measuringFrom));
    const summary = summarise(latencies, errors, statusCodes, bytes, elapsed, count);
    const bucket = {
      t: Math.round((now - started) / 100) / 10,
      rps: windowMs === 0 ? 0 : Math.round((windowCount / (windowMs / 1000)) * 10) / 10,
      p95: summary.p95,
      errPct: windowCount === 0 ? 0 : Math.round((windowErrors / windowCount) * 1000) / 10,
    };
    buckets.push(bucket);

    breached = evaluateThresholds(summary, cfg.thresholds).filter(t => !t.passed);
    if (cfg.abortOnThresholdBreach && breached.length > 0 && count > 20) state.stop = true;

    postMessage({
      type: 'load:progress',
      runId,
      warming,
      elapsedMs: now - started,
      plannedMs: (cfg.warmupSeconds + plannedSeconds) * 1000,
      progressPct: cfg.totalRequests > 0
        ? Math.min(100, Math.round((count / cfg.totalRequests) * 100))
        : Math.min(100, Math.round(((now - started) / ((cfg.warmupSeconds + plannedSeconds) * 1000)) * 100)),
      inFlight,
      summary,
      bucket,
      thresholds: evaluateThresholds(summary, cfg.thresholds),
    });
  }, TICK_MS);

  try {
    if (isOpen) {
      /* Open model: arrivals on a schedule, borrowing VUs up to the cap. A
         server that slows down does not slow the arrivals — that is the point,
         and it is why this is the profile that finds a breaking point. */
      while (!done()) {
        const elapsed = (Date.now() - started) / 1000 - cfg.warmupSeconds;
        const rate = cfg.profile === 'ramping-rate' && cfg.stages.length > 0
          ? targetAt(Math.max(0, elapsed), cfg.stages)
          : cfg.targetRps;
        const perTick = Math.max(0, (rate * TICK_MS) / 1000);

        for (let i = 0; i < perTick && !done(); i++) {
          if (inFlight >= cfg.maxVus) break;
          void fire();
        }
        await sleep(TICK_MS);
      }
    } else {
      /* Closed model: each virtual user loops. Ramping adds and retires users
         as the stage target moves. */
      const workers: Promise<void>[] = [];
      let active = 0;

      const worker = async (id: number) => {
        while (!done()) {
          if (isRamping) {
            const elapsed = (Date.now() - started) / 1000 - cfg.warmupSeconds;
            const want = Math.round(targetAt(Math.max(0, elapsed), cfg.stages));
            // A user above the current target parks until the ramp reaches it.
            if (id >= Math.max(1, want)) { await sleep(200); continue; }
          }
          await fire();
          await think();
        }
      };

      const ceiling = isRamping
        ? Math.max(1, Math.min(cfg.maxVus, Math.max(...cfg.stages.map(s => s.target), 1)))
        : cfg.vus;

      for (let i = 0; i < ceiling; i++) { workers.push(worker(i)); active++; }
      void active;
      await Promise.all(workers);
    }

    // Let the last requests land rather than reporting them as never returned.
    const drainUntil = Date.now() + cfg.timeoutMs;
    while (inFlight > 0 && Date.now() < drainUntil) await sleep(50);
  } finally {
    clearInterval(ticker);
    running.delete(runId);
    agents.http.destroy();
    agents.https.destroy();
  }

  const elapsed = Math.max(1, Date.now() - Math.max(started, measuringFrom));
  const summary = summarise(latencies, errors, statusCodes, bytes, elapsed, count);
  postMessage({
    type: 'load:done',
    runId,
    stopped: state.stop,
    summary,
    buckets,
    thresholds: evaluateThresholds(summary, cfg.thresholds),
    topErrors: [...errorMessages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([message, n]) => ({ message, count: n })),
  });
}
