/**
 * What dk8s is, and how it gets to a cluster.
 *
 * The connect path is worth documenting in its own right because most of what
 * feels like a bug in a Kubernetes tool is really a permission the cluster
 * refused — and dk8s spends four calls up front so that shows up as a disabled
 * button with a reason rather than a failure after you click.
 */
import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, WikiTable, Callout, Divider, Code, CodeBlock,
  WikiFigure, chips, TocBar, type TocItem,
} from '../shared/WikiShared';
import { ConnectDiagram } from './FlowDiagrams';
import { DK8S_CAPTURES } from './captures';

const TOC_ITEMS: TocItem[] = [
  { id: 'dk-what', icon: 'compass', label: 'What it is' },
  { id: 'dk-connect', icon: 'connect', label: 'Getting connected' },
  { id: 'dk-grid', icon: 'layers', label: 'The pod grid' },
  { id: 'dk-watch', icon: 'radio', label: 'Watching' },
  { id: 'dk-actions', icon: 'select', label: 'Acting on pods' },
  { id: 'dk-waiting', icon: 'clock', label: 'While it waits' },
];

export function Dk8sOverviewView() {
  const byId = Object.fromEntries(DK8S_CAPTURES.map(c => [c.id, c]));
  const cap = (id: string) => byId[id] && <CaptureCard entry={byId[id]} />;

  return (
    <WikiScrollPage
      hero={
        <WikiHero
          icon=""
          title="dk8s"
          subtitle="Everything a pod can tell you — logs, heap, threads, stacks — collected from a cluster and handed to the analyzers."
          chips={chips(['contexts', 'namespaces', 'live watch', 'favourites', 'permissions'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <SectionTitle id="dk-what" icon="compass">What it is</SectionTitle>
        <p className="dw-p">
          dk8s points Daakia's diagnostic analyzers at a real cluster. Collecting the evidence — a
          heap dump, a thread dump, a flight recording, the logs — is how it gets there; reasoning
          about it is the point. Everything it runs is a <Code>kubectl</Code> invocation you could
          have typed yourself, and every collector shows you the exact command it ran.
        </p>
        <Callout type="info" title="No shell, ever">
          Arguments are passed as an argv array and the shell is never involved. Pod, namespace and
          container names come off a cluster dk8s does not control, and are attacker-influenced in
          exactly the way a URL is — <Code>sh -c "kubectl … $name"</Code> would run whatever a pod
          called <Code>x; rm -rf ~</Code> decided to be called. There is no <Code>shell: true</Code>
          in the kubectl layer, and a test asserts it.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="dk-connect" icon="connect">Getting connected</SectionTitle>
        <p className="dw-p">
          The binary comes from the dk8s setting if one is set, otherwise from <Code>PATH</Code>,
          then from the usual places for the platform. Then four cheap calls establish what you can
          actually do, before you are offered anything.
        </p>

        <Callout type="tip" title="If it is not there — or not the one you want">
          dk8s shows an install guide rather than an error: every route each platform
          actually has, on a tab per platform, with the one this machine reports opening
          first. It is also where you point dk8s at a binary it could not find —
          &ldquo;works in my terminal, not in the extension&rdquo; is a <Code>PATH</Code> a
          GUI-launched editor did not inherit, and the answer is the path itself. The same
          setting lives in <b>Settings → DK8S → General</b>, for the machine with two
          kubectls where nothing is broken enough to raise the guide.
        </Callout>

        <WikiFigure
          label="dk8s locates kubectl, confirms it reaches the cluster with a version call, lists namespaces, then runs one auth can-i per capability; allowed capabilities become working buttons and refused ones become disabled buttons carrying the reason."
          caption={<>The point of the last step: a refusal is discovered <em>before</em> you click.
            A tool that offers every action and fails afterwards teaches you to distrust all of them.</>}
        >
          <ConnectDiagram />
        </WikiFigure>

        <WikiTable
          headers={['Step', 'Command', 'Why']}
          rows={[
            ['Reach the cluster', <Code>kubectl --context C version -o json --request-timeout=8s</Code>,
              'A short timeout, because an unreachable cluster should say so in seconds, not hang'],
            ['List namespaces', <Code>kubectl --context C get namespaces -o name</Code>,
              'When this is refused, the context’s own default namespace is used instead'],
            ['Your namespace', <Code>kubectl --context C config view --minify -o jsonpath={'{..namespace}'}</Code>,
              'What your kubeconfig already says you work in'],
            ['What you may do', <Code>kubectl --context C -n NS auth can-i VERB RESOURCE --quiet</Code>,
              'One per capability — logs, exec, get'],
          ]}
        />

        <Callout type="tip" title="Unknown means allowed">
          <Code>--quiet</Code> turns <Code>can-i</Code> into a pure exit code: 0 yes, 1 no. Anything
          else — the subcommand missing on an old kubectl, a network blip — is <em>unknown</em>, and
          unknown never restricts. Guessing "no" would disable working features on clusters that
          simply answer differently.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="dk-grid" icon="layers">The pod grid</SectionTitle>
        {cap('dk8s-pods')}
        <p className="dw-p">
          Pods as cards or as a table, grouped by namespace, with the ones needing attention sorted
          up. The header counts are live: how many pods, how many ready, how many failing, and how
          many have restarted in the last hour.
        </p>
        <WikiTable
          headers={['Control', 'What it does']}
          rows={[
            [<><Code>★</Code> scope</>, 'Only your starred pods. This is the default on open — the handful you actually watch, not the hundred in the namespace'],
            ['all scope', 'Every pod in the selected namespaces'],
            ['cards / table', 'Same data, two densities. Table is better for scanning restart counts, cards for status at a glance'],
            ['filter box', 'Substring over pod name'],
            ['Quick Search', 'Opens log search across pods without picking one first'],
          ]}
        />
        <Callout type="info" title="Multiple namespaces, multiple contexts">
          Both pickers are multi-select. The grid groups by namespace and labels each group with its
          context, so two clusters holding a pod of the same name stay distinguishable.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="dk-watch" icon="radio">Watching</SectionTitle>
        {cap('dk8s-pods-table')}
        <p className="dw-p">
          The <Code>watching</Code> indicator means a live stream is open and the grid is being
          updated by the cluster rather than polled. Hovering it tells you how long since the last
          event; the dot breathes while the stream is connected.
        </p>
        <CodeBlock label="what the watch runs" lang="bash">{`# a full list first — this also proves pods are readable at all
kubectl --context C -n NS get pods -o json

# then the stream, one JSON object per change
kubectl --context C -n NS get pods -o json --watch --output-watch-events

# and, separately, live usage where metrics-server exists
kubectl --context C -n NS top pods --no-headers`}</CodeBlock>
        <p className="dw-p">
          Listing before streaming is deliberate: a stream that cannot start fails silently in the
          background, while a list that cannot run is an error you can see. If the stream drops, it
          reconnects with a backoff and re-lists, so a reconnect cannot leave the grid showing a
          world that has moved on.
        </p>
        <Callout type="warn" title="top pods needs metrics-server">
          CPU and memory columns are blank on clusters without it. That is the cluster's answer, not
          a failure in dk8s — everything else on the grid comes from the pod objects themselves.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="dk-actions" icon="select">Acting on pods</SectionTitle>
        <p className="dw-p">
          Right-click any card or row for the pod menu; long-press to enter selection mode and act
          on several at once. A cluster or a namespace has its own right-click
          menu too — switch to it, refresh it, copy the <Code>kubectl</Code>
          that would reach it, or forget a saved one.
        </p>
        <WikiTable
          headers={['Menu item', 'What it opens']}
          rows={[
            ['Select', 'Selection mode, for multi-pod search and export'],
            ['Copy ▸', 'Pod name, namespace, or a ready-to-run kubectl command'],
            ['Shell', 'A terminal in the container — see the Pod detail page'],
            ['Logs', 'The log viewer for that pod'],
            ['Doctor ▸', 'The collectors: thread dump, histogram, heap dump, flight recording, stacks, connections'],
            ['Favourite', <>Adds to the <Code>★</Code> scope. Removing asks first — it is easy to hit by accident and annoying to rebuild</>],
          ]}
        />
        <Callout type="tip" title="Disabled items carry their reason">
          A Doctor entry that cannot run in this container is greyed out with a short note saying why
          — no jcmd in the image, no shell at all, the capability the kernel did not grant. That
          comes from the capability probe described on the Doctor page.
        </Callout>
      </div>
      <Divider />

      <div>
        <SectionTitle id="dk-waiting" icon="clock">While it waits, and when it gives up</SectionTitle>
        <p className="dw-p">
          Every wait that owns a panel — finding <Code>kubectl</Code>, listing
          namespaces, listing pods, retrying after a refusal — is the same size,
          in the same place, and says what it is waiting for. A screen that
          draws the same spinner for four different questions teaches you to
          read none of them.
        </p>
        <WikiTable
          headers={['State', 'What it says']}
          rows={[
            ['Working', <>The thing being waited on, named — <em>listing namespaces in staging-eu</em>, not <em>Loading…</em></>],
            ['Refused', 'The cluster’s own words, with somewhere to go: pick another cluster, or retry'],
            ['Silent', <>After twenty-five seconds a reply that never arrived gets its own answer — a stream that says nothing is a state, not a success</>],
            ['Empty', <>Only once the answer is in. &ldquo;This namespace has no pods&rdquo; is a fact; drawing it while the list is still being read is a lie</>],
          ]}
        />
        <Callout type="info" title="Fixed in 3.0.3">
          Pressing Watch used to drag you back to the namespace picker about
          fifteen seconds later: a cluster list that arrived late reset the
          stage you had already moved past. A late answer can no longer undo a
          screen you have reached.
        </Callout>
      </div>
    </WikiScrollPage>
  );
}
