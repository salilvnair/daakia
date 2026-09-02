/**
 * What dk8s is, and how it gets to a cluster.
 *
 * The connect path is worth documenting in its own right because most of what
 * feels like a bug in a Kubernetes tool is really a permission the cluster
 * refused — and dk8s spends four calls up front so that shows up as a disabled
 * button with a reason rather than a failure after you click.
 */
import { WikiScrollPage } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, WikiTable, Callout, Divider, Code, CodeBlock,
  WikiFigure, chips, TocBar, type TocItem,
} from '../shared/WikiShared';
import { ConnectDiagram } from './FlowDiagrams';

const TOC_ITEMS: TocItem[] = [
  { id: 'dk-what', emoji: '🧭', label: 'What it is' },
  { id: 'dk-connect', emoji: '🔌', label: 'Getting connected' },
  { id: 'dk-grid', emoji: '🧱', label: 'The pod grid' },
  { id: 'dk-watch', emoji: '📡', label: 'Watching' },
  { id: 'dk-actions', emoji: '🖱️', label: 'Acting on pods' },
];

export function Dk8sOverviewView() {
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          emoji="☸️"
          title="dk8s"
          subtitle="Everything a pod can tell you — logs, heap, threads, stacks — collected from a cluster and handed to the analyzers."
          chips={chips(['contexts', 'namespaces', 'live watch', 'favourites', 'permissions'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <SectionTitle id="dk-what" emoji="🧭">What it is</SectionTitle>
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
        <SectionTitle id="dk-connect" emoji="🔌">Getting connected</SectionTitle>
        <p className="dw-p">
          The binary comes from the dk8s setting if one is set, otherwise from <Code>PATH</Code>.
          Then four cheap calls establish what you can actually do, before you are offered anything.
        </p>

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
        <SectionTitle id="dk-grid" emoji="🧱">The pod grid</SectionTitle>
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
        <SectionTitle id="dk-watch" emoji="📡">Watching</SectionTitle>
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
        <SectionTitle id="dk-actions" emoji="🖱️">Acting on pods</SectionTitle>
        <p className="dw-p">
          Right-click any card or row for the pod menu; long-press to enter selection mode and act
          on several at once.
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
    </WikiScrollPage>
  );
}
