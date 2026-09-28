import { describe, it, expect } from 'vitest';
import { findPayload, maskSecrets, isSecretKey, prettyXml, HIDDEN, sentenceWithout, payloadDepth } from './log-payload';

describe('payloadDepth — how deep Expand all has to go', () => {
  it('counts the levels with children, so a flat payload has nothing to fold', () => {
    expect(payloadDepth(findPayload('stats {"a":1,"b":2}')!)).toBe(1);
    expect(payloadDepth(findPayload('req {"customer":{"name":"x"},"card":{"last4":"1"}}')!)).toBe(2);
    expect(payloadDepth(findPayload('said <a><b><c>x</c></b></a>')!)).toBe(2);
  });
});

describe('sentenceWithout — the line with its chip standing for the payload', () => {
  const line = 'Sending request {"orderId":42,"amount":10} to billing';
  const p = findPayload(line)!;
  it('takes the payload out and keeps what came after it', () => {
    expect(sentenceWithout(line, p)).toBe('Sending request to billing');
  });
  it('keeps the whole line when a search hit is inside the payload', () => {
    expect(sentenceWithout(line, p, at => line.indexOf('orderId') > at)).toBe(line);
  });
  it('keeps a line that is nothing but its payload', () => {
    const bare = '{"orderId":42}';
    expect(sentenceWithout(bare, findPayload(bare))).toBe(bare);
  });
});

describe('findPayload — JSON', () => {
  it('splits the sentence from the body', () => {
    const p = findPayload('calling bcbl api for request:A-4470 payload {"requestId":"A-4470","amount":248.4}')!;
    expect(p.shape).toBe('json');
    expect(p.prefix).toBe('calling bcbl api for request:A-4470 payload');
    expect(p.value).toEqual({ requestId: 'A-4470', amount: 248.4 });
    expect(p.summary).toBe('2 keys');
  });

  it('takes a whole-line JSON event, with an empty prefix', () => {
    const p = findPayload('{"level":"error","msg":"read timed out","ms":30000}')!;
    expect(p.prefix).toBe('');
    expect(p.summary).toBe('3 keys');
  });

  it('counts an array by entries', () => {
    expect(findPayload('items [1,2,3]')!.summary).toBe('3 entries');
  });

  /*
    The reason it scans from every opener rather than the first: SLF4J's own
    placeholder is a pair of braces, and a line that explains what it is doing
    before printing the body has one in the middle of the sentence.
  */
  it('walks past a brace that opens nothing', () => {
    const p = findPayload('rendering {} for order A-4470 -> {"id":"A-4470"}')!;
    expect(p.value).toEqual({ id: 'A-4470' });
    expect(p.prefix).toBe('rendering {} for order A-4470 ->');
  });

  it('leaves a truncated body as text', () => {
    // The pod died mid-flush. A tree built from a guess is worse than the line.
    expect(findPayload('payload {"requestId":"A-4470","cus')).toBeUndefined();
  });

  it('claims nothing for a sentence that merely has braces in it', () => {
    expect(findPayload('checking bcbl api for request:{} reqId')).toBeUndefined();
  });

  it('is not fooled by a brace inside a string', () => {
    const p = findPayload('body {"note":"} not the end","ok":true}')!;
    expect(p.value).toEqual({ note: '} not the end', ok: true });
  });

  it('refuses a line past the size ceiling', () => {
    const huge = `payload {"blob":"${'A'.repeat(600)}"}`;
    expect(findPayload(huge, { maxChars: 200 })).toBeUndefined();
    expect(findPayload(huge, { maxChars: 4000 })).toBeDefined();
  });

  it('looks for nothing that was switched off', () => {
    expect(findPayload('payload {"a":1}', { shapes: ['xml'] })).toBeUndefined();
  });
});

describe('findPayload — XML', () => {
  it('names the payload after its first element', () => {
    const p = findPayload('provider said <soap:Envelope><soap:Body><soap:Fault/></soap:Body></soap:Envelope>')!;
    expect(p.shape).toBe('xml');
    expect(p.summary).toBe('soap:Envelope');
    expect(p.prefix).toBe('provider said');
    expect(p.source.startsWith('<soap:Envelope>')).toBe(true);
    expect(p.source.endsWith('</soap:Envelope>')).toBe(true);
  });

  it('keeps attributes as the pod wrote them', () => {
    const p = findPayload('<Response code="504" retry="true">timeout</Response>')!;
    expect(p.source).toBe('<Response code="504" retry="true">timeout</Response>');
  });

  it('leaves a tag that never closes alone', () => {
    expect(findPayload('generic <T> parameter in a message')).toBeUndefined();
  });
});

describe('findPayload — key=value', () => {
  it('takes three pairs or more', () => {
    const p = findPayload('upstream timed out status=504 took=30001ms host=ledger-svc:8080')!;
    expect(p.shape).toBe('kv');
    expect(p.value).toEqual({ status: '504', took: '30001ms', host: 'ledger-svc:8080' });
    expect(p.prefix).toBe('upstream timed out');
  });

  /*
    Two pairs is a sentence with an equals sign in it. `active=10 idle=0` reads
    perfectly well as prose, and a table under it is noise.
  */
  it('leaves two pairs as the sentence they already are', () => {
    expect(findPayload('connection acquired active=10 idle=0')).toBeUndefined();
  });

  it('keeps a quoted value whole', () => {
    const p = findPayload('msg="read timed out" status=504 host=ledger-svc took=30s')!;
    expect((p.value as Record<string, string>).msg).toBe('read timed out');
  });
});

describe('prettyXml', () => {
  it('indents by nesting', () => {
    expect(prettyXml('<a><b><c>1</c></b></a>')).toEqual([
      '<a>',
      '  <b>',
      '    <c>1</c>',
      '  </b>',
      '</a>',
    ]);
  });

  it('keeps a leaf and its text on one line', () => {
    expect(prettyXml('<fault><code>soap:Server</code></fault>')).toEqual([
      '<fault>',
      '  <code>soap:Server</code>',
      '</fault>',
    ]);
  });

  it('does not indent under a self-closing tag', () => {
    expect(prettyXml('<env><fault/><ok/></env>')).toEqual([
      '<env>',
      '  <fault/>',
      '  <ok/>',
      '</env>',
    ]);
  });

  it('loses no characters of the original', () => {
    const src = '<Response code="504"><msg>read timed out</msg></Response>';
    expect(prettyXml(src).join('').replace(/\s+/g, '')).toBe(src.replace(/\s+/g, ''));
  });
});

describe('secrets', () => {
  it('knows the keys worth hiding, however they are spelled', () => {
    for (const k of ['token', 'Authorization', 'api_key', 'apiKey', 'card.token', 'user_password']) {
      expect(isSecretKey(k)).toBe(true);
    }
    for (const k of ['amount', 'requestId', 'tokenizer', 'passwordPolicyName']) {
      expect(isSecretKey(k)).toBe(false);
    }
  });

  it('masks the value and keeps the shape', () => {
    const masked = maskSecrets({ card: { last4: '4471', token: 'tok_live_9Qa' }, amount: 248.4 }) as
      { card: { last4: string; token: string }; amount: number };
    expect(masked.card.token).toBe(HIDDEN);
    expect(masked.card.last4).toBe('4471');
    expect(masked.amount).toBe(248.4);
  });

  it('does not touch the original, because Copy means the real line', () => {
    const original = { token: 'tok_live_9Qa' };
    maskSecrets(original);
    expect(original.token).toBe('tok_live_9Qa');
  });

  it('walks arrays too', () => {
    const masked = maskSecrets([{ secret: 'a' }, { secret: 'b' }]) as { secret: string }[];
    expect(masked.map(m => m.secret)).toEqual([HIDDEN, HIDDEN]);
  });
});
