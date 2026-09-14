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

  for (const next of proposed) {
    const id = next.scan.identity;
    const e = byIdentity.get(id);

    if (!e) {
      out.push({ outcome: 'added', identity: id, next });
      continue;
    }
    matched.add(id);

    if (e.scan!.written === next.scan.written && untouched(e)) {
      out.push({ outcome: 'unchanged', identity: id, next, existing: e });
      continue;
    }
    if (untouched(e)) {
      out.push({ outcome: 'updated', identity: id, next, existing: e });
      continue;
    }
    /* Edited by somebody. If the scan's own fields are the same as last time,
       the code did not change and there is nothing to offer — their edit stands
       and this is simply not news. */
    if (e.scan!.written === next.scan.written) {
      out.push({ outcome: 'unchanged', identity: id, next, existing: e });
      continue;
    }
    out.push({
      outcome: 'conflict', identity: id, next, existing: e,
      changedFields: changedFields(e, next),
    });
  }

  for (const e of existing) {
    /* No scan block means a person made it; the scan has no opinion about it. */
    if (!e.scan) continue;
    if (matched.has(e.scan.identity)) continue;
    out.push({ outcome: 'orphaned', identity: e.scan.identity, existing: e });
  }

  return out;
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
