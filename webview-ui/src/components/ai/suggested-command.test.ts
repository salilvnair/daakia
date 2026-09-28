import { describe, it, expect } from 'vitest';
import { splitKubectlBlocks } from './SuggestedCommand';

describe('splitKubectlBlocks — which code blocks get a Run row', () => {
  it('turns a bash block holding one kubectl command into a command', () => {
    const parts = splitKubectlBlocks('Worth checking:\n\n```bash\nkubectl get pods -n com-zp-prod -o wide\n```\n\nThen look at events.');
    expect(parts).toEqual([
      { kind: 'md', text: 'Worth checking:\n\n' },
      { kind: 'cmd', command: 'kubectl get pods -n com-zp-prod -o wide' },
      { kind: 'md', text: '\n\nThen look at events.' },
    ]);
  });

  it('gives each command in a block its own row, and drops a leading $', () => {
    const parts = splitKubectlBlocks('```sh\n$ kubectl get pods\n# then\nkubectl describe pod p\n```');
    expect(parts.filter(p => p.kind === 'cmd').map(p => (p as { command: string }).command))
      .toEqual(['kubectl get pods', 'kubectl describe pod p']);
  });

  it('leaves pipes, other tools and other languages as code', () => {
    for (const block of [
      '```bash\nkubectl logs p | grep ERROR\n```',
      '```bash\ncurl http://x\n```',
      '```yaml\nkubectl: no\n```',
      '```bash\nkubectl get pods; rm -rf /\n```',
    ]) {
      expect(splitKubectlBlocks(block)).toEqual([{ kind: 'md', text: block }]);
    }
  });

  it('leaves an answer with no code alone', () => {
    expect(splitKubectlBlocks('All good.')).toEqual([{ kind: 'md', text: 'All good.' }]);
  });
});
