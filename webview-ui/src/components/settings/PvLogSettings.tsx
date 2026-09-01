/**
 * Archived logs on a mounted volume.
 *
 * The page is built around one idea: never configure a path blind. The probe
 * runs against what is in the boxes right now — not what was saved — and
 * shows the directories it found and a handful of real file paths, so a
 * template can be checked by eye before any search depends on it.
 *
 * Without that, a wrong path and an empty archive produce the same result: no
 * matches, and no way to tell which one you are looking at.
 */
import { useEffect, useState } from 'react';
import {
  layoutList, isDefaultLayouts, layoutIdFor, type PvLayout,
} from '@daakia/pv-layouts';
import { ButtonView, TextInputView, CheckboxView, SpinnerIcon } from '@salilvnair/dui';
import { Hint, Lit, Why } from './prose';
import {
  FolderOpenIcon, WarningTriangleIcon, CheckCircleIcon, TrashIcon, PlusIcon, PencilIcon,
  CheckIcon,
} from '../../icons';
import { useDk8sPvStore } from '../../store/dk8s-pv-store';

const ACCENT = 'var(--color-dk8s)';

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function when(ms?: number): string {
  if (!ms) return '—';
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * Rows of `match → value`.
 *
 * Pairs rather than an object while editing, because a half-typed key is a
 * real state and an object would drop the row the moment the key went blank.
 */
function MapEditor({ rows, onChange, keyPlaceholder, valuePlaceholder }: {
  rows: [string, string][];
  onChange: (rows: [string, string][]) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
}) {
  const setRow = (i: number, k: string, v: string) =>
    onChange(rows.map((r, j) => (j === i ? [k, v] : r)) as [string, string][]);

  return (
    <div className="flex flex-col gap-2">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-center gap-2">
          <TextInputView
            value={k} size="md" accentColor={ACCENT} placeholder={keyPlaceholder}
            onChange={e => setRow(i, e.target.value, v)}
            style={{ width: '100%', fontFamily: 'monospace' }}
          />
          <span className="text-[11px] shrink-0" style={{ color: 'var(--color-text-muted)' }}>
            &rarr;
          </span>
          <TextInputView
            value={v} size="md" accentColor={ACCENT} placeholder={valuePlaceholder}
            onChange={e => setRow(i, k, e.target.value)}
            style={{ width: '100%', fontFamily: 'monospace' }}
          />
          <DeleteButton
            title="Delete this mapping"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <ButtonView
        label="Add a mapping" size="sm" variant="secondary"
        iconLeft={<PlusIcon size={11} />}
        onClick={() => onChange([...rows, ['', '']])}
        style={{ background: 'transparent', alignSelf: 'flex-start' }}
      />
    </div>
  );
}

/**
 * Delete, as an icon and nothing else.
 *
 * These sat in bordered ghost buttons, which gave a destructive control the
 * same visual weight as the text input it deletes and drew a box around empty
 * space on every row. The icon carries the meaning; the border only added
 * furniture to a column that repeats down the page.
 */
function IconButton({ onClick, title, color, active, children }: {
  onClick: () => void; title: string; color: string;
  active?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className="cursor-pointer border-none bg-transparent p-1 shrink-0 flex items-center
                 justify-center transition-opacity"
      style={{ color, opacity: active ? 1 : 0.7 }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = active ? '1' : '0.7'; }}
    >
      {children}
    </button>
  );
}

function DeleteButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <IconButton onClick={onClick} title={title} color="var(--color-error)">
      <TrashIcon size={12} />
    </IconButton>
  );
}

function Field({ label, hint, after, children }: {
  label: string;
  hint?: React.ReactNode;
  /** Rendered below the hint, for anything that reads as a footnote to it. */
  after?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9.5px] uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-[11px] leading-relaxed text-[var(--color-text-muted)]"
              style={{ maxWidth: '92ch' }}>
          {hint}
        </span>
      )}
      {after}
    </div>
  );
}

/**
 * The shipped layouts, as a row of choices that fill in the template.
 *
 * A template is the one setting nobody can guess, and getting it wrong looks
 * exactly like having no archives — the search runs, finds nothing, and says
 * so without a hint that the path was the problem. Offering the shapes that
 * actually occur turns writing a glob into recognising your own directory
 * tree.
 *
 * The chosen one is highlighted by comparing the text, so editing a picked
 * layout correctly drops the highlight: what is shown then is a custom
 * template, which is what it has become.
 */
function LayoutTable({ value, layouts, onChange }: {
  value: string | undefined;
  layouts: PvLayout[] | undefined;
  onChange: (over: { layouts?: PvLayout[]; template?: string }) => void;
}) {
  /*
    Which row is open for editing, if any.

    Every cell used to be a live input, which made nine rows of text boxes out
    of what is mostly a reference table: the shipped rows are read far more
    often than they are changed, and rendering them as fields invited edits to
    a row you meant to select and made the column impossible to skim.
  */
  const [editing, setEditing] = useState<string | null>(null);
  const active = (value ?? '').trim();
  const saved = layoutList(layouts);

  /*
    A config whose template is in none of the rows still has to be visible.

    The template used to live in a text box below this table, so a volume
    described by hand had somewhere to be. With the box gone, a template that
    matches no row would be searched with nothing on screen saying so — the
    setting would be invisible and uneditable at the same time. It gets a row.
  */
  const orphan = !!active && !saved.some(l => l.template.trim() === active);
  const rows: PvLayout[] = orphan
    ? [{ id: 'current', name: '', template: active, custom: true }, ...saved]
    : saved;

  /*
    Any edit materialises the whole list into the config.

    Until something is touched the config holds no layouts at all and the
    shipped ones are supplied on read, which is what lets a later release add
    a row to an untouched install. The first edit is the moment that has to
    stop, or every subsequent read would re-merge and undo the deletions.
  */
  const commit = (next: PvLayout[], template?: string) =>
    onChange(template === undefined ? { layouts: next } : { layouts: next, template });

  const edit = (i: number, over: Partial<PvLayout>) => {
    const next = rows.map((l, j) => (j === i ? { ...l, ...over } : l));
    // Editing the selected row's glob is editing what gets searched; the two
    // must not drift apart, or the highlight would move off the row you are
    // typing in.
    const selected = rows[i]!.template.trim() === active;
    commit(next, selected && over.template !== undefined ? over.template : undefined);
  };

  const remove = (i: number) => {
    const next = rows.filter((_, j) => j !== i);
    // Deleting the selected row leaves nothing selected, so the selection
    // moves to whatever is now first rather than leaving the table with no
    // highlight and the search still running the deleted glob.
    const selected = rows[i]!.template.trim() === active;
    commit(next, selected ? (next[0]?.template ?? '') : undefined);
  };

  const add = () => {
    const row: PvLayout = {
      id: layoutIdFor('layout', rows), name: '', template: '', custom: true,
    };
    // Selected and open on arrival, so what you type next lands in the search
    // rather than in a row you then have to remember to click and unlock.
    commit([...rows, row], '');
    setEditing(row.id);
  };

  // One blank row at a time: a second would be indistinguishable from the
  // first, and both would claim to be selected.
  const blank = rows.some(l => !l.template.trim());

  const cell: React.CSSProperties = {
    padding: '4px 8px', verticalAlign: 'middle', textAlign: 'left',
  };
  const box: React.CSSProperties = {
    display: 'block', width: '100%', borderRadius: 3, padding: '2px 4px',
    border: '1px solid transparent',
  };
  // Same box for both states, so opening a row for editing does not move the
  // text inside it by a pixel.
  const text: React.CSSProperties = { ...box, font: 'inherit' };
  const field: React.CSSProperties = {
    ...box, background: 'var(--color-surface-hover)',
    borderColor: `color-mix(in srgb, ${ACCENT} 35%, transparent)`,
    outline: 'none', color: 'inherit', font: 'inherit',
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded overflow-hidden"
           style={{ border: '1px solid var(--color-surface-border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '27%' }} />
            <col style={{ width: '31%' }} />
            <col />
            <col style={{ width: 56 }} />
          </colgroup>
          <thead>
            <tr style={{
              background: 'var(--color-surface-hover)',
              fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
            }}>
              <th style={cell}>Layout</th>
              <th style={cell}>Path template</th>
              <th style={cell}>Files it finds</th>
              <th style={cell} aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((l, i) => {
              const on = !!l.template.trim() && l.template.trim() === active;
              const open_ = editing === l.id;
              return (
                <tr
                  key={l.id}
                  onClick={() => onChange({ template: l.template })}
                  title={l.hint}
                  className="cursor-pointer"
                  style={{
                    borderTop: '1px solid var(--color-surface-border)',
                    background: on
                      ? `color-mix(in srgb, ${ACCENT} 12%, transparent)`
                      : 'transparent',
                    // Marks the chosen row without moving anything, so the
                    // table does not reflow as you click down it.
                    boxShadow: on ? `inset 2px 0 0 ${ACCENT}` : undefined,
                  }}
                >
                  <td style={{ ...cell, fontSize: 11 }}>
                    {open_ ? (
                      <input
                        value={l.name}
                        placeholder="name it"
                        aria-label="Layout name"
                        autoFocus
                        onKeyDown={(e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === 'Escape') setEditing(null);
                        }}
                        onChange={e => edit(i, { name: e.target.value })}
                        style={{
                          ...field,
                          color: on ? ACCENT : 'var(--color-text-secondary)',
                          fontWeight: on ? 600 : 400,
                        }}
                      />
                    ) : (
                      <span style={{
                        ...text,
                        color: on ? ACCENT : 'var(--color-text-secondary)',
                        fontWeight: on ? 600 : 400,
                        fontStyle: l.name ? undefined : 'italic',
                        opacity: l.name ? 1 : 0.6,
                      }}>
                        {l.name || 'unnamed'}
                      </span>
                    )}
                  </td>
                  <td style={{ ...cell, fontSize: 10 }}>
                    {open_ ? (
                      <input
                        value={l.template}
                        placeholder="{app}-{env}-pvc/**/{app}*.log*"
                        aria-label="Path template"
                        spellCheck={false}
                        onKeyDown={(e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === 'Escape') setEditing(null);
                        }}
                        onChange={e => edit(i, { template: e.target.value })}
                        style={{
                          ...field, fontFamily: 'monospace',
                          color: on ? ACCENT : 'var(--color-text-secondary)',
                        }}
                      />
                    ) : (
                      <span style={{
                        ...text, fontFamily: 'monospace',
                        color: on ? ACCENT : 'var(--color-text-secondary)',
                        fontStyle: l.template ? undefined : 'italic',
                        opacity: l.template ? 1 : 0.6,
                      }}>
                        {l.template || 'no template'}
                      </span>
                    )}
                  </td>
                  <td style={{
                    ...cell, fontSize: 9.5, fontFamily: 'monospace',
                    color: 'var(--color-text-muted)', wordBreak: 'break-all',
                  }}>
                    {/*
                      The live file and a rotated one, which is the pair that
                      says whether this is your volume's shape. A row you wrote
                      has none — it came from a real mount, so its own template
                      is the example.
                    */}
                    {(l.example ?? []).map(e => <div key={e}>{e}</div>)}
                    {!l.example && (
                      <span style={{ fontFamily: 'inherit', fontStyle: 'italic' }}>
                        yours
                      </span>
                    )}
                  </td>
                  <td style={{ ...cell, textAlign: 'center' }}>
                    {/* The row selects; these act on it. */}
                    <span className="flex items-center justify-end gap-0.5 pl-1"
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                      <IconButton
                        title={open_ ? 'Done editing' : 'Edit this row'}
                        color={open_ ? ACCENT : 'var(--color-text-muted)'}
                        active={open_}
                        onClick={() => setEditing(open_ ? null : l.id)}
                      >
                        {/* The icon says what pressing it does, so an open row
                            offers the way out rather than repeating the way in. */}
                        {open_ ? <CheckIcon size={12} /> : <PencilIcon size={11} />}
                      </IconButton>
                      <DeleteButton
                        title={l.name ? `Delete "${l.name}"` : 'Delete this row'}
                        onClick={() => remove(i)}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr style={{ borderTop: '1px solid var(--color-surface-border)' }}>
                <td colSpan={4} style={{
                  ...cell, fontSize: 10.5, fontStyle: 'italic',
                  color: 'var(--color-text-muted)',
                }}>
                  No layouts. Add one, or restore the ones that ship.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <ButtonView
          label="Add layout" size="sm" variant="secondary"
          iconLeft={<PlusIcon size={11} />}
          disabled={blank}
          title={blank ? 'Fill in the empty row first' : 'Add an empty row'}
          onClick={add}
          style={{ background: 'transparent' }}
        />
        <ButtonView
          label="Restore defaults" size="sm" variant="secondary"
          /*
            Enabled while anything is off the shipped state, which includes a
            template that matches no row.

            Keying this on the rows alone left the button dead in the one
            situation it exists for: an install whose saved template predates a
            change to the shipped ones has untouched rows and a stale
            selection, so the rows looked default, the button greyed out, and
            the orphan row had no way back.
          */
          disabled={isDefaultLayouts(layouts) && !orphan}
          title="Bring back the layouts that ship, discarding edits and deletions here"
          onClick={() => {
            /*
              Restoring the rows has to restore the selection too, or the table
              comes back with nothing highlighted and a template that no row
              describes — which is the state this button exists to leave.
            */
            const shipped = layoutList(undefined);
            const keep = shipped.some(l => l.template.trim() === active);
            onChange({
              layouts: undefined,
              ...(keep ? {} : { template: shipped[0]!.template }),
            });
          }}
          style={{ background: 'transparent' }}
        />
      </div>
    </div>
  );
}


export function PvLogSettings() {
  const {
    draft, probe, probing, dirty, load, patch, runProbe, save, reset, apply,
  } = useDk8sPvStore();

  // A config written before mounts existed still has `root`; showing it as the
  // first mount is what stops the page rendering empty over a working setup.
  const mounts = draft.mounts?.length
    ? draft.mounts
    : [{ path: draft.root ?? '' }];
  const setMount = (i: number, over: Partial<typeof mounts[number]>) =>
    patch({ mounts: mounts.map((m, j) => (j === i ? { ...m, ...over } : m)), root: undefined });

  // Kept as pairs rather than an object while editing: a half-typed key is a
  // real state, and an object would drop the row the moment the key is blank.
  const envRows = Object.entries(draft.envByContext ?? {}) as [string, string][];
  const setEnv = (rows: [string, string][]) =>
    patch({ envByContext: Object.fromEntries(rows) });

  const appRows = Object.entries(draft.appByPod ?? {}) as [string, string][];
  const setApp = (rows: [string, string][]) =>
    patch({ appByPod: Object.fromEntries(rows) });

  const pathRows = Object.entries(draft.pathByPod ?? {}) as [string, string][];
  const setPath = (rows: [string, string][]) =>
    patch({ pathByPod: Object.fromEntries(rows) });

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data as Record<string, unknown>;
      if (msg?.type === 'dk8s:pvConfig' || msg?.type === 'dk8s:pvProbe') apply(msg);
    };
    window.addEventListener('message', handler);
    load();
    return () => window.removeEventListener('message', handler);
  }, [apply, load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          archived logs
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
        {dirty && (
          <>
            <ButtonView label="Discard" size="sm" variant="secondary" onClick={reset}
                        style={{ background: 'transparent' }} />
            <ButtonView label="Save" size="sm" variant="secondary"
                        accentColor={ACCENT} color={ACCENT} onClick={save}
                        style={{
                          background: `color-mix(in srgb, ${ACCENT} 16%, transparent)`,
                          borderColor: `color-mix(in srgb, ${ACCENT} 45%, transparent)`,
                          fontWeight: 600,
                        }} />
          </>
        )}
      </div>

      <div>
        <Hint
          lead={<>
            <Lit>kubectl logs</Lit> reaches the running container and the one before it, and
            nothing else — a pod that has restarted all day has lost the restart that
            mattered.
          </>}
          points={[
            <>If your cluster ships logs to a volume mounted on this machine, point dk8s at
              it and Search Everywhere looks there too, alongside the live pods.</>,
          ]}
        />
      </div>

      <CheckboxView
        label="Search archived logs as well as live pods"
        checked={draft.enabled}
        size="md"
        accentColor={ACCENT}
        onChange={v => patch({ enabled: v })}
      />

      <div className="flex flex-col gap-3.5 px-3 py-3 rounded-lg"
           style={{
             background: 'var(--color-surface)',
             border: '1px solid var(--color-surface-border)',
             opacity: draft.enabled ? 1 : 0.55,
           }}>
        <Field
          label="mount paths"
          hint={
            'Where the volumes are mounted on this machine. Nothing is ever written here — '
            + 'the files are only read. Add more than one when separate shares are mounted '
            + 'separately; a single share holding every claim needs only one.'
          }
        >
          <div className="flex flex-col gap-2">
            {mounts.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <TextInputView
                  value={m.path} size="md" accentColor={ACCENT}
                  placeholder={'\\\\\\\\fileserver\\\\pvcs   or   /mnt/pvcs'}
                  onChange={e => setMount(i, { path: e.target.value })}
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
                {mounts.length > 1 && (
                  <DeleteButton
                    title="Remove this mount"
                    onClick={() => patch({ mounts: mounts.filter((_, j) => j !== i) })}
                  />
                )}
              </div>
            ))}
            <div className="flex items-center gap-2">
              <ButtonView
                label="Add a mount" size="sm" variant="secondary"
                iconLeft={<PlusIcon size={11} />}
                onClick={() => patch({ mounts: [...mounts, { path: '' }] })}
                style={{ background: 'transparent' }}
              />
              <div className="flex-1" />
              <ButtonView
                label={probing ? 'Checking…' : 'Check'}
                size="md" variant="secondary"
                accentColor={ACCENT} color={ACCENT}
                disabled={probing || !mounts.some(m => m.path.trim())}
                iconLeft={probing ? <SpinnerIcon size={12} /> : <FolderOpenIcon size={12} />}
                onClick={runProbe}
                style={{
                  background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
                  borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`,
                  whiteSpace: 'nowrap',
                }}
              />
            </div>
          </div>
        </Field>

        <Field
          label="layout"
          hint={
            <Hint
              lead={<>Where one pod&rsquo;s files live, relative to the mount.</>}
              points={[
                <>Click a row to use it, edit any row in place, and delete the ones
                  that describe nothing here.</>,
                <><Lit>{'{app}'}</Lit> <Lit>{'{env}'}</Lit> <Lit>{'{namespace}'}</Lit>{' '}
                  <Lit>{'{pod}'}</Lit> <Lit>{'{container}'}</Lit> <Lit>{'{date}'}</Lit>{' '}
                  are filled in per pod. <Lit>*</Lit> and <Lit>**</Lit> are globs.</>,
                <><Lit>{'{app}'}</Lit> is the pod name without its ReplicaSet hash and pod
                  suffix, so <Lit>zp-backend-7f9455548d-xm6kc</Lit> becomes{' '}
                  <Lit>zp-backend</Lit>. <Lit>{'{env}'}</Lit> comes from the cluster, mapped
                  below.</>,
                <><Lit>**</Lit> matches no directories as well as many, which is what lets
                  one row cover both <Lit>my-app-prod-pvc/my-app.log</Lit> and{' '}
                  <Lit>my-app-prod-pvc/archived/my-app-2026-08-30.log.gz</Lit>.</>,
              ]}
            />
          }
        >
          <LayoutTable
            value={draft.template}
            layouts={draft.layouts}
            onChange={patch}
          />
        </Field>

        <Field
          label="fallback pattern"
          hint={
            <Hint
              lead={<>Optional. A regular expression matched against each file&rsquo;s path
                below the mount, for anything the rows above cannot express.</>}
              points={[
                <>Named groups <Lit>{'(?<namespace>…)'}</Lit>, <Lit>{'(?<app>…)'}</Lit> and{' '}
                  <Lit>{'(?<pod>…)'}</Lit> say which pod a file belongs to.</>,
                <>Without them, a file is claimed when the pod or application name appears
                  anywhere in its path.</>,
              ]}
            />
          }
        >
          <TextInputView
            value={draft.pattern ?? ''} size="md" accentColor={ACCENT}
            placeholder={String.raw`^legacy/(?<pod>[^/]+)\.log$`}
            onChange={e => patch({ pattern: e.target.value })}
            style={{ width: '100%', fontFamily: 'monospace' }}
          />
        </Field>

        <Field
          label="what {env} means"
          hint={
            <Hint
              lead={<>The one thing that cannot be derived, because Kubernetes has no
                notion of an environment.</>}
              points={[
                <>Left: part of a context name. Right: what <Lit>{'{env}'}</Lit> becomes.</>,
                <>Left empty, <Lit>{'{env}'}</Lit> matches anything — which still finds the
                  logs, it just cannot tell a prod claim from a dev one.</>,
              ]}
            />
          }
        >
          <MapEditor rows={envRows} onChange={setEnv}
                     keyPlaceholder="context contains…" valuePlaceholder="prod" />
        </Field>

        <Field
          label="what {app} means"
          hint={
            <Hint
              lead={<>Usually nothing to do here. <Lit>{'{app}'}</Lit> is the pod&rsquo;s
                owning workload, which Kubernetes reports directly — two replicas of one
                Deployment resolve to the same name without any guessing.</>}
              points={[
                <>For the two cases that cannot cover: a bare pod with no owner, and a
                  directory named something other than the workload.</>,
                <>Match part of a pod name on the left.</>,
              ]}
            />
          }
        >
          <MapEditor rows={appRows} onChange={setApp}
                     keyPlaceholder="pod name contains…" valuePlaceholder="app" />
        </Field>

        <Field
          label="a path for one pod"
          hint={
            <Hint
              lead={<>One pod that lives somewhere the rows above do not describe.</>}
              points={[
                <>Left: a pod name. A glob when it contains <Lit>*</Lit> or <Lit>?</Lit>{' '}
                  (<Lit>zp-backend-*</Lit>), otherwise any pod whose name contains it.</>,
                <>The longest match wins, so a rule for one pod beats a rule for a family
                  of them.</>,
                <>Right: a path relative to the mount — still a template, so{' '}
                  <Lit>{'{app}'}</Lit>, <Lit>{'{env}'}</Lit>, <Lit>{'{date}'}</Lit> and globs
                  all work.</>,
              ]}
            />
          }
          after={
            <Why>
              The rows above assume a claim named after the workload and the environment.
              Plenty are not — a share laid out by team, a path inherited from before the
              cluster, one service written somewhere else entirely. Rather than bending a
              shared template until it covers the exception and stops describing the rule,
              name the exception here.
            </Why>
          }
        >
          <MapEditor rows={pathRows} onChange={setPath}
                     keyPlaceholder="zp-backend-*"
                     valuePlaceholder="shared/team-a/**/{app}*.log*" />
        </Field>

        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Field
            label="file extensions"
            hint={<Hint lead={<>Comma separated. Blank means every file. Matched
              anywhere in the name, so <Lit>.log</Lit> also admits <Lit>.log.gz</Lit>
              and <Lit>.log.1</Lit>.</>} />}
          >
            <TextInputView
              value={(draft.extensions ?? []).join(', ')} size="md" accentColor={ACCENT}
              placeholder=".log, .txt"
              onChange={e => patch({
                extensions: e.target.value.split(',').map(x => x.trim()).filter(Boolean),
              })}
              style={{ width: '100%', fontFamily: 'monospace' }}
            />
          </Field>
          <Field
            label="ignore files older than"
            hint={<Hint lead={<>Days. <Lit>0</Lit> searches everything.</>} />}
          >
            <TextInputView
              type="number" value={String(draft.maxAgeDays ?? 0)} size="md" accentColor={ACCENT}
              onChange={e => patch({ maxAgeDays: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              style={{ width: 120 }}
            />
          </Field>
        </div>

        {probe && <ProbeReport />}
      </div>
    </div>
  );
}

/** What each mount actually holds — the point of the Check button. */
function ProbeReport() {
  const probe = useDk8sPvStore(s => s.probe);
  if (!probe) return null;

  if (probe.error) {
    return (
      <div className="flex items-start gap-2 px-3 py-2 rounded-md"
           style={{
             background: 'color-mix(in srgb, var(--color-error) 10%, var(--color-surface))',
             border: '1px solid color-mix(in srgb, var(--color-error) 28%, transparent)',
           }}>
        <WarningTriangleIcon size={13} color="var(--color-error)" />
        <span className="text-[11.5px]" style={{ color: 'var(--color-error)' }}>{probe.error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* One block per mount. A working prod volume beside a mistyped dev one
          has to say exactly that, rather than a single verdict that hides
          half of what was asked for. */}
      {probe.mounts.map((m, i) => <MountReport key={i} m={m} />)}
    </div>
  );
}

function MountReport({ m }: { m: import('../../store/dk8s-pv-store').PvMountProbe }) {
  if (!m.ok) {
    return (
      <div className="flex items-start gap-2 px-3 py-2 rounded-md"
           style={{
             background: 'color-mix(in srgb, var(--color-error) 10%, var(--color-surface))',
             border: '1px solid color-mix(in srgb, var(--color-error) 28%, transparent)',
           }}>
        <WarningTriangleIcon size={13} color="var(--color-error)" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[11.5px]" style={{ color: 'var(--color-error)' }}>
            {m.error ?? 'Could not read that path.'}
          </span>
          <span className="text-[10.5px] font-mono truncate" style={{ color: 'var(--color-text-muted)' }}>
            {m.resolved || m.path}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 rounded-md"
         style={{
           background: 'var(--color-surface-hover)',
           border: '1px solid var(--color-surface-border)',
         }}>
      <div className="flex items-center gap-2 flex-wrap">
        <CheckCircleIcon size={13} color="var(--color-success)" />
        <span className="text-[11.5px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          {m.fileCount.toLocaleString()} file{m.fileCount === 1 ? '' : 's'}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {bytes(m.totalBytes)} · {when(m.oldest)} → {when(m.newest)}
        </span>
        <div className="flex-1" />
        <span className="text-[10px] font-mono truncate" style={{ color: 'var(--color-text-muted)', maxWidth: '40%' }}>
          {m.resolved}
        </span>
      </div>

      {m.topLevel.length > 0 && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[9.5px] uppercase tracking-wider shrink-0"
                style={{ color: 'var(--color-text-muted)' }}>
            top level
          </span>
          <span className="text-[10.5px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>
            {m.topLevel.slice(0, 12).join(', ')}
            {m.topLevel.length > 12 && ` … +${m.topLevel.length - 12}`}
          </span>
        </div>
      )}

      {m.sample.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="text-[9.5px] uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}>
            {/* Says how many of how many, because a list that stops at eight
                and does not admit it reads as everything the walk found. */}
            {m.sample.length < m.fileCount
              ? `newest ${m.sample.length} of ${m.fileCount.toLocaleString()} files`
              : 'newest files'}
            {' '}— check your template against these
          </span>
          {m.sample.map(f => (
            <div key={f.rel} className="flex items-baseline gap-2 text-[10.5px] font-mono">
              <span className="truncate flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                {f.rel}
              </span>
              <span className="shrink-0" style={{ color: 'var(--color-text-muted)' }}>{bytes(f.bytes)}</span>
              <span className="shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                {when(f.mtime)}
              </span>
            </div>
          ))}
        </div>
      )}

      {m.fileCount === 0 && (
        <span className="text-[11px]" style={{ color: 'var(--color-warning)' }}>
          The path is readable but nothing under it matched. Check the extension filter and the
          age limit before the template — those exclude files before the template is even tried.
        </span>
      )}
    </div>
  );
}
