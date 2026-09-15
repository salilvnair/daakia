/**
 * What a second scan does to a collection you already have.
 *
 * ── The rule ──
 *
 * A collection you have edited is worth more than the scan that made it. So a
 * re-scan updates what is there, and the only way to do that safely is to know
 * which parts of each request the scan wrote and whether they have been touched
 * since.
 *
 * `identity` — method and path — finds the row again, because you are expected
 * to rename things. `written` — a hash of what the scan filled in — separates
 * "the code changed" from "you changed it". Given both, every case has an
 * obvious answer:
 *
 *   in source   in collection      →  outcome
 *   ─────────────────────────────────────────────────────────────────────
 *   new         absent             →  added
 *   unchanged   anything           →  untouched (not rewritten, not reordered)
 *   changed     untouched by you   →  updated, silently: nothing to lose
 *   changed     edited by you      →  conflict, shown field by field
 *   gone        present            →  orphaned: marked, never deleted
 *   anything    added by you       →  ignored entirely
 *
 * ── Why nothing is ever deleted ──
 *
 * A route that was removed and a file that was renamed look identical from
 * here. Deleting somebody's work on that evidence is not a trade worth making,
 * so an orphan is marked and left, and removing it is one deliberate click.
 */

import type { GeneratedRequest, ScanStamp } from './to-requests';

/** A request already in the collection, as far as reconciliation cares. */
export interface ExistingRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  /** Parsed from the row's `data`; absent when a person created the request. */
  scan?: ScanStamp;
  /** What the request holds now — hashed the same way the scan hashes. */
  current: string;
}

export type Outcome = 'added' | 'unchanged' | 'updated' | 'conflict' | 'orphaned';

export interface Reconciled {
  outcome: Outcome;
  identity: string;
  /** What the scan now proposes. Absent for an orphan — there is no new version. */
  next?: GeneratedRequest;
  /** The row this is about. Absent for something added. */
  existing?: ExistingRequest;
  /** For a conflict: which fields differ, so the screen can offer them one by one. */
  changedFields?: string[];
}

export interface ReconcileSummary {
  added: number;
  unchanged: number;
  updated: number;
  conflict: number;
  orphaned: number;
}

/** Was this request left exactly as the scan wrote it? */
export function untouched(e: ExistingRequest): boolean {
  return !!e.scan && e.scan.written === e.current;
}

/** Which of the scan-owned fields differ between what is there and what is proposed. */
export function changedFields(e: ExistingRequest, next: GeneratedRequest): string[] {
  const out: string[] = [];
  if (e.method !== next.method) out.push('method');
  if (e.url !== next.url) out.push('url');
  /* The hash covers body, headers and params together; naming them
     individually needs the old values, which the row no longer carries. What
     the screen can say honestly is that the scan's fields differ. */
  if (e.scan && e.scan.written !== next.scan.written) out.push('body, headers or parameters');
  return out;
}

/**
 * Work out what should happen to each request.
 *
 * Deterministic and pure — the screen renders this, the writer applies what the
 * screen confirmed, and neither of them re-decides anything.
 */
export function reconcile(
  existing: ExistingRequest[],
  proposed: GeneratedRequest[],
): Reconciled[] {
  const byIdentity = new Map<string, ExistingRequest>();
  for (const e of existing) {
    if (e.scan?.identity) byIdentity.set(e.scan.identity, e);
  }

  const out: Reconciled[] = [];
  const matched = new Set<string>();
  /* Proposed requests that no stored identity matched exactly. */
  const unmatched: GeneratedRequest[] = [];

  for (const next of proposed) {
    const e = byIdentity.get(next.scan.identity);
    if (!e) { unmatched.push(next); continue; }
    matched.add(next.scan.identity);
    out.push(classify(e, next));
  }

  /*
    Second pass: the same route, differently labelled.

    Two mappings on one path are told apart by a discriminator — `POST /import
    [json]` beside `POST /import [form-data]`. Delete one and the survivor
    stops needing the suffix, so its identity changes without the route
    changing at all, and a strict match reports the request you still have as
    an orphan and writes a second copy of it beside itself.

    Only an unambiguous pairing counts: exactly one unmatched proposal and
    exactly one unmatched stored request reducing to the same base. Anything
    less certain stays an add and an orphan, which is the outcome that loses
    nothing.
  */
  const leftovers = new Map<string, ExistingRequest[]>();
  for (const e of existing) {
    if (!e.scan || matched.has(e.scan.identity)) continue;
    const key = baseIdentity(e.scan.identity);
    leftovers.set(key, [...(leftovers.get(key) ?? []), e]);
  }
  const byBase = new Map<string, GeneratedRequest[]>();
  for (const next of unmatched) {
    const key = baseIdentity(next.scan.identity);
    byBase.set(key, [...(byBase.get(key) ?? []), next]);
  }

  for (const next of unmatched) {
    const key = baseIdentity(next.scan.identity);
    const candidates = leftovers.get(key);
    if (candidates?.length === 1 && byBase.get(key)!.length === 1) {
      const e = candidates[0];
      matched.add(e.scan!.identity);
      out.push(classify(e, next));
      continue;
    }
    out.push({ outcome: 'added', identity: next.scan.identity, next });
  }

  for (const e of existing) {
    /* No scan block means a person made it; the scan has no opinion about it. */
    if (!e.scan) continue;
    if (matched.has(e.scan.identity)) continue;
    out.push({ outcome: 'orphaned', identity: e.scan.identity, existing: e });
  }

  return out;
}

/** An identity without its discriminator: `POST /import [json]` → `POST /import`. */
export function baseIdentity(identity: string): string {
  return identity.replace(/\s*\[[^\]]*\]\s*$/, '');
}

/** What should happen to a stored request the scan has found again. */
function classify(e: ExistingRequest, next: GeneratedRequest): Reconciled {
  const identity = next.scan.identity;
  const sameCode = e.scan!.written === next.scan.written;

  if (sameCode && untouched(e)) return { outcome: 'unchanged', identity, next, existing: e };
  if (untouched(e)) return { outcome: 'updated', identity, next, existing: e };
  /* Edited by somebody. If the scan's own fields are the same as last time,
     the code did not change and there is nothing to offer — their edit stands
     and this is simply not news. */
  if (sameCode) return { outcome: 'unchanged', identity, next, existing: e };
  return {
    outcome: 'conflict', identity, next, existing: e,
    changedFields: changedFields(e, next),
  };
}

export function summarise(rows: Reconciled[]): ReconcileSummary {
  const s: ReconcileSummary = { added: 0, unchanged: 0, updated: 0, conflict: 0, orphaned: 0 };
  for (const r of rows) s[r.outcome]++;
  return s;
}

/** What the screen offers by default: everything except a conflict or an orphan. */
export function defaultSelection(rows: Reconciled[]): Set<string> {
  return new Set(
    rows.filter(r => r.outcome === 'added' || r.outcome === 'updated').map(r => r.identity),
  );
}
