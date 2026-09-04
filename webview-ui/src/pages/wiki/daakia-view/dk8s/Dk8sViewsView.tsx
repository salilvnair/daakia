/**
 * Every view dk8s has, in one place.
 *
 * Each analyzer shows only its own tabs, so the GC table is invisible until
 * you happen to open a recording and the locks graph is invisible until you
 * open a dump that happens to be contended. Nothing listed what the tool could
 * do, which meant you had to already know GC lived behind a `.jfr` before you
 * would think to collect one.
 *
 * The list is generated from `view-catalogue`, which a test checks against the
 * analyzers' own tab definitions — so this page cannot describe a tab that was
 * renamed or deleted.
 */
import { WikiScrollPage } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, WikiTable, Callout, Divider, Code,
  chips, TocBar, type TocItem,
} from '../shared/WikiShared';
import {
  ARTIFACT_ORDER, ARTIFACT_LABEL, ARTIFACT_HOW, byArtifact, CATALOGUE,
  type ArtifactKind,
} from './view-catalogue';

const TOC_ITEMS: TocItem[] = [
  { id: 'vi-how', emoji: '🧭', label: 'How to get anywhere' },
  { id: 'vi-recording', emoji: '⏺️', label: 'Recording' },
  { id: 'vi-heap', emoji: '🧠', label: 'Heap dump' },
  { id: 'vi-threads', emoji: '🧵', label: 'Thread dump' },
  { id: 'vi-logs', emoji: '📜', label: 'Logs' },
  { id: 'vi-mcp', emoji: '🔌', label: 'MCP' },
];

const SECTION: Record<ArtifactKind, { id: string; emoji: string; title: string }> = {
  recording: { id: 'vi-recording', emoji: '⏺️', title: 'Flight recording' },
  heap: { id: 'vi-heap', emoji: '🧠', title: 'Heap dump' },
  threads: { id: 'vi-threads', emoji: '🧵', title: 'Thread dump' },
  logs: { id: 'vi-logs', emoji: '📜', title: 'Logs' },
  mcp: { id: 'vi-mcp', emoji: '🔌', title: 'MCP tools' },
};

function Only() {
  return (
    <span style={{
      fontFamily: 'ui-monospace, monospace', fontSize: 9, fontWeight: 700,
      letterSpacing: '.06em', textTransform: 'uppercase',
      padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap',
      color: 'var(--color-protocol-ai, #a97bf0)',
      background: 'color-mix(in srgb, var(--color-protocol-ai, #a97bf0) 14%, transparent)',
      border: '.8px solid color-mix(in srgb, var(--color-protocol-ai, #a97bf0) 34%, transparent)',
    }}>only here</span>
  );
}

function Section({ kind }: { kind: ArtifactKind }) {
  const s = SECTION[kind];
  const rows = byArtifact(kind).map(e => [
    <span key="n" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Code>{e.label}</Code>
      {e.only && <Only />}
    </span>,
    e.answers,
  ]);

  return (
    <div>
      <SectionTitle id={s.id} emoji={s.emoji}>{s.title}</SectionTitle>
      <p className="dw-p">
        <strong>{ARTIFACT_LABEL[kind]}</strong> — {ARTIFACT_HOW[kind]}.
      </p>
      <WikiTable headers={[kind === 'mcp' ? 'Tool' : 'View', 'What it settles']} rows={rows} />
    </div>
  );
}

export function Dk8sViewsView() {
  const total = CATALOGUE.filter(e => e.needs !== 'mcp').length;
  const tools = CATALOGUE.filter(e => e.needs === 'mcp').length;

  return (
    <WikiScrollPage
      hero={
        <WikiHero
          emoji="🗂️"
          title="dk8s — Every View"
          subtitle={`${total} views and ${tools} MCP tools, and which artifact each one needs. If you cannot find a view, it is almost always because the artifact it reads is not open.`}
          chips={chips(['.jfr', '.hprof', 'thread dump', 'logs', 'MCP'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <SectionTitle id="vi-how" emoji="🧭">How to get anywhere</SectionTitle>
        <p className="dw-p">
          Everything lives behind an artifact, and the artifact decides which views exist.
          There is no screen that shows all of them at once — open a <Code>.jfr</Code> and you
          get the recording&apos;s seven tabs; open a <Code>.hprof</Code> and you get the heap&apos;s
          six. That is the single most common reason a view seems to be missing.
        </p>

        <WikiTable
          headers={['From the Dk8s tab', 'What it does']}
          rows={[
            [<Code key="a">Artifacts → Analyze</Code>, 'Opens a dump or recording you already have. The fastest route to anything on this page.'],
            [<Code key="b">Open a file…</Code>, 'Picks a file off disk — heap dump, thread dump, logs or flight recording — including ones dk8s did not collect.'],
            [<Code key="c">Pods → a pod → Doctor</Code>, 'Collects a new artifact. The probe greys out what the container cannot produce, with the reason.'],
          ]}
        />

        <Callout type="info" title="Two views only appear when they have something to say">
          <p className="dw-p">
            <Code>Locks</Code> is not drawn when no thread is waiting on a monitor, and{' '}
            <Code>Probes</Code> is empty when the recording captured no socket or file I/O.
            Both are correct — a healthy dump has no contention graph, and a service whose
            database answers in microseconds writes no slow-I/O events. Neither is a fault,
            and neither means the view is missing.
          </p>
        </Callout>

        <Divider />
      </div>

      {ARTIFACT_ORDER.map(kind => (
        <Section key={kind} kind={kind} />
      ))}

      <div>
        <Divider />
        <Callout type="tip" title="What “only here” means">
          <p className="dw-p">
            Five things on this page exist because dk8s reads files and lives in the editor
            rather than attaching an agent to a running JVM: the allocation line comes from a
            recording rather than a dump, co-blocking comes from wait spans rather than one
            instant, growth compares two files instead of needing a live session, the lock
            graph reads ownership straight out of a dump, and{' '}
            <Code>dk8s_open_source</Code> resolves a frame to a file because the source is in
            the same window. The badge is deliberately rare — a retention tree is on every
            serious heap tool and is not claimed here.
          </p>
        </Callout>
      </div>
    </WikiScrollPage>
  );
}
