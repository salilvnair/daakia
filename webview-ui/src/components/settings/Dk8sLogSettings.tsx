/**
 * Settings → DK8S → Logs.
 *
 * Every "how many lines" dropdown in dk8s reads its rungs from here. The page
 * is three lists and two defaults, and the reason it exists rather than a
 * constant in each component is on `log-settings.ts`: no ladder written by
 * somebody who has not seen your logs is right for them.
 *
 * Each box shows what the control will actually offer, resolved the same way
 * the control resolves it — so a list that was typed wrong says so here,
 * rather than in a dropdown somewhere else three days later.
 */
import { useEffect, useState } from 'react';
import { useUiStateStore } from '../../store/ui-state-store';
import {
  LOG_TAIL_LADDER_KEY, LOG_TAIL_DEFAULT_KEY,
  LOG_CONTEXT_LADDER_KEY, LOG_CONTEXT_DEFAULT_KEY, LOG_ARCHIVE_LADDER_KEY,
  DEFAULT_TAIL_LADDER, DEFAULT_CONTEXT_LADDER, DEFAULT_ARCHIVE_LADDER,
  DEFAULT_TAIL, DEFAULT_CONTEXT, MAX_LINES,
  ladder, ladderText, defaultOf, contextLabel, tailLabel,
  LOG_DOWNLOAD_MAX_KEY, DEFAULT_DOWNLOAD_MAX_MB, downloadMaxMb,
} from '../../components/k8s/log-settings';
import { TextInputView } from '@salilvnair/dui';
import { LayersIcon, SearchIcon, ClockIcon } from '../../icons';
import { useK8sStore } from '../../store/k8s-store';
import { LogFormatSettings } from './LogFormatSettings';
import { LogPayloadSettings } from './LogPayloadSettings';
import { PvLogSettings } from './PvLogSettings';
import { PvPodCheck } from './PvPodCheck';
import { ConfirmDialog } from '../shared/modals/ConfirmDialog';
import { ASK_LINE_CAP, ASK_SEND_MORE_PREF } from '../../components/k8s/ask-cap';
import { MAX_SCOPE_LINES } from '../../components/k8s/ask-scope';

const ACCENT = 'var(--color-dk8s)';

const cardStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-surface-border)',
  maxWidth: '100%',
};

function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
    </div>
  );
}

/** One ladder, with the rungs it resolves to shown underneath as chips. */
function Ladder({
  icon, title, body, storageKey, fallback, label,
  defaultKey, defaultFallback,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  storageKey: string;
  fallback: readonly number[];
  label: (n: number) => string;
  /** When given, a second control picks which rung the dropdown starts on. */
  defaultKey?: string;
  defaultFallback?: number;
}) {
  const prefs = useUiStateStore(s => s.prefs);
  const setPref = useUiStateStore(s => s.setPref);

  const stored = prefs[storageKey] ?? '';
  const [text, setText] = useState(stored);
  useEffect(() => { setText(stored); }, [stored]);

  const rungs = ladder(text, fallback);
  const usingFallback = ladder(text, fallback).join() === [...fallback].join() && text.trim() !== ladderText(fallback);
  const current = defaultKey !== undefined
    ? defaultOf(prefs[defaultKey], rungs, defaultFallback ?? rungs[0])
    : undefined;

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 rounded-lg" style={cardStyle}>
      <div className="flex items-start gap-3">
        <span style={{ color: ACCENT, marginTop: 2, flexShrink: 0, display: 'inline-flex' }}>{icon}</span>
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            {title}
          </span>
          <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {body}
          </span>
        </div>
      </div>

      <input
        value={text}
        spellCheck={false}
        onChange={e => { setText(e.target.value); setPref(storageKey, e.target.value); }}
        placeholder={ladderText(fallback)}
        className="text-[11.5px] px-2.5 py-1.5 rounded-md w-full tabular-nums"
        style={{
          fontFamily: 'var(--font-mono, monospace)',
          background: 'var(--color-panel)',
          border: '1px solid var(--color-surface-border)',
          color: 'var(--color-text-primary)',
          outlineColor: ACCENT,
        }}
      />

      {/* What the dropdown will actually show. A list typed wrong is caught
          here rather than in a control somewhere else three days later. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {defaultKey !== undefined
            ? 'The dropdown will offer these. Click one to make it the starting choice.'
            : 'The dropdown will offer these.'}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {rungs.map(v => {
            const on = v === current;
            const clickable = defaultKey !== undefined;
            return (
              <button
                key={v}
                type="button"
                disabled={!clickable}
                onClick={() => defaultKey && setPref(defaultKey, String(v))}
                className="text-[11px] px-2 py-0.5 rounded-full tabular-nums"
                style={{
                  cursor: clickable ? 'pointer' : 'default',
                  color: on ? ACCENT : 'var(--color-text-muted)',
                  background: on ? `color-mix(in srgb, ${ACCENT} 13%, transparent)` : 'transparent',
                  border: `1px solid ${on
                    ? `color-mix(in srgb, ${ACCENT} 32%, transparent)`
                    : 'var(--color-surface-border)'}`,
                }}
              >
                {label(v)}
              </button>
            );
          })}
        </div>
        {usingFallback && text.trim() !== '' && (
          <span className="text-[10.5px]" style={{ color: 'var(--color-warning)' }}>
            Nothing in that is a usable number of lines, so the built-in list is being used.
          </span>
        )}
      </div>
    </div>
  );
}

/** The Logs pages this file draws — Fields and Determinants have their own. */
export type LogSettingsPage = 'general' | 'downloads' | 'formats' | 'archive';

const PAGE_HEAD: Record<LogSettingsPage, { title: string; body: React.ReactNode }> = {
  general: {
    title: 'Logs',
    body: <>
      Every &ldquo;how many lines&rdquo; dropdown in dk8s offers the numbers set here.
      Separate them with commas; they are sorted for you, and anything that is not a
      number of lines is dropped. Nothing above {MAX_LINES.toLocaleString()} &mdash; one
      fetch still has to be something a panel can hold.
    </>,
  },
  downloads: {
    title: 'Downloads',
    body: <>A pod&rsquo;s whole log, downloaded to a temporary file and opened in a tab &mdash; how big one may get.</>,
  },
  formats: {
    title: 'Log formats',
    body: <>How a line is split into its time, level, logger, thread and message &mdash; the built-in formats, and your own.</>,
  },
  archive: {
    title: 'Archive',
    body: <>Where a pod&rsquo;s older, rotated logs live on a volume, so a search and a download can read past what the container still has.</>,
  },
};

export function Dk8sLogSettings({ page = 'general' }: { page?: LogSettingsPage }) {
  const logLineNumbers = useK8sStore(s => s.logLineNumbers);
  const setLogLineNumbers = useK8sStore(s => s.setLogLineNumbers);
  const apply = useK8sStore(s => s.apply);

  /* Settings can be opened without dk8s ever having been, so this page hears
     the host itself rather than relying on K8sPanel being mounted — otherwise
     the checkbox shows its default instead of the stored value. */
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      if (msg?.type === 'dk8s:logLineNumbers') apply(msg);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [apply]);

  return (
    <div className="flex flex-col gap-6 px-5 py-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[15px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          {PAGE_HEAD[page].title}
        </h2>
        <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)', maxWidth: '110ch' }}>
          {PAGE_HEAD[page].body}
        </p>
      </div>

      {page === 'downloads' && <DownloadLimit />}
      {page === 'formats' && <LogFormatSettings />}
      {page === 'archive' && <><PvLogSettings /><PvPodCheck /></>}

      {page === 'general' && <>
      <div className="flex flex-col gap-3">
        <SectionRule label="the log view" />
        <Ladder
          icon={<LayersIcon size={15} />}
          title="How many lines a fetch asks for"
          body={<>
            The Logs tab&rsquo;s own line count, beside <em>last</em> / <em>first</em> / <em>between</em>.
            Raise it for a service that writes a lot per request; lower it if the first screen
            takes longer to arrive than you want to wait.
          </>}
          storageKey={LOG_TAIL_LADDER_KEY}
          fallback={DEFAULT_TAIL_LADDER}
          label={tailLabel}
          defaultKey={LOG_TAIL_DEFAULT_KEY}
          defaultFallback={DEFAULT_TAIL}
        />
      </div>

      <div className="flex flex-col gap-3">
        <SectionRule label="searching" />
        <Ladder
          icon={<SearchIcon size={15} />}
          title="How much of a hit&rsquo;s surroundings to show"
          body={<>
            When you find a logger, what you usually want next is the lines either side of it &mdash;
            what happened just before, and what it did after. This is how far either side a match
            carries with it, in Quick Search and in the Logs tab&rsquo;s own find.
          </>}
          storageKey={LOG_CONTEXT_LADDER_KEY}
          fallback={DEFAULT_CONTEXT_LADDER}
          label={contextLabel}
          defaultKey={LOG_CONTEXT_DEFAULT_KEY}
          defaultFallback={DEFAULT_CONTEXT}
        />

        <Ladder
          icon={<ClockIcon size={15} />}
          title="How far back a search reads"
          body={<>
            How many lines of each pod&rsquo;s log a search pulls before it starts matching. This is
            the one that costs the cluster: a hundred thousand lines across a dozen pods is a
            real read, so it is a choice rather than a default.
          </>}
          storageKey={LOG_ARCHIVE_LADDER_KEY}
          fallback={DEFAULT_ARCHIVE_LADDER}
          label={(n) => `last ${n.toLocaleString()}`}
        />
      </div>

      {/*
        The three that used to sit on Cluster. They are not about how dk8s
        behaves against a cluster — they are about how it reads what a pod
        wrote, which is this page.
      */}
      <div className="flex flex-col gap-3">
        <SectionRule label="the log view" />
        <Toggle
          on={logLineNumbers}
          onChange={setLogLineNumbers}
          label="Show line numbers"
          description={
            'A numbered gutter down the left of a pod’s log, like an editor. On by default — '
            + 'turn it off on a narrow panel, where the width a long line needs matters more.'
          }
        />
      </div>

      <LogPayloadSettings />

      <div className="flex flex-col gap-3">
        <SectionRule label="ask the log" />
        <SendMoreToAi />
      </div>
      </>}
    </div>
  );
}

/**
 * Ask the log sends at most 2,000 lines of a scope — grepped for what the
 * question names, then the newest. This lifts that to what one fetch holds,
 * and asks first: it is the reader's AI credits being spent.
 */
function SendMoreToAi() {
  const on = useUiStateStore(s => s.prefs[ASK_SEND_MORE_PREF] === 'on');
  const setPref = useUiStateStore(s => s.setPref);
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Toggle
        on={on}
        onChange={v => { if (v) setConfirming(true); else setPref(ASK_SEND_MORE_PREF, 'off'); }}
        label={`Let Ask the log send more than ${ASK_LINE_CAP.toLocaleString()} lines`}
        description={
          `A question over a long stretch — “since yesterday” on a busy pod — is tens of thousands of lines. `
          + `Off, Ask the log sends the ${ASK_LINE_CAP.toLocaleString()} newest of the lines that mention what the question names, `
          + `and says so above the answer. On, it sends up to ${MAX_SCOPE_LINES.toLocaleString()}: fuller answers, and many more AI tokens.`
        }
      />
      {confirming && (
        <ConfirmDialog
          title={`Send more than ${ASK_LINE_CAP.toLocaleString()} lines to the AI?`}
          message={`Every line sent is paid for in AI tokens. A question over a long window can send up to `
            + `${MAX_SCOPE_LINES.toLocaleString()} lines — many times the usual cost of one answer, and it can use up `
            + 'your AI credits or rate limit quickly. You can turn it off here at any time.'}
          confirmLabel="Turn it on"
          danger
          onConfirm={() => { setPref(ASK_SEND_MORE_PREF, 'on'); setConfirming(false); }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}

/** The same switch the Cluster page had, moved with its section. */
function Toggle({ on, onChange, label, description }: {
  on: boolean; onChange: (v: boolean) => void; label: string; description: string;
}) {
  return (
    <label className="flex items-start gap-3 px-4 py-3.5 rounded-lg cursor-pointer" style={cardStyle}>
      <input
        type="checkbox"
        checked={on}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: ACCENT, marginTop: 2, width: 15, height: 15 }}
      />
      <span className="flex flex-col gap-1.5 flex-1 min-w-0">
        <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{label}</span>
        <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {description}
        </span>
      </span>
    </label>
  );
}

/**
 * How big a downloaded pod log may get — "Open logs" on a search result.
 *
 * A download is a temporary file, deleted when its tab closes; this only
 * bounds how much disk one can take while it is open. Stored as text like the
 * ladders above, and resolved the same way the download resolves it, so what
 * this says is what the next download will use.
 */
function DownloadLimit() {
  const stored = useUiStateStore(s => s.prefs[LOG_DOWNLOAD_MAX_KEY]) ?? '';
  const setPref = useUiStateStore(s => s.setPref);
  const [text, setText] = useState(stored);
  useEffect(() => { setText(stored); }, [stored]);
  const resolved = downloadMaxMb(text);
  const shown = resolved >= 1024 ? `${(resolved / 1024).toFixed(resolved % 1024 ? 2 : 0)} GB` : `${resolved} MB`;
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 rounded-lg" style={cardStyle}>
      <div className="flex items-start gap-3">
        <span style={{ color: ACCENT, marginTop: 2, flexShrink: 0, display: 'inline-flex' }}><ClockIcon size={15} /></span>
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            The most one downloaded log may take
          </span>
          <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            <em>Open logs</em> on a search result downloads the pod&rsquo;s whole log &mdash; live, and its archived files
            where an archive path covers it &mdash; into <code>~/.salilvnair/daakia-vsce/temp/logs</code>, and opens it
            in a tab. The file is deleted when you close that tab, or when Daakia closes. This caps how big one download
            may grow; when it is reached the tab says what was left out.
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <TextInputView
          size="sm"
          width="sm"
          inputMode="numeric"
          value={text}
          placeholder={String(DEFAULT_DOWNLOAD_MAX_MB)}
          aria-label="Maximum size of a downloaded log, in MB"
          suffixIcon={<span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>MB</span>}
          accentColor={ACCENT}
          onChange={e => { setText(e.target.value); setPref(LOG_DOWNLOAD_MAX_KEY, e.target.value); }}
        />
        <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {text.trim() && downloadMaxMb(text) === DEFAULT_DOWNLOAD_MAX_MB && Number(text) !== DEFAULT_DOWNLOAD_MAX_MB
            ? `Not a size — using the default, ${shown}.`
            : `Downloads stop at ${shown}.`}
        </span>
      </div>
    </div>
  );
}
