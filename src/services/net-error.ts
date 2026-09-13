/**
 * What to say when a connection never happened.
 *
 * Node reports a refused connection to a host with both an A and an AAAA
 * record — `localhost` on every modern machine — as an `AggregateError` whose
 * own `message` is the empty string. The code is on the error, and the real
 * causes are in `.errors`, but anything that reads `err.message` gets `''`.
 *
 * That empty string travelled: the AI executor put it on the error event, the
 * audit row stored it, and the screen that asked the question fell back to its
 * own copy — "The model did not answer." Nothing had been asked. The socket was
 * refused before a byte was written, and every layer above reported a model
 * that had said nothing rather than a port with nothing behind it.
 *
 * So a message is built here from what the error actually carries, and an empty
 * one is never passed on.
 */

/**
 * The error shapes Node hands us, without pulling in a type per layer.
 *
 * `cause` is `unknown` on the built-in `Error`, so it is read as such here and
 * narrowed where it is used — typing it as another `NetErrorLike` makes every
 * real `ErrnoException` fail to assign, which is every caller.
 */
interface NetErrorLike {
  name?: string;
  message?: string;
  code?: string;
  errors?: unknown;
  cause?: unknown;
}

/** One level of the above, once it has been looked at. */
interface Inner { name?: string; message?: string; code?: string; errors?: unknown }

const innersOf = (v: unknown): Inner[] =>
  (Array.isArray(v) ? v.filter((e): e is Inner => !!e && typeof e === 'object') : []);

const asInner = (v: unknown): Inner | undefined =>
  (v && typeof v === 'object' ? v as Inner : undefined);

/**
 * The code, wherever it is hiding.
 *
 * On the error itself, on its `cause`, or on the first of an AggregateError's
 * `errors` — an IPv6 refusal and an IPv4 refusal of the same host arrive as two
 * errors under one empty-messaged parent.
 */
export function connectionErrorCode(err: NetErrorLike | undefined): string {
  if (!err) return '';
  const cause = asInner(err.cause);
  return err.code
    || cause?.code
    || innersOf(err.errors).find(e => e.code)?.code
    || innersOf(cause?.errors).find(e => e.code)?.code
    || '';
}

/** `http://host:port`, for saying where rather than quoting a whole URL. */
function originOf(url: string): string {
  try {
    const u = new URL(url);
    return u.origin;
  } catch {
    return url;
  }
}

/**
 * One sentence about why the request did not happen, and one about what to do.
 *
 * Deliberately says where: "connection refused" without the address is the
 * failure people paste into a search engine. With it, the two commonest causes
 * — the server is not running, and the port is not the one configured — are
 * both visible in the message itself.
 */
export function describeConnectionError(err: NetErrorLike | undefined, url: string): string {
  const code = connectionErrorCode(err);
  const where = originOf(url);

  switch (code) {
    case 'ECONNREFUSED':
      return `Nothing is listening at ${where} — the connection was refused before the request was sent. `
        + 'Check that the server is running and that the port in the base URL is the one it is on.';
    case 'ENOTFOUND':
      return `The host in ${where} does not resolve. Check the base URL for a typo, and your network or VPN.`;
    case 'ETIMEDOUT':
    case 'ESOCKETTIMEDOUT':
      return `${where} accepted nothing within the timeout. It may be unreachable from here, or behind a proxy that dropped the connection.`;
    case 'ECONNRESET':
      return `${where} closed the connection mid-request. A proxy, a firewall or a restart of the server will do this.`;
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return `${where} cannot be reached from this machine. Check the network route, the VPN and any firewall between them.`;
    case 'EPIPE':
      return `The connection to ${where} broke before the request finished being written.`;
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'CERT_HAS_EXPIRED':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return `The TLS certificate at ${where} was not trusted (${code}). `
        + 'Common for an internal or self-signed endpoint.';
    default:
      break;
  }

  /*
    Anything else: the error's own words, and if it has none — the
    AggregateError case this file exists for — whatever can be said about it
    instead. Never the empty string.
  */
  const own = (err?.message ?? '').trim();
  if (own) return own;

  const nested = innersOf(err?.errors);
  const inner = (nested.length ? nested : innersOf(asInner(err?.cause)?.errors))
    .map(e => (e.message ?? '').trim())
    .filter(Boolean);
  if (inner.length) return `${inner[0]} (${where})`;

  const named = [err?.name, code].filter(Boolean).join(' ');
  return named
    ? `${named} — the request to ${where} failed before any response arrived.`
    : `The request to ${where} failed before any response arrived.`;
}
