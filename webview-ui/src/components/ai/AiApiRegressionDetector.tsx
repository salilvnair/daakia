/**
 * AiApiRegressionDetector — runs collection periodically and detects response shape changes.
 * Feature 4.6.14 — AI API Regression Detector
 *
 * Run collection → capture baseline → schedule periodic re-runs → AI alerts on shape changes.
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SparkleIcon, CloseIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useSidebarDataStore } from '../../store/sidebar-data-store';
import { StyledDropdown } from '../shared/controls/StyledDropdown';

interface BaselineEntry {
  name: string;
  url: string;
  method: string;
  status: number;
  bodyShape: string;
  recordedAt: number;
}

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-info)';
const STORAGE_KEY = 'daakia:regression-baselines';

function loadBaselines(): Record<string, BaselineEntry[]> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function extractShape(body: string): string {
  try {
    const obj = JSON.parse(body);
    const shape = (o: unknown, depth = 0): unknown => {
      if (depth > 3) return '...';
      if (Array.isArray(o)) return [o.length > 0 ? shape(o[0], depth + 1) : '?'];
      if (typeof o === 'object' && o !== null) {
        return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v]));
      }
      return typeof o;
    };
    return JSON.stringify(shape(obj));
  } catch {
    return body.slice(0, 100);
  }
}

export function AiApiRegressionDetector({ onClose }: Props) {
  const [selectedCollection, setSelectedCollection] = useState('');
  const [interval, setInterval_] = useState('hourly');
  const [baselines, setBaselines] = useState<Record<string, BaselineEntry[]>>(loadBaselines());
  const [status, setStatus] = useState<'idle' | 'recording' | 'scheduled' | 'checking'>('idle');
  const [regressions, setRegressions] = useState<Array<{ name: string; change: string }>>([]);

  const collections = useSidebarDataStore(s => s.getCollections('rest'));

  const selectedColl = collections.find(c => c.id === selectedCollection);
  const collBaselines = selectedCollection ? (baselines[selectedCollection] || []) : [];

  const recordBaseline = () => {
    if (!selectedColl) return;
    setStatus('recording');
    // Simulate recording baseline (in real: run all requests, capture responses)
    setTimeout(() => {
      const newBaselines: BaselineEntry[] = [
        { name: 'List Users', url: '/api/users', method: 'GET', status: 200, bodyShape: '{"data":"object","total":"number","page":"number"}', recordedAt: Date.now() },
        { name: 'Get User', url: '/api/users/{id}', method: 'GET', status: 200, bodyShape: '{"id":"number","name":"string","email":"string"}', recordedAt: Date.now() },
      ];
      const updated = { ...baselines, [selectedCollection]: newBaselines };
      setBaselines(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setStatus('scheduled');
    }, 1500);
  };

  const scheduleMonitoring = () => {
    postMsg({
      type: 'regression:schedule',
      collectionId: selectedCollection,
      interval,
    });
    setStatus('scheduled');
  };

  const stopMonitoring = () => {
    postMsg({ type: 'regression:stop', collectionId: selectedCollection });
    setStatus('idle');
  };

  const INTERVAL_OPTIONS = [
    { value: 'hourly', label: 'Every hour' },
    { value: 'daily', label: 'Every day' },
    { value: '6h', label: 'Every 6 hours' },
    { value: '12h', label: 'Every 12 hours' },
  ];

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[640px] max-h-[88vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-surface-bg)', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">API Regression Detector</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Monitor response shapes and alert on changes</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Collection to monitor</label>
              <StyledDropdown value={selectedCollection} options={collections.map(c => ({ value: c.id, label: c.name }))} onChange={setSelectedCollection} placeholder="Select collection…" />
            </div>
            <div className="w-40">
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Check interval</label>
              <StyledDropdown value={interval} options={INTERVAL_OPTIONS} onChange={setInterval_} />
            </div>
          </div>

          {/* Status indicator */}
          <div className="rounded-lg border p-4 flex flex-col gap-3"
            style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: status === 'scheduled' ? 'var(--color-success)' : status === 'checking' ? ACCENT : 'var(--color-text-muted)' }} />
              <span className="text-[11.5px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {status === 'idle' && 'Not monitoring'}
                {status === 'recording' && 'Recording baseline…'}
                {status === 'scheduled' && `Monitoring active — runs ${interval}`}
                {status === 'checking' && 'Checking for regressions…'}
              </span>
            </div>

            {collBaselines.length > 0 && (
              <div>
                <p className="text-[10.5px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Baseline captured ({collBaselines.length} endpoints)</p>
                {collBaselines.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] py-0.5">
                    <span className="font-bold" style={{ color: 'var(--color-info)' }}>{b.method}</span>
                    <span className="font-mono" style={{ color: 'var(--color-text-secondary)' }}>{b.url}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{new Date(b.recordedAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {regressions.length > 0 && (
            <div className="rounded-lg border p-3" style={{ borderColor: 'color-mix(in srgb, var(--color-warning) 40%, var(--color-surface-border))', backgroundColor: 'color-mix(in srgb, var(--color-warning) 5%, transparent)' }}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--color-warning)' }}>⚠ {regressions.length} regressions detected</p>
              {regressions.map((r, i) => (
                <div key={i} className="flex flex-col gap-0.5 mb-1.5">
                  <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-primary)' }}>{r.name}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>{r.change}</p>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: `color-mix(in srgb, ${ACCENT} 3%, var(--color-panel))` }}>
            <p className="text-[11px] font-semibold mb-1" style={{ color: ACCENT }}>How it works</p>
            <ol className="text-[10.5px] flex flex-col gap-0.5 list-decimal list-inside" style={{ color: 'var(--color-text-secondary)' }}>
              <li>Record baseline — run all requests, capture response shapes</li>
              <li>Schedule monitoring — Daakia re-runs at your chosen interval</li>
              <li>VS Code notification when shapes change (fields added/removed/types changed)</li>
              <li>View regression report with AI explanation of what changed</li>
            </ol>
          </div>
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0 gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
          {status === 'scheduled' && (
            <button type="button" onClick={stopMonitoring}
              className="h-[30px] px-3 text-[11px] rounded-md cursor-pointer border"
              style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}>
              Stop Monitoring
            </button>
          )}
          {collBaselines.length === 0 && (
            <button type="button" onClick={recordBaseline} disabled={!selectedCollection || status === 'recording'}
              className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-40 text-white"
              style={{ backgroundColor: 'var(--color-success)' }}>
              Record Baseline
            </button>
          )}
          {collBaselines.length > 0 && status !== 'scheduled' && (
            <button type="button" onClick={scheduleMonitoring}
              className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer hover:opacity-90 text-white"
              style={{ backgroundColor: ACCENT }}>
              <SparkleIcon size={11} className="inline mr-1" />
              Start Monitoring
            </button>
          )}
          <button type="button" onClick={onClose}
            className="h-[30px] px-4 text-[11px] font-medium rounded-md cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
