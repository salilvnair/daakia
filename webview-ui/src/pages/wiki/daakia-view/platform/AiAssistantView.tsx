import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import { WikiHero, SectionTitle, SubTitle, Callout, Steps, FeatureGrid, WikiTable, Collapsible, Code, Divider, ProtocolActivateNote, chips, TocBar, type TocItem } from '../shared/WikiShared';
import { GeneralAssistantIcon } from '../../../../icons';
import { PLATFORM_CAPTURES } from './captures';

const TOC_ITEMS: TocItem[] = [
  { id: 'ai-chat', emoji: '💬', label: 'Daakia AI Chat' },
  { id: 'ai-inline', emoji: '✨', label: 'Inline AI Features' },
  { id: 'ai-providers', emoji: '🔌', label: 'Providers' },
  { id: 'ai-library', emoji: '📚', label: 'Prompt Library' },
  { id: 'ai-audit', emoji: '🧾', label: 'AI Audit' },
  { id: 'ai-scripting', emoji: '⚙️', label: 'dk.* Scripting' },
];

export function AiAssistantView() {
  const byId = Object.fromEntries(PLATFORM_CAPTURES.map(c => [c.id, c]));
  const cap = (id: string) => byId[id] && <CaptureCard entry={byId[id]} />;
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          emoji="🤖"
          title="AI Assistant"
          subtitle="A dedicated Daakia AI chat panel, plus 80+ inline AI features spread across every protocol — each triggered right where you need it, not from one central menu."
          chips={chips(['Daakia AI Chat', 'Inline Features', 'Multi-Provider', 'Prompt Library'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <ProtocolActivateNote
          icon={<GeneralAssistantIcon size={18} style={{ color: 'var(--color-protocol-ai)' }} />}
          color="var(--color-protocol-ai)"
          name="AI Assistant"
          actionText="in the right sidebar to open the Daakia AI chat panel."
        />
      </div>

      <Divider />

      <div>
        <Callout type="info" title="Two Ways to Use AI">
          <strong>1. Daakia AI panel</strong> — a dedicated chat tab in the sidebar (bottom-right icon), built on the same{' '}
          <Code>ConvEngineChat</Code> library used everywhere conversational UI appears in Daakia.{' '}
          <strong>2. Inline AI features</strong> — dozens of single-purpose AI tools wired directly into the request
          builder, response panels, and Collections tree — a sparkle (✨) icon or a right-click menu item, not a
          separate chat.
        </Callout>

        <SectionTitle id="ai-chat" emoji="💬">Daakia AI Chat</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Open it from the sidebar's AI icon. It's a full conversational panel — ask it to translate a Postman
          script, explain a WSDL, or generate test data, and it routes to the same underlying features the inline
          triggers use.
        </p>
      </div>
      {cap('ai-daakia-chat')}
      {cap('ai-conversation-panel')}

      <div>
        <SubTitle>MCP Tools in Chat</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          When an MCP server is connected, its tools become available to the assistant mid-conversation — the Tools
          and MCP tabs inside the AI panel show what's exposed and which servers are live.
        </p>
      </div>
      {cap('ai-tools-tab')}
      {cap('ai-mcp-tab')}

      <Divider />

      <div>
        <SectionTitle id="ai-inline" emoji="✨">Inline AI Features</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          There are over 80 of these across the app — each one is a real, independently-wired component, not a
          fabricated "agent" list. A representative sample, grouped by where you'll actually find them:
        </p>
        <WikiTable
          headers={['Feature', 'What it does', 'Where']}
          rows={[
            ['Suggest Headers', 'Proposes a starting header set from method/URL/body', '✨ icon next to any Headers table — REST, GraphQL, gRPC, SOAP'],
            ['Generate Body', 'Writes a request body from a natural-language description', '✨ icon in the Body editor'],
            ['Generate Data Schema', 'Builds realistic test-data payloads', '"Generate Test Data" action in the Body editor'],
            ['Postman → Daakia Translator', 'Converts pm.* scripts to real dk.* syntax', 'Daakia AI chat slash-action'],
            ['Smart Retry Advisor', 'Suggests retry strategies after a failed request', 'Response toolbar — REST, gRPC, SOAP, GraphQL, realtime logs'],
            ['Response Diff / Schema Validator', 'Compares two responses, or validates one against a JSON Schema', 'Response actions menu'],
            ['GraphQL Schema Explainer / Query Builder', 'Explains a connected schema, or builds a query from plain English', 'GraphQL editor toolbar'],
            ['gRPC Proto Explainer', 'Explains services/RPCs/messages from an imported .proto', 'gRPC Service Definition / URL bar'],
            ['SOAP WSDL Explainer', 'Explains every operation/binding/port in a loaded WSDL', 'SOAP request config / URL bar'],
            ['Env Var Extractor / Changelog / Agent Workflow / API Flow Builder / Collection Organizer', 'Pulls variables from a response, summarizes collection changes, runs autonomous multi-step flows, builds request chains from plain English, suggests folder structure', 'Right-click menu on the Collections tree'],
            ['Traffic Analyzer', 'Finds patterns/issues across a realtime message stream', 'Realtime log actions toolbar'],
          ]}
        />
        <Collapsible title="The rest of the 80+ (security, mocking, SDKs, and more)">
          <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)] mb-2">
            Every one of these is a real, separately-triggered component — not an exhaustive list of every trigger
            location, just proof this isn't a short list of headline features:
          </p>
          <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            API Dependency Graph, API Discovery, API Regression Detector, Chaos Engineering, Compatibility Scorer,
            Compliance Checker, Contract Negotiator, Contract Test Generator, Conversation-to-Collection, Cross-Protocol
            Orchestrator, Deep Security Audit, Doc Generator, GraphQL Federation, Learning Mode, Live Traffic Mirror,
            MCP Prompt Builder, MCP Schema Viewer, Mock Intelligence, MQTT Topic Suggester, Multi-Request Optimizer,
            Natural-Language Request Builder, OpenAPI Enrichment, OpenAPI Generator, Performance Anomaly Detection,
            Performance Insights, Request Clustering, Request from Logs, Request from Screenshot, Request Fuzzer,
            Request Replay Variations, Response Pattern Learning, Response → TypeScript, Response Transformer, Reverse
            Engineer, Scenario Generator, Schema Drift Detector, SDK Generator, Security Audit, Semantic Diff, Semantic
            Validator, Sequence Composer, Session Export, Smart Test Suite, Smart Variable Suggest, SOAP → REST
            Converter, SSE Event Suggester, Webhook Debugger, Adaptive Load Tester, Adaptive Mock Learning, Voice to
            Request.
          </p>
        </Collapsible>

        <SectionTitle id="ai-providers" emoji="🔌">Supported Providers</SectionTitle>
        <FeatureGrid items={[
          { emoji: '🎭', title: 'DaakiaAI (Mock)', desc: 'Built-in, no API key — deterministic fake responses for trying features offline.' },
          { emoji: '🐙', title: 'GitHub Copilot', desc: 'No API key — uses VS Code\'s own Language Model API and your existing Copilot subscription.' },
          { emoji: '🔑', title: 'Bring your own key', desc: 'OpenAI, Anthropic, Google Gemini, Groq, Together, Mistral, xAI (Grok), DeepSeek, Azure OpenAI, or a Custom OpenAI-compatible endpoint.' },
          { emoji: '🖥️', title: 'Ollama (local)', desc: 'Point at a local Ollama server — fully offline, no key needed.' },
        ]} />
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Configure providers in <strong>Settings → LLM Provider</strong>: add a provider, pick its models, set one as
          default. A sparkle-icon status button in the sidebar always shows the currently active provider + model.
        </p>
      </div>
      {cap('ai-provider-status-popover')}
      {cap('ai-authorization')}

      <div>
        <SectionTitle id="ai-library" emoji="📚">Prompt Library</SectionTitle>
        <Steps steps={[
          'Open <strong>Settings → Prompt Library</strong>',
          'Browse under two real sections: <strong>Agent Prompts</strong> (the system prompts behind each AI feature above) and <strong>AI Actions</strong> (the request templates each inline trigger sends)',
          'Each entry has separate <strong>System</strong> and <strong>User</strong> tabs, edited in a real Monaco editor',
          'Edit and save to change how that AI feature behaves — or click <strong>Reset</strong> to restore the default',
        ]} />
      </div>
      {cap('ai-prompt-tab')}
      {cap('ai-settings-tab')}

      <div>
        <SectionTitle id="ai-audit" emoji="🧾">AI Audit Trail</SectionTitle>
        <Callout type="info">
          <strong>Settings → AI Audit</strong> logs every AI call in full: the exact system prompt, user prompt, request
          payload, response payload, headers, model, duration, and any error — not just a token count. Useful for
          debugging why a feature produced a particular answer, or for reviewing what's actually been sent to a
          provider.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="ai-scripting" emoji="⚙️">dk.* Scripting API (used by AI-generated scripts)</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          When an AI feature generates a Pre-request/Post-response script, it uses the same real{' '}
          <Code>dk.*</Code> runtime you'd write by hand — never a <Code>daakia.*</Code> or <Code>pm.*</Code> namespace:
        </p>
        <WikiTable
          headers={['Namespace', 'Provides']}
          rows={[
            [<Code>dk.env</Code>, 'get/set/secret on environment variables (dk.environment is a full-name alias for the same thing)'],
            [<Code>dk.globals</Code>, 'get/set/secret on global variables'],
            [<Code>dk.collectionVariables</Code>, 'get/set on collection-scoped variables'],
            [<Code>dk.request</Code>, 'method, url, headers, body — mutable in Pre-request scripts'],
            [<Code>dk.response</Code>, 'status, statusText, headers, body, time, size, json() — Post-response only'],
            [<Code>dk.sendRequest()</Code>, 'Async HTTP calls from inside a script, for chaining requests'],
            [<Code>dk.test() / dk.expect()</Code>, 'Assertions — toBe, toEqual, toContain, toHaveStatus, toMatchSchema, etc.'],
          ]}
        />
        <Callout type="tip">
          API keys entered in LLM Provider settings are stored via VS Code's <Code>SecretStorage</Code> (your OS
          keychain) — never sent anywhere except directly to the provider you configured. Use DaakiaAI (Mock) or
          Ollama for a fully offline setup.
        </Callout>
      </div>
    </WikiScrollPage>
  );
}
