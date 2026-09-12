/**
 * Is this URL something a monitor can check?
 *
 * The panel used to accept anything non-empty, which is how a monitor whose URL
 * was the word `http` got saved, enabled, and shown with a status dot that
 * would never turn green.
 *
 * This is the kind half of the pair: it explains what is wrong while somebody
 * types. The host validates again before it schedules anything, because a
 * webview is not a security boundary — see `monitor-handler.ts`.
 */

export interface UrlCheck {
  /** Null when the URL is usable. */
  error: string | null;
  /** A note that is worth showing but does not block saving. */
  warning?: string;
}

export function checkMonitorUrl(raw: string): UrlCheck {
  const value = raw.trim();

  if (!value) return { error: 'A URL is required.' };

  /* Caught before `new URL` so the message can name the actual mistake. A bare
     host is the most common thing people type, and "Invalid URL" does not tell
     them the fix is four characters at the front. */
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
    return { error: 'Start with http:// or https:// — a monitor needs an absolute address.' };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: 'That is not a URL Daakia can parse.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: `${url.protocol.replace(':', '')} cannot be monitored — use http or https.` };
  }

  if (!url.hostname) {
    return { error: 'That URL has no host.' };
  }

  /* A scheme and a host and nothing else is a valid URL and almost never what
     somebody meant to monitor, so it is said out loud without blocking. */
  if (url.protocol === 'http:' && url.hostname !== 'localhost' && !/^127\./.test(url.hostname)) {
    return {
      error: null,
      warning: 'This is plain http — the check and anything in the URL travel unencrypted.',
    };
  }

  return { error: null };
}
