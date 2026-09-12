/**
 * The one place a protocol asks "what settings does this request run with?"
 *
 * Every HTTP protocol used to read `getSetting('general')` for itself, in as
 * many places as it needed a value — GraphQL read the timeout in two spots and
 * the proxy in two more. That is how they drifted apart before: SOAP verified
 * certificates unconditionally while REST honoured `sslVerification`, and
 * GraphQL ignored the proxy entirely. Adding two more levels to inherit from
 * would have multiplied that drift rather than fixed it.
 *
 * So resolution lives here, takes the outgoing message, and returns what the
 * request runs with. A protocol that calls this cannot fall behind the others.
 */

import * as vscode from 'vscode';
import { getSetting } from '../storage/db';
import {
  resolveExecutionSettings, type ExecutionSettings, type ResolvedSettings,
} from './execution-settings';
import { collectionSettings } from './collection-settings';

/**
 * The global level.
 *
 * Falls back to VS Code workspace config, which is how these were configured
 * before there was a settings page — a user who set `daakia.requestTimeout` in
 * their workspace still gets it.
 */
export function globalSettings(): ExecutionSettings {
  const stored = getSetting<Record<string, unknown>>('general') ?? {};
  const vsConfig = vscode.workspace.getConfiguration('daakia');
  return {
    timeout: (stored.timeout as number | undefined) ?? vsConfig.get<number>('requestTimeout', 0),
    followRedirects: (stored.followRedirects as boolean | undefined)
      ?? vsConfig.get<boolean>('followRedirects', true),
    sslVerification: (stored.sslVerification as boolean | undefined)
      ?? vsConfig.get<boolean>('sslVerification', true),
    saveResponseInHistory: stored.saveResponseInHistory as boolean | undefined,
    encoding: stored.encoding as ExecutionSettings['encoding'],
    proxy: stored.proxy as ExecutionSettings['proxy'],
  };
}

/**
 * Resolve all three levels for one outgoing request.
 *
 * `msg` is the message from the webview: `collectionId` names the middle level
 * and `settings` is what the request itself pins.
 */
export function settingsForRequest(msg: Record<string, unknown>): ResolvedSettings {
  return resolveExecutionSettings(
    globalSettings(),
    collectionSettings(msg.collectionId as string | undefined),
    msg.settings as ExecutionSettings | undefined,
  );
}
