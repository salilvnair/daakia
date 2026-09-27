/**
 * A payload drawn where it was logged.
 *
 * The row above stays the sentence somebody wrote; this is the machine half of
 * the line, folded to a chip until it is asked for — the same bargain a stack
 * trace already makes. Two switches, two jobs: the one in the Logs toolbar is
 * every payload in the log (and the default next time); this one is the line
 * in front of you. Changing the toolbar's resets every line to it, so a line
 * switched earlier never quietly ignores the choice made for all of them.
 *
 * JSON, key=value and YAML are drawn by the response viewer's tree; XML by its
 * own tree, which falls back to indented text for a fragment that does not
 * close — every character the pod wrote either way.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconButtonView, SegmentedControlView } from '@salilvnair/dui';
import { JsonTreeViewer } from '../shared/display/JsonTreeViewer';
import { ExpandAllIcon, CollapseAllIcon, ExternalLinkIcon, ChevronRightIcon } from '../../icons';
import { copyText } from '../../utils/clipboard';
import { prettyXml, maskSecrets, parseXmlTree, type LogPayload, type XmlNode } from './log-payload';
import { useTabsStore } from '../../store/tabs-store';
import { ACCENT } from './tone';
import { useCopyTick, CopyGlyph } from '../shared/CopyTick';

type Mode = 'tree' | 'pretty' | 'raw';

/** Deep enough to open anything a log line carries. */
const ALL_LEVELS = 64;

export function LogPayloadView({ payload, mode, depth, hideSecrets, keepRaw = true, title, indent = 92 }: {
  payload: LogPayload;
  /** How the tab says payloads open. */
  mode: Mode;
  depth: number;
  hideSecrets: boolean;
  /** Raw stays one click away. Off, the switch offers Tree and Pretty only. */
  keepRaw?: boolean;
  /** What the tab is called if it is opened in one: the pod, the logger, the time. */
  title?: string;
  /** How far in the box sits: under the message on a log row, flush on its own page. */
  indent?: number;
}) {
  /* `undefined` means "whatever the tab says", so changing the tab's switch
     still moves a line the reader never touched. */
  const [ownMode, setOwnMode] = useState<Mode | undefined>();
  /* The toolbar's switch moved: this line follows it again, whatever it was set to. */
  const lastMode = useRef(mode);
  useEffect(() => {
    if (lastMode.current === mode) return;
    lastMode.current = mode;
    setOwnMode(undefined);
  }, [mode]);
  const [revealed, setRevealed] = useState(false);
  const { copied, flash } = useCopyTick();
  /* Expand all remounts the tree at every level; pressing it again goes back to the tab's depth. */
  const [expandAll, setExpandAll] = useState(false);
  const shown = ownMode ?? (mode === 'raw' && !keepRaw ? 'tree' : mode);
  const openTo = expandAll ? ALL_LEVELS : depth;

  const value = useMemo(
    () => (hideSecrets && !revealed ? maskSecrets(payload.value) : payload.value),
    [payload.value, hideSecrets, revealed],
  );
  const masking = hideSecrets && !revealed && payload.value !== undefined
    && JSON.stringify(maskSecrets(payload.value)) !== JSON.stringify(payload.value);

  const copy = async () => {
    // The line as the pod wrote it, masked or not: Copy is for taking away.
    if (await copyText(payload.source)) {
      flash();
    }
  };

  const modes: { value: Mode; label: string }[] = [
    { value: 'tree', label: 'Tree' },
    { value: 'pretty', label: 'Pretty' },
    ...(keepRaw ? [{ value: 'raw' as Mode, label: 'Raw' }] : []),
  ];

  return (
    <div
      className="my-1 rounded-md overflow-hidden"
      style={{
        marginLeft: indent,
        border: '1px solid var(--color-surface-border)',
        borderLeft: `2px solid ${ACCENT}`,
        background: 'var(--color-elevated, var(--color-panel))',
      }}
    >
      <div className="flex items-center gap-1.5 px-2 py-1"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <span className="text-[10px] uppercase tracking-wide" style={{ color: ACCENT }}>{payload.shape}</span>
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{payload.summary}</span>
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

        {/* The ±20 / ±100 / ±500 switch's props, so the two read as one control. */}
        <SegmentedControlView
          size="xs"
          variant="rounded"
          density="compact"
          accentColor={ACCENT}
          value={shown}
          onChange={v => setOwnMode(v as Mode)}
          options={modes}
        />

        <IconButtonView
          size="md"
          tooltip={expandAll ? 'Back to the depth set in Settings' : 'Expand all'}
          aria-label={expandAll ? 'Collapse to the usual depth' : 'Expand all'}
          disabled={shown !== 'tree'}
          icon={expandAll ? <CollapseAllIcon size={13} /> : <ExpandAllIcon size={13} />}
          onClick={() => setExpandAll(e => !e)}
        />
        <IconButtonView
          size="md"
          tooltip="Open in a tab"
          aria-label="Open in a tab"
          icon={<ExternalLinkIcon size={13} />}
          onClick={() => useTabsStore.getState().openDk8sPayloadTab({ payload, title: title ?? `${payload.shape.toUpperCase()} · ${payload.summary}` })}
        />
        <IconButtonView
          size="md"
          tooltip={copied ? 'Copied' : 'Copy the payload, as the pod wrote it'}
          aria-label="Copy the payload"
          active={copied}
          activeColor="var(--color-success)"
          icon={<CopyGlyph copied={copied} size={13} />}
          onClick={copy}
        />
      </div>

      <div className="px-2.5 py-1.5 overflow-x-auto">
        <PayloadBody key={`${shown}:${openTo}`} payload={payload} mode={shown} value={value} depth={openTo} />
      </div>
    </div>
  );
}

/** The payload in one of the three modes — shared by the row and the tab it opens in. */
export function PayloadBody({ payload, mode, value, depth }: {
  payload: LogPayload; mode: Mode; value: unknown; depth: number;
}) {
  if (mode === 'raw') {
    return (
      <pre className="text-[11px] font-mono whitespace-pre-wrap break-all m-0"
           style={{ color: 'var(--color-text-secondary)' }}>{payload.source}</pre>
    );
  }

  if (payload.shape !== 'xml') {
    if (mode === 'tree') return <JsonTreeViewer data={value} maxInitialDepth={depth} />;
    return (
      <pre className="text-[11px] font-mono whitespace-pre m-0" style={{ color: 'var(--color-text-primary)' }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  const tree = mode === 'tree' ? parseXmlTree(payload.source) : undefined;
  if (tree) {
    return (
      <div className="text-[11px] font-mono leading-[18px] select-text">
        <XmlTreeNode node={tree} depth={0} openTo={depth} />
      </div>
    );
  }
  // Pretty, or a fragment no tree can be built from: indented text.
  return (
    <pre className="text-[11px] font-mono whitespace-pre m-0" style={{ color: 'var(--color-text-primary)' }}>
      {prettyXml(payload.source).join('\n')}
    </pre>
  );
}

/* The JSON tree's colours, so the two trees read as one family. */
const TAG = 'var(--color-info, #569cd6)';
const TEXT = 'var(--color-success, #4ade80)';
const ATTR = 'var(--color-text-secondary)';

function Attrs({ attrs }: { attrs: [string, string][] }) {
  return (
    <>
      {attrs.map(([k, v]) => (
        <span key={k}> <span style={{ color: ATTR }}>{k}</span>=<span style={{ color: TEXT }}>"{v}"</span></span>
      ))}
    </>
  );
}

/**
 * One element: a leaf on one line (`<faultcode>soap:Server</faultcode>`), a
 * container as `▾ <soap:Fault>` over its children and its closing tag.
 * Attributes fold with their element; namespaces are kept as written.
 */
function XmlTreeNode({ node, depth, openTo }: { node: XmlNode; depth: number; openTo: number }) {
  const [open, setOpen] = useState(depth < openTo);
  const pad = { paddingLeft: depth * 14 };

  if (!node.children.length) {
    return (
      <div className="flex items-start gap-1" style={pad}>
        <span className="w-3 flex-shrink-0" />
        <span>
          <span style={{ color: TAG }}>&lt;{node.name}</span><Attrs attrs={node.attrs} />
          {node.text !== undefined
            ? <><span style={{ color: TAG }}>&gt;</span><span style={{ color: TEXT }}>{node.text}</span><span style={{ color: TAG }}>&lt;/{node.name}&gt;</span></>
            : <span style={{ color: TAG }}> /&gt;</span>}
        </span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start gap-1 cursor-pointer rounded hover:bg-[color-mix(in_srgb,var(--color-text-primary)_3%,transparent)]"
           style={pad} onClick={() => setOpen(o => !o)}>
        <span className={`w-3 h-3 flex items-center justify-center flex-shrink-0 mt-[1px] transition-transform ${open ? 'rotate-90' : ''}`}>
          <ChevronRightIcon size={10} />
        </span>
        <span>
          <span style={{ color: TAG }}>&lt;{node.name}</span><Attrs attrs={node.attrs} /><span style={{ color: TAG }}>&gt;</span>
          {!open && <span style={{ color: 'var(--color-text-muted)' }}> … {node.children.length} element{node.children.length === 1 ? '' : 's'} &lt;/{node.name}&gt;</span>}
        </span>
      </div>
      {open && (
        <>
          {node.text && <div style={{ paddingLeft: (depth + 1) * 14 + 16, color: TEXT }}>{node.text}</div>}
          {node.children.map((c, i) => <XmlTreeNode key={`${c.name}-${i}`} node={c} depth={depth + 1} openTo={openTo} />)}
          <div style={{ paddingLeft: depth * 14 + 16, color: TAG }}>&lt;/{node.name}&gt;</div>
        </>
      )}
    </div>
  );
}
