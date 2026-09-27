import { describe, it, expect } from 'vitest';
import {
  formatDuration, sessionClock, shortPythonVersion, podShort, relativeAge, filterScripts, groupScripts,
  statusFromExit, summarizeRuns, compareOutputs, inlineValues, newId,
} from './py-view';

describe('time', () => {
  it('formats durations the way the Output footer reads', () => {
    expect(formatDuration(850)).toBe('850ms');
    expect(formatDuration(1400)).toBe('1.4s');
    expect(formatDuration(123_000)).toBe('2m 03s');
    expect(formatDuration(undefined)).toBe('');
  });
  it('clocks a session', () => {
    expect(sessionClock(7_000)).toBe('00:07');
    expect(sessionClock(62_000)).toBe('01:02');
    expect(sessionClock(3_723_000)).toBe('1:02:03');
  });
  it('ages a script', () => {
    const now = Date.parse('2026-09-26T12:00:00Z');
    expect(relativeAge('2026-09-24T12:00:00Z', now)).toBe('2d');
    expect(relativeAge('2026-09-12T12:00:00Z', now)).toBe('2w');
    expect(relativeAge('2026-08-20T12:00:00Z', now)).toBe('1mo');
    expect(relativeAge(undefined, now)).toBe('');
  });
});

describe('names', () => {
  it('shortens a python version to major.minor', () => {
    expect(shortPythonVersion('Python 3.11.6')).toBe('3.11');
    expect(shortPythonVersion(undefined)).toBeUndefined();
  });
  it('keeps the part of a pod name that tells replicas apart', () => {
    expect(podShort('orders-api-7d9f8c4b-x2k9p')).toBe('x2k9p');
    expect(podShort('single')).toBe('single');
  });
  it('makes ids the host accepts', () => {
    expect(newId('r')).toMatch(/^[A-Za-z0-9_-]{4,64}$/);
  });
});

describe('library', () => {
  const lib = [
    { id: '1', name: 'check_db.py', folder: 'orders', source: 'urlopen(x)' },
    { id: '2', name: 'thread_dump.py', folder: 'diagnostics', source: 'import sys' },
    { id: '3', name: 'scratch.py', source: 'print(1)' },
  ];
  it('finds by name first, then by content', () => {
    expect(filterScripts(lib, 'thread').map(s => s.id)).toEqual(['2']);
    expect(filterScripts(lib, 'urlopen').map(s => s.id)).toEqual(['1']);
    expect(filterScripts(lib, '')).toHaveLength(3);
  });
  it('groups by folder, unfiled last', () => {
    expect(groupScripts(lib).map(g => g.folder)).toEqual(['diagnostics', 'orders', '']);
  });
});

describe('multi-pod summary', () => {
  it('counts ok and failed, refused and stopped as failed', () => {
    const s = summarizeRuns([{ status: 'ok' }, { status: 'ok' }, { status: 'failed' }]);
    expect(s).toMatchObject({ total: 3, ok: 2, failed: 1, running: 0, label: '2 ok · 1 failed' });
    expect(summarizeRuns([{ status: 'refused' }, { status: 'stopped' }]).failed).toBe(2);
  });
  it('says how far a run has got', () => {
    expect(summarizeRuns([{ status: 'running' }, { status: 'ok' }]).label).toBe('running 1 of 2 done · 1 ok');
    expect(summarizeRuns([]).label).toBe('nothing run yet');
  });
  it('turns an exit into a status', () => {
    expect(statusFromExit({ code: 0 })).toBe('ok');
    expect(statusFromExit({ code: 1 })).toBe('failed');
    expect(statusFromExit({ code: null, refused: 'python 2' })).toBe('refused');
    expect(statusFromExit({ code: null, stopped: true })).toBe('stopped');
  });
});

describe('compareOutputs', () => {
  it('lines up output by position and marks what differs', () => {
    const rows = compareOutputs([
      { pod: 'orders-api-x2k9p', text: 'orders-api-x2k9p {"active": 4}\nok\n' },
      { pod: 'orders-api-m4t7q', text: 'orders-api-m4t7q {"active": 2}\nok\n' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].same).toBe(false);
    expect(rows[1].same).toBe(true);
  });
  it('treats the pod printing its own name as the same line', () => {
    const rows = compareOutputs([
      { pod: 'a-1', text: 'host a-1' },
      { pod: 'a-2', text: 'host a-2' },
    ]);
    expect(rows[0].same).toBe(true);
  });
  it('pads a shorter output rather than dropping lines', () => {
    const rows = compareOutputs([{ pod: 'a', text: '1\n2\n3' }, { pod: 'b', text: '1' }]);
    expect(rows.map(r => r.cells)).toEqual([['1', '1'], ['2', ''], ['3', '']]);
  });
});

describe('inlineValues', () => {
  const vars = [
    { name: 'data', value: "{'status': 'UP', 'components': {...}}" },
    { name: 'r', value: '<http.client.HTTPResponse object>' },
    { name: 'status', value: "'UP'" },
  ];
  it('shows the variables the paused line uses', () => {
    expect(inlineValues('    return data["components"]["db"]["details"]', vars))
      .toBe("data = {'status': 'UP', 'components': {...}}");
  });
  it('skips attributes, strings and comments', () => {
    expect(inlineValues('x = r.status  # status here', vars)).toBe('r = <http.client.HTTPResponse object>');
    expect(inlineValues('print("status data")', vars)).toBe('');
  });
  it('truncates a long value', () => {
    expect(inlineValues('data', [{ name: 'data', value: 'x'.repeat(100) }], 3, 10)).toBe(`data = ${'x'.repeat(9)}…`);
  });
});
