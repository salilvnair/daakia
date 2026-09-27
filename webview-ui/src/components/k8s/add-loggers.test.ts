/**
 * Add loggers: every source ends in the same table, and switching the profile
 * changes the levels in it.
 */
import { describe, it, expect } from 'vitest';
import {
  projectCandidates, projectGroups, podCandidates, pasteCandidates, viewCandidates, configuredLevels,
  effectiveLevel, patternsForLoggers, type ProjectReadMsg,
} from './add-loggers';

const READ: ProjectReadMsg = {
  folder: '/work/orders-service',
  build: 'Spring Boot 3.2 · Maven · 2 modules',
  profiles: ['prod', 'dev', 'default'],
  configs: [
    {
      file: 'src/main/resources/logback-spring.xml', kind: 'logback',
      loggers: [
        { name: 'com.acme.orders', level: 'INFO' },
        { name: 'org.hibernate.SQL', level: 'DEBUG' },
        { name: 'com.acme.payments', level: 'DEBUG', profile: 'dev' },
      ],
      root: [{ name: 'ROOT', level: 'INFO' }, { name: 'ROOT', level: 'WARN', profile: 'prod' }],
    },
    {
      file: 'src/main/resources/application-prod.yaml', kind: 'yaml',
      levels: [{ profile: 'prod', levels: { 'com.acme.payments.CaptureClient': 'ERROR' } }],
    },
  ],
  classes: [
    { name: 'com.acme.bcbl.BcblClient', file: 'src/main/java/com/acme/bcbl/BcblClient.java', language: 'java', declared: true, calls: 4, test: false },
    { name: 'com.acme.orders.OrderService', file: 'src/main/java/com/acme/orders/OrderService.java', language: 'java', declared: true, calls: 11, test: false },
    { name: 'com.acme.payments.CaptureClient', file: 'src/main/java/com/acme/payments/CaptureClient.java', language: 'java', declared: true, calls: 7, test: false },
    { name: 'workers.settlement', file: 'workers/settlement.py', language: 'python', declared: true, calls: 19, test: false },
    { name: 'com.acme.FakeTest', file: 'src/test/java/FakeTest.java', language: 'java', declared: true, calls: 1, test: true },
  ],
  hits: [
    { file: 'bcbl/BcblClient.java', line: 3, code: 'log.info("checking bcbl api for request:{}", reqId)', language: 'java', test: false, logger: 'com.acme.bcbl.BcblClient' },
    { file: 'bcbl/BcblClient.java', line: 4, code: 'log.debug("raw {}", body)', language: 'java', test: false, logger: 'com.acme.bcbl.BcblClient' },
    { file: 'orders/OrderService.java', line: 9, code: 'log.info("order {} accepted", id)', language: 'java', test: false, logger: 'com.acme.orders.OrderService' },
  ],
  filesRead: 12,
  fingerprint: '12:1',
};

describe('a project', () => {
  it('lists config loggers and classes once each, without test classes', () => {
    const c = projectCandidates(READ, 'prod', new Set());
    expect(c.map(x => x.name).sort()).toEqual([
      'com.acme.bcbl.BcblClient', 'com.acme.orders', 'com.acme.orders.OrderService',
      'com.acme.payments.CaptureClient', 'org.hibernate.SQL', 'workers.settlement',
    ]);
    expect(c.find(x => x.name === 'com.acme.payments.CaptureClient')).toMatchObject({
      level: 'ERROR', source: 'code', from: 'payments/CaptureClient.java', groups: ['levels', 'classes'], patterns: 7,
    });
    expect(c.find(x => x.name === 'org.hibernate.SQL')).toMatchObject({ library: true, from: 'logback-spring.xml · library' });
    expect(c.find(x => x.name === 'com.acme.orders')!.from).toBe('logback-spring.xml · <logger>');
  });

  it('switching the profile changes the levels', () => {
    const prod = projectCandidates(READ, 'prod', new Set());
    const dev = projectCandidates(READ, 'dev', new Set());
    expect(prod.find(x => x.name === 'com.acme.bcbl.BcblClient')!.level).toBe('WARN');
    expect(dev.find(x => x.name === 'com.acme.bcbl.BcblClient')!.level).toBe('INFO');
    expect(prod.find(x => x.name === 'com.acme.orders.OrderService')!.level).toBe('INFO');
    expect(dev.some(x => x.name === 'com.acme.payments')).toBe(true);
    expect(prod.some(x => x.name === 'com.acme.payments')).toBe(false);
  });

  it('takes the nearest configured package', () => {
    const { levels, root } = configuredLevels(READ.configs, 'dev');
    expect(effectiveLevel('com.acme.payments.X', levels, root)).toBe('DEBUG');
    expect(effectiveLevel('net.other.Y', levels, root)).toBe('INFO');
  });

  it('names the chips after what they read', () => {
    const c = projectCandidates(READ, 'prod', new Set());
    expect(projectGroups(READ, c, 'prod')).toEqual([
      { id: 'xml', label: 'src/main/resources/logback-spring.xml', count: 2 },
      { id: 'levels', label: 'application-prod.yaml · logging.level', count: 1 },
      { id: 'classes', label: 'classes with a logger', count: 3 },
      { id: 'python', label: 'workers/ (python)', count: 1 },
    ]);
  });

  it('counts found, new and already there over the same set', () => {
    const c = projectCandidates(READ, 'prod', new Set(['com.acme.orders']));
    const v = viewCandidates(c, { skipLibrary: true, onlyNew: true, query: '' });
    expect(v.found).toBe(5);
    expect(v.already).toBe(1);
    expect(v.fresh).toBe(4);
    expect(v.shown.map(x => x.name)).not.toContain('com.acme.orders');
    expect(viewCandidates(c, { skipLibrary: false, onlyNew: false, query: 'hiber' }).shown.map(x => x.name))
      .toEqual(['org.hibernate.SQL']);
    expect(viewCandidates(c, { groups: new Set(['python']), skipLibrary: true, onlyNew: false, query: '' }).found).toBe(1);
  });

  it('takes the patterns of the chosen loggers, DEBUG left off', () => {
    const ps = patternsForLoggers(READ.hits, new Set(['com.acme.bcbl.BcblClient']));
    expect(ps.map(p => [p.template, p.logger, p.source])).toEqual([
      ['checking bcbl api for request:{reqId}', 'com.acme.bcbl.BcblClient', 'scan'],
    ]);
  });
});

describe('a pod and a paste', () => {
  it('takes the pod’s file, and Actuator’s level over it', () => {
    const c = podCandidates({
      files: [{ path: '/app/resources/logback-spring.xml', loggers: [{ name: 'com.acme.orders', level: 'INFO' }], root: [] }],
      actuator: { port: '8081', loggers: [{ name: 'com.acme.orders', level: 'DEBUG' }, { name: 'com.acme.orders.OrderService', level: 'DEBUG' }] },
    }, 'prod', new Set());
    expect(c).toEqual([
      expect.objectContaining({ name: 'com.acme.orders', level: 'DEBUG', groups: ['pod', 'actuator'], from: 'logback-spring.xml · in the pod' }),
      expect.objectContaining({ name: 'com.acme.orders.OrderService', from: '/actuator/loggers :8081' }),
    ]);
  });

  it('reads a pasted list', () => {
    expect(pasteCandidates('com.acme.a INFO\norg.hibernate.SQL', new Set(['com.acme.a']))).toEqual([
      expect.objectContaining({ name: 'com.acme.a', level: 'INFO', existing: true, source: 'hand' }),
      expect.objectContaining({ name: 'org.hibernate.SQL', library: true }),
    ]);
  });
});
