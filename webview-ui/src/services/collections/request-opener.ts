/** Opens a request in a tab — with deduplication and data deserialization.
 *  Shared between CollectionsPanel and HistoryPanel. */

import { useTabsStore } from '../../store/tabs-store';
import { postMsg } from '../../vscode';
import type { CollectionRequest } from './tree-helpers';

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
}
