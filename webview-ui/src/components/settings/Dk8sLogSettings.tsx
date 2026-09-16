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
} from '../../components/k8s/log-settings';
import { LayersIcon, SearchIcon, ClockIcon } from '../../icons';
import { useK8sStore } from '../../store/k8s-store';
import { LogFormatSettings } from './LogFormatSettings';
import { PvLogSettings } from './PvLogSettings';
import { PvPodCheck } from './PvPodCheck';

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

export function Dk8sLogSettings() {
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
          Logs
        </h2>
        <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)', maxWidth: '110ch' }}>
          Every &ldquo;how many lines&rdquo; dropdown in dk8s offers the numbers set here.
          Separate them with commas; they are sorted for you, and anything that is not a
          number of lines is dropped. Nothing above {MAX_LINES.toLocaleString()} &mdash; one
          fetch still has to be something a panel can hold.
        </p>
      </div>

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

      <LogFormatSettings />
      <PvLogSettings />
      <PvPodCheck />
    </div>
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