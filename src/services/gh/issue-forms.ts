/**
 * Reading a repository's issue forms.
 *
 * The other half of the field model. A GitHub issue *form* is YAML declaring
 * typed inputs, and a dropdown enumerates its own allowed values — which is the
 * single fact the whole board rests on. dkgh does not have to infer that Module
 * can be Checkout, Orders, Reporting or Admin; the form says so, and says there
 * is no fifth.
 *
 * Parsing is deliberately tolerant of everything except a malformed field. One
 * bad file never costs the good ones: it is reported by name and line and
 * skipped, because a repository with three templates and one typo should get
 * two working dimensions rather than none.
 */
import { load } from 'js-yaml';

export interface FormField {
  /** `dropdown`, `input`, `textarea`, `checkboxes`, `markdown`. */
  type: string;
  /** The `id`, when the template gave one. */
  id?: string;
  /** The label — and therefore the `### Heading` it renders as. */
  label: string;
  /** Enumerated values, for a dropdown. Empty for everything else. */
  options: string[];
  required: boolean;
}

export interface IssueForm {
  /** The file it came from, for reporting. */
  file: string;
  name: string;
  description?: string;
  /** Labels the template applies automatically. */
  labels: string[];
  fields: FormField[];
}

export interface FormParseError {
  file: string;
  /** 1-based, when the YAML error carried a position. */
  line?: number;
  message: string;
}

export interface ParsedForms {
  forms: IssueForm[];
  errors: FormParseError[];
}

/** Shapes we read out of the YAML, all optional because it is somebody's file. */
interface RawBody {
  type?: unknown;
  id?: unknown;
  attributes?: { label?: unknown; options?: unknown; description?: unknown };
  validations?: { required?: unknown };
}
interface RawForm {
  name?: unknown;
  description?: unknown;
  labels?: unknown;
  body?: unknown;
}

/**
 * Parse one `.yml`.
 *
 * Never throws. A file that will not parse comes back as an error with its
 * line, because "invalid YAML" alone sends somebody to read a spec while
 * "line 14: options must be a list" is a ten-second fix.
 */
export function parseIssueForm(file: string, text: string): IssueForm | FormParseError {
  /*
    Extension first, before YAML is attempted at all.

    An old-style Markdown template fed to a YAML parser fails somewhere in its
    own content — `- [ ] tests` is reported as "bad indentation of a sequence
    entry (2:7)", which is true, useless, and looks like dkgh is broken. The
    file is simply not an issue form, and saying that is the whole answer.
  */
  if (!/\.ya?ml$/i.test(file)) {
    return { file, message: 'is not a .yml file — not an issue form' };
  }

  let doc: unknown;
  try {
    doc = load(text);
  } catch (err) {
    const e = err as { message?: string; mark?: { line?: number } };
    return {
      file,
      /* js-yaml's mark is 0-based; editors are not. */
      line: typeof e.mark?.line === 'number' ? e.mark.line + 1 : undefined,
      message: e.message ?? 'could not be parsed as YAML',
    };
  }

  if (!doc || typeof doc !== 'object') {
    return { file, message: 'is empty, or is not a YAML mapping' };
  }

  const raw = doc as RawForm;
  if (!Array.isArray(raw.body)) {
    /* A `.md` template with front matter, or a config file. Not an error worth
       shouting about — it is simply not an issue form. */
    return { file, message: 'has no `body:` list — not an issue form' };
  }

  const fields: FormField[] = [];
  for (const entry of raw.body as RawBody[]) {
    if (!entry || typeof entry !== 'object') continue;
    const type = typeof entry.type === 'string' ? entry.type : '';
    /* `markdown` blocks are instructions to the reporter; they render no
       heading and hold no answer, so they are not fields. */
    if (!type || type === 'markdown') continue;

    const label = typeof entry.attributes?.label === 'string' ? entry.attributes.label.trim() : '';
    if (!label) continue; // Without a label there is no heading to match on.

    const rawOptions = entry.attributes?.options;
    if (type === 'dropdown' && !Array.isArray(rawOptions)) {
      /*
        The specific failure worth naming. GitHub rejects this form too — the
        file is not working where it lives — so saying so is more useful than
        reporting an import problem.
      */
      return {
        file,
        message: `\`options\` for "${label}" must be a list, not ${typeof rawOptions}`,
      };
    }

    fields.push({
      type,
      id: typeof entry.id === 'string' ? entry.id : undefined,
      label,
      options: Array.isArray(rawOptions)
        ? rawOptions.map(o => String(typeof o === 'object' && o ? (o as { label?: unknown }).label ?? '' : o)).filter(Boolean)
        : [],
      required: entry.validations?.required === true,
    });
  }

  return {
    file,
    name: typeof raw.name === 'string' ? raw.name : file,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    labels: Array.isArray(raw.labels) ? raw.labels.map(String) : [],
    fields,
  };
}

/** Parse a directory's worth, keeping the good ones and naming the bad. */
export function parseIssueForms(files: { file: string; text: string }[]): ParsedForms {
  const forms: IssueForm[] = [];
  const errors: FormParseError[] = [];
  for (const f of files) {
    /* config.yml is the directory's own settings, not a form. */
    if (/(^|\/)config\.ya?ml$/i.test(f.file)) continue;
    const result = parseIssueForm(f.file, f.text);
    if ('fields' in result) forms.push(result);
    else errors.push(result);
  }
  return { forms, errors };
}

// ── Proposing dimensions ────────────────────────────────────────────────────

export type Dimension = 'module' | 'environment' | 'type' | 'severity' | 'team';

/**
 * Names a field might have for each dimension.
 *
 * Matching is by name because that is all there is to go on, and it is a
 * PROPOSAL — screen 17 shows every row and lets a human change it, because a
 * repository that calls it "Area" and means something else is one we would
 * otherwise get quietly wrong.
 */
const ALIASES: Record<Dimension, string[]> = {
  module:      ['module', 'component', 'area', 'subsystem', 'feature'],
  environment: ['environment', 'env', 'deploy target', 'stage'],
  type:        ['issue type', 'type', 'category', 'kind'],
  severity:    ['severity', 'impact'],
  team:        ['team', 'squad', 'owner team'],
};

export interface ProposedDimension {
  dimension: Dimension;
  /** The heading to show for it — the label of the dropdown it came from. */
  heading: string;
  /**
   * Every heading that feeds this dimension, across every template.
   *
   * Not the same as `heading`, and the difference was a real bug. This
   * repository declares `Module` as a dropdown in the enhancement template and
   * `Module/Screen` as an input in the bug template. Only the dropdown can
   * *propose* a dimension — a free-text field would give a board with one
   * column per issue — so `heading` was "Module", and every bug report, whose
   * body says "Module/Screen", read as **No module** on a board that was
   * grouped by module and had the value sitting right there in the issue.
   *
   * `readDimensions` always took a map of many headings to one dimension. It
   * was `headingMap` that only ever gave it one.
   */
  headings: string[];
  options: string[];
  /** Which form it came from — the same dimension can appear in several. */
  files: string[];
}

/**
 * Which dimension a field's label names, if any.
 *
 * The whole label first, then each `/`-separated part. "Module/Screen" is one
 * field about two things and the first of them is the dimension; listing every
 * such pairing in `ALIASES` would be guessing at other people's templates
 * forever, and splitting on the separator they already used is not a guess.
 */
export function aliasOf(label: string): Dimension | undefined {
  const name = label.trim().toLowerCase();
  const parts = [name, ...name.split('/').map(p => p.trim()).filter(p => p && p !== name)];
  for (const part of parts) {
    for (const [dim, names] of Object.entries(ALIASES) as [Dimension, string[]][]) {
      if (names.includes(part)) return dim;
    }
  }
  return undefined;
}

/**
 * Work out which discovered fields look like board dimensions.
 *
 * Only dropdowns are *proposed*. A free-text field called "Module" holds
 * whatever somebody typed, and a dimension whose values are ungrouped prose
 * gives a board with one column per issue — which is worse than no dimension
 * at all.
 *
 * But once a dropdown somewhere has established that this repository has a
 * module dimension, a free-text field of the same name in another template is
 * still that dimension, and reading it is strictly better than showing the
 * issue as having none. So the second pass collects headings — not options —
 * from fields of any type.
 */
export function proposeDimensions(forms: IssueForm[]): ProposedDimension[] {
  const byDimension = new Map<Dimension, ProposedDimension>();

  for (const form of forms) {
    for (const field of form.fields) {
      if (field.type !== 'dropdown' || field.options.length === 0) continue;
      const dim = aliasOf(field.label);
      if (!dim) continue;

      const existing = byDimension.get(dim);
      if (existing) {
        /* Same dimension in a second form. Union the options and remember
           both files — a value that exists in one template and not the other
           is still a value the board will meet. */
        for (const o of field.options) if (!existing.options.includes(o)) existing.options.push(o);
        if (!existing.files.includes(form.file)) existing.files.push(form.file);
        if (!existing.headings.includes(field.label)) existing.headings.push(field.label);
      } else {
        byDimension.set(dim, {
          dimension: dim,
          heading: field.label,
          headings: [field.label],
          options: [...field.options],
          files: [form.file],
        });
      }
    }
  }

  /*
    Second pass: every other field whose label names a dimension we already
    have. Headings only — a free-text field's value is not an option, and
    adding it to `options` would put whatever one person typed on the board's
    column list for everybody.
  */
  for (const form of forms) {
    for (const field of form.fields) {
      if (field.type === 'markdown') continue;
      const dim = aliasOf(field.label);
      if (!dim) continue;
      const found = byDimension.get(dim);
      if (found && !found.headings.includes(field.label)) found.headings.push(field.label);
    }
  }

  /* A stable order, so the Repository screen does not reshuffle between reads. */
  const order: Dimension[] = ['module', 'environment', 'type', 'severity', 'team'];
  return order.map(d => byDimension.get(d)).filter((d): d is ProposedDimension => !!d);
}

/** heading -> dimension, which is what `readDimensions` wants — all of them. */
export function headingMap(proposed: ProposedDimension[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of proposed) {
    /* The dropdown's own label first, so it stays the one that wins when two
       headings are both present in a body. `readDimensions` takes the first
       that answers, and insertion order is what decides that. */
    for (const h of [p.heading, ...p.headings]) out[h] = p.dimension;
  }
  return out;
}
