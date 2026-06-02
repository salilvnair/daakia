/**
 * SOAP handler — bridges webview messages to soap-executor, wsdl-service, ws-security.
 * Handles invoke, cancel, WSDL loading, and envelope generation.
 */
import { executeSoapRequest, cancelSoapRequest, type SoapInvokeParams } from '../../../soap/soap-executor';
import { loadWsdlFromUrl, loadWsdlFromContent, extractFieldsFromSchema } from '../../../soap/wsdl-service';
import { buildSkeletonEnvelope, injectSecurityHeader } from '../../../soap/soap-envelope-builder';
import { generateWsSecurityHeader, type WsSecurityOptions } from '../../../soap/ws-security';
import { parseSoapUiProject } from '../../../soap/soapui-importer';
import { loadEnvVars, resolveEnvString } from './env-resolver';
import { insertHistory, trimHistory, getSetting } from '../../../storage/db';

type PostMessage = (msg: unknown) => void;

/**
 * Handle soap:invoke — send SOAP request.
 */
export async function handleSoapInvoke(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
  refreshHistory?: () => void,
) {
  const tabId = msg.tabId as string;
  const envId = msg.envId as string | undefined;

  // Resolve environment variables
  const vars = loadEnvVars(envId);
  const endpoint = resolveEnvString(msg.endpoint as string || '', vars);
  const soapVersion = (msg.soapVersion as '1.1' | '1.2') || '1.1';
  const soapAction = resolveEnvString(msg.soapAction as string || '', vars);
  const envelope = resolveEnvString(msg.envelope as string || '', vars);
  const rawHeaders = msg.headers as { key: string; value: string; enabled?: boolean }[] || [];
  const headers = rawHeaders
    .filter(h => h.key && (h.enabled !== false))
    .map(h => ({ key: resolveEnvString(h.key, vars), value: resolveEnvString(h.value, vars) }));

  if (!endpoint) {
    postMessage({
      type: 'soap:response',
      tabId,
      response: {
        status: 0,
        statusText: 'Endpoint is required',
        body: `<?xml version="1.0" encoding="UTF-8"?>\n<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">\n  <soap:Body>\n    <soap:Fault>\n      <faultcode>soap:Client</faultcode>\n      <faultstring>Endpoint URL is required</faultstring>\n    </soap:Fault>\n  </soap:Body>\n</soap:Envelope>`,
        headers: [],
        time: 0,
        size: 0,
        hasFault: true,
      },
    });
    return;
  }

  const params: SoapInvokeParams = {
    tabId,
    endpoint,
    soapVersion,
    soapAction,
    envelope,
    headers,
    attachments: (msg.attachments as { contentId: string; contentType: string; filename: string; base64Data: string }[] | undefined)?.filter(a => a.base64Data),
    timeout: ((getSetting<Record<string, unknown>>('general') ?? {}).timeout as number | undefined) ?? 300000,
  };

  try {
    // Send progress updates
    postMessage({ type: 'requestProgress', tabId, stage: 'pre-request-script', status: 'done' });
    postMessage({ type: 'requestProgress', tabId, stage: 'rendering-request', status: 'done' });
    postMessage({ type: 'requestProgress', tabId, stage: 'sending-request', status: 'running' });

    const result = await executeSoapRequest(params);

    postMessage({ type: 'requestProgress', tabId, stage: 'sending-request', status: 'done' });
    postMessage({ type: 'requestProgress', tabId, stage: 'receiving-response', status: 'done' });

    postMessage({
      type: 'soap:response',
      tabId,
      response: {
        status: result.status,
        statusText: result.statusText,
        body: result.body,
        headers: result.headers,
        time: result.time,
        size: result.size,
        hasFault: result.hasFault,
      },
    });

    // Save to history
    try {
      insertHistory({
        request_id: tabId,
        method: 'SOAP',
        url: endpoint,
        status: result.status,
        status_text: result.statusText,
        response_time: result.time,
        response_size: result.size,
        protocol: 'soap',
        request_data: JSON.stringify({
          soapVersion,
          soapAction,
          soapOperation: msg.soapOperation || '',
          soapService: msg.soapService || '',
          envelope,
          headers: rawHeaders,
        }),
        response_data: JSON.stringify({
          headers: result.headers,
          body: (result.body || '').slice(0, 50000),
          hasFault: result.hasFault,
        }),
      });
      trimHistory(500);
      if (refreshHistory) refreshHistory();
    } catch { /* ignore history errors */ }

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    const errorCode = (err as NodeJS.ErrnoException)?.code || '';
    const detail = errorCode ? `${errorCode}: ${errorMsg}` : errorMsg;
    console.error('[SOAP Request Error]', { endpoint, error: detail, code: errorCode, stack: errorStack });
    const faultBody = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Client</faultcode>
      <faultstring>${escapeXml(detail || 'Unknown error')}</faultstring>
      <detail>
        <errorCode>${escapeXml(errorCode)}</errorCode>
        <message>${escapeXml(errorMsg || 'Request failed')}</message>
        <endpoint>${escapeXml(endpoint)}</endpoint>
      </detail>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;
    postMessage({ type: 'requestProgress', tabId, stage: 'sending-request', status: 'error' });
    postMessage({
      type: 'soap:response',
      tabId,
      response: {
        status: 0,
        statusText: detail || 'Request failed',
        body: faultBody,
        headers: [],
        time: 0,
        size: 0,
        hasFault: true,
      },
    });

    // Save failed request to history
    try {
      insertHistory({
        request_id: tabId,
        method: 'SOAP',
        url: endpoint,
        status: 0,
        status_text: detail || 'Request failed',
        response_time: 0,
        response_size: 0,
        protocol: 'soap',
        request_data: JSON.stringify({
          soapVersion,
          soapAction,
          soapOperation: msg.soapOperation || '',
          soapService: msg.soapService || '',
          envelope,
          headers: rawHeaders,
        }),
      });
      trimHistory(500);
      if (refreshHistory) refreshHistory();
    } catch { /* ignore history errors */ }
  }
}

/**
 * Handle soap:cancel — cancel an active SOAP request.
 */
export function handleSoapCancel(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  cancelSoapRequest(tabId);
  postMessage({ type: 'soap:cancelled', tabId });
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ────────── WSDL Loading ──────────

/**
 * Handle soap:loadWsdl — parse WSDL from URL.
 */
export async function handleLoadWsdl(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const wsdlUrl = msg.url as string;

  if (!wsdlUrl) {
    postMessage({ type: 'soap:wsdlError', tabId, error: 'WSDL URL is required' });
    return;
  }

  try {
    postMessage({ type: 'soap:wsdlLoading', tabId });
    const result = await loadWsdlFromUrl(wsdlUrl);
    postMessage({
      type: 'soap:wsdlLoaded',
      tabId,
      services: result.services,
      rawWsdl: result.rawWsdl,
      filename: result.filename,
      url: result.url,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    postMessage({ type: 'soap:wsdlError', tabId, error: errorMsg });
  }
}

/**
 * Handle soap:loadWsdlContent — parse WSDL from raw XML content (file upload).
 */
export async function handleLoadWsdlContent(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const content = msg.content as string;
  const filename = msg.filename as string || 'uploaded.wsdl';

  if (!content) {
    postMessage({ type: 'soap:wsdlError', tabId, error: 'WSDL content is empty' });
    return;
  }

  try {
    postMessage({ type: 'soap:wsdlLoading', tabId });
    const result = await loadWsdlFromContent(content, filename);
    postMessage({
      type: 'soap:wsdlLoaded',
      tabId,
      services: result.services,
      rawWsdl: result.rawWsdl,
      filename: result.filename,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    postMessage({ type: 'soap:wsdlError', tabId, error: errorMsg });
  }
}

/**
 * Handle soap:generateEnvelope — build skeleton envelope from WSDL operation.
 */
export function handleGenerateEnvelope(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;

  try {
    const envelope = buildSkeletonEnvelope({
      serviceName: msg.serviceName as string || '',
      portName: msg.portName as string || '',
      operationName: msg.operationName as string || '',
      soapVersion: (msg.soapVersion as '1.1' | '1.2') || '1.1',
      soapAction: msg.soapAction as string || '',
      inputSchema: msg.inputSchema as Record<string, unknown> | undefined,
      targetNamespace: msg.targetNamespace as string | undefined,
    });

    postMessage({ type: 'soap:envelopeGenerated', tabId, envelope });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    postMessage({ type: 'soap:envelopeError', tabId, error: errorMsg });
  }
}

/**
 * Handle soap:extractFields — extract form field definitions from operation schema.
 */
export function handleExtractFields(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const inputSchema = msg.inputSchema as Record<string, unknown> | undefined;

  if (!inputSchema) {
    postMessage({ type: 'soap:fieldsExtracted', tabId, fields: [] });
    return;
  }

  try {
    const fields = extractFieldsFromSchema(inputSchema);
    postMessage({ type: 'soap:fieldsExtracted', tabId, fields });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    postMessage({ type: 'soap:fieldsError', tabId, error: errorMsg });
  }
}

/**
 * Handle soap:generateSecurity — generate WS-Security header XML.
 */
export function handleGenerateSecurity(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const envId = msg.envId as string | undefined;
  const vars = loadEnvVars(envId);

  const options: WsSecurityOptions = {
    enabled: msg.enabled as boolean || false,
    username: resolveEnvString(msg.username as string || '', vars),
    password: resolveEnvString(msg.password as string || '', vars),
    passwordType: (msg.passwordType as 'PasswordText' | 'PasswordDigest') || 'PasswordText',
    addNonce: msg.addNonce as boolean || false,
    addCreated: msg.addCreated as boolean || false,
    addTimestamp: msg.addTimestamp as boolean || false,
    timestampTtl: msg.timestampTtl as number || 300,
  };

  try {
    const securityXml = generateWsSecurityHeader(options);
    postMessage({ type: 'soap:securityGenerated', tabId, securityXml });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    postMessage({ type: 'soap:securityError', tabId, error: errorMsg });
  }
}

/**
 * Handle soap:injectSecurity — inject WS-Security header into existing envelope.
 */
export function handleInjectSecurity(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const envelope = msg.envelope as string || '';
  const securityXml = msg.securityXml as string || '';

  try {
    const result = injectSecurityHeader(envelope, securityXml);
    postMessage({ type: 'soap:securityInjected', tabId, envelope: result });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    postMessage({ type: 'soap:securityError', tabId, error: errorMsg });
  }
}

/**
 * Handle soap:importSoapUi — parse a SoapUI project XML file.
 */
export function handleImportSoapUiProject(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const xmlContent = msg.xmlContent as string || '';

  try {
    const result = parseSoapUiProject(xmlContent);
    postMessage({ type: 'soap:soapUiImported', tabId, ...result });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    postMessage({ type: 'soap:soapUiError', tabId, error: errorMsg });
  }
}
