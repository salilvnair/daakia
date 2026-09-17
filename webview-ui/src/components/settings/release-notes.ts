/**
 * What shipped, and when.
 *
 * Kept as data rather than prose so the About screen can lead with the current
 * release and still let somebody read back through the ones before it. Each
 * entry is what a person would want to know about that version — not a commit
 * log, which they can already read on GitHub, and not marketing.
 *
 * ── The rule for writing one ──
 *
 * A line says what changed for the reader, in their words. "Quick Search
 * remembers the pods a search ran over" is an entry; "refactored the search
 * store" is not. If a line cannot be written that way, the change probably
 * belongs in the commit and nowhere else.
 *
 * ── And the rule for adding one ──
 *
 * Every version here has to be a version that exists: same number, same date,
 * same content as `CHANGELOG.md` and as the tag it went out under. This file
 * once carried a 2.9.0 and a 2.5.0 that were never released, which is worse
 * than having no history screen at all — a reader who checks one entry against
 * the repository and finds it invented has no reason to believe the rest.
 */

export type ReleaseKind = 'feature' | 'fix' | 'change';

export interface ReleaseLine {
  kind: ReleaseKind;
  /** The area it belongs to — REST, dk8s, dkgh, AI, Mock Server… */
  area: string;
  text: string;
}

export interface Release {
  version: string;
  /** ISO date, so it sorts and formats without a parser. */
  date: string;
  /** One sentence: what this release is about. */
  headline: string;
  lines: ReleaseLine[];
}

/**
 * Newest first, and the first entry is the one the About screen leads with.
 *
 * The version here is the source of truth for "what is new" only. The version
 * the app reports is the extension manifest's, read at build time, so the two
 * cannot drift into disagreeing about what is running.
 */
export const RELEASES: Release[] = [
  {
    version: '3.1.1',
    date: '2026-09-17',
    headline: 'dk8s stops guessing: it says what it ran, finds what a pod still holds, and notices when it has been talking to nobody.',
    lines: [
      // ── Search ──
      { kind: 'feature', area: 'dk8s', text: 'Search what a pod still holds, not just its tail. Search Everywhere greps inside the container, over the log directory the pod actually mounts, so a line rotated out of kubectl logs is still found.' },
      { kind: 'feature', area: 'dk8s', text: 'A configured log path is a path inside the pod, checked against a pod you name — not a host path guessed from a mount table.' },
      { kind: 'feature', area: 'dk8s', text: 'A search result is a page, not a dialog — the same log view, with the same filter, level chips, field rail, stack folding, wrap and Analyze.' },
      { kind: 'feature', area: 'dk8s', text: 'Download a result by time and by how much of it you want. The window opens on the span the hits cover, and ±100 through ±10,000 surrounding lines is a choice.' },
      { kind: 'feature', area: 'dk8s', text: 'Find a logger and keep what is around it, with a window that can be bounded at both ends.' },

      // ── Logs ──
      { kind: 'feature', area: 'dk8s', text: 'Follow several pods at once, side by side. Two to four panes, each a complete log view with its own filter, tail and Following — side by side, stacked or a grid, with a draggable divider on every boundary.' },
      { kind: 'feature', area: 'dk8s', text: 'A link to a pod and to one line of its log. Right-click a line, Copy link, send it: the recipient lands on that pod with that line highlighted. It carries the timestamp and the text, never a line number, because kubectl logs is a moving window over a file that rotates.' },
      { kind: 'feature', area: 'dk8s', text: 'How many lines, and how far the context reaches, are settings — Settings → DK8S → Logs — rather than numbers baked into the view.' },

      // ── Pods ──
      { kind: 'feature', area: 'dk8s', text: 'Filter the pod list by cluster, namespace and app as well as by type. Each facet counts against what the others already allow, and chips say what is in force.' },
      { kind: 'feature', area: 'dk8s', text: 'Every row says what kind of thing it is — DEPLOYMENT, CRONJOB, NODE — in both the cards and the table.' },
      { kind: 'feature', area: 'dk8s', text: 'A CronJob run is badged as one and hidden by default; finished runs stopped counting as pods needing attention.' },
      { kind: 'feature', area: 'dk8s', text: 'Starring stars the app rather than the pod, so a star survives a rollout. A long press starts a selection and Escape ends one.' },

      // ── Commands ──
      { kind: 'feature', area: 'dk8s', text: 'The command audit says how long each call took, grouped by verb with a median, a worst case and a total — which is how top pods was found to be 324 of 494 calls in one session.' },
      { kind: 'feature', area: 'dk8s', text: 'Command Config decides which kinds of call the Commands tab lists.' },

      // ── Speed ──
      { kind: 'change', area: 'dk8s', text: 'A log opens with one kubectl call instead of three, and the pod grid paints from the cheap list first — the table a terminal is fast at — filling in from the full one when it lands.' },
      { kind: 'change', area: 'dk8s', text: 'A watch no longer fetches every pod list twice. --watch replays the entire current state before it starts watching; --watch-only does not. Measured on four pods: 23,372 bytes replayed against 0.' },
      { kind: 'change', area: 'dk8s', text: 'CPU and memory are asked for rather than polled. live keeps them current when you want that, stops when the panel is not in front, and backs off while the numbers stand still.' },

      // ── Reliability ──
      { kind: 'fix', area: 'dk8s', text: 'A watch that had gone deaf is found and restarted. A kubectl get --watch can be alive and receiving nothing — a slept laptop, a dropped VPN — and nothing on screen said so.' },
      { kind: 'fix', area: 'dk8s', text: 'A watch that was talking to a page that had gone. A webview reload does not restart the host, so a watch kept posting into the channel of the page that started it: one replayed snapshot, then silence.' },
      { kind: 'fix', area: 'dk8s', text: 'Refresh ends. It said "refreshing" until a snapshot arrived and cleared nowhere else, so a failed list left the word on screen forever.' },
      { kind: 'fix', area: 'dk8s', text: "A cluster's namespaces sit together instead of interleaving with another cluster's by name." },
      { kind: 'fix', area: 'dk8s', text: 'Closing a split down to one pod opens that pod properly, with its Overview, Terminal, Doctor and Explorer, rather than leaving it in a pane.' },
      { kind: 'fix', area: 'dk8s', text: 'An export says where it went before the notice goes away, a metrics poll is no longer reported as a command you ran, and the context ladder stops where the lines do.' },

      // ── Everywhere ──
      { kind: 'fix', area: 'Editing', text: 'Ctrl+V pastes again, in every field in the app — a URL bar, a JSON body, a script, a header value. Copy and Cut always worked because they push text out, which needs no permission; a webview denies the clipboard-read that paste needs, so the keystroke did nothing at all. It now takes the same route right-click → Paste already took, through the extension host.' },

      // ── dkgh ──
      { kind: 'fix', area: 'dkgh', text: "A bar chart's count stays inside its card. The stacked track was sized as a share of the whole row rather than of the space left in it, so the longest row pushed its number past the border." },
    ],
  },
  {
    version: '3.1.0',
    date: '2026-09-15',
    headline: 'Point daakia at a repository and it reads the routes out of the source.',
    lines: [
      { kind: 'feature', area: 'Code Scan', text: 'Build a collection from your code. Give it a folder and every route declared in it comes back as a request — Spring Boot, Express, Hapi.js, Next.js, FastAPI and Flask, out of the box.' },
      { kind: 'feature', area: 'Code Scan', text: 'It says how it knows. Every field is marked: read from the source and where, resolved through a custom annotation or a mounted router, taken from an example, or generated to satisfy a validation constraint.' },
      { kind: 'feature', area: 'Code Scan', text: 'Your own annotations are followed — a @TestClientApiController that is @RestController underneath resolves through four levels, and @AliasFor renames are honoured.' },
      { kind: 'feature', area: 'Code Scan', text: 'The base URL is the one the service runs on: its port and its context path, from the profile you picked. Profiles are chosen, not merged, because they disagree on purpose.' },
      { kind: 'feature', area: 'Code Scan', text: 'An environment arrives with the collection, holding {{baseUrl}} — without it the collection points at nothing.' },
      { kind: 'feature', area: 'Code Scan', text: 'One folder per source file, matching the groups the review screen showed you. Internal and actuator endpoints are listed but never arrive ticked.' },
      { kind: 'feature', area: 'Code Scan', text: 'Re-scanning a collection you have worked in shows you added, updated, conflict, orphaned and unchanged before anything is written. Matched on method and path, so renaming a request does not orphan it.' },
      { kind: 'feature', area: 'Code Scan', text: 'Your edits are never overwritten silently, and nothing is ever deleted — a removed route and a moved file look identical from here, so an orphan is marked and left.' },
      { kind: 'feature', area: 'Settings', text: 'Code Scan, under Advanced: the file cap, folders to skip, which parsers to run, and what the review screen arrives with ticked — leading with what a scan does, which is open files and nothing else.' },
      { kind: 'feature', area: 'dk8s', text: 'An Access tab in the explorer, with one list of what you can and cannot do in a namespace instead of the same question answered three ways in three places.' },
      { kind: 'fix', area: 'dk8s', text: 'Every command dk8s runs is written down, including the ones that were refused — a silent refusal made a permissions problem look like a bug.' },
      { kind: 'fix', area: 'dk8s', text: 'A command card appears when the command starts, not when it finishes, so a long wait shows what it is waiting on.' },
      { kind: 'fix', area: 'dk8s', text: 'A cluster nobody is on stopped answering for one you are: contextless commands were exempt from the cluster filter.' },
      { kind: 'change', area: 'dk8s', text: 'The 25-second verdict is yours to set. A slow cluster was being called broken on a timeout nobody chose.' },
      { kind: 'fix', area: 'REST', text: 'The toolbar shows the environment that is actually active. It fell back to whichever one sorted first, so a tab could say Default while the right panel said something else.' },
    ],
  },
  {
    version: '3.0.3',
    date: '2026-09-13',
    headline: 'A day spent on everything that was telling you the wrong thing while it worked.',
    lines: [
      { kind: 'fix', area: 'AI', text: 'A refused connection says which port refused it, instead of reporting that the model did not answer a question that was never sent.' },
      { kind: 'feature', area: 'dk8s', text: 'Quick Search remembers what it ran and the pods it ran over — one click restores both, and re-picks the pods that are still there.' },
      { kind: 'change', area: 'dk8s', text: 'That history lives in the search box itself, as suggestions, with Clear all on its heading — and Logs and Files keep their own, so one does not bury the other.' },
      { kind: 'fix', area: 'dk8s', text: 'The namespace picker no longer says a cluster is empty while it is still being read.' },
      { kind: 'fix', area: 'dk8s', text: 'Pressing Watch keeps you on the pods. A cluster list that arrived late was dragging you back to the namespace picker fifteen seconds in.' },
      { kind: 'fix', area: 'dk8s', text: 'The AI panel scrolls. Its cards were being squashed to fit, so nothing ever overflowed and there was nothing to scroll.' },
      { kind: 'feature', area: 'dk8s', text: 'Every question and answer folds on its own, the question carries who asked it, and the answer says what answered.' },
      { kind: 'fix', area: 'dk8s', text: 'A follow-up stopped erasing the evidence it was asking about, and “what was sent” shows what was sent.' },
      { kind: 'change', area: 'dk8s', text: 'Every wait that owns a panel — kubectl, namespaces, pods, retries — is the same size and says what it is waiting for.' },
      { kind: 'fix', area: 'dkgh', text: 'A comment’s #14 is a link, opens inside dkgh, and survives the composer — it used to be escaped on the way to GitHub and quietly stop linking.' },
      { kind: 'change', area: 'dkgh', text: 'One Generate button that generates, says it is working, and stops offering to do again what it has just done.' },
      { kind: 'feature', area: 'dkgh', text: 'What the AI proposed is reviewed field by field — every field of the template, whose value each one is, and an editor on each rather than take it or leave it.' },
      { kind: 'feature', area: 'dkgh', text: 'A screenshot goes in the field you paste it into. Ctrl+V into Evidence, and it is written under Evidence.' },
      { kind: 'fix', area: 'dkgh', text: 'Every field you filled is actually filed. The composer ran on the proposed template while the body was built from one nothing ever set, so template answers were shown, counted — and then dropped.' },
      { kind: 'feature', area: 'Settings', text: 'An About screen: which version you are on, what is new in it, and what came before. There is an ⓘ under the gear that opens it.' },
      { kind: 'feature', area: 'Settings', text: 'dk8s and dkgh can be taken off the toolbar, each from its own General page.' },
      { kind: 'change', area: 'Settings', text: 'The AI audit keeps the whole exchange — the full request, the full response, the headers and the metadata — rather than a truncated echo of it.' },
      { kind: 'change', area: 'Everywhere', text: 'One chip, in fifty switchable styles, with its padding and its centring fixed — and light mode stopped drawing a box around every tab strip.' },
    ],
  },
  {
    version: '3.0.2',
    date: '2026-09-13',
    headline: 'Five things that were quietly wrong, and a listing that can be measured.',
    lines: [
      { kind: 'fix', area: 'Editor', text: 'The editor tab has its icon back. It pointed into media/, which 3.0.0 began excluding from the package so the README’s GIFs would stop shipping inside the extension.' },
      { kind: 'fix', area: 'dk8s', text: 'No more offering clusters you deleted. A context removed from your kubeconfig was remembered forever and queried on every refresh.' },
      { kind: 'fix', area: 'dk8s', text: 'Nothing spins forever. A cluster that had already refused looked identical to one still being asked; both now say which, and silence gets its own answer after twenty-five seconds.' },
      { kind: 'fix', area: 'Workspace', text: 'Closing a tab is remembered. The snapshot was written two seconds after a change, and closing the panel inside that window took the pending save with it.' },
      { kind: 'fix', area: 'Build', text: 'Builds are reproducible. The design system resolved through a path on one machine rather than from the registry — nothing shipped differently, it simply could not be rebuilt anywhere else.' },
      { kind: 'change', area: 'Marketplace', text: 'Searchable as a REST client: the listing carries the words people actually search for, and a rank probe asks the Marketplace where it really appears for them — measured rather than guessed at.' },
    ],
  },
  {
    version: '3.0.1',
    date: '2026-09-12',
    headline: 'The listing, rewritten so the extension can be found.',
    lines: [
      { kind: 'change', area: 'Marketplace', text: 'Named and described as what it is — a REST and HTTP client for VS Code — with the protocols, the Kubernetes dashboard and the GitHub board said in the words people search for.' },
      { kind: 'change', area: 'Docs', text: 'The README rebuilt around what each surface actually does, rather than a feature list.' },
    ],
  },
  {
    version: '3.0.0',
    date: '2026-09-12',
    headline: 'dk8s and dkgh — two surfaces that are not an API client at all.',
    lines: [
      { kind: 'feature', area: 'dk8s', text: 'Kubernetes in the editor: pods watched live, logs with structure, a real terminal in the container, a file explorer, and search across every watched pod.' },
      { kind: 'feature', area: 'Doctor', text: 'Open a heap dump, a thread dump or a flight recording and get a verdict — dominators, leak suspects, deadlocks, CPU hot spots — with the AI able to ask for another view.' },
      { kind: 'feature', area: 'dkgh', text: 'One repository’s issues as a board in four shapes, with saved views, a team view, insights and export — filed through the official gh CLI, so the credential stays in the OS keychain.' },
      { kind: 'feature', area: 'Workspaces', text: 'Collections, environments and history belong to a project rather than to the app.' },
      { kind: 'feature', area: 'AI', text: 'An audit trail behind every call, and redaction that catches dotted property names before anything leaves the machine.' },
      { kind: 'change', area: 'Compatibility', text: 'The major bump is the shape of the app, not the file formats — collections, environments and mock configs from 2.x load unchanged.' },
    ],
  },
  {
    version: '2.0.2',
    date: '2026-07-31',
    headline: 'Git sync grows into a real sync engine, with encrypted secrets and a bin.',
    lines: [
      { kind: 'feature', area: 'Git Sync', text: 'A fixed local clone, encrypted secrets, and more of the workspace carried across machines.' },
      { kind: 'feature', area: 'Bin', text: 'A recovery bin, so a deleted collection is a decision you can take back.' },
      { kind: 'feature', area: 'GraphQL', text: 'An interactive schema explorer beside the query.' },
    ],
  },
  {
    version: '2.0.1',
    date: '2026-07-30',
    headline: 'Bug fixes from real-world use of 2.0.0. No new features.',
    lines: [
      { kind: 'fix', area: 'REST', text: 'The request and response split resizes on REST, GraphQL and MCP the way it already did everywhere else.' },
    ],
  },
  {
    version: '2.0.0',
    date: '2026-07-30',
    headline: 'A full redesign, stateful mocking, an in-app wiki, and git-native sync.',
    lines: [
      { kind: 'change', area: 'Everywhere', text: 'The whole UI moved onto @salilvnair/dui, one shared component library, so a control means the same thing on every screen.' },
      { kind: 'feature', area: 'Mock Server', text: 'Mocks from a collection or an OpenAPI document, with state machines for flows that have to remember.' },
      { kind: 'feature', area: 'Git Sync', text: 'Collections and environments synced through a git repository you own.' },
      { kind: 'feature', area: 'Wiki', text: 'The documentation, in the app, beside the thing it documents.' },
    ],
  },
  {
    version: '1.0.3',
    date: '2026-06-08',
    headline: 'MCP against several servers at once, and WebSocket that reconnects.',
    lines: [
      { kind: 'feature', area: 'MCP', text: 'Several servers per tab, with auth, Claude Desktop config import, and a catalogue of twenty to add in one click.' },
      { kind: 'feature', area: 'WebSocket', text: 'Auto-reconnect with backoff, and saved message templates.' },
    ],
  },
  {
    version: '1.0.2',
    date: '2026-05-31',
    headline: 'Every protocol in one client.',
    lines: [
      { kind: 'feature', area: 'GraphQL', text: 'Schema introspection, an explorer, variables and subscriptions.' },
      { kind: 'feature', area: 'Real time', text: 'WebSocket, SSE and Socket.IO, each with its own transcript.' },
      { kind: 'feature', area: 'SOAP', text: 'Envelope editor, WSDL import, WS-Security and XSD validation.' },
      { kind: 'feature', area: 'AI', text: 'Explain a response, ask a follow-up, write assertions in a sentence, generate types.' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-05-22',
    headline: 'Daakia, a REST client that lives in the editor.',
    lines: [
      { kind: 'feature', area: 'REST', text: 'Requests, headers, params and bodies; a response viewer with a JSON tree, headers, cookies and a timeline.' },
      { kind: 'feature', area: 'Workflow', text: 'Tabs with an unsaved marker, history in SQLite, and the keyboard shortcuts you already use.' },
    ],
  },
];

/** The release the About screen leads with. */
export const CURRENT_RELEASE = RELEASES[0];

/** `2026-09-13` → `13 September 2026`, without pulling in a date library. */
export function formatReleaseDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                 'August', 'September', 'October', 'November', 'December'][m - 1];
  return `${d} ${month} ${y}`;
}
