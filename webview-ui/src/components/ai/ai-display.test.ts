/**
 * A reopened conversation has to look the way it did: the card drawn from the
 * search's own lines, not the prose alone. And the model must never be sent
 * what only the screen needs.
 */
import { describe, it, expect } from 'vitest';
import { displayEnvelope, toUiMessages, forModel } from './ai-display';
import type { AiMessage } from '../../store/tabs-store';

const msg = (over: Partial<AiMessage>): AiMessage => ({ id: 'm', role: 'user', content: '', timestamp: 0, ...over });

describe('what the chat draws for an answer', () => {
  it('wraps a dk8s answer with its results, so the card comes back', () => {
    const env = JSON.parse(displayEnvelope('It timed out [1].', [{ query: 'x', groups: [] }]));
    expect(env).toEqual({ type: 'dk8s-search', rawText: 'It timed out [1].', results: [{ query: 'x', groups: [] }] });
  });

  it('wraps a plain answer as text', () => {
    expect(JSON.parse(displayEnvelope('Hello'))).toEqual({ type: 'text', rawText: 'Hello' });
  });
});

describe('a saved conversation, reopened', () => {
  it('shows the answer as it was drawn, and older answers as their text', () => {
    const ui = toUiMessages([
      msg({ id: '1', role: 'user', content: 'why?' }),
      msg({ id: '2', role: 'assistant', content: 'It timed out.', display: '{"type":"dk8s-search"}' }),
      msg({ id: '3', role: 'assistant', content: 'Before display existed.' }),
    ]);
    expect(ui.map(m => m.text)).toEqual(['why?', '{"type":"dk8s-search"}', '{"type":"text","rawText":"Before display existed."}']);
  });

  it('leaves out what was never on screen', () => {
    const ui = toUiMessages([
      msg({ role: 'system', content: 'you are…' }),
      msg({ role: 'assistant', content: '', toolCalls: [{ id: 't', type: 'function', function: { name: 'dk8s_search', arguments: '{}' } }] }),
      msg({ role: 'tool', content: 'lines…' }),
    ]);
    expect(ui).toEqual([]);
  });
});

describe('what the model is sent', () => {
  it('drops the display and an earlier turn\'s reasoning', () => {
    const [m] = forModel([msg({ role: 'assistant', content: 'ok', display: '{…}', reasoningContent: 'thinking' })]);
    expect(m).not.toHaveProperty('display');
    expect(m).not.toHaveProperty('reasoningContent');
    expect(m.content).toBe('ok');
  });
});
