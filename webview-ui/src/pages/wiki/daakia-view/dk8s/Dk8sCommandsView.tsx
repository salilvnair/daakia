/**
 * Every kubectl invocation dk8s makes, in one place.
 *
 * The point is reproducibility: anything dk8s shows you, you can get yourself
 * from a terminal. That is also the honest way to document a tool that reaches
 * into other people's production pods.
 */
import { WikiScrollPage } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, WikiTable, Callout, Divider, Code, CodeBlock,
  chips, TocBar, type TocItem,
} from '../shared/WikiShared';

const TOC_ITEMS: TocItem[] = [
  { id: 'cm-shape', emoji: '🧾', label: 'The shape' },
  { id: 'cm-connect', emoji: '🔌', label: 'Connect' },
  { id: 'cm-pods', emoji: '🧱', label: 'Pods' },
  { id: 'cm-logs', emoji: '📜', label: 'Logs' },
  { id: 'cm-collect', emoji: '🧪', label: 'Collectors' },
  { id: 'cm-local', emoji: '💻', label: 'Done locally' },
];

export function Dk8sCommandsView() {
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          emoji="⌘"
          title="dk8s — behind the scenes"
          subtitle="Every kubectl command dk8s runs, what triggers it, and what it does with the answer."
          chips={chips(['auth can-i', 'get --watch', 'logs', 'exec', 'cp', 'top'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <SectionTitle id="cm-shape" emoji="🧾">The shape of every call</SectionTitle>
        <CodeBlock label="always" lang="bash">{`kubectl --context <CONTEXT> -n <NAMESPACE> <verb> …`}</CodeBlock>
        <p className="dw-p">
          The context and namespace are always explicit. dk8s never relies on your
          <Code>current-context</Code>, because you may have several clusters selected at once and
          the pod you clicked belongs to exactly one of them.
        </p>
        <Callout type="info" title="Argv, never a shell">
          Arguments are passed as an array. Nothing is interpolated into a command string, so a pod
          named <Code>x; rm -rf ~</Code> is a pod with a strange name and not a shell injection. The
          one place a shell appears is <em>inside</em> the container, as the argument to
          <Code>exec … -- sh -c</Code>, where the script is a constant and the pod name is not part
          of it.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="cm-connect" emoji="🔌">Connecting</SectionTitle>
        <WikiTable
          headers={['When', 'Command']}
          rows={[
            ['Checking the cluster answers', <Code>version -o json --request-timeout=8s</Code>],
            ['Filling the namespace picker', <Code>get namespaces -o name</Code>],
            ['Your default namespace', <Code>config view --minify -o jsonpath={'{..namespace}'}</Code>],
            ['What you may do', <Code>auth can-i get pods/log --quiet</Code>],
            ['', <Code>auth can-i create pods/exec --quiet</Code>],
            ['', <Code>auth can-i get pods --quiet</Code>],
          ]}
        />
      </div>

      <Divider />

      <div>
        <SectionTitle id="cm-pods" emoji="🧱">Pods</SectionTitle>
        <WikiTable
          headers={['When', 'Command']}
          rows={[
            ['Filling the grid', <Code>get pods -o json</Code>],
            ['Keeping it live', <Code>get pods -o json --watch --output-watch-events</Code>],
            ['CPU / memory columns', <Code>top pods --no-headers</Code>],
            ['Opening a pod', <Code>get pod POD -o json</Code>],
            ['Describe tab', <Code>describe pod POD</Code>],
            ['YAML tab', <Code>get pod POD -o yaml</Code>],
            ['Memory panel fallback', <Code>top pod POD --no-headers</Code>],
          ]}
        />
        <Callout type="tip" title="Why the watch lists first">
          A stream that cannot start fails silently in the background; a list that cannot run is an
          error you can see. Listing first also means a reconnect re-syncs rather than resuming into
          a world that moved on while the stream was down.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="cm-logs" emoji="📜">Logs</SectionTitle>
        <CodeBlock label="viewing" lang="bash">{`kubectl … logs POD [--follow] [-c C] [--previous] --timestamps [--since=Ns] --tail=N`}</CodeBlock>
        <CodeBlock label="searching — the same command, read line by line" lang="bash">{`kubectl … logs POD [--all-containers=true --prefix] [--previous] \\
  --timestamps [--since-time=RFC3339 | --since=Ns] --tail=N`}</CodeBlock>
        <WikiTable
          headers={['Flag', 'Comes from']}
          rows={[
            [<Code>--timestamps</Code>, 'Always on. It is the one timestamp that carries an explicit Z, so time filtering on live logs is exact'],
            [<Code>--since-time</Code>, <>An absolute window (<Code>Between…</Code>). Exact, where <Code>--since</Code> is relative to when the command runs</>],
            [<Code>--since</Code>, 'A relative preset — Last 1h and friends'],
            [<Code>--tail=N</Code>, 'How much of the log to scan'],
            [<Code>--tail=-1</Code>, 'Reading from the beginning — asking for the head means asking for everything and stopping early'],
            [<Code>--previous</Code>, 'Include the container before this one, where a crashlooper’s cause is'],
            [<Code>--all-containers --prefix</Code>, 'Only when the pod has more than one container'],
          ]}
        />
        <Callout type="warn" title="There is no --until">
          <Code>kubectl logs</Code> has a lower bound and no upper one, so the end of a time window
          is enforced per line as the stream is read. The alternative would be pulling the log up to
          now and calling that a filter.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="cm-collect" emoji="🧪">Collectors</SectionTitle>
        <CodeBlock label="the wrapper" lang="bash">{`kubectl --context C -n NS exec POD [-c CONTAINER] -- <command>`}</CodeBlock>
        <WikiTable
          headers={['Purpose', 'Command inside the container']}
          rows={[
            ['Capability probe', <><Code>sh -c '…'</Code> — one script: shell, binaries, pid, CAP_SYS_PTRACE</>],
            ['Shell', <Code>exec -it POD -- bash|sh|ash|busybox</Code>],
            ['Thread dump', <Code>jcmd PID Thread.print</Code>],
            ['Thread dump (older JDK)', <Code>jstack PID</Code>],
            ['Thread dump (JRE image)', <><Code>kill -3 PID</Code>, then <Code>logs POD --tail=4000</Code> to read it back</>],
            ['Class histogram', <Code>jcmd PID GC.class_histogram</Code>],
            ['Heap dump', <Code>jcmd PID GC.heap_dump -all=false FILE</Code>],
            ['Heap dump (older JDK)', <Code>jmap -dump:live,format=b,file=FILE PID</Code>],
            ['Flight recording', <Code>jcmd PID JFR.start name=dk8s duration=Ns settings=profile filename=FILE</Code>],
            ['Python stacks', <><Code>which py-spy</Code>, then <Code>pip install --quiet --no-input py-spy</Code>, then <Code>py-spy dump --pid PID</Code></>],
            ['Connections', <Code>sh -c 'ss -tanp 2&gt;/dev/null || cat /proc/net/tcp'</Code>],
            ['Memory limits & usage', <Code>sh -c 'cat /sys/fs/cgroup/memory.current …'</Code>],
            ['Dump destination', <Code>sh -c "stat -f -c '%T %a %S' DIR || df -P DIR | tail -1"</Code>],
            ['Retrieving a file', <Code>cp NS/POD:path/to/file NAME [-c C] --retries=3</Code>],
          ]}
        />
        <Callout type="info" title="Every result shows its own command">
          Each collector reports the exact invocation it ran, for display only — it is never
          re-parsed. If something looks wrong, you can paste it into a terminal and see for yourself.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="cm-local" emoji="💻">What does not touch the cluster</SectionTitle>
        <p className="dw-p">
          A good deal of dk8s runs entirely on your machine. Worth knowing, because these cost the
          cluster nothing and work with no connection at all.
        </p>
        <WikiTable
          headers={['Feature', 'Where it runs']}
          rows={[
            ['Log matching and context', 'Locally — lines stream in and are matched a line at a time; only matches come back to the view'],
            ['Archived logs', 'Locally — files on a mounted volume, read directly. The cluster is not involved'],
            ['Heap, thread and log analysis', 'Locally, on the artifact file. Nothing is uploaded'],
            ['Format detection', 'Locally, from a sample of the stream'],
            ['Export', 'Locally — the search runs again with its caps lifted and writes the files'],
          ]}
        />
      </div>
    </WikiScrollPage>
  );
}
