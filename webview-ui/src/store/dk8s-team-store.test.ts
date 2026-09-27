/**
 * A teammate's determinant arrives as a string inside their shared workspace,
 * and a malformed one must cost a missing row, never the page. Their ids must
 * never collide with yours, and switching one off must stay yours alone.
 */
import { describe, it, expect } from 'vitest';
import { teamDeterminants, teamOffIds, isTeamOn, teamPrefValues, type TeamDk8sSource } from './dk8s-team-store';
import { fromLoggerCall } from '../components/k8s/logger-pattern';

const catalogue = (patterns: unknown[]) => JSON.stringify({ patterns });
const api = { ...fromLoggerCall('log.info("{} {}", method, path)')!, id: 'p1', scope: '*', added: 1 };

const source = (prefs: Record<string, string>, workspaceId = 'shared-alice-ws1'): TeamDk8sSource => ({
  workspaceId, workspaceName: 'Payments', ownerId: 'alice', ownerName: 'Alice', prefs,
});

describe('a teammate\'s determinants', () => {
  it('are the patterns in their catalogue that summarise', () => {
    const got = teamDeterminants([source({
      'dk8s.loggers': catalogue([{ ...api, summary: { groupBy: ['path'] } }, { ...api, id: 'p2' }]),
    })]);
    expect(got).toHaveLength(1);
    expect(got[0].source.ownerName).toBe('Alice');
  });

  it('get an id that cannot collide with yours or another teammate\'s', () => {
    const one = { ...api, summary: { groupBy: ['path'] } };
    const got = teamDeterminants([
      source({ 'dk8s.loggers': catalogue([one]) }, 'shared-alice-ws1'),
      source({ 'dk8s.loggers': catalogue([one]) }, 'shared-bob-ws9'),
    ]);
    expect(got.map(d => d.pattern.id)).toEqual(['team:shared-alice-ws1:p1', 'team:shared-bob-ws9:p1']);
  });

  it('are none, not an error, when the catalogue is missing or malformed', () => {
    expect(teamDeterminants([source({})])).toEqual([]);
    expect(teamDeterminants([source({ 'dk8s.loggers': '{not json' })])).toEqual([]);
  });

  it('can be off for you, and are off for everyone when their author switched them off', () => {
    const [mine] = teamDeterminants([source({ 'dk8s.loggers': catalogue([{ ...api, summary: { groupBy: ['path'] } }]) })]);
    expect(isTeamOn(mine, new Set())).toBe(true);
    expect(isTeamOn(mine, new Set([mine.pattern.id]))).toBe(false);
    const [theirsOff] = teamDeterminants([source({ 'dk8s.loggers': catalogue([{ ...api, summary: { groupBy: ['path'], off: true } }]) })]);
    expect(isTeamOn(theirsOff, new Set())).toBe(false);
  });
});

describe('the ids switched off for you', () => {
  it('read back from what was stored', () => {
    expect([...teamOffIds('["a","b"]')]).toEqual(['a', 'b']);
  });

  it('are none when nothing, or nonsense, was stored', () => {
    expect(teamOffIds(undefined).size).toBe(0);
    expect(teamOffIds('{').size).toBe(0);
    expect(teamOffIds('{"a":1}').size).toBe(0);
  });
});

describe('any shared pref, by key', () => {
  it('lists each teammate\'s value with whose it is, and skips those without one', () => {
    const got = teamPrefValues([source({ 'dk8s.fields.custom': '[]' }), source({}, 'shared-bob-ws9')], 'dk8s.fields.custom');
    expect(got.map(g => [g.source.workspaceId, g.value])).toEqual([['shared-alice-ws1', '[]']]);
  });
});
