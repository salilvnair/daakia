/**
 * Whether to verify TLS certificates, decided in one place.
 *
 * REST read `sslVerification` and `trustedHosts` from settings; SOAP and
 * GraphQL did not, so turning verification off worked for one protocol and
 * silently did nothing for the other two. That is the same failure the proxy
 * setting had: the switch moves, the request does not change, and nothing says
 * so — made worse now that the audit log prints the setting next to a request
 * that ignored it.
 *
 * Keeping the rule here means a protocol either uses it or visibly does not.
 *
 * Settings are passed in rather than read here: this module is imported by the
 * executors, which are deliberately free of the VS Code API so they can be
 * tested standalone.
 */

export interface TlsPolicy {
  /** What to pass to https/tls as `rejectUnauthorized`. */
  rejectUnauthorized: boolean;
  /** Why, for the network log and the audit trail. */
  reason: string;
}

/**
 * Verification is skipped when it is switched off globally, or when this host
 * is on the trusted list — the same two conditions REST has always used.
 */
export function resolveTlsPolicy(hostname: string, settings: Record<string, unknown> | undefined): TlsPolicy {
  const s = settings ?? {};
  const trusted = (s.trustedHosts as string[] | undefined) ?? [];
  if (trusted.includes(hostname)) {
    return { rejectUnauthorized: false, reason: `certificate not verified — ${hostname} is a trusted host` };
  }
  if (s.sslVerification === false) {
    return { rejectUnauthorized: false, reason: 'certificate not verified — SSL verification is off in settings' };
  }
  return { rejectUnauthorized: true, reason: 'certificate verified' };
}

/**
 * `servername` for a TLS connection, or undefined when the host is an IP.
 *
 * RFC 6066 does not permit an IP literal as an SNI name; Node warns today and
 * will drop it later, so it is left off rather than sent and ignored.
 */
export function sniFor(hostname: string): string | undefined {
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  const isIpv6 = hostname.includes(':');
  return isIpv4 || isIpv6 ? undefined : hostname;
}
