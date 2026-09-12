/**
 * The HTML docs page.
 *
 * Two things matter here and nothing else really does. The page must be
 * self-contained — it gets committed to a repo and opened from a file:// URL
 * on a laptop with no network — and everything in it comes from whatever
 * server the user talks to, so every value must arrive as text rather than as
 * markup.
 */
import { describe, it, expect } from 'vitest';
import { buildDocsHtml, renderMarkdown, esc, type DocsNode } from './docs-bundle';

const node = (over: Partial<DocsNode> = {}): DocsNode => ({
  id: 'c1', name: 'Payments', children: [], requests: [], ...over,
});

const request = (data: Record<string, unknown> = {}) => ({
  id: 'r1abcdef', name: 'Create charge', method: 'POST',
  url: 'https://api.pay.test/charges', data: JSON.stringify(data),
});

describe('self-contained', () => {
  const html = buildDocsHtml([node({ requests: [request()] })], 'Payments API');

  it('is a complete document', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
  });

  /* A docs page that needs the internet to render is a docs page that fails
     exactly when someone is debugging. */
  it('fetches nothing at open time', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\/(?:cdn|fonts|unpkg)/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
  });

  it('carries its own styles and a nav', () => {
    expect(html).toContain('<style>');
    expect(html).toContain('<nav>');
  });
});

describe('escaping, because this is other people\'s data', () => {
  it('renders a script tag in a name as text', () => {
    const html = buildDocsHtml([node({
      name: '<script>alert(1)</script>',
      requests: [request()],
    })]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes a response body, which is whatever a server sent', () => {
    const html = buildDocsHtml([node({
      requests: [request({ examples: [{ status: 200, name: 'ok', body: '<img src=x onerror=alert(1)>' }] })],
    })]);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('escapes a URL and a header value', () => {
    const html = buildDocsHtml([node({
      requests: [{
        ...request({ headers: [{ key: 'X-Evil', value: '"><script>x</script>', enabled: true }] }),
        url: 'https://x.test/"><script>y</script>',
      }],
    })]);
    expect(html).not.toMatch(/<script>[xy]<\/script>/);
  });

  it('escapes the five characters that matter', () => {
    expect(esc(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });
});

describe('what a request section contains', () => {
  const html = buildDocsHtml([node({
    requests: [request({
      docs: '## Charges\nNeeds an **idempotency key**.\n\n- POST only\n- `201` on success',
      headers: [{ key: 'X-Tenant', value: 'eu-west', enabled: true }],
      params: [{ key: 'dry_run', value: 'true', enabled: true }],
      bodyRaw: '{"amount":100}',
      examples: [
        { status: 201, name: 'Created', body: '{"id":"ch_1"}' },
        { status: 402, name: 'Card declined', body: '{"error":"declined"}' },
      ],
    })],
  })]);

  it('shows the method and URL', () => {
    expect(html).toContain('POST');
    expect(html).toContain('https://api.pay.test/charges');
  });

  it('renders the docs text as markdown, not as a blob', () => {
    expect(html).toContain('<strong>idempotency key</strong>');
    expect(html).toContain('<li>POST only</li>');
    expect(html).toContain('<code>201</code>');
  });

  it('tables the headers and the params', () => {
    expect(html).toContain('X-Tenant');
    expect(html).toContain('dry_run');
  });

  it('shows every saved example, with its status', () => {
    expect(html).toContain('201');
    expect(html).toContain('Card declined');
    expect(html).toContain('{&quot;error&quot;:&quot;declined&quot;}');
  });

  /* Green for a 2xx and red for a 4xx: the page is read by scanning, and a
     wall of identical status chips is not scannable. */
  it('tones a success apart from a failure', () => {
    expect(html).toContain('st-ok');
    expect(html).toContain('st-warn');
  });

  it('omits a section that has nothing in it', () => {
    const bare = buildDocsHtml([node({ requests: [request()] })]);
    expect(bare).not.toContain('Query parameters');
    expect(bare).not.toContain('Responses');
  });
});

describe('the nav', () => {
  it('links every collection, folder and request', () => {
    const html = buildDocsHtml([node({
      requests: [request()],
      children: [{ id: 'f1', name: 'Refunds', children: [], requests: [] }],
    })]);
    expect(html).toContain('>Payments<');
    expect(html).toContain('>Refunds<');
    expect(html).toContain('>Create charge<');
  });

  it('gives every link a target that exists in the page', () => {
    const html = buildDocsHtml([node({ requests: [request()] })]);
    const hrefs = [...html.matchAll(/href="#([^"]+)"/g)].map(m => m[1]!);
    expect(hrefs.length).toBeGreaterThan(1);
    for (const href of hrefs) expect(html).toContain(`id="${href}"`);
  });
});

describe('the markdown subset', () => {
  it('handles headings, lists, code fences and links', () => {
    const out = renderMarkdown('# Title\n\n- one\n- two\n\n```\ncode()\n```\n\n[docs](https://x.test)');
    expect(out).toContain('<h3>Title</h3>');
    expect(out).toContain('<li>one</li>');
    expect(out).toContain('<pre class="code"><code>');
    expect(out).toContain('href="https://x.test"');
  });

  /* `javascript:` in a description is exactly what this page must render as
     text rather than as a link. */
  it('only linkifies http(s)', () => {
    const out = renderMarkdown('[click](javascript:alert(1))');
    expect(out).not.toContain('href=');
    expect(out).toContain('[click]');
  });

  it('leaves markup inside the source as text', () => {
    expect(renderMarkdown('<b>not bold</b>')).toContain('&lt;b&gt;');
  });

  it('closes a fence nobody closed', () => {
    expect(renderMarkdown('```\nunterminated').match(/<\/code><\/pre>/g)).toHaveLength(1);
  });
});
