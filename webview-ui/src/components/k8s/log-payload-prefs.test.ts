import { describe, it, expect } from 'vitest';
import {
  payloadPrefs, shapesText,
  PAYLOAD_DRAW_PREF, PAYLOAD_SHAPES_PREF, PAYLOAD_MODE_PREF,
  PAYLOAD_DEPTH_PREF, PAYLOAD_MAX_PREF, PAYLOAD_SECRETS_PREF,
} from './log-payload-prefs';

describe('nothing chosen', () => {
  it('draws every shape as a tree, two deep, with secrets hidden', () => {
    expect(payloadPrefs({})).toEqual({
      draw: true,
      shapes: ['json', 'xml', 'kv'],
      mode: 'tree',
      depth: 2,
      maxChars: 256 * 1024,
      hideSecrets: true,
    });
  });
});

describe('the master switch', () => {
  it('leaves no shape to look for when it is off', () => {
    const p = payloadPrefs({ [PAYLOAD_DRAW_PREF]: 'off' });
    expect(p.draw).toBe(false);
    // The log view asks for shapes, not for the switch, so this is the half
    // that has to be right: off must mean nothing is ever parsed.
    expect(p.shapes).toEqual([]);
  });

  it('does not forget the shapes that were ticked', () => {
    const prefs = { [PAYLOAD_DRAW_PREF]: 'off', [PAYLOAD_SHAPES_PREF]: 'json' };
    expect(payloadPrefs(prefs).shapes).toEqual([]);
    expect(payloadPrefs({ ...prefs, [PAYLOAD_DRAW_PREF]: 'on' }).shapes).toEqual(['json']);
  });
});

describe('shapes', () => {
  it('takes the stored list', () => {
    expect(payloadPrefs({ [PAYLOAD_SHAPES_PREF]: 'json,xml' }).shapes).toEqual(['json', 'xml']);
  });

  /*
    Every shape unticked is a choice somebody made, and it has to survive being
    written down. Treating the empty string as "nothing stored" would turn all
    of them back on the next time the tab opened.
  */
  it('keeps "none" as none rather than reading it as unset', () => {
    expect(payloadPrefs({ [PAYLOAD_SHAPES_PREF]: shapesText([]) }).shapes).toEqual([]);
  });

  it('ignores a name it does not know', () => {
    expect(payloadPrefs({ [PAYLOAD_SHAPES_PREF]: 'json,yaml,protobuf' }).shapes).toEqual(['json']);
  });
});

describe('the rest', () => {
  it('takes a mode it recognises and ignores one it does not', () => {
    expect(payloadPrefs({ [PAYLOAD_MODE_PREF]: 'raw' }).mode).toBe('raw');
    expect(payloadPrefs({ [PAYLOAD_MODE_PREF]: 'sideways' }).mode).toBe('tree');
  });

  it('holds depth and size inside what makes sense', () => {
    expect(payloadPrefs({ [PAYLOAD_DEPTH_PREF]: '0' }).depth).toBe(1);
    expect(payloadPrefs({ [PAYLOAD_DEPTH_PREF]: '99' }).depth).toBe(12);
    expect(payloadPrefs({ [PAYLOAD_DEPTH_PREF]: 'deep' }).depth).toBe(2);
    expect(payloadPrefs({ [PAYLOAD_MAX_PREF]: '64' }).maxChars).toBe(64 * 1024);
    expect(payloadPrefs({ [PAYLOAD_MAX_PREF]: '-5' }).maxChars).toBe(1024);
  });

  it('shows secrets only when told to', () => {
    expect(payloadPrefs({ [PAYLOAD_SECRETS_PREF]: 'off' }).hideSecrets).toBe(false);
    expect(payloadPrefs({}).hideSecrets).toBe(true);
  });
});
