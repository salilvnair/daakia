import { useCollectionsStore } from '../../store/collections-store';
import { useDebugStore } from '../../store/debug-store';
import type { RequestTab, AuthType } from '../../store/tabs-store';
import { postMsg } from '../../vscode';
import { createResolver, resolveKV, resolveObj } from '../resolve/resolve-service';

/** Resolves auth: inherits from collection if request auth is 'none' */
function resolveAuth(tab: RequestTab, resolve: (s: string) => string) {
  const propertiesCache = useCollectionsStore.getState().propertiesCache;
  let authType = tab.authType;
  let authData: Record<string, unknown> = tab.authData;

  if (authType === 'none' && tab.collectionId) {
    const colProps = propertiesCache[tab.collectionId];
    if (colProps && colProps.authType !== 'none') {
      authType = colProps.authType as AuthType;
      authData = colProps.authData;
    }
  }

  return { authType, authData: resolveObj(resolve, authData) };
}

/** Resolves headers: merges collection headers with request headers */
function resolveHeaders(tab: RequestTab, resolve: (s: string) => string) {
  const propertiesCache = useCollectionsStore.getState().propertiesCache;
  const reqHeaders = resolveKV(resolve, tab.headers.filter(h => h.enabled));

  if (tab.collectionId) {
    const colProps = propertiesCache[tab.collectionId];
    if (colProps && colProps.headers.length > 0) {
      const colHeaders = colProps.headers
        .filter(h => h.enabled && h.key)
        .map(h => ({ key: resolve(h.key), value: resolve(h.value), enabled: true }));
      // Collection headers applied first, request headers override
      const reqKeys = new Set(reqHeaders.map(h => h.key.toLowerCase()));
      const inherited = colHeaders.filter(h => !reqKeys.has(h.key.toLowerCase()));
      return [...inherited, ...reqHeaders];
    }
  }

  return reqHeaders;
}

/** Resolves collection + request scripts into ordered arrays */
function resolveScripts(tab: RequestTab) {
  const propertiesCache = useCollectionsStore.getState().propertiesCache;
  let collectionPreScript = '';
  let collectionPostResponseScript = '';

  if (tab.collectionId) {
    const colProps = propertiesCache[tab.collectionId];
    if (colProps) {
      collectionPreScript = colProps.preRequestScript || '';
      collectionPostResponseScript = colProps.postResponseScript || '';
    }
  }

  return {
    preRequestScripts: [collectionPreScript, tab.preRequestScript].filter(Boolean),
    postResponseScripts: [collectionPostResponseScript, tab.postResponseScript].filter(Boolean),
  };
}

/** Builds the fully-resolved request payload from a tab */
function buildPayload(tab: RequestTab, opts?: { downloadResponse?: boolean }) {
  const resolve = createResolver(tab);
  const auth = resolveAuth(tab, resolve);
  const headers = resolveHeaders(tab, resolve);
  const scripts = resolveScripts(tab);

  return {
    type: 'executeRequest' as const,
    tabId: tab.id,
    envId: tab.envId,
    protocol: tab.protocol || 'rest',
    method: tab.method,
    url: resolve(tab.url),
    headers,
    params: resolveKV(resolve, tab.params.filter(p => p.enabled)),
    bodyMode: tab.bodyMode,
    bodyRaw: resolve(tab.bodyRaw),
    bodyContentType: tab.bodyContentType || 'application/json',
    bodyFormData: tab.bodyFormData
      .filter(f => f.enabled)
      .map(f => {
        const { fileExists, ...rest } = f;
        return { ...rest, key: resolve(f.key), value: resolve(f.value) };
      }),
    bodyUrlEncoded: resolveKV(resolve, tab.bodyUrlEncoded.filter(u => u.enabled)),
    authType: auth.authType,
    authData: auth.authData,
    preRequestScripts: scripts.preRequestScripts,
    postResponseScripts: scripts.postResponseScripts,
    preRequestScript: tab.preRequestScript,
    postResponseScript: tab.postResponseScript,
    variables: tab.variables,
    collectionId: tab.collectionId,
    // Debugger breakpoints — when present, extension uses async debug session
    // Filter out disabled breakpoints so they don't trigger pauses
    // If breakpoints are muted, send empty arrays
    debugBreakpoints: useDebugStore.getState().breakpointsMuted ? {
      preRequest: [],
      postResponse: [],
      preRequestConditions: {},
      postResponseConditions: {},
    } : {
      preRequest: useDebugStore.getState().getBreakpoints(tab.id, 'pre-request')
        .filter(line => !(useDebugStore.getState().disabledBreakpoints[`${tab.id}:pre-request`] || []).includes(line)),
      postResponse: useDebugStore.getState().getBreakpoints(tab.id, 'post-response')
        .filter(line => !(useDebugStore.getState().disabledBreakpoints[`${tab.id}:post-response`] || []).includes(line)),
      preRequestConditions: useDebugStore.getState().conditions[`${tab.id}:pre-request`] || {},
      postResponseConditions: useDebugStore.getState().conditions[`${tab.id}:post-response`] || {},
    },
    ...(opts?.downloadResponse ? { downloadResponse: true } : {}),
  };
}

/** Send the request */
export function sendRequest(tab: RequestTab) {
  postMsg(buildPayload(tab));
}

/** Send and download the response */
export function sendAndDownloadRequest(tab: RequestTab) {
  postMsg(buildPayload(tab, { downloadResponse: true }));
}

/** Cancel an in-flight request */
export function cancelRequest(tabId: string) {
  postMsg({ type: 'cancelRequest', tabId });
}

/** Get the display method label for a tab (e.g. WS, SSE, SIO, MQTT, GQL, GET, POST...) */
export function getDisplayMethod(tab: RequestTab): string {
  if (tab.protocol === 'graphql') return 'GQL';
  if (tab.protocol === 'ai') return 'AI';
  if (tab.protocol === 'mcp') return 'MCP';
  if (tab.protocol === 'soap') return 'SOAP';
  if (tab.protocol === 'grpc') return 'GRPC';
  if (tab.protocol === 'websocket') {
    const rt = tab.authData?.['rt_protocol'] || 'websocket';
    switch (rt) {
      case 'sse': return 'SSE';
      case 'socketio': return 'SIO';
      case 'mqtt': return 'MQTT';
      default: return 'WS';
    }
  }
  return tab.method;
}

/** Save request to its collection */
export function saveRequest(tab: RequestTab) {
  if (tab.collectionId && tab.requestId) {
    // Build protocol-specific data payload
    let data: Record<string, unknown> = {
      headers: tab.headers,
      params: tab.params,
      bodyMode: tab.bodyMode,
      bodyRaw: tab.bodyRaw,
      bodyContentType: tab.bodyContentType,
      bodyFormData: tab.bodyFormData,
      bodyUrlEncoded: tab.bodyUrlEncoded,
      authType: tab.authType,
      authData: tab.authData,
      variables: tab.variables,
      preRequestScript: tab.preRequestScript,
      postResponseScript: tab.postResponseScript,
    };

    if (tab.protocol === 'ai') {
      data = {
        ...data,
        aiProvider: tab.aiProvider,
        aiModel: tab.aiModel,
        aiSystemPrompts: tab.aiSystemPrompts,
        aiUserPrompt: tab.aiUserPrompt,
        aiTools: tab.aiTools,
        aiSettings: tab.aiSettings,
        mcpServerConfigs: (tab as any).mcpServerConfigs,
      };
    } else if (tab.protocol === 'mcp') {
      data = {
        ...data,
        mcpTransport: tab.mcpTransport,
        mcpCommand: tab.mcpCommand,
        mcpArgs: (tab as any).mcpArgs,
        mcpEnvVars: tab.mcpEnvVars,
        mcpSettings: tab.mcpSettings,
      };
    } else if (tab.protocol === 'graphql') {
      data = {
        ...data,
        bodyRaw: tab.bodyRaw,
        gql_variables: tab.authData?.['gql_variables'],
      };
    } else if (tab.protocol === 'grpc') {
      data = {
        ...data,
        grpcMethod: tab.grpcMethod,
        grpcMessage: tab.grpcMessage,
        grpcMetadata: tab.grpcMetadata,
        grpcTls: tab.grpcTls,
        grpcProtoFile: tab.grpcProtoFile,
        preRequestScript: tab.preRequestScript,
        postResponseScript: tab.postResponseScript,
      };
    } else if (tab.protocol === 'soap') {
      data = {
        ...data,
        soapVersion: tab.soapVersion,
        soapAction: tab.soapAction,
        soapOperation: tab.soapOperation,
        soapService: tab.soapService,
        soapEnvelope: tab.soapEnvelope,
        soapWsSecurity: tab.soapWsSecurity,
        soapAssertions: tab.soapAssertions,
        soapAttachments: tab.soapAttachments,
      };
    }

    postMsg({
      type: 'saveRequestToCollection',
      collectionId: tab.collectionId,
      protocol: tab.protocol || 'rest',
      request: {
        id: tab.requestId,
        name: tab.name,
        method: getDisplayMethod(tab),
        url: tab.url,
        data: JSON.stringify(data),
      },
    });

    // Force refresh collections sidebar after save
    postMsg({ type: 'getCollections', protocol: tab.protocol || 'rest' });

    return true; // saved in-place
  }
  postMsg({ type: 'openSaveAs', tabId: tab.id });
  return false; // opened save-as dialog
}
