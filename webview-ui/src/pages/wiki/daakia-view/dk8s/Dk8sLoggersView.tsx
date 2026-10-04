/**
 * Loggers, patterns, fields and determinants — how a pod's log becomes
 * something you can list, recognise, filter by, follow and ask about.
 *
 * Written from the Loggers field guide, against the app as it is. The demo
 * near the end runs the app's own pattern code on whatever is typed into it.
 */
import { useMemo, useState } from 'react';
import { WikiScrollPage } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, WikiTable, Callout, Divider, Code, CodeBlock,
  chips, TocBar, type TocItem,
} from '../shared/WikiShared';
import { fromAnyCall } from '../../../../components/k8s/logger-calls';
import { compilePattern, matchPattern, templateParts } from '../../../../components/k8s/logger-pattern';

const TOC_ITEMS: TocItem[] = [
  { id: 'lg-line', icon: 'layers', label: 'A line, taken apart' },
  { id: 'lg-loggers', icon: 'book', label: '1 · Loggers' },
  { id: 'lg-patterns', icon: 'pencil', label: '2 · Patterns' },
  { id: 'lg-fields', icon: 'braces', label: '3 · Fields' },
  { id: 'lg-determinants', icon: 'gauge', label: '4 · Determinants' },
  { id: 'lg-examples', icon: 'code', label: 'Worked examples' },
  { id: 'lg-try', icon: 'play', label: 'Try a pattern' },
  { id: 'lg-faq', icon: 'help', label: 'Questions' },
];

export function Dk8sLoggersView() {
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          icon="book"
          title="dk8s — Loggers & Fields"
          subtitle="A pod's log is text. dk8s turns it into loggers you can list, messages you can recognise, values you can filter by and follow across pods, and questions that answer themselves in every window you open."
          chips={chips(['Loggers tab', 'Add patterns', 'four readers', 'Correlate by', 'Determinants', 'Spring Boot'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <SectionTitle id="lg-line" icon="layers">A line, taken apart</SectionTitle>
        <p className="dw-p">
          One line from a pod, and what dk8s reads off it. Every piece comes from one of four readers —
          the layout pattern, the MDC and <Code>key=value</Code> pairs, the logger&rsquo;s own patterns, and the
          keys inside a payload — and every piece it finds becomes a field you can filter by and follow.
        </p>
        <CodeBlock label="zp-backend · one line from its log" lang="text">{`10:02:11.408 WARN [http-nio-7] c.z.b.BcblClient bcbl api slow for request: R-88213 took 3120 ms traceId=9f3c2a {"pool":{"active":18}}`}</CodeBlock>
        <WikiTable
          headers={['Field', 'Value', 'Found by']}
          rows={[
            ['time · level · thread · logger', '10:02:11.408 · WARN · http-nio-7 · c.z.b.BcblClient', 'the layout pattern'],
            [<Code>reqId</Code>, 'R-88213', 'the logger’s own pattern — a hole named after its argument'],
            [<Code>tookMs</Code>, '3120', 'the logger’s own pattern'],
            [<Code>traceId</Code>, '9f3c2a', 'MDC and key=value'],
            [<Code>pool.active</Code>, '18', 'keys inside a payload'],
          ]}
        />
        <p className="dw-p">
          It happens in four steps, in the order you meet them: <b>catalogue</b> the loggers, teach each one what it can
          say (<b>patterns</b>), <b>extract</b> the values (fields), and save the questions you keep asking
          (<b>determinants</b>).
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="lg-loggers" icon="book">Step 1 · Which loggers this workload has — before they fire</SectionTitle>
        <p className="dw-p">
          <b>Pod → Loggers</b> is a catalogue for the <em>workload</em>, not the pod: a rollout renames every pod, and the
          catalogue stays. Each logger shows its level, where it was found, how often it wrote in the window, and the
          patterns you have taught it.
        </p>
        <WikiTable
          headers={['Source', 'What it means']}
          rows={[
            ['seen in logs', 'It wrote in this window.'],
            ['declared', 'Named in the pod’s logging config (logback.xml, application.yml).'],
            ['source code', 'Scanned from your project — so a class that has never fired here still has its patterns ready.'],
            ['added by hand', 'You typed it.'],
          ]}
        />
        <SubTitle>The loggers that went quiet</SubTitle>
        <p className="dw-p">
          Declared or scanned, but wrote nothing in the window. A refund logger silent for two hours is the thing worth
          noticing — so it is amber and has its own filter, <b>Never fired here</b>.
        </p>
        <SubTitle>What you can do with one</SubTitle>
        <p className="dw-p">
          Open a row for <b>Show in Logs</b> (the Logs tab filtered to it), <b>Watch this logger</b> (marks all its
          patterns), <b>Copy patterns</b>, <b>Add patterns</b>, and <b>Remove logger</b> for one you declared. Right-click
          has the same. The left rail groups loggers by package and by where they were found, each with a count — click
          one to narrow the table.
        </p>
        <Callout type="info" title="Live levels through a forward">
          With the pod&rsquo;s management port forwarded (see Port Forwarding), the Loggers tab can change a
          logger&rsquo;s level on the running app — with a timer that puts it back, and a confirmation on production.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="lg-patterns" icon="pencil">Step 2 · Teach a logger what it can say</SectionTitle>
        <p className="dw-p">
          A log never carries the <Code>{'{}'}</Code> — it carries the value. Give dk8s the call that writes a line, and it
          keeps the fixed text around each hole and names the hole after the argument. The line is then found however
          the value changes, and the value becomes a field. <b>Loggers → Add patterns</b> offers four ways in:
        </p>
        <WikiTable
          headers={['Way', 'You give it', 'It keeps']}
          rows={[
            ['Paste the code', <Code>{'log.warn("bcbl api slow for request:{} took {}ms", reqId, tookMs);'}</Code>, <Code>{'bcbl api slow for request:{reqId} took {tookMs}ms'}</Code>],
            ['Scan the repository', 'A project folder', 'Every logger call in the source, filed under the logger each names. Linked to the workload, so it rescans when the project changes.'],
            ['Learn from the log', 'What the pod wrote', 'Lines that differ only in their values grouped into one shape — name the holes and add it.'],
            ['Write one by hand', <Code>{'checking bcbl api for request: {reqId}'}</Code>, 'Fixed text with named holes in braces.'],
          ]}
        />
        <p className="dw-p">
          It reads SLF4J <Code>{'{}'}</Code>, printf <Code>%s</Code>, Python f-strings, pino/bunyan objects, Go&rsquo;s slog and
          plain text. Each pattern is tested against the last two hours on the pod before you add it — its level and how
          many lines it matched. Tick <b>Mark all after adding</b> and the Logs tab lights its lines up at once, the
          fastest way to see it is right.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="lg-fields" icon="braces">Step 3 · Four readers turn a line into fields</SectionTitle>
        <p className="dw-p">
          Follow can only offer what a line actually names. Every line is read by four readers, in this order
          (<b>Settings → DK8S → Logs → Fields</b>):
        </p>
        <WikiTable
          headers={['Reader', 'Reads', 'Example']}
          rows={[
            ['1 · The layout pattern', 'Time, level, thread, logger — read out of logback.xml in the container, or learned from the first lines when there is none.', <Code>%d %-5level [%thread] %logger</Code>],
            ['2 · MDC and key=value', 'Anything written as a pair: the MDC, logfmt, or by hand.', <Code>{'traceId=9f3c2a user="ana b"'}</Code>],
            ['3 · The logger’s own holes', 'The patterns from step 2 — each hole named after its argument.', <Code>{'"took {}ms", tookMs'}</Code>],
            ['4 · Keys inside a payload', 'Every leaf path in JSON, XML or YAML, so a value three deep is still followable.', <Code>pool.active, card.last4</Code>],
          ]}
        />
        <SubTitle>Correlate by</SubTitle>
        <p className="dw-p">
          When you follow a whole line rather than one value, dk8s follows the first of these the line has — drag to
          reorder, untick to skip. The usual order is <Code>traceId</Code> (one request through every service), then your
          own id such as <Code>requestDataId</Code>, then <Code>thread</Code> as the last resort.
        </p>
        <Callout type="warn" title="Thread is the last resort">
          A thread name is only unique inside one pod, and only until it goes back to the pool — so following one always
          pins the time window, which is why Follow opens at ±90 seconds. And Follow asks first before following a value
          on more than 500 lines: a value on every call to a service is a filter over the whole log, and that should be
          a choice.
        </Callout>
        <SubTitle>A field the readers did not find</SubTitle>
        <p className="dw-p">
          Name it once and it appears on every line that carries it, on every pod — by pasting the call, writing a regex,
          or picking it in a line. Tested against what is on the pods now, and saved with the workspace, shared the way
          collections are.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="lg-determinants" icon="gauge">Step 4 · A question you keep asking, answered every time</SectionTitle>
        <p className="dw-p">
          Which APIs were called, what went out to another service, what retried, how the cache did. Save the question
          once — the call that writes the line, and how to summarise it — and every <b>Window</b> you open around a hit
          answers it without being asked (<b>Settings → DK8S → Logs → Determinants</b>).
        </p>
        <CodeBlock label='a determinant: "Cache hits and misses", every workload' lang="java">{`log.debug("cache {} for key {} in {}ms", outcome, key, took);

// summarise: how many per outcome · slowest by took · count each key · draw it over the window`}</CodeBlock>
        <WikiTable
          headers={['In the Window tab', '']}
          rows={[
            ['hit', '412'],
            ['miss', '38'],
            ['error', '2'],
            ['slowest', '10:14:02 · 812 ms · merchant:M-40'],
          ]}
        />
        <p className="dw-p">
          Determinants are saved with the workspace and travel with a shared workspace — a tester opens a pod and already
          has the team&rsquo;s questions. A row is red only when the service broke it (a 5xx); a 404 or 409 is the
          caller&rsquo;s problem and is amber.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="lg-examples" icon="code">Worked examples · Spring Boot and logback</SectionTitle>

        <SubTitle>1 · Spring Boot&rsquo;s own pattern, with tracing — and an exception</SubTitle>
        <CodeBlock label="logback-spring.xml" lang="xml">{`<property name="CONSOLE_LOG_PATTERN"
  value="%d{yyyy-MM-dd'T'HH:mm:ss.SSSXXX} %5p [\${APP},%X{traceId:-},%X{spanId:-}] %pid --- [%15.15t] %-40.40logger{39} : %m%n%wEx"/>`}</CodeBlock>
        <CodeBlock label="what the pod writes" lang="text">{`2026-09-27T10:14:02.911+05:30 ERROR [order-service,6f1c2e9ab04d7a13,b04d7a13e2f0] 1 --- [nio-8080-exec-7] c.z.o.client.PaymentClient : payment P-90412 failed for order A-4470 after 3 retries
org.springframework.web.client.ResourceAccessException: I/O error on POST "http://payment-svc/charge": Read timed out
    at o.s.web.client.RestTemplate.doExecute(RestTemplate.java:905)`}</CodeBlock>
        <p className="dw-p">
          Read out of the pattern, not guessed: <Code>%X{'{'}traceId:-{'}'}</Code> in that position makes the second value in
          the brackets the trace id, so it is a field though the line never says &ldquo;traceId&rdquo;. The holes of{' '}
          <Code>{'"payment {} failed for order {} after {} retries"'}</Code> give <Code>paymentId</Code>, <Code>orderId</Code> and{' '}
          <Code>retries</Code>; the stack trace folds into the ERROR line. Click the line in Follow and Correlate by takes
          <Code>traceId</Code> first — this request in the gateway, order-service and payment-svc, in time order.
        </p>

        <SubTitle>2 · JSON logs from logstash-logback-encoder</SubTitle>
        <CodeBlock label="one line, spread out here" lang="json">{`{"@timestamp":"2026-09-27T10:21:44.120+05:30","level":"WARN","thread_name":"refund-worker-3",
 "logger_name":"com.zp.refund.RefundService","message":"refund R-551 exceeded the daily limit",
 "traceId":"a91f03c7d2e84b10","tenant":"eu-1","merchantId":"M-12",
 "refund":{"amount":1200.50,"currency":"EUR","card":{"brand":"visa","last4":"4242"}}}`}</CodeBlock>
        <p className="dw-p">
          The message is still a sentence — <em>refund R-551 exceeded the daily limit</em> — with a chip for the payload
          rather than a wall of JSON. <Code>traceId</Code> and <Code>tenant</Code> come from the MDC keys,{' '}
          <Code>merchantId</Code> from <Code>kv()</Code>, <Code>refund.currency</Code> and <Code>refund.card.last4</Code> from the
          payload. Keys that look secret (<Code>token</Code>, <Code>password</Code>, <Code>authorization</Code>) are drawn as dots.
        </p>

        <SubTitle>3 · One request across three services, with your own id</SubTitle>
        <CodeBlock label="a filter in every service puts the caller's header in the MDC" lang="java">{`MDC.put("requestDataId", req.getHeader("X-Request-Data-Id"));
log.info("--> {} {} {} in {}ms", req.getMethod(), host, res.getStatusCode().value(), took);`}</CodeBlock>
        <p className="dw-p">
          With <Code>requestDataId</Code> in Correlate by, clicking any line follows <Code>rid=RD-7731</Code> across the gateway,
          order and payment pods in time order — the 30-second gap between the payment call and its error plain to see.
          Saved as a determinant (<Code>{'--> {method} {host} {status} in {took}ms'}</Code>, per host · status, slowest by took),
          every window around a failure already says whether payment-svc is timing out for everyone or only for this
          request.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="lg-try" icon="play">Try a pattern</SectionTitle>
        <p className="dw-p">
          Paste a logger call and a line the pod wrote. This runs the app&rsquo;s own pattern code: the template it keeps,
          the holes it names, and the fields it reads off the line.
        </p>
        <PatternDemo />
      </div>

      <Divider />

      <div>
        <SectionTitle id="lg-faq" icon="help">Questions</SectionTitle>
        <WikiTable
          headers={['', '']}
          rows={[
            ['Pattern or field?', 'A pattern recognises a kind of line; a field is a value read off a line. A pattern’s holes are one of the four places fields come from.'],
            ['"Declared, never fired in this window"?', 'Named in the config or your code, but silent in the window. Widen it — or treat the silence as the finding.'],
            ['Do I need to redeploy anything?', 'No. Everything reads what the pod already writes. Patterns, fields and determinants are saved with the workspace and travel with Git Sync.'],
            ['"N lines" or "N mention it"?', '"N lines" is an exact field — Follow can filter on it. "N mention it" means the value is only inside the text, so dk8s can search for it but not filter by it.'],
            ['Is anything sent to AI without a click?', 'No. Payloads, fields, the ribbon, Follow and Window run on your machine. Lines go to a model only when you press Analyze or Ask AI, ask in Ask the log, or ask Daakia AI — secrets masked first.'],
          ]}
        />
      </div>
    </WikiScrollPage>
  );
}

// ── The demo ────────────────────────────────────────────────────────────────

const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';

export function PatternDemo() {
  const [call, setCall] = useState('log.warn("bcbl api slow for request:{} took {}ms", reqId, tookMs);');
  const [line, setLine] = useState('bcbl api slow for request:R-88213 took 3120ms');
  const pattern = useMemo(() => fromAnyCall(call.trim()), [call]);
  const hit = useMemo(() => {
    if (!pattern) return undefined;
    try { return matchPattern(compilePattern(pattern), line); } catch { return undefined; }
  }, [pattern, line]);

  const field: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 7, fontFamily: MONO, fontSize: 12.5,
    color: 'var(--color-text-primary)', background: 'var(--color-input, var(--color-surface))',
    border: '1px solid var(--color-surface-border)', outline: 'none',
  };
  const label: React.CSSProperties = { fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)' };

  return (
    <div className="flex flex-col" style={{
      gap: 12, padding: 14, borderRadius: 12, border: '1px solid var(--color-surface-border)',
      background: 'var(--color-panel, var(--color-surface))',
    }}>
      <label className="flex flex-col" style={{ gap: 5 }}>
        <span style={label}>The logger call</span>
        <input aria-label="Logger call" value={call} onChange={e => setCall(e.target.value)} style={field} />
      </label>
      <label className="flex flex-col" style={{ gap: 5 }}>
        <span style={label}>A line the pod wrote</span>
        <input aria-label="Log line" value={line} onChange={e => setLine(e.target.value)} style={field} />
      </label>

      {!pattern ? (
        <p className="dw-p" role="status" style={{ margin: 0, color: 'var(--color-warning)' }}>
          Not a call dk8s can read a message out of. Try <Code>{'log.info("settling batch {} for merchant {}", batchId, merchantId);'}</Code>
        </p>
      ) : (
        <div className="flex flex-col" style={{ gap: 10 }} role="status">
          <div className="flex flex-col" style={{ gap: 5 }}>
            <span style={label}>dk8s keeps{pattern.level ? ` · ${pattern.level}` : ''}</span>
            <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--color-text-primary)', overflowWrap: 'anywhere' }}>
              {templateParts(pattern.template).map((p, i) => p.hole
                ? <span key={i} style={{ color: 'var(--color-dk8s)', borderBottom: '2px dashed var(--color-dk8s)' }}>{`{${p.text}}`}</span>
                : <span key={i}>{p.text}</span>)}
            </div>
          </div>
          <WikiTable
            headers={['Field', 'From this line']}
            rows={pattern.holes.length
              ? pattern.holes.map(h => [<Code key={h}>{h}</Code>, hit ? <span style={{ fontFamily: MONO, color: 'var(--color-dk8s)' }}>{hit.fields[h] ?? '—'}</span> : <span style={{ color: 'var(--color-text-muted)' }}>the line does not match</span>])
              : [['(no holes)', 'A fixed message — it recognises the line, and names nothing in it.']]}
          />
        </div>
      )}
    </div>
  );
}
