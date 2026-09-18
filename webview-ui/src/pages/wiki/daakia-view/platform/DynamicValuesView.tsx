import { useMemo } from 'react';
import { WikiScrollPage } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, FeatureGrid, Callout, WikiTable, Code, CodeBlock,
  Divider, chips, TocBar, type TocItem,
} from '../shared/WikiShared';
import { TEMPLATE_HELPERS, HELPER_CATEGORY_LABELS, type HelperCategory } from '@daakia/template-catalog';
import { useDynamicVarsStore } from '../../../../store/dynamic-vars-store';
import { HELPER_COLORS, dynamicColor, categoryLabel } from '../../../../services/template/category-colors';
import { WikiIcon } from '../shared/WikiIcon';

/**
 * The `{{ }}` reference.
 *
 * Both tables are built from the same lists the app itself uses — the helper
 * catalogue the engine is tested against, and the registry the host sends on
 * startup. A page that listed them by hand would document whichever set
 * existed on the day it was written, and the reader would have no way of
 * telling which entries had stopped being true.
 *
 * ── Why every section sets its own colour ──
 *
 * A hundred and thirty rows of monospace under one accent is a wall of grey,
 * and nothing in it tells you where the date helpers stop and the JSON ones
 * start. Each section card and each category group overrides `--dw-accent`,
 * which the wiki stylesheet already threads through the card header, the icon
 * tile, the subtitle and every inline `<Code>` — so one variable per block
 * colours the whole thing, and the colour means the category rather than
 * decorating it. `Sections` below is the whole palette in one place.
 */

/** One hue per section, so the page reads as a set of subjects. */
const SECTION_COLOR = {
  three: 'var(--color-protocol-graphql, #c084fc)',
  where: 'var(--color-protocol-websocket, #22c55e)',
  helpers: 'var(--color-protocol-soap, #f97316)',
  dynamic: 'var(--color-ai, #a855f7)',
  request: 'var(--color-protocol-rest, #6366f1)',
  rules: 'var(--color-protocol-grpc, #06b6d4)',
  scripts: 'var(--color-settings, #2a9d8f)',
  mock: 'var(--color-mock-server, #eab308)',
} as const;

/**
 * A colour per kind of brace — the point the first section is making.
 *
 * The example under those three cards was a plain code block, so the three
 * things the section had just spent a paragraph telling apart all rendered in
 * one grey. Colouring each kind where it appears is the shortest version of
 * that paragraph, and the cards carry the same three colours, so a card and a
 * line in the example say the same thing.
 */
const KIND = {
  variable: 'var(--color-var-pill-text, #c084fc)',
  dynamic: 'var(--color-protocol-websocket, #22c55e)',
  helper: 'var(--color-protocol-soap, #f97316)',
} as const;

type BraceKind = keyof typeof KIND;

/** Which of the three a `{{…}}` is, by how it is spelled. */
function braceKind(inner: string): BraceKind {
  const text = inner.trim();
  if (text.startsWith('$')) return 'dynamic';
  // `{{request.path}}` has no space in it but is not a variable of yours.
  if (text.startsWith('request.') || text.startsWith('state.')) return 'helper';
  return /\s/.test(text) ? 'helper' : 'variable';
}

/**
 * A code block that colours its `{{…}}` by kind, with a legend.
 *
 * Written out rather than handed to the markdown viewer: no highlighter knows
 * what a Daakia template is, so all of them render this example in a single
 * colour — which is exactly what this section is trying not to say.
 */
function BraceCode({ label, lang = 'http', children }: {
  label?: string; lang?: string; children: string;
}) {
  const parts = children.split(/(\{\{[^}]*\}\})/g);
  /* Only the kinds this example actually uses — a legend naming three things
     when the block shows one is noise dressed as a key. */
  const present = new Set<BraceKind>();
  for (const part of parts) {
    const m = /^\{\{([^}]*)\}\}$/.exec(part);
    if (m) present.add(braceKind(m[1]));
  }
  return (
    <div className="dw-codeblock-wrap">
      {label && <div className="dw-codeblock-label">{label}</div>}
      <div style={{
        border: '1px solid var(--color-surface-border)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--color-surface-base, var(--color-surface))',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          padding: '5px 10px',
          borderBottom: '1px solid var(--color-surface-border)',
          background: 'color-mix(in srgb, var(--color-text-primary) 3%, transparent)',
        }}>
          <span style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            padding: '1px 7px',
            borderRadius: 4,
            color: 'var(--dw-accent)',
            background: 'color-mix(in srgb, var(--dw-accent) 13%, transparent)',
            border: '1px solid color-mix(in srgb, var(--dw-accent) 26%, transparent)',
          }}>{lang}</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 10, fontSize: 9.5, fontWeight: 600 }}>
            {(['variable', 'dynamic', 'helper'] as BraceKind[])
              .filter(kind => present.has(kind))
              .map(kind => (
                <span key={kind} style={{ color: KIND[kind] }}>&#9679; {kind}</span>
              ))}
          </span>
        </div>
        <pre style={{
          margin: 0,
          padding: '12px 14px',
          overflowX: 'auto',
          fontFamily: 'var(--vscode-editor-font-family, monospace)',
          fontSize: 11.5,
          lineHeight: 1.75,
        }}>
          <code>
            {parts.map((part, i) => {
              const m = /^\{\{([^}]*)\}\}$/.exec(part);
              if (!m) {
                return (
                  <span key={i} style={{ color: 'var(--color-text-primary)', opacity: 0.78 }}>{part}</span>
                );
              }
              const color = KIND[braceKind(m[1])];
              return (
                <span
                  key={i}
                  style={{
                    color,
                    fontWeight: 600,
                    background: `color-mix(in srgb, ${color} 12%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${color} 26%, transparent)`,
                    borderRadius: 4,
                    padding: '0 3px',
                  }}
                >
                  {part}
                </span>
              );
            })}
          </code>
        </pre>
      </div>
    </div>
  );
}

/** The three cards above it, in the same three colours. */
function KindCards() {
  const cards: [BraceKind, string, string, string][] = [
    ['variable', 'variables', 'Your variables',
      'A plain name — {{base-url}}. Collection first, then the active environment, then its secrets, then Global.'],
    ['dynamic', 'dice', 'Dynamic values',
      'A $ prefix — {{$randomUUID}}. A fresh value every time it is resolved, and no arguments.'],
    ['helper', 'code', 'Helpers',
      'A name and arguments — {{randomInt 1 100}}. WireMock’s vocabulary, including ones that read this request.'],
  ];
  return (
    <div className="dw-feat-grid">
      {cards.map(([kind, icon, title, desc]) => (
        <div key={kind} className="dw-feat-card" style={tint(KIND[kind])}>
          <span className="dw-feat-icon"><WikiIcon name={icon} size={15} /></span>
          <div className="dw-feat-title" style={{ color: KIND[kind] }}>{title}</div>
          <div className="dw-feat-desc">{desc}</div>
        </div>
      ))}
    </div>
  );
}

/** `--dw-accent` for one block, which the wiki CSS reads for everything in it. */
function tint(color: string): React.CSSProperties {
  return { ['--dw-accent' as string]: color } as React.CSSProperties;
}

/** The colour chip that opens a category's table. */
function CategoryBadge({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      padding: '3px 10px 3px 8px',
      borderRadius: 20,
      marginTop: 16,
      marginBottom: 8,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color,
      background: `color-mix(in srgb, ${color} 13%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
      <span style={{ opacity: 0.65, fontWeight: 600 }}>{count}</span>
    </div>
  );
}

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
      <div style={tint(SECTION_COLOR.three)}>
        <SectionTitle id="dv-three" icon="braces">Three kinds of brace</SectionTitle>
        <p className="dw-p">
          Daakia resolves <Code>{'{{ … }}'}</Code> in every field of a request — the URL, headers,
          query params, the body, auth, gRPC metadata, a SOAP envelope. What goes inside comes in
          three flavours, and they are told apart by how they are spelled.
        </p>
        <KindCards />
        <BraceCode label="One request, all three">{`POST  https://{{base-url}}/orders

Authorization   Bearer {{bearer-token}}
X-Request-Id    {{$randomUUID}}
X-Sent-At       {{now format='yyyy-MM-dd HH:mm:ss'}}

{
  "orderId":  "{{randomInt 100000 999999}}",
  "placedAt": "{{randomDate '-30d' 'now'}}",
  "tenant":   "{{tenant}}"
}`}</BraceCode>
      </div>

      <Divider />

      {/* ─── Finding them ──────────────────────────────────────────── */}
      <div style={tint(SECTION_COLOR.where)}>
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
      <div style={tint(SECTION_COLOR.helpers)}>
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
          <div key={group.category} style={tint(HELPER_COLORS[group.category])}>
            <CategoryBadge
              color={HELPER_COLORS[group.category]}
              label={group.label}
              count={group.items.length}
            />
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
      <div style={tint(SECTION_COLOR.dynamic)}>
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
          <div key={category} style={tint(dynamicColor(category))}>
            <CategoryBadge
              color={dynamicColor(category)}
              label={categoryLabel(category)}
              count={items.length}
            />
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
      <div style={tint(SECTION_COLOR.request)}>
        <SectionTitle id="dv-request" icon="send">Reading the request itself</SectionTitle>
        <p className="dw-p">
          Helpers in the <strong>This request</strong> group read the request as it will actually be
          sent — after your variables are resolved and after the pre-request script has run. That is
          what lets a header quote a value out of the body.
        </p>
        <BraceCode label="A header that signs the body">{`X-Order-Id    {{jsonPath request.body '$.orderId'}}
X-Signature   {{sha256 request.body}}
X-Path        {{request.path}}`}</BraceCode>
        <Callout type="info" title="What an outgoing request does not have">
          <Code>request.pathParams</Code> and <Code>state</Code> are always empty here. They are
          things a mock server knows because it matched a request against a stub it owns; a request
          you are sending has been matched against nothing.
        </Callout>
      </div>

      <Divider />

      {/* ─── Rules ─────────────────────────────────────────────────── */}
      <div style={tint(SECTION_COLOR.rules)}>
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
        <BraceCode label="An idempotency key and its signature">{`X-Idempotency  {{assign 'k' (randomValue type='HEX')}}{{val 'k'}}
X-Signature    {{sha256 (val 'k')}}`}</BraceCode>
        <Callout type="tip" title="Across fields, not just within one">
          <Code>assign</Code> does not reach from a header into the body. To share one value across
          a whole request, generate it in a pre-request script and set a variable — the snippet{' '}
          <strong>One random value, used twice</strong> in the Scripts tab does exactly that.
        </Callout>
      </div>

      <Divider />

      {/* ─── Scripts ───────────────────────────────────────────────── */}
      <div style={tint(SECTION_COLOR.scripts)}>
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
      <div style={tint(SECTION_COLOR.mock)}>
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
