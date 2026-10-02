import { describe, it, expect } from 'vitest';
import { envKey, envBaseUrl, envModel, parseDotEnv, loadDotEnv } from './env-provider';

describe('reading a provider from the environment', () => {
  const env = {
    DEEPSEEK_API_KEY: '  sk-test  ',
    DEEPSEEK_API_URL: 'https://api.deepseek.com/v1/',
    // Exactly what was in the repo's .env: a tab before the model name.
    DEEPSEEK_MODEL: '\tdeepseek-flash',
  } as NodeJS.ProcessEnv;

  it('trims what a hand-edited file leaves around a value', () => {
    expect(envKey('deepseek', env)).toBe('sk-test');
    expect(envModel('deepseek', env)).toBe('deepseek-flash');
  });

  it('drops a trailing slash, so the endpoint is not joined as //chat', () => {
    expect(envBaseUrl('deepseek', env)).toBe('https://api.deepseek.com/v1');
  });

  it('is nothing for a provider with nothing set, not an empty string', () => {
    expect(envKey('openai', env)).toBeUndefined();
    expect(envKey('not-a-provider', env)).toBeUndefined();
  });

  it('treats a variable set to whitespace as unset', () => {
    expect(envKey('deepseek', { DEEPSEEK_API_KEY: '   ' } as NodeJS.ProcessEnv)).toBeUndefined();
  });
});

describe('parsing a .env', () => {
  it('reads KEY=value lines and skips comments and blanks', () => {
    expect(parseDotEnv('# keys\n\nA=1\nB = two \n')).toEqual({ A: '1', B: 'two' });
  });

  it('takes one layer of quotes off', () => {
    expect(parseDotEnv('A="quoted value"\nB=\'single\'')).toEqual({ A: 'quoted value', B: 'single' });
  });

  it('keeps an = inside the value', () => {
    expect(parseDotEnv('URL=https://x.test/?a=b')).toEqual({ URL: 'https://x.test/?a=b' });
  });

  it('accepts an export prefix and Windows line endings', () => {
    expect(parseDotEnv('export A=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' });
  });

  it('ignores a line that is not an assignment', () => {
    expect(parseDotEnv('just words\n=nokey\n1BAD=x')).toEqual({});
  });
});

describe('loading a .env', () => {
  it('never overrides what is already exported', () => {
    // A variable set for this run is a deliberate choice; a file on disk
    // should not quietly replace it.
    const env = { A: 'from-shell' } as NodeJS.ProcessEnv;
    const loaded = loadDotEnv('A=from-file\nB=new', env);
    expect(env.A).toBe('from-shell');
    expect(env.B).toBe('new');
    expect(loaded).toEqual(['B']);
  });

  it('reports names only, never values', () => {
    const loaded = loadDotEnv('SECRET=sk-live-123', {} as NodeJS.ProcessEnv);
    expect(loaded).toEqual(['SECRET']);
    expect(loaded.join()).not.toContain('sk-live');
  });
});
