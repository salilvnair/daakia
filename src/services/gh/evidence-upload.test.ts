/**
 * Getting a screenshot onto GitHub.
 *
 * The rules worth pinning are the ones somebody would only discover from a
 * broken issue: the branch that is created once and not on `main`, the blob URL
 * that renders on a private repository where a raw URL does not, and a branch
 * that already exists not being a failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
vi.mock('./gh', () => ({ run: (...a: unknown[]) => run(...a) }));

const {
  applyUpload, blobUrl, bytesOf, planUpload, safeName, COMFORTABLE_BYTES,
} = await import('./evidence-upload');

beforeEach(() => run.mockReset());

const file = (over = {}) => ({ name: 'ab12cd.png', base64: 'aGVsbG8=', ...over });

/** The branch exists, so no branch step is planned. */
function branchExists() {
  run.mockResolvedValue({ ok: true, stdout: JSON.stringify({ object: { sha: 'deadbeef' } }) });
}

describe('safeName', () => {
  it('keeps the extension and gives it a name of its own', () => {
    expect(safeName('Screenshot 2026-09-10 at 09.14.22.png', 'aaaa')).toMatch(/^[0-9a-f]{6}\.png$/);
  });

  it('normalises jpg to jpeg, and defaults to png', () => {
    expect(safeName('shot.jpg', 'a')).toMatch(/\.jpeg$/);
    expect(safeName('pasted', 'a')).toMatch(/\.png$/);
  });

  it('gives two different images two different names', () => {
    expect(safeName('a.png', 'aaaaaaaa')).not.toBe(safeName('a.png', 'bbbbbbbb'));
  });
});

describe('bytesOf', () => {
  it('reads the size off the base64 without decoding it', () => {
    expect(bytesOf(Buffer.from('hello').toString('base64'))).toBe(5);
    expect(bytesOf(Buffer.from('hi').toString('base64'))).toBe(2);
  });
});

describe('blobUrl', () => {
  it('is the blob URL with ?raw=1, which renders on a private repository', () => {
    expect(blobUrl('acme/app', 'dkgh-evidence', 'ab12cd.png'))
      .toBe('https://github.com/acme/app/blob/dkgh-evidence/.dkgh/evidence/ab12cd.png?raw=1');
  });

  it('is not raw.githubusercontent.com, which needs its own token', () => {
    expect(blobUrl('a/b', 'x', 'y.png')).not.toContain('raw.githubusercontent');
  });
});

describe('planUpload', () => {
  it('refuses an empty list', async () => {
    expect((await planUpload('a/b', [])).refusal).toBeTruthy();
  });

  it('plans no branch step when the branch is already there', async () => {
    branchExists();
    const plan = await planUpload('a/b', [file()]);
    expect(plan.steps.map(s => s.kind)).toEqual(['file']);
  });

  it('creates the branch off the repository’s default, not off main by assumption',
    async () => {
      run
        .mockResolvedValueOnce({ ok: false, stderr: 'HTTP 404' })
        .mockResolvedValueOnce({ ok: true, stdout: JSON.stringify({ default_branch: 'trunk' }) })
        .mockResolvedValueOnce({ ok: true, stdout: JSON.stringify({ object: { sha: 'abc' } }) });
      const plan = await planUpload('a/b', [file()]);
      expect(plan.steps[0].kind).toBe('branch');
      expect(plan.steps[0].does).toContain('off trunk');
      expect(plan.steps[0].argv).toContain('sha=abc');
    });

  it('commits onto the evidence branch, never the default one', async () => {
    branchExists();
    const [step] = (await planUpload('a/b', [file()])).steps;
    expect(step.argv).toContain('branch=dkgh-evidence');
    expect(step.argv).toContain('/repos/a/b/contents/.dkgh/evidence/ab12cd.png');
  });

  it('does not put the base64 in what the screen shows', async () => {
    branchExists();
    const [step] = (await planUpload('a/b', [file({ base64: 'SUPERSECRETBASE64' })])).steps;
    expect(step.display).not.toContain('SUPERSECRET');
    expect(step.argv).toContain('content=SUPERSECRETBASE64');
  });

  it('names a file too big to be kind to whoever opens the issue', async () => {
    branchExists();
    const big = 'a'.repeat(COMFORTABLE_BYTES * 2);
    const plan = await planUpload('a/b', [file({ base64: big, label: 'huge.png' })]);
    expect(plan.heavy).toEqual([{ name: 'huge.png', bytes: bytesOf(big) }]);
    /* Named, not blocked — it is still planned. */
    expect(plan.steps).toHaveLength(1);
  });

  it('gives up plainly when it cannot read the repository at all', async () => {
    run.mockResolvedValue({ ok: false, stderr: 'HTTP 404' });
    expect((await planUpload('a/b', [file()])).refusal).toMatch(/could not read/);
  });
});

describe('applyUpload', () => {
  const plan = (steps: unknown[]) => ({ repo: 'a/b', branch: 'dkgh-evidence',
    steps: steps as never, heavy: [] });

  it('answers with a URL per file that landed', async () => {
    run.mockResolvedValue({ ok: true, stdout: '{}' });
    const out = await applyUpload(plan([
      { kind: 'file', name: 'x.png', does: '', argv: ['api'], display: '' },
    ]));
    expect(out[0].url).toBe(blobUrl('a/b', 'dkgh-evidence', 'x.png'));
  });

  it('treats a branch that already exists as done, not as a failure', async () => {
    run
      .mockResolvedValueOnce({ ok: false, stderr: 'Reference already exists' })
      .mockResolvedValueOnce({ ok: true, stdout: '{}' });
    const out = await applyUpload(plan([
      { kind: 'branch', name: 'dkgh-evidence', does: '', argv: ['api'], display: '' },
      { kind: 'file', name: 'x.png', does: '', argv: ['api'], display: '' },
    ]));
    expect(out).toHaveLength(1);
    expect(out[0].ok).toBe(true);
  });

  it('stops when the branch genuinely could not be made — there is nowhere to put it',
    async () => {
      run.mockResolvedValue({ ok: false, stderr: 'HTTP 403: protected' });
      const out = await applyUpload(plan([
        { kind: 'branch', name: 'dkgh-evidence', does: '', argv: ['api'], display: '' },
        { kind: 'file', name: 'x.png', does: '', argv: ['api'], display: '' },
      ]));
      expect(out).toEqual([
        { name: 'dkgh-evidence', ok: false, error: 'HTTP 403: protected' },
      ]);
    });

  it('keeps the files that worked when one does not', async () => {
    run
      .mockResolvedValueOnce({ ok: false, stderr: 'HTTP 413' })
      .mockResolvedValueOnce({ ok: true, stdout: '{}' });
    const out = await applyUpload(plan([
      { kind: 'file', name: 'big.png', does: '', argv: ['api'], display: '' },
      { kind: 'file', name: 'ok.png', does: '', argv: ['api'], display: '' },
    ]));
    expect(out.map(o => o.ok)).toEqual([false, true]);
    expect(out[1].url).toBeTruthy();
  });
});
