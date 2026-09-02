/**
 * The collectors: what each one runs, what it costs, and why some are refused.
 *
 * Every action on this page reaches into a container somebody is depending on,
 * so the page is written the way the panel is built — honest about the cost
 * before you pay it.
 */
import { WikiScrollPage } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, WikiTable, Callout, Divider, Code, CodeBlock,
  WikiFigure, chips, TocBar, type TocItem,
} from '../shared/WikiShared';
import { CollectDiagram } from './FlowDiagrams';

const TOC_ITEMS: TocItem[] = [
  { id: 'dr-probe', emoji: '🔦', label: 'The probe' },
  { id: 'dr-collect', emoji: '🧪', label: 'The collectors' },
  { id: 'dr-cost', emoji: '⚖️', label: 'Cost & consent' },
  { id: 'dr-artifacts', emoji: '📦', label: 'Artifacts' },
  { id: 'dr-analyze', emoji: '🩺', label: 'Analyzers' },
];

export function Dk8sDoctorView() {
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          emoji="🩺"
          title="dk8s — Doctor & Artifacts"
          subtitle="Thread dumps, histograms, heap dumps, flight recordings, Python stacks and sockets — with the exact command, and the cost, up front."
          chips={chips(['jcmd', 'jstack', 'SIGQUIT', 'JFR', 'py-spy', 'kubectl cp'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <SectionTitle id="dr-probe" emoji="🔦">One probe decides everything</SectionTitle>
        <p className="dw-p">
          Before offering anything, dk8s asks the container what it is. This is not defensive
          plumbing — it <em>is</em> the feature. It turns “that failed” into “this image has no
          jcmd”, and it is what lets a button be greyed out with a reason instead of throwing after
          you press it.
        </p>

        <WikiFigure
          label="A single exec runs one shell script that reports the shell, the available binaries, the JVM or Python pid and whether CAP_SYS_PTRACE is granted; the answer selects jcmd, jstack, SIGQUIT or nothing, and the resulting artifact is either returned as text or written in the pod and copied out."
          caption={<>One exec, not eight. Asking each question separately would be eight round trips
            for a pod you merely clicked on.</>}
        >
          <CollectDiagram />
        </WikiFigure>

        <CodeBlock label="the probe script, run through a single exec" lang="bash">{`# which shell exists, if any
for s in bash sh ash busybox; do command -v $s >/dev/null 2>&1 && echo "shell=$s" && break; done

# which tools exist
for b in tar python3 jcmd jstack jmap jfr; do command -v $b >/dev/null 2>&1 && echo "bin=$b"; done

# the JVM/interpreter pid — without ps, which slim images also lack
for p in /proc/[0-9]*; do
  e=$(readlink "$p/exe" 2>/dev/null) || continue
  case "$e" in */java) echo "pid=java:\${p#/proc/}"; break;;
                */python3*|*/python) echo "pid=python:\${p#/proc/}"; break;; esac
done

# CAP_SYS_PTRACE — bit 19 of the effective capability mask
c=$(grep -i "^CapEff:" /proc/self/status | tr -d "[:space:]" | cut -d: -f2)
[ "$(( $(printf "%d" "0x$c") / 524288 % 2 ))" -eq 1 ] && echo "cap=ptrace"

true      # a capability check that finds nothing exits 1 — without this the
          # whole probe reads as a failed exec and EVERY pod looks unreachable`}</CodeBlock>

        <Callout type="tip" title="Why CAP_SYS_PTRACE is checked up front">
          Kubernetes drops it by default. Without it py-spy attaches and then fails with “Failed to
          copy Py_Version symbol”, which tells the reader nothing — and by then py-spy has already
          been installed into a running container. Knowing first is the difference between a
          disabled button carrying a reason and a pointless mutation of a live pod.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="dr-collect" emoji="🧪">The collectors</SectionTitle>
        <p className="dw-p">
          Every one runs through <Code>kubectl exec</Code>, and every result carries the command it
          ran so you can reproduce it by hand.
        </p>
        <WikiTable
          headers={['Artifact', 'Command in the container', 'Notes']}
          rows={[
            ['Thread dump', <Code>jcmd PID Thread.print</Code>,
              <>Or <Code>jstack PID</Code> where jcmd is absent. Text comes straight back</>],
            ['Thread dump (JRE image)', <Code>kill -3 PID</Code>,
              <>SIGQUIT makes the JVM print the dump to its own stdout, so it is read back out of
                <Code>kubectl logs --tail=4000</Code> a moment later — not from the exec</>],
            ['Class histogram', <Code>jcmd PID GC.class_histogram</Code>, 'Instance counts and shallow sizes per class'],
            ['Heap dump', <Code>jcmd PID GC.heap_dump -all=false FILE</Code>,
              <>Or <Code>jmap -dump:live,format=b,file=FILE PID</Code>. Written inside the pod, then
                copied out</>],
            ['Flight recording', <Code>jcmd PID JFR.start name=dk8s duration=Ns settings=profile filename=FILE</Code>,
              'Polled while it records so the countdown is real, then copied out'],
            ['Python stacks', <Code>py-spy dump --pid PID</Code>,
              <>Only where <Code>CAP_SYS_PTRACE</Code> was granted, and only after you consent to
                installing py-spy</>],
            ['Connections', <Code>ss -tanp 2&gt;/dev/null || cat /proc/net/tcp</Code>,
              'Slim images ship neither ss nor netstat, and “no tools” is not an acceptable answer'],
          ]}
        />

        <SubTitle>Getting a file out</SubTitle>
        <CodeBlock label="heap dumps and recordings" lang="bash">{`kubectl --context C cp NS/POD:tmp/dk8s-….hprof <name> [-c CONTAINER] --retries=3`}</CodeBlock>
        <Callout type="warn" title="kubectl cp is tar over the exec channel">
          Without <Code>tar</Code> in the image it fails with an error about executable lookup that
          nobody connects to this cause — so dk8s rewrites that message. The copy also runs with the
          destination directory as its working directory and a bare filename, because a Windows path
          like <Code>C:\dumps\x.hprof</Code> is otherwise parsed as a host called <Code>C</Code>.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="dr-cost" emoji="⚖️">Cost, stated before you pay it</SectionTitle>
        <p className="dw-p">
          Two of these genuinely hurt, and they ask first — with a confirmation that names the cost
          rather than saying “are you sure?”.
        </p>
        <WikiTable
          headers={['Action', 'What it costs the pod']}
          rows={[
            ['Thread dump / histogram / stacks', 'A pause measured in milliseconds. Safe on production'],
            ['Heap dump', <>A full GC and a stop-the-world pause proportional to the heap, plus a
              file the size of the live set. This is the one that can OOM-kill a pod</>],
            ['Flight recording', 'Low overhead, but it runs for the duration you set'],
            ['py-spy', <>Installs a package into a running container — a real mutation, so it needs
              explicit consent</>],
          ]}
        />
        <SubTitle>What the memory panel is for</SubTitle>
        <p className="dw-p">
          Before a heap dump, dk8s shows four numbers side by side — the limit from the pod spec, the
          heap from the JVM, current usage from the container's own cgroup, and the free space where
          the dump would land — with a bar showing where the pod sits now and where the dump would
          take it.
        </p>
        <CodeBlock label="read from inside the container" lang="bash">{`# what the kernel actually meters when it decides to OOM-kill
cat /sys/fs/cgroup/memory.current  ||  cat /sys/fs/cgroup/memory/memory.usage_in_bytes
cat /sys/fs/cgroup/memory.max      ||  cat /sys/fs/cgroup/memory/memory.limit_in_bytes

# where the dump would be written — and whether that is RAM
stat -f -c '%T %a %S' DIR   ||   df -P DIR | tail -1`}</CodeBlock>
        <Callout type="warn" title="tmpfs is the dangerous answer">
          Writing a heap dump to a tmpfs consumes the container's own memory allowance — the dump
          file counts toward the limit that is about to kill it. That is why the filesystem type is
          checked, not just the free space.
        </Callout>
        <p className="dw-p">
          The cgroup is read first because it needs nothing installed in the cluster and does not lag
          a scrape interval. <Code>kubectl top pod POD --no-headers</Code> is the fallback for the
          case where exec is refused but the metrics API is not.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="dr-artifacts" emoji="📦">Artifacts</SectionTitle>
        <p className="dw-p">
          Everything collected lands in one place and stays there. Before this, a dump was only
          visible in the panel that collected it and vanished when the pod was closed — so the
          folder filled with files nothing in the app could see.
        </p>
        <WikiTable
          headers={['', '']}
          rows={[
            ['Naming', <><Code>{'<pod>__<kind>__<timestamp>'}</Code>, so one pod’s artifacts sort together and a second collection never overwrites the first</>],
            ['Imported files', 'A dump from anywhere else sits alongside the collected ones and opens the same analyzer'],
            ['Kind detection', 'From the filename and content — a .hprof opens the heap analyzer, a thread dump the thread analyzer'],
            ['Redaction', 'Heap analysis redacts string content by default, since a heap holds whatever the process was holding'],
          ]}
        />
      </div>

      <Divider />

      <div>
        <SectionTitle id="dr-analyze" emoji="🩺">Analyzers</SectionTitle>
        <p className="dw-p">
          Clicking an artifact opens the analyzer that understands it. All of this runs locally —
          nothing is uploaded.
        </p>
        <WikiTable
          headers={['Analyzer', 'What it answers']}
          rows={[
            ['Heap dump', 'Retained sizes, dominators and leak suspects from a .hprof — with a verdict, a histogram, a treemap, a retention graph, growth, and an explanation'],
            ['Thread dump', 'Deadlocks, lock contention and the distribution of thread states'],
            ['Logs', 'Pattern extraction, bursts and anomaly detection'],
          ]}
        />
        <Callout type="info" title="The heap parser is incremental">
          A multi-gigabyte .hprof is indexed rather than loaded, so the analyzer answers questions
          about a heap larger than the memory the editor has.
        </Callout>
      </div>
    </WikiScrollPage>
  );
}
