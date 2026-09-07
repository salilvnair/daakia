/**
 * Every screen the wiki shows, with a short id you can type.
 *
 * ── Why ids ──
 *
 * `npm run screencapture rst03` is a thing you can ask for. "the REST body
 * one" is not, and `wiki-capture-rest.test.ts:capture rest-body-json` is a
 * thing you have to go and look up. The ids are five characters — a three
 * letter section and a number — and the label beside each says what it is.
 *
 * This file is the single source: the script reads it to decide what to run,
 * and `plan/daakia_wiki/screen-ids.md` is generated from it, so the document
 * cannot drift from what the tool actually accepts.
 *
 * ── Adding a screen ──
 *
 * Add it to the capture suite, then add a line here with the next free number
 * in that section. Then `npm run screencapture -- --write-doc`.
 */

/** section key → { prefix, suite, dir } */
export const SECTIONS = {
  rest:          { prefix: 'rst', suite: 'REST',        dir: 'rest' },
  graphql:       { prefix: 'gql', suite: 'GraphQL',     dir: 'graphql' },
  grpc:          { prefix: 'grp', suite: 'gRPC',        dir: 'grpc' },
  soap:          { prefix: 'sop', suite: 'SOAP',        dir: 'soap' },
  realtime:      { prefix: 'rt',  suite: 'Realtime',    dir: 'websocket' },
  'mock-server': { prefix: 'mok', suite: 'Mock Server', dir: 'mock-server' },
  platform:      { prefix: 'plt', suite: 'Platform',    dir: 'platform' },
  dk8s:          { prefix: 'dk8', suite: 'dk8s',        dir: 'dk8s' },
};

/**
 * [shortId, captureId, label]
 *
 * `captureId` is the id the suite writes and the wiki reads — the filename
 * without `.html`. It stays as it is; the short id is only for asking.
 */
export const SCREENS = [
  // ── REST ──────────────────────────────────────────────────────────────────
  ['rst01', 'rest-params',              'REST — Params'],
  ['rst02', 'rest-headers',             'REST — Headers'],
  ['rst03', 'rest-body-json',           'REST — Body (JSON)'],
  ['rst04', 'rest-auth',                'REST — Auth'],
  ['rst05', 'rest-scripts',             'REST — Scripts'],
  ['rst06', 'rest-variables',           'REST — Variables'],
  ['rst07', 'rest-response',            'REST — Response'],

  // ── GraphQL ───────────────────────────────────────────────────────────────
  ['gql01', 'graphql-query',            'GraphQL — Query'],
  ['gql02', 'graphql-variables',        'GraphQL — Variables'],
  ['gql03', 'graphql-headers',          'GraphQL — Headers'],
  ['gql04', 'graphql-authorization',    'GraphQL — Authorization'],
  ['gql05', 'graphql-scripts',          'GraphQL — Scripts'],
  ['gql06', 'graphql-subscription',     'GraphQL — Subscription'],
  ['gql07', 'graphql-response',         'GraphQL — Response'],

  // ── gRPC ──────────────────────────────────────────────────────────────────
  ['grp01', 'grpc-message',             'gRPC — Message'],
  ['grp02', 'grpc-metadata',            'gRPC — Metadata'],
  ['grp03', 'grpc-proto',               'gRPC — Proto'],
  ['grp04', 'grpc-auth',                'gRPC — Auth'],
  ['grp05', 'grpc-scripts',             'gRPC — Scripts'],
  ['grp06', 'grpc-response-body',       'gRPC — Response body'],
  ['grp07', 'grpc-response-metadata',   'gRPC — Response metadata'],
  ['grp08', 'grpc-response-tests',      'gRPC — Response tests'],
  ['grp09', 'grpc-response-timeline',   'gRPC — Response timeline'],

  // ── SOAP ──────────────────────────────────────────────────────────────────
  ['sop01', 'soap-envelope',            'SOAP — Envelope'],
  ['sop02', 'soap-form',                'SOAP — Form'],
  ['sop03', 'soap-headers',             'SOAP — Headers'],
  ['sop04', 'soap-wssecurity',          'SOAP — WS-Security'],
  ['sop05', 'soap-authorization',       'SOAP — Authorization'],
  ['sop06', 'soap-attachments',         'SOAP — Attachments'],
  ['sop07', 'soap-assertions',          'SOAP — Assertions'],
  ['sop08', 'soap-scripts',             'SOAP — Scripts'],
  ['sop09', 'soap-wsdl',                'SOAP — WSDL'],
  ['sop10', 'soap-response-body',       'SOAP — Response body'],
  ['sop11', 'soap-response-headers',    'SOAP — Response headers'],
  ['sop12', 'soap-response-tests',      'SOAP — Response tests'],

  // ── Realtime (WebSocket · SSE · Socket.IO · MQTT) ──────────────────────────
  ['rt01',  'ws-communication',         'WebSocket — Communication'],
  ['rt02',  'ws-log',                   'WebSocket — Log'],
  ['rt03',  'ws-protocols',             'WebSocket — Protocols'],
  ['rt04',  'ws-templates',             'WebSocket — Templates'],
  ['rt05',  'realtime-sse',             'SSE — Events'],
  ['rt06',  'sio-communication',        'Socket.IO — Communication'],
  ['rt07',  'sio-log',                  'Socket.IO — Log'],
  ['rt08',  'sio-authorization',        'Socket.IO — Authorization'],
  ['rt09',  'realtime-mqtt',            'MQTT — Topics'],

  // ── Mock Server ───────────────────────────────────────────────────────────
  ['mok01', 'mockserver-rest-routes',   'Mock — REST routes'],
  ['mok02', 'mockserver-rest-catalog',  'Mock — REST catalog'],
  ['mok03', 'mockserver-grpc-routes',   'Mock — gRPC routes'],
  ['mok04', 'mockserver-export',        'Mock — Export'],
  ['mok05', 'mockserver-route-response', 'Mock — Route response'],
  ['mok06', 'mockserver-route-matching', 'Mock — Route matching'],
  ['mok07', 'mockserver-route-advanced', 'Mock — Route advanced'],
  ['mok08', 'mockserver-route-sequence', 'Mock — Route sequence'],
  ['mok09', 'mockserver-statemachine',  'Mock — State machine'],
  ['mok10', 'mockserver-flow',          'Mock — Flow'],
  ['mok11', 'mockserver-chaos',         'Mock — Chaos'],
  ['mok12', 'mockserver-graphql-schema', 'Mock — GraphQL schema'],
  ['mok13', 'mockserver-soap-services', 'Mock — SOAP services'],
  ['mok14', 'mockserver-ws-handlers',   'Mock — WebSocket handlers'],
  ['mok15', 'mockserver-sio-messages',  'Mock — Socket.IO messages'],
  ['mok16', 'mockserver-sse-events',    'Mock — SSE events'],
  ['mok17', 'mockserver-mqtt-topics',   'Mock — MQTT topics'],
  ['mok18', 'mockserver-import',        'Mock — Import'],
  ['mok19', 'mockserver-wsdl',          'Mock — WSDL'],
  ['mok20', 'mockserver-traffic',       'Mock — Traffic'],

  // ── Platform (sidebar · devtools · settings · wiki) ────────────────────────
  ['plt01', 'platform-sidebar-collections', 'Sidebar — Collections'],
  ['plt02', 'platform-sidebar-history',     'Sidebar — History'],
  ['plt03', 'platform-sidebar-environments', 'Sidebar — Environments'],
  ['plt04', 'platform-devtools-console',    'DevTools — Console'],
  ['plt05', 'platform-devtools-network',    'DevTools — Network'],
  ['plt06', 'platform-command-palette',     'Command Palette'],
  ['set01', 'settings-general',             'Settings — General'],
  ['set02', 'settings-theme',               'Settings — Theme'],
  ['set03', 'settings-mock-server',         'Settings — Mock Server'],
  ['set04', 'settings-llm-provider',        'Settings — LLM Provider'],
  ['set05', 'settings-ai-features',         'Settings — AI Features'],
  ['set06', 'settings-prompt-library',      'Settings — Prompt Library'],
  ['set07', 'settings-ai-audit',            'Settings — AI Audit'],
  ['set08', 'settings-developer-tools',     'Settings — Developer Tools'],
  ['set09', 'settings-power-features',      'Settings — Power Features'],
  ['wik01', 'wiki-quick-start',             'Wiki — Quick Start'],
  ['wik02', 'wiki-collections-env',         'Wiki — Collections & Env'],

  // ── dk8s ──────────────────────────────────────────────────────────────────
  ['dk801', 'dk8s-pods',                'dk8s — Pod grid'],
  ['dk802', 'dk8s-pods-table',          'dk8s — Pod table'],
  ['dk803', 'dk8s-logs',                'dk8s — Logs'],
  ['dk804', 'dk8s-logs-filtered',       'dk8s — Logs, filtered'],
  ['dk805', 'dk8s-overview',            'dk8s — Pod overview'],
  ['dk806', 'dk8s-terminal',            'dk8s — Terminal'],
  ['dk807', 'dk8s-explorer',            'dk8s — File explorer'],
  ['dk808', 'dk8s-doctor',              'dk8s — Doctor'],
  ['dk809', 'dk8s-artifacts',           'dk8s — Artifacts'],
];

/**
 * Which section a short id belongs to — `plt`/`set`/`wik` all live in one.
 *
 * Matched by known prefix, longest first, rather than by stripping trailing
 * digits: `dk8` ends in one, so stripping left `dk` and dk8s resolved to
 * nothing at all.
 */
const PREFIXES = [
  ...Object.entries(SECTIONS).map(([section, s]) => [s.prefix, section]),
  ['set', 'platform'],
  ['wik', 'platform'],
].sort((a, b) => b[0].length - a[0].length);

export function sectionOf(shortId) {
  const id = String(shortId).toLowerCase();
  const hit = PREFIXES.find(([prefix]) => id.startsWith(prefix));
  return hit ? hit[1] : null;
}

/** Resolve anything a caller might type: a short id, a capture id, a section. */
export function resolve(token) {
  const t = String(token).toLowerCase();

  const byShort = SCREENS.find(s => s[0] === t);
  if (byShort) return [{ short: byShort[0], capture: byShort[1], label: byShort[2], section: sectionOf(byShort[0]) }];

  const byCapture = SCREENS.find(s => s[1] === t);
  if (byCapture) return [{ short: byCapture[0], capture: byCapture[1], label: byCapture[2], section: sectionOf(byCapture[0]) }];

  if (SECTIONS[t]) {
    return SCREENS
      .filter(s => sectionOf(s[0]) === t)
      .map(s => ({ short: s[0], capture: s[1], label: s[2], section: t }));
  }
  return [];
}
