/**
 * How dk8s searches logs.
 *
 * Written for the person who has to trust a result — the number on screen, the
 * lines in the exported file — rather than for someone browsing features. So
 * it says what is read, what is skipped, what is counted but not kept, and
 * where each of those is decided.
 */
import { WikiScrollPage } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, WikiTable, Callout, Divider, Code, CodeBlock,
  WikiFigure, Steps, chips, TocBar, type TocItem,
} from '../shared/WikiShared';
import { PipelineDiagram, ScanLoopDiagram, ArchiveSkipDiagram } from './SearchDiagrams';

const TOC_ITEMS: TocItem[] = [
  { id: 'dk-halves', emoji: '🔀', label: 'Two halves' },
  { id: 'dk-loop', emoji: '🔁', label: 'The scan loop' },
  { id: 'dk-archive', emoji: '📼', label: 'What is skipped' },
  { id: 'dk-window', emoji: '🕐', label: 'Time & zones' },
  { id: 'dk-counts', emoji: '🔢', label: 'Counts vs kept' },
  { id: 'dk-export', emoji: '📄', label: 'Export' },
];

export function Dk8sView() {
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          emoji="🔍"
          title="dk8s — how log search works"
          subtitle="Two halves, one pass per line, and a deliberate story about what gets read and what gets skipped."
          chips={chips(['kubectl logs', 'mounted volume', 'context ±N', 'time window', 'export'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <SectionTitle id="dk-halves" emoji="🔀">A search has two halves</SectionTitle>
        <p className="dw-p">
          <Code>kubectl logs</Code> reaches the running container and the one before it — that is all
          Kubernetes keeps. A pod whose logs are shipped to a volume has far more history than that,
          so dk8s searches both and reports them as separate rows: one <Code>live:</Code> group and
          one <Code>archive:</Code> group per pod. They are two different bodies of text over two
          different searches, and collapsing them into one row is how a count comes to disagree with
          the file it produced.
        </p>

        <WikiFigure
          label="A dk8s log search fans out from one query into a live half run through kubectl and an archive half read from a mounted volume, then merges into per-pod result groups keyed by source, which the export re-runs."
          caption={<>One query, two readers, two rows per pod. The <Code>export</Code> box is dashed
            because it does not reuse what is on screen — it runs the whole thing again with the
            caps lifted.</>}
        >
          <PipelineDiagram />
        </WikiFigure>

        <WikiTable
          headers={['', 'Live', 'Archive']}
          rows={[
            ['Source', <>One <Code>kubectl logs</Code> per pod</>, 'Files on a mounted volume'],
            ['Concurrency', '4 pods at a time', 'One pod at a time, files in turn'],
            ['Why that', 'One process per pod at once is a thundering herd', 'Local disk — reading four big files at once is slower, not faster'],
            ['Reach', <>Bounded by <Code>--tail</Code> and what the runtime still holds</>, 'Every rotation the volume still has'],
            ['Order', 'As the runtime returns it', 'Newest file first, so the likely answer arrives early'],
          ]}
        />
      </div>

      <Divider />

      <div>
        <SectionTitle id="dk-loop" emoji="🔁">The scan loop</SectionTitle>
        <p className="dw-p">
          Both halves share the same shape: one pass, one line held at a time, nothing buffered
          whole. That is what lets a multi-gigabyte rotation be searched on a laptop.
        </p>

        <WikiFigure
          label="For each line: fill in context owed to earlier hits, resolve its timestamp inheriting the last one seen, test the time window, run the matcher only if in range, count and conditionally store a hit, then push the line into the ring buffer and loop."
          caption={<>The order matters. Context is filled in <em>before</em> the line is judged, and
            the ring is pushed <em>after</em> — so a hit's "before" is already in hand the moment it
            is found, without a second pass over the file.</>}
        >
          <ScanLoopDiagram />
        </WikiFigure>

        <SubTitle>Line by line</SubTitle>
        <Steps steps={[
          <>The matcher is built <strong>once</strong>, before the loop. A regex compiled inside it
            would be half a million compilations on a 500,000-line log.</>,
          <>Any earlier hit still owed trailing context takes this line, until it has the ±N it
            asked for.</>,
          <>The line's timestamp is read. <strong>A line without one inherits the last one seen</strong>,
            so a stack frame is judged by the event that printed it rather than falling outside every
            window on its own.</>,
          <>The time window is tested. Out of range, and the matcher is never called — the filter
            narrows the <em>work</em>, not just the answer.</>,
          <>The matcher returns character ranges (for highlighting) or <Code>null</Code>. A regex
            stops after 50 ranges on one line, and a zero-width match is stepped past rather than
            spun on.</>,
          <>A hit is <strong>always counted</strong>. It is stored only if the pod is still under its
            cap and the run still has budget; otherwise the run is marked capped.</>,
          <>The line goes into the ring buffer, which holds the last N lines and is what a future
            hit's "before" is taken from.</>,
        ]} />

        <SubTitle>The same thing, exactly</SubTitle>
        <CodeBlock label="the scan, per pod" lang="text">{`matcher  = compile(query, regex, caseSensitive)     # once, outside the loop
ring     = RingBuffer(contextLines)
owed     = []            # hits still short of their trailing context
seenTs   = none          # last timestamp seen, for lines that carry none

for line in stream:                                 # one pass, one line held
    scanned += 1

    owed = [h for h in owed if h.after.push(line) < contextLines]

    ts = timestampOf(line)
    if ts: seenTs = ts                              # else inherit the last

    inWindow = seenTs is none                       # undated lines are kept
               or (from <= seenTs <= to)

    hits = matcher(line) if inWindow else none      # skipped work, not just
                                                    # a filtered answer
    if hits:
        matched += 1                                # ALWAYS counted
        if kept < maxPerPod and budget > 0:
            store(line, hits, before = ring.snapshot(), after = [])
            owed.append(that)
            budget -= 1
        else:
            capped = true                           # counting continues

    ring.push(line)                                 # after judging, never before`}</CodeBlock>

        <Callout type="tip" title="Why the ring is pushed last">
          If the current line were pushed before it was judged, every hit would carry itself as its
          own preceding context, and the line above it would be lost. Off-by-one here is invisible
          in the count and obvious in the exported file.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="dk-archive" emoji="📼">What the archive refuses to read</SectionTitle>
        <p className="dw-p">
          A time range has to narrow what is <strong>read</strong>, not merely what is reported —
          otherwise the expensive half of the work happens either way, which is the opposite of what
          a filter is for. The archive gets two shortcuts before it reads a byte.
        </p>

        <WikiFigure
          label="Each rotation file is skipped unopened when its modification time predates the window; otherwise a compressed file is inflated whole and filtered per line, while a plain file is bisected to find the first line inside the window and read from there."
          caption={<>Only the lower bound can be judged from the file itself: <Code>mtime</Code> says
            when writing stopped, which bounds the contents from above. Nothing in a directory
            listing says when a file <em>started</em>, so anything that might reach into the window
            is opened.</>}
        >
          <ArchiveSkipDiagram />
        </WikiFigure>

        <WikiTable
          headers={['Shortcut', 'What it saves', 'When it does not apply']}
          rows={[
            ['Skip by mtime', 'The whole file — never opened', 'Any file whose last write is inside or after the window'],
            ['Bisect to the start', 'Everything before the window, unread', 'Compressed files: a byte offset means nothing in a gzip stream'],
            ['Per-line window test', 'Nothing — it is the correctness net', 'Never; it is what makes the compressed case correct at all'],
          ]}
        />

        <Callout type="warn" title="Compression is the limit of the optimisation">
          A <Code>.gz</Code> rotation cannot be seeked, so a date range narrows what it <em>reports</em>
          but not what it <em>reads</em>. Stated here rather than left implicit, because otherwise the
          scanned-line count looks wrong for a search that should have skipped most of the volume.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="dk-window" emoji="🕐">Time, and whose clock</SectionTitle>
        <p className="dw-p">
          The window is either relative (<Code>Last 1h</Code>) or absolute (<Code>Between…</Code>).
          Relative stays relative — an hour before the search runs. Absolute resolves to two
          instants, and both ends are inclusive.
        </p>
        <WikiTable
          headers={['Half', 'Lower bound', 'Upper bound']}
          rows={[
            ['Live', <><Code>--since-time</Code> for an absolute start, <Code>--since</Code> for a preset</>,
              <>Enforced per line — <Code>kubectl logs</Code> has no <Code>--until</Code></>],
            ['Archive', 'A byte seek, so the bytes before it are never read', 'Enforced per line'],
          ]}
        />

        <SubTitle>Two different clocks</SubTitle>
        <p className="dw-p">
          The dates you pick are on <strong>your</strong> device's clock — nothing to configure. The
          clock that has to be declared is the <strong>log's</strong>, because a line like
          <Code>2026-08-30 06:32:25</Code> names no zone, and reading it means assuming one.
        </p>
        <Callout type="warn" title="Set this once, in Settings → Dk8s → Archived logs">
          <strong>“These logs are written in”</strong> is what turns a zoneless timestamp into an
          instant. A pod writing UTC read by someone on CST otherwise lands every archived line five
          hours from where it belongs — a search for the last hour returns nothing while the log
          plainly holds matches. Lines carrying their own <Code>Z</Code> or <Code>+05:30</Code> are
          already unambiguous and ignore the setting. It defaults to UTC.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="dk-counts" emoji="🔢">Counted, kept, and shown</SectionTitle>
        <p className="dw-p">
          These are three different numbers, and conflating them is how a search quietly lies.
          Counting never stops; storing does.
        </p>
        <WikiTable
          headers={['Number', 'Meaning', 'Bound']}
          rows={[
            ['matched', 'Every line that matched, whether kept or not', 'Unbounded — this is the honest total'],
            ['kept', 'Matches held in memory and rendered', <>Per pod: <Code>maxMatchesPerPod</Code>. Per run: <Code>maxMatchesTotal</Code></>],
            ['scanned', 'Lines actually read — the cost of the search', 'What the window and the seek shrink'],
          ]}
        />
        <p className="dw-p">
          When the two differ the row says so — <em>“6,500 hits (showing first N)”</em> — because
          “4,812 matches in this pod” is an honest answer where a silently truncated “200” is not.
          The export lifts the cap rather than paging what is on screen, which is why it re-runs the
          search instead of reusing the results.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="dk-export" emoji="📄">Export</SectionTitle>
        <p className="dw-p">
          The export runs the search again with the caps lifted, so the file holds every match rather
          than the first page. It writes one file per pod <em>per source</em> — a pod with both halves
          gets <Code>pod__search__stamp.log</Code> and <Code>pod__search-archive__stamp.log</Code> —
          or one combined file with each under its own heading.
        </p>

        <SubTitle>Context windows are merged, not repeated</SubTitle>
        <p className="dw-p">
          Writing each match with its own ±N lines re-emits any line near more than one hit, once per
          hit. Instead the windows are merged the way <Code>grep -C</Code> merges them: each line
          written once, touching runs joined, a real gap marked <Code>--</Code>. The output is then
          bounded by the length of the log rather than by the number of hits.
        </p>
        <CodeBlock label="the shape of an exported file" lang="text">{`# pv-billing-54f6c8c494-29478  (dk8s-test)
# query: bill
# 5,000 matches in 5,000 lines scanned, ±200 lines of context

4821-2026-08-30T06:00:04.000Z INFO  ... starting
4822:2026-08-30T06:00:05.000Z INFO  ... billing run
--
7310:2026-08-30T09:14:22.000Z ERROR ... billing failed`}</CodeBlock>

        <Callout type="tip" title="Why that matters at ±200">
          Un-merged, 11,500 matches at ±200 asks for 4.6 million lines out of a log holding fourteen
          thousand — around 700MB of text, past the longest string the runtime will build. Merged,
          the same export is the size of the log: every line written once.
        </Callout>

        <WikiTable
          headers={['Marker', 'Means']}
          rows={[
            [<Code>1234:</Code>, 'A line that matched'],
            [<Code>1234-</Code>, 'A context line around one'],
            [<Code>--</Code>, 'A real gap — the lines between were not written'],
            [<Code>===== path =====</Code>, 'The rotation file the lines below came from'],
          ]}
        />
      </div>
    </WikiScrollPage>
  );
}
