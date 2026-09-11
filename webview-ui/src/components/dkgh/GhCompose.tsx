/**
 * Screen 10 — new issue: one box, and the metadata beside it.
 *
 * The markup is the mock's, class for class. `.compose` splits into `.left` and
 * `.right`; the left is an `.editor` holding exactly four things — the title
 * label, the `.titlein`, the "What went wrong" label, and the `.mdbar` +
 * `.mdbody` pair — above a `.dropzone` and a `.footbar`. The right is a
 * `.paneh` and nine `.msec` rows in GitHub's own sidebar order.
 *
 * **Four things in the left column, not eleven.** The template's own questions
 * are not fields here; the AI step asks them one at a time on screen 11, and
 * anything still unanswered is written as `_No response_`. A composer that
 * opened with eleven boxes would be the form this tab exists to replace.
 *
 * **Module and Environment are amber, not red.** They are required by the
 * repository's template, and saying so up front is more useful than a
 * validation error at the end — but they are also exactly what the next screen
 * is about to fill in, so shouting about them would be premature.
 */
import { useEffect, useMemo, useState } from 'react';
import { SplitPanelView } from '@salilvnair/dui';
import { Ico } from './GhIcons';
import { GhClose } from './GhClose';
import { GhUpload } from './GhUpload';
import { GhGenerate, aiFailed } from './GhGenerate';
import { GhMarkdown } from './GhMarkdown';
import {
  discardDraft, draftNote, hasContent, loadDraft, proposeTemplate, saveDraft,
  type Draft, type FormField, type IssueForm,
} from './composer-model';
import type { BoardIssue } from './board-types';
import type { RepoMeta } from './types';

/**
 * The sidebar, in GitHub's own order.
 *
 * Fixed, because muscle memory is worth more than novelty here — the row is in
 * the same place whether or not this repository has anything to put in it.
 * `match` finds the template field that fills a row, when there is one.
 */
const SIDEBAR: {
  key: string;
  label: string;
  icon: 'chev' | 'cal' | 'milestone';
  match?: RegExp;
  /** A Project field. Named, and greyed, rather than left out. */
  project?: boolean;
}[] = [
  { key: 'assignees', label: 'Assignees', icon: 'chev' },
  { key: 'labels', label: 'Labels', icon: 'chev' },
  { key: 'type', label: 'Type', icon: 'chev', match: /type/i },
  { key: 'priority', label: 'Priority', icon: 'chev', match: /priority|severity/i, project: true },
  { key: 'module', label: 'Module', icon: 'chev', match: /module|screen|area|component/i },
  { key: 'environment', label: 'Environment', icon: 'chev', match: /environment|env/i },
  { key: 'project', label: 'Project', icon: 'chev', project: true },
  { key: 'dates', label: 'Dates', icon: 'cal', project: true },
  { key: 'milestone', label: 'Milestone', icon: 'milestone' },
];

export function GhCompose({
  repo, forms, noTemplates, meta, me, draft, onDraft, onReview,
}: {
  repo: string;
  forms: IssueForm[];
  noTemplates: boolean;
  meta?: RepoMeta;
  /** Whoever is signed in, so `assign yourself` has somebody to assign. */
  me?: string;
  /** Held by the tab, so leaving for the board and coming back keeps it. */
  draft: Draft;
  onDraft: (next: Draft) => void;
  onReview: () => void;
}) {
  const [restored, setRestored] = useState<Draft | undefined>();
  const [open, setOpen] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  /** Screen 11 — open while the AI composer is being used. */
  const [generating, setGenerating] = useState(false);

  /*
    A draft left behind is offered, never silently reopened. Somebody who came
    here to file something else should not find last week's half-written issue
    already in the box.
  */
  useEffect(() => {
    if (hasContent(draft)) return;
    setRestored(loadDraft(repo));
  }, [repo]);

  const patch = (change: Partial<Draft>) => onDraft({ ...draft, ...change });

  const ranked = useMemo(
    () => proposeTemplate(forms, `${draft.title} ${draft.description}`),
    [forms, draft.title, draft.description],
  );
  const form = forms.find(f => f.file === draft.templateFile) ?? ranked[0]?.form;

  const fieldFor = (match?: RegExp): FormField | undefined => match
    ? form?.fields.find(f => f.type !== 'markdown' && match.test(f.label))
    : undefined;

  return (
    /*
      The metadata column is draggable for the same reason the board's facet
      rail is: a fixed 238px is right until somebody's label is 240px long.
    */
    <SplitPanelView
      className="compose"
      direction="horizontal"
      defaultSplit={72}
      minFirstPct={45}
      minSecondPct={16}
      accentColor="var(--dk-gh)"
      first={
      <div className="left">
        <div className="editor">

          {restored && (
            <div className="note" style={{ margin: 0 }}>
              <Ico name="warn" />
              <div>
                You left a draft here — <b>{restored.title.trim() || 'untitled'}</b>.{' '}
                {draftNote(restored)}
                <span className="actions" style={{ marginTop: 7, justifyContent: 'flex-start' }}>
                  <button type="button" className="btn go"
                          onClick={() => { onDraft(restored); setRestored(undefined); }}>
                    Pick it back up
                  </button>
                  <button type="button" className="btn"
                          onClick={() => { discardDraft(repo); setRestored(undefined); }}>
                    Discard it
                  </button>
                </span>
              </div>
            </div>
          )}

          <div className="lbl-s">Title <span className="req">*</span></div>
          <input
            className="titlein"
            value={draft.title}
            onChange={e => patch({ title: e.target.value })}
            placeholder="One line, as you would say it out loud"
          />

          <div className="lbl-s">What went wrong</div>
          <div>
            <GhMarkdown
              value={draft.description}
              onChange={description => patch({ description })}
              placeholder="Describe it in a sentence. You can write the whole thing here."
            />
          </div>

          <Dropzone draft={draft} onChange={patch} />

          {/* Screen 12 — the images are local until this says otherwise. */}
          <GhUpload repo={repo} draft={draft} onDraft={patch} />

          {/* Screen 11 — the template's own fields, and what you left out. */}
          {generating && (
            <GhGenerate
              repo={repo}
              form={forms.find(f => f.file === draft.templateFile) ?? forms[0]}
              draft={draft}
              onDraft={patch}
              onClose={() => setGenerating(false)}
            />
          )}

          {noTemplates && <NoTemplates />}
        </div>

        <div className="footbar">
          {/*
            The button carries the last failure.

            The panel is a disclosure, so it spends most of its life shut — and
            a model that could not be reached is exactly the thing somebody
            needs to know while it is. Otherwise the audit knows and nobody
            else does.
          */}
          <button
            type="button"
            className={`btn ai${generating ? ' go' : ''}`}
            title={aiFailed()
              ? aiFailed()
              : "Reads this repository's own form fields and asks about what you left out"}
            style={aiFailed() && !generating
              ? { borderColor: 'color-mix(in srgb, var(--dk-amber) 55%, transparent)',
                  color: 'var(--dk-amber)' }
              : undefined}
            onClick={() => setGenerating(g => !g)}
          >
            <Ico name={aiFailed() && !generating ? 'warn' : 'ai'} />Generate with AI
            {aiFailed() && !generating && <span className="chip c-stale">failed</span>}
          </button>
          <span className="sp" />
          <button
            type="button"
            className="btn"
            onClick={() => {
              saveDraft(draft);
              setSaved(true);
              window.setTimeout(() => setSaved(false), 1600);
            }}
          >
            {saved ? 'Saved' : 'Save draft'}
          </button>
          <button type="button" className="btn go" disabled={!draft.title.trim()}
                  onClick={onReview}>
            Review and create
          </button>
        </div>
      </div>
      }
      second={
      <div className="right">
        <div className="paneh"><Ico name="tag" />Metadata</div>

        {SIDEBAR.map((row, at) => {
          const field = fieldFor(row.match);
          const last = at === SIDEBAR.length - 1;
          const isOpen = open === row.key;
          const toggle = () => setOpen(o => (o === row.key ? undefined : row.key));

          if (row.key === 'assignees') {
            return (
              <Msec key={row.key} row={row} last={last} open={isOpen} onToggle={toggle}
                    value={draft.assignees.length
                      ? <div className="val set">{draft.assignees.join(', ')}</div>
                      : <div className="val">
                          No one{me && <>
                            {' — '}
                            {/*
                              The commonest assignment there is, and it was a
                              blue word that did nothing. It is a button now, and
                              it opens the section as well as filling it, so the
                              change is visible where the change happened rather
                              than only in this line.
                            */}
                            <button
                              type="button"
                              className="textlink"
                              onClick={e => {
                                e.stopPropagation();
                                patch({ assignees: [...draft.assignees, me] });
                                setOpen('assignees');
                              }}
                            >
                              assign yourself
                            </button>
                          </>}
                        </div>}>
                <Picks options={meta?.assignees ?? []} chosen={draft.assignees}
                       empty="Nobody on this repository can be assigned from here."
                       onPick={v => patch({
                         assignees: draft.assignees.includes(v)
                           ? draft.assignees.filter(a => a !== v)
                           : [...draft.assignees, v],
                       })} />
              </Msec>
            );
          }

          if (row.key === 'labels') {
            const all = [...new Set([...(form?.labels ?? []), ...draft.labels])];
            return (
              <Msec key={row.key} row={row} last={last} open={isOpen} onToggle={toggle}
                    value={all.length
                      ? <div className="val set">
                          {all.map(l => (
                            <span key={l} className="lbldot">
                              <b style={{ background: hexOf(l, meta) }} />{l}
                            </span>
                          ))}
                        </div>
                      : <div className="val">None</div>}>
                <Picks options={(meta?.labels ?? []).map(l => l.name)} chosen={draft.labels}
                       empty="This repository has no labels."
                       swatch={v => {
                         const found = meta?.labels.find(l => l.name === v);
                         return found ? `#${found.color}` : undefined;
                       }}
                       note={form?.labels.length
                         ? `${form.labels.join(', ')} — added by the template itself`
                         : undefined}
                       onPick={v => patch({
                         labels: draft.labels.includes(v)
                           ? draft.labels.filter(l => l !== v)
                           : [...draft.labels, v],
                       })} />
              </Msec>
            );
          }

          if (row.key === 'milestone') {
            return (
              <Msec key={row.key} row={row} last={last} open={isOpen} onToggle={toggle}
                    value={draft.milestone
                      ? <div className="val set">{draft.milestone}</div>
                      : <div className="val">No milestone</div>}>
                <Picks options={(meta?.milestones ?? []).map(m => m.title)}
                       chosen={draft.milestone ? [draft.milestone] : []}
                       empty="This repository has no open milestones."
                       onPick={v => patch({
                         milestone: draft.milestone === v ? undefined : v,
                       })} />
              </Msec>
            );
          }

          if (row.key === 'dates') {
            /*
              Start and ETA are Project fields, not issue fields — GitHub keeps
              them on the item's row in a Project, and dkgh has not asked for
              the project scope. So the row says so, in the same words Priority
              and Project use, rather than showing two dashes and letting
              somebody work out for themselves why nothing happens when they
              press it. See screen 02B for the scope this is waiting on.
            */
            return (
              <Msec key={row.key} row={row} last={last}
                    value={
                      <div className="val">
                        Start — · ETA —
                        <span style={{ color: 'var(--dk-faint)' }}>
                          · needs the project scope
                        </span>
                      </div>
                    } />
            );
          }

          if (row.key === 'project' || (row.project && !field)) {
            /* Named and greyed rather than left out — somebody who wanted a
               priority has to see it will not be written before pressing
               anything, not find the gap later on the board. */
            return (
              <Msec key={row.key} row={row} last={last}
                    value={<div className="val">Needs the project scope</div>} />
            );
          }

          if (!field) {
            return (
              <Msec key={row.key} row={row} last={last}
                    value={<div className="val">Not in this repository’s template</div>} />
            );
          }

          const value = draft.answers[field.label] ?? '';
          const amber = !value && field.required;
          return (
            <Msec
              key={row.key}
              row={row}
              last={last}
              open={isOpen}
              onToggle={toggle}
              value={value
                ? <div className="val set">{value}</div>
                : (
                  <div className="val" style={amber ? { color: 'var(--dk-amber)' } : undefined}>
                    {amber ? 'Required by the template' : 'Not set'}
                  </div>
                )}
            >
              {field.options.length > 0 ? (
                <Picks options={field.options} chosen={value ? [value] : []}
                       empty="The template declared no values for this one."
                       onPick={v => patch({
                         answers: { ...draft.answers, [field.label]: value === v ? '' : v },
                       })} />
              ) : (
                <textarea
                  className="mdbody"
                  style={{ minHeight: 52, borderRadius: 7, marginTop: 6 }}
                  value={value}
                  onChange={e => patch({
                    answers: { ...draft.answers, [field.label]: e.target.value },
                  })}
                />
              )}
            </Msec>
          );
        })}
      </div>
      }
    />
  );
}

/** One `.msec` — the heading with its chevron, the value, and what it opens. */
function Msec({ row, value, open, onToggle, last, children }: {
  row: { label: string; icon: 'chev' | 'cal' | 'milestone' };
  value: React.ReactNode;
  open?: boolean;
  onToggle?: () => void;
  last?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="msec" style={last ? { borderBottom: 0 } : undefined}>
      {onToggle ? (
        <button type="button" className="mh" style={{ width: '100%' }} onClick={onToggle}>
          {row.label}{' '}
          <Ico name={row.icon} style={open ? { transform: 'rotate(180deg)' } : undefined} />
        </button>
      ) : (
        <div className="mh">{row.label} <Ico name={row.icon} /></div>
      )}
      {value}
      {open && children}
    </div>
  );
}

/** The list a `.msec` opens — `.fct` rows, the mock's own tickable value. */
function Picks({ options, chosen, empty, note, swatch, onPick }: {
  options: string[];
  chosen: string[];
  empty: string;
  note?: string;
  /**
   * The dot beside a row, in that value's own colour.
   *
   * A list of nine labels with nine identical grey checkboxes is a list you
   * read; the same list with each label's own colour beside it is one you
   * recognise. The mock already has `.sw` for exactly this — the filter rail
   * uses it — and the picker is the same kind of list.
   */
  swatch?: (value: string) => string | undefined;
  onPick: (value: string) => void;
}) {
  return (
    <div style={{ margin: '6px -6px 0' }}>
      {options.length === 0 ? (
        <div className="val" style={{ padding: '0 12px' }}>{empty}</div>
      ) : options.map(o => {
        const dot = swatch?.(o);
        return (
          <button key={o} type="button"
                  className={`fct${chosen.includes(o) ? ' on' : ''}`}
                  style={{ width: '100%' }}
                  onClick={() => onPick(o)}>
            <span className="bx">{chosen.includes(o) && <Ico name="check" />}</span>
            {dot && <span className="sw" style={{ background: dot }} />}
            {o}
          </button>
        );
      })}
      {note && <div className="val" style={{ padding: '5px 12px 0' }}>{note}</div>}
    </div>
  );
}

/**
 * The paste target.
 *
 * `paste` reads `ClipboardEvent.clipboardData.files`, which is where Windows'
 * Snipping Tool and macOS' Cmd+Shift+4 both put a real PNG — so this works with
 * no helper, and the image appears immediately.
 *
 * What it cannot do yet is upload: that needs somewhere on GitHub to put the
 * file, which is screen 12. Until then a pasted image is held in the draft and
 * carries the mock's own *uploading* mark, and a URL from any GitHub comment
 * works today.
 */
function Dropzone({ draft, onChange }: {
  draft: Draft;
  onChange: (change: Partial<Draft>) => void;
}) {
  const [hot, setHot] = useState(false);
  const [typing, setTyping] = useState(false);
  const [url, setUrl] = useState('');

  const add = (v: string) => {
    const clean = v.trim();
    if (clean) onChange({ evidence: [...draft.evidence, clean] });
  };

  const takeFiles = (files: FileList | null | undefined) => {
    for (const file of Array.from(files ?? [])) {
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = () => add(String(reader.result));
      reader.readAsDataURL(file);
    }
  };

  return (
    <>
      {draft.evidence.length > 0 && (
        <div className="gallery">
          {draft.evidence.map(u => (
            <div key={u} style={{ position: 'relative' }}>
              <div
                className="shot"
                title={u.startsWith('data:')
                  ? 'Still on this machine — upload it below, or file without it'
                  : u}
                style={u.startsWith('data:')
                  ? { backgroundImage: `url(${u})`, backgroundSize: 'cover' }
                  : undefined}
              />
              {/* Not "uploading" — nothing is, and will not be until somebody
                  presses the button below. See GhUpload. */}
              {u.startsWith('data:') && <span className="chip c-stale">local</span>}
              <span style={{ position: 'absolute', top: 3, right: 3 }}>
                <GhClose
                  size={20}
                  title="Take this screenshot off"
                  onClick={() => onChange({ evidence: draft.evidence.filter(x => x !== u) })}
                />
              </span>
            </div>
          ))}
        </div>
      )}
      {typing ? (
        <div className="dropzone hot">
          <Ico name="clip" />
          <input
            autoFocus
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); add(url); setUrl(''); setTyping(false); }
              if (e.key === 'Escape') { setUrl(''); setTyping(false); }
            }}
            onBlur={() => { add(url); setUrl(''); setTyping(false); }}
            placeholder="The URL of a screenshot already on GitHub"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--dk-text)', font: 'inherit',
            }}
          />
        </div>
      ) : (
        <div
          className={`dropzone${hot ? ' hot' : ''}`}
          style={{ cursor: 'pointer' }}
          tabIndex={0}
          onClick={() => setTyping(true)}
          onPaste={e => takeFiles(e.clipboardData?.files)}
          onDragOver={e => { e.preventDefault(); setHot(true); }}
          onDragLeave={() => setHot(false)}
          onDrop={e => { e.preventDefault(); setHot(false); takeFiles(e.dataTransfer?.files); }}
        >
          <Ico name="clip" />
          Paste, drop, or click to add a screenshot — Ctrl+V works straight from Snipping Tool
        </div>
      )}
    </>
  );
}

/**
 * Most repositories have no issue forms.
 *
 * Degrading honestly means saying exactly what is absent rather than showing
 * empty dropdowns, and the three that survive are enough that the composer
 * still beats a browser tab.
 */
function NoTemplates() {
  const rows: [boolean, string][] = [
    [false, 'No Module, Environment or Type — there is no form declaring them.'],
    [false, 'The board cannot group by anything this repository invented.'],
    [true, 'Labels, assignees and milestones still work — they are GitHub’s own.'],
    [true, 'The editor, the draft and the screenshot paste are unchanged.'],
    [true, 'The exact command is still shown before anything is filed.'],
  ];
  return (
    <div className="note" style={{ margin: 0 }}>
      <Ico name="warn" />
      <div>
        <b>This repository has no issue forms.</b>
        {rows.map(([ok, text]) => (
          <div key={text} className={`why-row ${ok ? 'pass' : 'fail'}`}>
            <span className="mark">{ok ? '✓' : '×'}</span>
            <div>{text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A label's own hex from GitHub — the one the reporter already recognises. */
function hexOf(name: string, meta?: RepoMeta): string {
  const found = meta?.labels.find(l => l.name === name);
  return found ? `#${found.color}` : 'var(--dk-muted)';
}
