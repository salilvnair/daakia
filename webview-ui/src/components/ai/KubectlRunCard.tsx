/**
 * A kubectl command Daakia AI ran — or would have, had it been allowed to.
 *
 * The command exactly as it ran (context and namespace included, so it can
 * be copied and run by hand), how it went, and its output drawn from what the
 * host returned rather than from the model's retelling. Pods the output names
 * that are being watched link straight to them in dk8s.
 *
 * A proposal — a command that would change the cluster — is shown with Copy
 * and a plain note that it did not run. Nothing here runs it.
 */
import { useState } from 'react';
import { ButtonView, IconButtonView, ChipView } from '@salilvnair/dui';
import { useTabsStore } from '../../store/tabs-store';
import { useK8sStore } from '../../store/k8s-store';
import { copyText } from '../../utils/clipboard';
import { useCopyTick, CopyGlyph } from '../shared/CopyTick';

const ACCENT = 'var(--color-ai-accent, #D97757)';
const MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';

export interface KubectlRunResult {
  kind: 'kubectl';
  command: string;
  why?: string;
  verb: string;
  ok: boolean;
  code: number | null;
  output: string;
  truncated: boolean;
  elapsedMs: number;
  refused?: string;
  proposal?: boolean;
  context: string;
  namespace: string;
  links: { pod: string; context: string; namespace: string }[];
}

export function isKubectlResult(r: unknown): r is KubectlRunResult {
  return !!r && typeof r === 'object' && (r as { kind?: unknown }).kind === 'kubectl';
}

const Svg = ({ children, size = 13 }: { children: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

/** Output taller than this folds, with the rest a click away. */
const FOLD_LINES = 24;

export function KubectlRunCard({ result }: { result: KubectlRunResult }) {
  const { copied, flash } = useCopyTick();
  const [all, setAll] = useState(false);
  const lines = result.output.split('\n');
  const folds = !all && lines.length > FOLD_LINES;
  const shown = folds ? lines.slice(0, FOLD_LINES).join('\n') : result.output;

  const status = result.refused
    ? result.proposal
      ? { label: 'not run · changes the cluster', color: 'var(--color-warning)' }
      : { label: 'refused', color: 'var(--color-error)' }
    : result.ok
      ? { label: `exit ${result.code ?? 0} · ${result.elapsedMs} ms`, color: 'var(--color-success)' }
      : { label: `failed · exit ${result.code ?? '?'}`, color: 'var(--color-error)' };

  const openPod = (pod: string) => {
    /* Back from the pod returns to this conversation. */
    const from = { kind: 'app' as const, tabId: useTabsStore.getState().activeTabId };
    useTabsStore.getState().openDk8sTab();
    useK8sStore.getState().openPodLink({ context: result.context, namespace: result.namespace, pod }, { from });
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{
      border: '1px solid color-mix(in srgb, var(--color-ai-accent, #D97757) 16%, var(--color-surface-border))',
      background: 'color-mix(in srgb, var(--color-ai-accent, #D97757) 2%, var(--color-panel))',
    }}>
      <div className="flex items-start gap-3" style={{
        padding: '10px 14px', borderBottom: '1px solid color-mix(in srgb, var(--color-ai-accent, #D97757) 16%, var(--color-surface-border))',
        background: 'color-mix(in srgb, var(--color-ai-accent, #D97757) 6%, var(--color-panel))',
      }}>
        <span style={{ color: ACCENT, marginTop: 2 }}><Svg><path d="m4 7 5 5-5 5M12 19h8" /></Svg></span>
        <div className="flex-1 min-w-0">
          <div style={{ fontFamily: MONO, fontSize: 12, lineHeight: '18px', color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            <span style={{ color: 'var(--color-text-muted)', userSelect: 'none' }}>$ </span>{result.command}
          </div>
          {result.why && <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--color-text-secondary)' }}>{result.why}</div>}
        </div>
        <ChipView size="xs" label={status.label} color={status.color} />
        <IconButtonView
          size="sm"
          tooltip={copied ? 'Copied' : 'Copy command'}
          aria-label="Copy command"
          active={copied}
          activeColor="var(--color-success)"
          icon={<CopyGlyph copied={copied} size={12} />}
          onClick={async () => { if (await copyText(result.command)) flash(); }}
        />
      </div>

      {result.refused ? (
        <div style={{ padding: '12px 16px', fontSize: 12.5, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
          {result.refused}
        </div>
      ) : (
        <div style={{ padding: '10px 14px 12px' }}>
          <pre className="m-0" style={{
            fontFamily: MONO, fontSize: 11.5, lineHeight: '18px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
            color: result.ok ? 'var(--color-text-primary)' : 'var(--color-error)',
            background: 'var(--dai-well, color-mix(in srgb, black 22%, var(--color-panel)))',
            borderRadius: 9, padding: '8px 12px', maxHeight: all ? 'none' : 480, overflow: 'auto',
          }}>
            {shown || '(no output)'}
          </pre>
          {(folds || all || result.truncated) && (
            <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
              {lines.length > FOLD_LINES && (
                <ButtonView variant="ghost" size="xs" onClick={() => setAll(a => !a)}>
                  {all ? 'Show less' : `Show all ${lines.length.toLocaleString()} lines`}
                </ButtonView>
              )}
              {result.truncated && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Output cut at 60,000 characters — run it yourself for the rest.</span>}
            </div>
          )}
        </div>
      )}

      {result.links.length > 0 && (
        <div className="flex items-center flex-wrap" style={{ gap: 6, padding: '8px 14px 10px', borderTop: '1px solid var(--color-surface-border)' }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginRight: 2 }}>Open in dk8s</span>
          {result.links.map(l => (
            <ButtonView key={l.pod} variant="ghost" size="xs" rounded accentColor={ACCENT}
                        iconLeft={<Svg size={11}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14 21 3" /></Svg>}
                        onClick={() => openPod(l.pod)} title={`${l.context} / ${l.namespace} / ${l.pod}`}>
              {l.pod}
            </ButtonView>
          ))}
        </div>
      )}
    </div>
  );
}
