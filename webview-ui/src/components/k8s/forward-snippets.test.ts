import { describe, it, expect } from 'vitest';
import { envLines, applicationYml, snippetsFor, jdbcUrl, clientCommand, targetName } from './forward-snippets';

const backend = { pod: 'zp-backend-1', workload: { kind: 'Deployment', name: 'zp-backend' }, ports: [{ local: 8080, remote: 8080, role: 'http' as const }, { local: 18081, remote: 8081, role: 'actuator' as const }] };
const pg = { pod: 'postgres-1', workload: { kind: 'Deployment', name: 'postgres' }, ports: [{ local: 15432, remote: 5432, role: 'postgres' as const }] };
const py = { pod: 'zp-python-1', service: 'zp-python', ports: [{ local: 18000, remote: 80, role: 'http' as const }] };

describe('forward snippets', () => {
  it('names a forward by its Service, then its workload, then its pod', () => {
    expect(targetName(py)).toBe('zp-python');
    expect(targetName(backend)).toBe('zp-backend');
    expect(targetName({ pod: 'lonely' })).toBe('lonely');
  });

  it('writes one .env line per port', () => {
    expect(envLines([backend, pg])).toBe([
      'ZP_BACKEND_URL=http://localhost:8080',
      'ZP_BACKEND_MANAGEMENT_URL=http://localhost:18081',
      'POSTGRES_URL=postgresql://<user>:<password>@localhost:15432/<database>',
    ].join('\n'));
  });

  it('writes a Spring block for a set, leaving the secrets to fill in', () => {
    expect(applicationYml([pg, py], 'backend local dev')).toBe([
      '# application-local.yml — from the "backend local dev" set',
      'spring.datasource.url: jdbc:postgresql://localhost:15432/<database>',
      'spring.datasource.username: <user>',
      'spring.datasource.password: <password>',
      'zp.python.base-url: http://localhost:18000',
      '# <user>, <password> and <database>: fill in — dk8s never reads Secrets',
    ].join('\n'));
  });

  it('gives data ports their JDBC URL and client command', () => {
    expect(jdbcUrl(pg.ports[0])).toBe('jdbc:postgresql://localhost:15432/<database>');
    expect(clientCommand(pg.ports[0])).toBe('psql -h localhost -p 15432 -U <user> <database>');
    expect(clientCommand({ local: 16379, remote: 6379, role: 'redis' })).toBe('redis-cli -h 127.0.0.1 -p 16379');
    expect(jdbcUrl(backend.ports[0])).toBeUndefined();
  });

  it('lists what a forward can be copied as, in menu order', () => {
    expect(snippetsFor({ ...pg, command: 'kubectl port-forward …' }).map(s => s.id)).toEqual(['url', 'env', 'yml', 'jdbc:15432', 'cli:15432', 'kubectl']);
    expect(snippetsFor(backend).map(s => s.id)).toEqual(['url', 'env', 'yml']);
  });
});
