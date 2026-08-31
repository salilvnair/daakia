/**
 * router.ts — routes webview postMessage-shaped messages to the REAL
 * extension-host handler functions (src/panel/main/handlers/*), the same
 * functions MainPanel._handleMessage dispatches to inside the real VS Code
 * extension. This is intentionally a parallel router, not a copy of
 * MainPanel's switch — MainPanel itself stays untouched and is still the
 * source of truth for the real extension's message contract.
 *
 * Scope (see local-server/README.md for what's NOT wired yet): request
 * execution (REST/GraphQL/gRPC/SOAP), realtime clients (WebSocket/SSE/
 * Socket.IO/MQTT), mock servers (all protocols), SM workflows, environments,
 * collections, history, UI state — enough to fully exercise mock-server +
 * every protocol client end-to-end against real SQLite + real mock servers.
 * AI/MCP/git-sync message types are not wired yet and hit the default case
 * (logged, not a crash) — add handlers here the same way as the mock-server
 * block below when needed.
 */
import {
  getSqliteStatus, getDbPath, getHistory, clearHistory, deleteHistoryById, getSetting, setSetting, getCookies,
  getAllPrompts, upsertPrompt, resetPrompt,
  getAuditEntries, deleteAuditEntry, deleteAuditEntries, clearAuditEntries,
  getUiAuditEntries, clearUiAuditEntries, insertUiAudit,
  getDbTables, getDbTableRows, deleteDbRow,
} from '../src/storage/db';
import { handleExecuteRequest, handleGetOAuth2Token, handleGetEffectiveSettings } from '../src/panel/main/handlers/request-handler';
import {
  handleHeapOpen, handleHeapQuery, handleHeapSetBaseline, handleHeapCancel,
  handleHeapLocateClass, handleHeapOpenSource,
} from '../src/panel/main/handlers/heap-handler';
import { cancelRestRequest } from '../src/http/request-executor';
import {
  handleExecuteGraphQL, handleGraphQLConnect, handleGraphQLSubscribe, handleGraphQLUnsubscribe, cancelGraphQLRequest,
} from '../src/panel/main/handlers/graphql-handler';
import {
  handleGrpcInvoke, handleGrpcCancel, handleGrpcStreamSend, handleGrpcStreamEnd, handleGrpcReflect, handleGrpcLoadProto,
} from '../src/panel/main/handlers/grpc-handler';
import {
  handleSoapInvoke, handleSoapCancel, handleLoadWsdl, handleLoadWsdlContent, handleGenerateEnvelope,
  handleExtractFields, handleGenerateSecurity, handleInjectSecurity, handleImportSoapUiProject, handleImportWsdlToCollection,
} from '../src/panel/main/handlers/soap-handler';
import { handleWsConnect, handleWsDisconnect, handleWsSend } from '../src/panel/main/handlers/websocket-handler';
import {
  handleDk8sProbe, handleDk8sUseContext, handleDk8sNamespaces, handleDk8sSetNamespace,
  handleDk8sSetSensitivity, handleDk8sSetGuardHeapDump, handleDk8sSearchLogs, handleDk8sProbeAccess, handleDk8sCancelSearch,
  handleDk8sGetFormats, handleDk8sSaveFormat, handleDk8sDeleteFormat,
  handleDk8sTestFormat, handleDk8sSampleLines, handleDk8sDetectFormat,
  handleDk8sListArtifacts, handleDk8sImportArtifact, handleDk8sDeleteArtifact,
  handleDk8sOpenArtifact, handleDk8sSetKubectlPath, handleDk8sWatchPods, handleDk8sStopWatch,
  handleDk8sPinNamespace, handleDk8sUnpinNamespace,
  handleDk8sUseContexts, handleDk8sSetTargets, handleDk8sExportLogs,
  handleDk8sExportSearch,
  handleDk8sLogsOpen, handleDk8sLogsClose, handleDk8sDescribe,
  handleDk8sShell, handleDk8sProbePod, handleDk8sAsk,
  handleDk8sCollect, handleDk8sAnalyze, handleDk8sRevealArtifacts,
  handleDk8sProbePv, handleDk8sSavePv, handleDk8sOpenLogFile, handleDk8sSetLogLineNumbers,
} from '../src/panel/main/handlers/k8s-handler';
import { handleDk8sHeapInvestigate } from '../src/panel/main/handlers/heap-investigate';
import { handleSseConnect, handleSseDisconnect } from '../src/panel/main/handlers/sse-handler';
import { handleSocketIOConnect, handleSocketIODisconnect, handleSocketIOEmit } from '../src/panel/main/handlers/socketio-handler';
import { handleMqttConnect, handleMqttDisconnect, handleMqttSubscribe, handleMqttUnsubscribe, handleMqttPublish } from '../src/panel/main/handlers/mqtt-handler';
import {
  handleGetEnvironments, handleSaveEnvironments,
} from '../src/panel/main/handlers/environment-handler';
import {
  handleGetCollections, handleGetCollectionTree, handleGetCollectionChildren,
  handleGetCollectionBreadcrumb, handleCreateCollection, handleCreateFolder,
  handleRenameCollection, handleRenameRequest, handleDeleteCollection,
  handleMoveCollection, handleSaveCollection, handleSaveRequestToCollection,
  handleDeleteRequestFromCollection, handleUpdateCollectionProperties,
  handleGetCollectionProperties, handleClearCollections, handleDuplicateCollection,
  handleDuplicateRequest, handleReorderCollections, handleMoveRequest,
  handleReorderRequests, handleRunCollection, handleStopCollectionRun,
} from '../src/panel/main/handlers/collection-handler';
import {
  handleStartMockServer, handleStopMockServer, handleUpdateMockRoutes,
  handleSaveMockConfigs, handleGetMockServerState, handleSetMockPortRange,
  handleUpdateMockGraphQLSchema, handleUpdateMockGraphQLOps, handleUpdateMockWsHandlers,
  handleUpdateMockSoapOps, handleUpdateMockGrpcMethods, handlePatchStateMachine,
  handleImportMockSpec, initMockLogForwarding,
} from '../src/panel/main/handlers/mock-handler';
import {
  initSmWorkflowStorage, handleSmWorkflowGetAll, handleSmWorkflowSave, handleSmWorkflowDelete,
  handleSmWorkflowSaveFolder, handleSmWorkflowDeleteFolder, handleSmWorkflowSaveTodos,
} from '../src/panel/main/handlers/sm-workflow-handler';
import { handleSaveUiState, handleGetUiState, handleSaveWorkspaceSnapshot, handleGetWorkspaceSnapshot } from '../src/panel/main/handlers/ui-state-handler';
import { handleAiChat, handleAiStream, handleAiStreamRequest } from '../src/panel/main/handlers/ai-handler';
import { window as vscodeWindow, Uri } from './vscode-shim';
import * as fs from 'fs';

export type PostMessage = (msg: unknown) => void;

function sendHistory(post: PostMessage, protocol?: string) {
  const entries = getHistory(100, 0, protocol);
  post({ type: 'historyData', entries, protocol: protocol || 'rest' });
}

/** Mirrors MainPanel.refreshInitialState() for the subsystems wired here. */
export function sendInitialState(post: PostMessage) {
  const status = getSqliteStatus();
  post({ type: 'init', sqliteOk: status.ok, sqliteError: status.error, dbPath: getDbPath() });

  initMockLogForwarding(post);
  initSmWorkflowStorage();
  handleGetMockServerState(post);

  handleGetEnvironments(post);
  handleGetUiState(post);
  handleGetWorkspaceSnapshot(post);
}

export async function routeMessage(msg: { type: string; [key: string]: unknown }, post: PostMessage) {
  switch (msg.type) {
    case 'ready':
      sendInitialState(post);
      break;

    // ── dk8s — Kubernetes. Routed here so the pod grid can be driven and
    //    screenshotted in a real browser without an extension host. ──
    case 'dk8s:probe':
      await handleDk8sProbe(post);
      break;
    case 'dk8s:useContext':
      await handleDk8sUseContext(msg, post);
      break;
    case 'dk8s:useContexts':
      await handleDk8sUseContexts(msg, post);
      break;
    case 'dk8s:setTargets':
      handleDk8sSetTargets(msg, post);
      break;
    case 'dk8s:exportLogs':
      await handleDk8sExportLogs(msg, post);
      break;
    case 'dk8s:exportSearch':
      await handleDk8sExportSearch(msg, post);
      break;

    /*
      Five messages the webview has always sent and this mirror never answered.

      Each one silently did nothing in browser mode: the archived-logs settings
      screen accepted a mount path and a template, said Save, and wrote
      nothing — so every PV feature looked broken to anyone testing here, with
      no error to explain it. Found by pointing dk8s at a real volume for the
      first time.
    */
    case 'dk8s:savePv':
      await handleDk8sSavePv(msg, post);
      break;
    case 'dk8s:probePv':
      await handleDk8sProbePv(msg, post);
      break;
    case 'dk8s:openLogFile':
      await handleDk8sOpenLogFile(msg);
      break;
    case 'dk8s:setLogLineNumbers':
      handleDk8sSetLogLineNumbers(msg, post);
      break;
    case 'dk8s:heapInvestigate':
      await handleDk8sHeapInvestigate(msg, post);
      break;

    /*
      Audit events, which were reaching nothing in browser mode.

      The extension host has written these to SQLite for a long time; this
      mirror never wired the message, so every dk8s action audited itself into
      the server's "no handler wired" warning and the Audit Log stayed empty
      for anyone testing here. The whole point of an audit trail is that it is
      there afterwards, so a path that silently drops it is worse than one that
      never claimed to record.
    */
    case 'uiAudit:log': {
      const { event_type, module, button, action, metadata } = msg as unknown as {
        event_type: string; module: string;
        button?: string; action?: string; metadata?: Record<string, unknown>;
      };
      if (event_type && module) {
        insertUiAudit({
          event_type, module, button, action,
          metadata: metadata ? JSON.stringify(metadata) : undefined,
        });
      }
      break;
    }
    case 'dk8s:namespaces':
      await handleDk8sNamespaces(msg, post);
      break;
    case 'dk8s:setNamespace':
      handleDk8sSetNamespace(msg, post);
      break;
    case 'dk8s:setSensitivity':
      handleDk8sSetSensitivity(msg, post);
      break;
    case 'dk8s:setGuardHeapDump':
      handleDk8sSetGuardHeapDump(msg, post);
      break;
    case 'dk8s:listArtifacts':
      handleDk8sListArtifacts(post);
      break;
    case 'dk8s:importArtifact':
      handleDk8sImportArtifact(post);
      break;
    case 'dk8s:deleteArtifact':
      handleDk8sDeleteArtifact(msg, post);
      break;
    case 'dk8s:openArtifact':
      handleDk8sOpenArtifact(msg, post, process.cwd());
      break;
    case 'dk8s:getFormats':
      handleDk8sGetFormats(post);
      break;
    case 'dk8s:saveFormat':
      handleDk8sSaveFormat(msg, post);
      break;
    case 'dk8s:deleteFormat':
      handleDk8sDeleteFormat(msg, post);
      break;
    case 'dk8s:testFormat':
      handleDk8sTestFormat(msg, post);
      break;
    case 'dk8s:sampleLines':
      handleDk8sSampleLines(msg, post);
      break;
    case 'dk8s:detectFormat':
      handleDk8sDetectFormat(msg, post);
      break;
    case 'dk8s:probeAccess':
      void handleDk8sProbeAccess(msg, post);
      break;
    case 'dk8s:searchLogs':
      handleDk8sSearchLogs(msg, post);
      break;
    case 'dk8s:cancelSearch':
      handleDk8sCancelSearch(post);
      break;
    case 'dk8s:setKubectlPath':
      await handleDk8sSetKubectlPath(msg, post);
      break;
    case 'dk8s:watchPods':
      handleDk8sWatchPods(msg, post);
      break;
    case 'dk8s:stopWatch':
      handleDk8sStopWatch();
      break;
    case 'dk8s:pinNamespace':
      handleDk8sPinNamespace(msg, post);
      break;
    case 'dk8s:unpinNamespace':
      handleDk8sUnpinNamespace(msg, post);
      break;
    case 'dk8s:openLogs':
      await handleDk8sLogsOpen(msg, post);
      break;
    case 'dk8s:closeLogs':
      handleDk8sLogsClose();
      break;
    case 'dk8s:describe':
      await handleDk8sDescribe(msg, post);
      break;
    case 'dk8s:shell':
      await handleDk8sShell(msg, post);
      break;
    case 'dk8s:probePod':
      await handleDk8sProbePod(msg, post);
      break;
    case 'dk8s:ask':
      await handleDk8sAsk(msg, post);
      break;
    case 'dk8s:collect':
      await handleDk8sCollect(msg, post);
      break;
    case 'dk8s:analyze':
      await handleDk8sAnalyze(msg, post, process.cwd());
      break;
    case 'dk8s:revealArtifacts':
      await handleDk8sRevealArtifacts();
      break;

    /*
      Heap analyzer.

      `dk8s:analyze` already forks the parse worker here — the same code the
      extension host runs — but the channel the views read back on was never
      routed, so the analyzer opened and then sat empty forever. Every heap
      screen queries: the histogram, the treemap, the retention tree, growth
      and the evidence pack all go through `heap:query`.
    */
    case 'heap:open':
      await handleHeapOpen(post, process.cwd());
      break;
    case 'heap:query':
      handleHeapQuery(msg, post);
      break;
    case 'heap:setBaseline':
      handleHeapSetBaseline(post);
      break;
    case 'heap:cancel':
      handleHeapCancel(post);
      break;
    case 'heap:locateClass':
      await handleHeapLocateClass(msg, post);
      break;
    case 'heap:openSource':
      await handleHeapOpenSource(msg);
      break;

    // ── Request Execution ──
    case 'executeRequest':
      await handleExecuteRequest(msg, post, () => handleGetEnvironments(post), () => sendHistory(post, (msg.protocol as string) || 'rest'));
      break;
    case 'cancelRequest':
      cancelRestRequest(msg.tabId as string);
      cancelGraphQLRequest(msg.tabId as string);
      break;
    case 'getOAuth2Token':
      await handleGetOAuth2Token(msg, post);
      break;

    // ── GraphQL ──
    case 'graphql:connect':
      await handleGraphQLConnect(msg, post);
      break;
    case 'executeGraphQL':
      await handleExecuteGraphQL(msg, post, () => sendHistory(post, 'graphql'));
      break;
    case 'gql:subscribe':
      handleGraphQLSubscribe(msg, post);
      break;
    case 'gql:unsubscribe':
      handleGraphQLUnsubscribe(msg);
      break;

    // ── gRPC Client ──
    case 'grpc:invoke':
      await handleGrpcInvoke(msg, post, () => sendHistory(post, 'grpc'));
      break;
    case 'grpc:cancel':
      handleGrpcCancel(msg, post);
      break;
    case 'grpc:streamSend':
      handleGrpcStreamSend(msg, post);
      break;
    case 'grpc:streamEnd':
      handleGrpcStreamEnd(msg, post);
      break;
    case 'grpc:reflect':
      await handleGrpcReflect(msg, post);
      break;
    case 'grpc:loadProto':
      await handleGrpcLoadProto(msg, post);
      break;

    // ── SOAP ──
    case 'soap:invoke':
      await handleSoapInvoke(msg, post, () => sendHistory(post, 'soap'));
      break;
    case 'soap:cancel':
      handleSoapCancel(msg, post);
      break;
    case 'soap:loadWsdl':
      await handleLoadWsdl(msg, post);
      break;
    case 'soap:loadWsdlContent':
      await handleLoadWsdlContent(msg, post);
      break;
    case 'soap:generateEnvelope':
      handleGenerateEnvelope(msg, post);
      break;
    case 'soap:extractFields':
      handleExtractFields(msg, post);
      break;
    case 'soap:generateSecurity':
      handleGenerateSecurity(msg, post);
      break;
    case 'soap:injectSecurity':
      handleInjectSecurity(msg, post);
      break;
    case 'soap:importSoapUi':
      handleImportSoapUiProject(msg, post);
      break;
    case 'soap:importWsdlToCollection':
      await handleImportWsdlToCollection(msg, post);
      break;

    // ── WebSocket Client ──
    case 'ws:connect':
      handleWsConnect(msg, post, () => sendHistory(post, 'websocket'));
      break;
    case 'ws:disconnect':
      handleWsDisconnect(msg, post);
      break;
    case 'ws:send':
      handleWsSend(msg, post);
      break;

    // ── SSE Client ──
    case 'sse:connect':
      handleSseConnect(msg, post, () => sendHistory(post, 'websocket'));
      break;
    case 'sse:disconnect':
      handleSseDisconnect(msg);
      break;

    // ── Socket.IO Client ──
    case 'socketio:connect':
      handleSocketIOConnect(msg, post, () => sendHistory(post, 'websocket'));
      break;
    case 'socketio:disconnect':
      handleSocketIODisconnect(msg, post);
      break;
    case 'socketio:emit':
      handleSocketIOEmit(msg, post);
      break;

    // ── MQTT Client ──
    case 'mqtt:connect':
      handleMqttConnect(msg, post, () => sendHistory(post, 'websocket'));
      break;
    case 'mqtt:disconnect':
      handleMqttDisconnect(msg);
      break;
    case 'mqtt:subscribe':
      handleMqttSubscribe(msg, post);
      break;
    case 'mqtt:unsubscribe':
      handleMqttUnsubscribe(msg, post);
      break;
    case 'mqtt:publish':
      handleMqttPublish(msg, post);
      break;

    // ── Mock Server ──
    case 'mockServer:start':
      await handleStartMockServer(msg, post);
      break;
    case 'mockServer:stop':
      await handleStopMockServer(msg, post);
      break;
    case 'mockServer:updateRoutes':
      handleUpdateMockRoutes(msg);
      break;
    case 'mockServer:saveAll':
      handleSaveMockConfigs(msg);
      break;
    case 'mockServer:getAll':
      handleGetMockServerState(post);
      break;
    case 'mockServer:patchStateMachine':
      handlePatchStateMachine(msg);
      break;
    case 'mockServer:importSpec':
      handleImportMockSpec(msg, post);
      break;
    case 'mockServer:setPortRange':
      handleSetMockPortRange(msg, post);
      break;
    case 'mockServer:updateSchema':
      handleUpdateMockGraphQLSchema(msg);
      break;
    case 'mockServer:updateGraphQLOps':
      handleUpdateMockGraphQLOps(msg);
      break;
    case 'mockServer:updateWsHandlers':
      handleUpdateMockWsHandlers(msg);
      break;
    case 'mockServer:updateSoapOps':
      handleUpdateMockSoapOps(msg);
      break;
    case 'mockServer:updateGrpcMethods':
      handleUpdateMockGrpcMethods(msg);
      break;
    case 'mockServer:pickBodyFile': {
      const callbackId = msg.callbackId as string;
      const uri = await vscodeWindow.showOpenDialog();
      if (uri) post({ type: 'mockServer:bodyFilePicked', callbackId, filePath: (uri as any).fsPath });
      break;
    }
    case 'exportMockServer': {
      const content = (msg.content as string) ?? '';
      const filename = (msg.filename as string) ?? 'mock-server.js';
      const uri = await vscodeWindow.showSaveDialog({ defaultUri: Uri.file(filename) });
      if (uri) fs.writeFileSync((uri as any).fsPath, content, 'utf-8');
      break;
    }
    case 'exportMockServerWiremockZip': {
      const mappings = (msg.mappings as { filename: string; content: string }[]) ?? [];
      const files = (msg.files as { filename: string; content: string }[]) ?? [];
      const filename = (msg.filename as string) ?? 'wiremock-export.zip';
      const uri = await vscodeWindow.showSaveDialog({ defaultUri: Uri.file(filename) });
      if (uri) {
        const { ZipArchive } = require('archiver');
        const output = fs.createWriteStream((uri as any).fsPath);
        const archive = new ZipArchive({ zlib: { level: 9 } });
        archive.pipe(output);
        for (const m of mappings) archive.append(m.content, { name: `mappings/${m.filename}` });
        for (const f of files) archive.append(f.content, { name: `__files/${f.filename}` });
        archive.finalize();
      }
      break;
    }

    // ── State Machine Workflows ──
    case 'smWorkflow:getAll':
      handleSmWorkflowGetAll(post);
      break;
    case 'smWorkflow:save':
      handleSmWorkflowSave(msg);
      break;
    case 'smWorkflow:delete':
      handleSmWorkflowDelete(msg);
      break;
    case 'smWorkflow:saveFolder':
      handleSmWorkflowSaveFolder(msg);
      break;
    case 'smWorkflow:deleteFolder':
      handleSmWorkflowDeleteFolder(msg);
      break;
    case 'smWorkflow:saveTodos':
      handleSmWorkflowSaveTodos(msg);
      break;

    // ── Environments ──
    case 'getEnvironments':
      handleGetEnvironments(post);
      break;
    case 'saveEnvironments':
      // No echo back — matches MainPanel.ts's real dispatch exactly. The webview
      // subscribes to its own env store and re-posts 'saveEnvironments' on every
      // change (App.tsx), so echoing environmentsData here re-triggers that
      // subscription and creates an infinite save -> echo -> re-save loop that
      // floods the DevTools console log (observed: 100k+ entries in seconds).
      handleSaveEnvironments(msg);
      break;

    // ── Collections ──
    case 'getCollections':
      handleGetCollections(post, msg.protocol as string | undefined);
      break;
    case 'getCollectionTree':
      handleGetCollectionTree(post, msg.protocol as string | undefined);
      break;
    case 'getCollectionChildren':
      handleGetCollectionChildren(msg, post);
      break;
    case 'getCollectionBreadcrumb':
      handleGetCollectionBreadcrumb(msg, post);
      break;
    case 'createCollection':
      handleCreateCollection(msg, post);
      break;
    case 'createFolder':
      handleCreateFolder(msg, post);
      break;
    case 'renameCollection':
      handleRenameCollection(msg, post);
      break;
    case 'renameRequest':
      handleRenameRequest(msg, post);
      break;
    case 'deleteCollection':
      handleDeleteCollection(msg, post);
      break;
    case 'moveCollection':
      handleMoveCollection(msg, post);
      break;
    case 'saveCollection':
      handleSaveCollection(msg, post);
      break;
    case 'saveRequestToCollection':
      handleSaveRequestToCollection(msg, post);
      break;
    case 'deleteRequestFromCollection':
      handleDeleteRequestFromCollection(msg, post);
      break;
    case 'updateCollectionProperties':
      handleUpdateCollectionProperties(msg);
      break;
    case 'getCollectionProperties':
      handleGetCollectionProperties(msg, post);
      break;
    case 'settings:getEffective':
      handleGetEffectiveSettings(msg, post);
      break;
    case 'clearCollections':
      handleClearCollections(post, msg.protocol as string | undefined);
      break;
    case 'duplicateCollection':
      handleDuplicateCollection(msg, post);
      break;
    case 'duplicateRequest':
      handleDuplicateRequest(msg, post);
      break;
    case 'reorderCollections':
      handleReorderCollections(msg, post);
      break;
    case 'moveRequest':
      handleMoveRequest(msg, post);
      break;
    case 'reorderRequests':
      handleReorderRequests(msg, post);
      break;
    case 'runCollection':
      await handleRunCollection(msg, post);
      break;
    case 'stopCollectionRun':
      handleStopCollectionRun();
      break;

    // ── History ──
    case 'getHistory':
      sendHistory(post, msg.protocol as string | undefined);
      break;
    case 'clearHistory':
      clearHistory(msg.protocol as string | undefined);
      sendHistory(post, msg.protocol as string | undefined);
      break;
    case 'deleteHistoryById':
      deleteHistoryById(msg.id as number);
      sendHistory(post, msg.protocol as string | undefined);
      break;

    // ── UI State ──
    case 'saveUiState':
      handleSaveUiState(msg as any);
      break;
    case 'getUiState':
      handleGetUiState(post);
      break;
    case 'saveWorkspaceSnapshot':
      handleSaveWorkspaceSnapshot(msg as any);
      break;
    case 'getWorkspaceSnapshot':
      handleGetWorkspaceSnapshot(post);
      break;

    // ── Cookies ──
    case 'getCookiesForDomain': {
      const domain = msg.domain as string;
      const cookies = domain ? getCookies(domain) : [];
      post({ type: 'cookiesForDomain', domain, cookies });
      break;
    }

    // ── Generic settings (subset) ──
    case 'getSetting':
      post({ type: 'settingValue', key: msg.key, value: getSetting(msg.key as string) });
      break;
    case 'setSetting':
      setSetting(msg.key as string, msg.value);
      break;

    // ── AI Providers ──
    case 'aiProviders:load': {
      const providers = getSetting<unknown[]>('aiProviders');
      const defaultProviderId = getSetting<string>('aiDefaultProvider') ?? 'copilot';
      const defaultModelId = getSetting<string>('aiDefaultModel') ?? 'auto';
      post({ type: 'aiProviders:data', providers: providers ?? null, defaultProviderId, defaultModelId });
      break;
    }
    case 'aiProviders:save': {
      const providers = msg.providers as unknown[];
      setSetting('aiProviders', providers);
      if (msg.defaultProviderId) setSetting('aiDefaultProvider', msg.defaultProviderId as string);
      if (msg.defaultModelId) setSetting('aiDefaultModel', msg.defaultModelId as string);
      break;
    }
    // ── AI Keys — no vscode.SecretStorage outside a real extension host,
    // so just report everything as unset rather than hanging the UI forever.
    case 'aiKeys:load':
      post({ type: 'aiKeys:status', status: {} });
      break;

    // ── AI streaming — legacy contract used by 14 AI modals (see ai-handler.ts's
    // runLegacyAiStream doc comment). Real handler verbatim, same as everything else
    // in this router; retrieveApiKey() gracefully returns undefined outside a real
    // extension host (no SecretStorage) instead of throwing, so this degrades to a
    // real aiStream:error instead of hanging silently like the unwired default case did.
    case 'aiChat':
      handleAiChat(msg, post);
      break;
    case 'aiStream':
      handleAiStream(msg, post);
      break;
    case 'aiStreamRequest':
      handleAiStreamRequest(msg, post);
      break;

    // ── Prompt Library ──
    case 'promptLibrary:load':
      post({ type: 'promptLibrary:data', prompts: getAllPrompts() });
      break;
    case 'promptLibrary:save':
      upsertPrompt(msg.scenario as string, msg.prompt as Parameters<typeof upsertPrompt>[1]);
      post({ type: 'promptLibrary:data', prompts: getAllPrompts() });
      break;
    case 'promptLibrary:reset':
      resetPrompt(msg.scenario as string);
      post({ type: 'promptLibrary:data', prompts: getAllPrompts() });
      break;

    // ── AI Audit ──
    case 'aiAudit:load': {
      const limit = (msg.limit as number) ?? 100;
      post({ type: 'aiAudit:data', entries: getAuditEntries(limit) });
      break;
    }
    case 'aiAudit:delete': {
      const auditId = msg.auditId as number;
      if (auditId != null) deleteAuditEntry(auditId);
      break;
    }
    case 'aiAudit:deleteMany': {
      const auditIds = msg.auditIds as number[];
      if (Array.isArray(auditIds) && auditIds.length > 0) deleteAuditEntries(auditIds);
      break;
    }
    case 'aiAudit:clear':
      clearAuditEntries();
      break;

    // ── Developer Tools: Memory Footprint (pure process/os stats, no vscode API) ──
    case 'getPerformanceData': {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      const uptimeSeconds = process.uptime();
      const cpuPercent = ((cpuUsage.user + cpuUsage.system) / (uptimeSeconds * 1_000_000)) * 100;
      const os = require('os') as typeof import('os');
      post({
        type: 'performanceData',
        data: {
          cpuUsage: Math.min(cpuPercent, 100),
          memoryUsage: memUsage.rss,
          uptime: uptimeSeconds,
          processId: process.pid,
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          rss: memUsage.rss,
          external: memUsage.external,
          arrayBuffers: memUsage.arrayBuffers,
          osFreeMemory: os.freemem(),
          osTotalMemory: os.totalmem(),
          nodeVersion: process.version,
        },
      });
      break;
    }

    // ── UI Audit ──
    case 'uiAudit:load': {
      const limit = (msg.limit as number) ?? 200;
      post({ type: 'uiAudit:data', entries: getUiAuditEntries(limit) });
      break;
    }
    case 'uiAudit:clear':
      clearUiAuditEntries();
      break;

    // ── DB Explorer ──
    case 'dbExplorer:getTables':
      post({ type: 'dbExplorer:tables', tables: getDbTables() });
      break;
    case 'dbExplorer:getRows': {
      const tableName = msg.tableName as string;
      const limit = (msg.limit as number) ?? 100;
      const offset = (msg.offset as number) ?? 0;
      post({ type: 'dbExplorer:rows', tableName, rows: getDbTableRows(tableName, limit, offset) });
      break;
    }
    case 'dbExplorer:deleteRow': {
      const { tableName, pkCol, pkVal } = msg as unknown as { tableName: string; pkCol: string; pkVal: unknown };
      deleteDbRow(tableName, pkCol, pkVal);
      post({ type: 'dbExplorer:rowDeleted', tableName, pkVal });
      break;
    }

    // ── Settings (mirrors MainPanel._sendSettings/_saveSettings verbatim) ──
    case 'getSettings': {
      const defaults = {
        followRedirects: true,
        sslVerification: true,
        timeout: 0,
        encoding: 'enable',
        saveResponseInHistory: true,
        proxy: { mode: 'none' },
      };
      const stored = getSetting<Record<string, unknown>>('general') ?? {};
      post({ type: 'settingsData', settings: { ...defaults, ...stored } });
      break;
    }
    case 'saveSettings': {
      const settings = msg.settings as Record<string, unknown>;
      const existing = getSetting<Record<string, unknown>>('general') ?? {};
      setSetting('general', { ...existing, ...settings });
      break;
    }

    default:
      console.log(`[local-server] no handler wired for message type "${msg.type}" — add one in local-server/router.ts if you need it`);
  }
}
