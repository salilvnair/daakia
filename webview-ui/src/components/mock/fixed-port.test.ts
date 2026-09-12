import { describe, it, expect } from 'vitest';
import { portProblem, portToSend } from './fixed-port';

describe('portToSend', () => {
  it('sends nothing at all while the setting is off', () => {
    expect(portToSend('8080', false)).toBeUndefined();
  });

  it('sends the port when it is on', () => {
    expect(portToSend('8080', true)).toBe(8080);
    expect(portToSend('  3000 ', true)).toBe(3000);
  });

  it('sends nothing for an empty box — that means "find me one"', () => {
    expect(portToSend('', true)).toBeUndefined();
    expect(portToSend('   ', true)).toBeUndefined();
  });

  it('never sends something listen() would take as "any port"', () => {
    for (const bad of ['0', 'NaN', '80a', '-1', '8080.5', 'Infinity']) {
      expect(portToSend(bad, true)).toBeUndefined();
    }
  });

  it('refuses the privileged range and anything past the top', () => {
    expect(portToSend('80', true)).toBeUndefined();
    expect(portToSend('65536', true)).toBeUndefined();
    expect(portToSend('1024', true)).toBe(1024);
    expect(portToSend('65535', true)).toBe(65535);
  });
});

describe('portProblem', () => {
  it('says nothing about an empty box', () => {
    expect(portProblem('')).toBe('');
    expect(portProblem('  ')).toBe('');
  });

  it('says nothing about a good port', () => {
    expect(portProblem('8080')).toBe('');
  });

  it('names the privileged range rather than just refusing', () => {
    expect(portProblem('80')).toContain('administrator');
  });

  it('names the ceiling', () => {
    expect(portProblem('70000')).toContain('65535');
  });

  it('says what a port is when given something that is not one', () => {
    expect(portProblem('eighty')).toContain('whole number');
  });
});
