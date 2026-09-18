/**
 * Running a request's scripts, for the protocols that were not running them.
 *
 * ── What was wrong ──
 *
 * SOAP and gRPC never ran scripts at all. Not a subtle ordering problem like
 * the one REST had: `soap-handler` and `grpc-handler` contained no call to
 * `runScript` anywhere. They read `msg.preRequestScript`, wrote it into the
 * history row, and sent the request.
 *
 * The UI offers a Scripts tab for both, and marks it with a dot when it has
 * content. So a reader could write a pre-request script, watch the tab say it
 * was there, save it, run the request, and have nothing happen — with no error
 * and nothing in the console, because nothing had failed. It had simply never
 * been asked to run.
 *
 * ── Why this is shared rather than copied twice more ──
 *
 * REST and GraphQL already carry their own copies of this orchestration, and
 * they have already drifted: REST persists variable changes and supports
 * breakpoints, GraphQL persists but does not debug. Adding a third and fourth
 * copy for SOAP and gRPC would guarantee four behaviours for one feature.
 *
 * So there is one pipeline and four callers. It carries everything the richest
 * of the old copies did, breakpoints included — a debugger that works in REST
 * and silently does nothing in SOAP is the same class of bug as a Scripts tab
 * that silently does nothing, which is what this set out to fix.
 */
import {
  runScript, type ScriptContext, type ScriptResult, type TestResult,
} from '../../../services/script-runtime';
import { DebugSession } from '../../../services/debugger';
import { resolveVars, resolveRows, type VarLayers } from '../../../services/resolve-vars';

export interface ScriptOutcome {
  /** False when the script threw — the caller must not send the request. */
  ok: boolean;
  /**
   * True when the reader stopped a debug session themselves.
   *
   * Not a failure: nothing went wrong and there is nothing to report. The
   * caller aborts quietly rather than drawing an error over a request the
   * reader chose not to send.
   */
  stopped: boolean;
  logs: string[];
  errors: string[];
  consoleLogs: { level: string; args: unknown[]; timestamp: number; scriptPhase?: string }[];
  subRequests: { phase: string; [k: string]: unknown }[];
  /** What a post-response script's `dk.test` calls reported. */
  testResults: TestResult[];
  /** The variable sets as the script left them. */
  layers: VarLayers;
}

/** Where a phase's breakpoints and their conditions come from. */
export interface PhaseDebug {
  lines?: number[];
  conditions?: Record<number, string>;
  /** Everything a debug session reports goes back through here. */
  postMessage: (msg: unknown) => void;
  tabId: string;
}

/** The breakpoint payload every protocol's webview sends under one name. */
interface DebugBreakpoints {
  preRequest?: number[];
  postResponse?: number[];
  preRequestConditions?: Record<number, string>;
  postResponseConditions?: Record<number, string>;
}

/**
 * The debug setup for one phase, or nothing when no breakpoint is set there.
 *
 * Every protocol's webview already sends `debugBreakpoints` in the same shape;
 * only REST ever read it. Reading it here is what makes the debugger work in
 * the other three rather than silently doing nothing.
 */
export function debugFor(
  msg: Record<string, unknown>,
  phase: 'pre-request' | 'post-response',
  postMessage: (msg: unknown) => void,
  tabId: string,
): PhaseDebug | undefined {
  const bps = msg.debugBreakpoints as DebugBreakpoints | undefined;
  const pre = phase === 'pre-request';
  const lines = pre ? bps?.preRequest : bps?.postResponse;
  if (!lines?.length) return undefined;
  return {
    lines,
    conditions: pre ? bps?.preRequestConditions : bps?.postResponseConditions,
    postMessage,
    tabId,
  };
}

/** Nothing ran, and nothing is wrong — the shape a caller with no script gets. */
export function noScript(ctx: ScriptContext): ScriptOutcome {
  return {
    ok: true,
    stopped: false,
    logs: [],
    errors: [],
    consoleLogs: [],
    subRequests: [],
    testResults: [],
    layers: layersOf(ctx),
  };
}

/**
 * Run one script under a debugger, resolving when it finishes or is stopped.
 *
 * The session is parked on `globalThis` because the step/continue/stop
 * messages arrive as separate webview messages, handled elsewhere, and they
 * have no other way to reach the session that is currently paused. One at a
 * time is the honest constraint: a reader can only be looking at one paused
 * script.
 */
function runDebugged(
  script: string, ctx: ScriptContext, phase: 'pre-request' | 'post-response', dbg: PhaseDebug,
): Promise<ScriptResult> {
  const { postMessage, tabId } = dbg;
  postMessage({ type: 'scriptDebug:started', tabId, phase });

  return new Promise<ScriptResult>((resolve) => {
    const session = new DebugSession({
      onPaused: (state) => postMessage({ type: 'scriptDebug:paused', tabId, ...state }),
      onResumed: () => postMessage({ type: 'scriptDebug:resumed', tabId }),
      onCompleted: (r) => resolve(r),
      onError: (message) => {
        postMessage({ type: 'scriptDebug:error', tabId, message });
        resolve({
          success: false, logs: [], errors: [message], structuredLogs: [],
          updatedEnvironmentVars: ctx.environmentVariables,
          updatedCollectionVars: ctx.collectionVariables,
          updatedGlobalVars: ctx.globalVariables,
          updatedSecretVars: ctx.secretVariables ?? {},
          testResults: [], subRequests: [], duration: 0,
        });
      },
      onLog: (entry) => postMessage({ type: 'scriptDebug:log', tabId, entry }),
      onSubRequest: (entry) => postMessage({ type: 'scriptDebug:subRequest', tabId, entry, phase }),
    }, phase);

    if (dbg.lines) session.setBreakpoints(dbg.lines);
    if (dbg.conditions) session.setConditions(dbg.conditions);

    globalThis.__daakiaDebugSession = session;
    void session.run(script, ctx).then(resolve);
  }).finally(() => {
    globalThis.__daakiaDebugSession = null;
    postMessage({ type: 'scriptDebug:completed', tabId });
  });
}

/**
 * The session a step/continue/stop message will be talking about.
 *
 * Declared rather than cast at each use so `debug-handler` and this file agree
 * on what is parked there; it used to be `(globalThis as any)` in four places,
 * which agrees with nothing.
 */
declare global {
  var __daakiaDebugSession: DebugSession | null;
}

/** The runtime's marker for "the reader pressed stop", not a real error. */
const DEBUG_STOPPED = '__DEBUG_STOPPED__';

function layersOf(ctx: ScriptContext): VarLayers {
  return {
    collection: ctx.collectionVariables,
    env: ctx.environmentVariables,
    secret: ctx.secretVariables,
    global: ctx.globalVariables,
  };
}

/**
 * Run one phase's script against `ctx`, mutating it with what the script set.
 *
 * `ctx` is updated in place because the caller holds it across both phases: a
 * post-response script must see what the pre-request one did, and returning a
 * fresh context would quietly give it the original values.
 */
export async function runPhase(
  script: string | undefined,
  ctx: ScriptContext,
  phase: 'pre-request' | 'post-response',
  /** Present only when this phase has breakpoints the reader set. */
  dbg?: PhaseDebug,
): Promise<ScriptOutcome> {
  if (!script || !script.trim()) return noScript(ctx);

  const result = dbg?.lines?.length
    ? await runDebugged(script, ctx, phase, dbg)
    : await runScript(script, ctx);

  /*
    Variables are carried forward even when the script FAILED.

    A script that sets a token and then throws on the line after it has still
    set the token, and the runtime reports both. Discarding the write because
    of the throw would lose work the script genuinely did.
  */
  ctx.environmentVariables = result.updatedEnvironmentVars;
  ctx.collectionVariables = result.updatedCollectionVars;
  ctx.globalVariables = result.updatedGlobalVars;
  ctx.secretVariables = result.updatedSecretVars;

  return {
    ok: result.success,
    stopped: result.errors.includes(DEBUG_STOPPED),
    logs: result.logs,
    errors: result.errors,
    consoleLogs: result.structuredLogs.map(l => ({ ...l, scriptPhase: phase })),
    subRequests: result.subRequests.map(r => ({ ...r, phase })),
    testResults: result.testResults,
    layers: layersOf(ctx),
  };
}

/**
 * Fill in any `{{var}}` the script has just made resolvable.
 *
 * The same second pass REST and GraphQL do, and for the same reason: the
 * webview renders the request before it posts it, so a variable the script
 * creates arrives too late for everything that would have used it. An
 * unresolved variable survives as its literal `{{name}}`, so it is still here
 * to complete.
 */
export function resolveAfterScript<T extends { key: string; value: string }>(
  fields: { strings?: (string | undefined)[]; rows?: (T[] | undefined)[] },
  layers: VarLayers,
): { strings: string[]; rows: (T[] | undefined)[] } {
  return {
    strings: (fields.strings ?? []).map(s => resolveVars(s ?? '', layers)),
    rows: (fields.rows ?? []).map(r => resolveRows(r, layers)),
  };
}
