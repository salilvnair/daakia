/**
 * The detector is the part that can be confidently wrong.
 *
 * A mistranslation announces itself — the output is nonsense and nobody ships
 * it. A misdetection does not: it quietly picks the wrong mapping table, the
 * model produces something plausible in the wrong dialect, and the reader has
 * no reason to doubt it. So the cases that matter here are the overlaps, and
 * the snippets that belong to nobody.
 */
import { describe, it, expect } from 'vitest';
import { detectDialect, shouldOfferConversion, dialectLabel } from './detect-dialect';

const js = (...lines: string[]) => lines.join('\n');

describe('detectDialect — the unambiguous cases', () => {
  it('finds Postman', () => {
    const d = detectDialect(js(
      'pm.test("Status is 200", function () {',
      '  pm.response.to.have.status(200);',
      '});',
      'pm.environment.set("userId", pm.response.json().users[0].id);',
    ));
    expect(d.dialect).toBe('postman');
    expect(d.kind).toBe('script');
    expect(d.signals).toContain('pm.*');
  });

  it('finds legacy Postman without pm.*', () => {
    expect(detectDialect('postman.setEnvironmentVariable("token", "abc");').dialect).toBe('postman');
  });

  it('finds Bruno', () => {
    const d = detectDialect(js(
      'test("status is ok", function () {',
      '  expect(res.getStatus()).to.equal(200);',
      '});',
      'bru.setEnvVar("token", res.getBody().token);',
    ));
    expect(d.dialect).toBe('bruno');
    expect(d.kind).toBe('script');
  });

  it('finds Insomnia', () => {
    expect(detectDialect('insomnia.environment.set("id", insomnia.response.json().id);').dialect).toBe('insomnia');
  });

  it('finds Insomnia from a template tag alone', () => {
    expect(detectDialect("{% response 'body', 'req_123', '$.token' %}").dialect).toBe('insomnia');
  });

  it('finds Thunder Client', () => {
    expect(detectDialect('tc.setVar("token", json.token);').dialect).toBe('thunder-client');
  });

  it('finds Thunder Client from its exported tests JSON', () => {
    const d = detectDialect('{ "tests": [ { "type": "res-code", "action": "equal", "value": "200" } ] }');
    expect(d.dialect).toBe('thunder-client');
  });

  it('finds HTTPie and calls it a command, not a script', () => {
    const d = detectDialect('http POST api.example.com/users name=alice age:=30 X-Api-Key:abc123');
    expect(d.dialect).toBe('httpie');
    expect(d.kind).toBe('command');
  });

  it('finds cURL', () => {
    const d = detectDialect("curl -X POST https://api.example.com/users -H 'Content-Type: application/json' --data-raw '{}'");
    expect(d.dialect).toBe('curl');
    expect(d.kind).toBe('command');
  });
});

describe('detectDialect — the overlaps', () => {
  it('does not call Bruno "Postman" just because both use test() and expect()', () => {
    const d = detectDialect(js(
      'test("has a body", function () {',
      '  expect(res.getBody()).to.be.an("object");',
      '});',
    ));
    expect(d.dialect).toBe('bruno');
  });

  it('prefers Insomnia over Postman when the object name says so', () => {
    const d = detectDialect(js(
      'insomnia.test("ok", () => {',
      '  insomnia.expect(insomnia.response.code).to.equal(200);',
      '});',
    ));
    expect(d.dialect).toBe('insomnia');
  });

  it('reports a lower confidence when two dialects both score', () => {
    /* Bruno's res.getStatus() beside Postman's pm.* — a real snippet mid-port.
       The answer is still the stronger one, but it should not claim certainty. */
    const d = detectDialect(js(
      'pm.test("a", () => pm.expect(1).to.equal(1));',
      'bru.setEnvVar("x", res.getStatus());',
    ));
    expect(d.dialect).not.toBe('unknown');
    expect(d.confidence).toBeLessThan(0.8);
  });
});

describe('detectDialect — refusing to guess', () => {
  it('says unknown for plain JavaScript', () => {
    const d = detectDialect(js(
      'const total = items.reduce((a, b) => a + b.price, 0);',
      'console.log(total);',
    ));
    expect(d.dialect).toBe('unknown');
    expect(d.confidence).toBe(0);
  });

  it('says unknown for an empty or blank source', () => {
    expect(detectDialect('').dialect).toBe('unknown');
    expect(detectDialect('   \n  ').dialect).toBe('unknown');
  });

  it('says unknown for Daakia’s own scripts — there is nothing to convert', () => {
    const d = detectDialect(js(
      'dk.test("status is 200", () => {',
      '  dk.expect(dk.response.status).toBe(200);',
      '});',
    ));
    expect(d.dialect).toBe('unknown');
  });

  it('ignores a tool named only in a comment', () => {
    const d = detectDialect(js(
      '// ported from our old Postman collection',
      '/* pm.test used to live here */',
      'const id = 1;',
    ));
    expect(d.dialect).toBe('unknown');
  });

  it('does not treat one weak signal as an answer', () => {
    /* `responseBody` alone is weight 1 — consistent with Postman, proof of
       nothing, and a bare mention should not trigger a conversion offer. */
    expect(detectDialect('const x = responseBody;').dialect).toBe('unknown');
  });
});

describe('shouldOfferConversion', () => {
  it('offers on a clean detection', () => {
    expect(shouldOfferConversion(detectDialect('pm.environment.set("a", pm.response.json().a);'))).toBe(true);
  });

  it('stays quiet when nothing was detected', () => {
    expect(shouldOfferConversion(detectDialect('const a = 1;'))).toBe(false);
  });

  it('stays quiet on a muddled snippet rather than interrupting with a guess', () => {
    const muddled = detectDialect(js(
      'pm.test("a", () => {});',
      'bru.setEnvVar("x", 1);',
      'tc.setVar("y", 2);',
    ));
    expect(shouldOfferConversion(muddled)).toBe(false);
  });
});

describe('dialectLabel', () => {
  it('names each dialect, including the honest one', () => {
    expect(dialectLabel('postman')).toBe('Postman');
    expect(dialectLabel('thunder-client')).toBe('Thunder Client');
    expect(dialectLabel('unknown')).toBe('Unrecognised');
  });
});
