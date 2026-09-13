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
    version: '3.0.2',
    date: '2026-09-13',
    headline: 'A pass over everything that was telling you the wrong thing while it worked.',
    lines: [
      { kind: 'fix', area: 'AI', text: 'A refused connection now says which port refused it, instead of reporting that the model did not answer a question that was never sent.' },
      { kind: 'feature', area: 'dk8s', text: 'Quick Search remembers what it ran and the pods it ran over — one click restores both, and re-picks the pods that are still there.' },
      { kind: 'fix', area: 'dk8s', text: 'The namespace picker no longer says a cluster is empty while it is still being read.' },
      { kind: 'fix', area: 'dk8s', text: 'The AI panel scrolls. Its cards were being squashed to fit, so nothing ever overflowed and there was nothing to scroll.' },
      { kind: 'change', area: 'dk8s', text: 'Every wait that owns a panel — kubectl, namespaces, pods, retries — is the same size and says what it is waiting for.' },
      { kind: 'fix', area: 'dkgh', text: 'A comment’s #14 is a link, opens inside dkgh, and survives the composer — it used to be escaped on the way to GitHub and quietly stop linking.' },
      { kind: 'change', area: 'dkgh', text: 'One Generate button that generates, reports that it is working, and stops offering to do again what it has just done.' },
      { kind: 'feature', area: 'Marketplace', text: 'Searchable as a REST client: the listing now carries the words people actually search for.' },
    ],
  },
  {
    version: '3.0.0',
    date: '2026-09-08',
    headline: 'dkgh — GitHub issues, boards and reviews, inside the editor.',
    lines: [
      { kind: 'feature', area: 'dkgh', text: 'A board, a table and a roadmap over your repository’s issues, read through the GitHub CLI you already have.' },
      { kind: 'feature', area: 'dkgh', text: 'A composer that reads the repository’s own issue-form YAML and asks about the fields your description did not answer.' },
      { kind: 'feature', area: 'dk8s', text: 'Multi-cluster watching: several contexts at once, kept apart in the grid.' },
      { kind: 'change', area: 'Everywhere', text: 'The UI moved onto one component library, so a chip in dk8s and a chip in the response panel are the same chip.' },
    ],
  },
  {
    version: '2.9.0',
    date: '2026-08-21',
    headline: 'dk8s grew the analyzers: heap dumps, thread dumps and flight recordings.',
    lines: [
      { kind: 'feature', area: 'dk8s', text: 'Collect a heap dump, a thread dump or a JFR from a pod, and read it in the editor without leaving for another tool.' },
      { kind: 'feature', area: 'dk8s', text: 'Search several pods’ logs at once, matched on this machine — only the hits come back.' },
      { kind: 'feature', area: 'dk8s', text: 'A file browser inside a running container, with download and preview.' },
    ],
  },
  {
    version: '2.5.0',
    date: '2026-07-02',
    headline: 'Mock servers, and scripting that runs where the request does.',
    lines: [
      { kind: 'feature', area: 'Mock Server', text: 'Stand up a mock from a collection or an OpenAPI document, with state machines for flows that have to remember.' },
      { kind: 'feature', area: 'Scripting', text: 'Pre-request and test scripts with a real debugger — breakpoints, variables, step through.' },
      { kind: 'feature', area: 'REST', text: 'Collection runner with environments, data files and a JUnit report.' },
    ],
  },
  {
    version: '2.0.0',
    date: '2026-05-14',
    headline: 'Every protocol in one client.',
    lines: [
      { kind: 'feature', area: 'GraphQL', text: 'Schema-aware editor, introspection and variables.' },
      { kind: 'feature', area: 'gRPC', text: 'Reflection or a proto file, unary and streaming.' },
      { kind: 'feature', area: 'Real time', text: 'WebSocket, SSE, MQTT and Socket.IO, each with its own transcript.' },
      { kind: 'feature', area: 'SOAP', text: 'WSDL parsing and envelope building.' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-03-01',
    headline: 'Daakia, a REST client that lives in the editor.',
    lines: [
      { kind: 'feature', area: 'REST', text: 'Requests, collections, environments and history, in a tab beside the code.' },
      { kind: 'feature', area: 'Import', text: 'Postman, Insomnia, Thunder Client, Bruno, HAR and cURL.' },
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
