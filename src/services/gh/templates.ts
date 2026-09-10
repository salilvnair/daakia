/**
 * Bringing issue forms in from somewhere else — screen 18.
 *
 * Screen 17 reads the templates a repository already has. This is the other
 * case, and the common one on a repository nobody has set up: the templates are
 * *elsewhere* — a zip a colleague sent, a folder on disk, or the repo next door
 * that got this right.
 *
 * **Importing and committing are separate, and this file keeps them apart.**
 * Reading a zip to understand a repository costs nothing and is undone by
 * changing your mind. Putting files in somebody's `.github/` is a commit on
 * their default branch with your name on it. One is a preview; the other is a
 * write, and they are two functions here for the same reason they are two
 * buttons there.
 *
 * **A malformed form is named and skipped, never fatal.** One bad `options`
 * line does not cost you the two forms that parse — `parseIssueForms` already
 * reports the file and the line, and this file passes that through rather than
 * throwing the batch away.
 */
import { inflateRawSync } from 'zlib';
import { run } from './gh';

export interface TemplateFile { file: string; text: string }

export interface TemplateSource {
  files: TemplateFile[];
  /** Where they came from, for the heading that says so. */
  from: string;
  error?: string;
}

/** Only issue forms. A repository's `.github/` holds a great deal that is not. */
export function isForm(name: string): boolean {
  return /\.ya?ml$/i.test(name) && !/^config\.ya?ml$/i.test(name.split('/').pop() ?? '');
}

/**
 * The forms another repository declares.
 *
 * A read, and only a read — nothing is written to the repository being copied
 * from, which is worth saying because "import from" reads like it might.
 */
export async function fetchTemplatesFrom(repo: string): Promise<TemplateSource> {
  const from = `${repo}/.github/ISSUE_TEMPLATE`;
  const list = await run(
    ['api', `/repos/${repo}/contents/.github/ISSUE_TEMPLATE`],
    { timeoutMs: 30_000 },
  );
  if (!list.ok) {
    const said = (list.stderr || list.failure || '').trim();
    return {
      files: [],
      from,
      error: /404|not found/i.test(said)
        ? `${repo} has no .github/ISSUE_TEMPLATE folder.`
        : said || 'gh could not read it.',
    };
  }

  let entries: { name?: string; type?: string; path?: string }[];
  try {
    entries = JSON.parse(list.stdout) as typeof entries;
  } catch {
    return { files: [], from, error: 'gh returned something that is not JSON.' };
  }
  if (!Array.isArray(entries)) {
    return { files: [], from, error: `${repo} has no .github/ISSUE_TEMPLATE folder.` };
  }

  const wanted = entries.filter(e => e.type === 'file' && isForm(e.name ?? ''));
  const files: TemplateFile[] = [];
  for (const entry of wanted) {
    /* One call per file. The listing does not carry content, and asking for
       the whole tree to save a round trip reads a great deal that is not a
       form. */
    const one = await run(
      ['api', `/repos/${repo}/contents/${entry.path}`],
      { timeoutMs: 30_000 },
    );
    if (!one.ok) continue;
    try {
      const body = JSON.parse(one.stdout) as { content?: string; encoding?: string };
      if (body.encoding !== 'base64' || !body.content) continue;
      files.push({
        file: entry.name ?? 'form.yml',
        text: Buffer.from(body.content, 'base64').toString('utf-8'),
      });
    } catch {
      /* One unreadable file is not the others' problem. */
    }
  }

  return { files, from };
}

/**
 * A minimal zip reader: local file headers, in order.
 *
 * A colleague's `ISSUE_TEMPLATE.zip` holds three small text files and nothing
 * else worth a dependency. Only the two methods a zip of text actually uses are
 * supported — stored and deflated — and anything else is skipped by name so
 * the reader never returns something it did not decode.
 */
export function readZip(bytes: Buffer): TemplateFile[] {
  const out: TemplateFile[] = [];
  let at = 0;
  while (at + 30 <= bytes.length) {
    if (bytes.readUInt32LE(at) !== 0x04034b50) break;
    const method = bytes.readUInt16LE(at + 8);
    const flags = bytes.readUInt16LE(at + 6);
    let compressed = bytes.readUInt32LE(at + 18);
    const nameLen = bytes.readUInt16LE(at + 26);
    const extraLen = bytes.readUInt16LE(at + 28);
    const nameAt = at + 30;
    const name = bytes.subarray(nameAt, nameAt + nameLen).toString('utf-8');
    const dataAt = nameAt + nameLen + extraLen;

    /*
      A streamed entry writes its sizes to a trailing descriptor rather than the
      header, so the header says zero. Reading that would need the central
      directory; naming it is more honest than returning an empty file.
    */
    if ((flags & 0x08) !== 0 && compressed === 0) break;
    if (compressed === 0 && method === 0) compressed = 0;

    const data = bytes.subarray(dataAt, dataAt + compressed);
    if (isForm(name) && !name.includes('__MACOSX')) {
      try {
        const text = method === 0 ? data.toString('utf-8')
          : method === 8 ? inflateRawSync(data).toString('utf-8')
          : '';
        if (text) out.push({ file: name.split('/').pop() ?? name, text });
      } catch {
        /* An entry that will not inflate is skipped, not fatal. */
      }
    }
    at = dataAt + compressed;
  }
  return out;
}

/**
 * A starter set, for a repository that has nothing.
 *
 * Three forms, and the dropdowns are the three dimensions dkgh knows how to
 * read — which is the whole reason to start from these rather than from
 * GitHub's own default, whose fields map to nothing.
 *
 * The values are deliberately generic. A starter set that guessed somebody's
 * module names would be wrong in a way that is hard to notice and annoying to
 * undo.
 */
export function starterSet(): TemplateFile[] {
  const dropdowns = `  - type: dropdown
    id: module
    attributes:
      label: Module
      options:
        - Checkout
        - Orders
        - Reporting
        - Admin
    validations:
      required: true
  - type: dropdown
    id: environment
    attributes:
      label: Environment
      options:
        - DEV
        - TEST
        - PROD
    validations:
      required: true
`;

  return [
    {
      file: 'bug_report.yml',
      text: `name: Bug report
description: Something is broken
labels: [bug]
body:
  - type: dropdown
    id: type
    attributes:
      label: Issue Type
      options:
        - UI
        - API
        - Backend
        - Data
    validations:
      required: true
${dropdowns}  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
      description: What you did, in the order you did it.
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: What happened
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: What you expected
`,
    },
    {
      file: 'enhancement.yml',
      text: `name: Enhancement
description: Something could be better
labels: [enhancement]
body:
${dropdowns}  - type: textarea
    id: problem
    attributes:
      label: The problem
      description: What is hard today, rather than what to build.
    validations:
      required: true
  - type: textarea
    id: idea
    attributes:
      label: One idea
`,
    },
    {
      file: 'task.yml',
      text: `name: Task
description: A piece of work with no bug behind it
labels: [task]
body:
${dropdowns}  - type: textarea
    id: what
    attributes:
      label: What needs doing
    validations:
      required: true
`,
    },
  ];
}

export interface CommitStep {
  file: string;
  path: string;
  argv: string[];
  display: string;
  /** Set when the repository already has a file at that path. */
  replaces?: string;
}

export interface CommitPlan {
  repo: string;
  steps: CommitStep[];
  refusal?: string;
}

/**
 * What committing these would run, unrun.
 *
 * One `PUT .../contents/{path}` per file. A file that already exists needs its
 * blob sha, or GitHub refuses the write — so the sha is looked up first and an
 * overwrite is labelled as one, which is also 18D's whole subject.
 */
export async function planTemplateCommit(
  repo: string, files: TemplateFile[], message: string,
): Promise<CommitPlan> {
  if (files.length === 0) return { repo, steps: [], refusal: 'There is nothing to commit.' };

  const steps: CommitStep[] = [];
  for (const f of files) {
    const path = `.github/ISSUE_TEMPLATE/${f.file}`;
    const existing = await shaOf(repo, path);
    const argv = [
      'api', '--method', 'PUT', `/repos/${repo}/contents/${path}`,
      '-f', `message=${message}`,
      '-f', `content=${Buffer.from(f.text, 'utf-8').toString('base64')}`,
      ...(existing ? ['-f', `sha=${existing}`] : []),
    ];
    steps.push({
      file: f.file,
      path,
      argv,
      /* The content is megabytes of base64 nobody reads; the display says what
         the command does and how big the file is. */
      display: `gh api --method PUT /repos/${repo}/contents/${path}`
        + `  # ${f.text.length} bytes${existing ? ', replacing what is there' : ''}`,
      replaces: existing,
    });
  }
  return { repo, steps };
}

/** The blob sha of a file, or undefined when the repository has no such file. */
async function shaOf(repo: string, path: string): Promise<string | undefined> {
  const r = await run(['api', `/repos/${repo}/contents/${path}`], { timeoutMs: 20_000 });
  if (!r.ok) return undefined;
  try {
    const body = JSON.parse(r.stdout) as { sha?: string };
    return body.sha;
  } catch {
    return undefined;
  }
}

export interface CommitOutcome {
  file: string;
  ok: boolean;
  error?: string;
}

/**
 * Run the plan, one file at a time, reporting each.
 *
 * Not atomic, and it says so: three files is three commits, and if the second
 * fails the first is already on the branch. A batch that rolled back would need
 * a fourth commit to undo two, which is worse than saying which landed.
 */
export async function applyTemplateCommit(plan: CommitPlan): Promise<CommitOutcome[]> {
  const out: CommitOutcome[] = [];
  for (const step of plan.steps) {
    const r = await run(step.argv, { timeoutMs: 60_000 });
    out.push({
      file: step.file,
      ok: r.ok,
      error: r.ok ? undefined : (r.stderr || r.failure || `gh exited with ${r.code}`).trim(),
    });
  }
  return out;
}
