/**
 * Port and context path are two settings, and both change the URL.
 *
 * Getting the port right and the prefix wrong gives a whole collection of 404s
 * that look like the application is broken rather than the scan — which is why
 * this has more tests than anything else of its size here.
 */
import { describe, it, expect } from 'vitest';
import { springBaseUrl, readYaml, readProperties, profiles, resolvePlaceholder } from './base-url';
import type { RepoRoot } from '../api-detector';

const repo = (files: Record<string, string>): RepoRoot => ({
  dir: '/repo', files: Object.keys(files), read: (r) => files[r],
});

describe('the base URL', () => {
  it('joins port and context path', () => {
    const r = repo({
      'src/main/resources/application.yml':
        'server:\n  port: 8443\n  servlet:\n    context-path: /checkout-api/v2\n',
    });
    expect(springBaseUrl(r)?.url).toBe('http://localhost:8443/checkout-api/v2');
  });

  it('falls back to 8080, and says it did', () => {
    const r = repo({ 'src/main/resources/application.yml': 'spring:\n  application:\n    name: x\n' });
    const b = springBaseUrl(r)!;
    expect(b.url).toBe('http://localhost:8080');
    expect(b.parts.port.kind).toBe('generated');
  });

  it('reports where each part was read', () => {
    const r = repo({
      'src/main/resources/application.yml':
        'server:\n  port: 9000\n  servlet:\n    context-path: /api\n',
    });
    const b = springBaseUrl(r)!;
    expect(b.parts.port).toMatchObject({ kind: 'read', at: { line: 2 } });
    expect(b.parts.contextPath).toMatchObject({ kind: 'read', at: { line: 4 } });
  });

  it('goes https when ssl is on', () => {
    const r = repo({ 'src/main/resources/application.yml': 'server:\n  port: 8443\n  ssl:\n    enabled: true\n' });
    expect(springBaseUrl(r)?.url).toBe('https://localhost:8443');
  });

  it('takes the reactive base path too', () => {
    const r = repo({ 'application.yml': 'spring:\n  webflux:\n    base-path: /rx\nserver:\n  port: 8080\n' });
    expect(springBaseUrl(r)?.url).toBe('http://localhost:8080/rx');
  });

  it('normalises a context path written without a slash', () => {
    const r = repo({ 'application.properties': 'server.port=8080\nserver.servlet.context-path=api/v1/\n' });
    expect(springBaseUrl(r)?.url).toBe('http://localhost:8080/api/v1');
  });

  it('treats an empty context path as none', () => {
    const r = repo({ 'application.yml': 'server:\n  port: 8080\n  servlet:\n    context-path: /\n' });
    expect(springBaseUrl(r)?.url).toBe('http://localhost:8080');
  });
});

describe('profiles', () => {
  const files = {
    'src/main/resources/application.yml': 'server:\n  port: 8080\n  servlet:\n    context-path: /app\n',
    'src/main/resources/application-local.yml': 'server:\n  port: 8443\n',
    'src/main/resources/application-prod.yml': 'server:\n  port: 443\n',
  };

  it('are listed from the files present', () => {
    expect(profiles(repo(files))).toEqual(['local', 'prod']);
  });

  it('override the base file rather than merging with it', () => {
    // The profile's port wins; the base file's context path survives, because
    // the profile says nothing about it.
    expect(springBaseUrl(repo(files), 'local')?.url).toBe('http://localhost:8443/app');
    expect(springBaseUrl(repo(files), 'prod')?.url).toBe('http://localhost:443/app');
  });

  it('use only the base file when no profile is chosen', () => {
    expect(springBaseUrl(repo(files))?.url).toBe('http://localhost:8080/app');
  });

  it('ignore test configuration', () => {
    /* `src/test/resources/application.yml` describes a test run on a random
       port — not the application anybody wants to call. */
    const r = repo({
      'src/main/resources/application.yml': 'server:\n  port: 8080\n',
      'src/test/resources/application.yml': 'server:\n  port: 0\n',
    });
    expect(springBaseUrl(r)?.url).toBe('http://localhost:8080');
  });
});

describe('placeholders', () => {
  it('resolve to the default, which is what an unset variable gives you', () => {
    expect(resolvePlaceholder('${SERVER_PORT:8443}')).toBe('8443');
  });
  it('with no default resolve to nothing, not to the literal', () => {
    expect(resolvePlaceholder('${SERVER_PORT}')).toBe('');
  });
  it('leave an ordinary value alone', () => {
    expect(resolvePlaceholder('8080')).toBe('8080');
  });
});

describe('the readers', () => {
  it('read nested yaml into dotted keys', () => {
    const m = readYaml('server:\n  servlet:\n    context-path: /a\n', 'f.yml');
    expect(m.get('server.servlet.context-path')?.value).toBe('/a');
  });

  it('dedent correctly when a sibling follows a nested block', () => {
    const m = readYaml('server:\n  servlet:\n    context-path: /a\n  port: 9\nspring:\n  x: y\n', 'f.yml');
    expect(m.get('server.port')?.value).toBe('9');
    expect(m.get('spring.x')?.value).toBe('y');
  });

  it('ignore comments and inline comments', () => {
    const m = readYaml('# server:\nserver:\n  port: 8080 # the default\n', 'f.yml');
    expect(m.get('server.port')?.value).toBe('8080');
  });

  it('read properties, last key winning', () => {
    const m = readProperties('server.port=1\nserver.port=2\n#server.port=3\n', 'f.properties');
    expect(m.get('server.port')?.value).toBe('2');
  });

  it('strip quotes from a yaml scalar', () => {
    expect(readYaml('server:\n  servlet:\n    context-path: "/a"\n', 'f.yml')
      .get('server.servlet.context-path')?.value).toBe('/a');
  });
});
