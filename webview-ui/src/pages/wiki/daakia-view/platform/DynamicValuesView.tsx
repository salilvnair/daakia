import { useMemo } from 'react';
import { WikiScrollPage } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, FeatureGrid, Callout, WikiTable, Code, CodeBlock,
  Divider, chips, TocBar, type TocItem,
} from '../shared/WikiShared';
import { TEMPLATE_HELPERS, HELPER_CATEGORY_LABELS, type HelperCategory } from '@daakia/template-catalog';
import { useDynamicVarsStore } from '../../../../store/dynamic-vars-store';

/**
 * The `{{ }}` reference.
 *
 * Both tables are built from the same lists the app itself uses — the helper
 * catalogue the engine is tested against, and the registry the host sends on
 * startup. A page that listed them by hand would document whichever set
 * existed on the day it was written, and the reader would have no way of
 * telling which entries had stopped being true.
 */

const TOC_ITEMS: TocItem[] = [
  { id: 'dv-three', icon: 'braces', label: 'Three kinds' },
  { id: 'dv-where', icon: 'search', label: 'Finding them' },
  { id: 'dv-helpers', icon: 'dice', label: 'Helpers' },
  { id: 'dv-dynamic', icon: 'variables', label: 'Dynamic values' },
  { id: 'dv-request', icon: 'send', label: 'This request' },
  { id: 'dv-rules', icon: 'info', label: 'How they resolve' },
  { id: 'dv-scripts', icon: 'script', label: 'In scripts' },
  { id: 'dv-mock', icon: 'mock', label: 'In mock responses' },
];

const CATEGORY_ORDER: HelperCategory[] = [
  'random', 'date', 'request', 'string', 'number', 'json', 'encode', 'logic', 'fake',
];

export function DynamicValuesView() {
  const dynamicVars = useDynamicVarsStore(s => s.variables);

  const helpersByCategory = useMemo(() => CATEGORY_ORDER.map(category => ({
    category,
    label: HELPER_CATEGORY_LABELS[category],
    items: TEMPLATE_HELPERS.filter(h => h.category === category),
  })).filter(group => group.items.length > 0), []);

  const dynamicByCategory = useMemo(() => {
    const groups = new Map<string, typeof dynamicVars>();
    for (const v of dynamicVars) {
      const list = groups.get(v.category) ?? [];
      list.push(v);
      groups.set(v.category, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [dynamicVars]);

  return (
    <WikiScrollPage
      hero={
        <WikiHero
          icon="braces"
          title="Dynamic Values"
          subtitle="Everything you can put between double braces — your own variables, a hundred built-in values, and helpers that read the request you are about to send."
          chips={chips(['{{variables}}', '{{$randomUUID}}', '{{randomInt 1 100}}', 'jsonPath', 'Any field'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      {/* ─── Three kinds ───────────────────────────────────────────── */}
      <div>
        <SectionTitle id="dv-three" icon="braces">Three kinds of brace</SectionTitle>
        <p className="dw-p">
          Daakia resolves <Code>{'{{ … }}'}</Code> in every field of a request — the URL, headers,
          query params, the body, auth, gRPC metadata, a SOAP envelope. What goes inside comes in
          three flavours, and they are told apart by how they are spelled.
        </p>
        <FeatureGrid items={[
          {
            icon: 'variables',
            title: 'Your variables',
            desc: 'A plain name — {{base-url}}. Collection first, then the active environment, then its secrets, then Global.',
          },
          {
            icon: 'dice',
            title: 'Dynamic values',
            desc: 'A $ prefix — {{$randomUUID}}. A fresh value every time it is resolved, no arguments.',
          },
          {
            icon: 'code',
            title: 'Helpers',
            desc: 'A name and arguments — {{randomInt 1 100}}. WireMock’s vocabulary, including ones that read this request.',
          },
        ]} />
        <CodeBlock label="One request, all three" lang="http">{`POST  https://{{base-url}}/orders

Authorization   Bearer {{bearer-token}}
X-Request-Id    {{$randomUUID}}
X-Sent-At       {{now format='yyyy-MM-dd HH:mm:ss'}}

{
  "orderId":  "{{randomInt 100000 999999}}",
  "placedAt": "{{randomDate '-30d' 'now'}}",
  "tenant":   "{{tenant}}"
}`}</CodeBlock>
      </div>

      <Divider />

      {/* ─── Finding them ──────────────────────────────────────────── */}
      <div>
        <SectionTitle id="dv-where" icon="search">You do not have to remember any of it</SectionTitle>
        <p className="dw-p">
          Type <Code>{'{{'}</Code> in any value field and the list opens: your own variables first,
          then the dynamic values, then the helpers with their signatures. Filter by typing —{' '}
          <Code>rInt</Code> finds <Code>randomInt</Code> — and <Code>Enter</Code> inserts it with the
          closing braces already in place.
        </p>
        <FeatureGrid items={[
          { icon: 'type', title: 'Every text field', desc: 'URL bar, header and param rows, auth fields, form values — one list in all of them.' },
          { icon: 'code', title: 'Every editor', desc: 'JSON and XML bodies, GraphQL variables, scripts — the same list through the editor’s own completion.' },
          { icon: 'lock', title: 'Secrets stay secret', desc: 'A secret variable shows the word "secret" in the list, never its value.' },
          { icon: 'refresh', title: 'Always current', desc: 'Switch environment and the list follows — it is read when it opens, not remembered.' },
        ]} />
      </div>

      <Divider />

      {/* ─── Helpers ───────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="dv-helpers" icon="dice">Helpers</SectionTitle>
        <p className="dw-p">
          Arguments are separated by spaces. Quote anything with a space in it. Named arguments use{' '}
          <Code>name=&#39;value&#39;</Code>.
        </p>
        <Callout type="warn" title="One thing to know about quotes">
          An expression ends at the first <Code>{'}'}</Code>, so a quoted argument cannot contain
          one — <Code>{"{{formatJson '{\"a\":1}'}}"}</Code> is cut short. Pass the value in instead:{' '}
          <Code>{'{{formatJson request.body}}'}</Code>.
        </Callout>
        {helpersByCategory.map(group => (
          <div key={group.category}>
            <SubTitle>{group.label}</SubTitle>
            <WikiTable
              headers={['Helper', 'What it does', 'Example']}
              rows={group.items.map(h => [
                <Code key={`s-${h.name}`}>{h.signature}</Code>,
                h.summary,
                <Code key={`e-${h.name}`}>{h.example}</Code>,
              ])}
            />
          </div>
        ))}
      </div>

      <Divider />

      {/* ─── Dynamic values ────────────────────────────────────────── */}
      <div>
        <SectionTitle id="dv-dynamic" icon="variables">Dynamic values</SectionTitle>
        <p className="dw-p">
          Take no arguments and produce a new value each time they are resolved. Written with a{' '}
          <Code>$</Code> so they cannot be confused with a variable of your own.
        </p>
        {dynamicByCategory.length === 0 ? (
          <Callout type="info">
            The list is sent by the extension when Daakia starts. Reopen this page if it is empty.
          </Callout>
        ) : dynamicByCategory.map(([category, items]) => (
          <div key={category}>
            <SubTitle>{category.charAt(0).toUpperCase() + category.slice(1)}</SubTitle>
            <WikiTable
              headers={['Name', 'What it produces', 'Looks like']}
              rows={items.map(v => [
                <Code key={`n-${v.name}`}>{`{{$${v.name}}}`}</Code>,
                v.description,
                v.example ? <Code key={`x-${v.name}`}>{v.example}</Code> : '—',
              ])}
            />
          </div>
        ))}
      </div>

      <Divider />

      {/* ─── This request ──────────────────────────────────────────── */}
      <div>
        <SectionTitle id="dv-request" icon="send">Reading the request itself</SectionTitle>
        <p className="dw-p">
          Helpers in the <strong>This request</strong> group read the request as it will actually be
          sent — after your variables are resolved and after the pre-request script has run. That is
          what lets a header quote a value out of the body.
        </p>
        <CodeBlock label="A header that signs the body" lang="http">{`X-Order-Id    {{jsonPath request.body '$.orderId'}}
X-Signature   {{sha256 request.body}}
X-Path        {{request.path}}`}</CodeBlock>
        <Callout type="info" title="What an outgoing request does not have">
          <Code>request.pathParams</Code> and <Code>state</Code> are always empty here. They are
          things a mock server knows because it matched a request against a stub it owns; a request
          you are sending has been matched against nothing.
        </Callout>
      </div>

      <Divider />

      {/* ─── Rules ─────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="dv-rules" icon="info">How they resolve</SectionTitle>
        <WikiTable
          headers={['Rule', 'What it means for you']}
          rows={[
            ['Variables first, helpers second',
              <>A helper argument can be a variable: <Code>{"{{upper '{{host}}'}}"}</Code> works because the variable is already a value by the time the helper runs.</>],
            ['Helpers run last, on the extension host',
              <>After the pre-request script, so a helper can use a value the script just set — and a script cannot read a value a helper produced.</>],
            ['Every occurrence is independent',
              <>Two <Code>{'{{$randomUUID}}'}</Code>s give two different values. To use one twice, see below.</>],
            ['Unknown stays visible',
              <>A name nothing resolves is sent as the literal <Code>{'{{name}}'}</Code> rather than an empty string — a request that fails readably beats one that fails silently.</>],
            ['Saved requests keep the braces',
              <>A collection stores what you typed, not what it resolved to, so the same request means the right thing in a different environment.</>],
          ]}
        />
        <SubTitle>Using one value twice</SubTitle>
        <p className="dw-p">
          <Code>assign</Code> remembers a value for the rest of the field it is written in, and{' '}
          <Code>val</Code> reads it back.
        </p>
        <CodeBlock label="An idempotency key and its signature" lang="http">{`X-Idempotency  {{assign 'k' (randomValue type='HEX')}}{{val 'k'}}
X-Signature    {{sha256 (val 'k')}}`}</CodeBlock>
        <Callout type="tip" title="Across fields, not just within one">
          <Code>assign</Code> does not reach from a header into the body. To share one value across
          a whole request, generate it in a pre-request script and set a variable — the snippet{' '}
          <strong>One random value, used twice</strong> in the Scripts tab does exactly that.
        </Callout>
      </div>

      <Divider />

      {/* ─── Scripts ───────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="dv-scripts" icon="script">In scripts</SectionTitle>
        <p className="dw-p">
          <Code>dk.interpolate()</Code> runs the same engine a header field does, so anything you can
          write in a value you can compute in a script — and it means the same thing in both places.
        </p>
        <CodeBlock label="Pre-request script">{`// One value, shared by every field in this request
const id = dk.interpolate("{{$randomUUID}}");
dk.env.set("request-id", id);

// Anything the helpers can do
const stamp = dk.interpolate("{{now format='EPOCH'}}");
dk.request.headers.set("X-Sent-At", stamp);`}</CodeBlock>
        <p className="dw-p">
          The <strong>Dynamic values</strong> category in the Scripts tab&rsquo;s snippet panel lists
          every helper and every <Code>$</Code> value as a ready-made <Code>dk.interpolate</Code>{' '}
          call.
        </p>
      </div>

      <Divider />

      {/* ─── Mock ──────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="dv-mock" icon="mock">The same braces in mock responses</SectionTitle>
        <p className="dw-p">
          The Mock Server uses this engine too, with the same helpers plus the block forms{' '}
          <Code>{'{{#if}}'}</Code>, <Code>{'{{#each}}'}</Code> and <Code>{'{{#range}}'}</Code>. There{' '}
          <Code>request.*</Code> means the request that just <em>arrived</em>, and{' '}
          <Code>request.pathParams</Code> and <Code>state</Code> are populated.
        </p>
        <Callout type="warn" title="One deliberate difference">
          A mock response blanks an expression it does not recognise, so the body it serves stays
          valid JSON. A request you send keeps it visible instead. Same engine, opposite answer, and
          both are the right one for their side.
        </Callout>
      </div>
    </WikiScrollPage>
  );
}
