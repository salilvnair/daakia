/**
 * The shared file is readable by everyone with the repo and editable by any of
 * them, so what goes into it must be exactly the listed prefs, and what comes
 * out of it must be checked like any other input.
 */
import { describe, it, expect } from 'vitest';
import { pickDk8sPrefs, readTeamEntry, DK8S_SHARED_PREF_KEYS } from './dk8s-shared-prefs';

describe('what a shared workspace carries', () => {
  it('is the catalogue and the custom field readers', () => {
    expect([...DK8S_SHARED_PREF_KEYS]).toEqual(['dk8s.loggers', 'dk8s.fields.custom']);
  });

  it('takes only the listed keys out of everything prefs hold', () => {
    const prefs = {
      'dk8s.loggers': '{"patterns":[]}',
      'dk8s.fields.custom': '[]',
      'settings.section': 'dk8s-logs',
      'dk8s.starred': '["prod/pay/Deployment/payments"]',
    };
    expect(pickDk8sPrefs(prefs)).toEqual({ 'dk8s.loggers': '{"patterns":[]}', 'dk8s.fields.custom': '[]' });
  });

  it('skips values that are not strings, empty, or absurdly large', () => {
    expect(pickDk8sPrefs({ 'dk8s.loggers': 42 })).toEqual({});
    expect(pickDk8sPrefs({ 'dk8s.loggers': '' })).toEqual({});
    expect(pickDk8sPrefs({ 'dk8s.loggers': 'x'.repeat(600 * 1024) })).toEqual({});
  });

  it('is nothing, not an error, when there are no prefs', () => {
    expect(pickDk8sPrefs(undefined)).toEqual({});
    expect(pickDk8sPrefs('nope')).toEqual({});
  });
});

describe('reading a kept entry back', () => {
  const entry = {
    workspaceId: 'shared-alice-ws1', workspaceName: 'Payments', ownerId: 'alice-id', ownerName: 'Alice',
    prefs: { 'dk8s.loggers': '{"patterns":[]}', 'settings.section': 'about' },
  };

  it('keeps the listed prefs and drops anything a hand-edited file slipped in', () => {
    expect(readTeamEntry(entry)?.prefs).toEqual({ 'dk8s.loggers': '{"patterns":[]}' });
  });

  it('drops an entry with nothing shared left in it', () => {
    expect(readTeamEntry({ ...entry, prefs: { 'settings.section': 'about' } })).toBeUndefined();
  });

  it('drops a malformed entry rather than handing it to a page', () => {
    expect(readTeamEntry(null)).toBeUndefined();
    expect(readTeamEntry({ ...entry, workspaceId: 7 })).toBeUndefined();
  });

  it('names an owner who gave no name by the start of their id', () => {
    expect(readTeamEntry({ ...entry, ownerName: '' })?.ownerName).toBe('alice-id'.slice(0, 8));
  });
});
