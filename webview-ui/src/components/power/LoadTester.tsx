/**
 * Load Tester — real traffic, measured.
 *
 * ── What this replaces ──
 *
 * The previous panel sent no requests. It ran `setTimeout(80 + Math.random() *
 * 400)` for the latency and `Math.random() > 0.05 ? 200 : 500` for the status,
 * then reported those as the endpoint's p50/p95/p99. The run now happens on
 * the extension host (`load-handler.ts`), one socket per virtual user, and
 * every number on this screen is something that was measured.
 *
 * ── The two load models ──
 *
 * Closed (VUs) holds a fixed number of concurrent clients: a server that slows
 * down receives less load, which is what you want when modelling N users.
 * Open (arrival rate) schedules arrivals whether or not the server is keeping
 * up, which is what finds a breaking point. Both come in a flat and a ramping
 * form, which is the shape every load tool has converged on.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { postMsg } from '../../vscode';
import { ModalView, ButtonView, TextInputView, MultilineInputView } from '@salilvnair/dui';
import { logUiEvent } from '../../store/ui-audit-store';
import { ChevronRightIcon, PlayIcon } from '../../icons';

// ── Shapes shared with the host ──────────────────────────────────────────────

type Profile = 'constant-vus' | 'ramping-vus' | 'constant-rate' | 'ramping-rate';

interface Stage { target: number; seconds: number }

interface Summary {
  count: number; errors: number; errorRatePct: number; rps: number;
  min: number; max: number; avg: number;
  p50: number; p90: number; p95: number; p99: number;
  statusCodes: Record<string, number>; bytes: number; elapsedMs: number;
}

interface Bucket { t: number; rps: number; p95: number; errPct: number }
interface Threshold { name: string; target: number; actual: number; passed: boolean }

const ACCENT = 'var(--color-settings)';
const OK = 'var(--color-success)';
const BAD = 'var(--color-error)';
const WARN = 'var(--color-warning)';

const PROFILES: { id: Profile; label: string; blurb: string; shape: number[] }[] = [
  { id: 'constant-vus',  label: 'Constant users', blurb: 'N clients, looping',        shape: [6, 6, 6, 6, 6, 6] },
  { id: 'ramping-vus',   label: 'Ramping users',  blurb: 'Grow, hold, wind down',     shape: [0, 3, 6, 6, 3, 0] },
  { id: 'constant-rate', label: 'Constant rate',  blurb: 'Fixed requests/second',     shape: [6, 6, 6, 6, 6, 6] },
  { id: 'ramping-rate',  label: 'Ramping rate',   blurb: 'Climb until it breaks',     shape: [0, 1, 2, 3, 4, 6] },
];

const isOpenModel = (p: Profile) => p === 'constant-rate' || p === 'ramping-rate';
const isRamping = (p: Profile) => p === 'ramping-vus' || p === 'ramping-rate';

// ── Small pieces ─────────────────────────────────────────────────────────────

/** The profile card's shape, drawn rather than described. */
function ShapeGlyph({ shape, color }: { shape: number[]; color: string }) {
  const pts = shape.map((v, i) => `${(i / (shape.length - 1)) * 46 + 2},${16 - v * 2}`).join(' ');
  return (
    <svg viewBox="0 0 50 18" width="50" height="18" aria-hidden="true" style={{ flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.04em', color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      {children}
      {hint && <span style={{ fontSize: 9.5, color: 'var(--color-text-muted)' }}>{hint}</span>}
    </label>
  );
}

function NumberField({ label, hint, value, onChange, min = 0, suffix }: {
  label: string; hint?: string; value: number; onChange: (n: number) => void; min?: number; suffix?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div style={{ position: 'relative' }}>
        <TextInputView
          size="sm"
          type="number"
          value={String(value)}
          min={min}
          onChange={e => onChange(Math.max(min, Number((e.target as HTMLInputElement).value) || 0))}
          accentColor={ACCENT}
          style={{ width: '100%' }}
        />
        {suffix && (
          <span style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            fontSize: 10, color: 'var(--color-text-muted)', pointerEvents: 'none',
          }}>{suffix}</span>
        )}
      </div>
    </Field>
  );
}

function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
        padding: '3px 0', cursor: 'pointer', color: 'inherit', textAlign: 'left',
      }}
    >
      <span style={{
        width: 30, height: 17, borderRadius: 999, flexShrink: 0, position: 'relative',
        background: on ? ACCENT : 'color-mix(in srgb, var(--color-text-primary) 14%, transparent)',
        transition: 'background .18s',
      }}>
        <span style={{
          position: 'absolute', top: 2.5, left: on ? 15 : 2.5, width: 12, height: 12,
          borderRadius: 999, background: '#fff', transition: 'left .18s',
        }} />
      </span>
      <span style={{ fontSize: 11, color: on ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{label}</span>
    </button>
  );
}

function Section({ title, children, defaultOpen = true, right }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; right?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: '1px solid color-mix(in srgb, var(--color-text-primary) 7%, transparent)', paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: open ? 10 : 0 }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <ChevronRightIcon
            size={11}
            style={{ color: ACCENT, opacity: .8, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .18s' }}
          />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
            {title}
          </span>
        </button>
        <div style={{ flex: 1 }} />
        {right}
      </div>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>}
    </div>
  );
}

/** One measured number, large enough to read across the room. */
function Stat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: string }) {
  return (
    <div style={{
      flex: '1 1 0', minWidth: 0, padding: '10px 12px', borderRadius: 10,
      background: 'color-mix(in srgb, var(--color-text-primary) 3%, transparent)',
      border: '1px solid color-mix(in srgb, var(--color-text-primary) 7%, transparent)',
    }}>
      <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 3 }}>
        <span style={{ fontSize: 21, fontWeight: 650, fontVariantNumeric: 'tabular-nums', color: tone ?? 'var(--color-text-primary)', lineHeight: 1.1 }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{unit}</span>}
      </div>
    </div>
  );
}

/**
 * Throughput over time with the p95 laid over it.
 *
 * Two scales on one drawing: bars for requests/second on the left, a line for
 * p95 latency on the right. They are the two numbers you watch together —
 * throughput climbing while latency stays flat is headroom, and the moment
 * they cross is the answer the test was run for.
 */
function LoadChart({ buckets }: { buckets: Bucket[] }) {
  const W = 520, H = 150, PAD_L = 34, PAD_R = 34, PAD_T = 10, PAD_B = 20;
  if (buckets.length < 2) {
    return (
      <div style={{
        height: H, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, color: 'var(--color-text-muted)',
        border: '1px dashed color-mix(in srgb, var(--color-text-primary) 10%, transparent)',
        borderRadius: 10,
      }}>
        Throughput and latency appear here once the run starts
      </div>
    );
  }

  const maxRps = Math.max(...buckets.map(b => b.rps), 1);
  const maxP95 = Math.max(...buckets.map(b => b.p95), 1);
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const x = (i: number) => PAD_L + (i / Math.max(1, buckets.length - 1)) * innerW;
  const yRps = (v: number) => PAD_T + innerH - (v / maxRps) * innerH;
  const yP95 = (v: number) => PAD_T + innerH - (v / maxP95) * innerH;

  const area = `M ${x(0)},${PAD_T + innerH} `
    + buckets.map((b, i) => `L ${x(i)},${yRps(b.rps)}`).join(' ')
    + ` L ${x(buckets.length - 1)},${PAD_T + innerH} Z`;
  const line = buckets.map((b, i) => `${i === 0 ? 'M' : 'L'} ${x(i)},${yP95(b.p95)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
      aria-label={`Throughput peaked at ${maxRps} requests per second; p95 latency peaked at ${maxP95} milliseconds`}>
      <defs>
        <linearGradient id="lt-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.38" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {[0, 0.5, 1].map(f => (
        <line key={f} x1={PAD_L} x2={W - PAD_R} y1={PAD_T + innerH * f} y2={PAD_T + innerH * f}
          stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
      ))}

      <path d={area} fill="url(#lt-fill)" />
      <path d={buckets.map((b, i) => `${i === 0 ? 'M' : 'L'} ${x(i)},${yRps(b.rps)}`).join(' ')}
        fill="none" stroke={ACCENT} strokeWidth="1.6" strokeLinejoin="round" />
      <path d={line} fill="none" stroke={WARN} strokeWidth="1.4" strokeDasharray="3 3" strokeLinejoin="round" />

      <text x={PAD_L - 5} y={PAD_T + 8} textAnchor="end" fontSize="9" fill={ACCENT}>{Math.round(maxRps)}</text>
      <text x={PAD_L - 5} y={PAD_T + innerH} textAnchor="end" fontSize="9" fill="currentColor" fillOpacity=".45">0</text>
      <text x={W - PAD_R + 5} y={PAD_T + 8} fontSize="9" fill={WARN}>{Math.round(maxP95)}ms</text>
      <text x={W - PAD_R} y={H - 5} textAnchor="end" fontSize="9" fill="currentColor" fillOpacity=".45">
        {buckets[buckets.length - 1].t.toFixed(0)}s
      </text>
      <text x={PAD_L} y={H - 5} fontSize="9" fill="currentColor" fillOpacity=".45">0s</text>
    </svg>
  );
}

/** Status codes as one bar, because their proportions are the story. */
function StatusBar({ codes }: { codes: Record<string, number> }) {
  const entries = Object.entries(codes).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((a, [, n]) => a + n, 0);
  if (total === 0) return null;

  const colorFor = (code: string) => {
    const n = Number(code);
    if (!Number.isFinite(n) || n === 0) return BAD;
    if (n < 300) return OK;
    if (n < 400) return 'var(--color-info, #38bdf8)';
    if (n < 500) return WARN;
    return BAD;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden' }}>
        {entries.map(([code, n]) => (
          <div key={code} title={`${code} — ${n}`} style={{ width: `${(n / total) * 100}%`, background: colorFor(code) }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {entries.slice(0, 6).map(([code, n]) => (
          <span key={code} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--color-text-muted)' }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: colorFor(code) }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>{code}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ThresholdChips({ list }: { list: Threshold[] }) {
  if (list.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {list.map(t => (
        <span key={t.name} style={{
          fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 999,
          color: t.passed ? OK : BAD,
          background: `color-mix(in srgb, ${t.passed ? OK : BAD} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${t.passed ? OK : BAD} 28%, transparent)`,
        }}>
          {t.name} · {t.actual}
        </span>
      ))}
    </div>
  );
}

const fmtBytes = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(1)} kB` : `${(b / 1024 ** 2).toFixed(1)} MB`;

// ── Panel ────────────────────────────────────────────────────────────────────

interface Props {
  initialUrl?: string;
  initialMethod?: string;
  onClose: () => void;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];

export function LoadTester({ initialUrl = '', initialMethod = 'GET', onClose }: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [method, setMethod] = useState(initialMethod);
  const [profile, setProfile] = useState<Profile>('constant-vus');

  const [vus, setVus] = useState(10);
  const [durationSeconds, setDuration] = useState(30);
  const [totalRequests, setTotalRequests] = useState(0);
  const [targetRps, setTargetRps] = useState(50);
  const [maxVus, setMaxVus] = useState(200);
  const [stages, setStages] = useState<Stage[]>([
    { target: 50, seconds: 15 },
    { target: 50, seconds: 30 },
    { target: 0, seconds: 15 },
  ]);

  const [headers, setHeaders] = useState('');
  const [body, setBody] = useState('');

  const [warmupSeconds, setWarmup] = useState(0);
  const [thinkMin, setThinkMin] = useState(0);
  const [thinkMax, setThinkMax] = useState(0);
  const [timeoutMs, setTimeoutMs] = useState(10000);
  const [followRedirects, setFollowRedirects] = useState(true);
  const [keepAlive, setKeepAlive] = useState(true);
  const [gzip, setGzip] = useState(true);
  const [insecureTls, setInsecureTls] = useState(false);

  const [p95Ms, setP95Ms] = useState(0);
  const [p99Ms, setP99Ms] = useState(0);
  const [errorRatePct, setErrorRatePct] = useState(0);
  const [minRps, setMinRps] = useState(0);
  const [abortOnBreach, setAbortOnBreach] = useState(false);

  const [running, setRunning] = useState(false);
  const [warming, setWarming] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [inFlight, setInFlight] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [topErrors, setTopErrors] = useState<{ message: string; count: number }[]>([]);
  const [error, setError] = useState('');
  const [stopped, setStopped] = useState(false);

  const runIdRef = useRef(0);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      if (!msg || msg.runId !== runIdRef.current) return;

      if (msg.type === 'load:progress') {
        setWarming(Boolean(msg.warming));
        setProgressPct(Number(msg.progressPct) || 0);
        setInFlight(Number(msg.inFlight) || 0);
        setSummary(msg.summary as Summary);
        setThresholds((msg.thresholds as Threshold[]) ?? []);
        setBuckets(prev => [...prev, msg.bucket as Bucket].slice(-240));
      } else if (msg.type === 'load:done') {
        setRunning(false);
        setWarming(false);
        setProgressPct(100);
        setInFlight(0);
        setStopped(Boolean(msg.stopped));
        setSummary(msg.summary as Summary);
        setThresholds((msg.thresholds as Threshold[]) ?? []);
        setTopErrors((msg.topErrors as { message: string; count: number }[]) ?? []);
        if (Array.isArray(msg.buckets)) setBuckets(msg.buckets as Bucket[]);
      } else if (msg.type === 'load:error') {
        setRunning(false);
        setError(String(msg.message ?? 'The load test could not start.'));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const parsedHeaders = useMemo(
    () => headers.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const i = line.indexOf(':');
      return i < 0
        ? { key: line, value: '', enabled: true }
        : { key: line.slice(0, i).trim(), value: line.slice(i + 1).trim(), enabled: true };
    }),
    [headers],
  );

  const start = useCallback(() => {
    if (!url.trim()) return;
    const runId = Date.now();
    runIdRef.current = runId;

    setRunning(true);
    setStopped(false);
    setError('');
    setBuckets([]);
    setSummary(null);
    setTopErrors([]);
    setProgressPct(0);
    setWarming(warmupSeconds > 0);

    logUiEvent('settings.load_start', { url, profile, vus, targetRps, durationSeconds });

    postMsg({
      type: 'load:start',
      runId, url, method, body,
      headers: parsedHeaders,
      contentType: 'application/json',
      profile, vus, totalRequests, durationSeconds, stages, targetRps, maxVus,
      warmupSeconds, thinkTimeMinMs: thinkMin, thinkTimeMaxMs: thinkMax,
      timeoutMs, followRedirects, keepAlive, gzip, insecureTls,
      thresholds: {
        ...(p95Ms > 0 ? { p95Ms } : {}),
        ...(p99Ms > 0 ? { p99Ms } : {}),
        ...(errorRatePct > 0 ? { errorRatePct } : {}),
        ...(minRps > 0 ? { minRps } : {}),
      },
      abortOnThresholdBreach: abortOnBreach,
    });
  }, [url, method, body, parsedHeaders, profile, vus, totalRequests, durationSeconds, stages,
      targetRps, maxVus, warmupSeconds, thinkMin, thinkMax, timeoutMs, followRedirects,
      keepAlive, gzip, insecureTls, p95Ms, p99Ms, errorRatePct, minRps, abortOnBreach]);

  const stop = useCallback(() => {
    logUiEvent('settings.load_stop');
    postMsg({ type: 'load:stop', runId: runIdRef.current });
  }, []);

  const failing = thresholds.filter(t => !t.passed).length;
  const plannedSeconds = isRamping(profile)
    ? stages.reduce((a, s) => a + s.seconds, 0)
    : durationSeconds;

  return (
    <ModalView
      open
      onClose={onClose}
      size="xxl"
      title="Load Tester"
      subtitle={`Real requests from this machine — ${isOpenModel(profile) ? 'arrival rate' : 'virtual users'} model`}
      headerColor={ACCENT}
      headerGradient
      footerLeft={
        running ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 280 }}>
            <div style={{ flex: 1, height: 5, borderRadius: 999, background: 'color-mix(in srgb, var(--color-text-primary) 10%, transparent)', overflow: 'hidden' }}>
              <div style={{ width: `${progressPct}%`, height: '100%', background: ACCENT, transition: 'width .4s linear' }} />
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {warming ? 'warming up' : `${progressPct}%`} · {inFlight} in flight
            </span>
          </div>
        ) : summary ? (
          <span style={{ fontSize: 10.5, color: failing > 0 ? BAD : 'var(--color-text-muted)' }}>
            {stopped ? 'Stopped early' : 'Finished'} · {summary.count.toLocaleString()} requests in {(summary.elapsedMs / 1000).toFixed(1)}s
            {failing > 0 && ` · ${failing} threshold${failing > 1 ? 's' : ''} failed`}
          </span>
        ) : undefined
      }
      footerRight={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {running && (
            <ButtonView size="md" variant="secondary" accentColor={BAD} onClick={stop}>Stop</ButtonView>
          )}
          <ButtonView
            size="md"
            variant="primary"
            accentColor={ACCENT}
            disabled={running || !url.trim()}
            onClick={start}
            iconLeft={<PlayIcon size={12} />}
          >
            {running ? 'Running…' : 'Run load test'}
          </ButtonView>
        </div>
      }
    >
      <div style={{ display: 'flex', gap: 18, alignItems: 'stretch', minHeight: 460 }}>

        {/* ── Configuration ─────────────────────────────────────────────── */}
        <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', maxHeight: '62vh', paddingRight: 4 }}>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Field label="TARGET URL">
                <TextInputView
                  size="sm"
                  placeholder="https://api.example.com/endpoint"
                  value={url}
                  onChange={e => setUrl((e.target as HTMLInputElement).value)}
                  accentColor={ACCENT}
                  style={{ width: '100%' }}
                />
              </Field>
            </div>
          </div>

          <Field label="METHOD">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {METHODS.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '.03em', padding: '4px 9px', borderRadius: 6,
                    cursor: 'pointer',
                    color: method === m ? ACCENT : 'var(--color-text-muted)',
                    background: method === m ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : 'transparent',
                    border: `1px solid ${method === m ? `color-mix(in srgb, ${ACCENT} 40%, transparent)` : 'color-mix(in srgb, var(--color-text-primary) 10%, transparent)'}`,
                  }}
                >{m}</button>
              ))}
            </div>
          </Field>

          <Field label="LOAD PROFILE">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {PROFILES.map(p => {
                const on = profile === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProfile(p.id)}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 9px', borderRadius: 9,
                      cursor: 'pointer', textAlign: 'left',
                      background: on ? `color-mix(in srgb, ${ACCENT} 10%, transparent)` : 'color-mix(in srgb, var(--color-text-primary) 3%, transparent)',
                      border: `1px solid ${on ? `color-mix(in srgb, ${ACCENT} 45%, transparent)` : 'color-mix(in srgb, var(--color-text-primary) 8%, transparent)'}`,
                    }}
                  >
                    <ShapeGlyph shape={p.shape} color={on ? ACCENT : 'var(--color-text-muted)'} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                      {p.label}
                    </span>
                    <span style={{ fontSize: 9.5, color: 'var(--color-text-muted)', lineHeight: 1.3 }}>{p.blurb}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          <Section title="Load">
            {isRamping(profile) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 26px', gap: 6, fontSize: 9.5, color: 'var(--color-text-muted)', letterSpacing: '.05em' }}>
                  <span>{isOpenModel(profile) ? 'TO RATE (/s)' : 'TO USERS'}</span>
                  <span>OVER (s)</span>
                  <span />
                </div>
                {stages.map((s, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 26px', gap: 6, alignItems: 'center' }}>
                    <TextInputView size="sm" type="number" value={String(s.target)} accentColor={ACCENT}
                      onChange={e => setStages(st => st.map((x, j) => j === i ? { ...x, target: Number((e.target as HTMLInputElement).value) || 0 } : x))} />
                    <TextInputView size="sm" type="number" value={String(s.seconds)} accentColor={ACCENT}
                      onChange={e => setStages(st => st.map((x, j) => j === i ? { ...x, seconds: Number((e.target as HTMLInputElement).value) || 0 } : x))} />
                    <button
                      type="button"
                      onClick={() => setStages(st => st.filter((_, j) => j !== i))}
                      disabled={stages.length <= 1}
                      title="Remove stage"
                      style={{
                        height: 26, borderRadius: 6, cursor: stages.length <= 1 ? 'default' : 'pointer',
                        border: '1px solid color-mix(in srgb, var(--color-error) 22%, transparent)',
                        background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
                        color: BAD, fontSize: 13, lineHeight: 1, opacity: stages.length <= 1 ? .35 : 1,
                      }}
                    >×</button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setStages(st => [...st, { target: 0, seconds: 10 }])}
                  style={{
                    marginTop: 2, fontSize: 10.5, padding: '5px 0', borderRadius: 7, cursor: 'pointer',
                    color: ACCENT, background: 'transparent',
                    border: `1px dashed color-mix(in srgb, ${ACCENT} 35%, transparent)`,
                  }}
                >+ Add stage</button>
                <span style={{ fontSize: 9.5, color: 'var(--color-text-muted)' }}>
                  {plannedSeconds}s total{isOpenModel(profile) ? ` · borrows up to ${maxVus} users` : ''}
                </span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {isOpenModel(profile)
                  ? <NumberField label="TARGET RATE" suffix="/s" value={targetRps} onChange={setTargetRps} min={1} />
                  : <NumberField label="VIRTUAL USERS" value={vus} onChange={setVus} min={1} />}
                <NumberField label="DURATION" suffix="s" value={durationSeconds} onChange={setDuration} min={1} />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <NumberField
                label="STOP AFTER"
                suffix="reqs"
                hint="0 = run for the duration"
                value={totalRequests}
                onChange={setTotalRequests}
              />
              {isOpenModel(profile)
                ? <NumberField label="MAX USERS" hint="Concurrency ceiling" value={maxVus} onChange={setMaxVus} min={1} />
                : <NumberField label="WARM-UP" suffix="s" hint="Excluded from stats" value={warmupSeconds} onChange={setWarmup} />}
            </div>
          </Section>

          <Section title="Request" defaultOpen={false}>
            <Field label="HEADERS" hint="One per line — Name: value">
              <MultilineInputView
                rows={3}
                placeholder={'Authorization: Bearer token\nAccept: application/json'}
                value={headers}
                onChange={e => setHeaders((e.target as HTMLTextAreaElement).value)}
                accentColor={ACCENT}
                style={{ width: '100%' }}
              />
            </Field>
            <Field label="BODY">
              <MultilineInputView
                rows={3}
                placeholder='{ "id": 1 }'
                value={body}
                onChange={e => setBody((e.target as HTMLTextAreaElement).value)}
                accentColor={ACCENT}
                style={{ width: '100%' }}
              />
            </Field>
          </Section>

          <Section title="Behaviour" defaultOpen={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <NumberField label="THINK TIME MIN" suffix="ms" value={thinkMin} onChange={setThinkMin} />
              <NumberField label="THINK TIME MAX" suffix="ms" value={thinkMax} onChange={setThinkMax} />
            </div>
            <NumberField label="REQUEST TIMEOUT" suffix="ms" value={timeoutMs} onChange={setTimeoutMs} min={100} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Switch on={keepAlive} onToggle={() => setKeepAlive(v => !v)} label="Reuse connections (keep-alive)" />
              <Switch on={followRedirects} onToggle={() => setFollowRedirects(v => !v)} label="Follow redirects" />
              <Switch on={gzip} onToggle={() => setGzip(v => !v)} label="Accept compressed responses" />
              <Switch on={insecureTls} onToggle={() => setInsecureTls(v => !v)} label="Allow self-signed certificates" />
            </div>
          </Section>

          <Section title="Thresholds" defaultOpen={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <NumberField label="p95 UNDER" suffix="ms" hint="0 = no check" value={p95Ms} onChange={setP95Ms} />
              <NumberField label="p99 UNDER" suffix="ms" hint="0 = no check" value={p99Ms} onChange={setP99Ms} />
              <NumberField label="ERRORS UNDER" suffix="%" hint="0 = no check" value={errorRatePct} onChange={setErrorRatePct} />
              <NumberField label="RATE AT LEAST" suffix="/s" hint="0 = no check" value={minRps} onChange={setMinRps} />
            </div>
            <Switch on={abortOnBreach} onToggle={() => setAbortOnBreach(v => !v)} label="Stop the run when a threshold breaks" />
          </Section>
        </div>

        {/* ── Results ───────────────────────────────────────────────────── */}
        <div style={{
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12,
          borderLeft: '1px solid color-mix(in srgb, var(--color-text-primary) 8%, transparent)',
          paddingLeft: 18,
        }}>
          {error && (
            <div style={{
              padding: '8px 11px', borderRadius: 8, fontSize: 11, color: BAD,
              background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-error) 25%, transparent)',
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <Stat label="Throughput" value={summary ? String(summary.rps) : '—'} unit="req/s" tone={ACCENT} />
            <Stat label="p95" value={summary ? String(summary.p95) : '—'} unit="ms" />
            <Stat
              label="Errors"
              value={summary ? String(summary.errorRatePct) : '—'}
              unit="%"
              tone={summary && summary.errorRatePct > 0 ? BAD : undefined}
            />
            <Stat label="Requests" value={summary ? summary.count.toLocaleString() : '—'} />
          </div>

          <LoadChart buckets={buckets} />

          <ThresholdChips list={thresholds} />

          {summary && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(74px, 1fr))', gap: 8,
                fontSize: 10.5,
              }}>
                {([
                  ['min', `${summary.min}ms`], ['avg', `${summary.avg}ms`],
                  ['p50', `${summary.p50}ms`], ['p90', `${summary.p90}ms`],
                  ['p99', `${summary.p99}ms`], ['max', `${summary.max}ms`],
                  ['data', fmtBytes(summary.bytes)],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>{k}</span>
                    <span style={{ color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                  </div>
                ))}
              </div>

              <StatusBar codes={summary.statusCodes} />

              {topErrors.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                    Failures
                  </span>
                  {topErrors.map(e => (
                    <div key={e.message} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 10.5 }}>
                      <span style={{ color: BAD, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.message}</span>
                      <span style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{e.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!summary && !running && !error && (
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.6, marginTop: 4 }}>
              Every number here comes from a request this machine actually sent. Pick a profile,
              set a target, and run — the chart draws throughput against p95 latency so you can
              see the point where one stops tracking the other.
            </p>
          )}
        </div>
      </div>
    </ModalView>
  );
}
