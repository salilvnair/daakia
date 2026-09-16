/**
 * The path rule, said out loud.
 *
 * Every shape here is one somebody really typed into the old box, back when
 * the page believed the volume was on this machine.
 */
import { describe, it, expect } from 'vitest';
import { pathComplaint } from './pod-path';

describe('a path inside a container', () => {
  it('has nothing to say about a good one', () => {
    expect(pathComplaint('/prodapp-prod-pvc/prodapp_prod_logs')).toBeUndefined();
    expect(pathComplaint('  /var/log  ')).toBeUndefined();
  });

  it('says nothing about an empty box, which is not a mistake yet', () => {
    expect(pathComplaint('')).toBeUndefined();
    expect(pathComplaint('   ')).toBeUndefined();
  });

  it('names a drive letter for what it is', () => {
    /* Where the whole change came from: `path.resolve` on Windows turned
       `/prodapp-prod-pvc/…` into `C:\prodapp-prod-pvc\…`, and the page
       reported on a machine that was never involved. */
    expect(pathComplaint('C:\\logs\\prodapp')).toMatch(/Windows machine/);
    expect(pathComplaint('C:/logs/prodapp')).toMatch(/Windows machine/);
    expect(pathComplaint('d:/logs')).toMatch(/Windows machine/);
  });

  it('names a UNC share too', () => {
    expect(pathComplaint('\\\\fileserver\\pvcs')).toMatch(/Windows machine/);
  });

  it('asks for an absolute path', () => {
    expect(pathComplaint('logs')).toMatch(/absolute/);
    expect(pathComplaint('./logs')).toMatch(/absolute/);
  });
});
