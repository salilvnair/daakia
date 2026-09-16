/**
 * Reading the cheap pod list.
 *
 * Every row here is one kubectl really printed. The parsing matters more than
 * it looks: this is what the grid draws first, so a column read one position
 * out puts an IP address where the node goes on the screen somebody is staring
 * at while the real answer is still in flight.
 */
import { describe, it, expect } from 'vitest';
import { parsePodRow } from './pods-table';

const NS = 'pvfix';

describe('a pod from a table row', () => {
  it('reads a running pod', () => {
    const p = parsePodRow(
      'prodapp-bc8f7bf84-mhz5f          1/1   Running     0     169m    10.244.0.15   dk8s-prod-control-plane   <none>   <none>',
      NS,
    );
    expect(p).toMatchObject({
      name: 'prodapp-bc8f7bf84-mhz5f',
      namespace: NS,
      phase: 'Running',
      restarts: 0,
      node: 'dk8s-prod-control-plane',
      healthy: true,
      partial: true,
    });
    expect(p!.ready).toEqual({ current: 1, total: 1 });
  });

  it('survives the restart count kubectl decorates', () => {
    /*
      The whole reason this is a regex and not a split. kubectl prints `0` for
      a pod that never restarted and `1 (171m ago)` for one that did — one
      token or three — so counting columns by position puts the age where the
      IP goes for every pod that ever crashed, which is every pod anybody is
      looking for.
    */
    const p = parsePodRow(
      'checkout-api-6bfdf7b7b4-2l2z6   1/1   Running   1 (171m ago)   2d23h   10.244.0.5   dk8s-prod-control-plane   <none>   <none>',
      'checkout',
    );
    expect(p).toMatchObject({ restarts: 1, node: 'dk8s-prod-control-plane', phase: 'Running' });
  });

  it('reads a completed CronJob run, which is not unhealthy', () => {
    const p = parsePodRow(
      'nightly-billing-29825605-szzk9   0/1   Completed   0     12m     10.244.0.47   dk8s-prod-control-plane   <none>   <none>',
      NS,
    );
    expect(p).toMatchObject({ phase: 'Completed', healthy: false });
    expect(p!.ready).toEqual({ current: 0, total: 1 });
  });

  it('calls a terminating pod deleting, which the JSON only says with a timestamp', () => {
    const p = parsePodRow(
      'prodapp-bc8f7bf84-mhz5f   1/1   Terminating   0   169m   10.244.0.15   node-1   <none>   <none>',
      NS,
    );
    expect(p).toMatchObject({ phase: 'Terminating', deleting: true, healthy: false });
  });

  it('reads a multi-container pod that is only half ready', () => {
    const p = parsePodRow(
      'zp-backend-7f9455548d-xm6kc   1/2   Running   0   4h   10.244.0.20   node-2   <none>   <none>',
      NS,
    );
    expect(p!.ready).toEqual({ current: 1, total: 2 });
    expect(p!.healthy).toBe(false);
  });

  it('works without -o wide, where there is no IP or node', () => {
    const p = parsePodRow('prodapp-bc8f7bf84-mhz5f   1/1   Running   0   169m', NS);
    expect(p).toMatchObject({ name: 'prodapp-bc8f7bf84-mhz5f', phase: 'Running' });
    expect(p!.node).toBeUndefined();
  });

  it('leaves out a node kubectl printed as <none>', () => {
    /* An unscheduled pod. Showing the literal `<none>` on a card is showing
       kubectl's formatting rather than the cluster's answer. */
    const p = parsePodRow(
      'pending-pod   0/1   Pending   0   5s   <none>   <none>   <none>   <none>',
      NS,
    );
    expect(p!.node).toBeUndefined();
    expect(p!.phase).toBe('Pending');
  });

  it('says nothing about a line that is not a row', () => {
    expect(parsePodRow('', NS)).toBeUndefined();
    expect(parsePodRow('No resources found in pvfix namespace.', NS)).toBeUndefined();
    expect(parsePodRow('error: you must be logged in to the server', NS)).toBeUndefined();
  });

  it('marks everything it produces as partial', () => {
    /*
      A table has no uid, no owner, no images and no per-container detail. The
      flag is what stops anything downstream reading a field the row never had
      as a field the cluster said was empty.
    */
    const p = parsePodRow('x   1/1   Running   0   1m   10.0.0.1   node-1   <none>   <none>', NS);
    expect(p!.partial).toBe(true);
    expect(p!.containers).toEqual([]);
    expect(p!.workload).toBeUndefined();
    expect(p!.image).toBeUndefined();
  });
});
