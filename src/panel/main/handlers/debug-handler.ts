/**
 * Debug Handler — routes script debugger messages between webview and DebugSession.
 *
 * Messages:
 *   Webview → Extension:
 *     scriptDebug:start   { tabId, breakpoints, script, phase, context }
 *     scriptDebug:continue
 *     scriptDebug:stepOver
 *     scriptDebug:stepInto
 *     scriptDebug:stepOut
 *     scriptDebug:stop
 *     scriptDebug:setBreakpoints { breakpoints }
 *
 *   Extension → Webview:
 *     scriptDebug:paused   { line, variables, logs, phase }
 *     scriptDebug:resumed
 *     scriptDebug:completed { result }
 *     scriptDebug:error    { message }
 *     scriptDebug:log      { entry }
 */
import { DebugSession, type DebugAction } from '../../../services/debugger';
import type { ScriptContext } from '../../../services/script-runtime';
import {
  getAllEnvironments, getCollectionData, getSetting,
} from '../../../storage/db';

type PostMessage = (msg: unknown) => void;

let activeSession: DebugSession | null = null;
let lastStartMsg: { type: string;[key: string]: unknown } | null = null;
let lastPostMessage: PostMessage | null = null;
let isRestarting = false;

/** Get the active debug session (from request-handler's global or standalone) */
function getSession(): DebugSession | null {
  return (globalThis as any).__daakiaDebugSession || activeSession;
}

export function handleDebugMessage(
  msg: { type: string;[key: string]: unknown },
  postMessage: PostMessage,
): boolean {
  switch (msg.type) {
    case 'scriptDebug:start':
      handleDebugStart(msg, postMessage);
      return true;
    case 'scriptDebug:continue':
      getSession()?.resume('continue');
      return true;
    case 'scriptDebug:stepOver':
      getSession()?.resume('stepOver');
      return true;
    case 'scriptDebug:stepInto':
      getSession()?.resume('stepInto');
      return true;
    case 'scriptDebug:stepOut':
      getSession()?.resume('stepOut');
      return true;
    case 'scriptDebug:stop':
      getSession()?.resume('stop');
      return true;
    case 'scriptDebug:setBreakpoints':
      getSession()?.setBreakpoints(msg.breakpoints as number[]);
      return true;
    case 'scriptDebug:restartFrame':
      handleRestartFrame(msg, postMessage);
      return true;
    default:
      return false;
  }
}

async function handleDebugStart(
  msg: { type: string;[key: string]: unknown },
  postMessage: PostMessage,
): Promise<void> {
  lastStartMsg = msg;
  lastPostMessage = postMessage;

  const script = msg.script as string;
  const phase = (msg.phase as 'pre-request' | 'post-response') || 'pre-request';
  const breakpoints = (msg.breakpoints as number[]) || [];
  const tabId = msg.tabId as string;

  // Build script context from the message or load from DB
  const scriptContext = buildScriptContext(msg);

  const session = new DebugSession({
    onPaused: (state) => {
      postMessage({ type: 'scriptDebug:paused', tabId, ...state });
    },
    onResumed: () => {
      postMessage({ type: 'scriptDebug:resumed', tabId });
    },
    onCompleted: (result) => {
      if (isRestarting) return;
      postMessage({ type: 'scriptDebug:completed', tabId, result });
      activeSession = null;
    },
    onError: (message) => {
      if (isRestarting) return;
      postMessage({ type: 'scriptDebug:error', tabId, message });
      activeSession = null;
    },
    onLog: (entry) => {
      postMessage({ type: 'scriptDebug:log', tabId, entry });
    },
    onSubRequest: (entry) => {
      postMessage({ type: 'scriptDebug:subRequest', tabId, entry, phase });
    },
  }, phase);

  session.setBreakpoints(breakpoints);
  activeSession = session;

  try {
    await session.run(script, scriptContext);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    postMessage({ type: 'scriptDebug:error', tabId, message });
    activeSession = null;
  }
}

function handleRestartFrame(
  msg: { type: string;[key: string]: unknown },
  postMessage: PostMessage,
): void {
  // Suppress completed/error from old session during restart
  isRestarting = true;

  // Stop the current session
  getSession()?.resume('stop');
  activeSession = null;
  (globalThis as any).__daakiaDebugSession = null;

  // Clear the flag and re-start with the same params
  isRestarting = false;
  if (lastStartMsg && lastPostMessage) {
    handleDebugStart(lastStartMsg, lastPostMessage);
  }
}

function buildScriptContext(msg: Record<string, unknown>): ScriptContext {
  // Use context provided by webview if available, otherwise load from DB
  if (msg.scriptContext) {
    return msg.scriptContext as ScriptContext;
  }

  const envId = msg.envId as string | undefined;
  const collectionId = msg.collectionId as string | undefined;

  // Load environment variables
  const envVars: Record<string, string> = {};
  const rows = getAllEnvironments();
  const globalRow = rows.find(r => r.name === 'Global' || r.id === 'global');
  if (globalRow) {
    const gVars = JSON.parse(globalRow.variables || '[]') as { key: string; currentValue?: string; initialValue?: string }[];
    for (const v of gVars) {
      if (v.key) envVars[v.key] = v.currentValue ?? v.initialValue ?? '';
    }
  }
  if (envId) {
    const envRow = rows.find(r => r.id === envId);
    if (envRow) {
      const eVars = JSON.parse(envRow.variables || '[]') as { key: string; currentValue?: string; initialValue?: string }[];
      for (const v of eVars) {
        if (v.key) envVars[v.key] = v.currentValue ?? v.initialValue ?? '';
      }
    }
  }

  // Load collection variables
  const colVars: Record<string, string> = {};
  if (collectionId) {
    const colData = getCollectionData(collectionId);
    if (colData) {
      const parsed = JSON.parse(colData || '{}');
      const vars = parsed.variables || [];
      for (const v of vars) {
        if (v.key) colVars[v.key] = v.currentValue ?? v.initialValue ?? '';
      }
    }
  }

  // Load global variables
  const globalVars: Record<string, string> = {};
  const globalSettings = getSetting<Record<string, string>>('globalVariables');
  if (globalSettings) {
    Object.assign(globalVars, globalSettings);
  }

  return {
    request: {
      method: (msg.method as string) || 'GET',
      url: (msg.url as string) || '',
      headers: (msg.requestHeaders as Record<string, string>) || {},
      body: (msg.requestBody as string) || '',
    },
    response: msg.response ? {
      status: (msg.response as any).status || 0,
      statusText: (msg.response as any).statusText || '',
      headers: (msg.response as any).headers || {},
      body: (msg.response as any).body || '',
      time: (msg.response as any).time || 0,
      size: (msg.response as any).size || 0,
    } : undefined,
    environmentVariables: envVars,
    collectionVariables: colVars,
    globalVariables: globalVars,
  };
}
