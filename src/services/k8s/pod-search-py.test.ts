import { describe, it, expect } from 'vitest';
import { PY_SEARCH, parsePySearchLine, pySearchArgs } from './pod-search-py';

const t = { context: 'c', namespace: 'n', pod: 'p' };

describe('the python file search', () => {
  it('runs one unbuffered python with the options as a single JSON argument', () => {
    const args = pySearchArgs(t, 'python3', { root: '/', pattern: 'application.properties' });
    expect(args).not.toContain('-i');
    const at = args.indexOf('python3');
    expect(args.slice(at, at + 4)).toEqual(['python3', '-u', '-c', PY_SEARCH]);
    expect(JSON.parse(args[at + 4])).toEqual({
      root: '/', pattern: 'application.properties', mode: 'name', glob: '*application.properties*',
      caseSensitive: false, maxDepth: 8, kind: 'file', limit: 500, skipNetwork: true,
    });
  });

  it('reads a regex and a glob the way find does', () => {
    const regex = JSON.parse(pySearchArgs(t, 'python', { root: '/app', pattern: String.raw`\.ya?ml$`, maxDepth: 0 }).pop()!);
    expect(regex).toMatchObject({ mode: 'regex', maxDepth: 0 });
    const glob = JSON.parse(pySearchArgs(t, 'python', { root: '/', pattern: '*.pdf', skipNetwork: false }).pop()!);
    expect(glob).toMatchObject({ mode: 'glob', glob: '*.pdf', skipNetwork: false });
  });

  it('turns each printed line into a hit or a note about the walk', () => {
    expect(parsePySearchLine('{"p": "/app/config/application.yml", "k": "file", "s": 812, "m": "2026-11-20 09:14"}')).toEqual({
      hit: { path: '/app/config/application.yml', name: 'application.yml', kind: 'file', size: 812, modified: '2026-11-20 09:14' },
    });
    expect(parsePySearchLine('{"p": "/data", "k": "dir"}')).toEqual({ hit: { path: '/data', name: 'data', kind: 'dir' } });
    expect(parsePySearchLine('{"done": true, "scanned": 64890, "skipped": [{"path": "/mnt/share", "fs": "cifs"}], "ms": 2035}'))
      .toEqual({ trailer: { done: true, scanned: 64890, skipped: [{ path: '/mnt/share', fs: 'cifs' }], ms: 2035 } });
    expect(parsePySearchLine('Traceback (most recent call last):')).toBeUndefined();
  });

  it('stays inside the standard library', () => {
    const imports = PY_SEARCH.match(/^import .*$/m)![0];
    expect(imports).toBe('import fnmatch, json, os, re, sys, time');
  });
});
