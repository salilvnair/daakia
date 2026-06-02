/**
 * SOAP Envelope Builder — generates skeleton SOAP 1.1/1.2 envelopes from WSDL operation schemas.
 * Uses the describe() output from wsdl-service to build properly namespaced envelopes.
 */

export interface EnvelopeBuildOptions {
  serviceName: string;
  portName: string;
  operationName: string;
  soapVersion: '1.1' | '1.2';
  soapAction: string;
  inputSchema?: Record<string, unknown>;
  targetNamespace?: string;
}

/**
 * Build a skeleton SOAP envelope for an operation.
 * Fills element placeholders with "?" markers for the user to fill in.
 */
export function buildSkeletonEnvelope(options: EnvelopeBuildOptions): string {
  const { operationName, soapVersion, inputSchema, targetNamespace } = options;

  const soapNs = soapVersion === '1.2'
    ? 'http://www.w3.org/2003/05/soap-envelope'
    : 'http://schemas.xmlsoap.org/soap/envelope/';

  const tns = targetNamespace || `http://tempuri.org/`;

  // Build body content from input schema
  const bodyContent = inputSchema
    ? buildElementsFromSchema(inputSchema, operationName, 'tns', 3)
    : `    <tns:${operationName}>\n      <!-- Fill request parameters here -->\n    </tns:${operationName}>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="${soapNs}"
               xmlns:tns="${tns}">
  <soap:Header>
    <!-- WS-Security and custom headers injected here -->
  </soap:Header>
  <soap:Body>
${bodyContent}
  </soap:Body>
</soap:Envelope>`;
}

/**
 * Build XML elements from a describe() schema object.
 */
function buildElementsFromSchema(
  schema: Record<string, unknown>,
  wrapperName: string,
  prefix: string,
  indent: number,
): string {
  const pad = ' '.repeat(indent);
  const innerPad = ' '.repeat(indent + 2);
  const lines: string[] = [];

  lines.push(`${pad}<${prefix}:${wrapperName}>`);

  for (const [key, value] of Object.entries(schema)) {
    if (key.startsWith('target') || key === 'xmlns') continue;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Complex type — recurse
      const nested = buildElementsFromSchema(value as Record<string, unknown>, key, prefix, indent + 2);
      lines.push(nested);
    } else {
      // Simple type — placeholder
      lines.push(`${innerPad}<${prefix}:${key}>?</${prefix}:${key}>`);
    }
  }

  lines.push(`${pad}</${prefix}:${wrapperName}>`);
  return lines.join('\n');
}

/**
 * Inject WS-Security header elements into an existing envelope.
 */
export function injectSecurityHeader(envelope: string, securityXml: string): string {
  // Find or create <soap:Header> and inject security block
  const headerRegex = /<soap:Header[^>]*>([\s\S]*?)<\/soap:Header>/i;
  const match = envelope.match(headerRegex);

  if (match) {
    // Insert security into existing header
    const existingContent = match[1];
    const newHeader = `<soap:Header>\n    ${securityXml}\n${existingContent}</soap:Header>`;
    return envelope.replace(headerRegex, newHeader);
  }

  // No header — create one before <soap:Body>
  const bodyRegex = /(<soap:Body)/i;
  return envelope.replace(bodyRegex, `<soap:Header>\n    ${securityXml}\n  </soap:Header>\n  $1`);
}

/**
 * Extract the namespace prefix → URI map from an envelope for display.
 */
export function extractNamespaces(envelope: string): Record<string, string> {
  const nsMap: Record<string, string> = {};
  const regex = /xmlns:(\w+)="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(envelope)) !== null) {
    nsMap[m[1]] = m[2];
  }
  return nsMap;
}
