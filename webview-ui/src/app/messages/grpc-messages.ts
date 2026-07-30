/** gRPC response/stream/reflection messages. Extracted verbatim from the App message handler. */
import { useTabsStore } from '../../store/tabs-store';
import { useUrlSuggestionsStore } from '../../store/url-suggestions-store';
import { useDevToolsStore } from '../../store/devtools-store';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleGrpcMessages(msg: any): boolean {
  switch (msg.type as string) {
        // ─── gRPC Response Messages ───────────────────────────────────────
        case 'grpc:response': {
          const { tabId, response: grpcResp } = msg;
          useTabsStore.getState().updateTab(tabId, {
            response: {
              status: grpcResp.status,
              statusText: grpcResp.statusText,
              headers: grpcResp.headers || {},
              body: grpcResp.body || '',
              size: grpcResp.size || 0,
              time: grpcResp.time || 0,
              contentType: 'application/json',
              cookies: [],
            },
            loading: false,
            requestProgress: undefined,
          });
          // Log to DevTools
          const grpcTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          const grpcName = grpcTab?.grpcMethod || grpcTab?.url || 'gRPC';
          if (grpcResp.status !== 0) {
            useDevToolsStore.getState().addLog({
              level: 'error',
              args: [`[gRPC] ✕ ${grpcName}`, `Status ${grpcResp.status}: ${grpcResp.statusText}`],
              timestamp: Date.now(),
              requestName: grpcName,
              scriptPhase: 'grpc',
            });
          } else {
            useDevToolsStore.getState().addLog({
              level: 'info',
              args: [`[gRPC] ✓ ${grpcName}`, `${grpcResp.time}ms`],
              timestamp: Date.now(),
              requestName: grpcName,
              scriptPhase: 'grpc',
            });
          }
          // Network entry
          useDevToolsStore.getState().addNetworkEntry({
            timestamp: Date.now(),
            method: 'gRPC',
            url: grpcTab?.url || '',
            requestHeaders: Object.fromEntries((grpcTab?.grpcMetadata || []).filter((m: any) => m.enabled && m.key).map((m: any) => [m.key, m.value])),
            requestBody: grpcTab?.grpcMessage || undefined,
            status: grpcResp.status,
            statusText: grpcResp.statusText,
            responseHeaders: grpcResp.headers || {},
            responseBody: grpcResp.body || '',
            duration: grpcResp.time || 0,
            size: grpcResp.size || 0,
            contentType: 'application/grpc',
            protocol: 'grpc',
          });
          // URL suggestions
          if (grpcTab?.url) useUrlSuggestionsStore.getState().addUrls([grpcTab.url], 'grpc');
          break;
        }
        case 'grpc:streamEvent': {
          const { tabId, event: streamEvt } = msg;
          const currentTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          const existing = currentTab?.grpcStreamMessages || [];
          useTabsStore.getState().updateTab(tabId, {
            grpcStreamMessages: [
              ...existing,
              {
                id: crypto.randomUUID(),
                direction: streamEvt.direction,
                data: streamEvt.data,
                timestamp: streamEvt.timestamp,
              },
            ],
          });
          break;
        }
        case 'grpc:streamStatus': {
          const { tabId, status: streamSt } = msg;
          useTabsStore.getState().updateTab(tabId, {
            grpcStreamStatus: streamSt,
            loading: streamSt === 'streaming',
          });
          break;
        }
        case 'grpc:cancelled': {
          const { tabId } = msg;
          useTabsStore.getState().updateTab(tabId, {
            loading: false,
            grpcStreamStatus: 'idle',
          });
          break;
        }
        case 'grpc:reflectResult': {
          const { tabId, services, error, warning } = msg;
          if (error) {
            useTabsStore.getState().updateTab(tabId, {
              grpcReflectionStatus: 'error',
              grpcReflectionError: error,
              grpcServices: undefined,
            });
          } else if (warning) {
            useTabsStore.getState().updateTab(tabId, {
              grpcReflectionStatus: 'warning',
              grpcReflectionError: warning,
              grpcServices: [],
            });
          } else {
            useTabsStore.getState().updateTab(tabId, {
              grpcReflectionStatus: 'connected',
              grpcReflectionError: undefined,
              grpcServices: services || [],
            });
          }
          break;
        }
        case 'grpc:protoUploaded': {
          const { tabId, protoPath } = msg;
          useTabsStore.getState().updateTab(tabId, { grpcProtoFile: protoPath, dirty: true });
          break;
        }
        // ─── SOAP Response Messages ───────────────────────────────────────
    default:
      return false;
  }
  return true;
}
