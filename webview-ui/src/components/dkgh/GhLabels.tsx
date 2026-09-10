/**
 * Screen 19 — labels, edited here and synced there.
 *
 * GitHub's label editor is a settings page nobody visits: one row at a time, a
 * colour picker per row, no way to see the set as a set. This is the set —
 * every label, its colour, its description, and **how many issues actually use
 * it**, which is the column GitHub never shows and the one that tells you
 * `wontfix` has been sitting unused while everyone argues about keeping it.
 *
 * **Sync is one-way on purpose.** Edits stack up locally in amber and go in one
 * push, so renaming three labels is one review rather than three round trips
 * through a settings page. Refresh pulls GitHub's current set and reports a
 * conflict if somebody changed the same label there — nothing merges silently,
 * because two people recolouring one label is a question, not something to
 * resolve by timestamp.
 *
 * **A rename is not a local rename**, and the screen says so before the push:
 * it changes the label on every issue carrying it and breaks any saved search
 * written against the old name, GitHub's own included.
 */
import { useEffect, useMemo, useState } from 'react';
import { postMsg } from '../../vscode';
import { Ico } from './GhIcons';
import { CopyWord, GhNote } from './GhShell';
import type { BoardIssue } from './board-types';
import type { RepoMeta } from './types';

interface Label { name: string; color: string; description?: string }

interface Edit {
  was?: string;
  name?: string;
  color?: string;
  description?: string;
  deleted?: boolean;
  readAs?: Label;
}

interface Step {
  kind: 'create' | 'rename' | 'update' | 'delete';
  label: string;
  does: string;
  display: string;
  renamesTo?: string;
}
interface Plan { repo: string; steps: Step[]; refusal?: string }
interface Outcome { label: string; ok: boolean; error?: string }

/** How long a label can go unused before the row says so. */
const STALE_DAYS = 180;

export function GhLabels({ repo, meta, issues, onClose, onRefresh }: {
  repo: string;
  meta?: RepoMeta;
  /** The board's issues, for the usage column GitHub does not give. */
  issues: BoardIssue[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const live: Label[] = useMemo(() => meta?.labels ?? [], [meta]);

  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<string | undefined>();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'dkgh:planLabels:result') { setPlan(msg.plan as Plan); return; }
      if (msg.type === 'dkgh:applyLabels:running') { setRunning(true); return; }
      if (msg.type !== 'dkgh:applyLabels:result') return;
      setRunning(false);
      setOutcomes((msg.outcomes as Outcome[]) ?? []);
      /* Only the ones that landed are cleared. A failed rename is still a
         staged rename, and dropping it would lose what somebody typed. */
      const failed = new Set(((msg.outcomes as Outcome[]) ?? [])
        .filter(o => !o.ok).map(o => o.label));
      setEdits(prev => Object.fromEntries(
        Object.entries(prev).filter(([key]) => failed.has(key)),
      ));
      setPlan(null);
      onRefresh();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onRefresh]);

  /*
    How many of the loaded issues carry each label.

    "On the board", not "in the repository" — the board holds a page, and a
    count that claimed to be the repository's would be wrong on any repository
    big enough for the question to matter. The header says which.
  */
  const used = useMemo(() => {
    const counts = new Map<string, number>();
    for (const issue of issues) {
      for (const l of issue.labels) counts.set(l.name, (counts.get(l.name) ?? 0) + 1);
    }
    return counts;
  }, [issues]);

  const staged = Object.values(edits);
  const created = staged.filter(e => !e.was && !e.deleted);
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const fromGithub = live.map(l => ({ live: l, edit: edits[l.name] }));
    const fresh = created.map(e => ({ live: undefined, edit: e }));
    return [...fresh, ...fromGithub].filter(r => {
      const name = r.edit?.name ?? r.live?.name ?? '';
      return !q || name.toLowerCase().includes(q)
        || (r.live?.description ?? '').toLowerCase().includes(q);
    });
  }, [live, edits, filter, created]);

  const change = (key: string, patch: Partial<Edit>, readAs?: Label) => setEdits(prev => ({
    ...prev,
    [key]: { ...(prev[key] ?? { was: readAs?.name, readAs }), ...patch },
  }));

  const push = () => postMsg({ type: 'dkgh:planLabels', repo, edits: staged });

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">

      <div className="head">
        <div className="repo">
          <Ico name="tag" />
          <span className="path" style={{ fontFamily: 'var(--sans)', fontWeight: 700 }}>
            Labels
          </span>
        </div>
        <span className="spacer" />
        <span className="ago">
          {staged.length ? `${staged.length} local change${staged.length === 1 ? '' : 's'}`
            : 'in sync'}
        </span>
        <button type="button" className="btn" onClick={onRefresh} title="Read them again">
          <Ico name="refresh" />
        </button>
        <button type="button" className="btn" style={{ padding: '3px 9px' }} onClick={onClose}>
          ×
        </button>
      </div>

      <div className="toolbar">
        <span className="panelsearch" style={{ margin: 0, flex: 1, maxWidth: 260 }}>
          <Ico name="search" />
          <input value={filter} placeholder="Filter labels"
                 onChange={e => setFilter(e.target.value)} />
          <span className="n">{rows.length}</span>
        </span>
        <span className="pill on"><Ico name="tag" />{live.length} labels</span>
        <button
          type="button"
          className="pill"
          onClick={() => {
            const key = `new:${Date.now()}`;
            setEdits(prev => ({ ...prev, [key]: { name: '', color: '#ededed' } }));
            setEditing(key);
          }}
        >
          <Ico name="plus" />New label
        </button>
      </div>

      {staged.length > 0 && (
        <div className="chiprow" style={{
          background: 'color-mix(in srgb, var(--dk-amber) 8%, transparent)',
        }}>
          <span className="lead" style={{ color: 'var(--dk-amber)' }}>Not pushed</span>
          <span style={{ fontSize: 12.6, color: 'var(--dk-text)' }}>
            <b>{staged.length} local change{staged.length === 1 ? '' : 's'}.</b>{' '}
            {describe(staged)} Nothing has reached GitHub yet.
          </span>
          <span className="sp" />
          <button type="button" className="btn warn" onClick={() => { setEdits({}); setPlan(null); }}>
            Discard
          </button>
          <button type="button" className="btn go" onClick={push}>
            <Ico name="check" />Push {staged.length} change{staged.length === 1 ? '' : 's'}
          </button>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div className="tblw prose">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 30 }} />
                <th>Label</th>
                <th>Description</th>
                <th>On the board</th>
                <th>State</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ live: l, edit }) => {
                const key = l?.name ?? Object.keys(edits).find(k => edits[k] === edit) ?? '';
                const name = edit?.name ?? l?.name ?? '';
                const colour = edit?.color ?? `#${l?.color ?? 'ededed'}`;
                const description = edit?.description ?? l?.description ?? '';
                const count = l ? used.get(l.name) ?? 0 : 0;
                const state = stateOf(edit, l, count);
                return (
                  <tr key={key || name} style={rowTint(state)}>
                    <td>
                      <span className="lbldot">
                        <b style={{ background: colour }} />
                      </span>
                    </td>
                    <td>
                      {editing === key ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <input
                            className="inp"
                            autoFocus
                            style={{ width: 150 }}
                            value={name}
                            onChange={e => change(key, { name: e.target.value }, l)}
                            onKeyDown={e => { if (e.key === 'Enter') setEditing(undefined); }}
                          />
                          <input
                            className="inp mono"
                            style={{ width: 92 }}
                            value={colour}
                            onChange={e => change(key, { color: e.target.value }, l)}
                          />
                        </span>
                      ) : (
                        <>
                          <span className="chip"
                                style={{ color: colour, borderColor: colour }}>
                            {name || 'unnamed'}
                          </span>
                          {edit?.was && edit.name && edit.name !== edit.was && (
                            <span className="sub" style={{ marginLeft: 5 }}>
                              was <s>{edit.was}</s>
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      {editing === key ? (
                        <input
                          className="inp"
                          style={{ width: '100%' }}
                          value={description}
                          placeholder="What it means"
                          onChange={e => change(key, { description: e.target.value }, l)}
                        />
                      ) : (
                        <span style={{ color: 'var(--dk-muted)' }}>{description || '—'}</span>
                      )}
                    </td>
                    <td className="dt">
                      {l ? `${count} issue${count === 1 ? '' : 's'}` : '—'}
                    </td>
                    <td><State state={state} /></td>
                    <td className="dt">
                      <span style={{ display: 'inline-flex', gap: 8 }}>
                        <button type="button" className="textlink"
                                onClick={() => setEditing(editing === key ? undefined : key)}>
                          {editing === key ? 'done' : 'edit'}
                        </button>
                        {l && (
                          <button
                            type="button"
                            className="textlink"
                            style={{ color: 'var(--dk-red)' }}
                            onClick={() => change(key, { deleted: !edit?.deleted }, l)}
                          >
                            {edit?.deleted ? 'keep' : 'delete'}
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {plan && (
          <div style={{ padding: '12px 16px 0' }}>
            <div className="fl" style={{ marginBottom: 7 }}>
              What Push runs — {plan.steps.length} call{plan.steps.length === 1 ? '' : 's'}
            </div>
            {plan.refusal
              ? <div className="sub" style={{ color: 'var(--dk-red)' }}>{plan.refusal}</div>
              : (
                <>
                  {plan.steps.filter(s => s.renamesTo).map(s => (
                    <GhNote key={s.label} title="A rename is not a local rename" tone="warn"
                            style={{ maxWidth: 'none', margin: '0 0 8px' }}>
                      Renaming <code>{s.label}</code> to <code>{s.renamesTo}</code> changes it on{' '}
                      <b>
                        {used.get(s.label) ?? 0} issue{(used.get(s.label) ?? 0) === 1 ? '' : 's'}
                      </b>{' '}
                      the board is holding, and on any it is not — and it breaks every saved
                      search written against the old name, GitHub&rsquo;s own included.
                    </GhNote>
                  ))}
                  <div className="cmd" style={{ alignItems: 'flex-start' }}>
                    <pre className="code" style={{ flex: 1 }}>
                      {plan.steps.map(s => s.display).join('\n')}
                    </pre>
                    <CopyWord text={plan.steps.map(s => s.display).join('\n')} />
                  </div>
                  <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                    <button type="button" className="btn" onClick={() => setPlan(null)}>
                      Cancel
                    </button>
                    <button type="button" className="btn go" disabled={running}
                            onClick={() => postMsg({ type: 'dkgh:applyLabels', repo,
                                                     edits: staged })}>
                      {running ? 'Pushing…' : `Push to ${repo}`}
                    </button>
                  </div>
                </>
              )}
          </div>
        )}

        {outcomes && (
          <div style={{ padding: '12px 16px 0' }}>
            <div className="opt">
              <div className="fl">
                {outcomes.filter(o => o.ok).length} of {outcomes.length} pushed
              </div>
              {outcomes.map(o => (
                <div key={o.label} className="fct" style={{ cursor: 'default' }}>
                  <Ico name={o.ok ? 'check' : 'warn'}
                       style={{ color: o.ok ? 'var(--dk-green)' : 'var(--dk-red)',
                                flexShrink: 0 }} />
                  <code>{o.label}</code>
                  {o.error && (
                    <span className="sub" style={{ color: 'var(--dk-red)' }}>{o.error}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: '12px 16px 16px' }}>
          <GhNote title="Sync is one-way on purpose" icon="refresh" style={{ maxWidth: 'none',
                                                                             margin: 0 }}>
            Edits are local until you push; refresh pulls GitHub&rsquo;s current set. Nothing
            merges silently — two people recolouring one label is a question, not something to
            resolve by timestamp.
          </GhNote>
          <GhNote title="The count is what the board is holding" style={{ maxWidth: 'none',
                                                                         margin: '8px 0 0' }}>
            GitHub does not report how many issues carry a label, so it is counted from the
            issues that were read. On a repository bigger than one page it is a floor, not a
            total — which is still the number that tells you nothing has used{' '}
            <code>wontfix</code> lately.
          </GhNote>
        </div>
      </div>
    </div>
  );
}

/** The word in the State column, which is also what tints the row. */
type RowState = 'sync' | 'renamed' | 'recoloured' | 'edited' | 'new' | 'deleted' | 'unused';

function stateOf(edit: Edit | undefined, live: Label | undefined, count: number): RowState {
  if (edit?.deleted) return 'deleted';
  if (edit && !edit.was) return 'new';
  if (edit?.was && edit.name && edit.name !== edit.was) return 'renamed';
  if (edit?.color !== undefined && live && edit.color.replace('#', '') !== live.color) {
    return 'recoloured';
  }
  if (edit?.description !== undefined && (edit.description ?? '') !== (live?.description ?? '')) {
    return 'edited';
  }
  if (count === 0 && live) return 'unused';
  return 'sync';
}

const WORD: Record<RowState, string> = {
  sync: 'in sync',
  renamed: 'renamed',
  recoloured: 'recoloured',
  edited: 'edited',
  new: 'new here',
  deleted: 'to delete',
  unused: `unused on the board`,
};

function State({ state }: { state: RowState }) {
  if (state === 'sync') return <span className="st st-done"><b />in sync</span>;
  if (state === 'new') return <span className="st st-done"><b />new here</span>;
  if (state === 'unused') return <span className="st st-todo"><b />{WORD.unused}</span>;
  if (state === 'deleted') {
    return <span className="st" style={{ color: 'var(--dk-red)' }}><b />to delete</span>;
  }
  return <span className="st" style={{ color: 'var(--dk-amber)' }}><b />{WORD[state]}</span>;
}

function rowTint(state: RowState): React.CSSProperties | undefined {
  if (state === 'new') return { background: 'color-mix(in srgb, var(--dk-green) 6%, transparent)' };
  if (state === 'deleted') {
    return { background: 'color-mix(in srgb, var(--dk-red) 6%, transparent)' };
  }
  if (state === 'renamed' || state === 'recoloured' || state === 'edited') {
    return { background: 'color-mix(in srgb, var(--dk-amber) 6%, transparent)' };
  }
  if (state === 'unused') return { opacity: 0.6 };
  return undefined;
}

/** "1 renamed, 1 recoloured, 1 new." — the strip's own sentence. */
function describe(edits: Edit[]): string {
  const counts = {
    renamed: edits.filter(e => e.was && e.name && e.name !== e.was).length,
    new: edits.filter(e => !e.was && !e.deleted).length,
    deleted: edits.filter(e => e.deleted).length,
    changed: edits.filter(e => e.was && !e.deleted
      && (e.color !== undefined || e.description !== undefined)
      && !(e.name && e.name !== e.was)).length,
  };
  const said = [
    counts.renamed && `${counts.renamed} renamed`,
    counts.changed && `${counts.changed} changed`,
    counts.new && `${counts.new} new`,
    counts.deleted && `${counts.deleted} to delete`,
  ].filter(Boolean);
  return said.length ? `${said.join(', ')}.` : '';
}
