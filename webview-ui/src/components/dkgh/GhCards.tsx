/**
 * Screen 04 — the cards, and the group headers above them.
 *
 * The markup is the mock's: `.groups` of `.group`, each a `.gh` header over a
 * `.cards` grid of `.card`, and each card the same four rows — the number and
 * its chips, the title, the evidence strip, the footer.
 *
 * A card rather than a row, because a screenshot in the list is worth more than
 * any three fields beside it: it is how a reader recognises the bug they already
 * know about.
 *
 * **The title is never truncated.** A card whose title ends in an ellipsis makes
 * you open it to find out whether you cared, which is the one thing a board
 * exists to save you.
 */
import { Ico } from './GhIcons';
import { GhAvatar } from './GhAvatar';
import { GhEvidence } from './GhEvidence';
import {
  QUIET_DAYS, rankOf, type BoardIssue, type Group, type ProposedDimension,
} from './board-types';
import type { SearchHit } from './filter-model';
import { colourOf } from './field-colour';
import type { CardField, Density } from './board-prefs';

/**
 * The chip class for a value.
 *
 * The mock names these directly — UI is blue, API cyan, Backend pink, Excel
 * green, PROD red, DEV grey — and those are the semantic overrides the plan
 * describes, written as classes. Anything the mock did not name falls back to
 * the field map's own colour, by the value's index in its own dropdown.
 */
const CHIP_CLASS: [RegExp, string][] = [
  [/^(ui|front|frontend)$/i, 'c-ui'],
  [/^api$/i, 'c-api'],
  [/^(backend|be|server)$/i, 'c-be'],
  [/^(excel|xl|excel processing|reporting)$/i, 'c-xl'],
  [/^prod(uction)?$/i, 'c-prod'],
  [/^(dev|development|staging|stage|local|test)$/i, 'c-dev'],
];

export function chipOf(value: string, options?: string[]): {
  className: string;
  style?: React.CSSProperties;
} {
  for (const [match, cls] of CHIP_CLASS) {
    if (match.test(value.trim())) return { className: `chip ${cls}` };
  }
  const colour = colourOf(value, options);
  return {
    className: 'chip',
    style: {
      color: colour,
      borderColor: `color-mix(in srgb, ${colour} 45%, transparent)`,
      background: `color-mix(in srgb, ${colour} 13%, transparent)`,
    },
  };
}

/** The mock's five avatar tints, picked from the name so one person keeps one. */
const AV = ['s', 'r', 'm', 'k', 't'];

export function avClass(login: string): string {
  let sum = 0;
  for (const ch of login) sum = (sum + ch.charCodeAt(0)) % 997;
  return `av av-${AV[sum % AV.length]}`;
}

/** `pr-urgent` … `pr-low`, from where the value sits in its own declared scale. */
export function prClass(value: string, options?: string[]): string {
  if (!options || options.length === 0) return 'pr';
  const at = rankOf(value, options);
  if (at >= options.length) return 'pr';
  const step = Math.floor((at / Math.max(1, options.length - 1)) * 3);
  return `pr ${['pr-urgent', 'pr-high', 'pr-med', 'pr-low'][Math.min(3, step)]}`;
}

export function GhCards({
  groups, showGroups, fields, density, dimensions,
  selected, onToggle, onOpen, cursor, hits,
}: {
  groups: Group[];
  showGroups: boolean;
  fields: CardField[];
  density: Density;
  dimensions: ProposedDimension[];
  selected: Set<number>;
  onToggle: (issue: BoardIssue, mods: { ctrl: boolean; shift: boolean }) => void;
  onOpen: (issue: BoardIssue) => void;
  cursor?: number;
  hits?: Map<number, SearchHit>;
}) {
  return (
    <div className="groups">
      {groups.map(g => (
        <div className="group" key={g.key}>
          {showGroups && <Header group={g} dimensions={dimensions} />}
          <div className="cards">
            {g.issues.map(i => (
              <Card
                key={i.number}
                issue={i}
                fields={fields}
                density={density}
                dimensions={dimensions}
                selected={selected.has(i.number)}
                anySelected={selected.size > 0}
                cursor={cursor === i.number}
                hit={hits?.get(i.number)}
                onToggle={onToggle}
                onOpen={onOpen}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The group header — name, count, rule, and the summaries worth carrying.
 *
 * The rule between the count and the summaries is what puts every summary in
 * the same place, so a column of headers can be read straight down.
 */
export function Header({ group, dimensions }: {
  group: Group;
  dimensions: ProposedDimension[];
}) {
  const worstQuiet = Math.max(...group.issues.map(i => i.quietDays), 0);
  const ranked = dimensions.find(d => /priority|severity|impact/i.test(d.dimension));
  const worst = ranked
    ? group.issues
        .map(i => i.dimensions[ranked.dimension])
        .filter(Boolean)
        .sort((a, b) => rankOf(a, ranked.options) - rankOf(b, ranked.options))[0]
    : undefined;
  const worstCount = worst
    ? group.issues.filter(i => i.dimensions[ranked!.dimension] === worst).length
    : 0;

  return (
    <div className="gh">
      <span className="name" style={group.unowned ? { color: 'var(--dk-amber)' } : undefined}>
        {group.label}
      </span>
      <span className="n">{group.issues.length}</span>
      <span className="rule" />
      {worst && (
        <span className={prClass(worst, ranked?.options)}>
          <b />{worstCount} {worst.toLowerCase()}
        </span>
      )}
      {worstQuiet >= QUIET_DAYS && (
        <span className="chip c-stale">oldest quiet {worstQuiet}d</span>
      )}
    </div>
  );
}

function Card({
  issue, fields, density, dimensions, selected, anySelected, cursor, hit, onToggle, onOpen,
}: {
  issue: BoardIssue;
  fields: CardField[];
  density: Density;
  dimensions: ProposedDimension[];
  selected: boolean;
  anySelected: boolean;
  cursor: boolean;
  hit?: SearchHit;
  onToggle: (issue: BoardIssue, mods: { ctrl: boolean; shift: boolean }) => void;
  onOpen: (issue: BoardIssue) => void;
}) {
  const on = (f: CardField) => fields.includes(f);
  const quiet = issue.quietDays >= QUIET_DAYS;
  const who = issue.assignees[0];
  /* Compact and dense drop the evidence strip, as the mock has it — they
     tighten the padding, never the sentence. */
  const shot = on('evidence') && density === 'comfortable' ? issue.evidence[0] : undefined;

  const ranked = dimensions.find(d => /priority|severity|impact/i.test(d.dimension));
  const priority = ranked ? issue.dimensions[ranked.dimension] : undefined;
  const optionsOf = (key: string) => dimensions.find(d => d.dimension === key)?.options;

  const click = (e: React.MouseEvent) => {
    const mods = { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey };
    /* Once anything is selected a plain click extends the selection rather than
       opening an issue — triage is a bulk activity, and a board whose fourth
       click navigates away has lost the first three. */
    if (anySelected || mods.ctrl || mods.shift) { onToggle(issue, mods); return; }
    onOpen(issue);
  };

  return (
    <div
      className={`card${selected ? ' picked' : ''}`}
      data-issue={issue.number}
      onClick={click}
      style={{
        cursor: 'pointer',
        ...(cursor ? { outline: '1px solid var(--dk-gh)' } : {}),
        ...(density === 'compact' ? { padding: '6px 8px', gap: 4 } : {}),
        ...(density === 'dense' ? { padding: '4px 7px', gap: 3 } : {}),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {(anySelected || selected) && (
          <span
            className={`sel${selected ? ' on' : ''}`}
            onClick={e => { e.stopPropagation(); onToggle(issue, { ctrl: true, shift: false }); }}
          >
            {selected && <Ico name="check" />}
          </span>
        )}
        {on('number') && <span className="num">#{issue.number}</span>}
        {on('chips') && (
          <span className="chips">
            {Object.entries(issue.dimensions)
              .filter(([k]) => on('module') || !/module|screen|area/i.test(k))
              .map(([k, v]) => {
                const c = chipOf(v, optionsOf(k));
                return <span key={k} className={c.className} style={c.style}>{v}</span>;
              })}
            {on('labels') && issue.labels.slice(0, 2).map(l => (
              <span
                key={l.name}
                className="chip"
                style={{
                  color: `#${l.color}`,
                  borderColor: `color-mix(in srgb, #${l.color} 45%, transparent)`,
                  background: `color-mix(in srgb, #${l.color} 13%, transparent)`,
                }}
              >
                {l.name}
              </span>
            ))}
          </span>
        )}
      </div>

      <div className="title">{issue.title}</div>

      {shot && <GhEvidence url={shot} height={54} alt={`Evidence on #${issue.number}`} />}

      {/* Where the search matched — a hit in an old comment and a hit in the
          title are different kinds of answer. */}
      {hit && hit.where !== 'title' && (
        <div style={{ fontSize: 9.5, color: 'var(--dk-faint)', lineHeight: 1.5 }}>
          <span style={{ color: 'var(--dk-gh)' }}>in the {hit.where}</span> — {hit.snippet}
        </div>
      )}

      {!hit && on('body') && issue.bodyFirstLine && (
        <div style={{ fontSize: 10, color: 'var(--dk-faint)', lineHeight: 1.5 }}>
          {issue.bodyFirstLine}
        </div>
      )}

      <div className="foot">
        {on('assignee') && (who
          ? <GhAvatar who={who} className={avClass(who)} />
          : <span style={{ color: 'var(--dk-amber)' }}>unassigned</span>)}
        {on('priority') && priority && (
          <span className={prClass(priority, ranked?.options)}><b />{priority}</span>
        )}
        <span className="sp" />
        {on('age') && (quiet
          ? <span className="chip c-stale">stale {issue.quietDays}d</span>
          : <span>{issue.ageDays}d</span>)}
        {on('comments') && issue.commentCount > 0 && (
          <span>{issue.commentCount} comment{issue.commentCount === 1 ? '' : 's'}</span>
        )}
        {on('evidence') && !shot && issue.evidence.length > 0 && (
          <span className="chip c-gh">
            {issue.evidence.length} shot{issue.evidence.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>
  );
}
