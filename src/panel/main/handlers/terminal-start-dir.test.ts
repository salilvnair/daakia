/**
 * The starting directory is the one terminal field that becomes shell text
 * rather than an API parameter, and it does not come from the user — it comes
 * from a directory listing inside the container. So a hostile image could
 * plant a filename, and this is what stops it running.
 */
import { describe, it, expect } from 'vitest';
import { START_DIR } from './terminal-handler';

describe('START_DIR', () => {
  it('takes the paths a file listing actually produces', () => {
    for (const ok of [
      '/', '/data', '/var/log', '/app/config',
      '/opt/my app/conf',            // spaces are safe inside single quotes
      '/srv/a-b_c.d/e+f',
      '/tmp/$HOME',                  // inert once quoted
      '/tmp/`whoami`',               // likewise
      '/tmp/a"b',                    // a double quote cannot end a single-quoted word
      '/tmp/*',
      `/${'x'.repeat(4000)}`,
    ]) {
      expect(START_DIR.test(ok), ok).toBe(true);
    }
  });

  it("refuses anything carrying a single quote, which is the only way out", () => {
    for (const bad of [
      "/tmp/'; rm -rf / #",
      "/tmp/it's",
      "/'",
    ]) {
      expect(START_DIR.test(bad), bad).toBe(false);
    }
  });

  it('refuses control characters, which would end the command', () => {
    for (const bad of ['/tmp/a\nrm -rf /', '/tmp/a\rwhoami', '/tmp/a\x00b', '/tmp/a\tb']) {
      expect(START_DIR.test(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it('refuses anything that is not an absolute path', () => {
    for (const bad of ['', 'data', './data', '../data', 'C:/data', ' /data']) {
      expect(START_DIR.test(bad), bad).toBe(false);
    }
  });

  it('refuses a path long enough to be a payload rather than a path', () => {
    expect(START_DIR.test(`/${'x'.repeat(9000)}`)).toBe(false);
  });
});
