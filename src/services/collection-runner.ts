/**
 * Collection Runner — Executes all requests in a collection sequentially.
 *
 * Supports:
 *   - Sandwich flow: col-pre → folder-pre → req-pre → [request] → req-post → folder-post → col-post
 *   - Sequential flow: col-pre → folder-pre → req-pre → [request] → col-post → folder-post → req-post
 *   - dk.runner.setNextRequest(name) — jump to a specific request or stop (null)
 *   - dk.runRequest(name) — execute another request inline from within a script
 *   - Variable propagation across requests in the run
 *   - Test result aggregation
 */
import { executeRequest, type ExecuteRequestParams, type ExecuteResult } from '../http/request-executor';
import { runScript, type ScriptContext, type TestResult } from './script-runtime';
import {
  getCollectionTree, getCollectionData,
  getAllEnvironments, getSetting, type CollectionTreeNode, type CollectionRequestRow,
} from '../storage/db';

// ────────── Types ──────────

export type ScriptFlow = 'sandwich' | 'sequential';

export interface RunConfig {
  collectionId: string;
  environmentId?: string;
  flow?: ScriptFlow;
  delay: number;
  stopOnError: boolean;
}

export interface RequestResult {
  id: string;
  name: string;
  method: string;
  url: string;
  status: number;
  statusText: string;
  time: number;
  size: number;
  passed: boolean;
  testResults: TestResult[];
  scriptLogs: string[];
  scriptErrors: string[];
  error?: string;
  skipped?: boolean;
}

export interface RunResult {
  collectionId: string;
  collectionName: string;
  flow: ScriptFlow;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: RequestResult[];
  duration: number;
}

type ProgressCallback = (result: RequestResult, index: number, total: number) => void;

// ────────── Internal Types ──────────

interface FlatRequest {
  request: CollectionRequestRow;
  /** Chain of folder IDs from collection root → immediate parent */
  folderPath: string[];
}

interface FolderScripts {
  preRequestScript: string;
  postResponseScript: string;
}

// ────────── Helpers ──────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function findNodeById(trees: CollectionTreeNode[], id: string): CollectionTreeNode | undefined {
  for (const tree of trees) {
    if (tree.id === id) return tree;
    const found = findNodeById(tree.children, id);
    if (found) return found;
  }
  return undefined;
}

/** Flatten a collection tree into ordered requests with folder ancestry. */
function flattenTree(node: CollectionTreeNode, parentPath: string[] = []): FlatRequest[] {
  const result: FlatRequest[] = [];
  const currentPath = [...parentPath, node.id];
  for (const req of node.requests) {
    result.push({ request: req, folderPath: currentPath });
  }
  for (const child of node.children) {
    result.push(...flattenTree(child, currentPath));
  }
  return result;
}

function loadFolderScripts(folderId: string): FolderScripts {
  try {
    const props = JSON.parse(getCollectionData(folderId)) as { preRequestScript?: string; postResponseScript?: string; testScript?: string };
    return {
      preRequestScript: props.preRequestScript || '',
      postResponseScript: props.postResponseScript || props.testScript || '',
    };
  } catch {
    return { preRequestScript: '', postResponseScript: '' };
  }
}

function loadEnvironmentVars(envId: string | undefined): Record<string, string> {
  if (!envId) return {};
  const allEnvs = getAllEnvironments();
  const env = allEnvs.find(e => e.id === envId);
  if (!env) return {};
  try {
    const vars = JSON.parse(env.variables) as { key: string; currentValue: string }[];
    const result: Record<string, string> = {};
    for (const v of vars) { if (v.key) result[v.key] = v.currentValue || ''; }
    return result;
  } catch { return {}; }
}

function loadGlobalVars(): Record<string, string> {
  return getSetting<Record<string, string>>('dk_globals') ?? {};
}

function loadCollectionVars(collectionId: string): Record<string, string> {
  try {
    const props = JSON.parse(getCollectionData(collectionId)) as { variables?: { key: string; value: string; enabled: boolean }[] };
    const vars: Record<string, string> = {};
    if (props.variables) {
      for (const v of props.variables) { if (v.enabled && v.key) vars[v.key] = v.value; }
    }
    return vars;
  } catch { return {}; }
}

/** Resolve {{var}} placeholders */
function resolveVariables(str: string, env: Record<string, string>, col: Record<string, string>, globals: Record<string, string>): string {
  return str.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (_, key: string) => {
    if (key in env) return env[key];
    if (key in col) return col[key];
    if (key in globals) return globals[key];
    return `{{${key}}}`;
  });
}

/** Extract setNextRequest calls from script logs (uses a special marker). */
function extractSetNextRequest(logs: string[]): string | null | undefined {
  for (let i = logs.length - 1; i >= 0; i--) {
    if (logs[i].startsWith('__DK_SET_NEXT_REQUEST__:')) {
      const target = logs[i].substring('__DK_SET_NEXT_REQUEST__:'.length);
      logs.splice(i, 1); // remove from visible logs
      if (target === '__NULL__') return null;
      return target;
    }
  }
  return undefined;
}

/**
 * Build a preamble script that injects dk.runner and dk.runRequest into the sandbox.
 */
function buildPreamble(flatRequests: FlatRequest[]): string {
  const requestIndex = flatRequests.map(fr => ({
    name: fr.request.name,
    method: fr.request.method,
    url: fr.request.url,
    data: fr.request.data || '{}',
  }));
  return `
if (!dk.runner) {
  dk.runner = {
    setNextRequest: function(name) {
      console.log("__DK_SET_NEXT_REQUEST__:" + (name === null ? "__NULL__" : name));
    },
    skipRequest: function() {
      console.log("__DK_SET_NEXT_REQUEST__:__NULL__");
    },
  };
}
if (!dk.runRequest) {
  dk.runRequest = async function(nameOrPath) {
    var __requests = ${JSON.stringify(requestIndex)};
    var __found = __requests.find(function(r) { return r.name === nameOrPath; });
    if (!__found) {
      console.error("dk.runRequest: not found: " + nameOrPath);
      return { status: 0, statusText: "Not found", headers: {}, body: "", json: function() { return null; } };
    }
    var __data = JSON.parse(__found.data);
    var __headers = {};
    if (__data.headers) {
      for (var __i = 0; __i < __data.headers.length; __i++) {
        var __h = __data.headers[__i];
        if (__h.key) __headers[__h.key] = __h.value;
      }
    }
    return dk.sendRequest({
      method: __found.method || "GET",
      url: __found.url,
      headers: __headers,
      body: __data.bodyRaw || "",
    });
  };
}
`;
}

// ────────── Runner Core ──────────

export async function runCollection(
  config: RunConfig,
  onProgress?: ProgressCallback,
  abortSignal?: { aborted: boolean },
): Promise<RunResult> {
  const { collectionId, environmentId, flow = 'sandwich', delay, stopOnError } = config;
  const startTime = Date.now();

  // Load collection tree and find target
  const tree = getCollectionTree();
  const collectionNode = findNodeById(tree, collectionId);
  if (!collectionNode) {
    return { collectionId, collectionName: '', flow, total: 0, passed: 0, failed: 0, skipped: 0, totalTests: 0, passedTests: 0, failedTests: 0, results: [], duration: 0 };
  }

  // Flatten into ordered request list
  const flatRequests = flattenTree(collectionNode);
  const results: RequestResult[] = [];

  // Shared variable state across the entire run
  let envVars = loadEnvironmentVars(environmentId);
  let colVars = loadCollectionVars(collectionId);
  let globalVars = loadGlobalVars();

  // Collection-level scripts
  const collectionScripts = loadFolderScripts(collectionId);

  // Build request name → index lookup for setNextRequest
  const requestByName = new Map<string, number>();
  for (let idx = 0; idx < flatRequests.length; idx++) {
    requestByName.set(flatRequests[idx].request.name, idx);
  }

  // Build preamble once (for dk.runner and dk.runRequest)
  const preamble = buildPreamble(flatRequests);

  let nextRequestTarget: string | null | undefined = undefined;
  let i = 0;

  while (i < flatRequests.length) {
    if (abortSignal?.aborted) break;

    const { request, folderPath } = flatRequests[i];
    const scriptLogs: string[] = [];
    const scriptErrors: string[] = [];
    let allTestResults: TestResult[] = [];

    // Parse request data
    let reqData: Record<string, unknown> = {};
    try { reqData = request.data ? JSON.parse(request.data) : {}; } catch { /* */ }

    const reqPreScript = (reqData.preRequestScript as string) || '';
    const reqPostScript = (reqData.postResponseScript as string) || '';

    // Load folder scripts (folders between collection root and this request)
    const folderScriptsList: FolderScripts[] = [];
    for (const folderId of folderPath) {
      if (folderId !== collectionId) {
        folderScriptsList.push(loadFolderScripts(folderId));
      }
    }

    // ── Build pre-scripts list (both flows use same order for pre) ──
    const preScripts: string[] = [];
    if (collectionScripts.preRequestScript) preScripts.push(collectionScripts.preRequestScript);
    for (const fs of folderScriptsList) {
      if (fs.preRequestScript) preScripts.push(fs.preRequestScript);
    }
    if (reqPreScript) preScripts.push(reqPreScript);

    // ── Script context ──
    const headersObj: Record<string, string> = {};
    for (const h of ((reqData.headers as { key: string; value: string; enabled?: boolean }[]) || [])) {
      if (h.key && h.enabled !== false) headersObj[h.key] = h.value;
    }

    let scriptCtx: ScriptContext = {
      request: { method: request.method, url: request.url, headers: headersObj, body: (reqData.bodyRaw as string) || '' },
      environmentVariables: { ...envVars },
      collectionVariables: { ...colVars },
      globalVariables: { ...globalVars },
    };

    // ── Run pre-scripts ──
    let preScriptFailed = false;
    for (const script of preScripts) {
      const full = preamble + script;
      const result = await runScript(full, scriptCtx);
      scriptLogs.push(...result.logs);
      scriptErrors.push(...result.errors);
      if (!result.success) { preScriptFailed = true; break; }
      scriptCtx.environmentVariables = result.updatedEnvironmentVars;
      scriptCtx.collectionVariables = result.updatedCollectionVars;
      scriptCtx.globalVariables = result.updatedGlobalVars;
      scriptCtx.secretVariables = result.updatedSecretVars;
      const next = extractSetNextRequest(scriptLogs);
      if (next !== undefined) nextRequestTarget = next;
    }

    // Propagate vars from pre-scripts
    envVars = { ...scriptCtx.environmentVariables };
    colVars = { ...scriptCtx.collectionVariables };
    globalVars = { ...scriptCtx.globalVariables };

    if (preScriptFailed) {
      const reqResult: RequestResult = {
        id: request.id, name: request.name, method: request.method, url: request.url,
        status: 0, statusText: 'Pre-script failed', time: 0, size: 0, passed: false,
        testResults: [], scriptLogs, scriptErrors, error: scriptErrors.join('; '),
      };
      results.push(reqResult);
      onProgress?.(reqResult, i, flatRequests.length);
      if (stopOnError) break;
      i = advanceIndex(i, nextRequestTarget, requestByName);
      nextRequestTarget = undefined;
      continue;
    }

    // ── Execute HTTP request ──
    let execResult: ExecuteResult;
    const resolvedUrl = resolveVariables(request.url, envVars, colVars, globalVars);
    try {
      const params: ExecuteRequestParams = {
        tabId: `runner-${request.id}`,
        method: request.method || 'GET',
        url: resolvedUrl,
        headers: ((reqData.headers as { key: string; value: string; enabled?: boolean }[]) || [])
          .filter((h: { key: string; enabled?: boolean }) => h.key && h.enabled !== false)
          .map((h: { key: string; value: string }) => ({ key: h.key, value: resolveVariables(h.value, envVars, colVars, globalVars) })),
        params: ((reqData.params as { key: string; value: string; enabled?: boolean }[]) || [])
          .filter((p: { key: string; enabled?: boolean }) => p.key && p.enabled !== false)
          .map((p: { key: string; value: string }) => ({ key: p.key, value: resolveVariables(p.value, envVars, colVars, globalVars) })),
        bodyMode: (reqData.bodyMode as string) || 'none',
        bodyRaw: resolveVariables((reqData.bodyRaw as string) || '', envVars, colVars, globalVars),
        bodyFormData: ((reqData.bodyFormData as { key: string; value: string; enabled?: boolean }[]) || []).filter((f: { key: string; enabled?: boolean }) => f.key && f.enabled !== false),
        bodyUrlEncoded: ((reqData.bodyUrlEncoded as { key: string; value: string; enabled?: boolean }[]) || []).filter((u: { key: string; enabled?: boolean }) => u.key && u.enabled !== false),
        authType: (reqData.authType as string) || 'none',
        authData: (reqData.authData as Record<string, string>) || {},
        timeout: 30000,
        followRedirects: true,
        sslVerification: true,
      };
      execResult = await executeRequest(params);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const reqResult: RequestResult = {
        id: request.id, name: request.name, method: request.method, url: resolvedUrl,
        status: 0, statusText: 'Request Error', time: 0, size: 0, passed: false,
        testResults: [], scriptLogs, scriptErrors, error: msg,
      };
      results.push(reqResult);
      onProgress?.(reqResult, i, flatRequests.length);
      if (stopOnError) break;
      i = advanceIndex(i, nextRequestTarget, requestByName);
      nextRequestTarget = undefined;
      continue;
    }

    // ── Build post-scripts list based on flow ──
    const postScripts: string[] = [];
    if (flow === 'sandwich') {
      // Sandwich: request-post → folder-post (reverse) → collection-post
      if (reqPostScript) postScripts.push(reqPostScript);
      for (let fi = folderScriptsList.length - 1; fi >= 0; fi--) {
        if (folderScriptsList[fi].postResponseScript) postScripts.push(folderScriptsList[fi].postResponseScript);
      }
      if (collectionScripts.postResponseScript) postScripts.push(collectionScripts.postResponseScript);
    } else {
      // Sequential: collection-post → folder-post → request-post
      if (collectionScripts.postResponseScript) postScripts.push(collectionScripts.postResponseScript);
      for (const fs of folderScriptsList) {
        if (fs.postResponseScript) postScripts.push(fs.postResponseScript);
      }
      if (reqPostScript) postScripts.push(reqPostScript);
    }

    // ── Run post-scripts ──
    scriptCtx = {
      ...scriptCtx,
      response: {
        status: execResult.response.status,
        statusText: execResult.response.statusText,
        headers: execResult.response.headers,
        body: execResult.response.body,
        time: execResult.response.time,
        size: execResult.response.size,
      },
      environmentVariables: { ...envVars },
      collectionVariables: { ...colVars },
      globalVariables: { ...globalVars },
    };

    for (const script of postScripts) {
      const full = preamble + script;
      const result = await runScript(full, scriptCtx);
      scriptLogs.push(...result.logs);
      scriptErrors.push(...result.errors);
      allTestResults.push(...result.testResults);
      scriptCtx.environmentVariables = result.updatedEnvironmentVars;
      scriptCtx.collectionVariables = result.updatedCollectionVars;
      scriptCtx.globalVariables = result.updatedGlobalVars;
      scriptCtx.secretVariables = result.updatedSecretVars;
      const next = extractSetNextRequest(scriptLogs);
      if (next !== undefined) nextRequestTarget = next;
    }

    // Propagate vars from post-scripts
    envVars = { ...scriptCtx.environmentVariables };
    colVars = { ...scriptCtx.collectionVariables };
    globalVars = { ...scriptCtx.globalVariables };

    // ── Record result ──
    const allTestsPassed = allTestResults.length === 0 || allTestResults.every(t => t.passed);
    const reqResult: RequestResult = {
      id: request.id,
      name: request.name,
      method: request.method,
      url: resolvedUrl,
      status: execResult.response.status,
      statusText: execResult.response.statusText,
      time: execResult.response.time,
      size: execResult.response.size,
      passed: execResult.response.status < 400 && allTestsPassed,
      testResults: allTestResults,
      scriptLogs,
      scriptErrors,
    };
    results.push(reqResult);
    onProgress?.(reqResult, i, flatRequests.length);

    if (!reqResult.passed && stopOnError) break;

    // ── Advance ──
    i = advanceIndex(i, nextRequestTarget, requestByName);
    nextRequestTarget = undefined;

    // Delay between requests
    if (delay > 0 && i < flatRequests.length) {
      await sleep(delay);
    }
  }

  // ── Summary ──
  const allTests = results.flatMap(r => r.testResults);
  return {
    collectionId,
    collectionName: collectionNode.name,
    flow,
    total: flatRequests.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed && !r.skipped).length,
    skipped: results.filter(r => r.skipped).length,
    totalTests: allTests.length,
    passedTests: allTests.filter(t => t.passed).length,
    failedTests: allTests.filter(t => !t.passed).length,
    results,
    duration: Date.now() - startTime,
  };
}

/** Determine next index: if setNextRequest was called, jump; otherwise i+1 */
function advanceIndex(current: number, target: string | null | undefined, lookup: Map<string, number>): number {
  if (target === null) return Infinity; // stop
  if (target !== undefined) {
    const idx = lookup.get(target);
    if (idx !== undefined) return idx;
  }
  return current + 1;
}
