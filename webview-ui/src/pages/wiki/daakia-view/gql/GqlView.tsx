import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import { WikiHero, SubTitle, Steps, FeatureGrid, Callout, Code, Badge, chips } from '../shared/WikiShared';
import { GQL_CAPTURES } from './captures';

export function GqlView() {
  const byId = Object.fromEntries(GQL_CAPTURES.map(c => [c.id, c]));
  return (
    <WikiScrollPage hero={
      <WikiHero
        emoji="🔷"
        title="GraphQL Client"
        subtitle="Write queries and mutations with schema-aware autocomplete, variables, and per-request headers."
        chips={chips(['Query', 'Variables', 'Headers', 'Auth'])}
      />
    }>
      <div>
        <Callout type="info" title="Activate">
          Click the <Badge variant="graphql">GQL</Badge> icon in the left protocol rail to switch to GraphQL mode.
        </Callout>
        <SubTitle>Connect Flow</SubTitle>
        <Steps steps={[
          'Click the <strong>GQL</strong> protocol icon in the left rail',
          'Enter your GraphQL endpoint URL',
          'Click <strong>Connect</strong> — Daakia runs schema introspection',
          'Documentation (📖) and Schema (⟨/⟩) sidebar icons become active',
          'Write a query in the Query editor → click <strong>Run</strong>',
        ]} />
      </div>

      {byId['graphql-query'] && <CaptureCard entry={byId['graphql-query']} />}
      {byId['graphql-variables'] && <CaptureCard entry={byId['graphql-variables']} />}
      {byId['graphql-headers'] && <CaptureCard entry={byId['graphql-headers']} />}
      {byId['graphql-authorization'] && <CaptureCard entry={byId['graphql-authorization']} />}

      <div>
        <SubTitle>Sidebar Panels (after Connect)</SubTitle>
        <FeatureGrid items={[
          { emoji: '📖', title: 'Documentation', desc: 'Root Types, all schema types with color coding — search + filter.' },
          { emoji: '⟨/⟩', title: 'Schema SDL', desc: 'Full Schema Definition Language view — read-only, syntax highlighted.' },
          { emoji: '📁', title: 'Collections', desc: 'Save GraphQL requests to collections for later use.' },
          { emoji: '🕐', title: 'History', desc: 'All executed queries — click to replay.' },
          { emoji: '🌿', title: 'Environments', desc: 'Shared environments — {{gql_host}} resolves in endpoints and headers.' },
        ]} />
        <Callout type="tip">
          GraphQL Headers and Auth tabs are <strong>identical</strong> to REST — same KeyValueTable, same auth editor. Variables like <Code>{'{{authToken}}'}</Code> resolve the same way.
        </Callout>
      </div>
    </WikiScrollPage>
  );
}
