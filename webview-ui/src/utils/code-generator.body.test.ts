import { describe, it, expect } from 'vitest';
import { generateCode, type CodeGenInput } from './code-generator';

const input = (o: Partial<CodeGenInput>): CodeGenInput => ({
  method: 'POST', url: 'https://api.example.com/orders', headers: [], params: [],
  bodyMode: 'none', bodyRaw: '', bodyFormData: [], bodyUrlEncoded: [],
  authType: 'none', authData: {}, ...o,
});

describe('Show code carries the body', () => {
  it('includes a JSON body, which is its own body mode', () => {
    const sh = generateCode(input({ bodyMode: 'json', bodyRaw: '{"id":1}', bodyContentType: 'application/json' }), 'shell-curl');
    expect(sh).toContain(`--data '{"id":1}'`);
    expect(sh).toContain(`--header 'Content-Type: application/json'`);
    expect(generateCode(input({ bodyMode: 'json', bodyRaw: '{"id":1}' }), 'javascript-fetch')).toContain(`body: ${JSON.stringify('{"id":1}')}`);
  });

  it('keeps a Content-Type the request already sets', () => {
    const sh = generateCode(input({
      bodyMode: 'json', bodyRaw: '{}', headers: [{ key: 'content-type', value: 'application/vnd.api+json' }],
    }), 'shell-curl');
    expect(sh.match(/content-type/gi)).toHaveLength(1);
  });

  it('adds no body or header when there is none', () => {
    const sh = generateCode(input({ method: 'GET' }), 'shell-curl');
    expect(sh).not.toContain('--data');
    expect(sh).not.toContain('Content-Type');
  });
});
