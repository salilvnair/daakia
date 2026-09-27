/**
 * A catalogue that shows the wrong level tells a tester to expect lines the
 * pod will never write. These are the cases that decide the level.
 */
import { describe, it, expect } from 'vitest';
import {
  parseLogbackXml, parseYamlLevels, parsePropertiesLevels, levelsFor, profileApplies,
  profileOfFile, normaliseLevel, parseActuatorLoggers, describeBuild, flattenYaml,
} from './logger-config';

const LOGBACK = `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <include resource="org/springframework/boot/logging/logback/base.xml"/>
  <!-- <logger name="com.acme.legacy" level="DEBUG"/> -->
  <logger name="com.acme.orders" level="INFO"/>
  <logger name="org.hibernate.SQL" level="\${SQL_LEVEL:-DEBUG}" additivity="false">
    <appender-ref ref="CONSOLE"/>
  </logger>
  <springProfile name="prod">
    <logger name="com.acme.payments" level="error"/>
    <root level="WARN"/>
  </springProfile>
  <springProfile name="dev | local">
    <logger name="com.acme.payments" level="DEBUG"/>
  </springProfile>
  <root level="INFO"><appender-ref ref="CONSOLE"/></root>
</configuration>`;

describe('logback', () => {
  const read = parseLogbackXml(LOGBACK);

  it('reads every <logger>, and not the commented-out one', () => {
    expect(read.loggers.map(l => l.name)).toEqual([
      'com.acme.orders', 'org.hibernate.SQL', 'com.acme.payments', 'com.acme.payments',
    ]);
  });

  it('upper-cases levels and takes a property default', () => {
    expect(read.loggers[0].level).toBe('INFO');
    expect(read.loggers[1].level).toBe('DEBUG');
    expect(read.loggers[2].level).toBe('ERROR');
  });

  it('carries the springProfile a logger sits inside', () => {
    expect(read.loggers[0].profile).toBeUndefined();
    expect(read.loggers[2].profile).toBe('prod');
    expect(read.loggers[3].profile).toBe('dev | local');
  });

  it('reads the root level per profile', () => {
    expect(read.root).toEqual([
      { name: 'ROOT', level: 'WARN', profile: 'prod' },
      { name: 'ROOT', level: 'INFO', profile: undefined },
    ]);
  });

  it('reads log4j2 spelling too', () => {
    const l = parseLogbackXml('<Configuration><Loggers><Logger name="a.b" level="warn"/><AsyncLogger name="c.d" level="trace"/><Root level="info"/></Loggers></Configuration>');
    expect(l.loggers).toEqual([
      { name: 'a.b', level: 'WARN', profile: undefined },
      { name: 'c.d', level: 'TRACE', profile: undefined },
    ]);
    expect(l.root[0].level).toBe('INFO');
  });
});

describe('profiles', () => {
  it('matches Spring\u2019s expressions', () => {
    expect(profileApplies(undefined, 'prod')).toBe(true);
    expect(profileApplies('prod', 'prod')).toBe(true);
    expect(profileApplies('prod', 'dev')).toBe(false);
    expect(profileApplies('dev | local', 'local')).toBe(true);
    expect(profileApplies('dev, local', 'prod')).toBe(false);
    expect(profileApplies('!prod', 'dev')).toBe(true);
    expect(profileApplies('!prod', 'prod')).toBe(false);
    expect(profileApplies('!prod', 'default')).toBe(true);
  });

  it('reads the profile off a file name', () => {
    expect(profileOfFile('src/main/resources/application-prod.yaml')).toBe('prod');
    expect(profileOfFile('application-eu-west.yml')).toBe('eu-west');
    expect(profileOfFile('application.properties')).toBeUndefined();
  });
});

describe('logging.level', () => {
  it('reads nested yaml, flat keys and root', () => {
    const docs = parseYamlLevels(`
spring:
  application:
    name: orders
logging:
  level:
    root: warn
    com.acme.orders: DEBUG   # while we chase ORD-12
    "[com.acme.payments]": ERROR
logging.level.org.hibernate.SQL: TRACE
`);
    expect(docs).toHaveLength(1);
    expect(docs[0].levels).toEqual({
      ROOT: 'WARN', 'com.acme.orders': 'DEBUG', 'com.acme.payments': 'ERROR', 'org.hibernate.SQL': 'TRACE',
    });
  });

  it('gives each document its own profile, and the file its own', () => {
    const docs = parseYamlLevels(`logging:
  level:
    com.acme: INFO
---
spring:
  config:
    activate:
      on-profile: prod
logging:
  level:
    com.acme: WARN
`);
    expect(docs.map(d => d.profile)).toEqual([undefined, 'prod']);
    expect(parseYamlLevels('logging.level.a: DEBUG', 'dev')[0].profile).toBe('dev');
  });

  it('switching the profile changes the level', () => {
    const docs = [
      ...parseYamlLevels('logging:\n  level:\n    com.acme: INFO\n    org.x: WARN\n'),
      ...parseYamlLevels('logging:\n  level:\n    com.acme: DEBUG\n', 'dev'),
      ...parseYamlLevels('logging:\n  level:\n    com.acme: ERROR\n', 'prod'),
    ];
    expect(levelsFor(docs, 'prod')).toEqual({ 'com.acme': 'ERROR', 'org.x': 'WARN' });
    expect(levelsFor(docs, 'dev')['com.acme']).toBe('DEBUG');
    expect(levelsFor(docs, 'default')['com.acme']).toBe('INFO');
  });

  it('reads .properties, with #--- documents', () => {
    const docs = parsePropertiesLevels(`logging.level.com.acme=DEBUG
logging.level.root: INFO
server.port=8080
#---
spring.config.activate.on-profile=prod
logging.level.com.acme=WARN
`);
    expect(docs).toEqual([
      { profile: undefined, levels: { 'com.acme': 'DEBUG', ROOT: 'INFO' } },
      { profile: 'prod', levels: { 'com.acme': 'WARN' } },
    ]);
  });

  it('skips lists and junk rather than failing the file', () => {
    expect(flattenYaml('a:\n  - x\n  - y\nb: 1\nnot a line\n')).toEqual({ b: '1' });
  });

  it('knows a level when it sees one', () => {
    expect(normaliseLevel('warning')).toBe('WARN');
    expect(normaliseLevel('${X}')).toBeUndefined();
    expect(normaliseLevel('${X:ERROR}')).toBe('ERROR');
    expect(normaliseLevel('loud')).toBeUndefined();
  });
});

describe('actuator', () => {
  const body = JSON.stringify({
    levels: ['OFF', 'ERROR'],
    loggers: {
      ROOT: { configuredLevel: 'INFO', effectiveLevel: 'INFO' },
      com: { configuredLevel: null, effectiveLevel: 'INFO' },
      'com.acme.orders': { configuredLevel: 'DEBUG', effectiveLevel: 'DEBUG' },
      'com.acme.orders.OrderService': { configuredLevel: null, effectiveLevel: 'DEBUG' },
    },
  });

  it('reads effective levels, without ROOT', () => {
    expect(parseActuatorLoggers(body).map(l => `${l.name}=${l.level}`)).toEqual([
      'com=INFO', 'com.acme.orders=DEBUG', 'com.acme.orders.OrderService=DEBUG',
    ]);
  });

  it('can keep only the configured ones', () => {
    expect(parseActuatorLoggers(body, true).map(l => l.name)).toEqual(['com.acme.orders']);
  });

  it('answers nothing for a body that is not JSON', () => {
    expect(parseActuatorLoggers('<html>404</html>')).toEqual([]);
  });
});

describe('the build line', () => {
  it('says Spring Boot, Maven and the modules', () => {
    const pom = `<project><parent><groupId>org.springframework.boot</groupId>
<artifactId>spring-boot-starter-parent</artifactId><version>3.2.4</version></parent>
<modules><module>api</module><module>worker</module></modules></project>`;
    expect(describeBuild({ pom })).toBe('Spring Boot 3.2 · Maven · 2 modules');
  });

  it('says Gradle', () => {
    expect(describeBuild({ gradle: `plugins { id 'org.springframework.boot' version '3.1.0' }` }))
      .toBe('Spring Boot 3.1 · Gradle');
  });
});
