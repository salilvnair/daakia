/**
 * SOAP Mock Server — serves SOAP XML responses based on SOAPAction matching.
 * Supports SOAP 1.1 and 1.2, serves WSDL at ?wsdl endpoint.
 */
import * as http from 'http';
import * as crypto from 'crypto';
import type { MockServerConfig, MockLogEntry, SoapMockOperation } from './mock-types';

type LogCallback = (entry: MockLogEntry) => void;

/**
 * Create a SOAP mock HTTP server. Routes by SOAPAction header (1.1) or
 * Content-Type action param (1.2). Serves WSDL at ?wsdl.
 */
export function createSoapServer(
  config: MockServerConfig,
  getConfig: () => MockServerConfig,
  onLog?: LogCallback,
): http.Server {
  return http.createServer((req, res) => {
    const startTime = Date.now();
    const url = new URL(req.url || '/', `http://localhost`);

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Serve WSDL at ?wsdl — supports per-service filtering via path (/ServiceName?wsdl)
    if (url.search === '?wsdl' || url.searchParams.has('wsdl')) {
      const currentConfig = getConfig();
      const actualPort = currentConfig.port || config.port || 8080;
      // Check if a specific service name is requested via the URL path
      const pathService = url.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
      let wsdl = currentConfig.soapWsdl
        ? currentConfig.soapWsdl
        : generateDefaultWsdl(currentConfig, pathService || undefined);
      // Always replace localhost port with the actual running port (this is mock server only)
      wsdl = wsdl.replace(/localhost:\d+/g, `localhost:${actualPort}`);
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      res.end(wsdl);
      onLog?.({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        serverId: config.id,
        direction: 'outgoing',
        protocol: 'soap',
        method: 'GET',
        path: url.pathname + '?wsdl',
        statusCode: 200,
        body: 'WSDL served',
        duration: Date.now() - startTime,
      });
      return;
    }

    // Only handle POST for SOAP requests
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'text/xml' });
      res.end(soapFault('Client', 'Only POST method is supported for SOAP requests'));
      return;
    }

    // ─── Content-Type validation (like JAX-WS) ───
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    const isSoap11 = contentType.includes('text/xml');
    const isSoap12 = contentType.includes('application/soap+xml');
    if (!isSoap11 && !isSoap12) {
      const faultBody = soapFault(
        'Client',
        `Unsupported Content-Type: "${req.headers['content-type'] || '(none)'}". Expected "text/xml" (SOAP 1.1) or "application/soap+xml" (SOAP 1.2).`
      );
      res.writeHead(415, { 'Content-Type': 'text/xml' });
      res.end(faultBody);
      onLog?.({
        id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
        direction: 'incoming', protocol: 'soap', method: 'POST',
        path: url.pathname, statusCode: 415,
        body: `Content-Type: ${req.headers['content-type']}`,
        responseBody: faultBody, duration: Date.now() - startTime,
      });
      return;
    }

    // Collect body
    let reqBody = '';
    req.on('data', (chunk) => { reqBody += chunk; });
    req.on('end', () => {
      // ─── SOAP Envelope structure validation (like JAX-WS / CXF) ───
      const envelopeError = validateSoapEnvelope(reqBody);
      if (envelopeError) {
        const faultBody = soapFault('Client', envelopeError);
        res.writeHead(400, { 'Content-Type': 'text/xml' });
        res.end(faultBody);
        onLog?.({
          id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
          direction: 'incoming', protocol: 'soap', method: 'POST',
          path: url.pathname, statusCode: 400,
          body: reqBody.slice(0, 500), responseBody: faultBody,
          duration: Date.now() - startTime,
        });
        return;
      }

      const currentConfig = getConfig();
      const operations = (currentConfig.soapOperations || []).filter(op => op.enabled && op.serviceEnabled !== false);

      // Determine SOAPAction
      const soapAction = extractSoapAction(req, reqBody);

      // ─── SOAPAction header required for SOAP 1.1 (WS-I Basic Profile R2726) ───
      if (isSoap11 && !req.headers['soapaction']) {
        const faultBody = soapFault(
          'Client',
          'Missing SOAPAction HTTP header. SOAP 1.1 requires a SOAPAction header (WS-I Basic Profile R2726).',
          'Add header: SOAPAction: "http://example.com/YourAction"'
        );
        res.writeHead(400, { 'Content-Type': 'text/xml' });
        res.end(faultBody);
        onLog?.({
          id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
          direction: 'incoming', protocol: 'soap', method: 'POST',
          path: url.pathname, statusCode: 400,
          body: reqBody.slice(0, 500), responseBody: faultBody,
          duration: Date.now() - startTime,
        });
        return;
      }

      // Find matching operation
      const matched = operations.find(op =>
        op.soapAction && soapAction &&
        normalizeSoapAction(op.soapAction) === normalizeSoapAction(soapAction)
      );

      if (!matched) {
        const faultBody = soapFault(
          'Client',
          `No mock operation matches SOAPAction "${soapAction}"`,
          operations.map(op => `  ${op.soapAction} (${op.service}/${op.operation})`).join('\n')
        );
        res.writeHead(500, { 'Content-Type': 'text/xml' });
        res.end(faultBody);
        onLog?.({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          serverId: config.id,
          direction: 'incoming',
          protocol: 'soap',
          method: 'POST',
          path: url.pathname,
          statusCode: 500,
          body: reqBody.slice(0, 500),
          responseBody: faultBody,
          duration: Date.now() - startTime,
        });
        return;
      }

      // XSD validation: Verify the operation element in soap:Body matches the expected operation name
      const bodyOperationName = extractBodyOperationName(reqBody);
      if (bodyOperationName && bodyOperationName !== matched.operation) {
        const faultBody = soapFault(
          'Client',
          `XML validation failed: unexpected element "${bodyOperationName}" in soap:Body. Expected "${matched.operation}" for SOAPAction "${soapAction}".`,
          `The operation element name in the request body does not match the WSDL definition.\nExpected: <tns:${matched.operation}>\nReceived: <...${bodyOperationName}>`
        );
        res.writeHead(500, { 'Content-Type': 'text/xml' });
        res.end(faultBody);
        onLog?.({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          serverId: config.id,
          direction: 'incoming',
          protocol: 'soap',
          method: 'POST',
          path: url.pathname,
          statusCode: 500,
          body: reqBody.slice(0, 500),
          responseBody: faultBody,
          duration: Date.now() - startTime,
          event: soapAction,
        });
        return;
      }

      // Apply delay
      const respond = () => {
        // If client disconnected (e.g. timeout), skip response
        if (req.destroyed || res.writableEnded) return;

        let responseBody: string;
        let statusCode: number;

        if (matched.responseType === 'fault') {
          // Return a SOAP fault
          responseBody = soapFault(
            matched.faultCode || 'Server',
            matched.faultString || `Simulated fault for ${matched.operation}`
          );
          statusCode = 500;
        } else if (matched.responseType === 'script' && matched.responseScript) {
          // Dynamic response via script
          try {
            const fn = new Function('req', 'body', matched.responseScript);
            const result = fn({ headers: req.headers, url: req.url }, reqBody);
            responseBody = typeof result === 'string' ? result : JSON.stringify(result);
            statusCode = 200;
          } catch (err) {
            responseBody = soapFault('Server', `Script error: ${(err as Error).message}`);
            statusCode = 500;
          }
        } else {
          // Static response
          responseBody = matched.response;
          statusCode = 200;
        }

        res.writeHead(statusCode, { 'Content-Type': 'text/xml;charset=UTF-8' });
        res.end(responseBody);
        onLog?.({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          serverId: config.id,
          direction: 'incoming',
          protocol: 'soap',
          method: 'POST',
          path: url.pathname,
          statusCode,
          body: reqBody.slice(0, 500),
          responseBody: responseBody.slice(0, 500),
          duration: Date.now() - startTime,
          event: soapAction,
        });
      };

      if (matched.delay > 0) {
        setTimeout(respond, matched.delay);
      } else {
        respond();
      }
    });
  });
}

/**
 * Validate SOAP envelope structure — like JAX-WS / Apache CXF / .NET WCF would.
 * Returns an error string if invalid, or undefined if valid.
 */
function validateSoapEnvelope(body: string): string | undefined {
  const trimmed = body.trim();

  // Must not be empty
  if (!trimmed) {
    return 'Empty request body. A SOAP Envelope is required.';
  }

  // Must start with XML (or at least look like XML)
  if (!trimmed.startsWith('<')) {
    return 'Request body is not XML. SOAP requires a well-formed XML envelope.';
  }

  // Must contain an Envelope element (any SOAP namespace prefix)
  const envelopeMatch = trimmed.match(/<([^:\s>]+):Envelope[^>]*>|<Envelope[^>]*>/i);
  if (!envelopeMatch) {
    return 'Missing <soap:Envelope> root element. Request must be a valid SOAP Envelope.';
  }

  // Check SOAP namespace declaration
  const hasSoap11NS = trimmed.includes('http://schemas.xmlsoap.org/soap/envelope/');
  const hasSoap12NS = trimmed.includes('http://www.w3.org/2003/05/soap-envelope');
  if (!hasSoap11NS && !hasSoap12NS) {
    return 'Invalid SOAP namespace. Envelope must declare xmlns "http://schemas.xmlsoap.org/soap/envelope/" (1.1) or "http://www.w3.org/2003/05/soap-envelope" (1.2).';
  }

  // Must contain a Body element
  const hasBody = /<([^:\s>]+):Body[^>]*>|<Body[^>]*>/i.test(trimmed);
  if (!hasBody) {
    return 'Missing <soap:Body> element inside the Envelope. A Body element is required.';
  }

  // Envelope must close properly (basic well-formedness)
  const hasClosingEnvelope = /<\/([^:\s>]+):Envelope\s*>|<\/Envelope\s*>/i.test(trimmed);
  if (!hasClosingEnvelope) {
    return 'Malformed XML: <soap:Envelope> is not properly closed.';
  }

  return undefined; // Valid
}

/**
 * Extract SOAPAction from SOAP 1.1 header or SOAP 1.2 Content-Type action param,
 * or from the request body (first element in soap:Body).
 */
function extractSoapAction(req: http.IncomingMessage, body: string): string {
  // SOAP 1.1: SOAPAction header
  const headerAction = req.headers['soapaction'] as string | undefined;
  if (headerAction) {
    return headerAction.replace(/^"|"$/g, ''); // strip quotes
  }

  // SOAP 1.2: Content-Type action param
  const contentType = req.headers['content-type'] || '';
  const actionMatch = contentType.match(/action="([^"]+)"/i);
  if (actionMatch) return actionMatch[1];

  // Fallback: extract from first element in <soap:Body>
  const bodyMatch = body.match(/<(?:soap|SOAP-ENV|s):Body[^>]*>\s*<([^:\s>]+:)?([^\s>/]+)/);
  if (bodyMatch) return bodyMatch[2];

  return '';
}

function normalizeSoapAction(action: string): string {
  return action.replace(/^"|"$/g, '').trim().toLowerCase();
}

/**
 * Extract the operation element name from the first child of <soap:Body>.
 * Handles namespaced tags like <tns:GetPatient>, <ns1:GetPatient>, <GetPatient>.
 */
function extractBodyOperationName(body: string): string | undefined {
  // Match the first element inside <soap:Body> / <SOAP-ENV:Body> / <s:Body>
  const match = body.match(/<(?:soap|SOAP-ENV|SOAP|soapenv|s):Body[^>]*>\s*<(?:[^:\s>]+:)?([^\s>/]+)/i);
  return match?.[1];
}

function soapFault(code: string, message: string, detail?: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:${code}</faultcode>
      <faultstring>${escapeXml(message)}</faultstring>${detail ? `\n      <detail>${escapeXml(detail)}</detail>` : ''}
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Generate a real-world WSDL from the configured operations.
 * Produces proper <wsdl:types> with XSD elements, messages, portType, binding, and service
 * with the actual server address — just like Java JAX-WS / .NET WCF would generate.
 * If filterService is provided, only includes operations from that service name.
 */
function generateDefaultWsdl(config: MockServerConfig, filterService?: string): string {
  let ops = (config.soapOperations || []).filter(op => op.enabled && op.serviceEnabled !== false);

  // Filter by service name if path-based request (e.g., /NewService2?wsdl)
  if (filterService) {
    const normalizedFilter = filterService.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    ops = ops.filter(op => {
      const svcClean = (op.service || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      return svcClean === normalizedFilter;
    });
    if (ops.length === 0) {
      // No matching service — return all operations as fallback
      ops = (config.soapOperations || []).filter(op => op.enabled && op.serviceEnabled !== false);
    }
  }

  const serviceName = config.name.replace(/[^a-zA-Z0-9]/g, '') || 'MockService';
  const tns = `http://mock.daakia.dev/${serviceName}`;
  const port = config.port || 8080;
  const serviceUrl = `http://localhost:${port}`;

  // Group operations by service name
  const serviceGroups = new Map<string, typeof ops>();
  for (const op of ops) {
    const svc = op.service || serviceName;
    const existing = serviceGroups.get(svc);
    if (existing) existing.push(op);
    else serviceGroups.set(svc, [op]);
  }

  // If only one service group, use the config name
  const isSingleService = serviceGroups.size <= 1;

  // Build XSD elements for each operation (request + response)
  const xsdElements = ops.map(op => {
    const opName = escapeXml(op.operation);
    return `
      <xsd:element name="${opName}">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="request" type="xsd:anyType"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="${opName}Response">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="result" type="xsd:anyType"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>`;
  }).join('');

  // Build messages
  const messages = ops.map(op => {
    const opName = escapeXml(op.operation);
    return `
  <wsdl:message name="${opName}Request">
    <wsdl:part name="parameters" element="tns:${opName}"/>
  </wsdl:message>
  <wsdl:message name="${opName}Response">
    <wsdl:part name="parameters" element="tns:${opName}Response"/>
  </wsdl:message>`;
  }).join('');

  // Build service/port/binding per service group
  let portTypes = '';
  let bindings = '';
  let services = '';

  for (const [svcName, svcOps] of serviceGroups.entries()) {
    const cleanSvc = svcName.replace(/[^a-zA-Z0-9]/g, '');
    const portTypeName = `${cleanSvc}PortType`;
    const bindingName = `${cleanSvc}Binding`;
    const portName = `${cleanSvc}Port`;

    // PortType
    const ptOps = svcOps.map(op => `
      <wsdl:operation name="${escapeXml(op.operation)}">
        <wsdl:input message="tns:${escapeXml(op.operation)}Request"/>
        <wsdl:output message="tns:${escapeXml(op.operation)}Response"/>
      </wsdl:operation>`).join('');

    portTypes += `
  <wsdl:portType name="${portTypeName}">${ptOps}
  </wsdl:portType>
`;

    // Binding
    const bindOps = svcOps.map(op => `
      <wsdl:operation name="${escapeXml(op.operation)}">
        <soap:operation soapAction="${escapeXml(op.soapAction)}"/>
        <wsdl:input><soap:body use="literal"/></wsdl:input>
        <wsdl:output><soap:body use="literal"/></wsdl:output>
      </wsdl:operation>`).join('');

    bindings += `
  <wsdl:binding name="${bindingName}" type="tns:${portTypeName}">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>${bindOps}
  </wsdl:binding>
`;

    // Service — path-based endpoint for per-service WSDL access
    services += `
  <wsdl:service name="${cleanSvc}">
    <wsdl:documentation>${escapeXml(config.description || `${svcName} SOAP Service`)}</wsdl:documentation>
    <wsdl:port name="${portName}" binding="tns:${bindingName}">
      <soap:address location="http://localhost:${port}/${cleanSvc}"/>
    </wsdl:port>
  </wsdl:service>
`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:tns="${tns}"
  targetNamespace="${tns}"
  name="${serviceName}">

  <wsdl:types>
    <xsd:schema targetNamespace="${tns}" elementFormDefault="qualified">${xsdElements}
    </xsd:schema>
  </wsdl:types>
${messages}
${portTypes}${bindings}${services}
</wsdl:definitions>`;
}
