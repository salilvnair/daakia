/**
 * Which of the watched pods a Daakia AI question may search.
 *
 * Every pod dk8s shows was searched — nine pods for a question about one
 * service, and a wiremock and a postgres in every answer. This picks by
 * workload rather than by pod: a rollout renames the pods, not the
 * deployment, so the choice survives it; and what is kept is what was left
 * OUT, so an app deployed tomorrow is searched without anyone ticking it.
 *
 * It sits in the dk8s pill in the composer, beside the ✕ — the pill is where
 * the question's scope is already said. None ticked is allowed: questions
 * then leave the cluster alone, and the pill says so.
 */
import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ButtonView, CheckboxView, FilterInputView, PopoverView } from '@salilvnair/dui';
import { useUiStateStore } from '../../store/ui-state-store';
import type { PodSummary } from '../../store/k8s-store';
import { useLibrarySlot } from './use-library-slot';
import { DK8S_EXCLUDED_PREF, dk8sExcluded, dk8sScopeKey, setDk8sExcluded } from './dk8s-chat-prompts';

const DK8S = 'var(--dai-dk8s, var(--color-dk8s))';

export function Dk8sPodPickerPortal({ root, pods }: { root: HTMLElement | null; pods: PodSummary[] }) {
  const slot = useLibrarySlot(root, '.ce-composer-reply', 'dai-pods-slot', pods.length > 0);
  if (!slot || !pods.length) return null;
  return createPortal(<Dk8sPodPicker pods={pods} />, slot);
}

interface Group { key: string; pods: PodSummary[] }

export function Dk8sPodPicker({ pods }: { pods: PodSummary[] }) {
  const excluded = dk8sExcluded(useUiStateStore(s => s.prefs[DK8S_EXCLUDED_PREF]));
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const anchor = useRef<HTMLSpanElement>(null);

  const groups = useMemo<Group[]>(() => {
    const by = new Map<string, Group>();
    for (const p of pods) {
      const key = dk8sScopeKey(p);
      const g = by.get(key) ?? { key, pods: [] };
      g.pods.push(p);
      by.set(key, g);
    }
    return [...by.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [pods]);

  const isOn = (g: Group) => !excluded.includes(g.key);
  const on = groups.filter(isOn);
  const podsOn = on.reduce((n, g) => n + g.pods.length, 0);
  const all = on.length === groups.length;

  /* A search narrows the list, and Select all then means "all of these". */
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? groups.filter(g => g.key.toLowerCase().includes(needle) || g.pods.some(p => p.name.toLowerCase().includes(needle)))
    : groups;
  const shownOn = shown.filter(isOn).length;
  const shownAll = shown.length > 0 && shownOn === shown.length;
  const setShown = (checked: boolean) => {
    const keys = new Set(shown.map(g => g.key));
    setDk8sExcluded(checked ? excluded.filter(k => !keys.has(k)) : [...excluded, ...keys]);
  };

  const toggle = (g: Group) =>
    setDk8sExcluded(isOn(g) ? [...excluded, g.key] : excluded.filter(k => k !== g.key));

  return (
    <span ref={anchor} className="dai-pods">
      <ButtonView
        variant="ghost"
        size="sm"
        color={DK8S}
        accentColor={DK8S}
        title="Choose which pods a question searches"
        aria-haspopup="dialog"
        aria-expanded={open}
        iconRight={<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>}
        onClick={() => setOpen(o => !o)}
      >
        {all ? 'All pods' : podsOn === 0 ? 'No pods' : `${podsOn} of ${pods.length} pods`}
      </ButtonView>

      <PopoverView testId="dk8s-pod-picker" open={open} onClose={() => { setOpen(false); setQ(''); }}
                   anchorEl={anchor.current} placement="top" borderRadius={12}>
        <div className="dai-pp" role="dialog" aria-label="Pods to search">
          <div className="dai-pp-head">
            <span className="dai-pp-title">Pods to search</span>
            <span className="dai-pp-count">{podsOn} of {pods.length}</span>
          </div>

          <div className="dai-pp-tools">
            <FilterInputView
              testId="dk8s-pod-picker-search"
              value={q}
              onChange={setQ}
              placeholder="Search apps and pods"
              size="sm"
              width="100%"
              accentColor={DK8S}
              autoFocus
            />
            <div className="dai-pp-all" title={needle ? `Select all ${shown.length} shown` : 'Select all'}>
              <CheckboxView
                checked={shownAll}
                indeterminate={shownOn > 0 && !shownAll}
                size="sm"
                accentColor={DK8S}
                onChange={setShown}
              />
              <span className="dai-pp-count">{shownOn}/{shown.length}</span>
            </div>
          </div>

          <div className="dai-pp-list">
            {shown.length === 0 && <div className="dai-pp-none">No app or pod matches “{q}”.</div>}
            {shown.map(g => (
              <div key={g.key} className={`dai-pp-row${isOn(g) ? ' on' : ''}`} title={g.pods.map(p => p.name).join('\n')}>
                <CheckboxView checked={isOn(g)} size="sm" accentColor={DK8S} label={g.key} onChange={() => toggle(g)} />
                {g.pods.length > 1 && <span className="dai-pp-count">{g.pods.length} pods</span>}
              </div>
            ))}
          </div>

          {podsOn === 0 && (
            <div className="dai-pp-warn">None ticked — questions will not search the cluster.</div>
          )}
        </div>
      </PopoverView>
    </span>
  );
}
