/**
 * Everything one pod can tell you.
 *
 * A full-bleed overlay rather than a side drawer: reading logs is the main
 * activity here, not a peek, and a 380px drawer turns every stack trace into a
 * horizontal scroll. Escape and the back arrow return to the grid.
 */
import { useEffect } from 'react';
import {
  CloseIcon, TerminalIcon, FileTextIcon, CodeIcon, StethoscopeIcon,
  WandIcon, ChevronLeftIcon, CopyIcon,
} from '../../icons';
import { CopyButtonView } from '@salilvnair/dui';
import { useK8sStore, type DetailTab } from '../../store/k8s-store';
import { useDk8sAiStore } from '../../store/dk8s-ai-store';
import { severityOf, severityColor, shortAge, restartLabel } from './pod-view';
import { LogViewer } from './LogViewer';
import { AiAnswerPanel } from './AiAnswerPanel';
import { DoctorTab } from './DoctorTab';

const ACCENT = 'var(--color-dk8s)';

const TABS: { id: DetailTab; label: string; Icon: typeof FileTextIcon }[] = [
  { id: 'logs', label: 'Logs', Icon: FileTextIcon },
  { id: 'describe', label: 'Describe', Icon: CodeIcon },
  { id: 'yaml', label: 'YAML', Icon: CodeIcon },
  { id: 'doctor', label: 'Doctor', Icon: StethoscopeIcon },
];

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</span>
      <span className="text-[11.5px]" style={{ color: color ?? 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}

/** describe and YAML are both "a wall of text with a copy button". */
function TextPane({ text, busy, empty }: { text?: string; busy: boolean; empty: string }) {
  if (busy) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-[12px] text-[var(--color-text-muted)]">Loading…</span>
      </div>
    );
  }
  if (!text?.trim()) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-[12px] text-[var(--color-text-muted)]">{empty}</span>
      </div>
    );
  }
  return (
    <div className="relative h-full min-h-0">
      <div className="absolute top-2 right-4 z-10">
        <CopyButtonView text={text} size="xs" />
      </div>
      <pre className="h-full overflow-auto px-4 py-3 font-mono m-0"
           style={{ fontSize: 11.5, lineHeight: '17px', color: 'var(--color-text-primary)', whiteSpace: 'pre' }}>
        {text}
      </pre>
    </div>
  );
}

export function PodDetail() {
  const {
    detail, detailTab, setDetailTab, closeDetail,
    describeText, yamlText, describeBusy, runtime,
    openShell, shellNotice, dismissShellNotice,
  } = useK8sStore();

  const aiOpen = useDk8sAiStore(s => s.open);
  const openAi = useDk8sAiStore(s => s.openPanel);
  const answers = useDk8sAiStore(s => s.answers);

  // Escape closes — but only when nothing is selected, so the first Escape
  // after highlighting a stack trace does not throw away the panel too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      closeDetail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeDetail]);

  if (!detail) return null;

  const sev = severityOf(detail);
  const color = severityColor(sev);

  return (
    <div className="absolute inset-0 flex flex-col z-30"
         style={{ background: 'var(--color-bg, var(--color-surface))' }}>
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0"
           style={{
             borderBottom: '1px solid var(--color-surface-border)',
             background: `linear-gradient(to right, color-mix(in srgb, ${color} 8%, transparent), transparent 60%)`,
           }}>
        <button type="button" onClick={closeDetail} title="Back to pods"
                className="p-1 rounded cursor-pointer border-none bg-transparent">
          <ChevronLeftIcon size={16} color="var(--color-text-secondary)" />
        </button>

        <span style={{ width: 7, height: 7, borderRadius: 7, background: color, boxShadow: `0 0 8px ${color}` }} />

        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[13.5px] font-mono truncate" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            {detail.name}
          </span>
          <span className="text-[10.5px] text-[var(--color-text-muted)] truncate">
            {detail.namespace} · {detail.context}
            {runtime && runtime.runtime !== 'unknown' && ` · ${runtime.runtime}`}
          </span>
        </div>

        <div className="flex items-center gap-5 ml-4 flex-wrap">
          <Stat label="status" value={detail.reason || detail.phase} color={color} />
          <Stat label="ready" value={`${detail.ready.current}/${detail.ready.total}`} />
          <Stat label="restarts" value={restartLabel(detail)}
                color={detail.restarts > 0 ? 'var(--color-warning)' : undefined} />
          <Stat label="age" value={shortAge(detail.startedAt)} />
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={openShell}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] cursor-pointer"
          style={{
            background: 'transparent',
            border: '1px solid var(--color-surface-border)',
            color: 'var(--color-text-secondary)',
          }}
          title="Open a shell in this pod, in a VS Code terminal"
        >
          <TerminalIcon size={12} />
          Shell
        </button>

        {!aiOpen && (
          <button
            type="button"
            onClick={openAi}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] cursor-pointer"
            style={{
              background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
              border: `1px solid color-mix(in srgb, ${ACCENT} 38%, transparent)`,
              color: ACCENT,
            }}
          >
            <WandIcon size={12} color={ACCENT} />
            AI{answers.length > 0 && ` · ${answers.length}`}
          </button>
        )}

        <button type="button" onClick={closeDetail} title="Close"
                className="p-1 rounded cursor-pointer border-none bg-transparent">
          <CloseIcon size={14} color="var(--color-text-muted)" />
        </button>
      </div>

      {/* A distroless container has no shell at all, so instead of a bare
          failure this offers the ephemeral-debug-container command that does
          work — the actual answer, ready to paste. */}
      {shellNotice && (
        <div className="mx-4 mt-3 px-4 py-3 rounded-lg flex items-start gap-3 shrink-0"
             style={{
               background: 'color-mix(in srgb, var(--color-warning) 9%, var(--color-surface))',
               border: '1px solid color-mix(in srgb, var(--color-warning) 28%, transparent)',
             }}>
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <span className="text-[11.5px]" style={{ color: 'var(--color-warning)' }}>
              {shellNotice.reason}
            </span>
            <span className="text-[10.5px] text-[var(--color-text-muted)]">
              Attach a debug container with a shell in it instead:
            </span>
            <code className="text-[10.5px] font-mono px-2 py-1.5 rounded overflow-auto"
                  style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-primary)' }}>
              {shellNotice.suggestion}
            </code>
          </div>
          <CopyButtonView text={shellNotice.suggestion} size="xs" />
          <button type="button" onClick={dismissShellNotice}
                  className="p-1 rounded cursor-pointer border-none bg-transparent">
            <CloseIcon size={11} color="var(--color-text-muted)" />
          </button>
        </div>
      )}

      {/* ── Tabs + body ── */}
      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <div className="flex items-center gap-1 px-4 pt-2 shrink-0"
               style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
            {TABS.map(({ id, label, Icon }) => {
              const on = detailTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDetailTab(id)}
                  className="flex items-center gap-1.5 px-3 py-2 text-[11.5px] cursor-pointer border-none bg-transparent transition-colors"
                  style={{
                    color: on ? ACCENT : 'var(--color-text-secondary)',
                    fontWeight: on ? 600 : 400,
                    borderBottom: `2px solid ${on ? ACCENT : 'transparent'}`,
                    marginBottom: -1,
                  }}
                >
                  <Icon size={12} color={on ? ACCENT : 'var(--color-text-muted)'} />
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 min-h-0">
            {detailTab === 'logs' && <LogViewer />}
            {detailTab === 'describe' && (
              <TextPane text={describeText} busy={describeBusy}
                        empty="No describe output — the pod may have been deleted." />
            )}
            {detailTab === 'yaml' && (
              <TextPane text={yamlText} busy={describeBusy}
                        empty="No YAML available." />
            )}
            {detailTab === 'doctor' && <DoctorTab />}
          </div>
        </div>

        <AiAnswerPanel />
      </div>
    </div>
  );
}
