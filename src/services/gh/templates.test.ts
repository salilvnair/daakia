/**
 * Bringing forms in from somewhere else.
 *
 * The rules worth a test are the ones about not doing more than was asked: a
 * read of the repository being copied from and nothing else, an entry in a zip
 * that will not inflate skipped rather than fatal, and a commit plan that knows
 * the difference between adding a file and replacing one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deflateRawSync } from 'zlib';

const run = vi.fn();
vi.mock('./gh', () => ({ run: (...a: unknown[]) => run(...a) }));

const {
  applyTemplateCommit, fetchTemplatesFrom, isForm, planTemplateCommit, readZip, starterSet,
} = await import('./templates');

beforeEach(() => run.mockReset());

/** A zip entry, in the two methods a zip of text actually uses. */
function entry(name: string, text: string, deflate: boolean): Buffer {
  const body = deflate ? deflateRawSync(Buffer.from(text)) : Buffer.from(text);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(deflate ? 8 : 0, 8);
  head.writeUInt32LE(body.length, 18);
  head.writeUInt32LE(Buffer.byteLength(text), 22);
  head.writeUInt16LE(Buffer.byteLength(name), 26);
  return Buffer.concat([head, Buffer.from(name), body]);
}

describe('isForm', () => {
  it('takes a .yml, and leaves GitHub’s own config.yml alone', () => {
    expect(isForm('bug_report.yml')).toBe(true);
    expect(isForm('bug.yaml')).toBe(true);
    expect(isForm('config.yml')).toBe(false);
    expect(isForm('README.md')).toBe(false);
  });
});

describe('fetchTemplatesFrom', () => {
  it('reads the folder, then each form, and writes nothing', async () => {
    run
      .mockResolvedValueOnce({ ok: true, stdout: JSON.stringify([
        { name: 'bug.yml', type: 'file', path: '.github/ISSUE_TEMPLATE/bug.yml' },
        { name: 'config.yml', type: 'file', path: '.github/ISSUE_TEMPLATE/config.yml' },
      ]) })
      .mockResolvedValueOnce({ ok: true, stdout: JSON.stringify({
        encoding: 'base64', content: Buffer.from('name: Bug').toString('base64'),
      }) });

    const out = await fetchTemplatesFrom('acme/app');
    expect(out.files).toEqual([{ file: 'bug.yml', text: 'name: Bug' }]);
    for (const call of run.mock.calls) {
      expect(call[0]).not.toContain('--method');
    }
  });

  it('says plainly when the folder is not there', async () => {
    run.mockResolvedValue({ ok: false, stderr: 'HTTP 404: Not Found' });
    const out = await fetchTemplatesFrom('acme/app');
    expect(out.error).toMatch(/no \.github\/ISSUE_TEMPLATE folder/);
  });

  it('keeps the forms it could read when one file fails', async () => {
    run
      .mockResolvedValueOnce({ ok: true, stdout: JSON.stringify([
        { name: 'a.yml', type: 'file', path: 'p/a.yml' },
        { name: 'b.yml', type: 'file', path: 'p/b.yml' },
      ]) })
      .mockResolvedValueOnce({ ok: false, stderr: 'boom' })
      .mockResolvedValueOnce({ ok: true, stdout: JSON.stringify({
        encoding: 'base64', content: Buffer.from('name: B').toString('base64'),
      }) });
    const out = await fetchTemplatesFrom('acme/app');
    expect(out.files.map(f => f.file)).toEqual(['b.yml']);
  });
});

describe('readZip', () => {
  it('reads a stored entry and a deflated one', () => {
    const zip = Buffer.concat([
      entry('bug.yml', 'name: Bug', false),
      entry('task.yml', 'name: Task', true),
    ]);
    expect(readZip(zip)).toEqual([
      { file: 'bug.yml', text: 'name: Bug' },
      { file: 'task.yml', text: 'name: Task' },
    ]);
  });

  it('takes the file name out of a folder inside the zip', () => {
    expect(readZip(entry('ISSUE_TEMPLATE/bug.yml', 'name: Bug', false))[0].file).toBe('bug.yml');
  });

  it('ignores everything that is not a form', () => {
    const zip = Buffer.concat([
      entry('README.md', '# hi', false),
      entry('__MACOSX/bug.yml', 'junk', false),
      entry('bug.yml', 'name: Bug', false),
    ]);
    expect(readZip(zip).map(f => f.file)).toEqual(['bug.yml']);
  });

  it('returns nothing rather than throwing on something that is not a zip', () => {
    expect(readZip(Buffer.from('not a zip at all'))).toEqual([]);
  });
});

describe('starterSet', () => {
  it('is three forms whose dropdowns are the dimensions dkgh can read', () => {
    const set = starterSet();
    expect(set.map(f => f.file)).toEqual(['bug_report.yml', 'enhancement.yml', 'task.yml']);
    for (const f of set) {
      expect(f.text).toContain('label: Module');
      expect(f.text).toContain('label: Environment');
    }
  });
});

describe('planTemplateCommit', () => {
  it('is one PUT per file, and refuses an empty list', async () => {
    run.mockResolvedValue({ ok: false });
    expect((await planTemplateCommit('acme/app', [], 'm')).refusal).toBeTruthy();

    const plan = await planTemplateCommit(
      'acme/app', [{ file: 'bug.yml', text: 'name: Bug' }], 'Add forms',
    );
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].argv.slice(0, 4))
      .toEqual(['api', '--method', 'PUT', '/repos/acme/app/contents/.github/ISSUE_TEMPLATE/bug.yml']);
  });

  it('sends the base64 of the file, not the file', async () => {
    run.mockResolvedValue({ ok: false });
    const plan = await planTemplateCommit('a/b', [{ file: 'x.yml', text: 'hello' }], 'm');
    expect(plan.steps[0].argv).toContain(`content=${Buffer.from('hello').toString('base64')}`);
  });

  it('carries the sha when it would be replacing a file, and says so', async () => {
    run.mockResolvedValue({ ok: true, stdout: JSON.stringify({ sha: 'abc123' }) });
    const plan = await planTemplateCommit('a/b', [{ file: 'x.yml', text: 'hi' }], 'm');
    expect(plan.steps[0].replaces).toBe('abc123');
    expect(plan.steps[0].argv).toContain('sha=abc123');
    expect(plan.steps[0].display).toMatch(/replacing what is there/);
  });

  it('does not put the base64 in what the screen shows', async () => {
    run.mockResolvedValue({ ok: false });
    const plan = await planTemplateCommit('a/b', [{ file: 'x.yml', text: 'hello' }], 'm');
    expect(plan.steps[0].display).not.toContain('aGVsbG8');
  });
});

describe('applyTemplateCommit', () => {
  it('reports per file, and a failure does not stop the rest', async () => {
    run
      .mockResolvedValueOnce({ ok: false, stderr: 'HTTP 409' })
      .mockResolvedValueOnce({ ok: true, stdout: '{}' });
    const out = await applyTemplateCommit({
      repo: 'a/b',
      steps: [
        { file: 'a.yml', path: 'p', argv: ['api'], display: '' },
        { file: 'b.yml', path: 'p', argv: ['api'], display: '' },
      ],
    });
    expect(out).toEqual([
      { file: 'a.yml', ok: false, error: 'HTTP 409' },
      { file: 'b.yml', ok: true, error: undefined },
    ]);
  });
});
