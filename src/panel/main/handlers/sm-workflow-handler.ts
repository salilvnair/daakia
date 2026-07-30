/**
 * sm-workflow-handler — persists @salilvnair/state-machine workflows to SQLite.
 *
 * Storage: daakia.db  kv table, collections:
 *   sm_machine  — one row per workflow (SMachine)
 *   sm_folder   — one row per folder (SMachineFolder)
 *   sm_todo     — one row per todo (SMTodoItem)
 *
 * Protocol (webview → extension host):
 *   smWorkflow:getAll       → responds with smWorkflow:init
 *   smWorkflow:save         → upsert a machine
 *   smWorkflow:delete       → remove a machine by id
 *   smWorkflow:saveFolder   → upsert a folder
 *   smWorkflow:deleteFolder → remove a folder by id
 *   smWorkflow:saveTodos    → overwrite the todos list
 */
import { upsert, remove, findAll } from '../../../storage/db';

type PostMessage = (msg: unknown) => void;

const COL_MACHINE = 'sm_machine';
const COL_FOLDER  = 'sm_folder';
const COL_TODO    = 'sm_todo';

/** No-op: kept for call-site compatibility. SQLite init is handled by initDb. */
export function initSmWorkflowStorage() {
  // SQLite is already initialised by initDb() in MainPanel before this is called.
}

export function handleSmWorkflowGetAll(postMessage: PostMessage) {
  const machines = findAll<Record<string, unknown>>(COL_MACHINE);
  const folders  = findAll<Record<string, unknown>>(COL_FOLDER);
  // Todos are stored as a single blob under '__todos__'; unwrap the items array.
  const todosBlob = findAll<{ items?: unknown[] }>(COL_TODO);
  const todos = todosBlob.find(b => Array.isArray(b.items))?.items ?? [];
  postMessage({ type: 'smWorkflow:init', machines, folders, todos });
}

export function handleSmWorkflowSave(msg: Record<string, unknown>) {
  const machine = msg.machine as Record<string, unknown>;
  if (!machine?.id) return;
  upsert(COL_MACHINE, machine.id as string, machine);
}

export function handleSmWorkflowDelete(msg: Record<string, unknown>) {
  const id = msg.id as string;
  if (!id) return;
  remove(COL_MACHINE, id);
}

export function handleSmWorkflowSaveFolder(msg: Record<string, unknown>) {
  const folder = msg.folder as Record<string, unknown>;
  if (!folder?.id) return;
  upsert(COL_FOLDER, folder.id as string, folder);
}

export function handleSmWorkflowDeleteFolder(msg: Record<string, unknown>) {
  const id = msg.id as string;
  if (!id) return;
  remove(COL_FOLDER, id);
}

export function handleSmWorkflowSaveTodos(msg: Record<string, unknown>) {
  const todos = msg.todos as Array<Record<string, unknown>>;
  if (!Array.isArray(todos)) return;
  // Todos don't have stable ids — store as a single JSON blob under key '__todos__'
  upsert(COL_TODO, '__todos__', { items: todos });
}
