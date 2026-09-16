/**
 * Classifying a kubectl call so it can be switched off by kind.
 *
 * The audit's own label contains the pod name, so it cannot be grouped —
 * "stop showing me permission probes" is not something you can say about
 * `logs reporting-api-547958c846-24rwc`. These are the kinds that can.
 */
import { describe, it, expect } from 'vitest';
import {
  commandKind, verbWords, commandCatalogue, defaultEnabled, enabledKinds,
  COMMAND_KINDS, OTHER_KIND,
} from './command-kinds';

const args = (s: string) => s.split(' ');

describe('finding the verb', () => {
  it('drops the flags and the values they take', () => {
    /* `--context prod` would otherwise read as the verb. */
    expect(verbWords(args('--context prod -n ns get pods'))).toEqual(['get', 'pods']);
  });

  it('keeps a value that is not a flag’s', () => {
    expect(verbWords(args('-n ns logs my-pod'))).toEqual(['logs', 'my-pod']);
  });
});

describe('what a call is', () => {
  const cases: [string, string][] = [
    ['--context c -n ns logs my-pod --tail=200', 'logs'],
    ['--context c -n ns get pods -o json', 'get-pods'],
    ['--context c -n ns get po', 'get-pods'],
    ['--context c -n ns get pod my-pod -o json', 'get-pod'],
    ['--context c -n ns describe pod my-pod', 'describe'],
    ['--context c -n ns exec my-pod -- ls -la', 'exec'],
    ['--context c -n ns cp my-pod:/tmp/x /local/x', 'cp'],
    ['--context c -n ns port-forward my-pod 8080:8080', 'port-forward'],
    ['--context c -n ns get events', 'events'],
    ['--context c get namespaces', 'namespaces'],
    ['config get-contexts -o name', 'contexts'],
    ['config use-context kind-dk8s-prod', 'use-context'],
    ['config view -o json', 'config-view'],
    ['--context c -n ns delete pod my-pod', 'delete'],
    ['--context c -n ns patch pod my-pod -p {}', 'patch'],
    ['--context c -n ns auth can-i create pods/exec', 'can-i'],
    ['--context c -n ns top pods --no-headers', 'top'],
    ['--context c version -o json', 'version'],
  ];

  for (const [argv, kind] of cases) {
    it(`reads \`${argv.slice(0, 44)}\` as ${kind}`, () => {
      expect(commandKind(args(argv))).toBe(kind);
    });
  }

  it('puts anything it does not name somewhere visible', () => {
    /* Never silently lost: a call nobody has catalogued still gets a row. */
    expect(commandKind(args('--context c rollout restart deploy/api'))).toBe(OTHER_KIND.id);
  });

  it('prefers the narrower pattern', () => {
    // `config use-context` must not be swallowed by the bare `config` rule.
    expect(commandKind(args('config use-context x'))).toBe('use-context');
    expect(commandKind(args('config view'))).toBe('config-view');
  });
});

describe('what is on to begin with', () => {
  it('is everything you caused', () => {
    const on = new Set(defaultEnabled());
    for (const id of ['logs', 'get-pods', 'exec', 'contexts', 'use-context', 'describe', 'cp']) {
      expect(on.has(id), id).toBe(true);
    }
  });

  it('is not dk8s asking itself something', () => {
    /* Seven permission probes per namespace and a metrics poll every fifteen
       seconds bury the handful of commands somebody actually ran. */
    const on = new Set(defaultEnabled());
    for (const id of ['can-i', 'top', 'version', 'get-pod', 'config-view']) {
      expect(on.has(id), id).toBe(false);
    }
  });

  it('names every kind exactly once', () => {
    const ids = commandCatalogue().map(k => k.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('says where each one comes from', () => {
    for (const k of commandCatalogue()) {
      expect(k.label.trim().length, k.id).toBeGreaterThan(0);
      expect(k.where.trim().length, k.id).toBeGreaterThan(0);
      expect(k.command.trim().length, k.id).toBeGreaterThan(0);
    }
  });
});

describe('what was stored', () => {
  it('is the defaults when nothing has been chosen', () => {
    expect(enabledKinds(undefined)).toEqual(new Set(defaultEnabled()));
  });

  it('is exactly what was chosen, including none of it', () => {
    /* An empty list is a real choice and must not be read as "unset" — the
       whole point of the page is being able to quieten everything. */
    expect(enabledKinds('[]').size).toBe(0);
    expect(enabledKinds('["logs"]')).toEqual(new Set(['logs']));
  });

  it('falls back rather than showing an empty screen on nonsense', () => {
    expect(enabledKinds('not json')).toEqual(new Set(defaultEnabled()));
    expect(enabledKinds('{"logs":true}')).toEqual(new Set(defaultEnabled()));
  });

  it('drops an id that no longer names anything', () => {
    expect(enabledKinds('["logs","rollout-restart"]')).toEqual(new Set(['logs']));
  });
});

describe('the catalogue itself', () => {
  it('classifies every kind it lists', () => {
    /* A row somebody can switch off that nothing is ever classified as would
       be a control that does nothing. */
    for (const k of COMMAND_KINDS) {
      expect(typeof k.match, k.id).toBe('function');
    }
  });
});
