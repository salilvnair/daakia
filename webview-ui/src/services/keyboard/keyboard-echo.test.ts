import { describe, it, expect } from 'vitest';
import { registerShortcut, globalKeydownHandler, ranLocally } from './keyboard-registry';

/*
  In VS Code a Daakia shortcut reaches the extension too, and its command posts
  the same action back. ranLocally is how the webview tells that echo from a
  real request — without it Ctrl+N opened two tabs.
*/
describe('ranLocally', () => {
  const press = (key: string) =>
    globalKeydownHandler(new KeyboardEvent('keydown', { key, ctrlKey: true }));

  it('is true just after the shortcut ran here, so the host echo is skipped', () => {
    let runs = 0;
    const off = registerShortcut('test.echo-n', { key: 'q', ctrlKey: true }, () => { runs++; });
    press('q');
    expect(runs).toBe(1);
    expect(ranLocally('test.echo-n')).toBe(true);
    off();
  });

  it('is false for a shortcut that did not run, so a host command still acts', () => {
    expect(ranLocally('test.never-pressed')).toBe(false);
  });

  it('expires, so a later command from the VS Code palette is not swallowed', () => {
    const off = registerShortcut('test.echo-old', { key: 'j', ctrlKey: true }, () => {});
    press('j');
    expect(ranLocally('test.echo-old', Date.now() + 5_000)).toBe(false);
    off();
  });
});
