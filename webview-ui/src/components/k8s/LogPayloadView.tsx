/**
 * A payload drawn where it was logged.
 *
 * The row above stays the sentence somebody wrote; this is the machine half of
 * the line, folded to a chip until it is asked for — the same bargain a stack
 * trace already makes. Tree, Pretty and Raw are per line: the tab's setting
 * says how they open, and this overrides it for the one in front of you,
 * because the reason to switch is always a particular line.
 */
import { useMemo, useState } from 'react';
import { JsonTreeViewer } from '../shared/display/JsonTreeViewer';
import { CopyIcon, CheckIcon } from '../../icons';
import { copyText } from '../../utils/clipboard';
import { prettyXml, maskSecrets, type LogPayload } from './log-payload';
import { ACCENT } from './tone';

type Mode = 'tree' | 'pretty' | 'raw';

export function LogPayloadView({ payload, mode, depth, hideSecrets }: {
  payload: LogPayload;
  /** How the tab says payloads open. */
  mode: Mode;
  maxInitialDepth?: number;
  depth: number;
  hideSecrets: boolean;
}) {
  /* `undefined` means "whatever the tab says", so changing the tab's setting
     still moves a line the reader never touched. */
  const [ownMode, setOwnMode] = useState<Mode | undefined>();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const shown = ownMode ?? mode;

  const value = useMemo(
    () => (hideSecrets && !revealed ? maskSecrets(payload.value) : payload.value),
    [payload.value, hideSecrets, revealed],
  );
  const masking = hideSecrets && !revealed && payload.value !== undefined
    && JSON.stringify(maskSecrets(payload.value)) !== JSON.stringify(payload.value);

  const copy = async () => {
    // The line as the pod wrote it, masked or not: Copy is for taking away.
    if (await copyText(payload.source)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  };

  return (
    <div
      className="my-1 ml-[92px] rounded-md overflow-hidden"
      style={{
        border: '1px solid var(--color-surface-border)',
        borderLeft: `2px solid ${ACCENT}`,
        background: 'var(--color-elevated, var(--color-panel))',
      }}
    >
      <div className="flex items-center gap-1 px-2 py-1"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <span className="text-[10px] uppercase tracking-wide"
              style={{ color: ACCENT }}>{payload.shape}</span>
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          {payload.summary}
        </span>
        <span className="flex-1" />

        {masking && (
          <button type="button" onClick={() => setRevealed(true)}
                  title="Show the values hidden on secret-looking keys"
                  className="h-[20px] px-1.5 rounded cursor-pointer border-none text-[10px]"
                  style={{
                    background: 'color-mix(in srgb, var(--color-warning) 16%, transparent)',
                    color: 'var(--color-warning)',
                  }}>
            Show hidden
          </button>
        )}

        <div className="flex gap-px p-px rounded" style={{ background: 'var(--color-panel)' }}>
          {(['tree', 'pretty', 'raw'] as Mode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setOwnMode(m)}
              title={m === 'raw' ? 'The line exactly as the pod wrote it' : `Draw it as ${m}`}
              className="h-[19px] px-1.5 rounded cursor-pointer border-none text-[10px]"
              style={shown === m
                ? { background: ACCENT, color: 'var(--color-on-accent, #10262b)' }
                : { background: 'transparent', color: 'var(--color-text-muted)' }}
            >
              {m}
            </button>
          ))}
        </div>

        <button type="button" onClick={copy}
                title={copied ? 'Copied' : 'Copy the payload'}
                aria-label="Copy the payload"
                className="h-[20px] w-[22px] flex items-center justify-center rounded cursor-pointer border-none bg-transparent"
                style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
          {copied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
        </button>
      </div>

      <div className="px-2.5 py-1.5 overflow-x-auto">
        <Body payload={payload} mode={shown} value={value} depth={depth} />
      </div>
    </div>
  );
}

function Body({ payload, mode, value, depth }: {
  payload: LogPayload; mode: Mode; value: unknown; depth: number;
}) {
  if (mode === 'raw') {
    return (
      <pre className="text-[11px] font-mono whitespace-pre-wrap break-all m-0"
           style={{ color: 'var(--color-text-secondary)' }}>{payload.source}</pre>
    );
  }

  if (payload.shape === 'json' || payload.shape === 'kv') {
    if (mode === 'tree') {
      return <JsonTreeViewer data={value} maxInitialDepth={depth} />;
    }
    return (
      <pre className="text-[11px] font-mono whitespace-pre m-0"
           style={{ color: 'var(--color-text-primary)' }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  // XML, in both remaining modes: there is no tree of it that is not a parse,
  // and a fragment off a pod is exactly what a parser refuses.
  return (
    <pre className="text-[11px] font-mono whitespace-pre m-0"
         style={{ color: 'var(--color-text-primary)' }}>
      {prettyXml(payload.source).join('\n')}
    </pre>
  );
}
