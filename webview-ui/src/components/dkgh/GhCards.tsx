/**
 * Screen 04 — the cards, and the group headers above them.
 *
 * A card rather than a row, because a screenshot in the list is worth more than
 * any three fields beside it: it is how a reader recognises the bug they
 * already know about.
 *
 * Every element on a card earns its place by answering a question somebody asks
 * while scanning, and every one of them can be switched off — except the title,
 * which is never truncated. A card whose title ends in an ellipsis makes you
 * open it to find out whether you cared, which is the one thing a board exists
 * to save you. Compact and dense tighten the padding and drop the evidence
 * strip; they never cut the sentence.
 *
 * The group header carries the summary you would otherwise count by eye: how
 * big, how bad, how long it has been true.
 */
import {
  AvatarView, BadgeChipView, CheckboxView, GroupHeaderView, IssueCardView,
} from '@salilvnair/dui';
import { GhEvidence } from './GhEvidence';
import { QUIET_DAYS, rankOf, type BoardIssue, type Group, type ProposedDimension } from './board-types';
import type { CardField, Density } from './board-prefs';
import { ACCENT } from './types';

/** How tall the evidence strip is, by how much room the density leaves for it. */
const SHOT_HEIGHT: Record<Density, number> = { comfortable: 74, compact: 0, dense: 0 };

export function GhCards({
  groups, showGroups, fields, density, dimensions,
  selected, onToggle, onOpen, cursor,
}: {
  groups: Group[];
  showGroups: boolean;
  fields: CardField[];
  density: Density;
  dimensions: ProposedDimension[];
  selected: Set<number>;
  /** Ctrl adds, Shift extends — the caller owns the range, the card reports the click. */
  onToggle: (issue: BoardIssue, mods: { ctrl: boolean; shift: boolean }) => void;
  onOpen: (issue: BoardIssue) => void;
  /** The card the keyboard is on, if any. */
  cursor?: number;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 17 }}>
      {groups.map(g => (
        <div key={g.key}>
          {showGroups && <Header group={g} dimensions={dimensions} />}
          <div className="grid gap-2"
               style={{
                 gridTemplateColumns: density === 'comfortable'
                   ? 'repeat(auto-fill, minmax(250px, 1fr))'
                   : 'repeat(auto-fill, minmax(200px, 1fr))',
               }}>
            {g.issues.map(i => (
              <Card
                key={i.number}
                issue={i}
                fields={fields}
                density={density}
                selected={selected.has(i.number)}
                anySelected={selected.size > 0}
                cursor={cursor === i.number}
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
 * The three summaries a group header carries.
 *
 * Count says how big, the worst value along the priority-like dimension says
 * how bad, and the oldest quiet time says how long it has been true. Chosen
 * because those are the three things a lead would otherwise count by eye
 * before deciding whether this group is today's problem.
 */
export function Header({ group, dimensions }: { group: Group; dimensions: ProposedDimension[] }) {
  const worstQuiet = Math.max(...group.issues.map(i => i.quietDays), 0);
  const oldest = Math.max(...group.issues.map(i => i.ageDays), 0);

  /*
    "Worst" only means anything for a field whose values are ordered, and the
    only ordering that exists is the one the form declared. A dimension with no
    declared options has no worst value, so the header does not invent one.
  */
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
    <GroupHeaderView
      name={group.label}
      count={group.issues.length}
      tone={group.unowned ? 'var(--color-warning)' : undefined}
      summary={
        <span className="flex items-center gap-1.5">
          {worst && (
            <BadgeChipView tone={ACCENT} size="xs">{worstCount} {worst.toLowerCase()}</BadgeChipView>
          )}
          {worstQuiet >= QUIET_DAYS
            ? <BadgeChipView tone="var(--color-warning)" size="xs">
                oldest quiet {worstQuiet}d
              </BadgeChipView>
            : <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>
                oldest {oldest}d
              </span>}
        </span>
      }
      style={{ marginBottom: 8 }}
    />
  );
}

function Card({ issue, fields, density, selected, anySelected, cursor, onToggle, onOpen }: {
  issue: BoardIssue;
  fields: CardField[];
  density: Density;
  selected: boolean;
  anySelected: boolean;
  cursor: boolean;
  onToggle: (issue: BoardIssue, mods: { ctrl: boolean; shift: boolean }) => void;
  onOpen: (issue: BoardIssue) => void;
}) {
  const on = (f: CardField) => fields.includes(f);
  const quiet = issue.quietDays >= QUIET_DAYS;
  const who = issue.assignees[0];
  const shotHeight = SHOT_HEIGHT[density];
  const shot = on('evidence') && shotHeight > 0 ? issue.evidence[0] : undefined;

  /*
    One click handler for the whole card, on a wrapper rather than on the card
    component, because the decision needs the modifier keys and a card's own
    onClick has no event to read them from.

    Once anything is selected, a plain click extends the selection rather than
    opening an issue. Triage is a bulk activity, and a board where the fourth
    click of a selection navigates away is a board that loses the first three.
  */
  const click = (e: React.MouseEvent) => {
    const mods = { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey };
    if (anySelected || mods.ctrl || mods.shift) { onToggle(issue, mods); return; }
    onOpen(issue);
  };

  return (
    <div
      onClick={click}
      data-issue={issue.number}
      style={{ cursor: 'pointer', position: 'relative' }}
      title={anySelected ? 'Click to add to the selection' : 'Click to open · hold Space to peek'}
    >
      <IssueCardView
        reference={on('number') ? `#${issue.number}` : undefined}
        title={issue.title}
        accentColor={ACCENT}
        selected={selected || cursor}
        style={{
          outline: cursor ? `1px solid ${ACCENT}` : undefined,
          outlineOffset: cursor ? 1 : undefined,
          padding: density === 'comfortable' ? undefined
            : density === 'compact' ? '6px 8px' : '4px 7px',
          gap: density === 'comfortable' ? undefined : 4,
        }}
        chips={
          <span className="flex gap-[5px] flex-wrap items-center">
            {/* The select box, shown once anything is selected — a checkbox on
                every card of an untouched board is chrome nobody asked for. */}
            {(anySelected || selected) && (
              <CheckboxView
                checked={selected}
                onChange={() => onToggle(issue, { ctrl: true, shift: false })}
                accentColor={ACCENT}
                size="sm"
              />
            )}
            {on('chips') && Object.entries(issue.dimensions)
              .filter(([k]) => on('module') || k !== 'module')
              .map(([k, v]) => (
                <BadgeChipView key={k} tone={ACCENT} size="xs">{v}</BadgeChipView>
              ))}
            {on('labels') && issue.labels.slice(0, 2).map(l => (
              <BadgeChipView key={l.name} tone={`#${l.color}`} size="xs">{l.name}</BadgeChipView>
            ))}
            {on('milestone') && issue.milestone && (
              <BadgeChipView tone="var(--color-text-muted)" size="xs">{issue.milestone}</BadgeChipView>
            )}
          </span>
        }
        media={shot || (on('body') && issue.bodyFirstLine) ? (
          <>
            {shot && (
              <GhEvidence url={shot} height={shotHeight} alt={`Evidence on #${issue.number}`} />
            )}
            {on('body') && issue.bodyFirstLine && (
              <span className="block text-[10px]"
                    style={{ color: 'var(--color-text-muted)', lineHeight: 1.5,
                             marginTop: shot ? 4 : 0 }}>
                {issue.bodyFirstLine}
              </span>
            )}
          </>
        ) : undefined}
        owner={on('assignee')
          ? (who
              ? <span title={who}><AvatarView name={who} size="xs" /></span>
              : <span style={{ color: 'var(--color-warning)' }}>unassigned</span>)
          : undefined}
        meta={
          <span className="flex items-center gap-[7px]">
            {on('age') && (quiet
              ? <BadgeChipView tone="var(--color-warning)" size="xs">
                  stale {issue.quietDays}d
                </BadgeChipView>
              : <span>{issue.ageDays}d</span>)}
            {on('comments') && issue.commentCount > 0 && (
              <span>{issue.commentCount} comment{issue.commentCount === 1 ? '' : 's'}</span>
            )}
            {on('evidence') && shotHeight === 0 && issue.evidence.length > 0 && (
              <BadgeChipView tone={ACCENT} size="xs">
                {issue.evidence.length} shot{issue.evidence.length === 1 ? '' : 's'}
              </BadgeChipView>
            )}
          </span>
        }
      />
    </div>
  );
}
