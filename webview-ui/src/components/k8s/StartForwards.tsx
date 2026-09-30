/**
 * Starting one forward or several — the one way they all start.
 *
 * The Ports tab, "every replica", a saved set and "start them again" all hand
 * over requests; this checks every local port with the host, and when one is
 * taken or any of them reaches production, shows the dialog first: which
 * process holds the port and a replacement for it; or what forwarding into
 * production means. Otherwise they start at once.
 */
import { useState, type ReactNode } from 'react';
import { ModalView } from '@salilvnair/dui';
import { usePortForwardStore, isProdContext, type ForwardRequest, type PortCheck } from '../../store/dk8s-port-forward-store';
import { currentPfPrefs } from './port-forward-prefs';
import { PF, PfButton, PfCheck, PfBar } from './pf-ui';

interface Pending {
  reqs: ForwardRequest[];
  /** One check per port, in the order the requests list them. */
  checks: PortCheck[];
  prod: string[];
}

export function useStartForwards(): { begin: (reqs: ForwardRequest[]) => Promise<void>; busy: boolean; dialog: ReactNode } {
  const [pending, setPending] = useState<Pending>();
  const [busy, setBusy] = useState(false);

  async function begin(reqs: ForwardRequest[]) {
    if (!reqs.length || busy) return;
    setBusy(true);
    try {
      const locals = reqs.flatMap(r => r.ports.map(p => p.local));
      const checks = await usePortForwardStore.getState().check(locals);
      const ask = currentPfPrefs().whenTaken === 'ask';
      let i = 0;
      const adjusted = reqs.map(r => ({
        ...r, ports: r.ports.map(p => {
          const c = checks[i++];
          return c && !c.free ? { ...p, local: ask ? 0 : c.suggestion ?? 0 } : p;
        }),
      }));
      const prod = [...new Set(reqs.filter(r => isProdContext(r.context)).map(r => r.context))];
      if (!checks.some(c => !c.free) && !prod.length) { adjusted.forEach(r => usePortForwardStore.getState().start(r)); return; }
      setPending({ reqs: adjusted, checks, prod });
    } finally {
      setBusy(false);
    }
  }

  const dialog = pending ? (
    <StartDialog pending={pending} onCancel={() => setPending(undefined)}
                 onGo={reqs => { reqs.forEach(r => usePortForwardStore.getState().start(r)); setPending(undefined); }} />
  ) : null;
  return { begin, busy, dialog };
}

function StartDialog({ pending, onCancel, onGo }: { pending: Pending; onCancel: () => void; onGo: (reqs: ForwardRequest[]) => void }) {
  const [reqs, setReqs] = useState(pending.reqs);
  const flat = reqs.flatMap((r, ri) => r.ports.map((p, pi) => ({ r, ri, p, pi })));
  const locals = flat.map(x => x.p.local);
  const valid = locals.every(n => n >= 1 && n <= 65535) && new Set(locals).size === locals.length;
  const one = reqs.length === 1 ? reqs[0] : undefined;
  /* A workload's name, unless two of its pods are in the list — then each pod, by its name. */
  const shared = (r: ForwardRequest) => !!r.workload && reqs.filter(x => !x.service && x.workload?.name === r.workload!.name).length > 1;
  const who = (r: ForwardRequest) => r.service ? `svc/${r.service}` : shared(r) ? r.pod : r.workload?.name ?? r.pod;
  const localLabel = locals.map(n => n || '…').join(', ');

  const setLocal = (ri: number, pi: number, n: number) =>
    setReqs(rs => rs.map((r, i) => (i !== ri ? r : { ...r, ports: r.ports.map((p, j) => (j === pi ? { ...p, local: n } : p)) })));

  const title = pending.prod.length
    ? <span className="flex items-center" style={{ gap: 8 }}><span style={{ color: PF.er }}>▲</span>Forward to production?</span>
    : one
      ? <span>Forward <span style={{ fontFamily: PF.mono, color: PF.dk }}>{one.ports.map(p => p.remote).join(', ')}</span> from {who(one)}</span>
      : <span>Start {reqs.length} forwards</span>;

  return (
    <ModalView open onClose={onCancel} size="sm" title={title}
               footerRight={
                 <div style={{ display: 'flex', gap: 8 }}>
                   <PfButton onClick={onCancel}>Cancel</PfButton>
                   <PfButton tone={pending.prod.length ? 'danger' : 'solid'} disabled={!valid} onClick={() => onGo(reqs)}>
                     {pending.prod.length ? 'Forward to production' : one ? `Forward on ${localLabel}` : `Start ${reqs.length} forwards`}
                   </PfButton>
                 </div>
               }>
      <div className="flex flex-col" style={{ gap: 10, fontSize: 12.5, color: PF.mu }}>
        {pending.prod.length > 0 && (
          <>
            <PfBar tone="er"><b>{pending.prod.join(', ')}</b> {pending.prod.length === 1 ? 'is' : 'are'} marked as production.</PfBar>
            <p style={{ margin: 0 }}>
              Anything on this machine that calls <b style={{ color: PF.tx, fontFamily: PF.mono }}>localhost:{localLabel}</b> will
              reach <b style={{ color: PF.tx, fontFamily: PF.mono }}>{reqs.map(who).join(', ')}</b> in production — including tests and load tools you forget are pointed there.
            </p>
            <PfCheck>Stop it after <b style={{ color: PF.tx }}>60 minutes</b></PfCheck>
            <PfCheck>Only this machine (127.0.0.1)</PfCheck>
          </>
        )}
        {flat.map(({ r, ri, p, pi }, k) => {
          const c = pending.checks[k];
          if (!c || c.free) return null;
          return (
            <div key={`${ri}:${pi}`} className="flex flex-col" style={{ gap: 8 }}>
              <PfBar tone="wa">
                <b style={{ fontFamily: PF.mono }}>localhost:{c.port}</b> is taken{c.holder ? <> — by <b>{c.holder.name ?? 'a process'}</b>{c.holder.pid ? ` (PID ${c.holder.pid})` : ''}</> : ''}.
                {reqs.length > 1 && <> For <b>{who(r)}</b> :{p.remote}.</>}
              </PfBar>
              <label className="flex flex-col" style={{ gap: 4 }}>
                <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: PF.mu }}>Local port</span>
                <input value={p.local ? String(p.local) : ''} inputMode="numeric" placeholder="type a port" aria-label={`Local port instead of ${c.port}`}
                       onChange={e => setLocal(ri, pi, Number(e.target.value.replace(/\D/g, '').slice(0, 5)))}
                       className="outline-none"
                       style={{ padding: '6px 9px', borderRadius: 7, fontFamily: PF.mono, fontSize: 12, color: PF.tx, border: `1px solid ${PF.bd}`, background: PF.well }} />
              </label>
              <p style={{ margin: 0 }}>
                {p.local ? (c.suggestion === p.local ? 'The next free port.' : 'Your port.') : 'Pick a port to use instead.'} Keep <b style={{ color: PF.tx }}>{c.port}</b> by stopping that process first.
              </p>
            </div>
          );
        })}
        {reqs.length > 1 && !pending.prod.length && pending.checks.every(c => c.free) && (
          <p style={{ margin: 0 }}>{reqs.map(r => `${who(r)} → localhost:${r.ports.map(p => p.local).join(', ')}`).join(' · ')}</p>
        )}
      </div>
    </ModalView>
  );
}
