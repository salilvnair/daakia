import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import { WikiHero, SectionTitle, SubTitle, WikiTable, WikiCard, Callout, Divider, FeatureGrid, Code, ProtocolActivateNote, chips, TocBar, type TocItem } from '../shared/WikiShared';
import { SettingsIcon } from '../../../../icons';
import { PLATFORM_CAPTURES } from './captures';

// The captured Settings screenshots include the real app's own protocol icon
// rail (48px, `w-12`) and its own Settings section-nav list (`width: 22%` of
// the 1280px frozen capture width ≈ 282px, NOT a fixed 200px) — but the
// WikiTable right above already lists all 10 section names, so showing that
// same list again inside every single screenshot is pure redundant clutter
// (and reads as "two different left-nav-shaped panels stacked next to each
// other"). Cropping to start past both — the content pane itself, where the
// section's actual real controls live — is the part with unique value.
// (Previously x:220 under-cropped by ~110px, leaving a sliver of the
// sidenav's badge counts visible on the left edge of every card; x:330 was
// the fix at the time but measured live against all 32 real captures, real
// content consistently starts as early as local x≈309 — a few px inside
// that boundary — clipping the first glyph of left-aligned labels like
// "Follow Redirects" on nearly every card. x:305 clears every capture's
// measured content start with margin, and width grows to match so the
// right edge still lands exactly on the 1280 design width, same as before.)
const SETTINGS_CONTENT_CROP = { x: 305, width: 975 };

const TOC_ITEMS: TocItem[] = [
  { id: 'st-general', emoji: '⚙️', label: 'General & Theme' },
  { id: 'st-server', emoji: '🎭', label: 'Server' },
  { id: 'st-ai', emoji: '🤖', label: 'AI' },
  { id: 'st-advanced', emoji: '🛠️', label: 'Advanced' },
  { id: 'st-storage', emoji: '💾', label: 'Storage' },
];

export function SettingsView() {
  const byId = Object.fromEntries(PLATFORM_CAPTURES.map(c => [c.id, c]));
  const cap = (id: string) => byId[id] && <CaptureCard entry={byId[id]} crop={SETTINGS_CONTENT_CROP} />;
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          emoji="⚙️"
          title="Settings"
          subtitle="Five real groups — General, Server, AI, Advanced, Wiki — searchable, each item badged like Prompt Library."
          chips={chips(['General', 'Theme', 'LLM Provider', 'AI Features', 'Storage'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <ProtocolActivateNote
          icon={<SettingsIcon size={18} style={{ color: 'var(--color-settings)' }} />}
          color="var(--color-settings)"
          name="Settings"
          actionText="in the right sidebar (bottom) to open Settings."
        />
      </div>

      <Divider />

      <div>
        <SectionTitle id="st-general" emoji="⚙️">General & Theme</SectionTitle>
        <WikiTable
          headers={['Section', 'Real fields']}
          rows={[
            ['General → General tab', 'Follow Redirects, SSL Certificate Verification, Save Response in History, Request Timeout (ms), Maximum History Entries, Maximum AI Chat Messages, Database Location (read-only, with a copy button)'],
            ['General → Encoding tab', 'Query Parameters Encoding — Enable / Disable / Auto (single radio group)'],
            ['General → Proxy tab', 'Mode — No Proxy / System Proxy / Manual Proxy; Manual mode adds Host, Port, Username, Password, Bypass List'],
            ['Theme', 'Dark / Light / System — three choices, nothing else. No accent-color picker and no editor font-size setting exist here.'],
          ]}
        />
        <Callout type="warn">
          Theme is stored in your browser's <Code>localStorage</Code> only — it does not round-trip through the
          extension's settings store the way every other General field does, so it won't show up if you're inspecting
          settings via the DB Explorer.
        </Callout>
      </div>

      {byId['settings-general'] && <CaptureCard entry={byId['settings-general']} crop={SETTINGS_CONTENT_CROP} />}
      {cap('settings-general-encoding')}
      {cap('settings-general-proxy')}
      {byId['settings-theme'] && <CaptureCard entry={byId['settings-theme']} crop={SETTINGS_CONTENT_CROP} />}

      <Divider />

      <div>
        <SectionTitle id="st-server" emoji="🎭">Server</SectionTitle>
        <WikiTable
          headers={['Field', 'Default', 'Notes']}
          rows={[
            ['Port Range', '8000–9000', 'Clamped to 1024–65535; each new mock server auto-picks a free port in this range'],
            ['Mock Server Icon Glow', 'On', 'Pulsing animation on the Mock sidebar icon while any server is running'],
          ]}
        />
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Info text on this page also tells you where mock server configs actually live on disk (a JSON file under{' '}
          <Code>~/.salilvnair/daakia-vsce/</Code>) and confirms every running server stops automatically when the
          extension deactivates — there's no separate "auto-start on VS Code launch" toggle.
        </p>
      </div>

      {byId['settings-mock-server'] && <CaptureCard entry={byId['settings-mock-server']} crop={SETTINGS_CONTENT_CROP} />}

      <Divider />

      <div>
        <SectionTitle id="st-ai" emoji="🤖">AI</SectionTitle>
        <WikiTable
          headers={['Section', 'What it really is']}
          rows={[
            ['LLM Provider', 'Add/enable providers, per-provider model lists, pick a default provider + model, manage API keys (stored via VS Code SecretStorage), or quick-add a Custom OpenAI-compatible provider'],
            ['AI Features', '87 individual toggles across 12 categories (Chat, Response & Diagnostics, REST Toolkit, Schema & Contracts, Collections & Workflow, Import & Reverse Engineer, Mock Generation, GraphQL AI, gRPC AI, SOAP AI, Realtime Protocols, MCP & Platform AI) — each row names the exact button/menu it gates, with a master enable-all per category'],
            ['Prompt Library', 'Agent Prompts + AI Actions sections, System/User tabs per scenario, all editable in a real Monaco editor'],
            ['AI Audit', 'Full call log — system prompt, user prompt, request/response payload, headers, model, duration, errors — for every AI call made anywhere in the app'],
          ]}
        />
      </div>

      <SubTitle>LLM Provider</SubTitle>
      {byId['settings-llm-provider'] && <CaptureCard entry={byId['settings-llm-provider']} crop={SETTINGS_CONTENT_CROP} />}
      {cap('settings-llmprovider-custom-modal')}

      <SubTitle>AI Features</SubTitle>
      {byId['settings-ai-features'] && <CaptureCard entry={byId['settings-ai-features']} crop={SETTINGS_CONTENT_CROP} />}

      <SubTitle>Prompt Library</SubTitle>
      {byId['settings-prompt-library'] && <CaptureCard entry={byId['settings-prompt-library']} crop={SETTINGS_CONTENT_CROP} />}
      {cap('settings-promptlibrary-system')}
      {cap('settings-promptlibrary-user')}

      <SubTitle>AI Audit</SubTitle>
      {byId['settings-ai-audit'] && <CaptureCard entry={byId['settings-ai-audit']} crop={SETTINGS_CONTENT_CROP} />}
      <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
        Click any audit entry to drill into 5 detail tabs — Request, Response, System Prompt, User Prompt, and a
        combined Full Audit view:
      </p>
      {cap('settings-aiaudit-detail-request')}
      {cap('settings-aiaudit-detail-response')}
      {cap('settings-aiaudit-detail-systemprompt')}
      {cap('settings-aiaudit-detail-userprompt')}
      {cap('settings-aiaudit-detail-fullaudit')}

      <Divider />

      <div>
        <SectionTitle id="st-advanced" emoji="🛠️">Advanced</SectionTitle>
        <WikiTable
          headers={['Section', 'Real sub-tabs / contents']}
          rows={[
            ['Developer Tools', 'Memory Footprint, Audit Log, Audit Config, DB Explorer, Debug Snapshot — five real sub-tabs, not a single verbose-logging toggle'],
            ['Power Features', '8 launchable tools, each its own modal: Cookie Manager, Proxy Settings, Client Certificates, API Monitor, Request Interceptor, Response Diff, Bulk URL Tester, Load Tester'],
          ]}
        />
      </div>

      <SubTitle>Developer Tools</SubTitle>
      {byId['settings-developer-tools'] && <CaptureCard entry={byId['settings-developer-tools']} crop={SETTINGS_CONTENT_CROP} />}
      {cap('settings-devtools-auditlog')}
      {cap('settings-devtools-auditconfig')}
      {cap('settings-devtools-debugsnapshot')}
      {cap('settings-devtools-dbexplorer')}

      <SubTitle>Wiki</SubTitle>
      {byId['settings-wiki'] && <CaptureCard entry={byId['settings-wiki']} crop={SETTINGS_CONTENT_CROP} />}

      <SubTitle>Power Features</SubTitle>
      {byId['settings-power-features'] && <CaptureCard entry={byId['settings-power-features']} crop={SETTINGS_CONTENT_CROP} />}
      {cap('power-bulk-url-tester')}
      {cap('power-api-monitor')}
      {cap('power-proxy-settings')}
      {cap('power-client-certificates')}
      {cap('power-response-diff')}
      {cap('power-load-tester')}
      {cap('power-request-interceptor')}

      <Divider />

      <div>
        <SectionTitle id="st-storage" emoji="💾">Storage</SectionTitle>
        <WikiCard title="Where Daakia stores your data" icon="💾">
          <WikiTable
            headers={['Data', 'Location']}
            rows={[
              ['Collections, requests, history', 'SQLite DB — path shown at Settings → General → Database Location'],
              ['Environments & variables', 'Same SQLite DB'],
              ['AI provider config + AI Feature toggles', 'Same SQLite DB'],
              ['Secrets (API keys, secret vars)', 'VS Code SecretStorage (OS keychain-backed) — never in the SQLite file'],
              ['Theme', 'Browser localStorage only (see the callout above)'],
              ['Mock server port range / configs', 'A separate JSON file under ~/.salilvnair/daakia-vsce/'],
              ['Wiki captures', 'Bundled with the extension — read-only'],
            ]}
          />
        </WikiCard>

        <Callout type="info" title="Inspecting Real Data">
          <strong>Settings → Developer Tools → DB Explorer</strong> is the real place to browse the SQLite file's
          tables directly — useful when reporting bugs or verifying data isn't corrupted.
        </Callout>
      </div>

      <Divider />

      <div>
        <SubTitle>Tips & Best Practices</SubTitle>
        <FeatureGrid items={[
          { emoji: '🌿', title: 'Use environments', desc: 'Never hardcode URLs — use {{baseUrl}} and switch environments instead of editing requests.' },
          { emoji: '🔐', title: 'Mark secrets as Secret', desc: 'Tokens and passwords should always use the Secret variable type, not Default.' },
          { emoji: '📁', title: 'Organize early', desc: 'Set up folder structure before you have 50 requests — much harder to reorganize later.' },
          { emoji: '📝', title: 'Write assertions', desc: 'Add dk.test() scripts as you build requests, not after — catches regressions immediately.' },
          { emoji: '🔄', title: 'Use Collection Runner', desc: 'Before shipping, run the full collection to catch broken requests across environments.' },
          { emoji: '🎭', title: 'Mock before backend is ready', desc: 'Start frontend work immediately with a mock server matching the planned API shape.' },
          { emoji: '🤖', title: 'Let AI scaffold, you refine', desc: 'Use an inline AI feature (✨ Suggest Headers, Generate Body) for the first draft, then tune by hand.' },
          { emoji: '💾', title: 'Export collections regularly', desc: 'Right-click → Export as backup, especially before major SQLite/extension version changes.' },
        ]} />
      </div>
    </WikiScrollPage>
  );
}
