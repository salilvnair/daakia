/**
 * Converting Postman's Chai assertions into dk's matchers.
 *
 * An import that produces code which does not run is worse than one that
 * refuses: the collection looks converted, and every request fails the first
 * time it is sent, with a message ("to is not defined") that points at the
 * runtime rather than at the line nobody translated.
 *
 * Every case here is an assertion that appears in real exported collections.
 * The output is checked against the matcher names the runtime actually
 * defines — see `script-runtime/core/test-provider.ts` — because agreeing
 * with a matcher that does not exist is the same bug one step later.
 */
import { describe, it, expect } from 'vitest';
import { resolveScript } from './script-resolver';

/** What `dk.expect(...)` really answers to. Kept in step with the provider. */
const MATCHERS = new Set([
  'toBe', 'toEqual', 'toBeTruthy', 'toBeFalsy', 'toBeNull', 'toBeUndefined',
  'toBeDefined', 'toContain', 'toBeGreaterThan', 'toBeLessThan',
  'toBeGreaterThanOrEqual', 'toBeLessThanOrEqual', 'toBeWithin', 'toBeOneOf',
  'toBeType', 'toHaveLength', 'toMatch', 'toHaveProperty', 'toHaveStatus',
  'toMatchSchema',
]);

const convert = (src: string) => resolveScript(src, 'postman');

/** Every matcher the converted script calls on a dk.expect chain. */
function matchersUsed(code: string): string[] {
  return [...code.matchAll(/\.(?:not\.)?(to[A-Z]\w*)\s*\(/g)].map(m => m[1]!);
}

describe('the assertion that started this', () => {
  /*
    `pm.expect(pm.response.code).to.be.within(200, 299)` is the most common
    assertion in exported collections, and it converted to nothing: the text
    came through untouched, so the script threw on its first line.
  */
  it('converts a status range', () => {
    const out = convert(`pm.test('responded 2xx', function () {
  pm.expect(pm.response.code).to.be.within(200, 299);
});`);
    expect(out).toContain('.toBeWithin(200, 299)');
    expect(out).not.toContain('.to.be.within');
    expect(out).not.toContain('.to.');
  });

  it('leaves nothing that only Chai understands', () => {
    const out = convert(`pm.expect(pm.response.code).to.be.within(200, 299);`);
    for (const m of matchersUsed(out)) expect(MATCHERS.has(m)).toBe(true);
  });
});

describe('negation', () => {
  /*
    The worst of the old behaviour. `.to.not.equal(x)` became `toBe` with a
    "NOT" comment inside the argument list — an assertion that says the
    opposite of what was written and passes exactly when it should fail. A
    converted suite that silently inverts a test is worse than one that
    refuses to convert it.
  */
  it('does not invert the meaning of a not-equal', () => {
    const out = convert(`pm.expect(x).to.not.equal(5);`);
    expect(out).toContain('.not.toBe(5)');
    expect(out).not.toMatch(/NOT/);
  });

  it('handles not with a be-chain', () => {
    expect(convert(`pm.expect(x).to.not.be.null;`)).toContain('.not.toBeNull()');
  });

  it('handles not with a have-chain', () => {
    expect(convert(`pm.expect(o).to.not.have.property("id");`))
      .toContain('.not.toHaveProperty("id")');
  });
});

describe('the common Chai vocabulary', () => {
  it.each([
    ['pm.expect(a).to.equal(1);', '.toBe(1)'],
    ['pm.expect(a).to.eql({x:1});', '.toEqual({x:1})'],
    ['pm.expect(a).to.deep.equal({x:1});', '.toEqual({x:1})'],
    ['pm.expect(a).to.be.true;', '.toBeTruthy()'],
    ['pm.expect(a).to.be.false;', '.toBeFalsy()'],
    ['pm.expect(a).to.be.null;', '.toBeNull()'],
    ['pm.expect(a).to.be.undefined;', '.toBeUndefined()'],
    ['pm.expect(a).to.exist;', '.toBeDefined()'],
    ['pm.expect(a).to.be.above(3);', '.toBeGreaterThan(3)'],
    ['pm.expect(a).to.be.below(3);', '.toBeLessThan(3)'],
    ['pm.expect(a).to.be.at.least(3);', '.toBeGreaterThanOrEqual(3)'],
    ['pm.expect(a).to.be.at.most(3);', '.toBeLessThanOrEqual(3)'],
    ['pm.expect(a).to.be.oneOf([1,2]);', '.toBeOneOf([1,2])'],
    ['pm.expect(a).to.include("x");', '.toContain("x")'],
    ['pm.expect(a).to.have.property("id");', '.toHaveProperty("id")'],
    ['pm.expect(a).to.have.lengthOf(3);', '.toHaveLength(3)'],
    ['pm.expect(a).to.match(/ok/);', '.toMatch(/ok/)'],
    ['pm.expect(a).to.be.a("string");', '.toBeType("string")'],
    ['pm.expect(a).to.be.an("object");', '.toBeType("object")'],
  ])('%s', (input, expected) => {
    const out = convert(input);
    expect(out).toContain(expected);
    for (const m of matchersUsed(out)) expect(MATCHERS.has(m)).toBe(true);
  });

  it('converts the response-status idiom', () => {
    expect(convert(`pm.response.to.have.status(200);`)).toContain('.toHaveStatus(200)');
  });
});

describe('what it refuses to guess at', () => {
  /*
    An assertion with no counterpart is commented out rather than left to
    throw. Left alone it stops the whole script — every assertion after it
    included — and names nothing useful.
  */
  it('comments out an assertion it cannot convert', () => {
    const out = convert(`pm.expect(a).to.be.frobnicated(1);`);
    expect(out).toMatch(/\/\/ TODO: unsupported assertion/);
    expect(out.split('\n').every(l => l.trim().startsWith('//') || !l.includes('.to.be.frobnicated')))
      .toBe(true);
  });

  /*
    The converter rewrites code, so it has to be trusted not to rewrite code
    it does not understand. An earlier version matched `.to.` anywhere.
  */
  it('leaves a URL containing .to. alone', () => {
    const src = `dk.sendRequest({ url: "https://api.example.to.be/v1" });`;
    expect(convert(src)).toContain('https://api.example.to.be/v1');
  });

  it('leaves a property named to alone', () => {
    const src = `const mail = { to: "a@b.c" }; dk.env.set("x", mail.to);`;
    const out = convert(src);
    expect(out).toContain('mail.to');
    expect(out).not.toMatch(/TODO: unsupported/);
  });
});

describe('a whole imported test block', () => {
  it('converts end to end with nothing left over', () => {
    const out = convert(`pm.test("Status is 2xx", function () {
    pm.expect(pm.response.code).to.be.within(200, 299);
});
pm.test("Has an id", function () {
    const body = pm.response.json();
    pm.expect(body).to.have.property("id");
    pm.expect(body.id).to.not.equal(0);
});`);
    expect(out).toContain('dk.test(');
    expect(out).toContain('.toBeWithin(200, 299)');
    expect(out).toContain('.toHaveProperty("id")');
    expect(out).toContain('.not.toBe(0)');
    // The whole point: nothing Chai-shaped survives to reach the runtime.
    expect(out).not.toMatch(/\.to\.(be|have|equal|include|match)\b/);
    for (const m of matchersUsed(out)) expect(MATCHERS.has(m)).toBe(true);
  });
});

/*
  Bruno and Insomnia route through the same Chai pass, so the fix has to reach
  them too — they were as broken as Postman and would have stayed that way if
  the mappings had been bolted onto the Postman path alone.
*/
describe('the other importers', () => {
  it('converts a Bruno assertion', () => {
    const out = resolveScript(
      `test("ok", function() { expect(res.getStatus()).to.be.within(200, 299); });`,
      'bruno',
    );
    expect(out).toContain('dk.test(');
    expect(out).toContain('.toBeWithin(200, 299)');
    expect(out).not.toMatch(/\.to\.be\./);
  });

  it('converts an Insomnia assertion', () => {
    const out = resolveScript(
      `test("ok", function() { expect(1).to.not.equal(2); });`,
      'insomnia',
    );
    expect(out).toContain('.not.toBe(2)');
    expect(out).not.toMatch(/NOT/);
  });
});
