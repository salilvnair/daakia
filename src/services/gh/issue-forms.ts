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
  /** The heading to read, which is the field's label. */
  heading: string;
  options: string[];
  /** Which form it came from — the same dimension can appear in several. */
  files: string[];
}

/**
 * Work out which discovered fields look like board dimensions.
 *
 * Only dropdowns are proposed. A free-text field called "Module" holds whatever
 * somebody typed, and a dimension whose values are ungrouped prose gives a
 * board with one column per issue — which is worse than no dimension at all.
 */
export function proposeDimensions(forms: IssueForm[]): ProposedDimension[] {
  const byDimension = new Map<Dimension, ProposedDimension>();

  for (const form of forms) {
    for (const field of form.fields) {
      if (field.type !== 'dropdown' || field.options.length === 0) continue;
      const name = field.label.trim().toLowerCase();

      for (const [dim, names] of Object.entries(ALIASES) as [Dimension, string[]][]) {
        if (!names.includes(name)) continue;
        const existing = byDimension.get(dim);
        if (existing) {
          /* Same dimension in a second form. Union the options and remember
             both files — a value that exists in one template and not the other
             is still a value the board will meet. */
          for (const o of field.options) if (!existing.options.includes(o)) existing.options.push(o);
          if (!existing.files.includes(form.file)) existing.files.push(form.file);
        } else {
          byDimension.set(dim, {
            dimension: dim,
            heading: field.label,
            options: [...field.options],
            files: [form.file],
          });
        }
        break;
      }
    }
  }

  /* A stable order, so the Repository screen does not reshuffle between reads. */
  const order: Dimension[] = ['module', 'environment', 'type', 'severity', 'team'];
  return order.map(d => byDimension.get(d)).filter((d): d is ProposedDimension => !!d);
}

/** heading -> dimension, which is what `readDimensions` wants. */
export function headingMap(proposed: ProposedDimension[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of proposed) out[p.heading] = p.dimension;
  return out;
}
