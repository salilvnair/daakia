/**
 * Screen 18 — import issue templates.
 *
 * Screen 17 reads the forms a repository already has. This is the other case,
 * and the common one on a repository nobody has set up: the forms are
 * elsewhere — a zip a colleague sent, a folder on disk, or the repo next door
 * that got this right.
 *
 * **Importing and committing are separate on purpose.** Reading a zip to see
 * what is in it costs nothing and is undone by changing your mind. Putting
 * files in somebody's `.github/` is a commit on their default branch with your
 * name on it. One is a preview; the other is a write, and they are never the
 * same button.
 *
 * **A malformed form is named and skipped, not fatal** — 18E. One bad
 * `options` line does not cost you the two forms that parse; the file and the
 * line are reported in amber and the rest of the import carries on.
 *
 * **What a file would give the board is the point of the table.** A dropdown
 * this repository has no dimension for is shown as a new one rather than
 * silently dropped: a repository that tracks by Team is telling you something
 * about how it works.
 */
import { useEffect, useMemo, useState } from 'react';
import { postMsg } from '../../vscode';
import { Ico } from './GhIcons';
import { GhClose } from './GhClose';
import { chipOf } from './GhCards';
import { CopyWord, GhNote } from './GhShell';
import { cap, type FormField, type IssueForm, type ProposedDimension } from './board-types';

interface TemplateFile { file: string; text: string }

interface Source {
  files: TemplateFile[];
  from: string;
  error?: string;
  /* Parsed on the host, by the parser the board uses — see the handler. */
  forms: IssueForm[];
  formErrors: { file: string; message: string; line?: number }[];
  dimensions: ProposedDimension[];
}

interface CommitStep { file: string; path: string; display: string; replaces?: string }
interface CommitPlan { repo: string; steps: CommitStep[]; refusal?: string }
interface Outcome { file: string; ok: boolean; error?: string }

export function GhImport({ repo, existing, onClose, onImported }: {
  repo: string;
  /** What the repository already declares, for 18D's collision column. */
  existing: IssueForm[];
  onClose: () => void;
  /** After a commit lands, so the board re-reads and the map appears. */
  onImported: () => void;
}) {
  const [source, setSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState<'' | 'repo' | 'files' | 'starter'>('');
  const [from, setFrom] = useState('');
  const [message, setMessage] = useState('Add issue forms');
  const [plan, setPlan] = useState<CommitPlan | null>(null);
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'dkgh:import:result') {
        setLoading('');
        setSource(msg as unknown as Source);
        setPlan(null);
        setOutcomes(null);
        return;
      }
      if (msg.type === 'dkgh:planTemplates:result') {
        setPlan(msg.plan as CommitPlan);
        return;
      }
      if (msg.type === 'dkgh:applyTemplates:running') { setRunning(true); return; }
      if (msg.type !== 'dkgh:applyTemplates:result') return;
      setRunning(false);
      setOutcomes((msg.outcomes as Outcome[]) ?? []);
      if (((msg.outcomes as Outcome[]) ?? []).some(o => o.ok)) onImported();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onImported]);

  const parsed = {
    forms: source?.forms ?? [],
    errors: source?.formErrors ?? [],
  };
  const proposed = source?.dimensions ?? [];

  const known = useMemo(
    () => new Set(existing.flatMap(f => f.fields.map(x => x.label.toLowerCase()))),
    [existing],
  );
  const alreadyThere = useMemo(
    () => new Set(existing.map(f => f.file.toLowerCase())),
    [existing],
  );

  const rows = parsed.forms.flatMap(form =>
    form.fields.map(field => ({ form, field })));

  const dropdowns = rows.filter(r => r.field.type === 'dropdown').length;

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">

      <div className="head">
        <div className="repo">
          <Ico name="dl" />
          <span className="path" style={{ fontFamily: 'var(--sans)', fontWeight: 700 }}>
            Import issue templates
          </span>
        </div>
        {existing.length === 0 && <span className="chip c-stale">no issue forms found</span>}
        <span className="spacer" />
        <GhClose onClick={onClose} />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ padding: '13px 16px 4px' }}>
          <div className="fl" style={{ marginBottom: 7 }}>Bring templates in from</div>
          <div className="srcgrid">
            <button
              type="button"
              className="srcc"
              style={{ textAlign: 'left', cursor: 'pointer', borderStyle: 'dashed',
                       borderColor: 'color-mix(in srgb, var(--dk-gh) 45%, transparent)',
                       background: 'color-mix(in srgb, var(--dk-gh) 6%, transparent)' }}
              onClick={() => { setLoading('files'); postMsg({ type: 'dkgh:import', source: 'files' }); }}
            >
              <div className="sh">
                <Ico name="dl" style={{ color: 'var(--dk-gh)' }} />A zip or some files
              </div>
              <div className="sl" style={{ color: 'var(--dk-muted)' }}>
                pick a <code>.zip</code>, or any number of <code>.yml</code>
              </div>
              <div className="stat-ok">
                {loading === 'files' ? 'waiting for the picker…' : 'nothing is written anywhere'}
              </div>
            </button>

            <div className="srcc">
              <div className="sh">
                <Ico name="repo" style={{ color: 'var(--dk-blue)' }} />Another repository
              </div>
              <input
                className="inp mono"
                value={from}
                placeholder="owner/name"
                onChange={e => setFrom(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter' || !from.trim()) return;
                  setLoading('repo');
                  postMsg({ type: 'dkgh:import', source: 'repo', repo: from.trim() });
                }}
              />
              <div className="sl">
                reads its <code>.github/</code> over <code>gh api</code> — nothing is written
                there
              </div>
            </div>

            <button
              type="button"
              className="srcc"
              style={{ textAlign: 'left', cursor: 'pointer' }}
              onClick={() => {
                setLoading('starter');
                postMsg({ type: 'dkgh:import', source: 'starter' });
              }}
            >
              <div className="sh">
                <Ico name="pen" style={{ color: 'var(--dk-amber)' }} />Start from a template
              </div>
              <div className="sl" style={{ color: 'var(--dk-muted)' }}>
                bug report · enhancement · task
              </div>
              <div className="sl">dkgh writes a sensible starter set for you to edit</div>
            </button>
          </div>
        </div>

        {source?.error && (
          <div style={{ padding: '12px 16px 0' }}>
            <GhNote title="That did not come back" tone="warn" style={{ maxWidth: 'none',
                                                                       margin: 0 }}>
              {source.error}
            </GhNote>
          </div>
        )}

        {source && !source.error && (
          <>
            <div style={{ padding: '14px 16px 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
                <span className="fl">Parsed from {source.from || 'what you picked'}</span>
                <span style={{ flex: 1, height: 1, background: 'var(--dk-border)' }} />
                <span className="sub" style={{ color: 'var(--dk-green)' }}>
                  {parsed.forms.length} form{parsed.forms.length === 1 ? '' : 's'} ·{' '}
                  {rows.length} field{rows.length === 1 ? '' : 's'} ·{' '}
                  {dropdowns} dropdown{dropdowns === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {parsed.errors.length > 0 && (
              <div style={{ padding: '0 16px 8px' }}>
                {/* 18E — named and skipped, never fatal. */}
                <div className="opt" style={{
                  border: '1px solid color-mix(in srgb, var(--dk-amber) 34%, transparent)',
                  background: 'color-mix(in srgb, var(--dk-amber) 8%, transparent)',
                }}>
                  {parsed.errors.map(e => (
                    <div key={e.file} className="fct" style={{ cursor: 'default' }}>
                      <Ico name="warn" style={{ color: 'var(--dk-amber)', flexShrink: 0 }} />
                      <code>{e.file}</code>
                      <span className="sub">
                        {e.message}{e.line ? ` (line ${e.line})` : ''} — skipped, the rest is
                        still here
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rows.length > 0 && (
              <div className="tblw prose">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>File</th><th>Form</th><th>Field</th><th>Type</th>
                      <th>Options / required</th><th>What the board gets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ form, field }) => (
                      <tr key={`${form.file}-${field.label}`}>
                        <td className="dt">{form.file}</td>
                        <td>{form.name}</td>
                        <td style={{ fontWeight: field.type === 'dropdown' ? 600 : 400 }}>
                          {field.label}
                        </td>
                        <td>
                          <span className={field.type === 'dropdown' ? 'bsrc b-form' : 'bsrc b-native'}>
                            {field.type}
                          </span>
                        </td>
                        <td>
                          {field.options.length
                            ? <span className="chips">
                                {field.options.slice(0, 5).map(o => <Val key={o} value={o}
                                                                         options={field.options} />)}
                                {field.options.length > 5 && (
                                  <span className="sub">+{field.options.length - 5}</span>
                                )}
                              </span>
                            : <span style={{ color: 'var(--dk-muted)' }}>
                                {field.required ? 'required' : 'optional'}
                              </span>}
                        </td>
                        <td className="dt">
                          <Gets field={field} proposed={proposed} known={known} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 18D — what is already there */}
            {source.files.some(f => alreadyThere.has(f.file.toLowerCase())) && (
              <div style={{ padding: '12px 16px 0' }}>
                <GhNote title="This repository already has some of these" tone="warn"
                        style={{ maxWidth: 'none', margin: 0 }}>
                  {source.files
                    .filter(f => alreadyThere.has(f.file.toLowerCase()))
                    .map((f, at) => (
                      <span key={f.file}>
                        {at > 0 ? ', ' : ''}<code>{f.file}</code>
                      </span>
                    ))}
                  {' '}would be replaced, not merged. The commit preview says so per file, and
                  the old version stays in the repository&rsquo;s history either way.
                </GhNote>
              </div>
            )}

            {/* 18C — the commit, shown before it happens */}
            <div style={{ padding: '12px 16px 4px' }}>
              <div className="fl" style={{ marginBottom: 7 }}>What you can do with these</div>
              <div className="opts" style={{ gridTemplateColumns: 'repeat(2, 1fr)',
                                             maxWidth: 'none' }}>
                <div className="opt">
                  <div className="oh"><Ico name="dl" />Save them to disk</div>
                  <div className="sub">
                    The files, unchanged, for you to commit yourself or send on. Nothing is
                    written to <code>{repo}</code>.
                  </div>
                  <div className="actions" style={{ marginTop: 6, justifyContent: 'flex-start' }}>
                    {source.files.map(f => (
                      <button key={f.file} type="button" className="btn"
                              onClick={() => postMsg({
                                type: 'dkgh:export', filename: f.file, text: f.text,
                              })}>
                        <Ico name="dl" />{f.file}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="opt pick">
                  <div className="oh">
                    <Ico name="pen" style={{ color: 'var(--dk-gh)' }} />
                    Commit them to <code>.github/</code>
                  </div>
                  <div className="sub">
                    So people filing on github.com get the same form — and so discovery reads
                    the map next refresh. A real commit on the default branch, shown in full
                    before anything happens.
                  </div>
                  <div className="fieldrow" style={{ marginTop: 6 }}>
                    <label className="fl" htmlFor="dkgh-commit-message">Commit message</label>
                    <input
                      id="dkgh-commit-message"
                      className="inp"
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                    />
                  </div>
                  <div className="actions" style={{ marginTop: 6, justifyContent: 'flex-start' }}>
                    <button
                      type="button"
                      className="btn"
                      disabled={parsed.forms.length === 0}
                      onClick={() => postMsg({
                        type: 'dkgh:planTemplates',
                        repo,
                        files: source.files.filter(f => parsed.forms.some(p => p.file === f.file)),
                        message,
                      })}
                    >
                      Show me what that runs
                    </button>
                  </div>
                </div>
              </div>

              <GhNote title="Importing and committing are separate on purpose" tone="warn"
                      style={{ maxWidth: 'none', margin: '10px 0 0' }}>
                Reading a zip to understand a repository costs nothing and is undone by changing
                your mind. Putting files in somebody&rsquo;s <code>.github/</code> is a commit on
                their default branch with your name on it. One is a setting; the other is a pull
                request, and they should never be the same button.
              </GhNote>
            </div>
          </>
        )}

        {plan && (
          <div style={{ padding: '12px 16px 20px' }}>
            <div className="fl" style={{ marginBottom: 7 }}>
              What committing runs — {plan.steps.length} call
              {plan.steps.length === 1 ? '' : 's'}
            </div>
            {plan.refusal
              ? <div className="sub" style={{ color: 'var(--dk-red)' }}>{plan.refusal}</div>
              : (
                <>
                  <div className="cmd" style={{ alignItems: 'flex-start' }}>
                    <pre className="code" style={{ flex: 1 }}>
                      {plan.steps.map(s => s.display).join('\n')}
                    </pre>
                    <CopyWord text={plan.steps.map(s => s.display).join('\n')} />
                  </div>
                  <div className="sub" style={{ marginTop: 6 }}>
                    One commit per file, run in order. Not atomic, and it says so: if the second
                    fails the first is already on the branch, and the result names which landed.
                  </div>
                  <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                    <button type="button" className="btn" onClick={() => setPlan(null)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn go"
                      disabled={running}
                      onClick={() => postMsg({
                        type: 'dkgh:applyTemplates',
                        repo,
                        files: (source?.files ?? [])
                          .filter(f => plan.steps.some(s => s.file === f.file)),
                        message,
                      })}
                    >
                      {running ? 'Committing…' : `Commit ${plan.steps.length} file`
                        + `${plan.steps.length === 1 ? '' : 's'} to ${repo}`}
                    </button>
                  </div>
                </>
              )}
          </div>
        )}

        {outcomes && (
          <div style={{ padding: '0 16px 20px' }}>
            <div className="opt">
              <div className="fl">
                {outcomes.filter(o => o.ok).length} of {outcomes.length} committed
              </div>
              {outcomes.map(o => (
                <div key={o.file} className="fct" style={{ cursor: 'default' }}>
                  <Ico name={o.ok ? 'check' : 'warn'}
                       style={{ color: o.ok ? 'var(--dk-green)' : 'var(--dk-red)',
                                flexShrink: 0 }} />
                  <code>{o.file}</code>
                  {o.error && <span className="sub" style={{ color: 'var(--dk-red)' }}>
                    {o.error}
                  </span>}
                </div>
              ))}
              {outcomes.some(o => o.ok) && (
                <div className="sub">
                  The board has re-read the repository — the new dimensions are on the Repository
                  tab.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** A dropdown value in the colour the board would give it. */
function Val({ value, options }: { value: string; options: string[] }) {
  const { className, style } = chipOf(value, options);
  return <span className={className} style={style}>{value}</span>;
}

/**
 * What the board would get from this field.
 *
 * A dropdown dkgh maps to a dimension says which; one it has no dimension for
 * is offered as a new one rather than silently dropped, because a repository
 * that tracks by Team is telling you something about how it works.
 */
function Gets({ field, proposed, known }: {
  field: FormField;
  proposed: ProposedDimension[];
  known: Set<string>;
}) {
  if (field.type !== 'dropdown') {
    return <span style={{ color: 'var(--dk-faint)' }}>body field</span>;
  }
  const mapped = proposed.find(p => p.heading.toLowerCase() === field.label.toLowerCase());
  if (mapped) {
    return (
      <span style={{ color: 'var(--dk-green)' }}>
        maps to {cap(mapped.dimension)}
        {known.has(field.label.toLowerCase()) ? '' : ' · new here'}
      </span>
    );
  }
  return (
    <span style={{ color: 'var(--dk-blue)' }}>
      a new dimension: {field.label}
    </span>
  );
}

