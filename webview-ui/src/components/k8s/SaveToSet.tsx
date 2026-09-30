/**
 * Save a forward into a set — an existing one, or a new one by name.
 *
 * A set is the forwards one piece of work needs: "backend local dev" is the
 * database, the Python service and the mock server on the ports your local
 * config expects. Saved with the workspace, so it travels with Git Sync.
 */
import { useState } from 'react';
import { ModalView } from '@salilvnair/dui';
import { useSets, addToSet, type SetItem } from './port-forward-prefs';
import { PF, tint, PfButton } from './pf-ui';

export function SaveToSetDialog({ item, onClose }: { item: SetItem; onClose: () => void }) {
  const sets = useSets();
  const [pick, setPick] = useState<string>(sets[0]?.id ?? 'new');
  const [name, setName] = useState('');
  const ok = pick !== 'new' || name.trim().length > 0;
  const what = `${item.service ? `svc/${item.service}` : item.workload?.name ?? item.pod} :${item.ports.map(p => p.remote).join(', :')} → localhost:${item.ports.map(p => p.local).join(', ')}`;

  return (
    <ModalView open onClose={onClose} size="sm" title="Save to a set"
               footerRight={
                 <div style={{ display: 'flex', gap: 8 }}>
                   <PfButton onClick={onClose}>Cancel</PfButton>
                   <PfButton tone="solid" disabled={!ok}
                             onClick={() => { addToSet(item, pick === 'new' ? { name } : { id: pick }); onClose(); }}>
                     Save
                   </PfButton>
                 </div>
               }>
      <div className="flex flex-col" style={{ gap: 10, fontSize: 12.5, color: PF.mu }}>
        <div style={{ fontFamily: PF.mono, fontSize: 12, color: PF.tx, padding: '8px 10px', borderRadius: 8, background: PF.well, border: `1px solid ${PF.bd}` }}>{what}</div>
        {sets.map(s => (
          <label key={s.id} className="flex items-center cursor-pointer" style={{ gap: 8, padding: '7px 10px', borderRadius: 8, border: `1px solid ${pick === s.id ? tint(PF.dk, 50) : PF.bd}`, background: pick === s.id ? tint(PF.dk, 8) : 'transparent' }}>
            <input type="radio" name="pf-set" checked={pick === s.id} onChange={() => setPick(s.id)} />
            <b style={{ color: PF.tx }}>{s.name}</b>
            <span style={{ fontSize: 11 }}>· {s.items.length} forward{s.items.length === 1 ? '' : 's'}</span>
          </label>
        ))}
        <label className="flex items-center" style={{ gap: 8, padding: '7px 10px', borderRadius: 8, border: `1px solid ${pick === 'new' ? tint(PF.dk, 50) : PF.bd}`, background: pick === 'new' ? tint(PF.dk, 8) : 'transparent' }}>
          <input type="radio" name="pf-set" checked={pick === 'new'} onChange={() => setPick('new')} />
          <input value={name} onChange={e => { setName(e.target.value.slice(0, 60)); setPick('new'); }} placeholder="A new set — e.g. backend local dev"
                 aria-label="New set name" className="outline-none flex-1"
                 style={{ padding: '4px 8px', borderRadius: 6, fontSize: 12.5, color: PF.tx, border: `1px solid ${PF.bd}`, background: PF.well }} />
        </label>
        <span style={{ fontSize: 11 }}>Sets are saved with the workspace — a teammate with it gets them too.</span>
      </div>
    </ModalView>
  );
}
