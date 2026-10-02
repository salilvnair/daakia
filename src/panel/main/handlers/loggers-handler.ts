/**
 * The Loggers tab's host side: reading a project, reading a pod, asking the
 * log, and writing the catalogue to a file.
 *
 * Its own file rather than more of `k8s-handler.ts`, because none of it is
 * about the stream or the pod list — each of these is one request, one
 * answer, and a webview component waiting for exactly that answer by its
 * `reqId`. Every message is routed from both `MainPanel.ts` and the local
 * server's `router.ts`; a message only one of them knows is a button that
 * works in VS Code and does nothing in the browser build.
 */
import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import { readProject } from '../../../services/k8s/logger-project';
import { podLoggerScript, parsePodLoggerOutput } from '../../../services/k8s/logger-pod';
import { run } from '../../../services/k8s/kubectl';
import { redact, describeRedactions } from '../../../services/k8s/redact';
import { dk8sPrompt, dk8sUserPrompt } from '../../chat/dk8s-prompt-resolve';
import { renderDk8sUserPrompt } from '../../chat/dk8s-prompts';
import { handleAiSend } from './ai-handler';

type PostMessage = (msg: unknown) => void;

/**
 * Read a project folder for its loggers — "A project folder" in Add loggers.
 *
 * With no folder, the folder dialog; the browser build has no dialog, so a
 * scan without a path is answered as cancelled rather than left to hang.
 * With `fingerprint`, the caller already has this project and only wants to
 * know whether it changed — the answer says `unchanged` and the webview
 * leaves the catalogue alone.
 */
export async function handleDk8sReadProject(msg: Record<string, unknown>, postMessage: PostMessage): Promise<void> {
  const reqId = msg.reqId;
  let folder = typeof msg.folder === 'string' ? msg.folder.trim() : '';
  if (!folder) {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      canSelectFolders: true,
      canSelectFiles: false,
      title: 'Read a project for its loggers',
      openLabel: 'Read this folder',
    });
    if (!picked?.length) {
      postMessage({ type: 'dk8s:projectRead', reqId, cancelled: true });
      return;
    }
    folder = picked[0].fsPath;
  }

  try {
    const read = await readProject(folder);
    const unchanged = typeof msg.fingerprint === 'string' && msg.fingerprint === read.fingerprint;
    postMessage({ type: 'dk8s:projectRead', reqId, unchanged, ...read });
  } catch (err) {
    postMessage({ type: 'dk8s:projectRead', reqId, folder, error: (err as Error).message });
  }
}

/**
 * Read the loggers a running pod declares — "From this pod" in Add loggers.
 *
 * One exec that reads and asks, and writes nothing; the script is in
 * `logger-pod.ts`, where it is under test. The command is sent back with the
 * answer so the person can see exactly what went into their container.
 */
export async function handleDk8sReadPodLoggers(msg: Record<string, unknown>, postMessage: PostMessage): Promise<void> {
  const reqId = msg.reqId;
  const context = String(msg.context ?? '');
  const namespace = String(msg.namespace ?? '');
  const pod = String(msg.pod ?? '');
  const container = typeof msg.container === 'string' && msg.container ? msg.container : undefined;
  if (!context || !namespace || !pod) {
    postMessage({ type: 'dk8s:podLoggers', reqId, error: 'No pod to read.' });
    return;
  }

  const args = [
    '--context', context, '-n', namespace, 'exec', pod,
    ...(container ? ['-c', container] : []),
    '--', 'sh', '-c', podLoggerScript(),
  ];
  const command = `kubectl --context ${context} -n ${namespace} exec ${pod}${container ? ` -c ${container}` : ''} -- sh -c '…read logback.xml and /actuator/loggers…'`;

  const res = await run(args, { timeoutMs: 45_000, maxBuffer: 16 * 1024 * 1024 });
  const read = parsePodLoggerOutput(res.stdout);
  /* A script that found nothing still exits 0; one that could not start at
     all — no shell, no exec permission, the container not running — says why
     on stderr, and that is the message worth showing. */
  if (!res.ok && !read.files.length && !read.actuator) {
    postMessage({
      type: 'dk8s:podLoggers', reqId, command,
      error: (res.stderr || res.failure || 'The pod could not be read.').trim().slice(0, 600),
    });
    return;
  }
  postMessage({ type: 'dk8s:podLoggers', reqId, command, ...read });
}

/** Every "Ask the log" answer streams on this id, apart from the side panel's. */
export const DK8S_ASK_LOG_TAB = 'dk8s-ask-log';

/**
 * Ask the log — a question over a window, with the catalogue beside it.
 *
 * The same guarantees as every other dk8s question (`handleDk8sAsk`): the
 * prompt text is the host's, the key is fixed rather than taken from the
 * message, and secrets come out before anything leaves — from the lines AND
 * from the catalogue, because a pattern learned from a line can carry a token
 * as easily as the line did.
 *
 * Its own stream id, because the answer is drawn in the Ask the log tab as a
 * timeline, not in the side panel as prose; on the shared id the side panel
 * would have opened and printed the JSON.
 */
export async function handleDk8sAskLog(msg: Record<string, unknown>, postMessage: PostMessage): Promise<void> {
  const key = 'dk8s.log.askTheLog';
  const system = dk8sPrompt(key);
  if (!system) {
    postMessage({ type: 'dk8s:askLogError', tabId: DK8S_ASK_LOG_TAB, error: `Unknown prompt: ${key}` });
    return;
  }

  const question = String(msg.question ?? '').trim();
  const lines = redact(String(msg.evidence ?? ''));
  const catalogue = redact(String(msg.catalogue ?? ''));
  if (!lines.text.trim()) {
    postMessage({ type: 'dk8s:askLogError', tabId: DK8S_ASK_LOG_TAB, error: 'There are no lines in this window to read.' });
    return;
  }

  const found: Record<string, number> = { ...lines.found };
  for (const [kind, n] of Object.entries(catalogue.found)) found[kind] = (found[kind] ?? 0) + n;
  postMessage({
    type: 'dk8s:askLogEvidence', tabId: DK8S_ASK_LOG_TAB,
    redacted: (lines.total + catalogue.total) || undefined,
    redactionNote: describeRedactions(found),
  });

  const ctx = (msg.podContext ?? {}) as Record<string, unknown>;
  const podContext = [
    ctx.pod && `pod: ${ctx.pod}`,
    ctx.namespace && `namespace: ${ctx.namespace}`,
    ctx.container && `container: ${ctx.container}`,
    ctx.runtime && `runtime: ${ctx.runtime}`,
  ].filter(Boolean).join('\n');

  const userPrompt = renderDk8sUserPrompt(dk8sUserPrompt(key) ?? '', {
    podContext,
    window: String(msg.window ?? ''),
    catalogue: catalogue.text,
    evidence: lines.text,
    question,
    label: 'THE LINES, NUMBERED',
    pod: ctx.pod as string | undefined,
    namespace: ctx.namespace as string | undefined,
    runtime: ctx.runtime as string | undefined,
  });

  await handleAiSend({
    tabId: DK8S_ASK_LOG_TAB,
    systemPrompts: [system],
    userPrompt,
    conversation: [],
    stage: key,
    provider: msg.provider,
    model: msg.model,
    /* An answer with a timeline and its citations is long, and a thinking
       model spent the default 2,048 tokens reasoning and answered nothing —
       "Nothing came back". Room to write it, and no thinking first. */
    settings: { maxTokens: 6000, thinking: 'off' },
  }, postMessage);
}

/**
 * Export catalogue — the catalogue as a JSON file somebody can hand over.
 *
 * The webview builds the content; this only asks where to put it. In the
 * browser build the shim approves the dialog with a default path and says so
 * on the console, the same as every other export there.
 */
export async function handleDk8sExportCatalogue(msg: Record<string, unknown>, postMessage: PostMessage): Promise<void> {
  const content = String(msg.content ?? '');
  const filename = String(msg.filename ?? 'loggers.json').replace(/[\\/:*?"<>|]/g, '-');
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(filename),
    filters: { JSON: ['json'] },
    title: 'Export the logger catalogue',
  });
  if (!uri) {
    postMessage({ type: 'dk8s:catalogueExported', cancelled: true });
    return;
  }
  try {
    await fs.writeFile(uri.fsPath, content, 'utf8');
    postMessage({ type: 'dk8s:catalogueExported', path: uri.fsPath });
  } catch (err) {
    postMessage({ type: 'dk8s:catalogueExported', error: (err as Error).message });
  }
}
