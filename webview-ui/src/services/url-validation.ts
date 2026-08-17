/**
 * Minimum URL sanity check used to gate every protocol's Send/Connect/Invoke button.
 *
 * Deliberately permissive, not a spec-grade validator: the goal is to stop obvious
 * gibberish ("h", "sss") from enabling the action, not to reject unusual-but-working
 * hosts. Anything that could plausibly resolve at request time is accepted.
 */

/** `{{var}}` and `${var}` — resolved from the environment at send time, so a URL that
 *  starts with one has an unknowable scheme and must be accepted as-is. */
const VAR_TOKEN = /\{\{[^{}]*\}\}|\$\{[^{}]*\}/g;

export type UrlProtocolKind =
  | 'rest' | 'graphql' | 'soap'          // plain HTTP(S)
  | 'sse'                                 // HTTP(S) stream
  | 'websocket' | 'socketio'              // ws(s), and http(s) for the SIO handshake
  | 'mqtt'                                // mqtt(s)/ws(s)/tcp
  | 'grpc';                               // host:port, optionally grpc(s)://

const SCHEMES: Record<UrlProtocolKind, string[]> = {
  rest:      ['http', 'https'],
  graphql:   ['http', 'https'],
  soap:      ['http', 'https'],
  sse:       ['http', 'https'],
  websocket: ['ws', 'wss', 'http', 'https'],
  socketio:  ['ws', 'wss', 'http', 'https'],
  mqtt:      ['mqtt', 'mqtts', 'ws', 'wss', 'tcp', 'ssl'],
  grpc:      ['grpc', 'grpcs', 'http', 'https', 'dns'],
};

const LABEL: Record<UrlProtocolKind, string> = {
  rest: 'http:// or https://',
  graphql: 'http:// or https://',
  soap: 'http:// or https://',
  sse: 'http:// or https://',
  websocket: 'ws://, wss://, http:// or https://',
  socketio: 'ws://, wss://, http:// or https://',
  mqtt: 'mqtt://, mqtts://, ws://, wss:// or tcp://',
  grpc: 'host:port (or grpc://host:port)',
};

/** True when the string leads with an env variable — the scheme lives inside it, so we
 *  cannot judge the URL until it is resolved. */
function startsWithVariable(url: string): boolean {
  return /^\s*(\{\{[^{}]*\}\}|\$\{[^{}]*\})/.test(url);
}

export function isValidProtocolUrl(raw: string, kind: UrlProtocolKind): boolean {
  const url = (raw ?? '').trim();
  if (!url) return false;
  if (startsWithVariable(url)) return true;

  // Neutralise any remaining variables so they can't break parsing.
  const probe = url.replace(VAR_TOKEN, 'x');

  const schemeMatch = probe.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (!SCHEMES[kind].includes(scheme)) return false;
    const rest = probe.slice(schemeMatch[0].length);
    const host = rest.split(/[/?#]/)[0];
    // Needs a host, and it must not still be just a port or empty.
    return host.length > 0 && !host.startsWith(':');
  }

  // gRPC targets are conventionally bare `host:port` with no scheme at all.
  if (kind === 'grpc') return /^[^\s/:]+:\d+$/.test(probe) || /^[^\s/:]+\.[^\s/:]+$/.test(probe);

  // Everything else needs an explicit scheme — this is what rejects "h" / "sss".
  return false;
}

/** Tooltip text for a disabled action button, or null when the URL is fine. */
export function urlValidationHint(raw: string, kind: UrlProtocolKind): string | null {
  const url = (raw ?? '').trim();
  if (!url) return 'Enter a URL first';
  if (isValidProtocolUrl(url, kind)) return null;
  return `Not a valid URL — expected ${LABEL[kind]}`;
}
