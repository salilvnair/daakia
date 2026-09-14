/**
 * dkgh — the board, and the rules behind what it shows.
 *
 * Written for somebody deciding whether to trust a count. A board is only
 * useful if "three unassigned PROD issues" is true, so this says where each
 * number comes from, what a filter actually means, and what dkgh sends to
 * GitHub to find out.
 *
 * dkgh shipped in 3.0.0 with no wiki page at all — the whole surface was
 * documented in the changelog and nowhere a reader could find it.
 */
import { WikiScrollPage } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, WikiTable, Callout, Divider, Code,
  Steps, chips, TocBar, ShortcutGrid, WikiCard, type TocItem,
} from '../shared/WikiShared';

const TOC_ITEMS: TocItem[] = [
  { id: 'gh-what', icon: 'git', label: 'What it is' },
  { id: 'gh-shapes', icon: 'layers', label: 'Four shapes' },
  { id: 'gh-filter', icon: 'filter', label: 'Filtering' },
  { id: 'gh-views', icon: 'star', label: 'Saved views' },
  { id: 'gh-team', icon: 'user', label: 'Team' },
  { id: 'gh-insights', icon: 'gauge', label: 'Insights' },
  { id: 'gh-repo', icon: 'folder', label: 'Repository' },
  { id: 'gh-export', icon: 'download', label: 'Export' },
  { id: 'gh-trust', icon: 'lock', label: 'Credentials' },
  { id: 'gh-keys', icon: 'keyboard', label: 'Keys' },
];

export function DkghOverviewView() {
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          icon="git"
          title="dkgh — GitHub issues, in the editor"
          subtitle="One repository's issues as a board, a table, columns and a roadmap — read and written through the gh CLI you already have signed in."
          chips={chips(['board', 'saved views', 'team', 'insights', 'export', 'gh CLI'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <SectionTitle id="gh-what" icon="git">What it is</SectionTitle>
        <p className="dw-p">
          dkgh is one repository at a time. Not a dashboard over an
          organisation — the issues of the thing you are working on, beside the
          code, so that "is this already filed?" and "what is on my plate?" stop
          being a trip to a browser tab.
        </p>
        <p className="dw-p">
          It reads and writes through <Code>gh</Code>, the official GitHub CLI.
          Daakia never holds a token: scopes, hosts and accounts are read from
          the CLI you already authenticated, and your credential stays in the
          operating system's keychain. Every command is shown before it runs.
        </p>

        <Callout type="tip" title="Where it is">
          The rail down the left, under the protocols — and if you never file
          issues, <strong>Settings → DKGH → General</strong> takes the icon off
          it. From 3.0.3 that icon is off on a fresh install; the command
          palette (<Code>Ctrl+K</Code>) opens dkgh either way.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="gh-shapes" icon="layers">Four shapes, one question</SectionTitle>
        <p className="dw-p">
          Cards, table, columns and roadmap are four renderings of the same
          filter. Changing the question does not mean rebuilding the view —
          switch shape and the same issues are still on screen, arranged for a
          different reading.
        </p>
        <WikiTable
          headers={['Shape', 'Reads as', 'Use it when']}
          rows={[
            ['Cards', 'A wall of issues, grouped', 'Scanning for something you half remember'],
            ['Table', 'Rows and sortable columns', 'Comparing many issues on one field'],
            ['Columns', 'Status lanes, drag between them', 'Moving work along'],
            ['Roadmap', 'Issues over time', 'What lands when, and what has slipped'],
          ]}
        />
        <p className="dw-p">
          Grouping is by anything the repository declares — Module, Environment,
          Type — because those come from its own issue-form YAML rather than
          from a list dkgh invented. A repository that adds a field gets a
          grouping for it without dkgh changing.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="gh-filter" icon="filter">Filtering, in words</SectionTitle>
        <p className="dw-p">
          One filter, three renderings: facets to discover what can be filtered,
          chips saying in words what you are looking at, and a query string for
          pasting into a chat. They cannot disagree, because they are the same
          state rendered three ways.
        </p>

        <SubTitle>The two rules everybody gets wrong once</SubTitle>
        <WikiTable
          headers={['Written', 'Means']}
          rows={[
            [<Code>type:ui,backend</Code>, 'Two values in one facet — UI or Backend'],
            [<Code>type:ui env:prod</Code>, 'Two facets — UI and PROD'],
            [<Code>-label:wontfix</Code>, 'Everything except. Half of real filtering is subtractive'],
            [<Code>assignee:none</Code>, 'The absence of a value, which is a real choice'],
            [<Code>quiet:14d</Code>, 'Nothing has happened on it for a fortnight'],
          ]}
        />

        <Callout type="info" title="The counts are live and conditional">
          Each facet is counted with every other facet applied but not its own —
          which is what makes "three unassigned PROD issues" visible before you
          click anything. A value at zero stays in the list, greyed: hiding it
          would leave you wondering where it went, and showing its unfiltered
          count would be a number you could act on and be wrong.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="gh-views" icon="star">Saved views</SectionTitle>
        <p className="dw-p">
          A filter worth writing twice is a view. Five come built in, and your
          own sit beside them; each carries its own count, so the rail answers
          "is there anything for me today?" without being opened.
        </p>
        <WikiTable
          headers={['View', 'What it asks']}
          rows={[
            ['All open', <Code>state:open</Code>],
            ['Stale & unowned', 'Open, nobody assigned, nothing said for a fortnight'],
            ['My plate', <>Open and assigned to <Code>@me</Code></>],
            ['This sprint', 'Open, created in the current sprint window'],
            ['Closed this week', 'Closed, touched in the last seven days'],
          ]}
        />
        <Callout type="warn" title="A shared link says what it drops">
          Sharing a view hands over the query, not your screen. If the person
          opening it cannot see something the filter names — a label that was
          renamed, a project they have no access to — the link says so rather
          than silently narrowing the result.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="gh-team" icon="user">Team</SectionTitle>
        <p className="dw-p">
          Who is carrying what, <strong>unassigned first, on purpose</strong>.
          That is the row a lead needs: the pile nobody has picked up is the
          thing a standup is for, and sorting it to the bottom by name would
          hide it behind whoever is called Aaron.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="gh-insights" icon="gauge">Insights</SectionTitle>
        <p className="dw-p">
          Four questions, answered from the issues already loaded — no extra
          calls, no server: open issues over time, where they are by module
          split by environment, how long they sit before anyone touches them,
          and who is carrying what. Your own charts can be pinned beside those,
          and any of them compared against the period before.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="gh-repo" icon="folder">Repository — where the chips come from</SectionTitle>
        <p className="dw-p">
          Everything dkgh groups, filters and files by is read from the
          repository itself, and this screen is where you see it and change it.
        </p>
        <WikiCard title="What it holds" icon="folder">
          <Steps steps={[
            <>The <Code>.github/ISSUE_TEMPLATE/*.yml</Code> forms, parsed from the YAML rather than guessed at — their fields become the composer's fields and the board's groupings.</>,
            <>A <strong>field map</strong>, so a dimension called <Code>Module</Code> in one repository and <Code>Component</Code> in another can be the same column here.</>,
            <>Label sets imported from somewhere else, when a new repository should start with the labels your team already uses.</>,
          ]} />
        </WikiCard>
      </div>

      <Divider />

      <div>
        <SectionTitle id="gh-export" icon="download">Export</SectionTitle>
        <WikiTable
          headers={['Format', 'What it is for']}
          rows={[
            ['Excel (.xlsx)', 'A real workbook — columns you pick, typed, sortable'],
            ['PDF', 'Reads as a status mail, for somebody who will not open a spreadsheet'],
            ['CSV', 'For whatever you are piping it into'],
            ['Markdown', 'Paste into an issue, a wiki, or a chat'],
          ]}
        />
        <p className="dw-p">
          An export can be scheduled — the Friday status that nobody remembers
          to send — and it runs over the filter that is on screen, so what you
          exported is what you were looking at.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="gh-trust" icon="lock">Your credential never reaches Daakia</SectionTitle>
        <p className="dw-p">
          dkgh shells out to <Code>gh</Code>. That is the whole security model,
          and it is the reason there is no "paste a personal access token"
          screen anywhere in this tab.
        </p>
        <Steps steps={[
          <>Scopes, hosts and accounts are <strong>read from the CLI</strong> — if <Code>gh auth status</Code> says you cannot write to a repository, dkgh says so too, in the same words.</>,
          <>Every command is <strong>disclosed before it runs</strong>. The confirm screen is built from the command itself, so it cannot describe an action other than the one about to happen.</>,
          <>A refusal — a protected branch, a missing scope — is <strong>reported as somebody else's rule</strong>, not as a bug in Daakia, and the composer keeps your draft.</>,
        ]} />
      </div>

      <Divider />

      <div>
        <SectionTitle id="gh-keys" icon="keyboard">Keys</SectionTitle>
        <p className="dw-p">
          The ones a GitHub user already has in their fingers.
        </p>
        <ShortcutGrid items={[
          { label: 'Move the cursor', keys: ['j', 'k'] },
          { label: 'Select this row — hold to peek', keys: ['Space'] },
          { label: 'Open the issue', keys: ['Enter'] },
          { label: 'Open it on github.com', keys: ['o'] },
          { label: 'Assign…', keys: ['a'] },
          { label: 'Label…', keys: ['l'] },
          { label: 'Milestone…', keys: ['m'] },
          { label: 'Close', keys: ['c'] },
          { label: 'Jump to search', keys: ['/'] },
          { label: 'Open the filters', keys: ['f'] },
          { label: 'Group by…', keys: ['g'] },
          { label: 'This list', keys: ['?'] },
        ]} />
      </div>
    </WikiScrollPage>
  );
}
