/** Export a history item as a JSON file download */

import { downloadBlob } from '../response/response-helpers';

interface HistoryItem {
  id: number;
  method: string;
  url: string;
  status: number;
  response_time?: number;
  request_data?: string;
  created_at?: string;
}

export function exportHistoryItem(item: HistoryItem) {
  let requestConfig: Record<string, unknown> = {};
  if (item.request_data) {
    try { requestConfig = JSON.parse(item.request_data); } catch { /* ignore */ }
  }

  const exportData = {
    method: item.method,
    url: item.url,
    headers: requestConfig.headers || [],
    params: requestConfig.params || [],
    body: requestConfig.body || '',
    bodyMode: requestConfig.bodyMode || 'none',
    bodyContentType: requestConfig.bodyContentType || '',
    authType: requestConfig.authType || 'none',
    authData: requestConfig.authData || {},
    status: item.status,
    responseTime: item.response_time,
    createdAt: item.created_at,
  };

  let filename: string;
  try {
    const urlStr = item.url.startsWith('http') ? item.url : 'http://' + item.url;
    filename = `${item.method}_${new URL(urlStr).pathname.replace(/\//g, '_') || 'request'}.json`;
  } catch {
    filename = `${item.method}_request.json`;
  }

  downloadBlob(JSON.stringify(exportData, null, 2), filename, 'application/json');
}

/** Export a batch of history items (e.g. everything under one date group, or the whole list) as a single JSON file. */
export function exportHistoryItems(items: HistoryItem[], label: string) {
  const exportData = items.map(item => {
    let requestConfig: Record<string, unknown> = {};
    if (item.request_data) {
      try { requestConfig = JSON.parse(item.request_data); } catch { /* ignore */ }
    }
    return {
      method: item.method,
      url: item.url,
      headers: requestConfig.headers || [],
      params: requestConfig.params || [],
      body: requestConfig.body || requestConfig.bodyRaw || '',
      bodyMode: requestConfig.bodyMode || 'none',
      bodyContentType: requestConfig.bodyContentType || '',
      authType: requestConfig.authType || 'none',
      authData: requestConfig.authData || {},
      status: item.status,
      responseTime: item.response_time,
      createdAt: item.created_at,
    };
  });

  const safeLabel = label.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'history';
  downloadBlob(JSON.stringify(exportData, null, 2), `history_${safeLabel}.json`, 'application/json');
}
