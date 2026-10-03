/**
 * Port forwarding: a pod's port on this machine, kept up, and plugged into the
 * rest of Daakia.
 *
 * The demo near the end runs the same code the app does — the parser that
 * reads a suggested `kubectl port-forward`, the production rule, the snippet
 * builders — on whatever command is typed into it. It starts nothing.
 */
import { useMemo, useState } from 'react';
import { WikiScrollPage } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, WikiTable, Callout, Divider, Code, CodeBlock,
  chips, TocBar, type TocItem,
} from '../shared/WikiShared';
import { parsePortForward, roleOfPort } from '../../../../components/k8s/forward-proposal';
import { envLines, applicationYml, connectionUrl } from '../../../../components/k8s/forward-snippets';
import { isProdContext, type ForwardPort } from '../../../../store/dk8s-port-forward-store';

const TOC_ITEMS: TocItem[] = [
  { id: 'pf-how', icon: 'network', label: 'How it works' },
  { id: 'pf-start', icon: 'play', label: 'Starting one' },
  { id: 'pf-use', icon: 'link', label: 'Using it' },
  { id: 'pf-ai', icon: 'ai', label: 'From Daakia AI' },
  { id: 'pf-guard', icon: 'shield', label: 'Production' },
  { id: 'pf-try', icon: 'code', label: 'Try it' },
];

export function Dk8sPortForwardView() {
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          icon="network"
          title="dk8s — Port Forwarding"
          subtitle="A pod's port on localhost, kept up through restarts and rollouts, and handed straight to a request tab, an environment variable, the actuator or your debugger."
          chips={chips(['kubectl port-forward', '127.0.0.1', 'saved sets', 'actuator', 'JDWP', 'production guard'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <SectionTitle id="pf-how" icon="network">How it works</SectionTitle>
        <p className="dw-p">
          dk8s runs <Code>kubectl port-forward</Code> on your machine, one process per forward, bound
          to <Code>127.0.0.1</Code>. The tunnel goes through the API server to the pod's kubelet;
          nothing is installed in the cluster. dk8s reads what the process prints, counts the
          connections, and starts it again when the pod goes away.
        </p>
        <CodeBlock label="what dk8s runs for a forward — recorded in the Commands audit" lang="bash">{`kubectl --context com-eastus-zp-dev -n com-zp-dev \\
  port-forward pod/zp-backend-79879f65f7-6f5zb 8080:8080 18081:8081 --address 127.0.0.1`}</CodeBlock>
        <WikiTable
          headers={['Fact', 'What it means for you']}
          rows={[
            ['One pod at a time', <>Even <Code>svc/zp-backend</Code> lands on a single pod. The forward always says which.</>],
            ['TCP only', 'HTTP, gRPC, WebSocket, JDWP, Postgres, Redis. UDP cannot be forwarded by kubectl.'],
            ['Your permissions', <>It needs <Code>create pods/portforward</Code>. The Access tab shows it before you press Forward.</>],
            ['Where “local” is', 'The machine running Daakia’s host — in a remote VS Code window, the remote machine.'],
          ]}
        />
      </div>

      <Divider />

      <div>
        <SectionTitle id="pf-start" icon="play">Starting one</SectionTitle>
        <p className="dw-p">
          A pod's <b>Ports</b> tab lists the ports it declares, each with a guessed role (HTTP API,
          actuator, JVM debug, Postgres…), the Services that route to it, and a local port that
          defaults to the same number. <b>Forward</b> starts it. The <b>Forwards</b> panel on the pods
          page lists every forward across clusters, and starts a saved set in one click.
        </p>
        <WikiTable
          headers={['When', 'What happens']}
          rows={[
            ['The local port is free, the context is not production', 'It starts at once.'],
            ['The local port is taken', 'A dialog names the process holding it and offers the next free port, or one you type.'],
            ['The context is production', 'A dialog asks first, and the forward stops on its own after 60 minutes.'],
            ['The pod is replaced by a rollout', 'The forward follows the workload to its new pod and reconnects.'],
            ['Nothing has used it for a while', 'It stops after the idle time set in Settings → DK8S → Port forwarding.'],
          ]}
        />
      </div>

      <Divider />

      <div>
        <SectionTitle id="pf-use" icon="link">Using it</SectionTitle>
        <p className="dw-p">The <b>⋯</b> on a running forward turns the address into the next step.</p>
        <WikiTable
          headers={['Action', 'What it does']}
          rows={[
            ['New request here', 'A REST, GraphQL, WebSocket or gRPC tab on the forwarded address — past the ingress and the gateway.'],
            ['Bind to an environment variable', <><Code>{'{{zp_backend}}'}</Code> follows the forward: if the local port changes on restart, the variable changes with it.</>],
            ['Import its OpenAPI', <>Tries <Code>/v3/api-docs</Code>, <Code>/swagger.json</Code> and <Code>/openapi.json</Code> and imports what it finds as a collection.</>],
            ['Actuator', 'Health, info, metrics, a thread dump and a heap dump that opens in the heap analyzer. Logger levels change live, with a timer that puts them back.'],
            ['Attach VS Code debugger', 'For a JDWP (5005) or debugpy (5678) port, in VS Code.'],
            ['Copy as', <>The URL, a <Code>.env</Code> line, an <Code>application-local.yml</Code> block, a JDBC or psql string, or the kubectl command.</>],
          ]}
        />
        <Callout type="info" title="dk8s never reads a Secret">
          A copied database string leaves <Code>&lt;user&gt;</Code>, <Code>&lt;password&gt;</Code> and
          <Code>&lt;database&gt;</Code> for you to fill in.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="pf-ai" icon="ai">From Daakia AI</SectionTitle>
        <p className="dw-p">
          Ask Daakia AI how to reach a service and it can suggest a forward. It shows as a
          <b> FORWARD</b> row with the command, what it would reach, and <b>Forward…</b>. Forward…
          opens the same dialog the Ports tab uses, with “Suggested by Daakia AI” at the top — even
          when the port is free and the context is not production. The chat never starts a forward
          itself; you do, from the dialog.
        </p>
        <p className="dw-p">
          A suggestion for a pod dk8s is not watching says so instead of offering the button. A
          <Code>deploy/…</Code> lands on a running pod of that workload; a <Code>svc/…</Code> on a pod
          of the workload it is named for.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="pf-guard" icon="shield">Production</SectionTitle>
        <p className="dw-p">
          A context is production when it matches <Code>*prod*</Code> or a pattern added in Settings.
          Forwarding into one asks first and stops after an hour. And because{' '}
          <Code>localhost:18081</Code> stops being local the moment it is a production pod, the
          <b> Load Tester</b> refuses a URL that reaches a production forward until you tick “Run it
          against production anyway” for that URL. The host checks again before it sends a single
          request, so the guard holds even when the screen did not know about the forward.
        </p>
        <SubTitle>What the refusal says</SubTitle>
        <CodeBlock label="load:error" lang="text">{`http://localhost:18081/actuator/health reaches zp-backend-6f5zb on com-eastus-zp-prod
— production, through a dk8s forward. Confirm it in the Load Tester to run against it.`}</CodeBlock>
      </div>

      <Divider />

      <div>
        <SectionTitle id="pf-try" icon="code">Try it</SectionTitle>
        <p className="dw-p">
          Type a <Code>kubectl port-forward</Code> the way Daakia AI would suggest one. This reads it
          with the app's own parser and shows what dk8s would make of it. Nothing is started.
        </p>
        <ForwardDemo />
      </div>
    </WikiScrollPage>
  );
}

// ── The demo ────────────────────────────────────────────────────────────────

const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';

export function ForwardDemo() {
  const [command, setCommand] = useState('kubectl -n com-zp-dev port-forward deploy/zp-backend 8080:8080 5005:5005');
  const [context, setContext] = useState('com-eastus-zp-dev');
  const parsed = useMemo(() => parsePortForward(command), [command]);

  const target = parsed && {
    pod: parsed.name,
    ...(parsed.kind === 'deploy' ? { workload: { kind: 'Deployment', name: parsed.name } } : {}),
    ...(parsed.kind === 'svc' ? { service: parsed.name } : {}),
    ports: parsed.ports.map((p): ForwardPort => ({ local: p.local || p.remote, remote: p.remote, role: roleOfPort(p.remote) })),
  };
  const ctx = parsed?.context ?? context;
  const prod = !!ctx && isProdContext(ctx, ['*prod*']);

  const field: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 7, fontFamily: MONO, fontSize: 12.5,
    color: 'var(--color-text-primary)', background: 'var(--color-input, var(--color-surface))',
    border: '1px solid var(--color-surface-border)', outline: 'none',
  };

  return (
    <div className="flex flex-col" style={{
      gap: 12, padding: 14, borderRadius: 12, border: '1px solid var(--color-surface-border)',
      background: 'var(--color-panel, var(--color-surface))',
    }}>
      <label className="flex flex-col" style={{ gap: 5 }}>
        <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Command</span>
        <input aria-label="kubectl port-forward command" value={command} onChange={e => setCommand(e.target.value)} style={field} />
      </label>
      <label className="flex flex-col" style={{ gap: 5 }}>
        <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Context you are watching</span>
        <input aria-label="Context" value={context} onChange={e => setContext(e.target.value)} style={field} />
      </label>

      {!parsed || !target ? (
        <p className="dw-p" role="status" style={{ margin: 0, color: 'var(--color-warning)' }}>
          Not a port-forward dk8s can read — it offers no Forward… button for this. Try
          <Code>kubectl port-forward pod/postgres-0 15432:5432</Code>.
        </p>
      ) : (
        <div className="flex flex-col" style={{ gap: 10 }} role="status">
          <WikiTable
            headers={['', 'What dk8s makes of it']}
            rows={[
              ['Reaches', <>{parsed.kind === 'svc' ? `svc/${parsed.name}` : parsed.kind === 'deploy' ? `a running pod of ${parsed.name}` : parsed.name}
                {' '}in <Code>{ctx || '(the context you are watching)'}</Code> / <Code>{parsed.namespace ?? '(the namespace you are watching)'}</Code></>],
              ['On this machine', <span className="flex flex-wrap" style={{ gap: 6 }}>{target.ports.map(p => <Code key={p.local}>{connectionUrl(p)}</Code>)}</span>],
              ['Ports', target.ports.map(p => `${p.remote} · ${p.role || 'unknown role'}`).join('   ')],
            ]}
          />
          {prod && (
            <Callout type="warn" title="Production">
              <Code>{ctx}</Code> matches <Code>*prod*</Code>. The dialog asks before this starts, it stops after 60 minutes,
              and the Load Tester will not run against these ports until you confirm.
            </Callout>
          )}
          <CodeBlock label=".env" lang="bash">{envLines([target])}</CodeBlock>
          {applicationYml([target]) && <CodeBlock label="application-local.yml" lang="yaml">{applicationYml([target])}</CodeBlock>}
        </div>
      )}
    </div>
  );
}
