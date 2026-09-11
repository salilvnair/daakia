/**
 * Nothing fails in silence.
 *
 * Thirty-seven components listen for `ai:error` and each decides for itself
 * whether to show anything, so whether a failure was visible depended on which
 * button you pressed. The workspace documentation generator showed nothing —
 * "Generate with AI" against a provider that was not signed in looked exactly
 * like one that worked, and the reason sat in the audit.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  REPEAT_MS, SILENT_ERROR_TYPES, failureMessage, isSilentErrorType,
  resetAiFailures, showAiFailure, showSilentFailure,
} from './ai-failure-toast';
import { useToastStore } from '../store/toast-store';

const toasts = () => useToastStore.getState().toasts;

beforeEach(() => {
  resetAiFailures();
  useToastStore.setState({ toasts: [] });
});

describe('failureMessage', () => {
  it('names the feature first — a bare 503 beside four AI buttons is a guess', () => {
    expect(failureMessage('Workspace Documentation', 'No model available', '503'))
      .toBe('Workspace Documentation failed — No model available');
  });

  it('falls back to the status when the provider said nothing', () => {
    expect(failureMessage('Generate body', undefined, 429))
      .toBe('Generate body failed — The provider answered 429.');
  });

  it('says so plainly when there is neither', () => {
    expect(failureMessage('Generate body')).toBe('Generate body failed — No reason was given.');
  });

  it('trims a paragraph of JSON to one line', () => {
    const long = 'x'.repeat(400);
    const out = failureMessage('F', long);
    expect(out.length).toBeLessThan(220);
    expect(out.endsWith('…')).toBe(true);
  });

  it('flattens newlines, because a toast is one line', () => {
    expect(failureMessage('F', 'line one\n\nline two')).toBe('F failed — line one line two');
  });
});

describe('showAiFailure', () => {
  it('raises an error toast', () => {
    showAiFailure('Workspace Documentation', 'No model available', '503');
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]).toMatchObject({ type: 'error' });
    expect(toasts()[0].message).toContain('Workspace Documentation');
  });

  it('stays up long enough to read a provider error and act on it', () => {
    showAiFailure('F', 'nope');
    expect(toasts()[0].duration).toBeGreaterThan(4000);
  });

  it('collapses the same failure — a tool loop emits the same 503 each pass', () => {
    showAiFailure('F', 'nope', '503', 1000);
    showAiFailure('F', 'nope', '503', 2000);
    showAiFailure('F', 'nope', '503', 3000);
    expect(toasts()).toHaveLength(1);
  });

  it('says it again once the collapse has expired', () => {
    showAiFailure('F', 'nope', '503', 1000);
    showAiFailure('F', 'nope', '503', 1000 + REPEAT_MS + 1);
    expect(toasts()).toHaveLength(2);
  });

  it('never collapses two different failures together', () => {
    showAiFailure('One', 'a', '503', 1000);
    showAiFailure('Two', 'b', '503', 1000);
    expect(toasts()).toHaveLength(2);
  });
});

describe('the channels that reached nobody', () => {
  it('covers the two with no listener at all', () => {
    expect(isSilentErrorType('soap:wsdlImportError')).toBe(true);
    expect(isSilentErrorType('ai:conversationSaveError')).toBe(true);
  });

  it('does not claim ordinary result shapes', () => {
    expect(isSilentErrorType('dkgh:board:result')).toBe(false);
    expect(isSilentErrorType(undefined)).toBe(false);
  });

  it('reads the reason from `error`, which is what these carry', () => {
    showSilentFailure('soap:wsdlImportError', { error: 'Not a WSDL document' });
    expect(toasts()[0].message).toBe('Importing that WSDL failed — Not a WSDL document');
  });

  it('falls back to `message` for the ones that use it', () => {
    showSilentFailure('dk8s:aiError', { message: 'no model' });
    expect(toasts()[0].message).toBe('Asking about this cluster failed — no model');
  });

  it('gives every named type a human label', () => {
    for (const [type, label] of Object.entries(SILENT_ERROR_TYPES)) {
      expect(label).not.toBe(type);
      expect(label.length).toBeGreaterThan(3);
    }
  });
});
