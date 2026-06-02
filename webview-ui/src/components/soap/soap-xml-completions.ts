/**
 * SOAP XML Completion Provider — suggests elements/attributes based on parsed WSDL services.
 * Works with the CodeEditor's Monaco instance to provide context-aware XML completions.
 */
import type { SoapServiceDef } from '../../store/tabs-store';

export interface SoapCompletionItem {
  label: string;
  insertText: string;
  detail?: string;
  kind: 'element' | 'attribute' | 'snippet';
}

/**
 * Get completion items for the current cursor position in a SOAP XML editor.
 * Analyzes the text before cursor to determine context (inside Body, Header, etc.)
 * and suggests relevant elements from the parsed WSDL services.
 */
export function getSoapXmlCompletions(
  services: SoapServiceDef[] | undefined,
  textUntilPosition: string,
): SoapCompletionItem[] {
  const items: SoapCompletionItem[] = [];

  // Always offer SOAP structural completions
  const inEnvelope = /<soap:Envelope|<soapenv:Envelope|<s:Envelope/i.test(textUntilPosition);
  const inBody = /<soap:Body|<soapenv:Body|<s:Body/i.test(textUntilPosition);
  const inHeader = /<soap:Header|<soapenv:Header|<s:Header/i.test(textUntilPosition);
  const isOpeningTag = /< *$/.test(textUntilPosition) || /<[a-zA-Z0-9:]*$/.test(textUntilPosition);

  if (!inEnvelope) {
    // Suggest full envelope skeleton
    items.push({
      label: 'soap:Envelope',
      insertText: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:tns="http://example.com/service">
  <soap:Header/>
  <soap:Body>
    \${1}
  </soap:Body>
</soap:Envelope>`,
      detail: 'SOAP 1.1 Envelope skeleton',
      kind: 'snippet',
    });
    items.push({
      label: 'soap12:Envelope',
      insertText: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:tns="http://example.com/service">
  <soap:Header/>
  <soap:Body>
    \${1}
  </soap:Body>
</soap:Envelope>`,
      detail: 'SOAP 1.2 Envelope skeleton',
      kind: 'snippet',
    });
    return items;
  }

  if (isOpeningTag && inBody) {
    // Inside <soap:Body> — suggest operation elements from WSDL
    if (services && services.length > 0) {
      for (const svc of services) {
        for (const port of svc.ports) {
          for (const op of port.operations) {
            // Suggest operation request element
            items.push({
              label: `tns:${op.name}`,
              insertText: buildOperationSnippet(op.name, op.inputSchema),
              detail: `${svc.name} / ${port.name} [${op.style}]`,
              kind: 'element',
            });
          }
        }
      }
    }

    // Generic body elements
    items.push({
      label: 'soap:Fault',
      insertText: `<soap:Fault>
  <faultcode>\${1:Server}</faultcode>
  <faultstring>\${2:Error message}</faultstring>
  <detail>\${3}</detail>
</soap:Fault>`,
      detail: 'SOAP Fault element',
      kind: 'snippet',
    });
  } else if (isOpeningTag && inHeader) {
    // Inside <soap:Header> — suggest security and addressing elements
    items.push({
      label: 'wsse:Security',
      insertText: `<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <wsse:UsernameToken>
    <wsse:Username>\${1}</wsse:Username>
    <wsse:Password>\${2}</wsse:Password>
  </wsse:UsernameToken>
</wsse:Security>`,
      detail: 'WS-Security UsernameToken',
      kind: 'snippet',
    });
    items.push({
      label: 'wsa:Action',
      insertText: `<wsa:Action xmlns:wsa="http://www.w3.org/2005/08/addressing">\${1}</wsa:Action>`,
      detail: 'WS-Addressing Action',
      kind: 'element',
    });
    items.push({
      label: 'wsa:To',
      insertText: `<wsa:To xmlns:wsa="http://www.w3.org/2005/08/addressing">\${1}</wsa:To>`,
      detail: 'WS-Addressing To',
      kind: 'element',
    });
    items.push({
      label: 'wsa:MessageID',
      insertText: `<wsa:MessageID xmlns:wsa="http://www.w3.org/2005/08/addressing">urn:uuid:\${1}</wsa:MessageID>`,
      detail: 'WS-Addressing MessageID',
      kind: 'element',
    });
    items.push({
      label: 'wsu:Timestamp',
      insertText: `<wsu:Timestamp xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
  <wsu:Created>\${1:2026-01-01T00:00:00Z}</wsu:Created>
  <wsu:Expires>\${2:2026-01-01T00:05:00Z}</wsu:Expires>
</wsu:Timestamp>`,
      detail: 'WS-Security Timestamp',
      kind: 'snippet',
    });
  } else if (isOpeningTag && inEnvelope && !inBody && !inHeader) {
    // At envelope level — suggest Header and Body
    items.push({
      label: 'soap:Header',
      insertText: `<soap:Header>\n  \${1}\n</soap:Header>`,
      detail: 'SOAP Header block',
      kind: 'element',
    });
    items.push({
      label: 'soap:Body',
      insertText: `<soap:Body>\n  \${1}\n</soap:Body>`,
      detail: 'SOAP Body block',
      kind: 'element',
    });
  }

  return items;
}

/**
 * Build a snippet for an operation element with placeholder fields from inputSchema.
 */
function buildOperationSnippet(opName: string, inputSchema?: object): string {
  if (!inputSchema || Object.keys(inputSchema).length === 0) {
    return `<tns:${opName}>\n  \${1}\n</tns:${opName}>`;
  }

  let tabStop = 1;
  const lines: string[] = [`<tns:${opName}>`];

  for (const [key, value] of Object.entries(inputSchema)) {
    if (key.startsWith('target') || key === 'xmlns') continue;
    const typeHint = typeof value === 'string' ? value.replace('xs:', '') : '';
    lines.push(`  <tns:${key}>\${${tabStop}:${typeHint || '?'}}</tns:${key}>`);
    tabStop++;
  }

  lines.push(`</tns:${opName}>`);
  return lines.join('\n');
}
