/** Opens a request in a tab — with deduplication and data deserialization.
 *  Shared between CollectionsPanel and HistoryPanel. */

import { useTabsStore } from '../../store/tabs-store';
import { postMsg } from '../../vscode';
import type { CollectionRequest } from './tree-helpers';

/** Derive bodyContentType from bodyMode for legacy saved data missing the field */
function deriveContentType(bodyMode: string): string {
  switch (bodyMode) {
    case 'json': return 'application/json';
    case 'form-data': return 'multipart/form-data';
    case 'x-www-form-urlencoded': return 'application/x-www-form-urlencoded';
    case 'binary': return 'application/octet-stream';
    case 'raw': return 'text/plain';
    case 'graphql': return 'application/graphql';
    case 'xml': return 'application/xml';
    case 'html': return 'text/html';
    case 'javascript': return 'application/javascript';
    case 'yaml': return 'application/yaml';
    case 'none': return 'application/json';
    default: return 'text/plain';
  }
}

interface HistoryItem {
  id: number;
  request_id?: string;
  method: string;
  url: string;
  status: number;
  status_text?: string;
  response_time?: number;
  response_size?: number;
  request_data?: string;
  response_data?: string;
  created_at?: string;
}

/** Open a collection request in a tab (deduplicated unless forced) */
export function openCollectionRequest(req: CollectionRequest, forceNewTab = false, protocol?: string) {
  const { tabs, addTab, setActiveTab } = useTabsStore.getState();

  if (!forceNewTab) {
    const existing = tabs.find(t => t.id === `c_${req.id}` || t.requestId === req.id);
    if (existing) {
      setActiveTab(existing.id);
      return;
    }
  }

  const config = req.data ? JSON.parse(req.data) : {};
  addTab({
    id: forceNewTab ? undefined : `c_${req.id}`,
    protocol: protocol || 'rest',
    method: (req.method as any) || 'GET',
    url: req.url,
    name: req.name,
    collectionId: req.collection_id,
    requestId: req.id,
    headers: Array.isArray(config.headers) ? config.headers : [],
    params: Array.isArray(config.params) ? config.params : [],
    bodyMode: typeof config.bodyMode === 'string' ? config.bodyMode : 'none',
    bodyRaw: typeof config.bodyRaw === 'string' ? config.bodyRaw : '',
    bodyContentType: typeof config.bodyContentType === 'string' ? config.bodyContentType : deriveContentType(config.bodyMode || 'none'),
    bodyFormData: Array.isArray(config.bodyFormData) ? config.bodyFormData : [],
    bodyUrlEncoded: Array.isArray(config.bodyUrlEncoded) ? config.bodyUrlEncoded : [],
    authType: typeof config.authType === 'string' ? config.authType : 'none',
    authData: config.authData && typeof config.authData === 'object' ? config.authData : {},
    preRequestScript: typeof config.preRequestScript === 'string' ? config.preRequestScript : '',
    postResponseScript: typeof config.postResponseScript === 'string' ? config.postResponseScript : (typeof config.testScript === 'string' ? config.testScript : ''),
  } as any);

  // Pre-load collection properties for variable resolution
  postMsg({ type: 'getCollectionProperties', id: req.collection_id });
}

/** Replay a history item in a tab (deduplicated unless forced) */
export function replayHistoryItem(item: HistoryItem, forceNewTab = false, protocol?: string) {
  const { tabs, addTab, setActiveTab } = useTabsStore.getState();

  if (!forceNewTab) {
    const existing = tabs.find(t => t.id === `h_${item.id}`);
    if (existing) {
      setActiveTab(existing.id);
      return;
    }
  }

  let requestConfig: Record<string, unknown> = {};
  if (item.request_data) {
    try { requestConfig = JSON.parse(item.request_data); } catch { /* ignore */ }
  }

  let response = null;
  if (item.response_data) {
    try {
      const parsed = JSON.parse(item.response_data);
      response = {
        status: item.status,
        statusText: item.status_text || '',
        headers: parsed.headers || {},
        body: parsed.body || '',
        size: item.response_size || 0,
        time: item.response_time || 0,
        contentType: parsed.contentType || 'text/plain',
      };
    } catch { /* ignore */ }
  }

  addTab({
    id: forceNewTab ? undefined : `h_${item.id}`,
    protocol: protocol || 'rest',
    method: item.method as any,
    url: item.url,
    headers: (requestConfig.headers as any) || [],
    bodyRaw: (requestConfig.body as string) || (requestConfig.bodyRaw as string) || '',
    bodyMode: (requestConfig.bodyMode as any) || 'none',
    bodyContentType: (requestConfig.bodyContentType as string) || deriveContentType((requestConfig.bodyMode as string) || 'none'),
    params: (requestConfig.params as any) || [],
    authType: (requestConfig.authType as any) || 'none',
    authData: (requestConfig.authData as any) || {},
    bodyFormData: (requestConfig.bodyFormData as any) || [],
    bodyUrlEncoded: (requestConfig.bodyUrlEncoded as any) || [],
    preRequestScript: (requestConfig.preRequestScript as string) || '',
    postResponseScript: (requestConfig.postResponseScript as string) || '',
    // SOAP-specific fields
    ...(protocol === 'soap' ? {
      soapVersion: (requestConfig.soapVersion as string) || '1.1',
      soapAction: (requestConfig.soapAction as string) || '',
      soapOperation: (requestConfig.soapOperation as string) || '',
      soapService: (requestConfig.soapService as string) || '',
      soapEnvelope: (requestConfig.envelope as string) || '',
    } : {}),
    // gRPC-specific fields
    ...(protocol === 'grpc' ? {
      grpcMethod: (requestConfig.grpcMethod as string) || '',
      grpcMessage: (requestConfig.grpcMessage as string) || '{}',
      grpcMetadata: (requestConfig.grpcMetadata as any) || [],
      grpcTls: (requestConfig.grpcTls as boolean) ?? false,
      grpcProtoFile: (requestConfig.grpcProtoFile as string) || undefined,
    } : {}),
    // MCP-specific fields
    ...(protocol === 'mcp' ? {
      mcpTransport: (requestConfig.mcpTransport as string) || 'stdio',
      mcpCommand: (requestConfig.mcpCommand as string) || '',
      mcpArgs: (requestConfig.mcpArgs as string[]) || [],
      mcpServerConfigs: (requestConfig.mcpServerConfigs as any[]) || [],
      mcpEnvVars: (requestConfig.mcpEnvVars as Record<string, string>) || {},
      mcpSettings: (requestConfig.mcpSettings as any) || undefined,
    } : {}),
    // AI-specific fields
    ...(protocol === 'ai' ? {
      aiProvider: (requestConfig.aiProvider as string) || '',
      aiModel: (requestConfig.aiModel as string) || '',
      aiSystemPrompts: (requestConfig.aiSystemPrompts as string[]) || [],
      aiUserPrompt: (requestConfig.aiUserPrompt as string) || '',
      aiTools: (requestConfig.aiTools as any[]) || [],
      aiSettings: (requestConfig.aiSettings as any) || undefined,
      aiConversation: (requestConfig.aiConversation as any[]) || [],
      mcpServerConfigs: (requestConfig.mcpServerConfigs as any[]) || [],
    } : {}),
    response,
  } as any);

  // Verify file paths for form-data file uploads (history doesn't store file content)
  verifyFormDataFilePaths(forceNewTab ? undefined : `h_${item.id}`, requestConfig.bodyFormData as any[]);
}

/** Ask extension to verify file paths exist for form-data file rows */
function verifyFormDataFilePaths(tabId: string | undefined, formData?: any[]) {
  if (!tabId || !formData) return;
  const fileRows = formData.filter((f: any) => f.type === 'file' && f.filePaths?.length > 0);
  for (const row of fileRows) {
    postMsg({ type: 'checkFilePaths', tabId, rowId: row.id, filePaths: row.filePaths });
  }
}
