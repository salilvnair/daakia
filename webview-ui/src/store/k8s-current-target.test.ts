/**
 * Switching context or namespace does not un-send what is already in flight.
 *
 * The reported bug, exactly: pick a namespace, and while its pods are loading
 * pick another. The first `kubectl get pods` finishes, its answer arrives after
 * the switch, and the grid fills with the namespace somebody had just left —
 * under a breadcrumb naming the new one. Nothing on screen says which of the
 * two it is showing, which is the part that makes it expensive: the reader
 * acts on it.
 */
import { describe, it, expect } from 'vitest';
import { isCurrentTarget } from './k8s-store';

const single = { targets: [], context: 'kind-prod', namespace: 'payments' };
const multi = {
  targets: [
    { context: 'kind-prod', namespace: 'payments' },
    { context: 'kind-prod', namespace: 'orders' },
  ],
  context: 'kind-prod',
  namespace: 'payments',
};

describe('one namespace selected', () => {
  it('takes what it asked for', () => {
    expect(isCurrentTarget(single, 'kind-prod', 'payments')).toBe(true);
  });

  it('throws away the namespace it just left', () => {
    expect(isCurrentTarget(single, 'kind-prod', 'reporting')).toBe(false);
  });

  it('throws away the cluster it just left', () => {
    expect(isCurrentTarget(single, 'kind-lab', 'payments')).toBe(false);
  });
});

describe('several namespaces selected', () => {
  it('takes any of them', () => {
    expect(isCurrentTarget(multi, 'kind-prod', 'payments')).toBe(true);
    expect(isCurrentTarget(multi, 'kind-prod', 'orders')).toBe(true);
  });

  it('throws away one that is not among them', () => {
    expect(isCurrentTarget(multi, 'kind-prod', 'reporting')).toBe(false);
  });

  /*
    The single-value fields trail the list — `namespace` is only the first of
    them — so a guard that consulted those instead would drop two thirds of a
    multi-namespace watch.
  */
  it('does not fall back to the single namespace while a list is selected', () => {
    expect(isCurrentTarget(multi, 'kind-prod', 'orders')).toBe(true);
  });
});

describe('what it must not throw away', () => {
  it('keeps a message that names no target', () => {
    expect(isCurrentTarget(single)).toBe(true);
    expect(isCurrentTarget(single, undefined, undefined)).toBe(true);
  });

  it('keeps the first answer when nothing is selected yet', () => {
    // Startup: the host replays what it was already watching, and the store
    // has not been told what that is.
    expect(isCurrentTarget({ targets: [] }, 'kind-prod', 'payments')).toBe(true);
  });

  it('judges a context-only message on its context', () => {
    expect(isCurrentTarget(single, 'kind-prod')).toBe(true);
    expect(isCurrentTarget(single, 'kind-lab')).toBe(false);
  });
});
