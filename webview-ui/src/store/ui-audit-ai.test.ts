/**
 * Every AI button is auditable, and a failure is recorded as one.
 *
 * The taxonomy had no AI module at all: fifty-odd sparkles, none of them
 * auditable, and a failed call left exactly the trace of a button nobody
 * pressed. These pin the two things that make the checkbox mean something —
 * that the events exist with sane defaults, and that the gate is honoured.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AUDIT_EVENT_DEFS, isAuditEventEnabled, setAuditEventEnabled, resetAuditConfig, logUiEvent,
} from './ui-audit-store';
import * as vscode from '../vscode';

const def = (id: string) => AUDIT_EVENT_DEFS.find(d => d.id === id);

beforeEach(() => {
  resetAuditConfig();
  vi.restoreAllMocks();
});

describe('the AI events exist', () => {
  it('has one event covering every AI call, and one for a failure', () => {
    expect(def('ai.request')).toMatchObject({ module: 'AI', defaultEnabled: true });
    expect(def('ai.failed')).toMatchObject({ module: 'AI', action: 'error', defaultEnabled: true });
  });

  /* A failure that is off by default is the state this started in — the
     button did nothing and the footprint said nothing. */
  it('records failures unless someone turns them off', () => {
    expect(isAuditEventEnabled('ai.failed')).toBe(true);
  });

  it('covers what the Action tab and the response panel do', () => {
    for (const id of ['rest.example_save', 'rest.chain_apply', 'rest.chain_auto', 'rest.docs_generate']) {
      expect(def(id), id).toBeTruthy();
    }
  });

  /* Chaining runs on every response of a chained request; auditing that by
     default would bury the events somebody actually asked for. */
  it('leaves the automatic chain off until asked for', () => {
    expect(def('rest.chain_auto')!.defaultEnabled).toBe(false);
    expect(isAuditEventEnabled('rest.chain_auto')).toBe(false);
  });

  it('gives every event a module, a button and a description', () => {
    for (const d of AUDIT_EVENT_DEFS) {
      expect(d.module, d.id).toBeTruthy();
      expect(d.button, d.id).toBeTruthy();
      expect(d.description, d.id).toBeTruthy();
    }
  });

  it('has no two events sharing an id', () => {
    const ids = AUDIT_EVENT_DEFS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the checkbox is what decides', () => {
  it('sends nothing while the event is off', () => {
    const post = vi.spyOn(vscode, 'postMsg').mockImplementation(() => {});
    setAuditEventEnabled('ai.request', false);
    logUiEvent('ai.request', { stage: 'rest.docs.generate' });
    expect(post).not.toHaveBeenCalled();
  });

  it('sends the event, its module and its metadata once it is on', () => {
    const post = vi.spyOn(vscode, 'postMsg').mockImplementation(() => {});
    setAuditEventEnabled('ai.request', true);
    logUiEvent('ai.request', { stage: 'rest.docs.generate' });
    expect(post).toHaveBeenCalledWith(expect.objectContaining({
      type: 'uiAudit:log',
      event_type: 'ai.request',
      module: 'AI',
      metadata: { stage: 'rest.docs.generate' },
    }));
  });

  /* An id with no definition is a typo, and a typo that logs is worse than
     one that does not: it fills the trail with rows nothing can explain. */
  it('refuses an event it does not know', () => {
    const post = vi.spyOn(vscode, 'postMsg').mockImplementation(() => {});
    logUiEvent('ai.nonexistent', {});
    expect(post).not.toHaveBeenCalled();
  });
});
