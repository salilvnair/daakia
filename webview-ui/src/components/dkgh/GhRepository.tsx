/**
 * Screen 17 — Repository, where the chips come from.
 *
 * The sub-tab every other screen has had and none of them has drawn. It shows
 * what discovery found when this repository was connected, and the map it
 * proposed from it: which heading in which form became Module, what values that
 * heading declares, and which dimensions are GitHub's own and therefore always
 * work.
 *
 * **Nothing here degrades into guessing.** A repository with no forms and no
 * Project simply does not offer Module, Environment or Type — those facets are
 * absent rather than sitting empty, and the board falls back to the GitHub
 * dimensions. An issue whose body was hand-edited until the heading no longer
 * parses shows as unmapped, never as a value somebody might act on, and 17D
 * counts those here so the number is findable rather than a mystery on the
 * board.
 *
 * **The map is read from the repository every time, not stored.** There is no
 * "confirm" button because there is nothing to confirm against: the forms are
 * the source, they are in the repository, and re-running discovery is how a
 * template change (17C) is picked up. A stored map would be a second copy of
 * something the repository already says, and the two would disagree the first
 * time somebody edited a `.yml`.
 */
import { useMemo } from 'react';
import { Ico, type IcoName } from './GhIcons';
import { chipOf } from './GhCards';
import { GhNote } from './GhShell';
import { cap, type BoardData, type BoardIssue, type ProposedDimension } from './board-types';
import type { RepoMeta } from './types';

/** GitHub's own, which need no map and are never missing. */
const NATIVE: { label: string; read: string; note: string }[] = [
  { label: 'State', read: 'GitHub', note: 'open or closed' },
  { label: 'Labels', read: 'GitHub', note: 'with the repository’s own colours' },
  { label: 'Assignee · Author', read: 'GitHub', note: 'collaborators only' },
  { label: 'Milestone', read: 'GitHub', note: 'open milestones' },
  { label: 'Age · Quiet', read: 'computed', note: 'from created and last activity' },
];

export function GhRepository({
  repo, data, meta, issues, onRefresh, onChangeRepo, onExplain, onImport, onLabels,
}: {
  repo: string;
  data?: BoardData;
  meta?: RepoMeta;
  issues: BoardIssue[];
  onRefresh: () => void;
  onChangeRepo: () => void;
  /** 17D — show the issues a heading did not parse in. */
  onExplain: (dimension: string) => void;
  /** Screen 18, which is where all three of the "none of this" answers go. */
  onImport: () => void;
  /** Screen 19 — the label set, which is the one part of this map you can edit. */
  onLabels: () => void;
}) {
  const dimensions = data?.dimensions ?? [];
  const forms = data?.forms ?? [];

  /*
    17D — how many issues each dimension could not read.

    Counted from the board rather than guessed at: an issue with no value for a
    heading its template declares is one whose body was edited until the
    heading stopped parsing, and that is a real number worth showing.
  */
  const unmapped = useMemo(() => new Map(dimensions.map(d => [
    d.dimension,
    issues.filter(i => !i.dimensions[d.dimension]).length,
  ])), [dimensions, issues]);

  return (
    <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">

      <div style={{ padding: '13px 16px 4px' }}>
        <div className="fl" style={{ marginBottom: 7 }}>Found in this repository</div>
        <div className="srcgrid">
          <Source
            icon="task"
            colour="var(--dk-gh)"
            title="Issue forms"
            badge="form"
            badgeClass="b-form"
            where=".github/ISSUE_TEMPLATE/"
            detail={forms.length
              ? forms.map(f => f.file).join(' · ')
              : 'nothing here'}
            ok={forms.length > 0}
            said={forms.length
              ? `${forms.reduce((n, f) => n + f.fields.length, 0)} fields, `
                + `${dimensions.length} of them dropdowns with fixed options`
              : 'no forms — Module, Environment and Type are not offered'}
          />
          <Source
            icon="board"
            colour="var(--dk-blue)"
            title="Project"
            badge="project"
            badgeClass="b-proj"
            where="not read"
            detail="Status · Priority · Start date · Target date"
            ok={false}
            said="needs the project scope, and dkgh does not read Projects yet"
          />
          <Source
            icon="tag"
            colour="var(--dk-amber)"
            title="Labels"
            badge="label"
            badgeClass="b-label"
            where={meta?.labels.length
              ? `${meta.labels.length} labels, with their own colours`
              : 'none'}
            detail={prefixNote(meta)}
            ok={(meta?.labels.length ?? 0) > 0}
            said="used as a fallback, and as a dimension when there are no forms"
            onClick={onLabels}
          />
        </div>
      </div>

      <div style={{ padding: '14px 16px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
          <span className="fl">Board dimensions</span>
          <span style={{ flex: 1, height: 1, background: 'var(--dk-border)' }} />
          <span className="sub">read from this repository, every time</span>
        </div>
      </div>

      <div className="tblw prose">
        <table className="tbl">
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Source</th>
              <th>Read from</th>
              <th>Values</th>
              <th>Unmapped</th>
            </tr>
          </thead>
          <tbody>
            {dimensions.map(d => (
              <tr key={d.dimension}>
                <td style={{ fontWeight: 600 }}>{cap(d.dimension)}</td>
                <td><span className="bsrc b-form">form</span></td>
                <td className="dt">{d.heading}</td>
                <td>
                  <span className="chips">
                    {d.options.slice(0, 6).map(o => <Value key={o} value={o} d={d} />)}
                    {d.options.length > 6 && (
                      <span className="sub">+{d.options.length - 6}</span>
                    )}
                  </span>
                </td>
                <td>
                  {unmapped.get(d.dimension)
                    ? (
                      <button type="button" className="textlink"
                              title="Show the issues this heading did not parse in"
                              onClick={() => onExplain(d.dimension)}>
                        {unmapped.get(d.dimension)}
                      </button>
                    )
                    : <span style={{ color: 'var(--dk-faint)' }}>—</span>}
                </td>
              </tr>
            ))}
            {NATIVE.map(n => (
              <tr key={n.label}>
                <td style={{ fontWeight: 600 }}>{n.label}</td>
                <td><span className="bsrc b-native">native</span></td>
                <td className="dt">{n.read}</td>
                <td style={{ color: 'var(--dk-muted)' }}>{n.note}</td>
                <td style={{ color: 'var(--dk-faint)' }}>—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(data?.formErrors?.length ?? 0) > 0 && (
        <div style={{ padding: '12px 16px 0' }}>
          <div className="fl" style={{ marginBottom: 7 }}>Forms that would not parse</div>
          <div className="opt">
            {data!.formErrors.map(e => (
              <div key={e.file} className="fct" style={{ cursor: 'default' }}>
                <Ico name="warn" style={{ color: 'var(--dk-amber)', flexShrink: 0 }} />
                <code>{e.file}</code>
                <span className="sub">
                  {e.message}{e.line ? ` (line ${e.line})` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '12px 16px 4px' }}>
        <div className="fl" style={{ marginBottom: 7 }}>If a repository has none of this</div>
        <div className="opts" style={{ gridTemplateColumns: 'repeat(3, 1fr)', maxWidth: 'none' }}>
          <button type="button" className="opt" style={{ padding: '8px 10px',
                                                        textAlign: 'left', cursor: 'pointer' }}
                  onClick={onImport}>
            <div className="oh"><Ico name="repo" />Read another repository&rsquo;s forms</div>
            <div className="sub">
              There is no map to copy: the map <i>is</i> the repository&rsquo;s own forms, read
              fresh every time. Point dkgh at a repository whose templates you already like and
              it reads them.
            </div>
          </button>
          <button type="button" className="opt" style={{ padding: '8px 10px',
                                                        textAlign: 'left', cursor: 'pointer' }}
                  onClick={onImport}>
            <div className="oh"><Ico name="dl" />Import a zip, or some files</div>
            <div className="sub">
              What travels between repositories is the template file, not a mapping of it —
              one artefact instead of two that can disagree.
            </div>
          </button>
          <button type="button" className="opt pick" style={{ padding: '8px 10px',
                                                             textAlign: 'left',
                                                             cursor: 'pointer' }}
                  onClick={onImport}>
            <div className="oh"><Ico name="pen" style={{ color: 'var(--dk-gh)' }} />
              Generate a starter set
            </div>
            <div className="sub">
              dkgh writes the <code>.yml</code> and hands it to you. Committing it to{' '}
              <code>.github/</code> stays your call, and it is a separate button.
            </div>
          </button>
        </div>

        <GhNote title="Nothing here degrades into guessing" tone="warn"
                style={{ maxWidth: 'none', margin: '10px 0 0' }}>
          A repository with no forms and no Project does not offer Module, Environment or Type
          — those facets are absent rather than sitting there empty, and the board falls back to
          the GitHub dimensions, which always work. An issue whose body was hand-edited until
          the heading no longer parses is shown as <b>unmapped</b>, never as a value somebody
          might act on.
        </GhNote>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '14px 16px 20px' }}>
        <button type="button" className="btn go" onClick={onRefresh}>
          <Ico name="refresh" />Re-run discovery
        </button>
        <button type="button" className="btn" onClick={onChangeRepo}>Switch repository</button>
        <span className="sp" style={{ flex: 1 }} />
        <span className="sub" style={{ alignSelf: 'center' }}>
          {repo} · read {data ? new Date(data.fetchedAt).toLocaleTimeString() : 'never'}
        </span>
      </div>
    </div>
  );
}

/** One thing discovery looked for, and what it found. */
function Source({ icon, colour, title, badge, badgeClass, where, detail, ok, said, onClick }: {
  icon: IcoName;
  colour: string;
  title: string;
  badge: string;
  badgeClass: string;
  where: string;
  detail: string;
  ok: boolean;
  said: string;
  /** Set on the one card that leads somewhere — the labels are editable. */
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button type="button" className="srcc" style={{ textAlign: 'left', cursor: 'pointer' }}
              onClick={onClick}>
        <div className="sh">
          <Ico name={icon} style={{ color: colour }} />
          {title}
          <span className={`bsrc ${badgeClass}`}>{badge}</span>
        </div>
        <div className="sl">{where}</div>
        <div className="sl" style={{ color: 'var(--dk-muted)' }}>{detail}</div>
        <div className={ok ? 'stat-ok' : 'stat-warn'}>{said} — edit them</div>
      </button>
    );
  }
  return (
    <div className="srcc">
      <div className="sh">
        <Ico name={icon} style={{ color: colour }} />
        {title}
        <span className={`bsrc ${badgeClass}`}>{badge}</span>
      </div>
      <div className="sl">{where}</div>
      <div className="sl" style={{ color: 'var(--dk-muted)' }}>{detail}</div>
      <div className={ok ? 'stat-ok' : 'stat-warn'}>{said}</div>
    </div>
  );
}

/** A dimension's value, in the colour the board gives it. */
function Value({ value, d }: { value: string; d: ProposedDimension }) {
  const { className, style } = chipOf(value, d.options);
  return <span className={className} style={style}>{value}</span>;
}

/**
 * Whether the labels follow a `prefix:` convention.
 *
 * Worth saying because a repository that does is one where labels are already
 * a dimension in everything but name, and 19E is about using them as one.
 */
function prefixNote(meta?: RepoMeta): string {
  const labels = meta?.labels ?? [];
  if (labels.length === 0) return 'none read';
  const prefixed = labels.filter(l => /^[a-z0-9 _-]+:\s?\S/i.test(l.name));
  if (prefixed.length < 2) return 'no prefix: convention detected';
  const groups = new Set(prefixed.map(l => l.name.split(':')[0].trim().toLowerCase()));
  return `${prefixed.length} use a prefix: convention (${[...groups].slice(0, 3).join(', ')})`;
}
