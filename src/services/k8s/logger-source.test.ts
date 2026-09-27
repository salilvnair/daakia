/**
 * Most loggers are never named in a config file — they are a class with a
 * logger in it. These are the ways a class says so.
 */
import { describe, it, expect } from 'vitest';
import { loggerOfSource, fallbackLogger, pythonModule } from './logger-source';

const JAVA_HEAD = 'package com.acme.bcbl;\n\nimport org.slf4j.Logger;\n';

describe('java', () => {
  it('@Slf4j is a logger named after the class', () => {
    expect(loggerOfSource(`${JAVA_HEAD}@Slf4j\npublic class BcblClient {}`, 'src/main/java/com/acme/bcbl/BcblClient.java', 'java'))
      .toEqual({ name: 'com.acme.bcbl.BcblClient', declared: true });
  });

  it('LoggerFactory.getLogger(X.class) names X', () => {
    const text = `${JAVA_HEAD}class A { private static final Logger log = LoggerFactory.getLogger(Other.class); }`;
    expect(loggerOfSource(text, 'A.java', 'java')?.name).toBe('com.acme.bcbl.Other');
  });

  it('a string literal wins over the class', () => {
    const text = `${JAVA_HEAD}class A { Logger audit = LoggerFactory.getLogger("audit.trail"); }`;
    expect(loggerOfSource(text, 'A.java', 'java')?.name).toBe('audit.trail');
  });

  it('Kotlin’s KotlinLogging and javaClass', () => {
    expect(loggerOfSource('package a.b\nprivate val log = KotlinLogging.logger {}', 'x/Svc.kt', 'java')?.name).toBe('a.b.Svc');
    expect(loggerOfSource('package a.b\nval log = LoggerFactory.getLogger(javaClass)', 'x/Svc.kt', 'java')?.name).toBe('a.b.Svc');
  });

  it('a class with no logger declares none', () => {
    expect(loggerOfSource(`${JAVA_HEAD}class A {}`, 'A.java', 'java')).toBeUndefined();
  });
});

describe('python', () => {
  it('getLogger(__name__) is the module', () => {
    expect(loggerOfSource('import logging\nlog = logging.getLogger(__name__)', 'src/workers/settlement.py', 'python'))
      .toEqual({ name: 'workers.settlement', declared: true });
  });

  it('getLogger("name") is that name', () => {
    expect(loggerOfSource('log = logging.getLogger("settle")', 'w.py', 'python')?.name).toBe('settle');
  });

  it('a package’s __init__ is the package', () => {
    expect(pythonModule('workers/__init__.py')).toBe('workers');
  });
});

describe('node and go', () => {
  it('pino’s name', () => {
    expect(loggerOfSource("const log = pino({ level: 'info', name: 'checkout' })", 'web/routes/checkout.ts', 'node')?.name)
      .toBe('checkout');
  });

  it('falls back to folder:file for a Node file that only calls one', () => {
    expect(fallbackLogger('log.info("x")', 'web/routes/checkout.ts', 'node'))
      .toEqual({ name: 'web:checkout', declared: false });
  });

  it('slog.With("component", …)', () => {
    expect(loggerOfSource('l := slog.With("component", "settler")', 'cmd/settle.go', 'go')?.name).toBe('settler');
  });

  it('a Java file with calls and no declaration is package.Class, not declared', () => {
    expect(fallbackLogger(`${JAVA_HEAD}class A { void f(Logger log) { log.info("x"); } }`, 'x/A.java', 'java'))
      .toEqual({ name: 'com.acme.bcbl.A', declared: false });
  });
});
