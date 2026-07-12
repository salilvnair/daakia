import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import { WikiHero, SubTitle, WikiTable, WikiCard, Callout, Divider, FeatureGrid, chips } from '../shared/WikiShared';
import { PLATFORM_CAPTURES } from './captures';

// The captured Settings screenshots include the real app's own protocol icon
// rail (48px) and its own Settings section-nav list (200px) — but the
// WikiTable right above already lists all 10 section names, so showing that
// same list again inside every single screenshot is pure redundant clutter
// (and reads as "two different left-nav-shaped panels stacked next to each
// other"). Cropping to start past both — the content pane itself, where the
// section's actual real controls live — is the part with unique value.
const SETTINGS_CONTENT_CROP = { x: 220, width: 1060 };

export function SettingsView() {
  const byId = Object.fromEntries(PLATFORM_CAPTURES.map(c => [c.id, c]));
  return (
    <WikiScrollPage hero={
      <WikiHero
        emoji="⚙️"
        title="Settings"
        subtitle="General preferences, theme, mock server config, LLM providers, AI features, and storage — all in one place."
        chips={chips(['General', 'Theme', 'LLM Provider', 'AI Features', 'Storage'])}
      />
    }>
      <div>
        <WikiTable
          headers={['Section', 'What it controls']}
          rows={[
            ['General', 'Default timeout, redirect behavior, SSL verification, proxy config'],
            ['Theme', 'Light/dark/auto, accent color, editor font size'],
            ['Mock Server', 'Port range, hot reload, activity log retention'],
            ['LLM Provider', 'Provider selection, API keys, model choice, temperature'],
            ['AI Features', 'Toggle individual inline AI features on/off'],
            ['Prompt Library', 'Manage saved AI prompts'],
            ['AI Audit', 'View AI request/response history and token usage'],
            ['Developer Tools', 'Enable verbose logging, export diagnostic bundle'],
            ['Wiki', 'This page — the consolidated visual documentation'],
            ['Power Features', 'Experimental / advanced features behind flags'],
          ]}
        />

        {byId['settings-general'] && <CaptureCard entry={byId['settings-general']} crop={SETTINGS_CONTENT_CROP} />}
        {byId['settings-theme'] && <CaptureCard entry={byId['settings-theme']} crop={SETTINGS_CONTENT_CROP} />}
        {byId['settings-mock-server'] && <CaptureCard entry={byId['settings-mock-server']} crop={SETTINGS_CONTENT_CROP} />}
        {byId['settings-llm-provider'] && <CaptureCard entry={byId['settings-llm-provider']} crop={SETTINGS_CONTENT_CROP} />}
        {byId['settings-ai-features'] && <CaptureCard entry={byId['settings-ai-features']} crop={SETTINGS_CONTENT_CROP} />}
        {byId['settings-prompt-library'] && <CaptureCard entry={byId['settings-prompt-library']} crop={SETTINGS_CONTENT_CROP} />}
        {byId['settings-ai-audit'] && <CaptureCard entry={byId['settings-ai-audit']} crop={SETTINGS_CONTENT_CROP} />}
        {byId['settings-developer-tools'] && <CaptureCard entry={byId['settings-developer-tools']} crop={SETTINGS_CONTENT_CROP} />}
        {byId['settings-wiki'] && <CaptureCard entry={byId['settings-wiki']} crop={SETTINGS_CONTENT_CROP} />}
        {byId['settings-power-features'] && <CaptureCard entry={byId['settings-power-features']} crop={SETTINGS_CONTENT_CROP} />}

        <SubTitle>Storage</SubTitle>
        <WikiCard title="Where Daakia stores your data" icon="💾">
          <WikiTable
            headers={['Data', 'Location']}
            rows={[
              ['Collections, requests, history', 'SQLite DB in VS Code global storage'],
              ['Environments & variables', 'SQLite DB (same file)'],
              ['Secrets (API keys, secret vars)', 'VS Code SecretStorage (OS keychain-backed)'],
              ['Mock server configs', 'SQLite DB (same file)'],
              ['Wiki captures', 'Bundled with extension — read-only'],
            ]}
          />
        </WikiCard>

        <Callout type="info" title="SQLite Status">
          Check <strong>Settings → DevTools → Database Status</strong> to see DB file path, size, and row counts per table.
          Useful when reporting bugs or verifying data isn't corrupted.
        </Callout>
      </div>

      <Divider />

      <div>
        <SubTitle>Tips & Best Practices</SubTitle>
        <FeatureGrid items={[
          { emoji: '🌿', title: 'Use environments', desc: 'Never hardcode URLs — use {{baseUrl}} and switch environments instead of editing requests.' },
          { emoji: '🔐', title: 'Mark secrets as Secret', desc: 'Tokens and passwords should always use the Secret variable type, not Default.' },
          { emoji: '📁', title: 'Organize early', desc: 'Set up folder structure before you have 50 requests — much harder to reorganize later.' },
          { emoji: '📝', title: 'Write assertions', desc: 'Add daakia.test() scripts as you build requests, not after — catches regressions immediately.' },
          { emoji: '🔄', title: 'Use Collection Runner', desc: 'Before shipping, run the full collection to catch broken requests across environments.' },
          { emoji: '🎭', title: 'Mock before backend is ready', desc: 'Start frontend work immediately with a mock server matching the planned API shape.' },
          { emoji: '🤖', title: 'Let AI scaffold, you refine', desc: 'Use AI Request Builder for the first draft, then tune headers/auth by hand.' },
          { emoji: '💾', title: 'Export collections regularly', desc: 'Right-click → Export as backup, especially before major SQLite/extension version changes.' },
        ]} />
      </div>
    </WikiScrollPage>
  );
}
