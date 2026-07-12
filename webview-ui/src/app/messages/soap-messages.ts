/** SOAP response/WSDL/envelope/security messages. Extracted verbatim from the App message handler. */
import { useTabsStore } from '../../store/tabs-store';
import { useToastStore } from '../../store/toast-store';
import { useUrlSuggestionsStore } from '../../store/url-suggestions-store';
import { useDevToolsStore } from '../../store/devtools-store';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSoapMessages(msg: any): boolean {
  switch (msg.type as string) {
        case 'soap:response': {
          const { tabId, response: soapResp } = msg;
          useTabsStore.getState().updateTab(tabId, {
            response: {
              status: soapResp.status,
              statusText: soapResp.statusText,
              headers: soapResp.headers || [],
              body: soapResp.body || '',
              size: soapResp.size || 0,
              time: soapResp.time || 0,
              contentType: 'application/xml',
              cookies: [],
            },
            loading: false,
            requestProgress: undefined,
          });
          // Log to DevTools
          const soapTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          const soapName = soapTab?.soapAction || soapTab?.url || 'SOAP';
          if (soapResp.hasFault || soapResp.status >= 400) {
            useDevToolsStore.getState().addLog({
              level: 'error',
              args: [`[SOAP] ✕ ${soapName}`, `Status ${soapResp.status}: ${soapResp.statusText}`],
              timestamp: Date.now(),
              requestName: soapName,
              scriptPhase: 'soap',
            });
          } else {
            useDevToolsStore.getState().addLog({
              level: 'info',
              args: [`[SOAP] ✓ ${soapName}`, `${soapResp.time}ms`],
              timestamp: Date.now(),
              requestName: soapName,
              scriptPhase: 'soap',
            });
          }
          // Network entry
          useDevToolsStore.getState().addNetworkEntry({
            timestamp: Date.now(),
            method: 'SOAP',
            url: soapTab?.url || '',
            requestHeaders: Object.fromEntries((soapTab?.headers || []).filter((h: any) => h.enabled && h.key).map((h: any) => [h.key, h.value])),
            requestBody: soapTab?.soapEnvelope || undefined,
            status: soapResp.status,
            statusText: soapResp.statusText,
            responseHeaders: soapResp.headers || {},
            responseBody: soapResp.body || '',
            duration: soapResp.time || 0,
            size: soapResp.size || 0,
            contentType: 'application/xml',
            protocol: 'soap',
          });
          // URL suggestions
          if (soapTab?.url) useUrlSuggestionsStore.getState().addUrls([soapTab.url], 'soap');
          break;
        }
        case 'soap:cancelled': {
          const { tabId } = msg;
          useTabsStore.getState().updateTab(tabId, { loading: false, requestProgress: undefined });
          break;
        }
        case 'soap:wsdlLoaded': {
          const { tabId, services, rawWsdl } = msg;
          useTabsStore.getState().updateTab(tabId, { soapServices: services, soapWsdlRaw: rawWsdl || undefined });
          break;
        }
        case 'soap:wsdlError': {
          // Handled by SoapWsdlImport component directly via its own listener
          break;
        }
        case 'soap:wsdlImportedToCollection': {
          const { collectionName, requestCount, serviceCount } = msg;
          useToastStore.getState().addToast({
            type: 'success',
            message: `Imported "${collectionName}" — ${serviceCount} service(s), ${requestCount} operation(s) added to Collections`,
          });
          break;
        }
        case 'soap:envelopeGenerated': {
          const { tabId, envelope } = msg;
          useTabsStore.getState().updateTab(tabId, { soapEnvelope: envelope });
          break;
        }
        case 'soap:securityGenerated': {
          const { tabId, securityXml } = msg;
          // Store security XML for injection into envelope
          const tab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (tab) {
            useTabsStore.getState().updateTab(tabId, {
              soapWsSecurity: { ...(tab.soapWsSecurity || {}), generatedXml: securityXml } as any,
            });
          }
          break;
        }
        case 'soap:securityInjected': {
          const { tabId, envelope } = msg;
          useTabsStore.getState().updateTab(tabId, { soapEnvelope: envelope });
          break;
        }
        case 'soap:fieldsExtracted': {
          const { tabId, fields } = msg;
          useTabsStore.getState().updateTab(tabId, { soapFormData: { fields, values: {} } });
          break;
        }
    default:
      return false;
  }
  return true;
}
