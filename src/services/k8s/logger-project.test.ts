/**
 * One walk of a small Spring-and-Python project, and what comes back from it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readProject, profilesIn } from './logger-project';
import { parsePodLoggerOutput, podLoggerScript } from './logger-pod';

let root = '';

async function put(rel: string, text: string) {
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, text, 'utf8');
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dk8s-project-'));
  await put('pom.xml', '<project><artifactId>spring-boot-starter-parent</artifactId><version>3.2.1</version><modules><module>a</module></modules></project>');
  await put('src/main/resources/logback-spring.xml',
    '<configuration><logger name="com.acme.orders" level="INFO"/><springProfile name="prod"><logger name="org.hibernate.SQL" level="WARN"/></springProfile></configuration>');
  await put('src/main/resources/application-prod.yaml', 'logging:\n  level:\n    com.acme.payments: ERROR\n');
  await put('src/test/resources/logback-test.xml', '<configuration><logger name="test.only" level="DEBUG"/></configuration>');
  await put('src/main/java/com/acme/bcbl/BcblClient.java',
    'package com.acme.bcbl;\n@Slf4j\npublic class BcblClient {\n  void f() {\n    log.info("checking bcbl api for request:{}", reqId);\n    log.warn("bcbl api slow for request:{} took {}ms", reqId, tookMs);\n  }\n}\n');
  await put('src/main/java/com/acme/Quiet.java', 'package com.acme;\n@Slf4j\nclass Quiet {}\n');
  await put('src/main/java/com/acme/NoLogger.java', 'package com.acme;\nclass NoLogger {}\n');
  await put('workers/settlement.py', 'import logging\nlog = logging.getLogger(__name__)\nlog.info("settled %s", batch_id)\n');
  await put('node_modules/x/index.js', 'log.info("never read")');
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('reading a project', () => {
  it('reads configs, classes and calls in one walk', async () => {
    const read = await readProject(root);

    expect(read.build).toBe('Spring Boot 3.2 · Maven · 1 module');
    expect(read.configs.map(c => c.file).sort()).toEqual([
      'src/main/resources/application-prod.yaml',
      'src/main/resources/logback-spring.xml',
    ]);
    expect(read.profiles).toEqual(['prod', 'default']);

    const names = read.classes.map(c => c.name).sort();
    expect(names).toEqual(['com.acme.Quiet', 'com.acme.bcbl.BcblClient', 'workers.settlement']);
    expect(read.classes.find(c => c.name === 'com.acme.bcbl.BcblClient')?.calls).toBe(2);
    expect(read.classes.find(c => c.name === 'com.acme.Quiet')?.calls).toBe(0);

    expect(read.hits.map(h => h.logger)).toEqual(expect.arrayContaining(['com.acme.bcbl.BcblClient', 'workers.settlement']));
    expect(read.hits.some(h => h.code.includes('never read'))).toBe(false);
    expect(read.fingerprint).toMatch(/^\d+:\d+$/);
  });

  it('puts prod first and default last', () => {
    expect(profilesIn([{ file: 'x', kind: 'yaml', levels: [{ profile: 'dev', levels: {} }, { profile: '!prod', levels: {} }] }]))
      .toEqual(['prod', 'dev', 'default']);
  });
});

describe('reading a pod', () => {
  it('splits the script output into files and actuator', () => {
    const out = [
      '@@FILE /app/resources/logback-spring.xml',
      '<configuration><logger name="com.acme.orders" level="DEBUG"/></configuration>',
      '',
      '@@END',
      '@@ACTUATOR 8081',
      JSON.stringify({ loggers: {
        com: { configuredLevel: null, effectiveLevel: 'INFO' },
        'com.acme.orders': { configuredLevel: 'DEBUG', effectiveLevel: 'DEBUG' },
        'com.acme.orders.OrderService': { configuredLevel: null, effectiveLevel: 'DEBUG' },
      } }),
      '@@END',
    ].join('\n');
    const read = parsePodLoggerOutput(out);
    expect(read.files).toHaveLength(1);
    expect(read.files[0].path).toBe('/app/resources/logback-spring.xml');
    expect(read.files[0].loggers[0]).toEqual({ name: 'com.acme.orders', level: 'DEBUG', profile: undefined });
    expect(read.actuator?.port).toBe('8081');
    expect(read.actuator?.loggers.map(l => l.name)).toEqual(['com.acme.orders', 'com.acme.orders.OrderService']);
  });

  it('answers nothing for a pod that had nothing', () => {
    expect(parsePodLoggerOutput('')).toEqual({ files: [] });
  });

  it('writes nothing in the container', () => {
    const script = podLoggerScript();
    expect(script).not.toMatch(/>\s*\/(?!dev\/null)/);
    expect(script).not.toMatch(/\brm\b|\bmv\b|\btee\b/);
  });
});
