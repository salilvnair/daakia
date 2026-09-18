import { describe, it, expect } from 'vitest';
import { TEMPLATE_HELPERS, HELPER_CATEGORY_LABELS } from './catalog';
import { renderTemplate } from './render';
import { requestContext } from './request-context';
import { getAllResolvers } from '../variables';

/*
  The catalogue is a hand-written list describing a hand-written if-chain, so
  the two can disagree in both directions: an entry for a helper that was
  never implemented, and a helper that was renamed while its entry stayed.
  Both are the kind of thing a reader only discovers by typing the suggestion
  and getting nothing.

  So every example here is executed against the real engine.
*/
const ctx = requestContext({
  method: 'POST',
  url: 'https://api.example.com/v1/orders?page=3',
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: '{"id":"A-1"}',
});

describe('every helper the catalogue offers', () => {
  it.each(TEMPLATE_HELPERS.map(h => [h.name, h] as const))(
    '%s does something when you run its example',
    (_name, helper) => {
      const source = helper.testWith ?? helper.example;
      const out = renderTemplate(source, ctx, { keepUnknown: true });
      // keepUnknown hands back the call verbatim when the engine has no
      // meaning for it — which is exactly the failure this is looking for.
      expect(out).not.toBe(source);
      expect(out).not.toBe('');
    },
  );

  it('offers no helper twice', () => {
    const names = TEMPLATE_HELPERS.map(h => h.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every entry a category that has a label', () => {
    for (const h of TEMPLATE_HELPERS) {
      expect(HELPER_CATEGORY_LABELS[h.category]).toBeTruthy();
    }
  });

  it('writes every example as a real call, braces and all', () => {
    for (const h of TEMPLATE_HELPERS) {
      expect(h.example.startsWith('{{')).toBe(true);
      expect(h.example.endsWith('}}')).toBe(true);
    }
  });
});

describe('the dynamic variables the host will send to the webview', () => {
  it('carries what a suggestion list needs for each one', () => {
    const all = getAllResolvers();
    expect(all.length).toBeGreaterThan(20);
    for (const r of all) {
      expect(r.name).toBeTruthy();
      expect(r.description).toBeTruthy();
      expect(r.category).toBeTruthy();
    }
  });

  it('resolves each one through the template engine as {{$name}}', () => {
    // The registry and the engine were separate vocabularies until the
    // engine started consulting it; this is the join being tested, not the
    // resolvers themselves.
    for (const r of getAllResolvers()) {
      const out = renderTemplate(`{{$${r.name}}}`, ctx, { keepUnknown: true });
      expect(out).not.toBe(`{{$${r.name}}}`);
    }
  });

  it('does not duplicate a name the helper catalogue already uses', () => {
    /*
      `{{randomInt 1 100}}` is a helper and `{{$randomInt}}` is a registry
      entry, and they are told apart by the `$`. A suggestion list showing
      both has to show them as two different things, which it can only do if
      nothing is offering the same spelling twice.
    */
    const helpers = new Set(TEMPLATE_HELPERS.map(h => h.name));
    for (const r of getAllResolvers()) {
      expect(helpers.has(`$${r.name}`)).toBe(false);
    }
  });
});
