import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { sections, searchDocs, loadManual, runDaakiaDocs } from './daakia-docs';

const MD = `# Title
intro
## Mock server
Local servers for ten protocols. Routes have rules; the first rule that matches answers.
### Rules
A rule matches on path params, headers and body. The fallback response answers when none match.
## Dk8s — Kubernetes in the editor
Pods, logs and search across pods.
\`\`\`
## not a heading inside a fence
\`\`\`
`;

describe('the manual, split', () => {
  it('splits at ## and ###, keeping the parent in the path, and ignores fenced #', () => {
    expect(sections(MD).map(s => s.path)).toEqual(['Mock server', 'Mock server › Rules', 'Dk8s — Kubernetes in the editor']);
  });
});

describe('looking something up', () => {
  it('ranks the section that has the words in its heading first', () => {
    expect(searchDocs(MD, 'mock server rules fallback')[0].path).toBe('Mock server › Rules');
  });

  it('finds nothing for words the manual does not have', () => {
    expect(searchDocs(MD, 'blockchain wallet')).toEqual([]);
  });

  it('says plainly when nothing matches', () => {
    expect(runDaakiaDocs('blockchain wallet', MD).text).toContain('Nothing in the Daakia manual');
  });
});

describe('the real manual', () => {
  it('is found from the source tree and answers a mock-server question from its Mock server section', () => {
    const md = loadManual(path.resolve(__dirname));
    expect(md.length).toBeGreaterThan(10_000);
    const { result } = runDaakiaDocs('mock server route rules', md);
    expect(result.sources.some(s => /mock server/i.test(s))).toBe(true);
  });
});
