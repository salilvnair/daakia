/**
 * Scheduled API checks.
 *
 * ── Why this file exists ──
 *
 * The API Monitor panel has always posted `monitor:register` and listened for
 * `monitor:result`. Nothing answered. The rules were saved, the toggles worked,
 * the status dots stayed amber forever, and no check ever ran — which is also
 * why nothing about a check ever reached the audit log. The UI was a shell.
 *
 * ── What a monitor is ──
 *
 * A method, a URL and an interval. Every tick it runs one `probe` — the same
 * measured request the load tester and the bulk URL tester use, which never
 * throws — and posts the outcome back. A run that fails, or that comes back
 * slower than the rule's threshold, raises a VS Code notification.
 *
 * ── Two rules that shape the code ──
 *
 * **Timers are owned here and die with the panel.** A `setInterval` that
 * outlives the webview keeps hitting somebody's staging API forever with
 * nowhere to report to. Every timer is in one map, and `disposeMonitors` is
 * called from `MainPanel.dispose` alongside the transports.
 *
 * **A URL is validated before it is scheduled, not after.** The panel validates
 * too, but the panel is not the security boundary: this handler takes a string
 * from a webview and turns it into an outbound request on a repeating timer,
 * so it checks the scheme itself rather than trusting that somebody upstream
 * did.
 */
import * as vscode from 'vscode';
import { URL } from 'url';
import { probe } from './http-probe';

/**
 * Is this something we are willing to put on a repeating timer?
 *
 * The panel validates too, and more helpfully — it explains what is wrong while
 * you type. This one is not that. It is the check that runs on the side of the
 * boundary that actually makes the request, on a string that arrived from a
 * webview, and it exists so that "the UI wouldn't let you" is never the only
 * thing standing between a typo and an outbound loop. The two are allowed to
 * differ: the panel's job is to be kind, this one's is to be sure.
 */
function isMonitorableUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface MonitorRule {
  id: string;
  name: string;
  method: string;
  url: string;
  /** Canonical since intervals gained sub-minute resolution. */
  intervalSeconds: number;
  alertOnSlowMs: number;
  enabled: boolean;
}

type Post = (msg: unknown) => void;

/** Every live timer, so none of them can outlive the panel. */
const timers = new Map<string, NodeJS.Timeout>();

/**
 * The shortest interval we will schedule.
 *
 * Ten seconds is not a technical limit — it is a courtesy one. A monitor is
 * pointed at somebody's real service, and a one-second poll left running over a
 * weekend is 600,000 requests nobody asked for.
 */
const MIN_INTERVAL_SECONDS = 10;

/** A run that is still in flight when the next tick arrives is not run twice. */
const inFlight = new Set<string>();

async function runOnce(rule: MonitorRule, post: Post): Promise<void> {
  if (inFlight.has(rule.id)) return;
  inFlight.add(rule.id);
  try {
    const result = await probe({
      method: rule.method || 'GET',
      url: rule.url,
      headers: {},
      timeoutMs: Math.max(rule.alertOnSlowMs * 2, 10_000),
      followRedirects: true,
    });

    const failed = result.status === 0 || result.status >= 400;
    const slow = !failed && result.ms > rule.alertOnSlowMs;

    post({
      type: 'monitor:result',
      ruleId: rule.id,
      status: result.status,
      statusText: result.statusText,
      responseTime: result.ms,
      error: result.error,
      at: Date.now(),
    });

    /*
      The notification says what happened and to which monitor, by name. It
      deliberately does not include the URL: a monitored endpoint can carry a
      key in its query string, and a toast is the one place a passing colleague
      reads over your shoulder.
    */
    if (failed) {
      vscode.window.showWarningMessage(
        `API Monitor — "${rule.name}" failed: ${result.error || `HTTP ${result.status} ${result.statusText}`}`
      );
    } else if (slow) {
      vscode.window.showWarningMessage(
        `API Monitor — "${rule.name}" answered in ${result.ms}ms, over its ${rule.alertOnSlowMs}ms threshold`
      );
    }
  } finally {
    inFlight.delete(rule.id);
  }
}

/**
 * Start or restart a rule.
 *
 * Restart rather than start: editing a monitor re-registers it, and a second
 * timer for the same id would double the traffic silently.
 */
export function registerMonitor(rule: MonitorRule, post: Post): void {
  removeMonitor(rule.id);
  if (!rule.enabled) return;

  if (!isMonitorableUrl(rule.url)) {
    post({
      type: 'monitor:invalid',
      ruleId: rule.id,
      reason: 'That URL is not something we can check — it needs an absolute http:// or https:// address.',
    });
    return;
  }

  const seconds = Math.max(MIN_INTERVAL_SECONDS, Math.floor(rule.intervalSeconds) || 300);

  /* Run immediately, then on the interval. Waiting five minutes to find out
     whether a monitor you just typed even works is a poor first impression. */
  void runOnce(rule, post);
  timers.set(rule.id, setInterval(() => void runOnce(rule, post), seconds * 1000));
}

export function pauseMonitor(ruleId: string): void {
  removeMonitor(ruleId);
}

export function removeMonitor(ruleId: string): void {
  const t = timers.get(ruleId);
  if (t) {
    clearInterval(t);
    timers.delete(ruleId);
  }
}

/** Run a rule now, outside its schedule — the panel's "Check now". */
export function checkMonitorNow(rule: MonitorRule, post: Post): void {
  if (!isMonitorableUrl(rule.url)) {
    post({
      type: 'monitor:invalid',
      ruleId: rule.id,
      reason: 'That URL is not something we can check — it needs an absolute http:// or https:// address.',
    });
    return;
  }
  void runOnce(rule, post);
}

/** Called from MainPanel.dispose, beside the transports. */
export function disposeMonitors(): void {
  for (const t of timers.values()) clearInterval(t);
  timers.clear();
  inFlight.clear();
}
