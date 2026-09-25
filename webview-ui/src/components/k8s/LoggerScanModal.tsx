/**
 * The catalogue in one go: every logger call in a project, offered for review.
 *
 * ── Why everything arrives unticked in places ──
 *
 * A scan of a Spring Boot service finds several hundred calls, and adding all
 * of them makes a catalogue nobody reads. So the ones that are rarely worth
 * watching start off — DEBUG and TRACE, anything under a test directory, and
 * calls with no hole in them, which have no value to name and are usually a
 * banner or a lifecycle line. Everything else starts on. The reader changes
 * whatever they disagree with and presses Add once.
 *
 * ── The counts are the useful part ──
 *
 * "384 found, 112 on" is the honest summary of what a scan means, and it is
 * the number people use to decide whether their default was sensible.
 */
import { useEffect, useMemo, useState } from 'react';
import { postMsg } from '../../vscode';
import { fromLoggerCall, templateParts, type LoggerPattern } from './logger-pattern';
import { addPatterns } from '../../store/dk8s-logger-store';
import { CloseIcon, SearchIcon } from '../../icons';
import { ACCENT } from './tone';

interface ScanHit {
  file: string;
  line: number;
  code: string;
  language: string;
  test: boolean;
}

interface Candidate {
  key: string;
  hit: ScanHit;
  pattern: LoggerPattern;
  on: boolean;
}

/** The default answer for one call, and the reason is shown beside it. */
function startsOn(hit: ScanHit, pattern: LoggerPattern): boolean {
  if (hit.test) return false;
  if (pattern.level === 'debug' || pattern.level === 'trace') return false;
  /* No hole means no value to name: a banner, a lifecycle line. Findable by
     searching its text, which is what somebody would do anyway. */
  if (pattern.holes.length === 0) return false;
  return true;
}

function reasonOff(hit: ScanHit, pattern: LoggerPattern): string | undefined {
  if (hit.test) return 'test source';
  if (pattern.level === 'debug' || pattern.level === 'trace') return pattern.level;
  if (pattern.holes.length === 0) return 'no values in it';
  return undefined;
}

export function LoggerScanModal({ scope, onClose }: { scope: string; onClose: () => void }) {
  const [folder, setFolder] = useState('');
  const [state, setState] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | undefined>();
  const [stoppedAt, setStoppedAt] = useState<string | undefined>();
  const [filesRead, setFilesRead] = useState(0);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type !== 'dk8s:loggerScan') return;

      if (msg.cancelled) { setState('idle'); return; }
      if (msg.error) { setState('error'); setError(String(msg.error)); return; }

      const hits = (msg.hits ?? []) as ScanHit[];
      const seen = new Set<string>();
      const parsed: Candidate[] = [];

      for (const hit of hits) {
        const pattern = fromLoggerCall(hit.code);
        /* A call the parser will not take is a call the catalogue cannot use.
           Counting it as "found" and then failing to add it would be worse
           than not offering it. */
        if (!pattern) continue;
        /* The same message written in two places is one pattern. */
        if (seen.has(pattern.template)) continue;
        seen.add(pattern.template);
        parsed.push({
          key: `${hit.file}:${hit.line}`,
          hit,
          pattern,
          on: startsOn(hit, pattern),
        });
      }

      setCandidates(parsed);
      setFilesRead(msg.filesRead ?? 0);
      setStoppedAt(msg.stoppedAt);
      setFolder(msg.folder ?? '');
      setState('done');
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const scan = () => {
    setState('scanning');
    setError(undefined);
    postMsg({ type: 'dk8s:scanLoggers', folder: folder.trim() });
  };

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(c =>
      c.pattern.template.toLowerCase().includes(q) || c.hit.file.toLowerCase().includes(q));
  }, [candidates, filter]);

  const on = candidates.filter(c => c.on);

  const setAll = (value: boolean) => {
    const keys = new Set(shown.map(c => c.key));
    setCandidates(prev => prev.map(c => (keys.has(c.key) ? { ...c, on: value } : c)));
  };

  const keep = () => {
    addPatterns(on.map(c => ({ ...c.pattern, source: 'scan' as const })), scope);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
         style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="flex flex-col rounded-lg overflow-hidden"
           style={{
             width: 'min(860px, 92vw)', height: 'min(620px, 88vh)',
             background: 'var(--color-panel)',
             border: '1px solid var(--color-surface-border)',
           }}>

        <div className="flex items-center gap-2 px-4 py-2.5"
             style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
          <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            Scan a project for logger calls
          </span>
          <span className="flex-1" />
          <button type="button" onClick={onClose} aria-label="Close" title="Close"
                  className="dk-close-btn p-1 rounded cursor-pointer border-none bg-transparent flex">
            <CloseIcon size={13} color="currentColor" />
          </button>
        </div>

        <div className="flex flex-col gap-2 px-4 py-3"
             style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
          <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Point it at the service's source — a Spring Boot project, a Python package, a Node service.
            Java, Kotlin, Python, JavaScript, TypeScript and Go are read; build output, dependencies and
            anything hidden are not.
          </span>
          <div className="flex gap-2">
            <input
              value={folder}
              onChange={e => setFolder(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') scan(); }}
              placeholder="C:\\work\\payments-service — or leave it empty to pick a folder"
              aria-label="Project folder"
              className="flex-1 min-w-0 px-2.5 py-1.5 rounded text-[11.5px] font-mono"
              style={{
                background: 'var(--color-input-bg, var(--color-surface))',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-surface-border)',
              }}
            />
            <button type="button" onClick={scan} disabled={state === 'scanning'}
                    className="flex items-center gap-1 px-3 py-1.5 rounded cursor-pointer border-none text-[11.5px]"
                    style={{
                      background: `color-mix(in srgb, ${ACCENT} 16%, transparent)`,
                      color: ACCENT,
                      opacity: state === 'scanning' ? 0.6 : 1,
                    }}>
              <SearchIcon size={12} /> {state === 'scanning' ? 'Scanning…' : 'Scan'}
            </button>
          </div>

          {state === 'error' && (
            <span className="text-[11.5px]" style={{ color: 'var(--color-error)' }}>{error}</span>
          )}
          {state === 'done' && (
            <div className="flex items-center gap-3 text-[11.5px]" style={{ color: 'var(--color-text-secondary)' }}>
              <span>{candidates.length} pattern{candidates.length === 1 ? '' : 's'} in {filesRead.toLocaleString()} files</span>
              <span style={{ color: ACCENT }}>{on.length} on</span>
              {stoppedAt && (
                <span style={{ color: 'var(--color-warning)' }}>
                  stopped at the {stoppedAt === 'files' ? 'file' : 'pattern'} limit — scan a subfolder for the rest
                </span>
              )}
            </div>
          )}
        </div>

        {state === 'done' && candidates.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2"
               style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter by message or file"
              aria-label="Filter the found patterns"
              className="flex-1 min-w-0 px-2 py-1 rounded text-[11px]"
              style={{
                background: 'var(--color-input-bg, var(--color-surface))',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-surface-border)',
              }}
            />
            <button type="button" onClick={() => setAll(true)}
                    className="px-2 py-1 rounded cursor-pointer border-none bg-transparent text-[11px]"
                    style={{ color: 'var(--color-text-secondary)' }}>
              all on
            </button>
            <button type="button" onClick={() => setAll(false)}
                    className="px-2 py-1 rounded cursor-pointer border-none bg-transparent text-[11px]"
                    style={{ color: 'var(--color-text-secondary)' }}>
              all off
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto px-3 py-2 flex flex-col gap-1">
          {state === 'idle' && (
            <span className="text-[11.5px] px-1 py-2" style={{ color: 'var(--color-text-muted)' }}>
              Nothing scanned yet.
            </span>
          )}
          {state === 'done' && candidates.length === 0 && (
            <span className="text-[11.5px] px-1 py-2" style={{ color: 'var(--color-text-muted)' }}>
              No logger calls found. If the source is somewhere else in the tree, point at that folder —
              this reads the folder it is given and everything under it.
            </span>
          )}

          {shown.map(c => {
            const reason = reasonOff(c.hit, c.pattern);
            return (
              <label key={c.key}
                     className="flex items-start gap-2.5 px-2.5 py-1.5 rounded cursor-pointer"
                     style={{
                       background: c.on ? 'var(--color-surface)' : 'transparent',
                       border: `1px solid ${c.on ? 'var(--color-surface-border)' : 'transparent'}`,
                     }}>
                <input
                  type="checkbox"
                  checked={c.on}
                  onChange={() => setCandidates(prev =>
                    prev.map(x => (x.key === c.key ? { ...x, on: !x.on } : x)))}
                  style={{ accentColor: ACCENT, marginTop: 2, width: 13, height: 13 }}
                />
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <div className="text-[11px] font-mono flex flex-wrap items-center gap-x-0.5">
                    {templateParts(c.pattern.template).map((part, i) => (
                      part.hole
                        ? (
                          <span key={i} className="px-1 rounded"
                                style={{
                                  background: `color-mix(in srgb, ${ACCENT} 18%, transparent)`,
                                  color: ACCENT,
                                }}>{part.text}</span>
                        )
                        : (
                          <span key={i} style={{ color: c.on ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                            {part.text}
                          </span>
                        )
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    {c.pattern.level && <span>{c.pattern.level.toUpperCase()}</span>}
                    <span className="truncate font-mono">{c.hit.file}:{c.hit.line}</span>
                    {reason && <span style={{ color: 'var(--color-warning)' }}>{reason}</span>}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="flex items-center gap-2 px-4 py-2.5"
             style={{ borderTop: '1px solid var(--color-surface-border)' }}>
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {folder && `from ${folder}`}
          </span>
          <span className="flex-1" />
          <button type="button" onClick={onClose}
                  className="px-3 py-1.5 rounded cursor-pointer text-[11.5px]"
                  style={{
                    background: 'transparent',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-surface-border)',
                  }}>
            Cancel
          </button>
          <button type="button" onClick={keep} disabled={on.length === 0}
                  className="px-3 py-1.5 rounded cursor-pointer border-none text-[11.5px]"
                  style={{
                    background: `color-mix(in srgb, ${ACCENT} 16%, transparent)`,
                    color: ACCENT,
                    opacity: on.length ? 1 : 0.5,
                  }}>
            Add {on.length || ''} to the catalogue
          </button>
        </div>
      </div>
    </div>
  );
}
