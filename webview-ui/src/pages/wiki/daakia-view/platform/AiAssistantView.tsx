import { WikiScrollPage } from '../capture/CaptureScrollView';
import { WikiHero, SubTitle, Callout, Steps, FeatureGrid, WikiTable, CmdList, Code, chips } from '../shared/WikiShared';

export function AiAssistantView() {
  return (
    <WikiScrollPage hero={
      <WikiHero
        emoji="🤖"
        title="AI Assistant"
        subtitle="A dedicated AI panel with 8 specialized agents, plus a @daakia chat participant right inside VS Code's Copilot Chat."
        chips={chips(['AI Panel', '@daakia Chat', '8 Agents', 'Slash Commands'])}
      />
    }>
      <div>
        <Callout type="info" title="Two Ways to Use AI">
          <strong>1. Daakia AI Panel</strong> — a dedicated chat panel in the sidebar with 8 specialized agents.{' '}
          <strong>2. @daakia Chat Participant</strong> — talk to Daakia directly from VS Code's built-in Copilot Chat with slash commands.
        </Callout>

        <SubTitle>AI Agents</SubTitle>
        <WikiTable
          headers={['Agent', 'What it does']}
          rows={[
            ['Request Builder', 'Generates full request configs (URL, headers, body) from natural language'],
            ['Scenario Generator', 'Creates test scenarios and edge cases for an existing request'],
            ['GraphQL Query Builder', 'Builds GraphQL queries/mutations from a schema and plain-English intent'],
            ['SOAP ⇄ REST Converter', 'Converts SOAP envelopes to REST-equivalent JSON and back'],
            ['Traffic Analyzer', 'Analyzes captured requests/responses and surfaces patterns or issues'],
            ['Proto Explainer', 'Explains gRPC .proto file structure and generates sample messages'],
            ['WSDL Explainer', 'Explains SOAP WSDL structure — services, ports, operations'],
            ['Request Fuzzer', 'Generates fuzzed/adversarial variants of a request to test robustness'],
          ]}
        />

        <SubTitle>@daakia Slash Commands</SubTitle>
        <CmdList items={[
          { name: '/explain', desc: 'Explain the currently active request or response in plain language' },
          { name: '/generate', desc: 'Generate a new request from a natural-language description' },
          { name: '/fix', desc: 'Suggest a fix for a failing request (auth error, bad body, wrong header)' },
          { name: '/test', desc: 'Generate daakia.test() assertion scripts for the active response' },
          { name: '/mock', desc: 'Scaffold a mock server route/schema from a description' },
        ]} />

        <SubTitle>Inline AI Features</SubTitle>
        <FeatureGrid items={[
          { emoji: '✨', title: 'Smart Variable Suggest', desc: 'AI suggests variable names as you type {{...}} based on context' },
          { emoji: '📸', title: 'Request from Screenshot', desc: 'Paste a screenshot of an API doc or Postman UI — AI builds the request' },
          { emoji: '🎙️', title: 'Voice to Request', desc: 'Speak your request naturally — AI transcribes and builds it' },
          { emoji: '🔀', title: 'Adaptive Load Tester', desc: 'AI generates progressively harder load-test scenarios based on prior results' },
          { emoji: '🧠', title: 'Adaptive Mock Learning', desc: 'AI learns from real traffic to auto-generate realistic mock responses' },
        ]} />

        <SubTitle>Supported AI Providers</SubTitle>
        <WikiTable
          headers={['Provider', 'Setup']}
          rows={[
            ['Anthropic (Claude)', 'Settings → AI Settings → API Key'],
            ['OpenAI (GPT)', 'Settings → AI Settings → API Key'],
            ['Google (Gemini)', 'Settings → AI Settings → API Key'],
            ['Azure OpenAI', 'Settings → AI Settings → Endpoint + API Key'],
            ['Local (Ollama)', 'Settings → AI Settings → Local endpoint URL (no key needed)'],
          ]}
        />

        <SubTitle>Prompt Library</SubTitle>
        <Steps steps={[
          'Open <strong>Settings → Prompt Library</strong>',
          'Browse saved prompts by category (Request, Test, Mock, Debug)',
          'Click a prompt to insert it into the AI panel input',
          'Save your own frequently-used prompts with <strong>+ Save Prompt</strong>',
        ]} />

        <Callout type="info" title="AI Audit Trail">
          Every AI request/response is logged in <strong>Settings → AI Audit</strong> — see the exact prompt sent,
          tokens used, and the model's response. Useful for debugging AI behavior or tracking usage.
        </Callout>

        <Callout type="tip">
          API keys entered in AI Settings are stored locally via VS Code's SecretStorage — never sent anywhere except directly to the provider you configured. Use <Code>Local (Ollama)</Code> for a fully offline setup.
        </Callout>
      </div>
    </WikiScrollPage>
  );
}
