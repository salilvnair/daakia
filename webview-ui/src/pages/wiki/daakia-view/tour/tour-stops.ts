/**
 * The tour — real screens of Daakia, with the interesting parts marked.
 *
 * ── What this is ──
 *
 * Every other wiki page is reference: paragraphs you read when you already
 * know what you are looking for. This is the other thing — a walk through the
 * app for somebody who has never opened it, built the way a product tour is:
 * a real screenshot, a few numbered points on it, and one sentence per point
 * that answers "what is that?".
 *
 * ── Why coordinates and not anchors ──
 *
 * A stop's picture is a captured `#root` outerHTML rendered at a fixed design
 * size (1280×720 — see CaptureScrollView). Hotspots are placed as percentages
 * of that box, so they stay put when the frame is scaled to whatever width the
 * reader's panel happens to be. Anchoring to elements inside the capture would
 * tie every hotspot to a class name that a restyle can rename.
 *
 * ── Keeping it honest ──
 *
 * Coordinates are measured, not guessed: each one was read off the rendered
 * capture in the running app, so a marker sits on the thing it names rather
 * than near it.
 *
 * `capture` is a screen id from `scripts/screen-catalogue.mjs`. `tour.test.ts`
 * fails if a stop names a capture that no longer exists, so a recapture that
 * drops a screen shows up here rather than as a blank frame.
 */

export interface Hotspot {
  /** Percentage across the captured frame, 0–100. */
  x: number;
  /** Percentage down the captured frame, 0–100. */
  y: number;
  title: string;
  body: string;
}

export interface TourStop {
  id: string;
  /** Capture id — the filename in `plan/daakia_live/<section>/` without .html. */
  capture: string;
  /** Which section's captures module holds it. */
  section: 'rest' | 'platform' | 'mock-server' | 'dk8s' | 'graphql';
  chapter: string;
  title: string;
  blurb: string;
  hotspots: Hotspot[];
}

export const TOUR_STOPS: TourStop[] = [
  {
    id: 'tour-rest-request',
    capture: 'rest-params',
    section: 'rest',
    chapter: 'The request',
    title: 'Everything about one request, on one screen',
    blurb: 'A request in Daakia is a tab. The URL bar runs across the top, everything that shapes the call sits in the row of sub-tabs beneath it, and the answer lands in the panel below — no dialogs, no second window.',
    hotspots: [
      { x: 2.2, y: 12, title: 'Protocol rail',
        body: 'REST, GraphQL, WebSocket, gRPC, SOAP, MCP, the mock server and dk8s. Picking one here switches which kind of tab the + button opens.' },
      { x: 11, y: 2.8, title: 'The tab bar',
        body: 'Every request you have open, colour-dotted by protocol. An orange dot means unsaved. Right-click for rename, duplicate, close others.' },
      { x: 30, y: 8.7, title: 'Method and URL',
        body: 'Type a URL and press Ctrl+Enter. {{variables}} from the active environment resolve here, and the query string stays in step with the Params table below.' },
      { x: 20, y: 15.3, title: 'Request sub-tabs',
        body: 'Params, Headers, Body, Authorization, Scripts, Variables, Action, Docs and Settings. A dot on a tab means it has something in it, so you can see what a request carries without opening each one.' },
      { x: 28, y: 24.3, title: 'Query parameters',
        body: 'Key/value rows with a checkbox each. Unticking a row leaves it in place but out of the request — which is what you want while narrowing down which parameter broke it.' },
    ],
  },
  {
    id: 'tour-rest-response',
    capture: 'rest-response',
    section: 'rest',
    chapter: 'The request',
    title: 'The response, with the evidence attached',
    blurb: 'Status, timing and size sit on one line, and the tabs beneath hold the body, the headers, the cookies and the timeline of how the connection was spent.',
    hotspots: [
      { x: 12, y: 37.4, title: 'Status line',
        body: 'Code, time and size. The colour is the class of the status — one glance tells you 2xx from 4xx without reading the number.' },
      { x: 18, y: 42.6, title: 'Response tabs',
        body: 'JSON, Raw, Assert, Headers, Cookies and Timeline. Timeline breaks the request into DNS, TCP, TLS and time-to-first-byte, which is how you tell a slow server from a slow network.' },
      { x: 73, y: 42.3, title: 'AI on the response',
        body: 'Explain what came back, suggest follow-up requests, or record this response as a baseline to diff future runs against.' },
      { x: 16, y: 58, title: 'Body viewer',
        body: 'Syntax-highlighted and foldable, with a filter box for JSONPath or XPath. Right-click anything here to compare it against your clipboard.' },
    ],
  },
  {
    id: 'tour-collections',
    capture: 'platform-sidebar-collections',
    section: 'platform',
    chapter: 'Organising work',
    title: 'Collections keep requests where you left them',
    blurb: 'A collection is a folder of saved requests with its own variables, inherited headers and auth. Saved requests keep the last response too, so reopening one shows what it returned.',
    hotspots: [
      { x: 84, y: 19.2, title: 'The tree',
        body: 'Folders inside folders, dragged to reorder. Starred requests sort to the top of whichever list they are in.' },
      { x: 88, y: 23.6, title: 'A saved request',
        body: 'Click to open it in a tab, with its headers, body, scripts and last response restored exactly as saved.' },
      { x: 80, y: 14.2, title: 'Run the collection',
        body: 'Runs every request in order, carrying variables from one to the next, and reports which assertions passed.' },
    ],
  },
  {
    id: 'tour-environments',
    capture: 'platform-sidebar-environments',
    section: 'platform',
    chapter: 'Organising work',
    title: 'Environments swap the values, not the requests',
    blurb: 'One request, many places to point it. {{baseUrl}} resolves against whichever environment is active, so moving from local to staging is a dropdown rather than an edit.',
    hotspots: [
      { x: 86, y: 12, title: 'Variable table',
        body: 'Each variable has an initial value and a current value. The initial is what you share; the current is what this machine is using now — which is where a token belongs.' },
      { x: 85, y: 29.9, title: 'Secret variables',
        body: 'Marked secret, masked in the UI, and left out of exports. A token pasted here does not travel with the collection.' },
    ],
  },
  {
    id: 'tour-mock',
    capture: 'mockserver-rest-routes',
    section: 'mock-server',
    chapter: 'Standing in for a backend',
    title: 'A mock server that runs inside the editor',
    blurb: 'Define routes and responses and Daakia serves them on a real port. Useful before the backend exists, and useful when you need a failure the real one will not produce on demand.',
    hotspots: [
      { x: 23.3, y: 33.7, title: 'Routes',
        body: 'Method, path and response per row. Path parameters and wildcards are matched the way a real router would.' },
      { x: 90, y: 53, title: 'Response editor',
        body: 'Status, headers and body, with template helpers for randomised but realistic data — so a list endpoint returns a different list each time.' },
      { x: 84.5, y: 13.1, title: 'Matching and sequences',
        body: 'Serve a different response depending on the request, or walk a sequence on repeat calls — first 202, then 200 — which is how you exercise a polling client.' },
    ],
  },
  {
    id: 'tour-dk8s-pods',
    capture: 'dk8s-pods',
    section: 'dk8s',
    chapter: 'dk8s',
    title: 'A cluster, from inside the editor',
    blurb: 'dk8s points Daakia at Kubernetes: the pods it is watching, their health, and everything a pod can tell you — logs, heap, threads, a shell.',
    hotspots: [
      { x: 14, y: 8.3, title: 'Context and namespace',
        body: 'Watch several at once. dk8s asks the cluster what you are allowed to do before offering it, so a forbidden action is a disabled button with a reason on it.' },
      { x: 12, y: 19.7, title: 'Watch state',
        body: 'How many pods, how many ready, how many failing. Live — the grid updates as the cluster changes rather than on a refresh button.' },
      { x: 11, y: 41.9, title: 'A failing pod',
        body: 'CrashLoopBackOff, styled so it is findable across the room, with its restart count and how long ago the last one was.' },
      { x: 62, y: 45, title: 'Memory trend',
        body: 'A rolling sample per pod, so a pod climbing towards its limit is visible before it is killed for hitting it.' },
    ],
  },
  {
    id: 'tour-dk8s-logs',
    capture: 'dk8s-logs',
    section: 'dk8s',
    chapter: 'dk8s',
    title: 'Logs you can narrow instead of scroll',
    blurb: 'A live stream with levels, and facets built from the fields your log format actually names — so "only this thread" is a click rather than a grep.',
    hotspots: [
      { x: 30.8, y: 33.5, title: 'Levels',
        body: 'Error, warn, info, debug. Turning one off never moves the rest of the panel — the filter strip sits beside the list for exactly that reason.' },
      { x: 10.8, y: 34.5, title: 'Field facets',
        body: 'Thread, logger, whatever the configured format named. Never guessed: a facet appears only where a field was really parsed.' },
      { x: 55, y: 55, title: 'Ask AI why',
        body: 'Select some lines and ask. What is sent is what you highlighted, and it is recorded in the AI audit with the feature name and the screen it came from.' },
    ],
  },
  {
    id: 'tour-dk8s-doctor',
    capture: 'dk8s-doctor',
    section: 'dk8s',
    chapter: 'dk8s',
    title: 'Take the dump, open the analyzer',
    blurb: 'Heap dumps, thread dumps and flight recordings collected straight from a running container and handed to the analyzer — no kubectl cp round trip.',
    hotspots: [
      { x: 30, y: 20, title: 'What is in there',
        body: 'The runtime dk8s detected and the tools it found in the container. Anything missing is greyed out with the reason rather than failing when you click it.' },
      { x: 93.2, y: 29.8, title: 'Collect',
        body: 'Each collection says its cost up front — a heap dump stops the JVM, a flight recording runs for thirty seconds — because that matters on something serving traffic.' },
    ],
  },
  {
    id: 'tour-ai',
    capture: 'settings-ai-features',
    section: 'platform',
    chapter: 'The AI layer',
    title: 'Every AI feature, individually switchable',
    blurb: 'There are around a hundred AI actions in Daakia. Each one has a name, a screen, a switch, and a line in the audit when it runs.',
    hotspots: [
      { x: 31, y: 34.2, title: 'One switch per feature',
        body: 'Grouped by the screen the feature lives on. Turning one off stops the call being made at all — not just the button being hidden.' },
      { x: 90.7, y: 21.4, title: 'The master switch',
        body: 'Everything off in one click, for a machine where no request may leave the network.' },
      { x: 32.5, y: 45.9, title: 'Its prompt',
        body: 'Every feature links to the exact prompt it sends, editable in the Prompt Library. Nothing is sent that you cannot read first.' },
    ],
  },
  {
    id: 'tour-audit',
    capture: 'settings-ai-audit',
    section: 'platform',
    chapter: 'The AI layer',
    title: 'What was sent, and from where',
    blurb: 'Every AI call, by feature name and the screen it was made from — with the model, the duration and the full request and response kept for inspection.',
    hotspots: [
      { x: 37.1, y: 13.2, title: 'Feature and screen',
        body: '"Generate Docs · REST · Docs" rather than a raw key. The name is the same one the settings screen uses, because both read from the prompt library.' },
      { x: 58, y: 13.2, title: 'Model and duration',
        body: 'Which model answered and how long it took. A failure keeps its error here rather than vanishing with the toast.' },
      { x: 50, y: 30, title: 'The full exchange',
        body: 'Expand a row for exactly what was sent and what came back — the whole point of an audit being that it is inspectable after the fact.' },
    ],
  },
];

/** The chapters, in the order the tour walks them. */
export function tourChapters(): { chapter: string; stops: TourStop[] }[] {
  const out: { chapter: string; stops: TourStop[] }[] = [];
  for (const stop of TOUR_STOPS) {
    const last = out[out.length - 1];
    if (last && last.chapter === stop.chapter) last.stops.push(stop);
    else out.push({ chapter: stop.chapter, stops: [stop] });
  }
  return out;
}
