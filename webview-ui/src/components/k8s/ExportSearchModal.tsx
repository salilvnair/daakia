/**
 * Put a search's hits on disk.
 *
 * Built to the measurements of ExportLogsModal — same Field, same `md`
 * controls, same footer — because it is the same act from the person's side
 * and two export dialogs that look different read as two different features.
 * What it writes is not the same thing, though: whole pod logs by time range
 * there, only the matched lines and their surroundings here.
 *
 * The context choice goes much larger than the search's own. On screen, ±5 is
 * about the limit of what you can read around a hit; in a file, ±1000 is how
 * you get the whole request that produced the error, and the cost is disk
 * rather than a dialog you cannot scroll.
 */
import { useState } from 'react';
import { ModalView, ButtonView, SegmentedControlView, CheckboxView } from '@salilvnair/dui';
import type { PodSummary } from '../../store/k8s-store';
import { useK8sStore } from '../../store/k8s-store';
import { useDk8sSearchStore } from '../../store/dk8s-search-store';
import { postMsg } from '../../vscode';
import { logUiEvent } from '../../store/ui-audit-store';
import { softPrimary } from './button-style';

const ACCENT = 'var(--color-dk8s)';
const SIZE = 'md';

/**
 * How much of the surrounding log to keep, per hit.
 *
 * Bigger than the search's own choices on purpose — see the note at the top.
 * The largest is capable of pulling a whole log through a narrow query, which
 * is exactly what someone wants when the query is a request id.
 */
const CONTEXT_CHOICES = [0, 10, 100, 200, 1000, 5000, 10000];

type RangeKind = 'all' | '30m' | '1h' | '2h' | '6h';

/** Named to match the pod list's export, so the two dialogs agree. */
const RANGE_SECONDS: Record<string, number> = {
  '30m': 1800, '1h': 3600, '2h': 7200, '6h': 21600,
};

const RANGE_LABEL: Record<RangeKind, string> = {
  all: 'All time', '30m': 'Last 30m', '1h': 'Last 1h', '2h': 'Last 2h', '6h': 'Last 6h',
};

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9.5px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</span>
      {children}
      {hint && <span className="text-[10.5px] text-[var(--color-text-muted)]">{hint}</span>}
    </div>
  );
}

export function ExportSearchModal({ pods, onClose }: {
  /** The pods whose results are being written — already filtered by the caller. */
  pods: PodSummary[];
  onClose: () => void;
}) {
  const options = useDk8sSearchStore(s => s.options);
  const groups = useDk8sSearchStore(s => s.groups);
  const exportState = useK8sStore(s => s.exportState);

  const [contextLines, setContextLines] = useState(options.contextLines);
  const [combine, setCombine] = useState(true);

  /*
    What to write, and how far back to go.

    Reaching this dialog from a search makes "just the matches" the obvious
    default, but it is not always what someone wants: having found which five
    of twenty-eight pods are doing the thing, the next question is usually
    "give me everything those five logged". Offering only the hits would send
    them back to the pod list to tick the same five again.

    So the same two choices the pod list's export offers live here too, against
    the pods the search already narrowed down.
  */
  const [scope, setScope] = useState<'matches' | 'whole'>('matches');
  const [range, setRange] = useState<RangeKind>('all');
  const [includePrevious, setIncludePrevious] = useState(true);

  /*
    What the file will hold, stated before it is written.

    These counts come from the search that already ran, so they are the real
    totals rather than the capped ones on screen — which is the whole reason
    this dialog exists, and worth saying out loud next to the button.
  */
  const names = new Set(pods.map(p => p.name));
  const hits = groups
    .filter(g => names.has(g.result.pod))
    .reduce((n, g) => n + g.result.matched, 0);

  const running = exportState?.phase === 'running';

  const start = () => {
    const targets = pods.map(p => ({
      context: p.context ?? '', namespace: p.namespace, pod: p.name,
      containers: p.containers.map(c => c.name),
      workload: p.workload?.name,
    }));
    logUiEvent('dk8s.logs_export', {
      kind: 'search', query: options.query, podCount: targets.length,
      pods: targets.map(t => t.pod).slice(0, 25),
      contextLines, combine, hits,
    });
    /*
      Two destinations, because they are genuinely two different jobs.

      A whole-log export is exactly what the pod list already does, so it goes
      to the same handler with the same options rather than growing a mode flag
      inside the search exporter. The only thing this dialog contributes is
      which pods — the ones the search narrowed to.
    */
    if (scope === 'whole') {
      postMsg({
        type: 'dk8s:exportLogs',
        targets: targets.map(t => ({ ...t, containers: t.containers })),
        options: {
          range: range === 'all'
            ? { kind: 'all' }
            : { kind: 'since', seconds: RANGE_SECONDS[range] },
          slice: { kind: 'all' },
          includePrevious,
          keepTimestamps: true,
        },
      });
      return;
    }

    postMsg({
      type: 'dk8s:exportSearch',
      targets,
      options: {
        ...options,
        contextLines,
        combine,
        includePrevious,
        // The search's own window, expressed the same way the range control
        // above says it — so "Last 1h" means the same thing in both scopes.
        sinceSeconds: range === 'all' ? undefined : RANGE_SECONDS[range],
      },
    });
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="Export search results"
      subtitle={`${hits.toLocaleString()} match${hits === 1 ? '' : 'es'} across ${pods.length} pod${pods.length === 1 ? '' : 's'}`}
      size="md"
      headerColor={ACCENT}
      footerRight={
        <div className="flex items-center gap-2">
          <ButtonView label="Cancel" size="sm" variant="secondary" onClick={onClose} />
          <ButtonView
            label={running ? 'Exporting…' : 'Choose folder and export'}
            size="sm" variant="secondary"
            disabled={running || !pods.length}
            onClick={start}
            style={softPrimary(ACCENT)}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-1 py-1">
        {/*
          The query is repeated here rather than assumed.

          By the time someone reaches this dialog they have run several
          searches, and the file about to be written is defined by which one —
          so it says which one.
        */}
        <Field label="Query">
          <div className="px-2.5 py-1.5 rounded-md font-mono text-[11.5px]"
               style={{
                 background: 'var(--color-surface-hover)',
                 border: '1px solid var(--color-surface-border)',
                 color: 'var(--color-text-primary)',
               }}>
            {options.regex ? `/${options.query}/` : options.query}
            {options.caseSensitive && (
              <span className="ml-2 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                case-sensitive
              </span>
            )}
          </div>
        </Field>

        {/*
          Matches, or everything those pods logged.

          First because it changes what every control under it means: with
          "Whole log" chosen the context size is irrelevant, so it goes away
          rather than sitting there greyed out inviting a click.
        */}
        <Field
          label="What to write"
          hint={scope === 'matches'
            ? 'Only the lines that matched, with their surroundings.'
            : `Everything these ${pods.length} pod${pods.length === 1 ? '' : 's'} logged — the search only chose which pods.`}
        >
          <SegmentedControlView
            value={scope}
            onChange={v => setScope(v as 'matches' | 'whole')}
            options={[
              { value: 'matches', label: 'Matching lines' },
              { value: 'whole', label: 'Whole log' },
            ]}
            size={SIZE} density="compact" accentColor={ACCENT}
          />
        </Field>

        <Field
          label="How far back"
          hint={range === 'all'
            ? 'Everything the pod still holds. Kubernetes rotates this, so it is not forever.'
            : `Only lines from the ${RANGE_LABEL[range].toLowerCase().replace('last ', 'last ')}.`}
        >
          <SegmentedControlView
            value={range}
            onChange={v => setRange(v as RangeKind)}
            options={(Object.keys(RANGE_LABEL) as RangeKind[])
              .map(k => ({ value: k, label: RANGE_LABEL[k] }))}
            size={SIZE} density="compact" accentColor={ACCENT}
          />
        </Field>

        {scope === 'matches' && (
        <Field
          label="Lines around each hit"
          hint={contextLines >= 1000
            // Worth warning about: at this size the file is no longer "the
            // hits", it is most of the log, and the person should know that
            // before waiting for it.
            ? 'Large enough that the file may contain most of the log.'
            : 'Written either side of every match, the way grep -C does it.'}
        >
          <SegmentedControlView
            value={String(contextLines)}
            onChange={v => setContextLines(Number(v))}
            options={CONTEXT_CHOICES.map(n => ({
              value: String(n),
              label: n === 0 ? 'none' : `±${n >= 1000 ? `${n / 1000}k` : n}`,
            }))}
            size={SIZE}
            density="compact"
            accentColor={ACCENT}
          />
        </Field>
        )}

        {scope === 'matches' && (
        <Field
          label="Files"
          hint={combine
            ? 'One file, pods in order, each under its own heading.'
            : `${pods.length} file${pods.length === 1 ? '' : 's'}, one per pod.`}
        >
          {/*
            Combined by default. The question that makes someone search
            twenty-eight pods at once — which of these is doing this — is
            answered by reading them together, and twenty-eight files is not
            reading them together.
          */}
          <CheckboxView
            label="Combine into a single file"
            checked={combine} size="md" accentColor={ACCENT}
            onChange={setCombine}
          />
        </Field>
        )}

        {/*
          On by default, and it matters most for the pods you are most likely
          to be exporting: a crashlooper's current container has just started
          and its log is a few lines of boot, while the failure is in the run
          before it.
        */}
        <Field label="Restarts">
          <CheckboxView
            label="Include the previous container's log"
            checked={includePrevious} size="md" accentColor={ACCENT}
            onChange={setIncludePrevious}
          />
        </Field>

        <p className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {scope === 'matches'
            ? 'The search runs again with its limits lifted, so the file holds every match rather than the first page shown on screen. Reading and matching happen on this machine.'
            : 'The logs are fetched fresh for these pods. Nothing is uploaded — the files are written straight to the folder you pick.'}
        </p>
      </div>
    </ModalView>
  );
}
