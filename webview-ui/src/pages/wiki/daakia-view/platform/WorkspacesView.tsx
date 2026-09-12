/**
 * Workspaces — the box above collections.
 *
 * This page exists because the concept is invisible until somebody names it.
 * A workspace is not a feature you use; it is the thing every collection,
 * environment and history row is already inside, and the only way you notice
 * it is when you make a second one and the first one's data goes away. So the
 * page leads with what a workspace owns and — just as loudly — with what it
 * deliberately does not.
 */
import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import { WikiHero, SectionTitle, SubTitle, Steps, FeatureGrid, Callout, WikiTable, Code, Divider, ProtocolActivateNote, chips, TocBar, type TocItem } from '../shared/WikiShared';
import { LayoutGridIcon } from '../../../../icons';
import { PLATFORM_CAPTURES } from './captures';

const TOC_ITEMS: TocItem[] = [
  { id: 'ws-what', icon: 'workspace', label: 'What it is' },
  { id: 'ws-owns', icon: 'collections', label: 'What it owns' },
  { id: 'ws-switch', icon: 'refresh', label: 'Switching' },
  { id: 'ws-tabs', icon: 'layers', label: 'The four tabs' },
  { id: 'ws-docs', icon: 'document', label: 'Documentation' },
  { id: 'ws-move', icon: 'export', label: 'Import & export' },
];

export function WorkspacesView() {
  const byId = Object.fromEntries(PLATFORM_CAPTURES.map(c => [c.id, c]));
  const cap = (id: string) => byId[id] && <CaptureCard entry={byId[id]} />;

  return (
    <WikiScrollPage
      hero={
        <WikiHero
          icon="workspace"
          title="Workspaces"
          subtitle="One project's collections, environments and history — switched as a set, so the wrong project's requests are never on screen."
          chips={chips(['Collections', 'Environments', 'History', 'Docs', 'Switching'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <ProtocolActivateNote
          icon={<LayoutGridIcon size={18} style={{ color: 'var(--color-workspace)' }} />}
          color="var(--color-workspace)"
          name="Workspaces"
          actionText="at the top of the left rail — above every protocol, because it is above them."
        />
      </div>

      <Divider />

      {/* ─── What it is ──────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="ws-what" icon="workspace">What a workspace is</SectionTitle>
        <p className="dw-p">
          Everything you save in Daakia is already inside a workspace. A fresh install
          has one, called <Code>My Workspace</Code>, and if you never make a second one
          you will never notice it — which is the intent. The moment you work on two
          unrelated projects, it stops being invisible: a second workspace gives the
          second project its own collections, its own environments and its own history,
          and switching between them swaps all three at once.
        </p>
        <p className="dw-p">
          The name sits vertically down the left rail, under the workspace icon, so the
          question &ldquo;which project am I in?&rdquo; is answered without opening
          anything. It is greyed while you are elsewhere in the app and takes the
          workspace accent when the Workspace tab is in front.
        </p>
        {cap('platform-workspace-overview')}
      </div>

      <Divider />

      {/* ─── What it owns ────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="ws-owns" icon="collections">What it owns — and what it does not</SectionTitle>
        <p className="dw-p">
          A workspace scopes what you are testing, never what you are testing it
          with. That single rule decides the whole list.
        </p>
        <WikiTable
          headers={['Scoped to the workspace', 'Shared across all of them', 'Why']}
          rows={[
            ['Collections', '', 'A collection belongs to a project. Two projects that both have a "Users API" are two different things.'],
            ['Environments', '', 'A {{baseUrl}} means something different per project, and mixing them is how a staging call reaches production.'],
            ['History', '', 'History is the record of what you sent from this project.'],
            ['', 'Mock servers', 'They bind real ports on this machine. Two workspaces both wanting :4010 is a conflict scoping cannot resolve.'],
            ['', 'dk8s clusters', 'A cluster is infrastructure, not a project — the same cluster serves several.'],
            ['', 'AI provider keys and settings', 'They are yours, not the project’s.'],
          ]}
        />
        <Callout type="info" title="Nothing is orphaned by the upgrade">
          If you used Daakia before workspaces existed, everything you had was adopted
          into <Code>My Workspace</Code> — the same collections, the same environments,
          the same history, in the same order. Nothing was moved and nothing was left
          behind in a table no screen reads.
        </Callout>
      </div>

      <Divider />

      {/* ─── Switching ───────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="ws-switch" icon="refresh">Switching, and what happens when you do</SectionTitle>
        <Steps steps={[
          'Click the workspace icon at the top of the left rail to open the Workspace tab.',
          'Pick another workspace from the switcher beside its name.',
          'The sidebar reloads: collections, environments and history are now that workspace’s.',
        ]} />
        <Callout type="warn" title="Open tabs are yours, not the workspace's">
          Switching does not close the request tabs you have open — a tab is a scratchpad,
          and closing your work because you looked at another project would be the wrong
          trade. A tab saved to a collection still belongs to the workspace that collection
          is in.
        </Callout>
      </div>

      <Divider />

      {/* ─── The four tabs ───────────────────────────────────────────── */}
      <div>
        <SectionTitle id="ws-tabs" icon="layers">The four tabs</SectionTitle>
        <FeatureGrid items={[
          { icon: 'gauge', title: 'Overview', desc: 'How much is in this workspace — collections, environments, saved requests, history — and the workspace’s own documentation.' },
          { icon: 'collections', title: 'Collections', desc: 'Every collection in the workspace, grouped by protocol. Each row holds the real Collections panel: same tree, same right-click menu, same drag-and-drop.' },
          { icon: 'layers', title: 'Environments', desc: 'One list, not seven — a {{baseUrl}} is the same variable whichever protocol reads it.' },
          { icon: 'clock', title: 'History', desc: 'Everything sent from this workspace, grouped by protocol and by date inside each.' },
        ]} />
        <p className="dw-p">
          The protocol rows are collapsible, and which one you left open is remembered —
          across tab switches and across restarts. The count beside each protocol is
          every request in it, and the badge on each tab is the total across all seven.
        </p>
        {cap('platform-workspace-collections')}
        <Callout type="tip" title="They are the real panels">
          The tree inside a protocol row is not a copy of the sidebar's — it is the
          sidebar's. Rename, duplicate, move, run, add to a mock server, and every
          keyboard shortcut work exactly as they do in the sidebar, because it is the
          same component.
        </Callout>
      </div>

      <Divider />

      {/* ─── Docs ────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="ws-docs" icon="document">Documentation</SectionTitle>
        <p className="dw-p">
          Each workspace has a documentation panel on its Overview — rich text or
          Markdown over the same document, so you can write it either way and read it
          the other. It is the place for what a new person on the project needs and the
          code cannot tell them: which environment is safe to run against, what the
          shared credentials are called, which collection to start from.
        </p>
        <SubTitle>Drag it wider</SubTitle>
        <p className="dw-p">
          The panel is a split — drag the divider to give the docs as much of the
          screen as you want. The width is remembered, the same way every other split
          in the app is.
        </p>
      </div>

      <Divider />

      {/* ─── Import & export ─────────────────────────────────────────── */}
      <div>
        <SectionTitle id="ws-move" icon="export">Moving a workspace between machines</SectionTitle>
        <p className="dw-p">
          Quick Actions on the Overview has Import and Export. Export writes the whole
          workspace — every collection, every environment, in Daakia's own format —
          as one file. Import reads that file back, and also reads the formats other
          tools export.
        </p>
        <WikiTable
          headers={['Format', 'Import', 'Export']}
          rows={[
            ['Daakia workspace', 'Yes — the whole workspace in one file', 'Yes'],
            ['Postman', 'Yes', 'Per collection'],
            ['Insomnia', 'Yes', 'Per collection'],
            ['Bruno', 'Yes', 'Per collection'],
            ['OpenAPI 3.x / Swagger 2.0', 'Yes', '—'],
            ['HAR', 'Yes', '—'],
          ]}
        />
        <Callout type="info" title="Import lands in the workspace you are in">
          An import does not create a workspace of its own. If you want the imported
          project kept apart, make the workspace first, switch to it, then import.
        </Callout>
      </div>
    </WikiScrollPage>
  );
}
