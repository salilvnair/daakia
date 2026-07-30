import { useState } from 'react';
import { createPortal } from 'react-dom';
import { SelectInputView, TextInputView, MultilineInputView, ToggleSwitchView, ButtonView, IconButtonView } from '@salilvnair/dui';
import { useTabsStore } from '../../store/tabs-store';
import { ConfirmDialog } from '../shared';
import { PlusIcon, TrashIcon, CloseIcon, CheckCircleIcon, XCircleIcon } from '../../icons';
import type { SoapAssertion } from '../../store/tabs-store';

const ACCENT = 'var(--color-protocol-soap)';

const ASSERTION_TYPE_OPTIONS = [
  { value: 'xpath-match', label: 'XPath Match' },
  { value: 'xpath-exists', label: 'XPath Exists' },
  { value: 'xpath-count', label: 'XPath Count' },
  { value: 'not-fault', label: 'Not SOAP Fault' },
  { value: 'is-fault', label: 'Is SOAP Fault' },
  { value: 'schema', label: 'Schema Valid' },
  { value: 'response-time', label: 'Response Time <' },
  { value: 'contains', label: 'Response Contains' },
  { value: 'script', label: 'Script Assertion' },
];

const OPERATOR_OPTIONS = [
  { value: '=', label: '= Equals' },
  { value: '!=', label: '!= Not Equals' },
  { value: '>', label: '> Greater Than' },
  { value: '<', label: '< Less Than' },
  { value: 'contains', label: 'Contains' },
];

/**
 * SoapAssertions — Assertion list with XPath, schema, response time, contains, and script assertions.
 * Evaluates assertions against the response XML using the browser's DOMParser + XPath evaluate().
 */
export function SoapAssertions() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  if (!activeTab) return null;

  const assertions: SoapAssertion[] = activeTab.soapAssertions || [];
  const response = activeTab.response;

  const update = (newAssertions: SoapAssertion[]) => {
    updateTab(activeTab.id, { soapAssertions: newAssertions, dirty: true });
  };

  const addAssertion = () => {
    const newAssertion: SoapAssertion = {
      id: crypto.randomUUID(),
      type: 'xpath-match',
      expression: '',
      expectedValue: '',
      operator: '=',
      enabled: true,
      lastResult: null,
    };
    update([...assertions, newAssertion]);
    setEditingId(newAssertion.id);
  };

  const updateAssertion = (id: string, patch: Partial<SoapAssertion>) => {
    update(assertions.map(a => a.id === id ? { ...a, ...patch } : a));
  };

  const deleteAssertion = (id: string) => {
    update(assertions.filter(a => a.id !== id));
    setDeleteConfirm(null);
  };

  const runAssertions = () => {
    if (!response?.body) return;

    const results = assertions.map(assertion => {
      if (!assertion.enabled) return assertion;
      const result = evaluateAssertion(assertion, response.body, response.time);
      return { ...assertion, ...result };
    });

    update(results);
  };

  // Auto-run assertions when response changes
  const hasResponse = !!response?.body;

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--color-text-muted)]">
          {assertions.length} assertion{assertions.length !== 1 ? 's' : ''}
          {hasResponse && assertions.length > 0 && (
            <> · <button type="button" onClick={runAssertions} className="text-[var(--color-protocol-soap)] hover:underline cursor-pointer">Run All</button></>
          )}
        </span>
        <ButtonView
          size="xs"
          accentColor={ACCENT}
          onClick={addAssertion}
          iconLeft={<PlusIcon size={10} />}
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-soap) 12%, transparent)', color: ACCENT }}
        >
          Add
        </ButtonView>
      </div>

      {/* Assertion list */}
      {assertions.length === 0 ? (
        <div className="text-[11px] text-[var(--color-text-muted)] py-4 text-center">
          No assertions. Click + Add to create one.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {assertions.map(assertion => (
            <AssertionRow
              key={assertion.id}
              assertion={assertion}
              onToggle={() => updateAssertion(assertion.id, { enabled: !assertion.enabled })}
              onEdit={() => setEditingId(assertion.id)}
              onDelete={() => setDeleteConfirm(assertion.id)}
            />
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editingId && (
        <AssertionEditModal
          assertion={assertions.find(a => a.id === editingId)!}
          onUpdate={(patch) => updateAssertion(editingId, patch)}
          onClose={() => setEditingId(null)}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete assertion?"
          message="This assertion will be permanently removed."
          confirmLabel="Delete"
          onConfirm={() => deleteAssertion(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

// ────────── Assertion Row ──────────

function AssertionRow({ assertion, onToggle, onEdit, onDelete }: {
  assertion: SoapAssertion;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const typeLabel = ASSERTION_TYPE_OPTIONS.find(o => o.value === assertion.type)?.label || assertion.type;
  const icon = assertion.lastResult === 'pass'
    ? <CheckCircleIcon size={12} className="text-[var(--color-success)]" />
    : assertion.lastResult === 'fail'
      ? <XCircleIcon size={12} className="text-[var(--color-error)]" />
      : <span className="w-3 h-3 rounded-full border border-[color-mix(in_srgb,var(--color-text-primary)_15%,transparent)]" />;

  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors ${assertion.enabled ? 'bg-[color-mix(in_srgb,var(--color-text-primary)_2%,transparent)]' : 'opacity-50'}`}>
      {icon}
      <ToggleSwitchView
        checked={assertion.enabled}
        onChange={onToggle}
        size="xs"
        accentColor={ACCENT}
        className="flex-shrink-0"
      />
      <span className="text-[10px] font-medium text-[var(--color-text-muted)] flex-shrink-0">{typeLabel}</span>
      <span className="text-[11px] text-[var(--color-text-primary)] truncate flex-1 cursor-pointer hover:text-[var(--color-protocol-soap)]" onClick={onEdit}>
        {getAssertionSummary(assertion)}
      </span>
      {assertion.lastResult === 'fail' && assertion.lastActual && (
        <span className="text-[9px] text-[var(--color-error)] truncate max-w-[100px]">got: {assertion.lastActual}</span>
      )}
      <IconButtonView
        icon={<TrashIcon size={10} />}
        size="sm"
        accentColor="var(--color-error)"
        onClick={onDelete}
        className="flex-shrink-0"
      />
    </div>
  );
}

function getAssertionSummary(a: SoapAssertion): string {
  switch (a.type) {
    case 'xpath-match': return `${a.expression} ${a.operator} "${a.expectedValue}"`;
    case 'xpath-exists': return a.expression || '(no expression)';
    case 'xpath-count': return `count(${a.expression}) ${a.operator} ${a.expectedValue}`;
    case 'not-fault': return 'Response is not a SOAP Fault';
    case 'is-fault': return 'Response is a SOAP Fault';
    case 'response-time': return `< ${a.expectedValue}ms`;
    case 'contains': return `contains "${a.expectedValue}"`;
    case 'script': return a.expression?.slice(0, 50) || '(empty script)';
    case 'schema': return a.expression ? `Body contains <${a.expression}>` : 'Valid SOAP XML structure';
    default: return '';
  }
}

// ────────── Edit Modal ──────────

function AssertionEditModal({ assertion, onUpdate, onClose }: {
  assertion: SoapAssertion;
  onUpdate: (patch: Partial<SoapAssertion>) => void;
  onClose: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-[420px] bg-[var(--color-surface)] border border-[var(--color-surface-border)] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-surface-border)]">
          <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Edit Assertion</h3>
          <IconButtonView icon={<CloseIcon size={12} />} size="sm" accentColor="var(--color-text-muted)" onClick={onClose} />
        </div>

        {/* Body */}
        <div className="px-4 py-3 flex flex-col gap-3">
          <div>
            <label className="text-[10px] text-[var(--color-text-muted)] mb-1 block">Type</label>
            <SelectInputView
              options={ASSERTION_TYPE_OPTIONS}
              value={assertion.type}
              onChange={(v) => onUpdate({ type: v as SoapAssertion['type'] })}
              size="md"
              accentColor={ACCENT}
            />
          </div>

          {/* Expression (XPath, script, contains text) */}
          {['xpath-match', 'xpath-exists', 'xpath-count', 'contains', 'script', 'schema'].includes(assertion.type) && (
            <div>
              <label className="text-[10px] text-[var(--color-text-muted)] mb-1 block">
                {assertion.type === 'schema' ? 'Expected Body Element (optional)' : assertion.type === 'script' ? 'Script (return true/false)' : assertion.type === 'contains' ? 'Search Text' : 'XPath Expression'}
              </label>
              <MultilineInputView
                value={assertion.expression || ''}
                onChange={(e) => onUpdate({ expression: e.target.value })}
                placeholder={assertion.type.startsWith('xpath') ? '//tns:name' : assertion.type === 'script' ? 'return response.includes("success");' : 'expected substring'}
                rows={assertion.type === 'script' ? 4 : 2}
                size="md"
                width="fw"
                className="font-mono"
                accentColor={ACCENT}
              />
            </div>
          )}

          {/* Expected value + operator */}
          {['xpath-match', 'xpath-count', 'response-time'].includes(assertion.type) && (
            <div className="flex items-end gap-2">
              {assertion.type !== 'response-time' && (
                <div className="w-[120px]">
                  <label className="text-[10px] text-[var(--color-text-muted)] mb-1 block">Operator</label>
                  <SelectInputView
                    options={OPERATOR_OPTIONS}
                    value={assertion.operator || '='}
                    onChange={(v) => onUpdate({ operator: v as SoapAssertion['operator'] })}
                    size="md"
                    accentColor={ACCENT}
                  />
                </div>
              )}
              <div className="flex-1">
                <label className="text-[10px] text-[var(--color-text-muted)] mb-1 block">
                  {assertion.type === 'response-time' ? 'Max Time (ms)' : 'Expected Value'}
                </label>
                <TextInputView
                  value={assertion.expectedValue || ''}
                  onChange={(e) => onUpdate({ expectedValue: e.target.value })}
                  placeholder={assertion.type === 'response-time' ? '2000' : 'expected value'}
                  size="md"
                  width="fw"
                  accentColor={ACCENT}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 py-3 border-t border-[var(--color-surface-border)]">
          <ButtonView size="sm" variant="primary" accentColor={ACCENT} onClick={onClose}>
            Done
          </ButtonView>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ────────── XPath Evaluation Engine (runs in webview via DOMParser) ──────────

function evaluateAssertion(
  assertion: SoapAssertion,
  responseBody: string,
  responseTime?: number,
): { lastResult: 'pass' | 'fail'; lastActual?: string } {
  try {
    switch (assertion.type) {
      case 'not-fault': {
        const hasFault = /<(soap:|SOAP-ENV:|s:|)Fault[> ]/i.test(responseBody);
        return { lastResult: hasFault ? 'fail' : 'pass', lastActual: hasFault ? 'SOAP Fault detected' : undefined };
      }

      case 'is-fault': {
        const hasFault = /<(soap:|SOAP-ENV:|s:|)Fault[> ]/i.test(responseBody);
        return { lastResult: hasFault ? 'pass' : 'fail', lastActual: hasFault ? undefined : 'No fault found' };
      }

      case 'response-time': {
        const maxTime = parseInt(assertion.expectedValue || '0');
        const actual = responseTime || 0;
        return { lastResult: actual < maxTime ? 'pass' : 'fail', lastActual: `${actual}ms` };
      }

      case 'contains': {
        const found = responseBody.includes(assertion.expectedValue || '');
        return { lastResult: found ? 'pass' : 'fail', lastActual: found ? undefined : 'not found' };
      }

      case 'xpath-match': {
        const actual = evaluateXPath(responseBody, assertion.expression || '');
        const pass = compareValues(actual, assertion.expectedValue || '', assertion.operator || '=');
        return { lastResult: pass ? 'pass' : 'fail', lastActual: actual ?? undefined };
      }

      case 'xpath-exists': {
        const actual = evaluateXPath(responseBody, assertion.expression || '');
        return { lastResult: actual !== null && actual !== '' ? 'pass' : 'fail', lastActual: actual || 'not found' };
      }

      case 'xpath-count': {
        const count = evaluateXPathCount(responseBody, assertion.expression || '');
        const pass = compareValues(String(count), assertion.expectedValue || '', assertion.operator || '=');
        return { lastResult: pass ? 'pass' : 'fail', lastActual: String(count) };
      }

      case 'schema': {
        // Structural XML validation — checks well-formed XML + SOAP envelope structure
        const parser = new DOMParser();
        const doc = parser.parseFromString(responseBody, 'text/xml');
        const parseError = doc.querySelector('parsererror');
        if (parseError) {
          return { lastResult: 'fail', lastActual: 'Invalid XML: ' + parseError.textContent?.slice(0, 80) };
        }
        // Check for SOAP envelope structure
        const envelope = doc.documentElement;
        const isEnvelope = envelope.localName === 'Envelope' || envelope.tagName.includes(':Envelope');
        if (!isEnvelope) {
          return { lastResult: 'fail', lastActual: 'Missing SOAP Envelope root element' };
        }
        // Check for Body element
        const bodyEls = Array.from(envelope.children).filter(el => el.localName === 'Body' || el.tagName.includes(':Body'));
        if (bodyEls.length === 0) {
          return { lastResult: 'fail', lastActual: 'Missing SOAP Body element' };
        }
        // If expression specifies expected element name, check it exists in Body
        if (assertion.expression) {
          const body = bodyEls[0];
          const expectedEl = assertion.expression.trim();
          const found = Array.from(body.children).some(el =>
            el.localName === expectedEl || el.tagName.includes(`:${expectedEl}`)
          );
          if (!found) {
            return { lastResult: 'fail', lastActual: `Expected element "${expectedEl}" not found in Body` };
          }
        }
        return { lastResult: 'pass' };
      }

      case 'script': {
        const fn = new Function('response', 'responseBody', assertion.expression || 'return false');
        const result = fn(responseBody, responseBody);
        return { lastResult: result ? 'pass' : 'fail' };
      }

      default:
        return { lastResult: 'fail', lastActual: 'Unknown assertion type' };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { lastResult: 'fail', lastActual: `Error: ${msg}` };
  }
}

function evaluateXPath(xml: string, xpath: string): string | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    // Create namespace resolver from the document
    const nsResolver = doc.createNSResolver(doc.documentElement);

    const result = doc.evaluate(xpath, doc, nsResolver, XPathResult.STRING_TYPE, null);
    return result.stringValue || null;
  } catch {
    // Try without namespaces (strip prefixes from xpath)
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');
      const result = doc.evaluate(xpath, doc, null, XPathResult.STRING_TYPE, null);
      return result.stringValue || null;
    } catch {
      return null;
    }
  }
}

function evaluateXPathCount(xml: string, xpath: string): number {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const nsResolver = doc.createNSResolver(doc.documentElement);
    const result = doc.evaluate(xpath, doc, nsResolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    return result.snapshotLength;
  } catch {
    return 0;
  }
}

function compareValues(actual: string | null, expected: string, operator: string): boolean {
  if (actual === null) return false;
  switch (operator) {
    case '=': return actual === expected;
    case '!=': return actual !== expected;
    case '>': return parseFloat(actual) > parseFloat(expected);
    case '<': return parseFloat(actual) < parseFloat(expected);
    case 'contains': return actual.includes(expected);
    default: return actual === expected;
  }
}
