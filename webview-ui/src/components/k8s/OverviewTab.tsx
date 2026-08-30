/**
 * The pod at a glance.
 *
 * Everything you would run three commands to assemble — what it is, what it is
 * doing, what it is made of, and what Kubernetes has been saying about it —
 * on one screen, in the order you would actually ask.
 */
import { CopyButtonView } from '@salilvnair/dui';
import { LayersIcon, ServerIcon, ClockIcon, NetworkIcon, WarningTriangleIcon } from '../../icons';
import { useK8sStore } from '../../store/k8s-store';
import { severityOf, severityColor, shortAge, restartLabel, formatBytes } from './pod-view';
import { MemoryPanel } from './MemoryPanel';

const ACCENT = 'var(--color-dk8s)';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span className="text-[9.5px] uppercase tracking-wider shrink-0"
            style={{ width: 96, color: 'var(--color-text-muted)' }}>
        {label}
      </span>
      <span className="text-[11.5px] min-w-0" style={{ color: 'var(--color-text-primary)' }}>
        {children}
      </span>
    </div>
  );
}

function Card({ title, Icon, children }: {
  title: string; Icon: typeof LayersIcon; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 px-3.5 py-3 rounded-lg"
         style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} color={ACCENT} />
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

/**
 * Events, pulled out of the describe blob.
 *
 * They are the most informative part of a describe and the part people skip,
 * because they are at the very bottom of several hundred lines. Up here they
 * are the first thing you see.
 */
function events(describe?: string): string[] {
  if (!describe) return [];
  const at = describe.lastIndexOf('\nEvents:');
  if (at === -1) return [];
  return describe.slice(at + 8).split('\n')
    .map(l => l.trim())
    // describe prints a table: a `Type Reason Age From Message` header with a
    // rule of dashes under it. Dropping the header and keeping the rule left a
    // row of `----  ------  ----` at the top of the card, which reads as a
    // parse that went wrong rather than as the underline it is.
    .filter(l => l && !/^Type\s+Reason/.test(l) && !/^[-\s]+$/.test(l) && l !== '<none>')
    .slice(0, 8);
}

export function OverviewTab() {
  const { detail, describeText, runtime, usage } = useK8sStore();
  if (!detail) return null;

  const sev = severityOf(detail);
  const color = severityColor(sev);
  const use = usage[detail.name];
  const evts = events(describeText);

  return (
    <div className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-3 h-full min-h-0">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <Card title="state" Icon={ServerIcon}>
          <Row label="status">
            <span style={{ color, fontWeight: 600 }}>{detail.reason || detail.phase}</span>
          </Row>
          <Row label="ready">{detail.ready.current} / {detail.ready.total}</Row>
          <Row label="restarts">
            <span style={{ color: detail.restarts > 0 ? 'var(--color-warning)' : undefined }}>
              {restartLabel(detail)}
            </span>
          </Row>
          <Row label="age">{shortAge(detail.startedAt)}</Row>
          {detail.node && <Row label="node"><span className="font-mono">{detail.node}</span></Row>}
        </Card>

        <Card title="identity" Icon={LayersIcon}>
          <Row label="namespace"><span className="font-mono">{detail.namespace}</span></Row>
          <Row label="cluster"><span className="font-mono">{detail.context}</span></Row>
          {detail.workload && (
            <Row label="workload">
              <span className="font-mono">{detail.workload.kind}/{detail.workload.name}</span>
            </Row>
          )}
          <Row label="runtime">
            {runtime && runtime.runtime !== 'unknown'
              ? <>{runtime.runtime} <span style={{ color: 'var(--color-text-muted)' }}>
                  · from {runtime.detectedFrom}
                </span></>
              : <span style={{ color: 'var(--color-text-muted)' }}>not identified</span>}
          </Row>
          {use && (
            <Row label="usage">
              <span className="font-mono">{formatBytes(use.memBytes)} · {use.cpuMilli}m cpu</span>
            </Row>
          )}
        </Card>
      </div>

      <MemoryPanel />

      <Card title="containers" Icon={NetworkIcon}>
        <div className="flex flex-col gap-2">
          {detail.containers.map(c => (
            <div key={c.name} className="flex items-baseline gap-3 flex-wrap">
              <span style={{ width: 96 }} className="text-[11.5px] font-mono shrink-0">
                {c.name}
              </span>
              <span className="text-[10.5px] px-1.5 py-0.5 rounded shrink-0"
                    style={{
                      background: c.ready
                        ? 'color-mix(in srgb, var(--color-success) 14%, transparent)'
                        : 'color-mix(in srgb, var(--color-error) 14%, transparent)',
                      color: c.ready ? 'var(--color-success)' : 'var(--color-error)',
                    }}>
                {c.ready ? 'ready' : 'not ready'}
              </span>
              {c.restarts > 0 && (
                <span className="text-[10.5px]" style={{ color: 'var(--color-warning)' }}>
                  {c.restarts} restart{c.restarts === 1 ? '' : 's'}
                </span>
              )}
              <span className="text-[10.5px] font-mono truncate flex-1 min-w-0"
                    style={{ color: 'var(--color-text-muted)' }} title={c.image}>
                {c.image}
              </span>
              <CopyButtonView text={c.image} size="xs" />
            </div>
          ))}
        </div>
      </Card>

      {/* Events last in describe, first here — they are the most informative
          part of it and the part everyone scrolls past. */}
      <Card title="recent events" Icon={ClockIcon}>
        {evts.length === 0 ? (
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            No events. Kubernetes drops them after about an hour, so a quiet pod and an
            old problem look the same here.
          </span>
        ) : (
          <div className="flex flex-col gap-0.5 font-mono" style={{ fontSize: 10.5 }}>
            {evts.map((e, i) => (
              <div key={i} className="flex items-start gap-1.5"
                   style={{ color: /Warning|Failed|BackOff|Unhealthy|Killing/.test(e)
                     ? 'var(--color-warning)' : 'var(--color-text-secondary)' }}>
                {/Warning|Failed|BackOff|Unhealthy|Killing/.test(e) && (
                  <WarningTriangleIcon size={10} color="var(--color-warning)" />
                )}
                <span style={{ whiteSpace: 'pre-wrap' }}>{e}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
