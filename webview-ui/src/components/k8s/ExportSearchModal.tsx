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
import { useRef, useState } from 'react';
import { ModalView, ButtonView, SegmentedControlView, CheckboxView } from '@salilvnair/dui';
import type { PodSummary } from '../../store/k8s-store';
import { useK8sStore } from '../../store/k8s-store';
import { useDk8sSearchStore } from '../../store/dk8s-search-store';
import {
  TimeWindowPicker, describeWindow, windowError, windowOptions, type TimeWindow,
} from './TimeWindow';
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

/**
 * The window as the whole-log exporter takes it.
 *
 * That path predates the search and speaks `LogRange`, which has carried a
 * `between` since it was written — it was only ever the dialogs that could not
 * express one.
 */
function rangeForWholeLog(w: TimeWindow) {
  const { sinceSeconds, fromMs, toMs } = windowOptions(w);
  if (fromMs !== undefined && toMs !== undefined) {
    return {
      kind: 'between' as const,
      fromIso: new Date(fromMs).toISOString(),
      toIso: new Date(toMs).toISOString(),
    };
  }
  return sinceSeconds !== undefined
    ? { kind: 'since' as const, seconds: sinceSeconds }
    : { kind: 'all' as const };
}

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
  /*
    The width the search ran at, pinned for the life of the dialog.

    It gets a segment of its own because it is rarely one of the round
    numbers — ±2 by default. Held in a ref rather than derived from the
    current value: deriving it meant the extra segment moved every time you
    picked another, so choosing ±10 erased ±2 and there was no way back to the
    width you started from.
  */
  const inheritedContext = useRef(options.contextLines).current;
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
  /*
    The window comes from the search, not from scratch.

    Having searched the 1st to the 5th, exporting those results means that same
    window — defaulting back to "All time" here would quietly widen what you
    asked for, and the file would not match the screen it came from. Still
    editable: narrowing the export of a wide search is a real thing to want.
  */
  const { timeWindow, setTimeWindow } = useDk8sSearchStore();
  const windowProblem = windowError(timeWindow);
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
          range: rangeForWholeLog(timeWindow),
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
        // The window as the engine takes it: a preset stays relative, a
        // `Between…` resolves to two absolute instants.
        sinceSeconds: undefined, fromMs: undefined, toMs: undefined,
        ...windowOptions(timeWindow),
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
            disabled={running || !pods.length || !!windowProblem}
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

        <Field label="How far back" hint={describeWindow(timeWindow)}>
          <TimeWindowPicker
            value={timeWindow} onChange={setTimeWindow} size={SIZE} accent={ACCENT}
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
            /*
              The inherited value earns a segment of its own.

              The list is a set of round numbers, and the starting value comes
              from the search you just ran — ±2 by default, which is in no
              list. Nothing highlighted, so the control looked unset while the
              export happily wrote ±2: the one state a segmented control must
              never be in is "the truth is not on screen".

              It is the INHERITED width that earns the segment, not the current
              one. Keyed to the current value, the extra segment moved as you
              clicked, so picking ±10 deleted ±2 and stranded you away from
              where you began.
            */
            options={[...new Set([...CONTEXT_CHOICES, inheritedContext])]
              .sort((a, b) => a - b)
              .map(n => ({
                value: String(n),
                label: n === 0 ? 'none' : `±${n >= 1000 ? `${n / 1000}k` : n}`,
              }))}
            size={SIZE} density="compact" accentColor={ACCENT}
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
