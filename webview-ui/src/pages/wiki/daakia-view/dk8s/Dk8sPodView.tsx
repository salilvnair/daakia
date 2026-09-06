/**
 * One pod, up close: the six tabs and what each one actually runs.
 */
import { WikiScrollPage } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, WikiTable, Callout, Divider, Code, CodeBlock,
  chips, TocBar, type TocItem,
} from '../shared/WikiShared';

const TOC_ITEMS: TocItem[] = [
  { id: 'pd-tabs', emoji: '🗂️', label: 'Seven tabs' },
  { id: 'pd-logs', emoji: '📜', label: 'Logs' },
  { id: 'pd-format', emoji: '🧩', label: 'Format detection' },
  { id: 'pd-terminal', emoji: '⌨️', label: 'Terminal' },
  { id: 'pd-facets', emoji: '🔦', label: 'Fields & facets' },
  { id: 'pd-yaml', emoji: '📄', label: 'Describe & YAML' },
  { id: 'pd-export', emoji: '💾', label: 'Exporting a log' },
];

export function Dk8sPodView() {
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          emoji="🔬"
          title="dk8s — one pod, up close"
          subtitle="Overview, logs, a terminal, the collectors, describe and YAML — and the command behind each."
          chips={chips(['logs --follow', 'format detection', 'exec', 'describe', 'export'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <SectionTitle id="pd-tabs" emoji="🗂️">Seven tabs</SectionTitle>
        <p className="dw-p">
          Opening a pod takes over the panel rather than sliding a drawer in from the side. Reading
          logs is the main activity here, and a 380px drawer turns every stack trace into a
          horizontal scroll. <Code>Esc</Code> or the back arrow returns to the grid.
        </p>
        <WikiTable
          headers={['Tab', 'Needs', 'What it shows']}
          rows={[
            ['Overview', '—', 'What the pod is, what it is doing, what it is made of, and what Kubernetes has been saying about it — the three commands you would otherwise run, on one screen'],
            ['Logs', <Code>pods/log</Code>, 'The log stream, with levels, filters and follow'],
            ['Terminal', <Code>exec</Code>, 'A shell in the container'],
            ['Explorer', <Code>exec</Code>, 'The container’s filesystem — see the Terminal & Files page'],
            ['Doctor', <Code>exec</Code>, 'The collectors — see the Doctor page'],
            ['Describe', <Code>get</Code>, <><Code>kubectl describe</Code>, with events highlighted</>],
            ['YAML', <Code>get</Code>, 'The pod object as the cluster holds it'],
          ]}
        />
        <Callout type="info" title="Tabs you cannot use are not shown as broken">
          Each tab declares the permission it needs. If <Code>auth can-i</Code> said no at connect
          time, the tab is disabled with the reason rather than failing when you open it.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="pd-logs" emoji="📜">Logs</SectionTitle>
        <CodeBlock label="the log stream" lang="bash">{`kubectl --context C -n NS logs POD \\
  [--follow] [-c CONTAINER] [--previous] \\
  --timestamps [--since=Ns] \\
  --tail=200          # or --tail=-1 when reading from the beginning`}</CodeBlock>
        <WikiTable
          headers={['Control', 'Becomes']}
          rows={[
            ['Follow', <Code>--follow</Code>],
            ['Container picker', <Code>-c NAME</Code>],
            ['Previous run', <><Code>--previous</Code> — the container before the current one, where a crashlooper’s cause actually is</>],
            ['Last N lines', <Code>--tail=N</Code>],
            ['First N lines', <>dk8s asks for <Code>--tail=-1</Code> and stops early — asking for the head means asking for everything</>],
            ['Time range', <Code>--since=Ns</Code>],
          ]}
        />
        <p className="dw-p">
          <Code>--timestamps</Code> is always on. That prefix is guaranteed by kubectl and carries an
          explicit <Code>Z</Code>, so it is the one timestamp in the system that needs no
          interpretation — which is why time filtering on live logs is exact.
        </p>
        <Callout type="tip" title="What the footer is telling you">
          <em>“200 of the last 200 lines · at the limit”</em> means the window is full and older
          lines exist. It is a deliberate statement about the boundary of what you are looking at,
          so a search that finds nothing here is not mistaken for a log that contains nothing.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="pd-format" emoji="🧩">How a line becomes fields</SectionTitle>
        <p className="dw-p">
          Levels, threads and loggers are coloured because the log's <em>format</em> is inferred
          once, then compiled and used as the authority for every line. Fields are never guessed
          per line.
        </p>
        <WikiTable
          headers={['Idea', 'What it prevents']}
          rows={[
            ['Infer a whole pattern, positionally', 'Per-line guessing, which disagrees with itself two lines apart'],
            ['Vote, and require a clear majority', 'A log that half-matches something being treated as that thing — the commonest pattern wins only above two thirds of the sample'],
            ['Compile once, apply to all', 'Rebuilding a parser per line, the easiest way to make the view stutter'],
          ]}
        />
        <p className="dw-p">
          A line with no timestamp of its own — a stack frame, a continuation — inherits the level of
          the event that printed it, so an exception stays attached to the <Code>ERROR</Code> that
          announced it instead of scattering into unstyled text.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="pd-terminal" emoji="⌨️">Terminal</SectionTitle>
        <p className="dw-p">
          A real PTY inside the container, drawn in the panel — resize, <Code>Ctrl-C</Code> and
          full-screen tools all work. It runs over the Kubernetes exec API carrying your own
          kubeconfig, so <b>no port is opened and no credential leaves your machine</b>.
        </p>
        <p className="dw-p">
          Which shell comes from a probe that tries <Code>bash</Code>, <Code>sh</Code> and
          <Code>ash</Code> in that order over the same channel the terminal will use — a probe that
          could succeed where the real thing would fail would be worse than none. A distroless image
          has none of them, and dk8s says exactly that, with the <Code>kubectl debug</Code> line
          that gets you in.
        </p>
        <Callout type="info" title="There is a page for this">
          Themes, key bindings, the file browser beside it and &ldquo;open a shell here&rdquo; are on
          the <b>Terminal &amp; Files</b> page. Prefer your own terminal, with your own font and
          shell integration? The chip in the terminal&rsquo;s footer still opens one in VS Code.
        </Callout>
        <Callout type="warn" title="“Not running” and “no shell” are different failures">
          Both make <Code>exec</Code> fail, and only one of them is about the image. dk8s separates
          them on the wording of the error, so a crashlooping pod is never mislabelled distroless —
          a confident wrong answer that sends you looking in the wrong place.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="pd-facets" emoji="🔦">Fields &amp; facets</SectionTitle>
        <p className="dw-p">
          Where a log format is configured, a panel down the left of the log lists every field the
          format named and how the events divide across them. It answers &ldquo;what <i>is</i> this
          log&rdquo; before anything is clicked — four threads, three tenants, one of them carrying
          most of the errors.
        </p>
        <WikiTable
          headers={['Click', 'Does']}
          rows={[
            ['A value', 'Includes it'],
            ['The same value again', 'Flips it to exclude — “everything except this thread” is the filter a search box could never express'],
            ['And again', 'Clears it'],
            ['The magnifier beside it', 'Asks the pod’s whole log instead of the buffer, by handing the value to Quick Search'],
          ]}
        />
        <p className="dw-p">
          Beyond <Code>thread</Code>, <Code>logger</Code> and <Code>app</Code>, any key a structured
          format carried becomes a field — MDC, in practice: <Code>tenant</Code>,{' '}
          <Code>orderId</Code>, whatever the application logged beside its message. Those are marked
          <Code>mdc</Code> and ranked by how evenly they divide the buffer, so a field where one
          value dominates sits below one that actually splits the events.
        </p>
        <Callout type="warn" title="The counts are of the buffer, not the log">
          dk8s holds a few hundred to a few thousand lines out of a pod&rsquo;s millions, so
          &ldquo;settle-worker-3 · 412&rdquo; means 412 of what is on screen — which is why the
          panel says <Code>N events on screen</Code> at its head. A field with a distinct value on
          nearly every line, like a trace id, is left out entirely: 400 values of count 1 is a list,
          not a filter.
        </Callout>
        <Callout type="info" title="Fields come from a format, never from a guess">
          An earlier version inferred structure from the text and offered
          <Code>hibernate-core-6.6.4.Final.jar!/:6.6.4.Final</Code> as a thread name — a jar tag
          scraped out of a stack frame. With no format configured there are no fields and no panel,
          which is the honest state.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="pd-yaml" emoji="📄">Describe & YAML</SectionTitle>
        <CodeBlock label="both, in parallel" lang="bash">{`kubectl --context C -n NS describe pod POD
kubectl --context C -n NS get pod POD -o yaml`}</CodeBlock>
        <p className="dw-p">
          Describe is highlighted rather than shown raw — events, conditions and the container
          states are what people come here to read, and they are buried in the middle of the output.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="pd-export" emoji="💾">Exporting a log</SectionTitle>
        <p className="dw-p">
          Export writes whole logs to files you choose the folder for. It offers a range —
          <Code>All time</Code>, a preset, or <Code>Between…</Code> — and a slice, and it can
          include the previous container's log.
        </p>
        <WikiTable
          headers={['Option', 'Meaning']}
          rows={[
            ['On screen', 'Exactly the lines currently rendered — nothing is re-fetched, so the file matches what you were looking at'],
            ['All time / preset / Between…', 'Re-read from the pod for that window'],
            ['Include previous container', 'A second file for the run before this one'],
            ['Archived logs', <>Where a volume is configured, a <Code>{'<pod>'}__archive.log</Code> alongside the live file, rotations concatenated oldest first</>],
          ]}
        />
      </div>
    </WikiScrollPage>
  );
}
