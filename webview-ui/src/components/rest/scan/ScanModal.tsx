/**
 * Scan code for requests — the same wizard frame as the Swagger URL import.
 *
 *   1. Folder    which repository; the frameworks it recognises light up.
 *   2. Review    what it found, arranged in folders you can drag about, with
 *                the "how daakia knows" panel beside the selected request —
 *                everything shown carries a marker saying how it came to be
 *                known, because a generator you cannot audit is one you stop
 *                trusting the first time it is wrong.
 *   3. Save to   which workspace, a new collection or one you have, and the
 *                environment that holds {{baseUrl}}.
 *   4. Reconcile only when the destination already holds requests a scan
 *                wrote: what this scan would change, decided row by row.
 *
 * Nothing is written until the last button.
 */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ModalView, ButtonView, TextInputView, SegmentedControlView, IconButtonView, CheckboxView } from '@salilvnair/dui';
import hljs from 'highlight.js';
import {
  useScanStore, isInternal, type ScannedRequest, type Provenance, type ProvenanceKind,
} from '../../../store/scan-store';
import { useWorkspaceStore } from '../../../store/workspace-store';
import { importArranged } from '../../../services/collections/import-to-collection';
import { useToastStore } from '../../../store/toast-store';
import { SearchIcon, FolderOpenIcon, FolderPlusIcon, CheckIcon, InfoCircleIcon } from '../../../icons';
import { useEnvStore } from '../../../store/env-store';
import { ScanReconcile } from './ScanReconcile';
import { reconcile, defaultSelection, type Reconciled } from '@daakia/scan-reconcile';
import { existingRequests, findNode, folderNamed, type CollectionNodeWithRequests } from '../../../services/scan/existing-requests';
import { postMsg } from '../../../vscode';
import { useUiStateStore } from '../../../store/ui-state-store';
import {
  scanPreferences, detectors as detectorPrefs,
  SCAN_DETECTORS_KEY, DETECTOR_IDS, DETECTOR_LABELS, type DetectorId,
} from '../../../services/scan/scan-settings';
import { DETECTOR_COLORS } from '@daakia/api-detector';
import {
  arrange, requestName, addFolder, foldersInUse, treeRows, setOn,
  type Arrangement, type GroupBy, type NameBy, type OutlineOp,
} from '../../../services/openapi-url/arrange';
import { WizardSteps } from '../../shared/import-wizard/WizardSteps';
import { ArrangeTree } from '../../shared/import-wizard/ArrangeTree';
import { DestinationPicker, targetLabel, type Target } from '../../shared/import-wizard/DestinationPicker';
import '../../shared/import-wizard/import-wizard.css';

/** Collections is purple everywhere else in daakia; this lives under it. */
const ACCENT = 'var(--color-sidebar-collections)';

/* A Windows path, kept out of JSX so the backslashes are unambiguous. */
const PLACEHOLDER_PATH = 'C:\\path\\to\\your\\repository';

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

function Mark({ p, label }: { p: Provenance; label?: string }) {
  return <span className="dk-swi-mk" title={describe(p)} style={{ ['--mk' as string]: PROV_COLOR[p.kind] }}>{label ?? p.kind}</span>;
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

/** A scanned request as the arrange tree sees it: its controller is its "tag". */
function asOp(r: ScannedRequest): OutlineOp {
  return {
    id: r.scan.identity,
    method: r.method,
    path: r.url.replace('{{baseUrl}}', '') || '/',
    summary: r.name,
    operationId: '',
    tag: r.folder || 'Ungrouped',
    deprecated: false,
    security: [],
  };
}

const STEPS = ['Folder', 'Review', 'Save to'] as const;

export function ScanModal() {
  const s = useScanStore();
  const addToast = useToastStore(t => t.addToast);
  const [step, setStep] = useState(0);
  const [writing, setWriting] = useState(false);

  // 2. Review
  const [groupBy, setGroupBy] = useState<GroupBy>('tag');
  const [nameBy, setNameBy] = useState<NameBy>('summary');
  const [arr, setArr] = useState<Arrangement>({ folders: [], requests: [] });

  // 3. Save to
  const [target, setTarget] = useState<Target>({ kind: 'new' });
  const [name, setName] = useState('');
  /* Settings → Code Scan decides what this arrives as; it is still a checkbox. */
  const [createEnv, setCreateEnv] = useState(
    () => scanPreferences(useUiStateStore.getState().prefs).createEnvironment,
  );

  // 4. Reconcile — only ever populated for a destination that already holds scanned requests.
  const [plan, setPlan] = useState<Reconciled[]>([]);
  const [planChosen, setPlanChosen] = useState<Set<string>>(new Set());
  const [tree, setTree] = useState<CollectionNodeWithRequests[]>([]);
  /** Request id → the folder it currently lives in. Read before writing back. */
  const [homes, setHomes] = useState<Map<string, string>>(new Map());

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

  /* The tree, so an existing collection's requests can be read back. */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'collectionsData') return;
      const list = (e.data.collections ?? e.data.data ?? []) as CollectionNodeWithRequests[];
      if (Array.isArray(list)) setTree(list);
    };
    window.addEventListener('message', onMessage);
    postMsg({ type: 'getCollections', protocol: 'rest' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  /*
    A new scan starts at the first step, with no destination.

    The modal is hidden rather than unmounted, so every piece of state here
    outlives the scan that set it. Carrying the old destination forward would
    put a scan of one repository, unasked, into the collection built from
    another.
  */
  useEffect(() => {
    if (s.stage !== 'source' && s.stage !== 'scanning') return;
    setStep(0);
    setPlan([]);
    setPlanChosen(new Set());
    setHomes(new Map());
    setCreateEnv(scanPreferences(useUiStateStore.getState().prefs).createEnvironment);
    setTarget({ kind: 'new' });
  }, [s.stage]);

  /* A finished scan opens on its review, arranged one folder per source file. */
  useEffect(() => {
    if (s.stage !== 'review') return;
    setGroupBy('tag');
    setArr(arrange(s.requests.map(asOp), 'tag', new Map(s.requests.map(r => [r.scan.identity, s.chosen.has(r.scan.identity)]))));
    setName(s.collectionName);
    setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.stage, s.requests]);

  const byId = useMemo(() => new Map(s.requests.map(r => [r.scan.identity, r])), [s.requests]);
  const focused = s.focused ? byId.get(s.focused) : undefined;
  const onCount = arr.requests.filter(r => r.on).length;
  const total = s.requests.length;

  if (!s.open) return null;

  const regroup = (by: GroupBy) => {
    setGroupBy(by);
    setArr(a => arrange(s.requests.map(asOp), by, new Map(a.requests.map(r => [r.opId, r.on]))));
  };

  /** The ticked requests, in tree order, each with the folder it sits in. */
  const picked = () => treeRows(arr, true).flatMap(row => {
    if (row.kind !== 'request') return [];
    const r = byId.get(row.request.opId);
    return r ? [{ r, folderId: row.request.folderId }] : [];
  });
  const folderName = (id: string | null) => arr.folders.find(f => f.id === id)?.name ?? '';
  const destName = targetLabel(target, name.trim() || s.collectionName || 'Scanned API');

  /**
   * Going forward from Save to.
   *
   * Into an existing collection that already holds scanned requests, this is a
   * re-scan and there is a decision to show. Anywhere else there is nothing to
   * reconcile against, and an empty reconcile screen would be ceremony.
   */
  const proceed = () => {
    if (target.kind !== 'existing') { void write(); return; }
    const existing = existingRequests(tree, target.id);
    if (!existing.some(e => e.scan)) { void write(); return; }

    /* Where each one lives now, so updating it does not also move it. */
    setHomes(new Map(existing.map(e => [e.id, e.collectionId])));
    const rows = reconcile(existing, picked().map(({ r, folderId }) => ({
      name: r.name, method: r.method, url: r.url,
      headers: r.headers, params: r.params,
      bodyMode: r.bodyMode, bodyRaw: r.bodyRaw, authType: r.authType,
      folder: folderName(folderId) || r.folder, scan: r.scan,
    })));
    setPlan(rows);
    setPlanChosen(defaultSelection(rows));
    setStep(3);
  };

  /** Apply a reconciliation: only the rows that were ticked, by their own id. */
  const applyPlan = async () => {
    if (target.kind !== 'existing') return;
    setWriting(true);
    try {
      const collectionId = target.id;
      const rows = plan.filter(r => planChosen.has(r.identity) && r.next && r.outcome !== 'orphaned');

      /*
        A request added by a re-scan goes in the folder for its source file,
        beside the ones the first scan put there — created now if the file is
        new. Anything already here is written back where it already is.
      */
      const root = findNode(tree, collectionId);
      const folders = new Map<string, string>();
      for (const row of rows) {
        const folder = row.next!.folder?.trim();
        if (!folder || row.existing || folders.has(folder)) continue;
        const known = folderNamed(root, folder);
        if (known) { folders.set(folder, known.id); continue; }
        const id = crypto.randomUUID();
        folders.set(folder, id);
        postMsg({ type: 'createFolder', id, name: folder, parentId: collectionId, protocol: 'rest' });
        await new Promise(r => setTimeout(r, 60));
      }

      for (const row of rows) {
        const next = row.next!;
        const home = (row.existing && homes.get(row.existing.id))
          ?? folders.get(next.folder?.trim() ?? '')
          ?? collectionId;
        postMsg({
          type: 'saveRequestToCollection',
          collectionId: home,
          protocol: 'rest',
          request: {
            /*
              An update keeps the row's own id — `saveRequestToCollection`
              upserts — so the request people have open, starred or referenced
              stays the same request rather than becoming a copy of itself.
            */
            id: row.existing?.id ?? crypto.randomUUID(),
            name: next.name,
            method: next.method,
            url: next.url,
            data: JSON.stringify({
              headers: withBlank(next.headers),
              params: withBlank(next.params),
              bodyMode: next.bodyMode,
              bodyRaw: next.bodyRaw,
              bodyFormData: [], bodyUrlEncoded: [],
              authType: next.authType, authData: {},
              preRequestScript: '', postResponseScript: '',
              scan: next.scan,
            }),
          },
        });
        await new Promise(r => setTimeout(r, 40));
      }
      postMsg({ type: 'getCollections', protocol: 'rest' });
      const added = rows.filter(r => r.outcome === 'added').length;
      addToast({ type: 'success', title: 'Scan applied', message: `${added} added, ${rows.length - added} updated in ${destName}` });
      s.close();
    } finally {
      setWriting(false);
    }
  };

  const write = async () => {
    const chosen = picked();
    if (!chosen.length) return;
    setWriting(true);
    try {
      const envName = target.kind === 'new' ? destName : target.path[target.path.length - 1];
      /*
        The environment first, and made active. Every request is written
        against {{baseUrl}}, so a collection that arrives before the variable
        that resolves it is a collection that cannot be run.
      */
      if (createEnv && s.baseUrl?.url) {
        const env = useEnvStore.getState();
        const id = env.addEnvironment(envName);
        env.updateVariables(id, [{
          id: crypto.randomUUID(), key: 'baseUrl',
          initialValue: s.baseUrl.url, currentValue: s.baseUrl.url, isSecret: false,
        }]);
        env.setActiveEnvironment(id);
      }

      const usedIds = new Set(chosen.map(c => c.folderId));
      const { saved } = await importArranged({
        protocol: 'rest',
        into: target.kind === 'new' ? { kind: 'new', name: destName } : { kind: 'existing', id: target.id },
        folders: foldersInUse(arr).filter(f => usedIds.has(f.id) || arr.folders.some(c => c.parentId === f.id))
          .map(f => ({ id: f.id, name: f.name, parentId: f.parentId })),
        requests: chosen.map(({ r, folderId }) => ({
          name: nameBy === 'path' ? `${r.method} ${asOp(r).path}` : r.name,
          method: r.method,
          url: r.url,
          headers: r.headers,
          params: r.params,
          bodyMode: r.bodyMode,
          bodyRaw: r.bodyRaw,
          authType: r.authType,
          /* Kept on the request so a later scan can tell an edit from a change. */
          scan: r.scan,
          folderId,
        })),
      });
      addToast({
        type: 'success',
        title: target.kind === 'new' ? 'Collection created' : 'Requests added',
        message: `${saved} request${saved === 1 ? '' : 's'} in ${destName}`
          + (createEnv && s.baseUrl?.url ? ` · environment ${envName} is active` : ''),
      });
      s.close();
    } finally {
      setWriting(false);
    }
  };

  const steps = plan.length ? [...STEPS, 'Reconcile'] : [...STEPS];
  const reachable = s.stage === 'review' ? (plan.length ? 3 : 2) : 0;
  const goTo = (i: number) => {
    if (i === 0) { useScanStore.setState({ stage: 'source' }); return; }
    setStep(i);
  };
  const willWrite = plan.filter(r => planChosen.has(r.identity) && r.outcome !== 'orphaned').length;

  const enabled = detectorPrefs(useUiStateStore.getState().prefs[SCAN_DETECTORS_KEY]);
  const footerLeft: ReactNode = step === 0
    ? (enabled.length < DETECTOR_IDS.length ? `${enabled.length} of ${DETECTOR_IDS.length} parsers enabled in Settings` : 'Reads files. Writes nothing.')
    : step === 1
      ? (
        <span className="dk-swi-chips">
          <span>{onCount} of {total} selected · {s.filesWalked} files · {s.ms} ms</span>
          {s.detected.map(d => (
            <span key={d.id} className="dk-swi-chip is-found" style={{ ['--mk' as string]: DETECTOR_COLORS[d.id as DetectorId] ?? ACCENT, padding: '1px 8px' }}>
              <span className="dk-swi-chip__dot" />{d.label}
            </span>
          ))}
        </span>
      )
      : step === 2 ? 'Nothing has been written yet.'
        : (willWrite === 0 ? 'Nothing selected' : `${willWrite} to write · nothing is ever deleted`);

  const footerRight = (
    <div className="dk-swi-foot__btns">
      {step === 0 && <ButtonView variant="ghost" size="sm" onClick={s.close}>Cancel</ButtonView>}
      {step === 0 && (
        <ButtonView variant="primary" size="sm" iconLeft={<SearchIcon size={12} />} onClick={s.run}
          disabled={!s.dir.trim() || s.stage === 'scanning'} loading={s.stage === 'scanning'}>
          {s.stage === 'error' ? 'Scan again' : 'Scan'}
        </ButtonView>
      )}
      {step > 0 && <ButtonView variant="ghost" size="sm" onClick={() => goTo(step - 1)}>Back</ButtonView>}
      {step === 1 && (
        <ButtonView variant="primary" size="sm" onClick={() => setStep(2)} disabled={onCount === 0}>Next: Save to</ButtonView>
      )}
      {step === 2 && (
        <ButtonView variant="primary" size="sm" onClick={proceed} disabled={writing || onCount === 0} loading={writing}>
          {`Create ${onCount} request${onCount === 1 ? '' : 's'}`}
        </ButtonView>
      )}
      {step === 3 && (
        <ButtonView variant="primary" size="sm" onClick={applyPlan} disabled={writing || willWrite === 0} loading={writing}>Apply</ButtonView>
      )}
    </div>
  );

  return (
    <ModalView
      open
      onClose={s.close}
      size="xxl"
      maxHeight="88vh"
      noPadding
      className="dk-swi-modal"
      bodyStyle={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      headerColor={ACCENT}
      headerIcon={<span className="dk-swi-mark" style={{ ['--dk-tone' as string]: ACCENT }}><SearchIcon size={16} /></span>}
      title="Scan code for requests"
      subtitle="Reads the routes out of your source. Nothing is run, and nothing leaves this machine."
      headerRight={<WizardSteps steps={steps} current={step} reachable={reachable} onStep={goTo} />}
      footerLeft={<span className="dk-swi-foot">{footerLeft}</span>}
      footerRight={footerRight}
    >
      <div className={`dk-swi${step === 0 ? ' dk-swi--fit' : ''}`}>
        {step === 0 && <SourceStep />}

        {step === 1 && (
          s.requests.length === 0 ? <FoundNothing /> : (
            <div className="dk-swi-organize" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 34%)' }}>
              <div className="dk-swi-organize__main">
                <div className="dk-swi-toolbar">
                  <span className="dk-swi-muted">Group by</span>
                  <SegmentedControlView size="sm" variant="rounded" value={groupBy} onChange={x => regroup(x as GroupBy)}
                    options={[{ value: 'tag', label: 'Source file' }, { value: 'path', label: 'Path' }, { value: 'flat', label: 'Flat' }]} />
                  <span className="dk-swi-muted">Name by</span>
                  <SegmentedControlView size="sm" variant="rounded" value={nameBy} onChange={x => setNameBy(x as NameBy)}
                    options={[{ value: 'summary', label: 'Method name' }, { value: 'path', label: 'Method + path' }]} />
                  <span className="dk-swi-toolbar__end" style={{ alignItems: 'center', gap: 6 }}>
                    <span onClick={e => e.stopPropagation()} style={{ display: 'inline-flex' }} title={onCount === total ? 'Select none' : 'Select all'}>
                      <CheckboxView size="sm" checked={onCount === total && total > 0} indeterminate={onCount > 0 && onCount < total}
                        onChange={() => setArr(a => setOn(a, new Set(a.requests.map(r => r.opId)), onCount !== total))} />
                    </span>
                    <IconButtonView size="md" icon={<FolderPlusIcon size={15} />} tooltip="New folder" onClick={() => setArr(a => addFolder(a, null).next)} />
                  </span>
                </div>
                <ArrangeTree
                  arr={arr}
                  setArr={setArr}
                  rootName={name}
                  onRootName={setName}
                  total={total}
                  focusedId={s.focused}
                  onFocus={id => s.focus(id)}
                  describe={a => {
                    const r = byId.get(a.opId)!;
                    const op = asOp(r);
                    return { method: r.method, text: `${requestName(op, nameBy)} ${op.path}` };
                  }}
                  renderRequest={a => {
                    const r = byId.get(a.opId)!;
                    const worst = worstProvenance(r);
                    const op = asOp(r);
                    return (
                      <>
                        <span className="dk-swi-method" style={{ color: METHOD_COLOR[r.method] }}>{r.method}</span>
                        <span className="dk-swi-name">{requestName(op, nameBy)}</span>
                        {nameBy !== 'path' && <code className="dk-swi-path">{op.path}</code>}
                        <span className="dk-swi-marks" style={nameBy === 'path' ? { marginLeft: 'auto' } : undefined}>
                          {isInternal(r) && <Mark p={{ kind: 'unknown', why: 'an internal path — listed, not selected' }} label="internal" />}
                          {worst && <Mark p={worst[1]} label={worst[0] === 'path' ? worst[1].kind : `${worst[0]} ${worst[1].kind}`} />}
                        </span>
                      </>
                    );
                  }}
                  footer={s.unresolved.length > 0 && <Unresolved />}
                />
              </div>
              <Detail r={focused} />
            </div>
          )
        )}

        {step === 2 && (
          <div className="dk-swi-pane dk-swi-save">
            <section>
              <DestinationPicker
                target={target}
                onTarget={setTarget}
                newName={name}
                onNewName={setName}
                existingHint="The folders you arranged are made inside it. If it already holds requests from an earlier scan, the next step shows what would change before anything does."
              />
            </section>
            <section>
              <span className="dk-swi-eyebrow">Environment</span>
              <label className="dk-swi-card dk-swi-env">
                <CheckboxView size="sm" checked={createEnv} onChange={setCreateEnv} />
                <div>
                  <span>Create an environment named <b>{target.kind === 'new' ? destName : target.path[target.path.length - 1]}</b></span>
                  <code className="dk-swi-small dk-swi-muted">baseUrl = {s.baseUrl?.url ?? 'http://localhost:8080'}</code>
                  <span className="dk-swi-small dk-swi-muted">
                    Every request is written against <span className="dk-swi-tok">{'{{baseUrl}}'}</span>. Without an environment holding it, the collection points at nothing until you make one.
                  </span>
                </div>
              </label>
              <span className="dk-swi-eyebrow" style={{ marginTop: 6 }}>In the sidebar</span>
              <div className="dk-swi-dest">
                <FolderOpenIcon size={15} className="dk-swi-folder" />
                <b>{destName}</b>
                <span className="dk-swi-count">{onCount} request{onCount === 1 ? '' : 's'}</span>
              </div>
              <div className="dk-swi-card dk-swi-preview">
                {treeRows(arr, true).slice(0, 16).map(row => (row.kind === 'folder' ? (
                  <div key={`f${row.folder.id}`} style={{ paddingLeft: 8 + row.depth * 16 }} className="dk-swi-prow">
                    <FolderOpenIcon size={13} className="dk-swi-folder" /><b>{row.folder.name}</b><span className="dk-swi-count">{row.on}</span>
                  </div>
                ) : (
                  <div key={`r${row.request.opId}`} style={{ paddingLeft: 12 + row.depth * 16 }} className="dk-swi-prow">
                    <span className="dk-swi-method" style={{ color: METHOD_COLOR[byId.get(row.request.opId)!.method] }}>{byId.get(row.request.opId)!.method}</span>
                    <span className="dk-swi-name">{requestName(asOp(byId.get(row.request.opId)!), nameBy)}</span>
                  </div>
                )))}
                {treeRows(arr, true).length > 16 && <span className="dk-swi-muted dk-swi-small">+ {treeRows(arr, true).length - 16} more</span>}
              </div>
            </section>
          </div>
        )}

        {step === 3 && (
          <div style={{ flex: 1, minHeight: 0 }}>
            <ScanReconcile
              embedded
              rows={plan}
              chosen={planChosen}
              onToggle={(identity) => setPlanChosen(prev => {
                const next = new Set(prev);
                if (next.has(identity)) next.delete(identity); else next.add(identity);
                return next;
              })}
              collectionName={destName}
              onBack={() => setStep(2)}
              onApply={applyPlan}
              applying={writing}
            />
          </div>
        )}
      </div>
    </ModalView>
  );
}

/**
 * The trailing blank row the request editor expects.
 *
 * `toCollectionRequest` adds it on the create path; an update writes its own
 * rows, and without one the editor opens with no empty line to type into.
 */
function withBlank(rows: { key: string; value: string; enabled: boolean }[]) {
  return [
    ...rows.map(r => ({ id: crypto.randomUUID(), ...r })),
    { id: crypto.randomUUID(), key: '', value: '', enabled: true },
  ];
}

/**
 * A scan that found nothing, and why that might be.
 *
 * The usual reason is the folder. But a detector turned off in Settings
 * produces exactly the same empty screen from a repository full of endpoints,
 * so when the list is filtered the screen says so and offers the way back.
 */
function FoundNothing() {
  const prefs = useUiStateStore(s => s.prefs);
  const chosen = detectorPrefs(prefs[SCAN_DETECTORS_KEY]);
  const off = DETECTOR_IDS.filter(id => !chosen.includes(id));
  return (
    <div className="dk-swi-empty">
      <h3>No endpoints here</h3>
      <p className="dk-swi-muted">
        Nothing in this folder declares a route that daakia recognises. If you pointed it at a
        parent directory, try the service itself &mdash; the walk stops at the file cap, and a
        repository&rsquo;s controllers can be deeper than that.
      </p>
      {off.length > 0 && (
        <p className="dk-swi-warn">
          {off.map(id => DETECTOR_LABELS[id]).join(', ')} {off.length === 1 ? 'is' : 'are'} turned off in
          Settings &rarr; Code Scan, so this scan did not look for {off.length === 1 ? 'it' : 'them'}.{' '}
          <button type="button" className="dk-swi-link" onClick={() => {
            useUiStateStore.getState().setPref(SCAN_DETECTORS_KEY, '');
            useScanStore.getState().run();
          }}>Turn all back on and scan again</button>
        </p>
      )}
    </div>
  );
}

/** Endpoints daakia can see exist and could not name — listed, not dropped. */
function Unresolved() {
  const unresolved = useScanStore(s => s.unresolved);
  return (
    <div className="dk-swi-unresolved">
      <b>Could not be read · {unresolved.length}</b>
      {unresolved.map((u, i) => (
        <div key={i}><code>{u.expression}</code><span>{u.source.file.split('/').pop()}:{u.source.line}</span></div>
      ))}
      <p className="dk-swi-muted dk-swi-small">A path built at runtime, or a constant it could not follow. Listed so you know they are there.</p>
    </div>
  );
}

function Detail({ r }: { r?: ScannedRequest }) {
  if (!r) {
    return (
      <aside className="dk-swi-detail">
        <span className="dk-swi-eyebrow">How daakia knows</span>
        <p className="dk-swi-muted">Click a request to see what was read from the source and what was inferred.</p>
      </aside>
    );
  }
  const prov = r.scan.provenance;
  return (
    <aside className="dk-swi-detail">
      <span className="dk-swi-eyebrow">Request</span>
      <div className="dk-swi-dest">
        <span className="dk-swi-method" style={{ color: METHOD_COLOR[r.method], width: 'auto' }}>{r.method}</span>
        <code style={{ overflowWrap: 'anywhere' }}>{r.url}</code>
      </div>

      {r.params.length > 0 && (
        <>
          <span className="dk-swi-eyebrow">Query</span>
          <div className="dk-swi-grid">
            {r.params.map(p => (
              <Fragment key={p.key}>
                <span>{p.key}</span>
                <span>{p.value || <em className="dk-swi-muted">empty</em>}{p.enabled ? '' : <span className="dk-swi-muted"> · optional</span>}</span>
              </Fragment>
            ))}
          </div>
        </>
      )}

      {r.headers.length > 0 && (
        <>
          <span className="dk-swi-eyebrow">Headers</span>
          <div className="dk-swi-grid">
            {r.headers.map(h => (
              <Fragment key={h.key}>
                <span>{h.key}</span>
                <span>{h.value || <em className="dk-swi-muted">empty</em>}</span>
              </Fragment>
            ))}
          </div>
        </>
      )}

      {r.bodyRaw && (
        <>
          <span className="dk-swi-eyebrow">Body {prov.body && <Mark p={prov.body} />}</span>
          <Json text={r.bodyRaw} />
        </>
      )}

      <span className="dk-swi-eyebrow">How daakia knows</span>
      <div className="dk-swi-how">
        {Object.entries(prov).map(([field, p]) => p && (
          <Fragment key={field}>
            <Mark p={p} />
            <span>{field}</span>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{describe(p)}</span>
          </Fragment>
        ))}
      </div>
      <div className="dk-swi-src">{r.scan.source}</div>
    </aside>
  );
}

/**
 * A generated body, highlighted the way the body editor will highlight it —
 * it is about to become one.
 */
function Json({ text }: { text: string }) {
  const html = useMemo(() => {
    try {
      return hljs.highlight(text, { language: 'json' }).value;
    } catch {
      return escapeHtml(text);
    }
  }, [text]);
  return (
    <pre className="dk-hl">
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c));
}

/** Windows paths differ in case and slashes without being different folders. */
function samePath(a: string, b: string): boolean {
  const norm = (p: string) => p.trim().replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase();
  return norm(a) === norm(b);
}

function SourceStep() {
  const s = useScanStore();

  /*
    Look at the folder as it is typed, not when the field is left — otherwise
    somebody pastes a path, reads "nothing recognised", and concludes the scan
    would find nothing because nothing had looked yet.
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
  const suggestions: { name: string; path: string; from: 'editor' | 'workspace' }[] = [
    ...s.editorFolders.map(f => ({ ...f, from: 'editor' as const })),
    ...(workspacePath && !s.editorFolders.some(f => samePath(f.path, workspacePath))
      ? [{ name: workspacePath.split(/[\\/]/).filter(Boolean).pop() ?? workspacePath, path: workspacePath, from: 'workspace' as const }]
      : []),
  ];

  const prefs = useUiStateStore(p => p.prefs);
  const enabled = detectorPrefs(prefs[SCAN_DETECTORS_KEY]);
  const found = new Set(s.detected.map(d => d.id));
  const looked = !!s.dir.trim();

  return (
    <div className="dk-swi-pane">
      <label className="dk-swi-label" htmlFor="dk-scan-dir">Folder to scan</label>
      <div className="dk-swi-urlrow">
        <TextInputView
          id="dk-scan-dir"
          value={s.dir}
          onChange={e => s.setDir(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && s.dir.trim()) s.run(); }}
          placeholder={PLACEHOLDER_PATH}
          iconLeft={<FolderOpenIcon size={14} />}
          size="lg"
          width="fullWidth"
          autoFocus
          spellCheck={false}
        />
        <ButtonView className="flex-shrink-0" variant="secondary" size="lg" iconLeft={<FolderOpenIcon size={13} />} onClick={s.pickFolder}>
          Browse
        </ButtonView>
      </div>
      {/*
        The folders open in the editor first — the repository somebody wants
        scanned is usually the one they are looking at — then the folder
        this daakia workspace is tied to, if it has one.
      */}
      {suggestions.length > 0 && (
        <div className="dk-swi-chips">
          <span className="dk-swi-small dk-swi-muted">Open here</span>
          {suggestions.map(f => (
            <button
              key={f.path}
              type="button"
              className={`dk-swi-chip${samePath(f.path, s.dir) ? ' is-on' : ''}`}
              title={f.path}
              onClick={() => { s.setDir(f.path); s.inspect(f.path); }}
            >
              <FolderOpenIcon size={12} />{f.name}
              {f.from === 'workspace' && <span className="dk-swi-small dk-swi-muted">workspace</span>}
            </button>
          ))}
        </div>
      )}
      <div className="dk-swi-hints">
        <span>Read-only. Nothing is run, and nothing leaves this machine.</span>
      </div>

      <div className="dk-swi-field">
        <span className="dk-swi-eyebrow">{looked ? 'Recognised here' : 'What it looks for'}</span>
        {/*
          All of them, always — lit when this folder has one, dim when it does
          not, and plainly marked when Settings has one turned off, because a
          parser switched off last month looks exactly like an empty repository.
        */}
        <div className="dk-swi-chips">
          {DETECTOR_IDS.map(id => {
            const state = !enabled.includes(id) ? 'off' : found.has(id) ? 'found' : 'idle';
            return (
              <span
                key={id}
                className={`dk-swi-chip${state === 'found' ? ' is-found' : ''}${state === 'off' ? ' is-off' : ''}`}
                style={{ ['--mk' as string]: DETECTOR_COLORS[id] }}
                title={state === 'off' ? 'Turned off in Settings → Code Scan' : undefined}
              >
                <span className="dk-swi-chip__dot" />
                {state === 'off' ? <s>{DETECTOR_LABELS[id]}</s> : DETECTOR_LABELS[id]}
                {state === 'found' && <CheckIcon size={11} />}
                {state === 'off' && <span className="dk-swi-small">off</span>}
              </span>
            );
          })}
        </div>
        {s.manifests.length > 0 && (
          <span className="dk-swi-small dk-swi-muted">by {s.manifests.slice(0, 3).map(m => <code key={m} style={{ marginRight: 6 }}>{m}</code>)}</span>
        )}
        {looked && s.detected.length === 0 && (
          <p className="dk-swi-note"><InfoCircleIcon size={13} />Nothing recognised there yet. daakia looks for a manifest (<code>pom.xml</code>, <code>build.gradle</code>, <code>package.json</code>) before it opens a source file. You can scan anyway.</p>
        )}
      </div>

      {s.profiles.length > 0 && (
        <div className="dk-swi-field">
          <span className="dk-swi-eyebrow">Configuration profile</span>
          <div className="dk-swi-chips">
            <button type="button" className={`dk-swi-chip${!s.profile ? ' is-on' : ''}`} onClick={() => s.setProfile(undefined)}>application</button>
            {s.profiles.map(p => (
              <button type="button" key={p} className={`dk-swi-chip${s.profile === p ? ' is-on' : ''}`} onClick={() => s.setProfile(p)}>{p}</button>
            ))}
            <span className="dk-swi-small dk-swi-muted">Chosen, not merged — profiles disagree on purpose.</span>
          </div>
        </div>
      )}

      {s.stage === 'scanning' && (
        <div className="dk-swi-card dk-swi-scanning">
          <span><b>Reading {s.dir.split(/[\\/]/).pop()}</b> <span className="dk-swi-muted">· custom annotations first, then the controllers that use them</span></span>
          <code>{s.progress?.file ?? 'walking the tree…'}</code>
          <span className="dk-swi-small dk-swi-muted">{s.progress?.filesWalked ?? 0} files · {s.progress?.found ?? 0} endpoints</span>
        </div>
      )}
      {s.stage === 'error' && <p className="dk-swi-error" role="alert">The scan could not be completed. {s.error}</p>}
    </div>
  );
}
