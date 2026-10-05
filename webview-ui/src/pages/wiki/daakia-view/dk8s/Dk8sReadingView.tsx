/**
 * Reading a log: the Logs tab control by control, and every view built on it
 * — Ask the log, a search's page, Window, Follow, Split open and Daakia AI.
 *
 * Written from the Loggers field guide's second part, brought up to the app
 * as it is: a one-row toolbar, Following with Pause and Clear, lines numbered
 * by the read, archived lines marked, and Follow's condition picker.
 */
import { WikiScrollPage } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, WikiTable, Callout, Divider, Code,
  chips, TocBar, type TocItem,
} from '../shared/WikiShared';

const TOC_ITEMS: TocItem[] = [
  { id: 'rl-map', icon: 'compass', label: 'Which view?' },
  { id: 'rl-logs', icon: 'script', label: 'The Logs tab' },
  { id: 'rl-following', icon: 'play', label: 'Following' },
  { id: 'rl-ask', icon: 'ai', label: 'Ask the log' },
  { id: 'rl-results', icon: 'search', label: 'A search’s page' },
  { id: 'rl-window', icon: 'clock', label: 'Window' },
  { id: 'rl-follow', icon: 'link', label: 'Follow' },
  { id: 'rl-split', icon: 'layers', label: 'Split open' },
  { id: 'rl-daakia', icon: 'agent', label: 'Daakia AI' },
  { id: 'rl-settings', icon: 'settings', label: 'Settings' },
];

export function Dk8sReadingView() {
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          icon="script"
          title="dk8s — Reading a Log"
          subtitle="One pod's log, the views built on it, and which to reach for: what is this pod saying, what went wrong, where did that request go, what else was running then."
          chips={chips(['Logs tab', 'Following', 'Ask the log', 'Window', 'Follow', 'Split open', 'Daakia AI'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <SectionTitle id="rl-map" icon="compass">Start from the question you have</SectionTitle>
        <WikiTable
          headers={['You are asking', 'Reach for', 'Where']}
          rows={[
            ['"What is this pod saying?"', 'The Logs tab', 'Pod → Logs'],
            ['"What went wrong in the last hour?"', 'Ask the log', 'Pod → Ask the log'],
            ['"Where did request 8524 show up?"', 'Quick Search', 'Pods → Quick Search — every watched pod, live and archive'],
            ['"What else was going on around that line?"', 'Window', 'A search result → click a line → Window'],
            ['"What happened to this one request?"', 'Follow', 'A search result → a field → Follow'],
            ['"Are the two replicas doing the same thing?"', 'Split open', 'Select pods → Split open'],
            ['"Can you just look for me?"', 'Daakia AI', 'The AI tab, with dk8s on'],
          ]}
        />
      </div>

      <Divider />

      <div>
        <SectionTitle id="rl-logs" icon="script">The Logs tab, control by control</SectionTitle>
        <p className="dw-p">
          One pod&rsquo;s log, and one row of controls above it. Nothing reloads on its own: choose what to read, then press
          <b> Fetch</b> — a log that reloads while you read it moves the line you were reading.
        </p>
        <WikiTable
          headers={['Control', 'What it does']}
          rows={[
            ['Field panel', 'The rail on the left: every thread, logger and MDC value on screen, with a count. Click a value to show only it, again to hide it, a third time to drop it.'],
            ['err · wrn · info · dbg', 'Level chips with how many of each. Pick one or several; none means all. A level once seen keeps its chip, at 0 after a Clear, so the row never shifts.'],
            ['Filter', 'Plain text, or /regex/. It takes the width the controls leave; the match count sits inside it. Beside it, how many surrounding lines to keep around each match.'],
            ['Wrap · Fold', 'Wrap long lines; fold a stack trace into the line that threw it.'],
            [<span>Find <Code>Ctrl+F</Code></span>, 'Find within what is on screen, with match case and regex, stepping hit to hit.'],
            ['Previous run', 'For a container that restarted: read the run before the restart, where the failure usually is.'],
            ['last · first · btw', 'The newest lines, the oldest, or between two times — then how many, and how far back.'],
            ['Fetch', 'Reads the pod now, with those choices.'],
            ['Following', 'Streams the newest lines in — see below.'],
            ['Download · Analyze', 'Download the log (the lines on screen, a time range, or the whole log). Analyze asks AI for a timeline of what is on screen — over 1,200 lines it sends the first 600 and the last 600, and says so first.'],
          ]}
        />
        <SubTitle>On a line</SubTitle>
        <WikiTable
          headers={['', '']}
          rows={[
            ['The number', 'Its line in the read: the last of "the last 200" is 200. A folded stack trace skips numbers, the way an editor folds code. Click a number to select the line; Shift-click for a range; Esc lets go. Copying writes time, level and message.'],
            ['Payload chip', <span><Code>JSON · 5 keys</Code> — open it for a tree under the line; switch it to Pretty or Raw. With &ldquo;remember&rdquo; on (Rendering settings), opening one opens that logger&rsquo;s payloads from then on; close one to forget it.</span>],
            ['Fields chip', 'What the line names and where each value came from. "N lines" is an exact field — Follow can filter on it; "N mention it" is only in the text, so it searches instead.'],
            ['Stack trace', '"… 5 more frames" opens the folded trace; framework frames are dimmed. Ask AI sends the message and the first frames.'],
            ['Copy · link', 'Copy the line, or a link that opens the log on it.'],
          ]}
        />
        <SubTitle>The ribbon</SubTitle>
        <p className="dw-p">
          The strip on the right: one block per slice of the log, coloured by what it holds — red errors, amber
          warnings, the rest blue — with at least a sliver for any error. Click a block to jump; the outline is where you
          are. In a split pane it is a narrower gutter, and under 180px tall it switches to one tick per run of errors.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="rl-following" icon="play">Following</SectionTitle>
        <p className="dw-p">
          <b>Following</b> starts from now and streams new lines in, pinned to the newest. While it runs the read controls
          give way to what a stream needs:
        </p>
        <WikiTable
          headers={['', '']}
          rows={[
            ['Pause / Resume', 'Holds the screen still to read; the stream keeps running and counts what arrives — "Resume · 311 new" lets it in and jumps to the newest.'],
            ['Clear', 'Empties the screen; Following carries on from there.'],
            ['Scroll up', 'The wheel, PageUp, Home or the scrollbar lets go of the bottom at once; "jump to newest" brings it back. Lines growing on screen never let go by themselves.'],
            ['Turning it off', 'Reads the pod the ordinary way again — the last N lines — keeping the followed lines on screen until that read lands.'],
          ]}
        />
      </div>

      <Divider />

      <div>
        <SectionTitle id="rl-ask" icon="ai">Ask the log</SectionTitle>
        <p className="dw-p">
          Type a question the way you would ask a colleague. dk8s works out which stretch of the log that means, reads it,
          and sends it to the AI; the answer cites the lines it came from.
        </p>
        <WikiTable
          headers={['You ask', 'It reads']}
          rows={[
            ['what went wrong in the last 10 minutes', <Code>--since=10m</Code>],
            ['summarise the last 500 lines', <Code>--tail=500</Code>],
            ['orderId A-4470 since 09:30', <Code>--since-time 09:30 today</Code>],
            ['anything odd since the restart', 'since the container started'],
          ]}
        />
        <Callout type="info" title="At most 2,000 lines go to the AI">
          When the window holds more, dk8s keeps the lines that mention the ids or words in your question, then the
          newest, and never splits a stack trace from its line — a bar above the answer says what was cut. Settings → DK8S
          → Logs lets it send up to 20,000, after a confirmation. Secrets are stripped before anything is sent.
        </Callout>
        <p className="dw-p">
          A citation opens the Logs tab on those lines, and Back returns to the answer. The lines the answer used sit on the
          right, numbered to match; a question you keep asking can be saved as a chip under the box.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="rl-results" icon="search">A search&rsquo;s page</SectionTitle>
        <p className="dw-p">
          Quick Search → <b>Open as page</b> shows the hits as a log, with the pods they came from and what each hit names.
          The header says where they came from — <b>live log</b>, <b>archive · N files</b>, or both — and when archived files
          are in the result each row is tagged <Code>live</Code> or <Code>archive</Code>, the file named on hover.
        </p>
        <WikiTable
          headers={['In the left rail', 'What a click does']}
          rows={[
            [<>Source — <Code>live</Code> · <Code>archive</Code></>, 'Shows only the running log’s hits, or only the archived files’; a second click shows both. Each says how many hits it holds, and archive how many files. There only when some hit came from an archive.'],
            ['Hits by pod', 'Narrows to that pod; click others to add them, so two replicas can be compared.'],
            ['Loggers that matched', 'Only lines from that logger; click it again for every logger.'],
            ['Reset filters', 'Appears once anything narrows the page, and puts it all back: every pod, both sources, every level, no field filters.'],
          ]}
        />
        <p className="dw-p">
          The counts beside each choice follow every other filter but their own — pick <Code>archive</Code> and the pod
          counts become archive counts, while <Code>live</Code> still says how many it would show.
        </p>
        <WikiTable
          headers={['On a clicked line’s field', 'What it does']}
          rows={[
            ['Follow', 'Opens Follow on that value. The first card is the one your Correlate by order picks; a value on more than 500 lines asks first.'],
            ['Add thread column', 'Puts that field in its own column on every row — the column is the field’s, so another line’s thread offers Remove.'],
            ['Chart it · only when ≥', 'A timing like tookMs is measured, not followed: chart it, or keep hits at or above a value.'],
          ]}
        />
        <p className="dw-p">
          At the top right, <b>Open logs</b> downloads a pod&rsquo;s whole log into a tab, <b>Window</b> summarises the minutes
          around the clicked line, and <b>Split open</b> puts the pods&rsquo; live logs side by side. Download offers
          <b> On screen</b> first — the page as it is, nothing read again — or a time range read afresh.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="rl-window" icon="clock">Window — what else ran around that line</SectionTitle>
        <p className="dw-p">
          A search tells you where a line is, not what the service was busy with when it happened. Window reads every line
          from every searched pod in the minutes around the one you clicked and counts what ran, using your
          determinants. No AI: it is counting, on your machine.
        </p>
        <WikiTable
          headers={['Control', '']}
          rows={[
            ['Anchor', 'The line it is centred on, in its level’s colour.'],
            ['±5m · ±15m · custom', 'How wide. Up to 40,000 lines per pod and 120,000 in all are read.'],
            ['Narrow by', 'Chips from the clicked line. Turn one on and every table recounts against only those lines — "which APIs did this one request touch?" is one chip.'],
            ['Determinants', 'Untick one to hide it here only. With none yet, the tab offers to add them.'],
          ]}
        />
        <Callout type="tip" title="A line from the archive">
          Opened on a line from an archived file, Window reads the archive too — the live log does not go back that far —
          and its rows carry the archive tag.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="rl-follow" icon="link">Follow one value through every pod</SectionTitle>
        <p className="dw-p">
          Follow re-reads every searched pod around the clicked line and keeps only the lines where a field <em>equals</em>
          the value — not lines that merely mention it: <Code>exec-7</Code> is inside <Code>exec-71</Code>, and equality on a
          parsed field is what &ldquo;the same request&rdquo; means. It opens at ±90 seconds; <b>Widen</b> steps out.
        </p>
        <WikiTable
          headers={['', '']}
          rows={[
            ['Conditions', 'Click a condition’s words to switch it off without dropping it; × drops it.'],
            ['+ condition', 'The fields these lines carry, as chips with how many values each has; pick one and its values are listed with how many lines carry each. Click to pick, double-click to add — or type any field and value.'],
            ['One timeline · Only this thread’s pod', 'Merge the pods into one timeline, or keep each pod whole; keep a thread to the pod it belongs to.'],
            ['From the archive', 'Followed from an archived line, it reads the archive; the count says "from archive · N files" and each row is tagged.'],
            ['Save as view', 'Keeps the conditions, the pods and the window, to reopen later.'],
          ]}
        />
      </div>

      <Divider />

      <div>
        <SectionTitle id="rl-split" icon="layers">Split open — two to four pods, side by side</SectionTitle>
        <p className="dw-p">
          Each pane is a full Logs view of one pod. Compare replicas, or watch the caller and the service it calls at the
          same time. Up to three panes side by side or stacked, four in a grid.
        </p>
        <WikiTable
          headers={['', '']}
          rows={[
            ['One clock', 'Every ribbon spans the time the panes share, so a red block at the same height in two panes happened at the same moment.'],
            ['Per pane', 'Each pane has its own filter, levels and Following; Filter By from a right-click acts on the pane you clicked.'],
            ['Closing', 'Closing panes down to one keeps that pane’s state — nothing is read again.'],
          ]}
        />
      </div>

      <Divider />

      <div>
        <SectionTitle id="rl-daakia" icon="agent">Daakia AI — an assistant that shows its working</SectionTitle>
        <p className="dw-p">
          Ask &ldquo;why did requestDataId=9259 fail?&rdquo; and Daakia AI searches the pods you are watching, runs read-only
          kubectl when it needs the state of things, and answers — with every step, command and line on screen. The scope
          chip says which cluster, namespace and pods it may search.
        </p>
        <WikiTable
          headers={['A suggested command', '']}
          rows={[
            ['READ', <span><Code>get</Code>, <Code>describe</Code>, <Code>logs</Code>, <Code>top</Code>, <Code>events</Code> and other reads run with <b>Run</b>; every run is in the Commands audit.</span>],
            ['CHANGES', 'Anything that would change the cluster — restart, scale, delete, apply, exec — is shown with Copy and no Run.'],
            ['FORWARD', 'A suggested port-forward opens the forward dialog to review and start — the chat never starts one.'],
          ]}
        />
      </div>

      <Divider />

      <div>
        <SectionTitle id="rl-settings" icon="settings">Settings → DK8S → Logs</SectionTitle>
        <WikiTable
          headers={['Page', 'What is on it']}
          rows={[
            ['General', 'The line-count ladder (200 to start), surrounding lines, how far back a search reads, line numbers, payloads (shapes, Tree / Pretty / Raw, depth, collapsed until clicked, remember, hide secrets, keep raw, size limit), stack traces (fold, your packages first), and Ask the log’s line cap.'],
            ['Downloads', 'The most one downloaded log may take. Used by Open logs.'],
            ['Log Formats', 'Your own layout patterns, JSON and logfmt formats, and when each applies. Detect with AI writes one from sample lines.'],
            ['Archive', 'Archived logs on a volume: mount, folder layout, extensions, age limit, time zone.'],
            ['Fields', 'The four readers, the Correlate by order, the ask-first threshold (500), and fields the readers did not find.'],
            ['Determinants', 'Your saved questions, the team’s, and the builder with a live preview.'],
          ]}
        />
      </div>
    </WikiScrollPage>
  );
}
