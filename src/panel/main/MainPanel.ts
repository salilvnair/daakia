/**
 * MainPanel — core panel shell + message router.
 * All domain logic is delegated to handler modules in ./handlers/.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getSqliteStatus, getDbPath, getHistory, getSetting, setSetting, getCookies, setAiKey, deleteAiKey, getAllAiKeys, saveAiChatSession, loadAiChatSessions, deleteAiChatSession, searchAiChatSessions, getAiFeatures, setAiFeatures, getAllPrompts, upsertPrompt, resetPrompt, getAiPromptTemplates, setAiPromptTemplates, saveAiConversation, loadAiConversation, clearAiConversation, type AiConversationMessage, getAuditEntries, deleteAuditEntry, deleteAuditEntries, clearAuditEntries, insertUiAudit, getUiAuditEntries, clearUiAuditEntries, getDbTables, getDbTableRows, deleteDbRow } from '../../storage/db';
import { archiveHistoryEntry, archiveHistoryBatch } from '../../services/bin';
import { getProviderKeyStatus } from '../../services/llm/llm-provider-service';
import { storeApiKey, deleteApiKey, getAllKeyStatus } from '../../services/secret-store';
// Handler imports
import { handleExecuteRequest, handleGetOAuth2Token } from './handlers/request-handler';
import { cancelRestRequest } from '../../http/request-executor';
import { cancelGraphQLRequest } from './handlers/graphql-handler';
import {
  handleGetEnvironments, handleSaveEnvironments,
  handleExportEnvironmentsJson, handleImportEnvironmentsJson,
  handleImportEnvironmentsPostman, handleImportEnvironmentsInsomnia,
  handleImportEnvironmentsGist, handleExportEnvironmentsGist,
  handleImportEnvironmentsDotEnv,
  handleExportEnvironmentsPostman, handleExportEnvironmentsBruno,
  handleExportEnvironmentsInsomnia, handleExportEnvironmentsHttpie,
} from './handlers/environment-handler';
import {
  handleGetCollections, handleGetCollectionTree, handleGetCollectionChildren,
  handleGetCollectionBreadcrumb, handleCreateCollection, handleCreateFolder,
  handleRenameCollection, handleRenameRequest, handleDeleteCollection,
  handleMoveCollection, handleSaveCollection, handleSaveRequestToCollection,
  handleDeleteRequestFromCollection, handleUpdateCollectionProperties,
  handleGetCollectionProperties, handleClearCollections, handleDuplicateCollection,
  handleDuplicateRequest, handleReorderCollections, handleMoveRequest,
  handleReorderRequests, handleRunCollection, handleStopCollectionRun,
} from './handlers/collection-handler';
import {
  handleExportCollectionDaakia, handleExportCollectionPostman,
  handleExportCollectionBruno, handleExportCollectionInsomnia,
  handleExportCollectionHttpie, handleExportCollectionOpenApi,
  handleExportCollectionDocs,
} from '../../services/collection-exporter';
import {
  handleStartMockServer, handleStopMockServer, handleUpdateMockRoutes,
  handleSaveMockConfigs, handleGetMockServerState, handleSetMockPortRange,
  handleUpdateMockGraphQLSchema, handleUpdateMockGraphQLOps, handleUpdateMockWsHandlers,
  handleUpdateMockSoapOps, handleUpdateMockGrpcMethods, handlePatchStateMachine,
  handleImportMockSpec,
  initMockLogForwarding,
} from './handlers/mock-handler';
import { handleExecuteGraphQL, handleGraphQLConnect, handleGraphQLSubscribe, handleGraphQLUnsubscribe, cleanupAllSubscriptions } from './handlers/graphql-handler';
import { handleWsConnect, handleWsDisconnect, handleWsSend, cleanupAllWsConnections } from './handlers/websocket-handler';
import { handleSseConnect, handleSseDisconnect, cleanupAllSseConnections } from './handlers/sse-handler';
import { handleSocketIOConnect, handleSocketIODisconnect, handleSocketIOEmit, cleanupAllSocketIOConnections } from './handlers/socketio-handler';
import { handleMqttConnect, handleMqttDisconnect, handleMqttSubscribe, handleMqttUnsubscribe, handleMqttPublish, cleanupAllMqttConnections } from './handlers/mqtt-handler';
import { handleGrpcInvoke, handleGrpcCancel, handleGrpcStreamSend, handleGrpcStreamEnd, handleGrpcReflect, handleGrpcLoadProto, cleanupAllGrpcStreams } from './handlers/grpc-handler';
import { handleSoapInvoke, handleSoapCancel, handleLoadWsdl, handleLoadWsdlContent, handleGenerateEnvelope, handleExtractFields, handleGenerateSecurity, handleInjectSecurity, handleImportSoapUiProject, handleImportWsdlToCollection } from './handlers/soap-handler';
import {
  handleAiSend, handleAiCancel,
  handleAiSaveConversation, handleAiLoadConversations, handleAiLoadConversation,
  handleAiDeleteConversation, handleAiClearConversations,
  handleAiChat, handleAiStream, handleAiStreamRequest,
} from './handlers/ai-handler';
import { handleAiDiscovery } from './handlers/ai-discovery-handler';
import { handleAiFuzz } from './handlers/ai-fuzz-handler';
import { handleMcpConnect, handleMcpDisconnect, handleMcpCallTool, handleMcpGetPrompt, handleMcpReadResource, cleanupAllMcpClients, handleMcpConnectServer, handleMcpDisconnectServer, handleMcpCallToolOnServer } from './handlers/mcp-handler';
import { handleAiMcpConnect, handleAiMcpDisconnect, cleanupAiMcpClients } from './handlers/ai-mcp-handler';
import { handleSaveUiState, handleGetUiState, handleSaveWorkspaceSnapshot, handleGetWorkspaceSnapshot } from './handlers/ui-state-handler';
import {
  handleGitSyncGetSettings, handleGitSyncSaveSettings, handleGitSyncGetStatus,
  handleGitSyncInit, handleGitSyncNow, handleGitSyncExportOnly, handleGitSyncImportOnly,
} from './handlers/git-sync-handler';
import {
  handleVaultGetStatus, handleVaultSetPassphrase, handleVaultUnlock, handleVaultLock, handleVaultClear,
} from './handlers/vault-handler';
import {
  handleBinGetEntries, handleBinRestore, handleBinRestoreGroup,
  handleBinPermanentlyDelete, handleBinPermanentlyDeleteGroup, handleBinEmpty,
} from './handlers/bin-handler';
import { handleDebugMessage } from './handlers/debug-handler';
import { noteProtocolSend, auditProtocolResponse } from '../../services/protocol-audit';
import { noteSessionConnect, auditSessionMessage, flushOpenSessions } from '../../services/session-audit';
import {
  handleDk8sProbe, handleDk8sUseContext, handleDk8sNamespaces,
  handleDk8sSetNamespace, handleDk8sSetSensitivity, handleDk8sSetGuardHeapDump, handleDk8sSearchLogs, handleDk8sCancelSearch,
  handleDk8sGetFormats, handleDk8sSaveFormat, handleDk8sDeleteFormat,
  handleDk8sTestFormat, handleDk8sSampleLines, handleDk8sDetectFormat,
  handleDk8sListArtifacts, handleDk8sImportArtifact, handleDk8sDeleteArtifact,
  handleDk8sOpenArtifact, handleDk8sSetKubectlPath,
  handleDk8sWatchPods, handleDk8sStopWatch, disposeDk8s,
  handleDk8sPinNamespace, handleDk8sUnpinNamespace,
  handleDk8sUseContexts, handleDk8sSetTargets, handleDk8sExportLogs,
  handleDk8sLogsOpen,
  handleDk8sLogsClose,
  handleDk8sDescribe,
  handleDk8sShell,
  handleDk8sProbePod,
  handleDk8sAsk, handleDk8sCollect, handleDk8sAnalyze, handleDk8sRevealArtifacts,
} from './handlers/k8s-handler';
import {
  normalizeProxyConfig, toUiProxyConfig, resolveProxy,
  DEFAULT_PROXY, UNPROXIED_PROTOCOLS,
  type ProxyConfig, type ProxyUiConfig,
} from '../../services/proxy-config';
import {
  handleHeapOpen, handleHeapAnalyze, handleHeapCancel, handleHeapQuery,
  handleHeapSetBaseline, handleHeapLocateClass, handleHeapOpenSource,
  handleThreadsOpen, handleThreadsAnalyze, handleLogsOpen, handleLogsAnalyze,
} from './handlers/heap-handler';
import { scheduleAutoExport, COLLECTION_MUTATION_TYPES, startAutoSyncTimer, stopAutoSyncTimer } from '../../services/git-sync';
import {
  initSmWorkflowStorage,
  handleSmWorkflowGetAll,
  handleSmWorkflowSave,
  handleSmWorkflowDelete,
  handleSmWorkflowSaveFolder,
  handleSmWorkflowDeleteFolder,
  handleSmWorkflowSaveTodos,
} from './handlers/sm-workflow-handler';

export class MainPanel {
  public static currentPanel: MainPanel | undefined;
  private static readonly _viewType = 'daakia.mainPanel';

  /**
   * Wiki capture automation hook (E-wiki-capture-plumbing) — set by the capture
   * orchestration script/test to receive `wiki:capture:result`/`wiki:capture:error`
   * replies from CaptureBridge.tsx. Stays undefined in normal use; the matching
   * `case` in _handleMessage no-ops when it's unset, so this has zero effect on
   * real users.
   */
  public static onCaptureMessage: ((msg: { type: string; id: string; html?: string; error?: string }) => void) | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (MainPanel.currentPanel) {
      MainPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      MainPanel._viewType,
      'Daakia',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'webview', 'dist'),
          vscode.Uri.joinPath(extensionUri, 'webview-ui', 'dist'),
        ],
      }
    );

    MainPanel.currentPanel = new MainPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.html = this._getHtml();
    this._panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.svg');

    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg),
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public postMessage(msg: unknown) {
    this._panel.webview.postMessage(msg);
  }

  public refreshInitialState() {
    const status = getSqliteStatus();
    this.postMessage({ type: 'init', sqliteOk: status.ok, sqliteError: status.error, dbPath: getDbPath() });

    initMockLogForwarding(this._post);
    initSmWorkflowStorage();
    handleGetMockServerState(this._post);

    handleGetEnvironments(this._post);
    handleGetUiState(this._post);
    handleGetWorkspaceSnapshot(this._post);
    this._sendSettings();
    // AI init state — keys come from OS keychain (async)
    this._refreshKeyStatus();
    this._post({ type: 'aiFeatures:data', features: getAiFeatures() });
    this._sendAiProviders();
    this._restartAutoSyncTimer();
  }

  public dispose() {
    MainPanel.currentPanel = undefined;
    // Before the transports are torn down: a live connection has no close event
    // coming, and the long-lived ones are the most worth having recorded.
    flushOpenSessions();
    disposeDk8s();
    stopAutoSyncTimer();
    cleanupAllWsConnections();
    cleanupAllSseConnections();
    cleanupAllSocketIOConnections();
    cleanupAllSubscriptions();
    cleanupAllGrpcStreams();
    cleanupAllMcpClients();
    cleanupAiMcpClients();
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      d?.dispose();
    }
  }

  // Bound postMessage shorthand for passing to handlers
  /**
   * Every message to the webview passes here, which makes it the one place a
   * protocol response can be audited regardless of which of a handler's return
   * paths produced it. See src/services/protocol-audit.ts.
   */
  private _post = (msg: unknown) => {
    auditProtocolResponse(msg as Record<string, unknown>);
    // Realtime protocols are sessions, not requests: this tallies their traffic
    // and writes one row when the connection ends. See services/session-audit.ts.
    auditSessionMessage(msg as Record<string, unknown>);
    this.postMessage(msg);
  };

  // ────────────────── Git Sync — auto-sync timer + post-sync UI refresh ──────

  private _restartAutoSyncTimer() {
    startAutoSyncTimer((result) => {
      this._post({ type: 'gitSync:autoSyncTick', at: new Date().toISOString(), result });
      if (result.ok) this._broadcastSyncedData();
    });
  }

  /** Re-sends collections/history/mock-servers/state-machine data for every protocol so any
   * currently-open panel reflects what a sync just pulled in, without the user reloading. */
  private _broadcastSyncedData() {
    const COLLECTION_PROTOCOLS = ['rest', 'graphql', 'websocket', 'grpc', 'soap', 'ai', 'mcp'];
    const HISTORY_PROTOCOLS = ['rest', 'graphql', 'websocket', 'sse', 'socketio', 'mqtt', 'grpc', 'soap', 'ai', 'mcp'];
    for (const p of COLLECTION_PROTOCOLS) handleGetCollections(this._post, p);
    for (const p of HISTORY_PROTOCOLS) this._sendHistory(p);
    handleGetMockServerState(this._post);
    handleSmWorkflowGetAll(this._post);
  }

  // ────────────────── Message Router ──────────────────

  private _handleMessage(msg: { type: string; [key: string]: unknown }) {
    // ── Script Debugger (handle before switch for prefix matching) ──
    if (msg.type.startsWith('scriptDebug:')) {
      handleDebugMessage(msg, this._post);
      return;
    }

    // ── Git-native sync: write collections through to workspace files (debounced) ──
    if (COLLECTION_MUTATION_TYPES.has(msg.type)) {
      queueMicrotask(() => scheduleAutoExport());
    }

    // Stash sends so the response hook on _post can pair them into one audit row.
    noteProtocolSend(msg);
    noteSessionConnect(msg);

    switch (msg.type) {
      case 'ready':
        this.refreshInitialState();
        break;

      // ── Request Execution ──
      case 'executeRequest':
        handleExecuteRequest(msg, this._post, () => handleGetEnvironments(this._post), () => this._sendHistory((msg.protocol as string) || 'rest'));
        break;
      case 'cancelRequest':
        cancelRestRequest(msg.tabId as string);
        cancelGraphQLRequest(msg.tabId as string);
        break;
      case 'getOAuth2Token':
        handleGetOAuth2Token(msg, this._post);
        break;

      // ── GraphQL ──
      case 'graphql:connect':
        handleGraphQLConnect(msg, this._post);
        break;
      case 'executeGraphQL':
        handleExecuteGraphQL(msg, this._post, () => this._sendHistory('graphql'));
        break;
      case 'gql:subscribe':
        handleGraphQLSubscribe(msg, this._post);
        break;
      case 'gql:unsubscribe':
        handleGraphQLUnsubscribe(msg);
        break;

      // ── WebSocket Client ──
      case 'ws:connect':
        handleWsConnect(msg, this._post, () => this._sendHistory('websocket'));
        break;
      case 'ws:disconnect':
        handleWsDisconnect(msg, this._post);
        break;
      case 'ws:send':
        handleWsSend(msg, this._post);
        break;

      // ── SSE Client ──
      case 'sse:connect':
        handleSseConnect(msg, this._post, () => this._sendHistory('websocket'));
        break;
      case 'sse:disconnect':
        handleSseDisconnect(msg);
        break;

      // ── Socket.IO Client ──
      case 'socketio:connect':
        handleSocketIOConnect(msg, this._post, () => this._sendHistory('websocket'));
        break;
      case 'socketio:disconnect':
        handleSocketIODisconnect(msg, this._post);
        break;
      case 'socketio:emit':
        handleSocketIOEmit(msg, this._post);
        break;

      // ── MQTT Client ──
      case 'mqtt:connect':
        handleMqttConnect(msg, this._post, () => this._sendHistory('websocket'));
        break;
      case 'mqtt:disconnect':
        handleMqttDisconnect(msg);
        break;
      case 'mqtt:subscribe':
        handleMqttSubscribe(msg, this._post);
        break;
      case 'mqtt:unsubscribe':
        handleMqttUnsubscribe(msg, this._post);
        break;
      case 'mqtt:publish':
        handleMqttPublish(msg, this._post);
        break;

      // ── dk8s — Kubernetes diagnostics ──
      case 'dk8s:probe':
        handleDk8sProbe(this._post);
        break;
      case 'dk8s:useContext':
        handleDk8sUseContext(msg, this._post);
        break;
      case 'dk8s:useContexts':
        handleDk8sUseContexts(msg, this._post);
        break;
      case 'dk8s:setTargets':
        handleDk8sSetTargets(msg, this._post);
        break;
      case 'dk8s:exportLogs':
        handleDk8sExportLogs(msg, this._post);
        break;
      case 'dk8s:namespaces':
        handleDk8sNamespaces(msg, this._post);
        break;
      case 'dk8s:setNamespace':
        handleDk8sSetNamespace(msg, this._post);
        break;
      case 'dk8s:setSensitivity':
        handleDk8sSetSensitivity(msg, this._post);
        break;
      case 'dk8s:setGuardHeapDump':
        handleDk8sSetGuardHeapDump(msg, this._post);
        break;
      case 'dk8s:listArtifacts':
        handleDk8sListArtifacts(this._post);
        break;
      case 'dk8s:importArtifact':
        handleDk8sImportArtifact(this._post);
        break;
      case 'dk8s:deleteArtifact':
        handleDk8sDeleteArtifact(msg, this._post);
        break;
      case 'dk8s:openArtifact':
        handleDk8sOpenArtifact(msg, this._post, this._extensionUri.fsPath);
        break;
      case 'dk8s:getFormats':
        handleDk8sGetFormats(this._post);
        break;
      case 'dk8s:saveFormat':
        handleDk8sSaveFormat(msg, this._post);
        break;
      case 'dk8s:deleteFormat':
        handleDk8sDeleteFormat(msg, this._post);
        break;
      case 'dk8s:testFormat':
        handleDk8sTestFormat(msg, this._post);
        break;
      case 'dk8s:sampleLines':
        handleDk8sSampleLines(msg, this._post);
        break;
      case 'dk8s:detectFormat':
        handleDk8sDetectFormat(msg, this._post);
        break;
      case 'dk8s:searchLogs':
        handleDk8sSearchLogs(msg, this._post);
        break;
      case 'dk8s:cancelSearch':
        handleDk8sCancelSearch(this._post);
        break;
      case 'dk8s:setKubectlPath':
        handleDk8sSetKubectlPath(msg, this._post);
        break;
      case 'dk8s:watchPods':
        handleDk8sWatchPods(msg, this._post);
        break;
      case 'dk8s:stopWatch':
        handleDk8sStopWatch();
        break;
      case 'dk8s:pinNamespace':
        handleDk8sPinNamespace(msg, this._post);
        break;
      case 'dk8s:unpinNamespace':
        handleDk8sUnpinNamespace(msg, this._post);
        break;
      case 'dk8s:openLogs':
        void handleDk8sLogsOpen(msg, this._post);
        break;
      case 'dk8s:closeLogs':
        handleDk8sLogsClose();
        break;
      case 'dk8s:describe':
        handleDk8sDescribe(msg, this._post);
        break;
      case 'dk8s:shell':
        handleDk8sShell(msg, this._post);
        break;
      case 'dk8s:probePod':
        handleDk8sProbePod(msg, this._post);
        break;
      case 'dk8s:ask':
        handleDk8sAsk(msg, this._post);
        break;
      case 'dk8s:collect':
        handleDk8sCollect(msg, this._post);
        break;
      case 'dk8s:analyze':
        handleDk8sAnalyze(msg, this._post, this._extensionUri.fsPath);
        break;
      case 'dk8s:revealArtifacts':
        handleDk8sRevealArtifacts();
        break;

      // ── gRPC Client ──
      case 'grpc:invoke':
        handleGrpcInvoke(msg, this._post, () => this._sendHistory('grpc'));
        break;
      case 'grpc:cancel':
        handleGrpcCancel(msg, this._post);
        break;
      case 'grpc:streamSend':
        handleGrpcStreamSend(msg, this._post);
        break;
      case 'grpc:streamEnd':
        handleGrpcStreamEnd(msg, this._post);
        break;
      case 'grpc:reflect':
        handleGrpcReflect(msg, this._post);
        break;
      case 'grpc:loadProto':
        handleGrpcLoadProto(msg, this._post);
        break;
      case 'grpc:upload-proto': {
        const tabId = msg.tabId as string;
        vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { 'Proto files': ['proto'] },
          title: 'Select .proto file',
        }).then(uris => {
          if (uris && uris.length > 0) {
            const protoPath = uris[0].fsPath;
            this._post({ type: 'grpc:protoUploaded', tabId, protoPath });
            handleGrpcLoadProto({ tabId, protoPath }, this._post);
          }
        });
        break;
      }

      // ── SOAP Client ──
      case 'soap:invoke':
        handleSoapInvoke(msg, this._post, () => this._sendHistory('soap'));
        break;
      case 'soap:cancel':
        handleSoapCancel(msg, this._post);
        break;
      case 'soap:loadWsdl':
        handleLoadWsdl(msg, this._post);
        break;
      case 'soap:loadWsdlContent':
        handleLoadWsdlContent(msg, this._post);
        break;
      case 'soap:generateEnvelope':
        handleGenerateEnvelope(msg, this._post);
        break;
      case 'soap:extractFields':
        handleExtractFields(msg, this._post);
        break;
      case 'soap:generateSecurity':
        handleGenerateSecurity(msg, this._post);
        break;
      case 'soap:injectSecurity':
        handleInjectSecurity(msg, this._post);
        break;
      case 'soap:importSoapUi':
        handleImportSoapUiProject(msg, this._post);
        break;
      case 'soap:importWsdlToCollection':
        handleImportWsdlToCollection(msg, this._post);
        break;

      // ── AI Protocol ──
      case 'ai:send':
        handleAiSend(msg, this._post);
        break;
      case 'ai:cancel':
        handleAiCancel(msg, this._post);
        break;
      case 'ai:saveConversation':
        handleAiSaveConversation(msg, this._post);
        break;
      case 'ai:loadConversations':
        handleAiLoadConversations(msg, this._post);
        break;
      case 'ai:loadConversation':
        handleAiLoadConversation(msg, this._post);
        break;
      case 'ai:deleteConversation':
        handleAiDeleteConversation(msg, this._post);
        break;
      case 'ai:clearConversations':
        handleAiClearConversations(msg, this._post);
        break;
      case 'ai:discovery:start':
        handleAiDiscovery(msg, this._post);
        break;
      // Legacy streaming contract used by 31 AI modals — see ai-handler.ts's
      // runLegacyAiStream doc comment (E-ai-dead-message-contracts-fix).
      case 'aiChat':
        handleAiChat(msg, this._post);
        break;
      case 'aiStream':
        handleAiStream(msg, this._post);
        break;
      case 'aiStreamRequest':
        handleAiStreamRequest(msg, this._post);
        break;
      case 'fuzz:run':
        handleAiFuzz(msg, this._post);
        break;
      case 'copilot:models': {
        const { getCopilotModels } = require('../../ai/copilot-executor');
        getCopilotModels().then((models: Array<{ id: string; name: string; family: string }>) => {
          this._post({ type: 'copilot:models', models });
        }).catch(() => {
          this._post({ type: 'copilot:models', models: [] });
        });
        break;
      }
      case 'ai:mcp:connect':
        handleAiMcpConnect(msg, this._post);
        break;
      case 'ai:mcp:disconnect':
        handleAiMcpDisconnect(msg, this._post);
        break;

      // ── MCP Protocol ──
      case 'mcp:connect':
        handleMcpConnect(msg, this._post);
        break;
      case 'mcp:disconnect':
        handleMcpDisconnect(msg, this._post);
        break;
      case 'mcp:callTool':
        handleMcpCallTool(msg, this._post, () => this._sendHistory('mcp'));
        break;
      case 'mcp:getPrompt':
        handleMcpGetPrompt(msg, this._post);
        break;
      case 'mcp:readResource':
        handleMcpReadResource(msg, this._post);
        break;
      case 'mcp:connectServer':
        handleMcpConnectServer(msg, this._post);
        break;
      case 'mcp:disconnectServer':
        handleMcpDisconnectServer(msg, this._post);
        break;
      case 'mcp:callToolOnServer':
        handleMcpCallToolOnServer(msg, this._post);
        break;
      case 'mcp:showServerConfig':
        this._showMcpServerConfig();
        break;

      // ── Mock Server ──
      case 'mockServer:start':
        handleStartMockServer(msg, this._post);
        break;
      case 'mockServer:stop':
        handleStopMockServer(msg, this._post);
        break;
      case 'mockServer:updateRoutes':
        handleUpdateMockRoutes(msg);
        break;
      case 'mockServer:saveAll':
        handleSaveMockConfigs(msg);
        break;
      // ── Doctor / heap ──
      // ── Proxy ──
      // These two cases did not exist. The settings dialog posted
      // 'proxy:configure' into the void and kept its own copy in webview
      // localStorage, so the extension host never learned about a proxy at all.
      case 'proxy:configure': {
        const normalized = normalizeProxyConfig(msg.config as ProxyUiConfig);
        const existing = getSetting<Record<string, unknown>>('general') ?? {};
        setSetting('general', { ...existing, proxy: normalized });
        const summary = resolveProxy(normalized, 'https://example.invalid/');
        this._post({ type: 'proxy:configured', config: toUiProxyConfig(normalized), summary });
        this._post({
          type: 'toast',
          toastType: normalized.mode === 'none' ? 'info' : 'success',
          message: normalized.mode === 'none'
            ? 'Proxy disabled — requests will go direct.'
            : `Proxy saved: ${summary.description}`,
        });
        break;
      }
      case 'proxy:get': {
        const stored = (getSetting<Record<string, unknown>>('general') ?? {}).proxy as ProxyConfig | undefined;
        const cfg = stored ?? DEFAULT_PROXY;
        this._post({
          type: 'proxy:state',
          config: toUiProxyConfig(cfg),
          summary: resolveProxy(cfg, 'https://example.invalid/'),
          unproxied: UNPROXIED_PROTOCOLS,
        });
        break;
      }

      case 'heap:open':
        handleHeapOpen(this._post, this._extensionUri.fsPath);
        break;
      case 'heap:analyze':
        handleHeapAnalyze(msg, this._post, this._extensionUri.fsPath);
        break;
      case 'heap:cancel':
        handleHeapCancel(this._post);
        break;
      case 'heap:query':
        handleHeapQuery(msg, this._post);
        break;
      case 'heap:setBaseline':
        handleHeapSetBaseline(this._post);
        break;
      case 'heap:locateClass':
        handleHeapLocateClass(msg, this._post);
        break;
      case 'heap:openSource':
        handleHeapOpenSource(msg);
        break;
      case 'threads:open':
        handleThreadsOpen(this._post, this._extensionUri.fsPath);
        break;
      case 'threads:analyze':
        handleThreadsAnalyze(msg, this._post, this._extensionUri.fsPath);
        break;
      case 'logs:open':
        handleLogsOpen(this._post, this._extensionUri.fsPath);
        break;
      case 'logs:analyze':
        handleLogsAnalyze(msg, this._post, this._extensionUri.fsPath);
        break;

      case 'mockServer:getAll':
        handleGetMockServerState(this._post);
        break;
      case 'mockServer:patchStateMachine':
        handlePatchStateMachine(msg);
        break;
      case 'mockServer:importSpec':
        handleImportMockSpec(msg, this._post);
        break;
      case 'mockServer:pickBodyFile': {
        const callbackId = msg.callbackId as string;
        vscode.window.showOpenDialog({
          canSelectMany: false,
          canSelectFolders: false,
          openLabel: 'Select file',
          title: 'Select response body file',
        }).then(uris => {
          if (uris && uris.length > 0) {
            this._post({ type: 'mockServer:bodyFilePicked', callbackId, filePath: uris[0].fsPath });
          }
        });
        break;
      }

      case 'exportMockServer': {
        const content = msg.content as string ?? '';
        const filename = msg.filename as string ?? 'mock-server.js';
        vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(filename),
          filters: { 'All Files': ['*'] },
          saveLabel: 'Save',
          title: 'Save Mock Server File',
        }).then(uri => {
          if (uri) {
            fs.writeFileSync(uri.fsPath, content, 'utf-8');
          }
        });
        break;
      }

      // Real WireMock project export — mappings/*.json + __files/*, zipped so it
      // can be unzipped straight into a WireMock --root-dir.
      case 'exportMockServerWiremockZip': {
        const mappings = (msg.mappings as { filename: string; content: string }[]) ?? [];
        const files = (msg.files as { filename: string; content: string }[]) ?? [];
        const filename = (msg.filename as string) ?? 'wiremock-export.zip';
        vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(filename),
          filters: { 'Zip Archive': ['zip'] },
          saveLabel: 'Save',
          title: 'Save WireMock Export',
        }).then(uri => {
          if (!uri) return;
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { ZipArchive } = require('archiver');
          const output = fs.createWriteStream(uri.fsPath);
          const archive = new ZipArchive({ zlib: { level: 9 } });
          archive.pipe(output);
          for (const m of mappings) archive.append(m.content, { name: `mappings/${m.filename}` });
          for (const f of files) archive.append(f.content, { name: `__files/${f.filename}` });
          archive.finalize();
        });
        break;
      }

      // ── State Machine Workflows ──
      case 'smWorkflow:getAll':
        handleSmWorkflowGetAll(this._post);
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
      case 'mockServer:setPortRange':
        handleSetMockPortRange(msg, this._post);
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

      // ── Cookie Jar ──
      case 'getCookiesForDomain': {
        const domain = msg.domain as string;
        const cookies = domain ? getCookies(domain) : [];
        this._post({ type: 'cookiesForDomain', domain, cookies });
        break;
      }

      // ── Utility ──
      case 'rebuildSqlite':
        vscode.commands.executeCommand('daakia.rebuildSqlite');
        break;
      case 'openExternalUrl':
        if (msg.url && typeof msg.url === 'string') {
          vscode.env.openExternal(vscode.Uri.parse(msg.url));
        }
        break;
      case 'openFilePath':
        if (msg.filePath && typeof msg.filePath === 'string' && fs.existsSync(msg.filePath)) {
          vscode.env.openExternal(vscode.Uri.file(msg.filePath));
        }
        break;
      case 'replSendRequest':
        this._handleReplSendRequest(msg);
        break;
      case 'replEval':
        this._handleReplEval(msg);
        break;
      case 'importCollectionRequest':
        vscode.commands.executeCommand('daakia.importCollection');
        break;
      case 'importBrunoRequest':
        vscode.commands.executeCommand('daakia.importBrunoCollection');
        break;
      case 'importCollectionDaakia':
        vscode.commands.executeCommand('daakia.importDaakiaCollection');
        break;
      case 'openSaveAs':
        this.postMessage({ type: 'openSaveAs', tabId: msg.tabId });
        break;
      case 'checkFilePaths': {
        // Verify which file paths still exist on disk (for history/collection file uploads)
        const paths = msg.filePaths as string[] || [];
        const exists = paths.map(p => !!p && fs.existsSync(p));
        this._post({ type: 'checkFilePathsResult', tabId: msg.tabId, rowId: msg.rowId, fileExists: exists });
        break;
      }

      // ── History ──
      case 'getHistory':
        this._sendHistory(msg.protocol as string | undefined);
        break;
      case 'clearHistory':
        archiveHistoryBatch(msg.protocol as string | undefined);
        this._sendHistory(msg.protocol as string | undefined);
        break;
      case 'deleteHistoryEntry':
        archiveHistoryEntry(msg.id as number);
        this._sendHistory(msg.protocol as string | undefined);
        break;

      // ── Environments ──
      case 'getEnvironments':
        handleGetEnvironments(this._post);
        break;
      case 'saveEnvironments':
        handleSaveEnvironments(msg);
        break;
      case 'exportEnvironmentsJson':
        handleExportEnvironmentsJson(msg, this._post);
        break;
      case 'importEnvironmentsJson':
        handleImportEnvironmentsJson(this._post);
        break;
      case 'importEnvironmentsPostman':
        handleImportEnvironmentsPostman(this._post);
        break;
      case 'importEnvironmentsInsomnia':
        handleImportEnvironmentsInsomnia(this._post);
        break;
      case 'importEnvironmentsGist':
        handleImportEnvironmentsGist(msg, this._post);
        break;
      case 'exportEnvironmentsGist':
        handleExportEnvironmentsGist(msg, this._post);
        break;
      case 'importEnvironmentsDotEnv':
        handleImportEnvironmentsDotEnv(this._post);
        break;
      case 'exportEnvironmentsPostman':
        handleExportEnvironmentsPostman(msg, this._post);
        break;
      case 'exportEnvironmentsBruno':
        handleExportEnvironmentsBruno(msg, this._post);
        break;
      case 'exportEnvironmentsInsomnia':
        handleExportEnvironmentsInsomnia(msg, this._post);
        break;
      case 'exportEnvironmentsHttpie':
        handleExportEnvironmentsHttpie(msg, this._post);
        break;

      // ── Collections ──
      case 'getCollections':
        handleGetCollections(this._post, msg.protocol as string | undefined);
        break;
      case 'clearCollections':
        handleClearCollections(this._post, msg.protocol as string | undefined);
        break;
      case 'getCollectionTree':
        handleGetCollectionTree(this._post, msg.protocol as string | undefined);
        break;
      case 'getCollectionChildren':
        handleGetCollectionChildren(msg, this._post);
        break;
      case 'getCollectionBreadcrumb':
        handleGetCollectionBreadcrumb(msg, this._post);
        break;
      case 'createCollection':
        handleCreateCollection(msg, this._post);
        break;
      case 'createFolder':
        handleCreateFolder(msg, this._post);
        break;
      case 'renameCollection':
        handleRenameCollection(msg, this._post);
        break;
      case 'renameRequest':
        handleRenameRequest(msg, this._post);
        break;
      case 'deleteCollection':
        handleDeleteCollection(msg, this._post);
        break;
      case 'moveCollection':
        handleMoveCollection(msg, this._post);
        break;
      case 'saveCollection':
        handleSaveCollection(msg, this._post);
        break;
      case 'saveRequestToCollection':
        handleSaveRequestToCollection(msg, this._post);
        break;
      case 'deleteRequestFromCollection':
        handleDeleteRequestFromCollection(msg, this._post);
        break;
      case 'updateCollectionProperties':
        handleUpdateCollectionProperties(msg);
        break;
      case 'getCollectionProperties':
        handleGetCollectionProperties(msg, this._post);
        break;
      case 'duplicateCollection':
        handleDuplicateCollection(msg, this._post);
        break;
      case 'duplicateRequest':
        handleDuplicateRequest(msg, this._post);
        break;
      case 'reorderCollections':
        handleReorderCollections(msg, this._post);
        break;
      case 'moveRequest':
        handleMoveRequest(msg, this._post);
        break;
      case 'reorderRequests':
        handleReorderRequests(msg, this._post);
        break;
      case 'exportCollectionDaakia':
        handleExportCollectionDaakia(msg, this._post);
        break;
      case 'exportCollectionPostman':
        handleExportCollectionPostman(msg, this._post);
        break;
      case 'exportCollectionBruno':
        handleExportCollectionBruno(msg, this._post);
        break;
      case 'exportCollectionInsomnia':
        handleExportCollectionInsomnia(msg, this._post);
        break;
      case 'exportCollectionHttpie':
        handleExportCollectionHttpie(msg, this._post);
        break;
      case 'exportCollectionOpenApi':
        handleExportCollectionOpenApi(msg, this._post);
        break;
      case 'exportCollectionDocs':
        handleExportCollectionDocs(msg, this._post);
        break;
      case 'runCollection':
        handleRunCollection(msg, this._post);
        break;
      case 'stopCollectionRun':
        handleStopCollectionRun();
        break;

      // ── Settings ──
      case 'getSettings':
        this._sendSettings();
        break;
      case 'saveSettings':
        this._saveSettings(msg);
        break;

      // ── AI Providers ──
      case 'aiProviders:load':
        this._sendAiProviders();
        break;
      case 'aiProviders:save':
        this._saveAiProviders(msg);
        break;

      // ── AI Keys (OS keychain via SecretStorage) ──
      case 'aiKeys:save': {
        const { providerId, token } = msg as unknown as { providerId: string; token: string };
        if (providerId && token) {
          storeApiKey(providerId, token).then(() => {
            this._refreshKeyStatus();
          }).catch((err) => {
            console.error('[aiKeys:save] SecretStorage error:', err);
          });
        }
        break;
      }
      case 'aiKeys:delete': {
        const { providerId } = msg as unknown as { providerId: string };
        if (providerId) {
          deleteApiKey(providerId).then(() => {
            this._refreshKeyStatus();
          }).catch((err) => {
            console.error('[aiKeys:delete] SecretStorage error:', err);
          });
        }
        break;
      }
      case 'aiKeys:load':
        this._refreshKeyStatus();
        break;

      // ── AI Chat History ──
      case 'aiHistory:save': {
        const session = msg as unknown as Parameters<typeof saveAiChatSession>[0];
        saveAiChatSession(session);
        break;
      }
      case 'aiHistory:load':
        this._post({ type: 'aiHistory:data', sessions: loadAiChatSessions() });
        break;
      case 'aiHistory:delete': {
        const { id } = msg as unknown as { id: string };
        if (id) deleteAiChatSession(id);
        break;
      }
      case 'aiHistory:search': {
        const { query } = msg as unknown as { query: string };
        this._post({ type: 'aiHistory:results', sessions: searchAiChatSessions(query || '') });
        break;
      }

      // ── Daakia AI Conversation (persistent, survives tab close/reopen) ──
      case 'aiConversation:load':
        this._post({ type: 'aiConversation:data', messages: loadAiConversation() });
        break;
      case 'aiConversation:save': {
        const { messages } = msg as unknown as { messages: AiConversationMessage[] };
        if (Array.isArray(messages)) {
          // Trim to maxAiChatMessages from general settings (default 200)
          const general = getSetting<Record<string, unknown>>('general') ?? {};
          const maxAiChat = (general.maxAiChatMessages as number) ?? 200;
          const trimmed = maxAiChat > 0 ? messages.slice(-maxAiChat) : messages;
          saveAiConversation(trimmed);
        }
        break;
      }
      case 'aiConversation:clear':
        clearAiConversation();
        break;

      // ── AI Audit ──
      case 'aiAudit:load': {
        const limit = (msg as unknown as { limit?: number }).limit ?? 100;
        this._post({ type: 'aiAudit:data', entries: getAuditEntries(limit) });
        break;
      }
      case 'aiAudit:delete': {
        const { auditId } = msg as unknown as { auditId: number };
        if (auditId != null) deleteAuditEntry(auditId);
        break;
      }
      case 'aiAudit:deleteMany': {
        const { auditIds } = msg as unknown as { auditIds: number[] };
        if (Array.isArray(auditIds) && auditIds.length > 0) deleteAuditEntries(auditIds);
        break;
      }
      case 'aiAudit:clear':
        clearAuditEntries();
        break;

      // ── UI Audit ──
      case 'uiAudit:log': {
        const { event_type, module, button, action, metadata } = msg as unknown as { event_type: string; module: string; button?: string; action?: string; metadata?: Record<string, unknown> };
        if (event_type && module) {
          insertUiAudit({ event_type, module, button, action, metadata: metadata ? JSON.stringify(metadata) : undefined });
        }
        break;
      }
      case 'uiAudit:load': {
        const limit = (msg as unknown as { limit?: number }).limit ?? 200;
        this._post({ type: 'uiAudit:data', entries: getUiAuditEntries(limit) });
        break;
      }
      case 'uiAudit:clear':
        clearUiAuditEntries();
        break;

      // ── DB Explorer (7.4) ──
      case 'dbExplorer:getTables':
        this._post({ type: 'dbExplorer:tables', tables: getDbTables() });
        break;
      case 'dbExplorer:getRows': {
        const { tableName, limit, offset } = msg as unknown as { tableName: string; limit?: number; offset?: number };
        this._post({ type: 'dbExplorer:rows', tableName, rows: getDbTableRows(tableName, limit ?? 100, offset ?? 0) });
        break;
      }
      case 'dbExplorer:deleteRow': {
        const { tableName, pkCol, pkVal } = msg as unknown as { tableName: string; pkCol: string; pkVal: unknown };
        deleteDbRow(tableName, pkCol, pkVal);
        this._post({ type: 'dbExplorer:rowDeleted', tableName, pkVal });
        break;
      }

      // ── AI Feature Flags ──
      case 'aiFeatures:load':
        this._post({ type: 'aiFeatures:data', features: getAiFeatures() });
        break;
      case 'aiFeatures:save': {
        const { features } = msg as unknown as { features: Parameters<typeof setAiFeatures>[0] };
        if (features) setAiFeatures(features);
        break;
      }

      // ── Prompt Library ──
      case 'promptLibrary:load':
        this._post({ type: 'promptLibrary:data', prompts: getAllPrompts() });
        break;
      case 'promptLibrary:save': {
        const { scenario, prompt } = msg as unknown as { scenario: string; prompt: Parameters<typeof upsertPrompt>[1] };
        if (scenario && prompt) upsertPrompt(scenario, prompt);
        this._post({ type: 'promptLibrary:data', prompts: getAllPrompts() });
        break;
      }
      case 'promptLibrary:reset': {
        const { scenario } = msg as unknown as { scenario: string };
        if (scenario) resetPrompt(scenario);
        this._post({ type: 'promptLibrary:data', prompts: getAllPrompts() });
        break;
      }

      // ── AI Prompt Templates ──
      case 'aiPromptTemplates:load':
        this._post({ type: 'aiPromptTemplates:data', templates: getAiPromptTemplates() });
        break;
      case 'aiPromptTemplates:save': {
        const { templates: tpls } = msg as unknown as { templates: Record<string, string> };
        if (tpls && typeof tpls === 'object') setAiPromptTemplates(tpls);
        break;
      }

      // ── UI State ──
      case 'saveUiState':
        handleSaveUiState(msg as unknown as { data: { panelHeights: Record<string, number>; scrollPositions: Record<string, number>; prefs?: Record<string, string> } });
        break;
      case 'getUiState':
        handleGetUiState(this._post);
        break;
      case 'saveWorkspaceSnapshot':
        handleSaveWorkspaceSnapshot(msg as any);
        break;
      case 'getWorkspaceSnapshot':
        handleGetWorkspaceSnapshot(this._post);
        break;

      // ── Git Sync ──
      case 'gitSync:getSettings':
        handleGitSyncGetSettings(this._post);
        break;
      case 'gitSync:saveSettings':
        handleGitSyncSaveSettings(msg as unknown as {
          settings: {
            autoSyncSeconds?: number; remoteUrl?: string; branch?: string;
            syncHistory?: boolean; syncCollections?: boolean; syncMockServers?: boolean;
            syncEnvironments?: boolean; syncAiConfig?: boolean;
          };
        }, this._post)
          .then(() => this._restartAutoSyncTimer());
        break;
      case 'gitSync:getStatus':
        handleGitSyncGetStatus(this._post);
        break;
      case 'gitSync:init':
        handleGitSyncInit(this._post);
        break;
      case 'gitSync:syncNow':
        handleGitSyncNow(this._post).then(() => this._broadcastSyncedData());
        break;
      case 'gitSync:exportOnly':
        handleGitSyncExportOnly(this._post);
        break;
      case 'gitSync:importOnly':
        handleGitSyncImportOnly(this._post);
        this._broadcastSyncedData();
        break;

      // ── Vault (Environments secret encryption) ──
      case 'vault:getStatus':
        handleVaultGetStatus(this._post);
        break;
      case 'vault:setPassphrase':
        handleVaultSetPassphrase(msg as unknown as { passphrase: string }, this._post)
          .then(() => handleGetEnvironments(this._post));
        break;
      case 'vault:unlock':
        handleVaultUnlock(msg as unknown as { passphrase: string }, this._post)
          .then(() => handleGetEnvironments(this._post));
        break;
      case 'vault:lock':
        handleVaultLock(this._post);
        break;
      case 'vault:clear':
        handleVaultClear(this._post);
        break;

      // ── Bin (soft delete / restore) ──
      case 'bin:getEntries':
        handleBinGetEntries(msg as unknown as { category?: 'history' | 'collection' | 'collection_request' | 'mock_server' | 'environment' }, this._post);
        break;
      case 'bin:restore':
        handleBinRestore(msg as unknown as { id: string }, this._post);
        this._broadcastSyncedData();
        handleGetEnvironments(this._post);
        break;
      case 'bin:restoreGroup':
        handleBinRestoreGroup(msg as unknown as { groupId: string }, this._post);
        this._broadcastSyncedData();
        handleGetEnvironments(this._post);
        break;
      case 'bin:permanentlyDelete':
        handleBinPermanentlyDelete(msg as unknown as { id: string }, this._post);
        break;
      case 'bin:permanentlyDeleteGroup':
        handleBinPermanentlyDeleteGroup(msg as unknown as { groupId: string }, this._post);
        break;
      case 'bin:empty':
        handleBinEmpty(msg as unknown as { category?: 'history' | 'collection' | 'collection_request' | 'mock_server' | 'environment' }, this._post);
        break;

      case 'getPerformanceData':
        this._sendPerformanceData();
        break;

      case 'fetchUrl': {
        const { reqId, url: fetchUrlTarget } = msg as unknown as { reqId: string; url: string };
        this._fetchExternalUrl(reqId, fetchUrlTarget);
        break;
      }

      // ── Wiki capture automation (E-wiki-capture-plumbing, test/orchestrator only) ──
      case 'wiki:capture:ack':
        console.log('[wiki:capture] webview acked', (msg as unknown as { id: string }).id);
        break;
      case 'wiki:capture:result':
      case 'wiki:capture:error':
        MainPanel.onCaptureMessage?.(msg as unknown as { type: string; id: string; html?: string; error?: string });
        break;

      default:
        break;
    }
  }

  // ─────────────────── External URL Fetch (proxy for webview) ──────────────────

  private async _fetchExternalUrl(reqId: string, url: string): Promise<void> {
    try {
      const https = await import('https');
      const http = await import('http');
      const urlModule = await import('url');

      const parsed = new urlModule.URL(url);
      const lib = parsed.protocol === 'https:' ? https : http;

      const content = await new Promise<string>((resolve, reject) => {
        const req = lib.get(url, {
          headers: {
            'Accept': 'application/json,application/yaml,text/yaml,text/plain,*/*',
            'User-Agent': 'Daakia/1.0',
          },
          timeout: 15000,
        }, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
            }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
      });

      this.postMessage({ type: 'fetchUrlResult', reqId, content, error: null });
    } catch (err: any) {
      this.postMessage({ type: 'fetchUrlResult', reqId, content: null, error: err?.message || 'Fetch failed' });
    }
  }

  // ────────────────── Performance Data ──────────────────

  private _sendPerformanceData() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptimeSeconds = process.uptime();
    // CPU percentage approximation (microseconds to percentage of 1 core)
    const cpuPercent = ((cpuUsage.user + cpuUsage.system) / (uptimeSeconds * 1_000_000)) * 100;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const os = require('os') as typeof import('os');
    this.postMessage({
      type: 'performanceData',
      data: {
        cpuUsage: Math.min(cpuPercent, 100),
        memoryUsage: memUsage.rss,
        uptime: uptimeSeconds,
        processId: process.pid,
        // Extended memory breakdown (7.1)
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
  }

  // ────────────────── MCP Server Config ──────────────────

  private _showMcpServerConfig(): void {
    const extensionPath = this._extensionUri.fsPath;
    const serverPath = path.join(extensionPath, 'dist', 'daakia-mcp-server.js');

    const configJson = JSON.stringify({
      mcpServers: {
        daakia: {
          command: 'node',
          args: [serverPath],
        },
      },
    }, null, 2);

    const message = [
      'Add to your Claude Desktop config (~/.config/claude/claude_desktop_config.json):',
      '',
      configJson,
      '',
      'Or for Cursor/other clients, add under "mcpServers":',
      `  "daakia": { "command": "node", "args": ["${serverPath}"] }`,
    ].join('\n');

    void vscode.window.showInformationMessage(
      'Daakia MCP Server Config',
      { modal: true, detail: message },
      'Copy Config',
    ).then(selection => {
      if (selection === 'Copy Config') {
        void vscode.env.clipboard.writeText(configJson);
        void vscode.window.showInformationMessage('Daakia MCP config copied to clipboard!');
      }
    });
  }

  // ────────────────── History (inline — too small to extract) ──────────────────

  private _sendHistory(protocol?: string) {
    const entries = getHistory(100, 0, protocol);
    this.postMessage({ type: 'historyData', entries, protocol: protocol || 'rest' });
  }

  // ────────────────── REPL sendRequest (HTTP via extension host) ──────────────────

  private async _handleReplSendRequest(msg: Record<string, unknown>) {
    const nonce = msg.nonce as string;
    const opts = msg.opts as { method?: string; url?: string; headers?: Record<string, string>; body?: string; timeout?: number } | undefined;

    if (!opts?.url) {
      this.postMessage({ type: 'replSendRequestResult', nonce, result: { status: 0, statusText: 'Missing URL', headers: {}, body: '', time: 0 } });
      return;
    }

    const startTime = Date.now();
    try {
      const axios = (await import('axios')).default;
      const resp = await axios({
        method: (opts.method || 'GET').toLowerCase() as any,
        url: opts.url,
        headers: opts.headers || {},
        data: opts.body || undefined,
        timeout: opts.timeout || 30000,
        validateStatus: () => true, // Don't throw on non-2xx
        transformResponse: [(data: any) => data], // Keep raw string
      });

      const elapsed = Date.now() - startTime;
      const respHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(resp.headers || {})) {
        respHeaders[k] = String(v);
      }

      this.postMessage({
        type: 'replSendRequestResult',
        nonce,
        result: {
          status: resp.status,
          statusText: resp.statusText,
          headers: respHeaders,
          body: typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data),
          time: elapsed,
        },
      });
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      this.postMessage({
        type: 'replSendRequestResult',
        nonce,
        result: {
          status: 0,
          statusText: err.code || err.message || 'Request failed',
          headers: {},
          body: err.message || String(err),
          time: elapsed,
        },
      });
    }
  }

  // ────────────────── REPL Eval (vm sandbox) ──────────────────

  private async _handleReplEval(msg: Record<string, unknown>) {
    const nonce = msg.nonce as string;
    const code = msg.code as string;
    const context = msg.context as {
      envVars: Record<string, string>;
      globalVars: Record<string, string>;
      collectionVars: Record<string, string>;
      request: { method: string; url: string; headers: Record<string, string>; body: string | null };
      response: { status: number; statusText: string; headers: Record<string, string>; body: string; time: number; size: number } | null;
    } | undefined;

    if (!code) {
      this.postMessage({ type: 'replEvalResult', nonce, result: { logs: [], result: undefined, error: undefined, envUpdates: {}, globalUpdates: {} } });
      return;
    }

    try {
      const vm = await import('vm');
      const crypto = await import('crypto');

      const envVars = { ...(context?.envVars || {}) };
      const globalVars = { ...(context?.globalVars || {}) };
      const collectionVars = { ...(context?.collectionVars || {}) };
      const logs: { level: string; args: unknown[]; timestamp: number }[] = [];

      // Safe clone for structured logs
      const safeClone = (arg: unknown): unknown => {
        if (arg === null || arg === undefined) return arg;
        if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') return arg;
        try { return JSON.parse(JSON.stringify(arg)); } catch { return String(arg); }
      };

      // Sandboxed console
      const sandboxConsole = {
        log: (...args: unknown[]) => { logs.push({ level: 'log', args: args.map(safeClone), timestamp: Date.now() }); },
        info: (...args: unknown[]) => { logs.push({ level: 'info', args: args.map(safeClone), timestamp: Date.now() }); },
        warn: (...args: unknown[]) => { logs.push({ level: 'warn', args: args.map(safeClone), timestamp: Date.now() }); },
        error: (...args: unknown[]) => { logs.push({ level: 'error', args: args.map(safeClone), timestamp: Date.now() }); },
        debug: (...args: unknown[]) => { logs.push({ level: 'debug', args: args.map(safeClone), timestamp: Date.now() }); },
      };

      // Response object
      const responseObj = context?.response ? Object.freeze({
        ...context.response,
        json: () => { try { return JSON.parse(context.response!.body); } catch { return null; } },
        text: () => context.response!.body,
      }) : { status: 0, statusText: '', headers: {}, body: '', time: 0, size: 0, json: () => null, text: () => '' };

      // dk.sendRequest — uses axios (async)
      const sendRequest = async (opts: { method?: string; url: string; headers?: Record<string, string>; body?: string; timeout?: number }) => {
        const axios = (await import('axios')).default;
        const startTime = Date.now();
        try {
          const resp = await axios({
            method: (opts.method || 'GET').toLowerCase() as any,
            url: opts.url,
            headers: opts.headers || {},
            data: opts.body || undefined,
            timeout: opts.timeout || 30000,
            validateStatus: () => true,
            transformResponse: [(data: any) => data],
          });
          const elapsed = Date.now() - startTime;
          const respHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(resp.headers || {})) { respHeaders[k] = String(v); }
          return {
            status: resp.status,
            statusText: resp.statusText,
            headers: respHeaders,
            body: typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data),
            time: elapsed,
            json: () => { try { return JSON.parse(typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)); } catch { return null; } },
            text: () => typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data),
          };
        } catch (err: any) {
          return { status: 0, statusText: err.message || 'Request failed', headers: {}, body: '', time: Date.now() - startTime, json: () => null, text: () => '' };
        }
      };

      // Variable stores
      const makeVarStore = (vars: Record<string, string>) => ({
        get: (key: string) => vars[key],
        set: (key: string, val: unknown) => { vars[key] = String(val); },
        has: (key: string) => key in vars,
        unset: (key: string) => { delete vars[key]; },
        toObject: () => ({ ...vars }),
        clear: () => { Object.keys(vars).forEach(k => delete vars[k]); },
      });

      // Expect assertion helper
      const createExpect = (actual: unknown) => ({
        toBe: (expected: unknown) => { if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); },
        toEqual: (expected: unknown) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected deep equal to ${JSON.stringify(expected)}`); },
        toBeTruthy: () => { if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`); },
        toBeFalsy: () => { if (actual) throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`); },
        toBeGreaterThan: (n: number) => { if ((actual as number) <= n) throw new Error(`Expected > ${n}, got ${actual}`); },
        toBeLessThan: (n: number) => { if ((actual as number) >= n) throw new Error(`Expected < ${n}, got ${actual}`); },
        toContain: (item: unknown) => { if (!(actual as any[]).includes(item)) throw new Error(`Does not contain ${JSON.stringify(item)}`); },
        toHaveProperty: (key: string) => { if (typeof actual !== 'object' || actual === null || !(key in actual)) throw new Error(`Missing property "${key}"`); },
        toHaveLength: (n: number) => { if ((actual as any[]).length !== n) throw new Error(`Expected length ${n}, got ${(actual as any[]).length}`); },
        toMatch: (pattern: RegExp) => { if (!pattern.test(String(actual))) throw new Error(`Does not match ${pattern}`); },
        toBeNull: () => { if (actual !== null) throw new Error(`Expected null, got ${JSON.stringify(actual)}`); },
        toBeUndefined: () => { if (actual !== undefined) throw new Error(`Expected undefined`); },
        toBeDefined: () => { if (actual === undefined) throw new Error(`Expected defined`); },
        toMatchSchema: (schema: Record<string, unknown>) => {
          const errors = validateJsonSchemaLight(actual, schema, '$');
          if (errors.length > 0) {
            throw new Error(`Schema validation failed:\n  - ${errors.slice(0, 10).join('\n  - ')}${errors.length > 10 ? `\n  ... and ${errors.length - 10} more` : ''}`);
          }
        },
        not: {
          toBe: (expected: unknown) => { if (actual === expected) throw new Error(`Expected NOT ${JSON.stringify(expected)}`); },
          toEqual: (expected: unknown) => { if (JSON.stringify(actual) === JSON.stringify(expected)) throw new Error(`Expected NOT deep equal`); },
          toBeTruthy: () => { if (actual) throw new Error(`Expected NOT truthy`); },
          toContain: (item: unknown) => { if ((actual as any[]).includes(item)) throw new Error(`Should not contain ${JSON.stringify(item)}`); },
        },
      });

      const daakiaApi = {
        env: makeVarStore(envVars),
        environment: makeVarStore(envVars),
        globals: makeVarStore(globalVars),
        collectionVariables: makeVarStore(collectionVars),
        request: Object.freeze({ ...(context?.request || { method: 'GET', url: '', headers: {}, body: null }), params: {} }),
        response: responseObj,
        test: (name: string, fn: () => void) => {
          try { fn(); sandboxConsole.info(`✓ ${name}`); }
          catch (e: any) { sandboxConsole.error(`✗ ${name}: ${e.message}`); }
        },
        expect: createExpect,
        sendRequest,
        interpolate: (str: string) => {
          return str.replace(/\{\{([\w.\-]+)\}\}|\$\{([\w.\-]+)\}/g, (match: string, braceVar: string, dollarVar: string) => {
            const varName = braceVar || dollarVar;
            if (varName in envVars) return envVars[varName];
            if (varName in globalVars) return globalVars[varName];
            if (varName in collectionVars) return collectionVars[varName];
            return match;
          });
        },
        runner: { setNextRequest: (_name: string) => {} },
        info: () => ({ version: '1.0.0', runtime: 'Daakia REPL (extension host vm sandbox)' }),
      };

      const sandbox: Record<string, unknown> = {
        dk: daakiaApi,
        daakia: daakiaApi,
        console: sandboxConsole,
        JSON, parseInt, parseFloat, isNaN, isFinite,
        encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
        atob: (str: string) => Buffer.from(str, 'base64').toString('binary'),
        btoa: (str: string) => Buffer.from(str, 'binary').toString('base64'),
        Date, Math, Object, Array, String, Number, Boolean, RegExp,
        Error, TypeError, RangeError, Map, Set, WeakMap, WeakSet,
        Promise, Symbol, Proxy, Reflect,
        crypto: {
          randomUUID: () => crypto.randomUUID(),
          randomBytes: (size: number) => crypto.randomBytes(size),
          createHash: (algo: string) => crypto.createHash(algo),
          createHmac: (algo: string, key: string) => crypto.createHmac(algo, key),
        },
        setTimeout: undefined,
        setInterval: undefined,
      };

      const vmContext = vm.createContext(sandbox);

      // Expression-first: try wrapping as (expr), fall back to statements
      let wrappedCode: string;
      try {
        new vm.Script(`"use strict"; return (${code});`, { filename: 'repl-check.js' });
        wrappedCode = `"use strict"; (async () => { return (${code}); })()`;
      } catch {
        wrappedCode = `"use strict"; (async () => { ${code} })()`;
      }

      const script = new vm.Script(wrappedCode, { filename: 'repl.js' });
      const resultPromise = script.runInContext(vmContext, { timeout: 10000 });
      const result = await resultPromise;

      // Compute diffs for env/global var updates
      const envUpdates: Record<string, string> = {};
      const globalUpdates: Record<string, string> = {};
      for (const [k, v] of Object.entries(envVars)) {
        if (v !== (context?.envVars?.[k] ?? undefined)) envUpdates[k] = v;
      }
      for (const [k, v] of Object.entries(globalVars)) {
        if (v !== (context?.globalVars?.[k] ?? undefined)) globalUpdates[k] = v;
      }

      this.postMessage({
        type: 'replEvalResult',
        nonce,
        result: { logs, result: safeClone(result), error: undefined, envUpdates, globalUpdates },
      });
    } catch (err: any) {
      this.postMessage({
        type: 'replEvalResult',
        nonce,
        result: { logs: [], result: undefined, error: err.message || String(err), envUpdates: {}, globalUpdates: {} },
      });
    }
  }

  // ────────────────── Settings (inline — too small to extract) ──────────────────

  private _sendSettings() {
    const defaults = {
      followRedirects: true,
      sslVerification: true,
      timeout: 0,
      encoding: 'enable',
      saveResponseInHistory: true,
      proxy: { mode: 'none' },
    };
    const stored = getSetting<Record<string, unknown>>('general') ?? {};
    const settings = { ...defaults, ...stored };
    this.postMessage({ type: 'settingsData', settings });
  }

  private _saveSettings(msg: Record<string, unknown>) {
    const settings = msg.settings as Record<string, unknown>;
    const existing = getSetting<Record<string, unknown>>('general') ?? {};
    setSetting('general', { ...existing, ...settings });
  }

  // ────────────────── AI Providers (inline — small) ──────────────────

  private _sendAiProviders() {
    const providers = getSetting<unknown[]>('aiProviders');
    const defaultProviderId = getSetting<string>('aiDefaultProvider') ?? 'copilot';
    const defaultModelId = getSetting<string>('aiDefaultModel') ?? 'auto';
    this.postMessage({ type: 'aiProviders:data', providers: providers ?? null, defaultProviderId, defaultModelId });
  }

  private _saveAiProviders(msg: Record<string, unknown>) {
    const providers = msg.providers as unknown[];
    setSetting('aiProviders', providers);
    if (msg.defaultProviderId) { setSetting('aiDefaultProvider', msg.defaultProviderId as string); }
    if (msg.defaultModelId) { setSetting('aiDefaultModel', msg.defaultModelId as string); }
  }

  private _refreshKeyStatus() {
    const { AI_PROVIDERS } = require('../../ai/ai-providers');
    const providerIds = (AI_PROVIDERS as { id: string }[]).map(p => p.id);
    getAllKeyStatus(providerIds).then((status) => {
      this._post({ type: 'aiKeys:status', status });
    }).catch(() => {
      this._post({ type: 'aiKeys:status', status: {} });
    });
  }

  // ────────────────── HTML ──────────────────

  private _getHtml(): string {
    const webview = this._panel.webview;

    const distPath = vscode.Uri.joinPath(this._extensionUri, 'webview', 'dist');
    const indexHtmlPath = path.join(distPath.fsPath, 'index.html');

    if (fs.existsSync(indexHtmlPath)) {
      let html = fs.readFileSync(indexHtmlPath, 'utf-8');
      const baseUri = webview.asWebviewUri(distPath);
      html = html.replace(/(href|src)="\.?\/?/g, `$1="${baseUri.toString()}/`);
      html = html.replace(
        '<head>',
        `<head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline' blob:; font-src ${webview.cspSource} data:; worker-src ${webview.cspSource} blob:;">`
      );
      return html;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    body { font-family: var(--vscode-font-family); background: #1e1e2e; color: #e4e4ed; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .center { text-align: center; }
    h1 { color: #6366f1; margin-bottom: 8px; }
    p { color: #a1a1b5; font-size: 13px; }
    code { background: #2e2e42; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="center">
    <h1>Daakia</h1>
    <p>Webview not built yet. Run:</p>
    <p><code>cd webview-ui && npm install && npm run build</code></p>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

// ────────────── JSON Schema Validator (lightweight, for REPL) ──────────────

function validateJsonSchemaLight(value: unknown, schema: Record<string, unknown>, path: string): string[] {
  const errors: string[] = [];
  const p = path || '$';

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (actualType === 'number' && types.includes('integer')) {
      if (!Number.isInteger(value)) errors.push(`${p}: expected integer, got float`);
    } else if (!types.includes(actualType)) {
      errors.push(`${p}: expected type ${types.join('|')}, got ${actualType}`);
      return errors;
    }
  }

  if (schema.enum && Array.isArray(schema.enum)) {
    if (!schema.enum.includes(value)) {
      errors.push(`${p}: value ${JSON.stringify(value)} not in enum`);
    }
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) errors.push(`${p}: string length < minLength ${schema.minLength}`);
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) errors.push(`${p}: string length > maxLength ${schema.maxLength}`);
    if (schema.pattern && typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) errors.push(`${p}: string does not match pattern`);
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${p}: ${value} < minimum ${schema.minimum}`);
    if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${p}: ${value} > maximum ${schema.maximum}`);
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < (schema.minItems as number)) errors.push(`${p}: array length < minItems`);
    if (typeof schema.maxItems === 'number' && value.length > (schema.maxItems as number)) errors.push(`${p}: array length > maxItems`);
    if (schema.items && typeof schema.items === 'object') {
      for (let i = 0; i < Math.min(value.length, 20); i++) {
        errors.push(...validateJsonSchemaLight(value[i], schema.items as Record<string, unknown>, `${p}[${i}]`));
      }
    }
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const required = (schema.required as string[]) || [];
    for (const req of required) {
      if (!(req in obj)) errors.push(`${p}: missing required property "${req}"`);
    }
    if (schema.properties && typeof schema.properties === 'object') {
      const props = schema.properties as Record<string, Record<string, unknown>>;
      for (const [key, propSchema] of Object.entries(props)) {
        if (key in obj) errors.push(...validateJsonSchemaLight(obj[key], propSchema, `${p}.${key}`));
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = Object.keys((schema.properties || {}) as object);
      for (const key of Object.keys(obj)) {
        if (!allowed.includes(key)) errors.push(`${p}: unexpected property "${key}"`);
      }
    }
  }

  return errors;
}
