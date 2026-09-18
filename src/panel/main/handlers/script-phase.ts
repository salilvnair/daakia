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
 * This is deliberately the smaller of the two existing shapes — run the
 * script, collect what it said, carry the variables forward, persist them.
 * Breakpoints stay a REST feature until somebody asks for them elsewhere;
 * offering a debugger that only half works is worse than not offering one.
 */
import { runScript, type ScriptContext } from '../../../services/script-runtime';
import { resolveVars, resolveRows, type VarLayers } from '../../../services/resolve-vars';

export interface ScriptOutcome {
  /** False when the script threw — the caller must not send the request. */
  ok: boolean;
  logs: string[];
  errors: string[];
  consoleLogs: { level: string; args: unknown[]; timestamp: number; scriptPhase?: string }[];
  /** The variable sets as the script left them. */
  layers: VarLayers;
}

/** Nothing ran, and nothing is wrong — the shape a caller with no script gets. */
export function noScript(ctx: ScriptContext): ScriptOutcome {
  return {
    ok: true,
    logs: [],
    errors: [],
    consoleLogs: [],
    layers: layersOf(ctx),
  };
}

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
): Promise<ScriptOutcome> {
  if (!script || !script.trim()) return noScript(ctx);

  const result = await runScript(script, ctx);

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
    logs: result.logs,
    errors: result.errors,
    consoleLogs: result.structuredLogs.map(l => ({ ...l, scriptPhase: phase })),
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
