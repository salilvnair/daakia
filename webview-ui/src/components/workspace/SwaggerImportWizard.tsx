/**
 * Import from a Swagger / OpenAPI URL — a wizard rather than a one-shot.
 *
 *   1. Source     the URL (or the Swagger UI page); the host finds the spec.
 *   2. Organize   drag requests and folders into the shape you want.
 *   3. Variables  one environment per server, {{baseUrl}} in every URL, each
 *                 auth scheme reading a secret variable, shared path params.
 *   4. Save to    which workspace, and a new collection or one you have;
 *                 then create.
 *
 * Nothing is created until the last step. The spec itself stays on the host
 * (see `openapi-url-handler.ts`); this holds the outline and the arrangement,
 * and sends back only the arrangement.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ModalView, ButtonView, SegmentedControlView, ToggleSwitchView, IconButtonView, TextInputView,
} from '@salilvnair/dui';
import { KeyValueTable, type KeyValueRow } from '../shared/controls/KeyValueTable';
import {
  BracesIcon, CheckIcon, FolderIcon, FolderPlusIcon, KeyIcon,
  LinkIcon, LockIcon, PlusIcon, InfoCircleIcon, CloseIcon, DownloadIcon,
} from '../../icons';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';
import {
  arrange, requestName, addFolder, foldersInUse, treeRows,
  type Arrangement, type GroupBy, type NameBy, type OutlineOp,
} from '../../services/openapi-url/arrange';
import { WizardSteps } from '../shared/import-wizard/WizardSteps';
import { ArrangeTree } from '../shared/import-wizard/ArrangeTree';
import { DestinationPicker, targetLabel, type Target } from '../shared/import-wizard/DestinationPicker';
import '../shared/import-wizard/import-wizard.css';

interface OutlineScheme {
  name: string;
  kind: 'api-key' | 'bearer' | 'basic' | 'oauth2';
  label: string;
  detail: string;
  variables: { key: string; secret: boolean }[];
  scopes?: string[];
  operationCount: number;
}
interface Outline {
  title: string;
  version: string;
  specVersion: string;
  format: string;
  operations: OutlineOp[];
  tags: { name: string; count: number }[];
  servers: { url: string; resolved: string; description: string }[];
  schemes: OutlineScheme[];
  pathParams: { name: string; type: string; example: string; used: number }[];
  schemaCount: number;
}
interface Fetched { specUrl: string; status: number; bytes: number; ms: number; foundFromUi: boolean }
interface Env { id: string; name: string; fromSpec: boolean; values: Record<string, string> }
interface PathVar { name: string; type: string; used: number; shared: boolean; value: string }

const STEPS = ['Source', 'Organize', 'Variables', 'Save to'] as const;
const METHOD_COLOR: Record<string, string> = {
  GET: 'var(--color-method-get)', POST: 'var(--color-method-post)', PUT: 'var(--color-method-put)',
  PATCH: 'var(--color-method-patch)', DELETE: 'var(--color-method-delete)', HEAD: 'var(--color-method-head)',
  OPTIONS: 'var(--color-method-options)',
};
const ENV_COLORS = ['var(--color-success)', 'var(--color-info)', 'var(--color-warning)', 'var(--color-method-options)'];
const v = (k: string) => `{{${k}}}`;

let seq = 0;
const reqId = () => `swi-${Date.now()}-${++seq}`;

function isLocal(url: string): boolean {
  try { const h = new URL(url).hostname; return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost'); } catch { return false; }
}
function envNameFor(server: { resolved: string; description: string }, i: number): string {
  // springdoc writes "Generated server url" on every server; it names nothing.
  const said = server.description.trim();
  if (said && !/^generated server url$/i.test(said)) return said;
  if (isLocal(server.resolved)) return 'Local';
  try { return new URL(server.resolved).host; } catch { return `Server ${i + 1}`; }
}
function kb(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

export function SwaggerImportWizard({ onClose }: { onClose: () => void }) {
  const addToast = useToastStore(s => s.addToast);
  const [step, setStep] = useState(0);

  // 1. Source
  const [url, setUrl] = useState('');
  // The same table as a request's Headers tab — enable box, delete, suggestions, masking.
  const [headers, setHeaders] = useState<KeyValueRow[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [outline, setOutline] = useState<Outline | null>(null);
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [token, setToken] = useState('');

  // 2. Organize
  const [groupBy, setGroupBy] = useState<GroupBy>('tag');
  const [nameBy, setNameBy] = useState<NameBy>('summary');
  const [arr, setArr] = useState<Arrangement>({ folders: [], requests: [] });
  const [collectionName, setCollectionName] = useState('');

  // 3. Variables
  const [envs, setEnvs] = useState<Env[]>([]);
  const [pathVars, setPathVars] = useState<PathVar[]>([]);

  // 4. Save to
  const [target, setTarget] = useState<Target>({ kind: 'new' });
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState<{ name: string; where: string; requests: number; folders: number; envs: string[] } | null>(null);

  const pending = useRef<string>('');
  const whereRef = useRef('');

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const msg = e.data as Record<string, unknown>;
      if (!msg || msg.reqId !== pending.current) return;
      if (msg.type === 'openapiUrl:outline') {
        setFetching(false);
        if (!msg.ok) { setError(String(msg.error ?? 'Could not fetch that URL.')); return; }
        const o = msg.outline as Outline;
        setOutline(o);
        setFetched(msg.fetched as Fetched);
        setToken(String(msg.token));
        setError('');
        setCollectionName(o.title);
        setArr(arrange(o.operations, groupBy));
        const servers = o.servers.length ? o.servers : [{ url: '', resolved: '', description: '' }];
        setEnvs(servers.map((s, i) => ({ id: `e${i}`, name: envNameFor(s, i), fromSpec: !!s.resolved, values: { baseUrl: s.resolved } })));
        setPathVars(o.pathParams.map(p => ({ name: p.name, type: p.type, used: p.used, shared: true, value: p.example })));
      }
      if (msg.type === 'openapiUrl:imported') {
        setCreating(false);
        if (!msg.ok) { addToast({ type: 'error', title: 'Import failed', message: String(msg.error ?? 'The import failed.') }); return; }
        const result = { name: String(msg.name), where: whereRef.current, requests: Number(msg.requestCount), folders: Number(msg.folderCount), envs: (msg.environments as string[]) ?? [] };
        setDone(result);
        addToast({ type: 'success', title: result.where ? 'Imported' : 'Collection created', message: `${result.name}${result.where ? ` in ${result.where}` : ''} — ${result.requests} requests in ${result.folders} folders` });
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [addToast, groupBy]);

  const fetchSpec = () => {
    if (!url.trim() || fetching) return;
    pending.current = reqId();
    setFetching(true);
    setError('');
    postMsg({ type: 'openapiUrl:fetch', reqId: pending.current, url: url.trim(), headers: headers.filter(h => h.enabled && h.key.trim()).map(h => ({ key: h.key, value: h.value })) });
  };

  const ops = useMemo(() => new Map((outline?.operations ?? []).map(o => [o.id, o])), [outline]);
  const onCount = arr.requests.filter(r => r.on).length;
  const usedFolders = foldersInUse(arr);
  const total = outline?.operations.length ?? 0;

  const regroup = (by: GroupBy) => {
    if (!outline) return;
    setGroupBy(by);
    setArr(arrange(outline.operations, by, new Map(arr.requests.map(r => [r.opId, r.on]))));
  };

  // ── Variables ──
  const varRows = useMemo(() => {
    const rows: { key: string; secret: boolean; from: string }[] = [
      { key: 'baseUrl', secret: false, from: outline?.servers[0] ? `servers[0] ${outline.servers[0].url}` : 'the server you send to' },
    ];
    for (const s of outline?.schemes ?? []) for (const x of s.variables) rows.push({ key: x.key, secret: x.secret, from: s.label });
    return rows;
  }, [outline]);

  const setEnvValue = (id: string, key: string, value: string) =>
    setEnvs(list => list.map(e => (e.id === id ? { ...e, values: { ...e.values, [key]: value } } : e)));

  // ── Create ──
  const create = () => {
    if (!outline || creating) return;
    const rows = treeRows(arr, true);
    const plan = {
      collectionName,
      parentId: target.kind === 'existing' ? target.id : null,
      folders: usedFolders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId })),
      requests: rows.flatMap(r => (r.kind === 'request'
        ? [{ opId: r.request.opId, folderId: r.request.folderId, name: requestName(ops.get(r.request.opId)!, nameBy) }]
        : [])),
      pathVars: pathVars.map(p => ({ name: p.name, shared: p.shared, value: p.value })),
      environments: envs.map(e => ({ name: e.name, values: e.values })),
    };
    pending.current = reqId();
    whereRef.current = target.kind === 'existing' ? targetLabel(target, '') : '';
    setCreating(true);
    postMsg({ type: 'openapiUrl:import', reqId: pending.current, token, plan });
  };

  const canNext = step === 0 ? !!outline : step === 1 ? onCount > 0 : true;
  const next = () => {
    if (step < 3) setStep(step + 1);
    else create();
  };

  const footerText = done ? '' : [
    outline ? `${total} operations found · nothing is created until the last step` : 'Paste a spec URL, or the Swagger UI page in front of it',
    `${onCount} of ${total} requests · ${usedFolders.length} folders`,
    `${envs.length} environment${envs.length === 1 ? '' : 's'} · ${pathVars.filter(p => p.shared).length} shared path parameters`,
    `${target.kind === 'new' ? 'A new collection' : `A folder in ${targetLabel(target, '')}`} and ${envs.length} environment${envs.length === 1 ? '' : 's'}`,
  ][step];

  const stepper = (
    <WizardSteps steps={STEPS} current={step} reachable={outline ? 3 : 0} finished={!!done} onStep={setStep} />
  );

  return (
    <ModalView
      open
      onClose={onClose}
      size="xxl"
      maxHeight="88vh"
      noPadding
      className="dk-swi-modal"
      bodyStyle={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      headerColor="var(--color-success)"
      headerIcon={<span className="dk-swi-mark"><BracesIcon size={16} /></span>}
      title="Import from Swagger URL"
      subtitle="OpenAPI 3 or Swagger 2, JSON or YAML — or the Swagger UI page itself"
      headerRight={stepper}
      footerLeft={<span className="dk-swi-foot">{footerText}</span>}
      footerRight={done ? (
        <ButtonView variant="primary" size="sm" onClick={onClose}>Done</ButtonView>
      ) : (
        <div className="dk-swi-foot__btns">
          {step > 0 && <ButtonView variant="ghost" size="sm" onClick={() => setStep(step - 1)}>Back</ButtonView>}
          <ButtonView variant="primary" size="sm" onClick={next} disabled={!canNext || creating} loading={creating}>
            {step === 3 ? (target.kind === 'new' ? 'Create collection' : 'Import here') : `Next: ${STEPS[step + 1]}`}
          </ButtonView>
        </div>
      )}
    >
      <div className={`dk-swi${step === 0 || done ? ' dk-swi--fit' : ''}`}>
        {done ? (
          <div className="dk-swi-done">
            <span className="dk-swi-done__mark"><CheckIcon size={28} /></span>
            <h2>{done.name} is ready</h2>
            {done.where && <p className="dk-swi-muted">In {done.where}</p>}
            <p>{done.requests} requests in {done.folders} folders · {done.envs.length} environment{done.envs.length === 1 ? '' : 's'} ({done.envs.join(', ')}).</p>
            <p className="dk-swi-muted">Pick one of those environments, fill in its secrets, and send.</p>
          </div>
        ) : (
          <>
            {step === 0 && (
              <div className="dk-swi-pane dk-swi-source">
                <label className="dk-swi-label" htmlFor="dk-swi-url">Spec or docs URL</label>
                {/* Built like a request's URL bar: the same input and button, at the same size. */}
                <div className="dk-swi-urlrow">
                  <TextInputView
                    id="dk-swi-url"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') fetchSpec(); }}
                    placeholder="https://petstore3.swagger.io/api/v3/openapi.json"
                    iconLeft={<LinkIcon size={14} />}
                    size="lg"
                    width="fullWidth"
                    autoFocus
                    spellCheck={false}
                  />
                  <ButtonView
                    className="flex-shrink-0"
                    variant="primary"
                    size="lg"
                    iconLeft={<DownloadIcon size={13} />}
                    onClick={fetchSpec}
                    loading={fetching}
                    disabled={!url.trim()}
                  >
                    {outline ? 'Fetch again' : 'Fetch'}
                  </ButtonView>
                </div>

                <div className="dk-swi-hints">
                  {fetched && !fetching && (
                    <span className="dk-swi-ok"><CheckIcon size={12} />{fetched.status} · {kb(fetched.bytes)} · {fetched.ms} ms</span>
                  )}
                  {headers.length === 0 && (
                    <button type="button" className="dk-swi-link" onClick={() => setHeaders([{ id: crypto.randomUUID(), key: 'Authorization', value: '', enabled: true }])}>
                      Add a header for a private spec
                    </button>
                  )}
                  <span>Works with a Swagger UI, springdoc or ReDoc page too. https anywhere, http on this machine.</span>
                </div>
                {headers.length > 0 && (
                  <KeyValueTable
                    rows={headers}
                    onChange={setHeaders}
                    placeholder={{ key: 'Header', value: 'Value' }}
                    label="Headers for this fetch"
                    autocompleteKeys
                    maskSensitive
                    onClear={() => setHeaders([])}
                  />
                )}

                {error && <p className="dk-swi-error" role="alert">{error}</p>}
                {fetched?.foundFromUi && (
                  <p className="dk-swi-note"><InfoCircleIcon size={13} />That's a docs page. Daakia found the spec behind it at <code>{fetched.specUrl}</code>.</p>
                )}

                {outline && (
                  <div className="dk-swi-found">
                    <div className="dk-swi-found__main">
                      <span className="dk-swi-eyebrow">Found</span>
                      <h2>{outline.title}</h2>
                      <p className="dk-swi-muted">{[outline.version && `Version ${outline.version}`, outline.specVersion, outline.format].filter(Boolean).join(' · ')}</p>
                      <div className="dk-swi-stats">
                        <div><b>{total}</b><span>operations</span></div>
                        <div><b>{outline.tags.length}</b><span>tags</span></div>
                        <div><b>{outline.schemes.length}</b><span>auth schemes</span></div>
                        <div><b>{outline.schemaCount}</b><span>schemas</span></div>
                      </div>
                      <div className="dk-swi-tags">
                        {outline.tags.slice(0, 12).map(t => <span key={t.name} className="dk-swi-pill">{t.name} · {t.count}</span>)}
                        {outline.tags.length > 12 && <span className="dk-swi-pill">+{outline.tags.length - 12}</span>}
                      </div>
                    </div>
                    <div className="dk-swi-found__side">
                      <span className="dk-swi-eyebrow">What becomes what</span>
                      <dl className="dk-swi-kv">
                        {outline.servers.slice(0, 3).map(s => (
                          <div key={s.url}><dt>Server</dt><dd><code>{s.url || '/'}</code> → <span className="dk-swi-tok">{v('baseUrl')}</span></dd></div>
                        ))}
                        {outline.schemes.map(s => (
                          <div key={s.name}><dt>{s.name}</dt><dd>{s.label.split(' · ')[0]} → <span className="dk-swi-tok">{v(s.variables[0].key)}</span></dd></div>
                        ))}
                        {outline.pathParams.length > 0 && (
                          <div><dt>Path params</dt><dd><code>{outline.pathParams.map(p => p.name).join(', ')}</code></dd></div>
                        )}
                        <div><dt>Bodies</dt><dd>Built from each schema's examples</dd></div>
                      </dl>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 1 && outline && (
              <div className="dk-swi-organize">
                <div className="dk-swi-organize__main">
                  <div className="dk-swi-toolbar">
                    <span className="dk-swi-muted">Group by</span>
                    <SegmentedControlView size="sm" variant="rounded" value={groupBy} onChange={x => regroup(x as GroupBy)}
                      options={[{ value: 'tag', label: 'Tag' }, { value: 'path', label: 'Path' }, { value: 'flat', label: 'Flat' }]} />
                    <span className="dk-swi-muted">Name by</span>
                    <SegmentedControlView size="sm" variant="rounded" value={nameBy} onChange={x => setNameBy(x as NameBy)}
                      options={[{ value: 'summary', label: 'Summary' }, { value: 'operationId', label: 'operationId' }, { value: 'path', label: 'Method + path' }]} />
                    <span className="dk-swi-toolbar__end">
                      <IconButtonView size="md" icon={<FolderPlusIcon size={15} />} tooltip="New folder" onClick={() => setArr(a => addFolder(a, null).next)} />
                    </span>
                  </div>
                  <ArrangeTree
                    arr={arr}
                    setArr={setArr}
                    rootName={collectionName}
                    onRootName={setCollectionName}
                    total={total}
                    describe={r => {
                      const op = ops.get(r.opId)!;
                      return { method: op.method, text: `${requestName(op, nameBy)} ${op.path} ${op.operationId} ${op.summary ?? ''}` };
                    }}
                    renderRequest={r => {
                      const op = ops.get(r.opId)!;
                      return (
                        <>
                          <span className="dk-swi-method" style={{ color: METHOD_COLOR[op.method] }}>{op.method}</span>
                          <span className="dk-swi-name">{requestName(op, nameBy)}</span>
                          {op.deprecated && <span className="dk-swi-dep">deprecated</span>}
                          <code className="dk-swi-path">{op.path}</code>
                        </>
                      );
                    }}
                  />
                </div>
                <aside className="dk-swi-aside">
                  <span className="dk-swi-eyebrow">Arrange it your way</span>
                  <p>Drag a request by its handle onto a folder to move it, or onto another request to put it just above. Drag a folder onto a folder to nest it. Click a name to rename it.</p>
                  <div className="dk-swi-meter">
                    <div><b>{onCount}</b> of {total} requests</div>
                    <div><b>{usedFolders.length}</b> folders</div>
                    <span className="dk-swi-meter__bar"><span style={{ width: `${total ? Math.round((onCount / total) * 100) : 0}%` }} /></span>
                  </div>
                  <span className="dk-swi-eyebrow">Regrouping</span>
                  <p className="dk-swi-muted">Changing Group by starts the arrangement over. Which requests are ticked carries across.</p>
                </aside>
              </div>
            )}

            {step === 2 && outline && (
              <div className="dk-swi-pane dk-swi-vars">
                <section>
                  <div className="dk-swi-sechead">
                    <div>
                      <h3>Environments</h3>
                      <p className="dk-swi-muted">Every URL is written against these names, so one collection runs anywhere. Secrets are stored encrypted, and can be left empty for now.</p>
                    </div>
                    <ButtonView size="sm" variant="secondary" iconLeft={<PlusIcon size={12} />} disabled={envs.length >= 4}
                      onClick={() => setEnvs(list => [...list, { id: `e${Date.now()}`, name: list.some(e => e.name === 'Local') ? 'Staging' : 'Local', fromSpec: false, values: { baseUrl: '' } }])}>
                      Environment
                    </ButtonView>
                  </div>
                  <div className="dk-swi-table" style={{ ['--cols' as string]: envs.length }}>
                    <div className="dk-swi-table__row dk-swi-table__head">
                      <span className="dk-swi-eyebrow">Variable</span>
                      {envs.map((e, i) => (
                        <div key={e.id} className="dk-swi-envhead">
                          <span className="dk-swi-dot" style={{ background: ENV_COLORS[i % ENV_COLORS.length] }} />
                          <input className="dk-swi-fname" value={e.name} aria-label="Environment name" onChange={ev => setEnvs(list => list.map(x => (x.id === e.id ? { ...x, name: ev.target.value } : x)))} />
                          {e.fromSpec && <span className="dk-swi-muted dk-swi-small">from spec</span>}
                          {envs.length > 1 && <IconButtonView size="sm" icon={<CloseIcon size={11} />} tooltip="Remove environment" onClick={() => setEnvs(list => list.filter(x => x.id !== e.id))} />}
                        </div>
                      ))}
                    </div>
                    {varRows.map(row => (
                      <div key={row.key} className="dk-swi-table__row">
                        <div className="dk-swi-varname">
                          <span><span className="dk-swi-tok">{v(row.key)}</span>{row.secret && <span className="dk-swi-secret">secret</span>}</span>
                          <code className="dk-swi-small dk-swi-muted">{row.from}</code>
                        </div>
                        {envs.map(e => (
                          <input
                            key={e.id}
                            className="dk-swi-input"
                            type={row.secret ? 'password' : 'text'}
                            value={e.values[row.key] ?? ''}
                            placeholder={row.secret ? 'set later' : row.key === 'baseUrl' ? 'https://…' : ''}
                            aria-label={`${e.name} ${row.key}`}
                            onChange={ev => setEnvValue(e.id, row.key, ev.target.value)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </section>

                <div className="dk-swi-cols">
                  <section>
                    <h3>Path parameters</h3>
                    <p className="dk-swi-muted">On: one collection variable every request shares. Off: each request keeps the spec's example in its URL.</p>
                    {pathVars.length === 0 ? <p className="dk-swi-muted">This spec has none.</p> : (
                      <div className="dk-swi-card">
                        {pathVars.map(p => (
                          <div key={p.name} className="dk-swi-pv">
                            <ToggleSwitchView size="sm" checked={p.shared} onChange={shared => setPathVars(list => list.map(x => (x.name === p.name ? { ...x, shared } : x)))} />
                            <div className="dk-swi-pv__name">
                              <code className={p.shared ? 'dk-swi-tok' : ''}>{p.shared ? v(p.name) : `{${p.name}}`}</code>
                              <span className="dk-swi-small dk-swi-muted">{p.type} · in {p.used} request{p.used === 1 ? '' : 's'}</span>
                            </div>
                            <input className="dk-swi-input" value={p.value} placeholder={p.shared ? 'value' : ''} disabled={!p.shared} aria-label={`${p.name} value`}
                              onChange={e => setPathVars(list => list.map(x => (x.name === p.name ? { ...x, value: e.target.value } : x)))} />
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                  <section>
                    <h3>Auth</h3>
                    <p className="dk-swi-muted">The scheme most requests use goes on the collection and every folder inherits it. A request that needs another one carries it.</p>
                    {outline.schemes.length === 0 && <p className="dk-swi-muted">The spec declares no security schemes.</p>}
                    {outline.schemes.map(s => (
                      <div key={s.name} className="dk-swi-card dk-swi-auth">
                        <span className="dk-swi-auth__icon">{s.kind === 'oauth2' ? <LockIcon size={14} /> : <KeyIcon size={14} />}</span>
                        <div>
                          <b>{s.label}</b>
                          {s.detail && <code className="dk-swi-small">{s.detail}</code>}
                          <span className="dk-swi-small dk-swi-muted">
                            Reads {s.variables.map(x => v(x.key)).join(', ')} · on {s.operationCount} request{s.operationCount === 1 ? '' : 's'}
                            {s.scopes?.length ? ` · scopes ${s.scopes.join(' ')}` : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </section>
                </div>
              </div>
            )}

            {step === 3 && outline && (
              <div className="dk-swi-pane dk-swi-save">
                <section>
                  <DestinationPicker
                    target={target}
                    onTarget={setTarget}
                    newName={collectionName}
                    onNewName={setCollectionName}
                    existingHint={<>It arrives there as a folder named <b>{collectionName || outline.title}</b>, carrying the auth and variables a collection would. Folders inherit them.</>}
                  />
                </section>
                <section>
                  <span className="dk-swi-eyebrow">Ready to create</span>
                  <div className="dk-swi-dest">
                    <FolderIcon size={15} className="dk-swi-folder" />
                    {target.kind === 'existing' && <span className="dk-swi-muted">{targetLabel(target, '')} /</span>}
                    <b>{collectionName || outline.title}</b>
                  </div>
                  <dl className="dk-swi-kv dk-swi-card" style={{ padding: 16 }}>
                    <div><dt>Requests</dt><dd>{onCount} of {total}, in {usedFolders.length} folders</dd></div>
                    <div><dt>Environments</dt><dd>{envs.map(e => e.name || 'Untitled').join(', ')}</dd></div>
                    <div><dt>Variables</dt><dd>{varRows.map(r => r.key).join(', ')}</dd></div>
                    <div>
                      <dt>Shared params</dt>
                      <dd>
                        {pathVars.filter(p => p.shared).map(p => p.name).join(', ') || 'none'}
                        {pathVars.some(p => p.shared && !p.value.trim()) && (
                          <span className="dk-swi-warn"> · no value yet for {pathVars.filter(p => p.shared && !p.value.trim()).map(p => p.name).join(', ')} — requests using it send {'{{'}name{'}}'} until you set one</span>
                        )}
                      </dd>
                    </div>
                    <div><dt>Auth</dt><dd>{outline.schemes.map(s => s.label.split(' · ')[0]).join(', ') || 'none'}</dd></div>
                    <div><dt>Bodies</dt><dd>JSON from each schema's examples</dd></div>
                  </dl>
                  <span className="dk-swi-eyebrow">In the sidebar</span>
                  <div className="dk-swi-card dk-swi-preview">
                    {treeRows(arr, true).slice(0, 18).map(row => (row.kind === 'folder' ? (
                      <div key={`f${row.folder.id}`} style={{ paddingLeft: 8 + row.depth * 16 }} className="dk-swi-prow">
                        <FolderIcon size={13} className="dk-swi-folder" /><b>{row.folder.name}</b><span className="dk-swi-count">{row.on}</span>
                      </div>
                    ) : (
                      <div key={`r${row.request.opId}`} style={{ paddingLeft: 12 + row.depth * 16 }} className="dk-swi-prow">
                        <span className="dk-swi-method" style={{ color: METHOD_COLOR[ops.get(row.request.opId)!.method] }}>{ops.get(row.request.opId)!.method}</span>
                        <span className="dk-swi-name">{requestName(ops.get(row.request.opId)!, nameBy)}</span>
                      </div>
                    )))}
                    {treeRows(arr, true).length > 18 && <span className="dk-swi-muted dk-swi-small">+ {treeRows(arr, true).length - 18} more</span>}
                  </div>
                </section>
              </div>
            )}
          </>
        )}
      </div>
    </ModalView>
  );
}
