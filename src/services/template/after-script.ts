/**
 * The last thing that happens to a request before it goes on the wire.
 *
 * Called by every protocol handler and by the collection runner, which is the
 * point: there were four resolvers before this, and they did not agree. The
 * runner's own matched `[a-zA-Z0-9_.]`, so `{{bearer-token}}` — a name with a
 * hyphen, which is most of them — silently never resolved in a collection run
 * while working fine on the same request run by hand.
 */
import { resolveVars, type VarLayers } from '../resolve-vars';
import { renderTemplate, hasTemplate } from './render';
import { requestContext, type OutgoingRequest } from './request-context';

/**
 * Everything a request still needs doing to it once the script has run.
 *
 * ── Two passes, one call ──
 *
 * First the variables the script may have just created. The webview renders
 * the request before it posts it, so a token a pre-request script sets arrives
 * too late for everything that would have used it; an unresolved variable
 * survives as its literal `{{name}}`, so it is still here to complete.
 *
 * Then the template helpers — `{{$randomUUID}}`, `{{randomInt 1 100}}`,
 * `{{jsonPath request.body '$.id'}}`. These deliberately run LAST: a helper
 * may read a value the script set, and the request context it reads is the
 * one actually about to go on the wire rather than a draft of it.
 *
 * ── Why a small object rather than a function per field ──
 *
 * The version of this that took positional arrays of strings and rows was
 * never called by anything: no author wants to work out whether the envelope
 * was `strings[2]`. Each protocol has its own field names and always will, so
 * this hands back three verbs and lets the handler name its own fields.
 */
export interface AfterScript {
  /** One string — a URL, a body, a SOAP envelope. */
  str<T extends string | undefined>(value: T): T;
  /** A key/value list — headers, params, gRPC metadata, form fields. */
  rows<T extends { key: string; value: string }>(value: T[] | undefined): T[] | undefined;
  /** A flat bag of strings — auth data, in practice. */
  fields(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined;
}

export function afterScript(layers: VarLayers, req: OutgoingRequest): AfterScript {
  /*
    Built once from the request as the script left it. Rebuilding it per field
    would let a header rendered early change what a later header reads, which
    is a rule nobody could hold in their head.
  */
  const ctx = requestContext(req);

  const one = (value: string): string => {
    const resolved = resolveVars(value, layers);
    if (!hasTemplate(resolved)) return resolved;
    /*
      keepUnknown, because this is a request somebody is about to read the
      result of. An expression the engine does not know stays visible as
      itself — the same rule an unresolved variable follows, and for the same
      reason: an empty Authorization header fails in a way nobody can debug.
    */
    return renderTemplate(resolved, ctx, { keepUnknown: true });
  };

  return {
    str: (<T extends string | undefined>(value: T) =>
      (value === undefined ? value : one(value as string))) as AfterScript['str'],
    rows: (rows) => (rows
      ? rows.map(r => ({ ...r, key: one(r.key), value: one(r.value) }))
      : rows),
    fields: (obj) => {
      if (!obj) return obj;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k] = typeof v === 'string' ? one(v) : v;
      }
      return out;
    },
  };
}
