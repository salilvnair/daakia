/**
 * Scan code for requests.
 *
 * Three screens behind one modal: which folder, what it is doing, and what it
 * found. The third is the one the feature lives or dies on — everything it
 * shows carries a marker saying how it came to be known, because a generator
 * you cannot audit is one you stop trusting the first time it is wrong.
 *
 * Nothing is written until the button on the review screen is pressed.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ModalView, ButtonView, TextInputView, CopyButtonView } from '@salilvnair/dui';
import hljs from 'highlight.js';
import {
  useScanStore, byFolder, isInternal, type ScannedRequest, type Provenance, type ProvenanceKind,
} from '../../../store/scan-store';
import { useWorkspaceStore } from '../../../store/workspace-store';
import { importRequestsAsCollection } from '../../../services/collections/import-to-collection';
import { useToastStore } from '../../../store/toast-store';
import { SearchIcon, FolderOpenIcon, RefreshIcon } from '../../../icons';
import { ScanDestination, type Destination } from './ScanDestination';
import { useEnvStore } from '../../../store/env-store';

/** Collections is purple everywhere else in daakia; this lives under it. */
const ACCENT = 'var(--color-sidebar-collections)';

const METHOD_COLOR: Record<string, string> = {
  GET: 'var(--color-method-get)',
  POST: 'var(--color-method-post)',
  PUT: 'var(--color-method-put)',
  PATCH: 'var(--color-method-patch)',
  DELETE: 'var(--color-method-delete)',
  HEAD: 'var(--color-method-head)',
  OPTIONS: 'var(--color-method-options)',
};

const PROV_COLOR: Record<ProvenanceKind, string> = {
  read: 'var(--color-success)',
  resolved: 'var(--color-info)',
  example: 'var(--color-method-patch)',
  generated: 'var(--color-warning)',
  unknown: 'var(--color-text-muted)',
};

/** What each marker means, said once at the top rather than in a tooltip. */
const PROV_MEANS: Record<ProvenanceKind, string> = {
  read: 'written in the source',
  resolved: 'followed through a constant or an annotation',
  example: 'lifted from a test or a spec',
  generated: 'made to satisfy a stated constraint',
  unknown: 'not known, and saying so',
};

function Method({ m }: { m: string }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono, monospace)', fontSize: 10, fontWeight: 700,
      color: METHOD_COLOR[m] ?? 'var(--color-text-muted)', minWidth: 42,
    }}>{m}</span>
  );
}

function Mark({ p, label }: { p: Provenance; label?: string }) {
  const color = PROV_COLOR[p.kind];
  return (
    <span
      title={describe(p)}
      style={{
        fontFamily: 'var(--font-mono, monospace)', fontSize: 9.5, letterSpacing: '.03em',
        padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap',
        color, background: `color-mix(in srgb, ${color} 13%, transparent)`,
      }}
    >{label ?? p.kind}</span>
  );
}

/** The sentence behind a marker — where it was read, or which rule made it. */
export function describe(p: Provenance): string {
  switch (p.kind) {
    case 'read': return p.at ? `Read from ${p.at.file}:${p.at.line}` : 'Written in the source';
    case 'resolved': return `Resolved through ${p.from ?? 'the source'}`;
    case 'example': return p.at ? `From ${p.at.file}:${p.at.line}` : 'From a test or a spec';
    case 'generated': return `Generated to satisfy ${p.rule ?? 'a stated constraint'}`;
    default: return p.why ?? 'Not established';
  }
}

function Row({ r, chosen, focused, onToggle, onFocus }: {
  r: ScannedRequest; chosen: boolean; focused: boolean;
  onToggle: () => void; onFocus: () => void;
}) {
  /* The most uncertain thing about a request is what the row should say — a
     path that was resolved matters more than a body that was read. */
  const worst = worstProvenance(r);
  return (
    <div
      onClick={onFocus}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '6px 12px',
        cursor: 'pointer',
        borderBottom: '1px solid color-mix(in srgb, var(--color-surface-border) 55%, transparent)',
        background: focused ? `color-mix(in srgb, ${ACCENT} 9%, transparent)` : undefined,
      }}
    >
      <span
        onClick={e => { e.stopPropagation(); onToggle(); }}
        style={{
          width: 13, height: 13, borderRadius: 3, flexShrink: 0,
          border: `1.5px solid ${chosen ? ACCENT : 'var(--color-surface-border)'}`,
          background: chosen ? ACCENT : 'transparent',
          display: 'grid', placeItems: 'center',
        }}
      >
        {chosen && (
          <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="var(--color-panel)"
               strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.5L4.8 8.8L9.5 3.5" />
          </svg>
        )}
      </span>
      <Method m={r.method} />
      <span style={{
        fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5,
        color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap', minWidth: 0,
      }}>{r.url.replace('{{baseUrl}}', '')}</span>
      <span style={{ flex: 1, minWidth: 8 }} />
      {isInternal(r) && <Mark p={{ kind: 'unknown' }} label="internal" />}
      {worst && <Mark p={worst[1]} label={worst[0] === 'path' ? worst[1].kind : `${worst[0]} ${worst[1].kind}`} />}
    </div>
  );
}

/** The field whose provenance is least certain — that is what a row should admit to. */
export function worstProvenance(r: ScannedRequest): [string, Provenance] | undefined {
  const rank: Record<ProvenanceKind, number> = {
    read: 0, example: 1, resolved: 2, generated: 3, unknown: 4,
  };
  let worst: [string, Provenance] | undefined;
  for (const [field, p] of Object.entries(r.scan.provenance)) {
    if (!p) continue;
    if (!worst || rank[p.kind] > rank[worst[1].kind]) worst = [field, p];
  }
  /* Everything read is not worth a marker on every row — it is the default. */
  return worst && worst[1].kind === 'read' ? undefined : worst;
}

export function ScanModal() {
  const s = useScanStore();
  const activeWorkspace = useWorkspaceStore(w => w.activeId);
  const addToast = useToastStore(t => t.addToast);
  const [writing, setWriting] = useState(false);
  /*
    Where it goes, decided before it is written and not in a footer field.

    A new collection named after the repository is the usual answer, so it is
    the default — but a scan of a service you already have a collection for
    should go into that collection, and that was not expressible at all.
  */
  const [destination, setDestination] = useState<Destination>({ kind: 'new', name: '' });
  const [createEnv, setCreateEnv] = useState(true);
  const [step, setStep] = useState<'review' | 'destination'>('review');

  /* The host's replies all land here. */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const t = e.data?.type;
      if (typeof t === 'string' && t.startsWith('scan:')) s.apply(e.data);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (s.collectionName && destination.kind === 'new' && !destination.name) {
      setDestination({ kind: 'new', name: s.collectionName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.collectionName]);

  const groups = useMemo(() => byFolder(s.requests), [s.requests]);
  const focused = s.requests.find(r => r.scan.identity === s.focused);

  if (!s.open) return null;

  const write = async () => {
    const picked = s.requests.filter(r => s.chosen.has(r.scan.identity));
    if (!picked.length) return;
    setWriting(true);
    try {
      const name = destination.kind === 'new'
        ? (destination.name.trim() || 'Scanned API')
        : destination.name;

      /*
        The environment first, and made active.

        Every request is written against {{baseUrl}}, so a collection that
        arrives before the variable that resolves it is a collection that
        cannot be run — which is the state the first version shipped in.
      */
      if (createEnv && s.baseUrl?.url) {
        const env = useEnvStore.getState();
        const id = env.addEnvironment(name);
        env.updateVariables(id, [{
          id: crypto.randomUUID(),
          key: 'baseUrl',
          initialValue: s.baseUrl.url,
          currentValue: s.baseUrl.url,
          isSecret: false,
        }]);
        env.setActiveEnvironment(id);
      }

      const saved = await importRequestsAsCollection({
        name,
        protocol: 'rest',
        /* Into the collection that was chosen, when one was. */
        ...(destination.kind === 'existing' ? { collectionId: destination.id } : {}),
        requests: picked.map(r => ({
          name: r.name,
          method: r.method,
          url: r.url,
          headers: r.headers,
          params: r.params,
          bodyMode: r.bodyMode,
          bodyRaw: r.bodyRaw,
          authType: r.authType,
          /* Kept on the request so a later scan can tell an edit from a change. */
          scan: r.scan,
        })),
      });
      addToast({
        type: 'success',
        message: `${saved} request${saved === 1 ? '' : 's'} in ${name}`
          + (createEnv && s.baseUrl?.url ? ` · environment ${name} is active` : ''),
      });
      s.close();
    } finally {
      setWriting(false);
    }
  };

  return (
    <ModalView open onClose={s.close} title="Scan code for requests" size="xxl">
      <div style={{ position: 'relative' }}>
      {s.stage === 'source' && <SourceStep />}
      {s.stage === 'scanning' && <ScanningStep />}
      {s.stage === 'error' && (
        <div style={{ padding: 28, textAlign: 'center' }}>
          <p style={{ color: 'var(--color-warning)', fontSize: 13, margin: '0 0 6px' }}>
            The scan could not be completed
          </p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 12, margin: '0 0 18px' }}>{s.error}</p>
          <ButtonView label="Back" size="sm" variant="secondary"
                      onClick={() => useScanStore.setState({ stage: 'source' })} />
        </div>
      )}

      {s.stage === 'review' && (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Summary />

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 400px', minHeight: 380, maxHeight: '56vh' }}>
            <div style={{ overflowY: 'auto', borderRight: '1px solid var(--color-surface-border)' }}>
              {groups.map(g => (
                <div key={g.folder}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px',
                    background: 'var(--color-surface)',
                    borderBottom: '1px solid var(--color-surface-border)',
                    fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5,
                    color: 'var(--color-text-secondary)',
                  }}>
                    {g.folder}
                    <span style={{ marginLeft: 'auto', color: 'var(--color-text-muted)' }}>{g.requests.length}</span>
                  </div>
                  {g.requests.map(r => (
                    <Row
                      key={r.scan.identity}
                      r={r}
                      chosen={s.chosen.has(r.scan.identity)}
                      focused={s.focused === r.scan.identity}
                      onToggle={() => s.toggle(r.scan.identity)}
                      onFocus={() => s.focus(r.scan.identity)}
                    />
                  ))}
                </div>
              ))}

              {s.unresolved.length > 0 && <UnresolvedGroup />}
            </div>

            <Detail r={focused} />
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            borderTop: '1px solid var(--color-surface-border)',
          }}>
            <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
              {s.chosen.size} of {s.requests.length} selected
            </span>
            <span style={{ flex: 1 }} />
            <ButtonView label="Cancel" size="sm" variant="secondary" onClick={s.close} />
            <ButtonView
              label="Choose where…"
              size="sm" variant="secondary" accentColor={ACCENT} color={ACCENT}
              disabled={s.chosen.size === 0}
              onClick={() => setStep('destination')}
            />
          </div>
        </div>
      )}

      {/*
        Where it goes, as its own step.

        It was three controls crammed into the review's footer, which left no
        room to show the collection tree or the environment — so neither
        existed, and the workspace was a word rather than a choice.
      */}
      {s.stage === 'review' && step === 'destination' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          background: 'var(--color-panel)',
        }}>
          <div style={{ padding: '16px 18px', overflowY: 'auto', flex: 1 }}>
            <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>
              {s.chosen.size} request{s.chosen.size === 1 ? '' : 's'} — where should they go?
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--color-text-muted)' }}>
              Nothing has been written yet.
            </p>
            <ScanDestination
              destination={destination}
              onDestination={setDestination}
              envName={destination.kind === 'new' ? (destination.name || s.collectionName) : destination.name}
              createEnv={createEnv}
              onCreateEnv={setCreateEnv}
              baseUrl={s.baseUrl?.url}
            />
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            borderTop: '1px solid var(--color-surface-border)',
          }}>
            <ButtonView label="Back" size="sm" variant="secondary" onClick={() => setStep('review')} />
            <span style={{ flex: 1 }} />
            <ButtonView label="Cancel" size="sm" variant="secondary" onClick={s.close} />
            <ButtonView
              label={writing ? 'Creating…' : `Create ${s.chosen.size} request${s.chosen.size === 1 ? '' : 's'}`}
              size="sm" variant="secondary" accentColor={ACCENT} color={ACCENT}
              disabled={writing || s.chosen.size === 0}
              onClick={write}
            />
          </div>
        </div>
      )}
      </div>
    </ModalView>
  );
}

function Summary() {
  const s = useScanStore();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '10px 14px', borderBottom: '1px solid var(--color-surface-border)',
      fontSize: 11.5, color: 'var(--color-text-muted)',
    }}>
      <span style={{ color: 'var(--color-text-primary)' }}>
        {s.requests.length} endpoint{s.requests.length === 1 ? '' : 's'}
      </span>
      <span>· {s.filesWalked} files · {s.ms}ms</span>
      {s.detected.map(d => (
        <span key={d.id} style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 4,
          color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 13%, transparent)`,
        }}>{d.label}</span>
      ))}
      <span style={{ flex: 1 }} />
      {s.baseUrl && (
        <span title="Every request is written against this as a collection variable"
              style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>
          {'{{baseUrl}}'} = {s.baseUrl.url}
        </span>
      )}
      <ButtonView label="Select all" size="xs" variant="secondary" onClick={() => s.toggleAll(true)} />
      <ButtonView label="None" size="xs" variant="secondary" onClick={() => s.toggleAll(false)} />
    </div>
  );
}

function UnresolvedGroup() {
  const unresolved = useScanStore(s => s.unresolved);
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px',
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-surface-border)',
        fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5,
        color: 'var(--color-warning)',
      }}>
        Could not be read
        <span style={{ marginLeft: 'auto' }}>{unresolved.length}</span>
      </div>
      {unresolved.map((u, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '6px 12px 6px 34px',
          borderBottom: '1px solid color-mix(in srgb, var(--color-surface-border) 55%, transparent)',
          fontSize: 11.5,
        }}>
          <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-text-secondary)' }}>
            {u.expression}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
            {u.source.file.split('/').pop()}:{u.source.line}
          </span>
        </div>
      ))}
      <div style={{ padding: '9px 12px 12px 34px', fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
        These are endpoints daakia can see exist and could not name — a path built at runtime, or a
        constant it could not follow. They are listed rather than dropped so you know they are there.
      </div>
    </div>
  );
}

function Detail({ r }: { r?: ScannedRequest }) {
  if (!r) {
    return (
      <div style={{ padding: 16, fontSize: 11.5, color: 'var(--color-text-muted)' }}>
        Select an endpoint to see what was read and what was inferred.
      </div>
    );
  }
  const prov = r.scan.provenance;
  return (
    <div style={{ padding: '12px 14px', overflowY: 'auto' }}>
      <Section title="Request" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Method m={r.method} />
        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, wordBreak: 'break-all' }}>
          {r.url}
        </span>
      </div>

      {r.params.length > 0 && (
        <>
          <Section title="Query" />
          <div style={{
            display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto',
            columnGap: 10, rowGap: 3, marginBottom: 12,
            fontFamily: 'var(--font-mono, monospace)', fontSize: 11, alignItems: 'baseline',
          }}>
            {r.params.map(p => (
              <Fragment key={p.key}>
                <span style={{ color: 'var(--color-text-muted)' }}>{p.key}</span>
                <span style={{ overflowWrap: 'anywhere' }}>
                  {p.value || <em style={{ color: 'var(--color-text-muted)' }}>empty</em>}
                </span>
                <span style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>
                  {p.enabled ? '' : 'optional'}
                </span>
              </Fragment>
            ))}
          </div>
        </>
      )}

      {r.headers.length > 0 && (
        <>
          <Section title="Headers" />
          <div style={{
            display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)',
            columnGap: 10, rowGap: 3, marginBottom: 12,
            fontFamily: 'var(--font-mono, monospace)', fontSize: 11, alignItems: 'baseline',
          }}>
            {r.headers.map(h => (
              <Fragment key={h.key}>
                <span style={{ color: 'var(--color-text-muted)' }}>{h.key}</span>
                <span style={{ overflowWrap: 'anywhere' }}>
                  {h.value || <em style={{ color: 'var(--color-text-muted)' }}>empty</em>}
                </span>
              </Fragment>
            ))}
          </div>
        </>
      )}

      {r.bodyRaw && (
        <>
          <Section title="Body" mark={prov.body} />
          <Json text={r.bodyRaw} />
        </>
      )}

      <Section title="How daakia knows" />
      {/*
        A grid, not a row of flexed spans.

        Flexed, every marker sat at a different x because each label is a
        different width, and the wrapped second line of a long explanation ran
        back under the marker. Three columns — marker, field, why — give the
        markers a rail to line up on and the text a column to wrap inside.
      */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto auto minmax(0, 1fr)',
        columnGap: 8, rowGap: 5, alignItems: 'baseline',
        fontSize: 10.5, color: 'var(--color-text-muted)', lineHeight: 1.6,
      }}>
        {Object.entries(prov).map(([field, p]) => p && (
          <Fragment key={field}>
            <Mark p={p} />
            <span style={{ color: 'var(--color-text-secondary)' }}>{field}</span>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{describe(p)}</span>
          </Fragment>
        ))}
      </div>
      <div style={{
        marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--color-surface-border)',
        fontFamily: 'var(--font-mono, monospace)', fontSize: 10,
        color: 'var(--color-text-muted)', overflowWrap: 'anywhere',
      }}>{r.scan.source}</div>
    </div>
  );
}

/**
 * A generated body, highlighted the way the body editor will highlight it.
 *
 * It is going to become a request body in a moment, and seeing it in plain
 * grey here and coloured there makes the review feel like a different tool
 * from the thing it is feeding.
 */
function Json({ text }: { text: string }) {
  const html = useMemo(() => {
    try {
      return hljs.highlight(text, { language: 'json' }).value;
    } catch {
      /* A body that is not valid JSON is still worth showing — unhighlighted
         rather than not at all. */
      return escapeHtml(text);
    }
  }, [text]);
  return (
    <pre className="dk-hl" style={{ marginBottom: 12, maxHeight: 220 }}>
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c));
}

function Section({ title, mark }: { title: string; mark?: Provenance }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4,
      fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase',
      color: 'var(--color-text-muted)',
    }}>
      {title}
      {mark && <Mark p={mark} />}
    </div>
  );
}

function SourceStep() {
  const s = useScanStore();

  /*
    Look at the folder as it is typed, not when the field is left.

    Waiting for blur meant somebody could paste a path, read "No framework
    recognised there yet", and conclude the scan would find nothing — because
    nothing had looked yet. The check is one manifest read, so it can afford to
    run while they are still deciding.
  */
  useEffect(() => {
    const dir = s.dir.trim();
    if (!dir) return;
    const t = setTimeout(() => s.inspect(dir), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.dir]);
  const workspaces = useWorkspaceStore(w => w.workspaces);
  const activeId = useWorkspaceStore(w => w.activeId);
  const workspacePath = workspaces.find(w => w.id === activeId)?.path;

  return (
    <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.55, maxWidth: '72ch' }}>
        daakia reads route declarations out of your source. It opens nothing, runs nothing, and
        sends nothing anywhere — the files are read on this machine and the result is a list you
        choose from.
      </p>

      <Field label="Folder to scan">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>
            <TextInputView
              value={s.dir}
              onChange={e => s.setDir(e.target.value)}
              placeholder="C:\path\to\your\repository"
              size="sm" width="fullWidth" accentColor={ACCENT}
            />
          </span>
          <ButtonView label="Browse…" size="sm" variant="secondary" onClick={s.pickFolder} />
        </div>
        {workspacePath && workspacePath !== s.dir && (
          <button
            type="button"
            onClick={() => { s.setDir(workspacePath); s.inspect(workspacePath); }}
            style={{
              alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0,
              cursor: 'pointer', fontSize: 11, color: ACCENT,
            }}
          >
            Use this workspace's folder
          </button>
        )}
      </Field>

      {s.detected.length > 0 && (
        <Field label="Recognised here">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {s.detected.map(d => (
              <span key={d.id} style={{
                fontSize: 10.5, padding: '2px 7px', borderRadius: 4,
                color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 13%, transparent)`,
                border: `1px solid color-mix(in srgb, ${ACCENT} 28%, transparent)`,
              }}>{d.label}</span>
            ))}
            {s.manifests.slice(0, 2).map(m => (
              <span key={m} style={{ fontSize: 10.5, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                {m}
              </span>
            ))}
          </div>
        </Field>
      )}

      {s.profiles.length > 0 && (
        <Field label="Configuration profile">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip on={!s.profile} onClick={() => s.setProfile(undefined)}>application</Chip>
            {s.profiles.map(p => (
              <Chip key={p} on={s.profile === p} onClick={() => s.setProfile(p)}>{p}</Chip>
            ))}
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 4 }}>
              Chosen, not merged — profiles disagree on purpose.
            </span>
          </div>
        </Field>
      )}

      {s.dir.trim() && s.detected.length === 0 && (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--color-text-muted)' }}>
          No framework recognised there yet. daakia looks for a manifest — pom.xml, build.gradle,
          package.json — before it opens a single source file.
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <ButtonView label="Cancel" size="sm" variant="secondary" onClick={s.close} />
        <ButtonView label="Scan" size="sm" variant="secondary" accentColor={ACCENT} color={ACCENT}
                    disabled={!s.dir.trim()} onClick={s.run} />
      </div>
    </div>
  );
}

function ScanningStep() {
  const s = useScanStore();
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '44px 20px 40px', gap: 4,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 17, display: 'grid', placeItems: 'center',
        marginBottom: 12,
        background: `color-mix(in srgb, ${ACCENT} 11%, var(--color-surface))`,
        border: `1px solid color-mix(in srgb, ${ACCENT} 22%, transparent)`,
      }}>
        <SearchIcon size={26} color={ACCENT} />
      </div>
      <span style={{ fontSize: 13.5, fontWeight: 600 }}>Reading {s.dir.split(/[\\/]/).pop()}</span>
      <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)', textAlign: 'center', maxWidth: '62ch' }}>
        Resolving custom annotations first, then the controllers that use them.
      </span>

      {/* The file it is on — the commonest scan failure is the wrong folder, and
          the only other symptom is a short list at the end. */}
      <div style={{
        marginTop: 16, width: 'min(94%, 560px)',
        background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)',
        borderRadius: 7, padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 7,
      }}>
        <div style={{
          fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
          background: 'var(--color-surface-hover)', borderRadius: 4, padding: '7px 11px',
          whiteSpace: 'nowrap', overflowX: 'auto', color: 'var(--color-text-primary)',
        }}>
          <span style={{ color: ACCENT }}>›</span> {s.progress?.file ?? 'walking the tree…'}
        </div>
        <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5, color: 'var(--color-text-muted)' }}>
          {s.progress?.filesWalked ?? 0} files · {s.progress?.found ?? 0} endpoints
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{
        fontSize: 10.5, letterSpacing: '.07em', textTransform: 'uppercase',
        color: 'var(--color-text-muted)',
      }}>{label}</span>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      fontSize: 11.5, padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
      color: on ? ACCENT : 'var(--color-text-muted)',
      background: on ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : 'none',
      border: `1px solid ${on ? `color-mix(in srgb, ${ACCENT} 30%, transparent)` : 'var(--color-surface-border)'}`,
    }}>{children}</button>
  );
}

/* Imported for the icon set's side effects on tree shaking; referenced so the
   linter does not remove what the design calls for later. */
void FolderOpenIcon; void RefreshIcon; void CopyButtonView;
