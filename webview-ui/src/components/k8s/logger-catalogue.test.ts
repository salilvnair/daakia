/**
 * The catalogue's table: which loggers exist, how often they fired in the
 * window, and which never did.
 */
import { describe, it, expect } from 'vitest';
import {
  loggerMatches, packageOf, isLibrary, linesInWindow, buildRows, filterRows, isSilent, isOffAtLevel,
  packageCounts, sourceCounts, parseLoggerList, exportCatalogue, ago, sortRows,
} from './logger-catalogue';
import type { CatalogueLogger, CataloguePattern } from '../../store/dk8s-logger-store';
import type { LogLine } from '../../store/k8s-store';

const NOW = Date.parse('2026-09-26T14:10:00Z');
let seq = 0;
const line = (text: string, over: Partial<LogLine> = {}): LogLine =>
  ({ seq: ++seq, ts: NOW - 60_000, level: 'info', text, ...over });

const stored = (name: string, over: Partial<CatalogueLogger> = {}): CatalogueLogger =>
  ({ id: `l-${name}`, name, source: 'config', scope: 's', added: 1, ...over });

const pattern = (template: string, holes: string[], over: Partial<CataloguePattern> = {}): CataloguePattern =>
  ({ id: `p-${template}`, template, holes, source: 'paste', scope: 's', added: 1, ...over });

describe('names', () => {
  it('matches logback’s shortened names', () => {
    expect(loggerMatches('com.acme.orders.OrderService', 'c.a.o.OrderService')).toBe(true);
    expect(loggerMatches('com.acme.orders.OrderService', 'OrderService')).toBe(true);
    expect(loggerMatches('com.acme.orders.OrderService', 'c.a.p.OrderService')).toBe(false);
    expect(loggerMatches('com.acme.orders.OrderService', 'OrderServiceImpl')).toBe(false);
  });

  it('groups a library by vendor and the app by module', () => {
    expect(packageOf('com.acme.orders.OrderService')).toBe('com.acme.orders');
    expect(packageOf('com.acme.payments')).toBe('com.acme.payments');
    expect(packageOf('org.hibernate.SQL')).toBe('org.hibernate');
    expect(packageOf('org.springframework.web.servlet.DispatcherServlet')).toBe('org.springframework');
    expect(packageOf('workers.settlement')).toBe('workers');
    expect(packageOf('web:checkout')).toBe('web');
    expect(isLibrary('io.lettuce.core.RedisClient')).toBe(true);
    expect(isLibrary('com.acme.x')).toBe(false);
  });
});

describe('the window', () => {
  it('keeps the lines inside it, and takes a log with no times whole', () => {
    const lines = [line('old', { ts: NOW - 3 * 3_600_000 }), line('new')];
    expect(linesInWindow(lines, '2h', NOW).map(l => l.text)).toEqual(['new']);
    expect(linesInWindow(lines, 'all', NOW)).toHaveLength(2);
    const plain = [line('a', { ts: undefined })];
    expect(linesInWindow(plain, '15m', NOW)).toHaveLength(1);
  });
});

describe('the rows', () => {
  const loggers = [
    stored('com.acme.orders.OrderService', { level: 'INFO' }),
    stored('com.acme.orders.ReconciliationJob', { level: 'INFO' }),
    stored('org.hibernate.SQL', { level: 'DEBUG' }),
    stored('com.acme.orders.audit.AuditTrail', { source: 'hand' }),
  ];
  const patterns = [
    pattern('Order {orderId} accepted for customer {customerId}', ['orderId', 'customerId'], { logger: 'com.acme.orders.OrderService' }),
    pattern('Reconciliation sweep finished in {ms}ms', ['ms'], { logger: 'com.acme.orders.ReconciliationJob' }),
    pattern('order.rejected written for {orderId}', ['orderId']),
  ];
  const buffer = [
    line('Order A-1 accepted for customer C-1', { logger: 'c.a.o.OrderService' }),
    line('Order A-2 accepted for customer C-2', { logger: 'c.a.o.OrderService' }),
    line('Payment capture failed', { logger: 'com.acme.payments.CaptureClient', level: 'error' }),
    line('order.rejected written for A-2'),
  ];
  const rows = buildRows(loggers, patterns, buffer, buffer);
  const row = (name: string) => rows.find(r => r.name === name)!;

  it('counts a logger by its name on the line and its patterns', () => {
    expect(row('com.acme.orders.OrderService').events).toBe(2);
    expect(row('com.acme.orders.OrderService').patterns[0].count).toBe(2);
    expect(row('com.acme.orders.OrderService').sources).toEqual(['config', 'seen']);
  });

  it('adds what the log names and nobody declared', () => {
    expect(row('com.acme.payments.CaptureClient').primary).toBe('seen');
    expect(row('com.acme.payments.CaptureClient').events).toBe(1);
  });

  it('files a pattern with no logger under the blank row', () => {
    const blank = rows.find(r => r.key === '')!;
    expect(blank.patterns[0].count).toBe(1);
  });

  it('knows the silent ones, and the ones that are off at their level', () => {
    expect(isSilent(row('com.acme.orders.ReconciliationJob'))).toBe(true);
    expect(isSilent(row('com.acme.orders.OrderService'))).toBe(false);
    expect(isOffAtLevel(row('org.hibernate.SQL'))).toBe(true);
    expect(row('com.acme.orders.ReconciliationJob').patterns[0].count).toBe(0);
  });

  it('filters by level, source, silence, package and text', () => {
    const base = { query: '', level: 'any', source: 'any' as const, neverFired: false };
    expect(filterRows(rows, { ...base, neverFired: true }).map(r => r.name).sort())
      .toEqual(['com.acme.orders.ReconciliationJob', 'com.acme.orders.audit.AuditTrail', 'org.hibernate.SQL']);
    expect(filterRows(rows, { ...base, level: 'DEBUG' }).map(r => r.name)).toEqual(['org.hibernate.SQL']);
    expect(filterRows(rows, { ...base, source: 'hand' }).map(r => r.name)).toContain('com.acme.orders.audit.AuditTrail');
    expect(filterRows(rows, { ...base, pkg: 'org.hibernate' })).toHaveLength(1);
    expect(filterRows(rows, { ...base, query: 'customer' }).map(r => r.name)).toEqual(['com.acme.orders.OrderService']);
  });

  it('sorts busiest first and the blank row last', () => {
    const sorted = sortRows(rows);
    expect(sorted[0].name).toBe('com.acme.orders.OrderService');
    expect(sorted[sorted.length - 1].key).toBe('');
  });

  it('counts the rails', () => {
    expect(packageCounts(rows)[0]).toEqual(['com.acme.orders', 3]);
    expect(Object.fromEntries(sourceCounts(rows))).toMatchObject({ config: 3, hand: 1, seen: 2 });
  });

  it('exports what it shows', () => {
    const json = JSON.parse(exportCatalogue(rows, 's', '2h'));
    expect(json.kind).toBe('daakia.dk8s.loggers');
    expect(json.window).toBe('last 2 hours');
    expect(json.loggers.find((l: { name: string }) => l.name === 'com.acme.orders.OrderService').patterns[0].count).toBe(2);
  });
});

describe('Paste a list', () => {
  it('takes every shape a list arrives in', () => {
    expect(parseLoggerList(`com.acme.orders.OrderService
com.acme.payments INFO
com.acme.audit=DEBUG
logging.level.org.hibernate.SQL: TRACE
<logger name="com.acme.x" level="WARN"/>
- workers.settlement warning
# a comment
com.acme.payments ERROR`)).toEqual([
      { name: 'com.acme.orders.OrderService', level: undefined },
      { name: 'com.acme.payments', level: 'INFO' },
      { name: 'com.acme.audit', level: 'DEBUG' },
      { name: 'org.hibernate.SQL', level: 'TRACE' },
      { name: 'com.acme.x', level: 'WARN' },
      { name: 'workers.settlement', level: 'WARN' },
    ]);
  });
});

describe('ago', () => {
  it('reads like the board', () => {
    expect(ago(NOW - 2000, NOW)).toBe('2s ago');
    expect(ago(NOW - 6 * 60_000, NOW)).toBe('6m ago');
    expect(ago(undefined, NOW)).toBe('—');
  });
});
