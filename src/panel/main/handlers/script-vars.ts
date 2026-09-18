/**
 * The variables a script reads, and where its changes are written back.
 *
 * ── Why this is a module and not four copies ──
 *
 * Every protocol that runs a script needs the same four things: the active
 * environment's variables, the collection's, the globals, and a way to write
 * back whatever the script changed. REST grew its own set, GraphQL grew a
 * near-identical set beside it, and when SOAP and gRPC needed them the honest
 * options were a third and fourth copy or a module.
 *
 * They lived in the GraphQL handler for a while, exported, which worked and
 * read as an accident — a SOAP request reaching into a GraphQL file for its
 * environment. This is where they belong.
 *
 * ── On secrets ──
 *
 * `loadEnvVars` decrypts on the way out, because a script asking for a token
 * wants the token. What is written back is re-encrypted by `encryptEnvVariables`
 * before it touches the database, so a value a script sets is stored the same
 * way one typed into the Environments screen is.
 */
import {
  getSetting, setSetting, getAllEnvironments, upsertEnvironment,
  getCollectionData, updateCollectionData,
} from '../../../storage/db';
import { decryptIfNeeded, decryptEnvVariables, encryptEnvVariables } from '../../../services/vault';

/**
 * The environment's own variables, as a layer of their own.
 *
 * Not `env-resolver`'s `loadEnvVars`, which flattens dk_globals, the Global
 * environment and the active one into a single map for `{{var}}` substitution.
 * A script context needs them kept apart: `dk.env` and `dk.globals` are two
 * different things to write to, and flattening them would make a script that
 * sets one appear to have set both.
 */
export function loadScriptEnvVars(envId: string | undefined): Record<string, string> {
  const rows = getAllEnvironments();
  const vars: Record<string, string> = {};
  const globalRow = rows.find(r => r.name === 'Global' || r.id === 'global');
  if (globalRow) {
    const gVars = JSON.parse(globalRow.variables || '[]') as { key: string; currentValue?: string; initialValue?: string }[];
    for (const v of gVars) if (v.key) vars[v.key] = decryptIfNeeded(v.currentValue ?? v.initialValue ?? '');
  }
  const activeRow = envId ? rows.find(r => r.id === envId) : rows.find(r => r.is_active === 1);
  if (activeRow && activeRow !== globalRow) {
    const aVars = JSON.parse(activeRow.variables || '[]') as { key: string; currentValue?: string; initialValue?: string }[];
    for (const v of aVars) if (v.key) vars[v.key] = decryptIfNeeded(v.currentValue ?? v.initialValue ?? '');
  }
  return vars;
}

export function loadCollectionVars(collectionId: string | undefined): Record<string, string> {
  if (!collectionId) return {};
  const data = getCollectionData(collectionId);
  const props = JSON.parse(data) as { variables?: { key: string; value: string; enabled: boolean }[] };
  const vars: Record<string, string> = {};
  if (props.variables) for (const v of props.variables) if (v.enabled && v.key) vars[v.key] = v.value;
  return vars;
}

export function loadGlobalVars(): Record<string, string> {
  return getSetting<Record<string, string>>('dk_globals') ?? {};
}

/**
 * Write a script's variable changes back to where they came from.
 *
 * Only what actually changed: each of the three sets is compared against what
 * the script was handed, so a script that reads a variable and writes nothing
 * does not rewrite the environment row and does not make the webview redraw
 * its environment list.
 */
export function persistScriptVars(
  envId: string | undefined,
  collectionId: string | undefined,
  updatedEnv: Record<string, string>,
  updatedCol: Record<string, string>,
  updatedGlobal: Record<string, string>,
  originalEnv: Record<string, string>,
  originalCol: Record<string, string>,
  originalGlobal: Record<string, string>,
  postMessage: (msg: unknown) => void,
  /*
    How the webview is told the environments moved.

    REST hands in its own refresher, which rebuilds the list the same way the
    Environments screen does. The others have no such callback and get the
    broadcast below. One behaviour either way — the difference is only which
    code owns the redraw, and it was the last thing keeping REST on a private
    copy of this function.
  */
  refreshEnvironments?: () => void,
): void {
  if (JSON.stringify(updatedEnv) !== JSON.stringify(originalEnv)) {
    const rows = getAllEnvironments();
    const activeRow = envId ? rows.find(r => r.id === envId) : rows.find(r => r.is_active === 1);
    if (activeRow) {
      const existing = JSON.parse(activeRow.variables || '[]') as { id: string; key: string; initialValue: string; currentValue: string; isSecret: boolean }[];
      for (const [key, value] of Object.entries(updatedEnv)) {
        const found = existing.find(v => v.key === key);
        if (found) found.currentValue = value;
        else existing.push({ id: crypto.randomUUID(), key, initialValue: '', currentValue: value, isSecret: false });
      }
      upsertEnvironment({ id: activeRow.id, name: activeRow.name, variables: JSON.stringify(encryptEnvVariables(existing)), is_active: activeRow.is_active });
      if (refreshEnvironments) refreshEnvironments();
      else postMessage({ type: 'environmentsData', environments: getDecryptedEnvironments() });
    }
  }
  if (JSON.stringify(updatedCol) !== JSON.stringify(originalCol) && collectionId) {
    const data = getCollectionData(collectionId);
    const props = JSON.parse(data) as { variables?: { key: string; value: string; enabled: boolean }[]; [k: string]: unknown };
    const existingVars = props.variables || [];
    for (const [key, value] of Object.entries(updatedCol)) {
      const found = existingVars.find(v => v.key === key);
      if (found) found.value = value;
      else existingVars.push({ key, value, enabled: true });
    }
    props.variables = existingVars;
    updateCollectionData(collectionId, JSON.stringify(props));
    postMessage({ type: 'collectionPropertiesData', id: collectionId, properties: props });
  }
  if (JSON.stringify(updatedGlobal) !== JSON.stringify(originalGlobal)) {
    setSetting('dk_globals', updatedGlobal);
    const rows = getAllEnvironments();
    const globalRow = rows.find(r => r.name === 'Global' || r.id === 'global');
    if (globalRow) {
      const existing = JSON.parse(globalRow.variables || '[]') as { id: string; key: string; initialValue: string; currentValue: string; isSecret: boolean }[];
      for (const [key, value] of Object.entries(updatedGlobal)) {
        const found = existing.find(v => v.key === key);
        if (found) found.currentValue = value;
        else existing.push({ id: crypto.randomUUID(), key, initialValue: '', currentValue: value, isSecret: false });
      }
      upsertEnvironment({ id: globalRow.id, name: globalRow.name, variables: JSON.stringify(encryptEnvVariables(existing)), is_active: globalRow.is_active });
      if (refreshEnvironments) refreshEnvironments();
      else postMessage({ type: 'environmentsData', environments: getDecryptedEnvironments() });
    }
  }
}

/** Same shape `handleGetEnvironments` sends the webview — decrypts every `isSecret` variable
 * before the array leaves the extension host. Used by the raw `environmentsData` re-broadcasts
 * in `persistScriptVars`, which write straight to the DB and can't just call
 * `handleGetEnvironments` (different module, would create a circular import). */
function getDecryptedEnvironments() {
  return getAllEnvironments().map(r => ({
    id: r.id,
    name: r.name,
    variables: decryptEnvVariables(JSON.parse(r.variables || '[]') as { initialValue?: string; currentValue?: string }[]),
  }));
}
