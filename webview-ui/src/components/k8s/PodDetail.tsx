/**
 * Everything one pod can tell you.
 *
 * A full-bleed overlay rather than a side drawer: reading logs is the main
 * activity here, not a peek, and a 380px drawer turns every stack trace into a
 * horizontal scroll. Escape and the back arrow return to the grid.
 */
import { useCallback, useEffect } from 'react';
import {
  CloseIcon, TerminalIcon, FileTextIcon, CodeIcon, StethoscopeIcon,
  SparkleIcon, ChevronLeftIcon, LayersIcon, LockIcon, FolderOpenIcon,
} from '../../icons';
import { CopyButtonView, IconSize } from '@salilvnair/dui';
import { useK8sStore, type DetailTab } from '../../store/k8s-store';
import { useDk8sAiStore } from '../../store/dk8s-ai-store';
import { useDk8sSearchStore } from '../../store/dk8s-search-store';
import { severityOf, severityColor, shortAge, restartLabel } from './pod-view';
import { LogViewer } from './LogViewer';
import { AiSplit } from './AiAnswerPanel';
import { DoctorTab } from './DoctorTab';
import { ExplorerTab } from './ExplorerTab';
import { tokenizeDescribeLine, tokenColor, tokenWeight } from './describe-highlight';
import { CodeEditor } from '../shared/editors/CodeEditor';
import { OverviewTab } from './OverviewTab';

import { ACCENT } from './tone';
import { AI as AI_ACCENT } from './tone';

// Order from the mock: Overview, Logs, Terminal, Doctor, YAML — with Describe
// alongside YAML, since they answer the same kind of question.
type AccessKey = 'logs' | 'exec' | 'get' | 'events' | 'portForward' | 'delete' | 'patch';

/** What to ask an administrator for, in the words an RBAC rule uses. */
const ACCESS_RULE: Record<AccessKey, string> = {
  logs: 'get on pods/log',
  exec: 'create on pods/exec',
  get: 'get on pods',
  events: 'list on events',
  portForward: 'create on pods/portforward',
  delete: 'delete on pods',
  patch: 'patch on pods',
};

/**
 * `needs` is the permission the tab cannot work without.
 *
 * Overview needs nothing: it renders what the pod list already told us, which
 * you must have been able to read to get here at all.
 */
const TABS: {
  id: DetailTab; label: string; Icon: typeof FileTextIcon; needs?: AccessKey;
}[] = [
  { id: 'overview', label: 'Overview', Icon: LayersIcon },
  { id: 'logs', label: 'Logs', Icon: FileTextIcon, needs: 'logs' },
  { id: 'terminal', label: 'Terminal', Icon: TerminalIcon, needs: 'exec' },
  { id: 'doctor', label: 'Doctor', Icon: StethoscopeIcon, needs: 'exec' },
  // Everything the explorer does is one exec, so it gates on exactly the same
  // access the terminal does.
  { id: 'explorer', label: 'Explorer', Icon: FolderOpenIcon, needs: 'exec' },
  { id: 'describe', label: 'Describe', Icon: CodeIcon, needs: 'get' },
  { id: 'yaml', label: 'YAML', Icon: CodeIcon, needs: 'get' },
];

/**
 * Shown in place of a tab this account cannot use.
 *
 * The rule is spelled out because the useful next step is asking someone for
 * it, and "you do not have access" does not tell you what to ask for.
 */
function NoAccess({ what, needs }: { what: string; needs: AccessKey }) {
  const rule = ACCESS_RULE[needs];
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2.5 px-8 text-center">
      <LockIcon size={IconSize.medallion} color="var(--color-text-muted)" />
      <span className="text-[12.5px]" style={{ color: 'var(--color-text-primary)' }}>
        {what} needs access this account does not have
      </span>
      <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)', maxWidth: 440 }}>
        The cluster says you cannot <code>{rule}</code> in this namespace. Nothing is broken and
        nothing was tried &mdash; dk8s asked first. Every other tab you can use still works.
      </span>
      <span className="text-[10.5px] mt-1" style={{ color: 'var(--color-text-muted)', opacity: 0.85 }}>
        Ask whoever manages the cluster for <code>{rule}</code>.
      </span>
    </div>
  );
}

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

function PaneShell({ text, busy, empty, children }: {
  text?: string; busy: boolean; empty: string; children: React.ReactNode;
}) {
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
      <div className="absolute top-2 right-5 z-10">
        <CopyButtonView text={text} size="xs" />
      </div>
      {children}
    </div>
  );
}

/**
 * describe output, coloured.
 *
 * Not run through the YAML lexer, though it looks like YAML from a distance:
 * the Events table is columnar, `<none>` is a value rather than a tag, and the
 * status words are what your eye should land on first. A YAML highlighter
 * colours none of that usefully.
 */
function DescribePane({ text, busy }: { text?: string; busy: boolean }) {
  return (
    <PaneShell text={text} busy={busy}
               empty="No describe output — the pod may have been deleted.">
      <div className="h-full overflow-auto px-4 py-3 font-mono"
           style={{ fontSize: 11.5, lineHeight: '18px' }}>
        {(text ?? '').split('\n').map((line, i) => (
          <div key={i} style={{ whiteSpace: 'pre-wrap' }}>
            {tokenizeDescribeLine(line).map((t, j) => (
              <span key={j} style={{ color: tokenColor(t.kind), fontWeight: tokenWeight(t.kind) }}>
                {t.text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </PaneShell>
  );
}

/** YAML gets the real editor, since Monaco already knows the grammar. */
function YamlPane({ text, busy }: { text?: string; busy: boolean }) {
  return (
    <PaneShell text={text} busy={busy} empty="No YAML available.">
      <CodeEditor
        value={text ?? ''}
        language="yaml"
        readOnly
        height="100%"
        wordWrap
        fontSize={11.5}
      />
    </PaneShell>
  );
}

/**
 * The terminal tab.
 *
 * It does not embed a terminal — it opens the one VS Code already has. A webview
 * xterm needs a native PTY to be useful, and without one bash prints no prompt,
 * Ctrl-C does nothing and vim hangs. Handing the user their own terminal, with
 * their font and their scrollback, is both simpler and strictly more capable.
 */
function TerminalTab() {
  const { detail, capabilities, openShell } = useK8sStore();
  if (!detail) return null;

  const distroless = capabilities && !capabilities.shell && !capabilities.unreachable;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
      <TerminalIcon size={IconSize.medallion} color={ACCENT} />
      <span className="text-[13px]" style={{ color: 'var(--color-text-primary)' }}>
        Open a shell in this pod
      </span>
      <span className="text-[11.5px] max-w-[440px] leading-relaxed"
            style={{ color: 'var(--color-text-muted)' }}>
        {distroless
          ? 'This container looks distroless — there is no shell in it to exec. dk8s will '
            + 'offer the debug-container command instead.'
          : 'This opens a VS Code terminal running kubectl exec against '
            + detail.name + '. Your own terminal, with your font, scrollback and copy-paste.'}
      </span>
      <button
        type="button"
        onClick={openShell}
        className="flex items-center gap-2 px-4 py-2 rounded-md text-[12px] cursor-pointer"
        style={{
          background: 'color-mix(in srgb, var(--color-dk8s) 18%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-dk8s) 45%, transparent)',
          color: '#fff', fontWeight: 600,
        }}
      >
        <TerminalIcon size={IconSize.item} color={ACCENT} />
        Open terminal
      </button>
      {capabilities?.shell && (
        <span className="text-[10.5px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
          shell: {capabilities.shell}
        </span>
      )}
    </div>
  );
}

export function PodDetail() {
  const {
    detail, detailTab, setDetailTab, closeDetail, explorerPath, explorerHighlight,
    describeText, yamlText, describeBusy, runtime,
    openShell, shellNotice, dismissShellNotice,
  } = useK8sStore();

  /**
   * Back goes where you came from.
   *
   * Opening a pod from a search hit and then landing on the pod grid loses the
   * results — you have to search again and find your place in the list by
   * hand. When the search sent you here, Back returns to it, scrolled to where
   * you left off; otherwise it does what it always did.
   */
  const access = useK8sStore(s => s.access);
  const cameFromSearch = useDk8sSearchStore(s => s.cameFromSearch);
  const returnToSearch = useDk8sSearchStore(s => s.returnToSearch);
  const goBack = useCallback(() => {
    closeDetail();
    if (cameFromSearch) returnToSearch();
  }, [closeDetail, cameFromSearch, returnToSearch]);

  const aiOpen = useDk8sAiStore(s => s.open);
  const openAi = useDk8sAiStore(s => s.openPanel);
  const closeAi = useDk8sAiStore(s => s.closePanel);
  const answers = useDk8sAiStore(s => s.answers);

  // Escape closes — but only when nothing is selected, so the first Escape
  // after highlighting a stack trace does not throw away the panel too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      goBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goBack]);

  if (!detail) return null;

  // The open tab, when this account cannot use it. Overview has no `needs`,
  // so there is always somewhere to land.
  const current = TABS.find(t => t.id === detailTab);
  const denied = current?.needs && !access[current.needs]
    ? { label: current.label, needs: current.needs }
    : undefined;

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
        <button type="button" onClick={goBack}
                title={cameFromSearch ? 'Back to search results' : 'Back to pods'}
                className="p-1 rounded cursor-pointer border-none bg-transparent">
          <ChevronLeftIcon size={IconSize.nav} color="var(--color-text-secondary)" />
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
          <TerminalIcon size={IconSize.action} />
          Shell
        </button>

        {/* A fixed toggle, the way VS Code toggles a side panel: always in the
            same place, lit when the panel is open. It used to vanish once the
            panel appeared, which left the panel's own X as the only way back
            and meant the button moved around under the cursor. */}
        <button
          type="button"
          onClick={() => (aiOpen ? closeAi() : openAi())}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] cursor-pointer"
          style={{
            background: aiOpen
              ? `color-mix(in srgb, ${AI_ACCENT} 22%, transparent)`
              : 'transparent',
            border: `1px solid ${aiOpen
              ? `color-mix(in srgb, ${AI_ACCENT} 55%, transparent)`
              : 'var(--color-surface-border)'}`,
            color: aiOpen ? '#fff' : 'var(--color-text-secondary)',
            fontWeight: aiOpen ? 600 : 400,
          }}
          title={aiOpen ? 'Hide AI analysis' : 'Show AI analysis'}
        >
          <SparkleIcon size={IconSize.action} color={AI_ACCENT} />
          AI{answers.length > 0 && ` · ${answers.length}`}
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
              {shellNotice.suggestionLabel ?? 'Attach a debug container with a shell in it instead:'}
            </span>
            <code className="text-[10.5px] font-mono px-2 py-1.5 rounded overflow-auto"
                  style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-primary)' }}>
              {shellNotice.suggestion}
            </code>
          </div>
          <CopyButtonView text={shellNotice.suggestion} size="xs" />
          <button type="button" onClick={dismissShellNotice}
                  className="p-1 rounded cursor-pointer border-none bg-transparent">
            <CloseIcon size={IconSize.inline} color="var(--color-text-muted)" />
          </button>
        </div>
      )}

      {/* ── Tabs + body ──
          AiSplit is the row: it renders the children alone while the AI panel
          is closed and a draggable split when it is open. */}
      <AiSplit>
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <div className="flex items-center gap-1 px-4 pt-2 shrink-0"
               style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
            {TABS.map(({ id, label, Icon, needs }) => {
              const on = detailTab === id;
              // Dimmed and padlocked rather than hidden. A tab that vanishes
              // reads as a missing feature; one that is visibly locked reads
              // as a permission, which is the true and actionable thing.
              const locked = !!needs && !access[needs];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDetailTab(id)}
                  title={locked ? `${label} needs ${ACCESS_RULE[needs!]}` : undefined}
                  className="flex items-center gap-1.5 px-3 py-2 text-[11.5px] cursor-pointer border-none bg-transparent transition-colors"
                  style={{
                    color: on ? ACCENT : 'var(--color-text-secondary)',
                    fontWeight: on ? 600 : 400,
                    borderBottom: `2px solid ${on ? ACCENT : 'transparent'}`,
                    marginBottom: -1,
                    opacity: locked ? 0.45 : 1,
                  }}
                >
                  {/* One slot, one size. The lock was 11 and the tab's own
                      icon 12, so the strip changed height as permissions
                      resolved — the row twitching is what gives it away. */}
                  {locked
                    ? <LockIcon size={IconSize.action} color="var(--color-text-muted)" />
                    : <Icon size={IconSize.action} color={on ? ACCENT : 'var(--color-text-muted)'} />}
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 min-h-0">
            {detailTab === 'overview' && <OverviewTab />}
            {denied ? (
              <NoAccess what={denied.label} needs={denied.needs} />
            ) : (
              <>
                {detailTab === 'logs' && <LogViewer />}
                {detailTab === 'terminal' && <TerminalTab />}
                {detailTab === 'describe' && <DescribePane text={describeText} busy={describeBusy} />}
                {detailTab === 'yaml' && <YamlPane text={yamlText} busy={describeBusy} />}
                {detailTab === 'doctor' && <DoctorTab />}
                {detailTab === 'explorer' && detail?.context && (
                  <ExplorerTab
                    context={detail.context}
                    namespace={detail.namespace}
                    pod={detail.name}
                    initialPath={explorerPath}
                    highlight={explorerHighlight}
                    /*
                      The same way back the log hits already use. `jumpedToPod`
                      recorded the scroll on the way out, so this lands on the
                      row you left rather than the top of a list you had
                      already scrolled through.
                    */
                    onBackToSearch={cameFromSearch ? goBack : undefined}
                  />
                )}
              </>
            )}
          </div>
        </div>

      </AiSplit>

    </div>
  );
}
