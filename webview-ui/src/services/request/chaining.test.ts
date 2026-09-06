/**
 * Response chaining: a value from this response becomes a variable for the next.
 *
 * The feature shipped as an editor with an Apply button that posted a message
 * the host never handled, so nothing was ever set. These tests are about the
 * two halves that were missing: that a path finds the value it names, and
 * that the value lands in the environment the next request actually reads.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { applyChainExtractions, extractValue } from './chaining';
import { useTabsStore, type ChainExtraction } from '../../store/tabs-store';
import { useEnvStore, GLOBAL_ENV_ID } from '../../store/env-store';

const rule = (p: Partial<ChainExtraction> = {}): ChainExtraction => ({
  id: 'r1', source: 'body', path: 'data.token', variableName: 'token', enabled: true, ...p,
});

const BODY = JSON.stringify({
  data: { token: 'abc123', users: [{ id: 7, name: 'Ada' }], count: 0, nested: { a: 1 } },
});

describe('reading a value out of a response', () => {
  it('walks a dot path', () => {
    expect(extractValue(rule(), BODY, {})).toBe('abc123');
  });

  it('walks an index', () => {
    expect(extractValue(rule({ path: 'data.users[0].id' }), BODY, {})).toBe('7');
  });

  /* `0` and `false` are values. An early version used a truthiness check and
     dropped both, which is the kind of bug that surfaces as "chaining works
     except on the one field I need". */
  it('keeps a zero', () => {
    expect(extractValue(rule({ path: 'data.count' }), BODY, {})).toBe('0');
  });

  it('reports nothing for a path that is not there', () => {
    expect(extractValue(rule({ path: 'data.missing' }), BODY, {})).toBeUndefined();
  });

  it('reports nothing for a body that is not JSON', () => {
    expect(extractValue(rule(), '<html>nope</html>', {})).toBeUndefined();
  });

  it('serializes an object rather than saying [object Object]', () => {
    expect(extractValue(rule({ path: 'data.nested' }), BODY, {})).toBe('{"a":1}');
  });

  /* Servers send `Set-Cookie`, `set-cookie` and `SET-COOKIE`; a rule is typed
     once, by hand. */
  it('matches a header name whatever its casing', () => {
    const got = extractValue(
      rule({ source: 'header', path: 'x-request-id' }), '', { 'X-Request-Id': 'req-9' },
    );
    expect(got).toBe('req-9');
  });

  it('reads the status', () => {
    expect(extractValue(rule({ source: 'status' }), '', {}, 201)).toBe('201');
  });
});

describe('applying a chain to the environment', () => {
  beforeEach(() => {
    useTabsStore.setState({
      tabs: [{ id: 't1', chainExtractions: [] } as never],
      activeTabId: 't1',
    } as never);
    useEnvStore.setState({
      environments: [{ id: GLOBAL_ENV_ID, name: 'Global', isGlobal: true, variables: [] }],
      activeEnvId: null,
    } as never);
  });

  const setRules = (rules: ChainExtraction[]) =>
    useTabsStore.setState({ tabs: [{ id: 't1', chainExtractions: rules } as never] } as never);

  const varsOf = (envId: string) =>
    Object.fromEntries(
      (useEnvStore.getState().environments.find(e => e.id === envId)?.variables ?? [])
        .map(v => [v.key, v.currentValue]),
    );

  it('creates the variable when nothing declared it', () => {
    setRules([rule()]);
    const out = applyChainExtractions('t1', { body: BODY, headers: {} });
    expect(out.applied).toEqual([{ name: 'token', value: 'abc123' }]);
    expect(varsOf(GLOBAL_ENV_ID)).toEqual({ token: 'abc123' });
  });

  /* The session's value, not the collection's. `initialValue` is what an
     export carries, and a token pulled off a response must never end up in
     one. */
  it('writes the current value and leaves the initial one empty', () => {
    setRules([rule()]);
    applyChainExtractions('t1', { body: BODY, headers: {} });
    const v = useEnvStore.getState().environments[0]!.variables[0]!;
    expect(v.currentValue).toBe('abc123');
    expect(v.initialValue).toBe('');
  });

  it('updates a variable that already exists rather than adding a second', () => {
    useEnvStore.setState({
      environments: [{
        id: GLOBAL_ENV_ID, name: 'Global', isGlobal: true,
        variables: [{ id: 'v1', key: 'token', initialValue: 'seed', currentValue: 'old', isSecret: false }],
      }],
    } as never);
    setRules([rule()]);
    applyChainExtractions('t1', { body: BODY, headers: {} });
    const vars = useEnvStore.getState().environments[0]!.variables;
    expect(vars).toHaveLength(1);
    expect(vars[0]!.currentValue).toBe('abc123');
    // Untouched: the committed value is not the chain's to overwrite.
    expect(vars[0]!.initialValue).toBe('seed');
  });

  /* Writing into an inactive environment would leave `{{token}}` unresolved
     for the very request the chain exists to feed. */
  it('writes into the active environment when there is one', () => {
    useEnvStore.setState({
      environments: [
        { id: GLOBAL_ENV_ID, name: 'Global', isGlobal: true, variables: [] },
        { id: 'staging', name: 'Staging', variables: [] },
      ],
      activeEnvId: 'staging',
    } as never);
    setRules([rule()]);
    applyChainExtractions('t1', { body: BODY, headers: {} });
    expect(varsOf('staging')).toEqual({ token: 'abc123' });
    expect(varsOf(GLOBAL_ENV_ID)).toEqual({});
  });

  it('says which rules found nothing, and still applies the ones that did', () => {
    setRules([rule(), rule({ id: 'r2', path: 'data.nope', variableName: 'ghost' })]);
    const out = applyChainExtractions('t1', { body: BODY, headers: {} });
    expect(out.applied.map(a => a.name)).toEqual(['token']);
    expect(out.missed).toEqual(['ghost']);
  });

  it('ignores rules that are disabled or half-written', () => {
    setRules([
      rule({ enabled: false }),
      rule({ id: 'r2', path: '', variableName: 'noPath' }),
      rule({ id: 'r3', path: 'data.token', variableName: '' }),
    ]);
    expect(applyChainExtractions('t1', { body: BODY, headers: {} }).applied).toEqual([]);
    expect(varsOf(GLOBAL_ENV_ID)).toEqual({});
  });

  it('does nothing at all for a tab with no rules', () => {
    const out = applyChainExtractions('t1', { body: BODY, headers: {} });
    expect(out).toEqual({ applied: [], missed: [] });
  });
});
