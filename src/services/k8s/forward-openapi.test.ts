import { describe, it, expect } from 'vitest';
import { pointSpecAt } from './forward-openapi';

describe('pointing a spec at the forward', () => {
  it('replaces an OpenAPI 3 server and keeps its base path', () => {
    const spec = { openapi: '3.0.1', info: { title: 'zp' }, servers: [{ url: 'http://zp-backend.com-zp-dev.svc:8080/api/v1/' }], paths: {} };
    const r = pointSpecAt(JSON.stringify(spec), 8104);
    expect(r).toMatchObject({ pointed: true, title: 'zp' });
    expect(JSON.parse(r.text).servers).toEqual([{ url: 'http://localhost:8104/api/v1', description: 'dk8s port forward' }]);
  });

  it('adds a server when the spec has none, and takes a relative one', () => {
    expect(JSON.parse(pointSpecAt(JSON.stringify({ openapi: '3.1.0', paths: {} }), 9000).text).servers[0].url).toBe('http://localhost:9000');
    expect(JSON.parse(pointSpecAt(JSON.stringify({ openapi: '3.1.0', servers: [{ url: '/rest' }] }), 9000).text).servers[0].url).toBe('http://localhost:9000/rest');
  });

  it('points a Swagger 2 spec through host and schemes', () => {
    const s = JSON.parse(pointSpecAt(JSON.stringify({ swagger: '2.0', host: 'internal:80', basePath: '/v2', schemes: ['https'] }), 18080).text);
    expect(s).toMatchObject({ host: 'localhost:18080', schemes: ['http'], basePath: '/v2' });
  });

  it('leaves YAML and anything that is not a spec alone', () => {
    expect(pointSpecAt('openapi: 3.0.0', 1)).toEqual({ text: 'openapi: 3.0.0', pointed: false });
    expect(pointSpecAt('{"status":"UP"}', 1).pointed).toBe(false);
  });
});
