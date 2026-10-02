/**
 * The shapes the log-rendering plan added: XML drawn as a tree, a YAML config
 * dump joined back into one event, and a line that will not be drawn saying why.
 */
import { describe, it, expect } from 'vitest';
import { parseXmlTree, parseYamlBlock, yamlPayload, payloadNote } from './log-payload';

describe('XML as a tree', () => {
  it('reads a SOAP fault into elements, attributes and text', () => {
    const t = parseXmlTree('<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault>'
      + '<faultcode>soap:Server</faultcode><faultstring>PRSU rejected order for 9173</faultstring></soap:Fault></soap:Body></soap:Envelope>')!;
    expect(t.name).toBe('soap:Envelope');
    expect(t.attrs).toEqual([['xmlns:soap', 'http://schemas.xmlsoap.org/soap/envelope/']]);
    const fault = t.children[0].children[0];
    expect(fault.name).toBe('soap:Fault');
    expect(fault.children.map(c => [c.name, c.text])).toEqual([
      ['faultcode', 'soap:Server'], ['faultstring', 'PRSU rejected order for 9173'],
    ]);
  });

  it('keeps self-closing elements, and skips a declaration and comments', () => {
    const t = parseXmlTree('<?xml version="1.0"?><!-- sent --><order id="7"><item sku="A"/><item sku="B"/></order>')!;
    expect(t.children.map(c => c.attrs[0][1])).toEqual(['A', 'B']);
  });

  it('gives no tree for a fragment that does not close, or closes the wrong element', () => {
    expect(parseXmlTree('<a><b>x</a>')).toBeUndefined();
    expect(parseXmlTree('<a><b>x</b>')).toBeUndefined();
  });
});

describe('YAML config dumps', () => {
  const dump = [
    'datasource:',
    '  url: jdbc:postgresql://db:5432/orders',
    '  maxPoolSize: 20',
    'bcbl:',
    '  enabled: true',
    '  hosts:',
    '    - a.internal',
    '    - b.internal',
    'region: eastus',
  ];

  it('reads nesting, lists and scalars', () => {
    expect(parseYamlBlock(dump)).toEqual({
      datasource: { url: 'jdbc:postgresql://db:5432/orders', maxPoolSize: 20 },
      bcbl: { enabled: true, hosts: ['a.internal', 'b.internal'] },
      region: 'eastus',
    });
  });

  it('works on a block indented as a whole, the way it follows a log line', () => {
    expect(parseYamlBlock(dump.map(l => `    ${l}`))).toEqual(parseYamlBlock(dump));
  });

  it('never claims prose, a stack trace, or a single key', () => {
    expect(parseYamlBlock(['Connection refused: connect', 'retrying in 5s'])).toBeUndefined();
    expect(parseYamlBlock(['\tat com.acme.OrderService.place(OrderService.java:42)', '\tat java.base/java.lang.Thread.run(Thread.java:840)'])).toBeUndefined();
    expect(parseYamlBlock(['timeout: 30s'])).toBeUndefined();
  });

  it('becomes a payload the row can offer', () => {
    const p = yamlPayload('ConfigPrinter — effective configuration', dump)!;
    expect(p.shape).toBe('yaml');
    expect(p.summary).toBe('3 keys · 9 lines');
  });
});

describe('a line that will not be drawn says why', () => {
  it('names the limit it went over', () => {
    const note = payloadNote(`payload {"x":"${'a'.repeat(70 * 1024)}"}`, { maxChars: 64 * 1024 });
    expect(note).toMatch(/over the 64 KB limit/);
  });

  it('says a line cut on the way in lost its payload', () => {
    expect(payloadNote('body {"a":1, "b": "unfinished', { truncated: true })).toMatch(/cut at 32 KB/);
  });

  it('says nothing about a line with no payload in it', () => {
    expect(payloadNote('GET /api/v1/rules -> 200 in 31ms', { truncated: true })).toBeUndefined();
  });
});
