/**
 * WSDL Service — loads WSDL via the `soap` npm package and extracts
 * services, ports, operations, and type definitions using client.describe().
 *
 * Strategy: Use `soap` for the heavy lifting (WSDL parsing, multi-schema resolution,
 * type inheritance, imports). Then transform describe() output into our SoapServiceDef model.
 */
import * as soap from 'soap';

// ────────── Public Types ──────────

export interface WsdlServiceDef {
  name: string;
  documentation?: string;
  ports: WsdlPortDef[];
}

export interface WsdlPortDef {
  name: string;
  binding: string;
  address: string;
  soapVersion: '1.1' | '1.2';
  operations: WsdlOperationDef[];
}

export interface WsdlOperationDef {
  name: string;
  soapAction: string;
  style: 'document' | 'rpc';
  inputMessage: string;
  outputMessage: string;
  documentation?: string;
  inputSchema?: Record<string, unknown>;
}

export interface WsdlParseResult {
  services: WsdlServiceDef[];
  rawWsdl: string;
  url?: string;
  filename: string;
}

export interface WsdlFieldDef {
  name: string;
  type: string; // 'string' | 'int' | 'float' | 'boolean' | 'date' | 'dateTime' | 'complex' | 'array' | etc
  required: boolean;
  documentation?: string;
  children?: WsdlFieldDef[];
  enumValues?: string[];
  isArray?: boolean;
}

// ────────── WSDL Loading ──────────

/**
 * Load and parse a WSDL from URL.
 * Returns the full service/port/operation tree.
 * Includes a 15-second timeout to prevent infinite hangs.
 */
export async function loadWsdlFromUrl(wsdlUrl: string): Promise<WsdlParseResult> {
  const timeoutMs = 15000;
  const clientPromise = soap.createClientAsync(wsdlUrl);
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`WSDL loading timed out after ${timeoutMs / 1000}s — check if the URL is accessible`)), timeoutMs);
  });

  const client = await Promise.race([clientPromise, timeoutPromise]);
  const description = client.describe();
  const services = extractServices(description, client);

  return {
    services,
    rawWsdl: (client.wsdl as unknown as { xml: string }).xml || '',
    url: wsdlUrl,
    filename: extractFilename(wsdlUrl),
  };
}

/**
 * Load and parse a WSDL from raw XML content.
 * Creates a temporary in-memory client.
 */
export async function loadWsdlFromContent(xml: string, filename: string): Promise<WsdlParseResult> {
  // soap package can load from inline XML via a data URI or by writing to temp
  // We'll use the WSDL class directly
  const wsdl = new soap.WSDL(xml, '', {});
  await new Promise<void>((resolve, reject) => {
    wsdl.onReady((err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Create a minimal client from the parsed WSDL
  const client = new soap.Client(wsdl, '');
  const description = client.describe();
  const services = extractServices(description, client);

  return {
    services,
    rawWsdl: xml,
    filename,
  };
}

// ────────── Service Extraction ──────────

function extractServices(description: Record<string, unknown>, client: soap.Client): WsdlServiceDef[] {
  const services: WsdlServiceDef[] = [];

  for (const [serviceName, serviceObj] of Object.entries(description)) {
    if (!serviceObj || typeof serviceObj !== 'object') continue;

    const ports: WsdlPortDef[] = [];
    for (const [portName, portObj] of Object.entries(serviceObj as Record<string, unknown>)) {
      if (!portObj || typeof portObj !== 'object') continue;

      const operations: WsdlOperationDef[] = [];
      for (const [opName, opObj] of Object.entries(portObj as Record<string, unknown>)) {
        if (!opObj || typeof opObj !== 'object') continue;

        // Extract SOAPAction from WSDL bindings
        const soapAction = getSoapAction(client, serviceName, portName, opName);
        const style = getOperationStyle(client, serviceName, portName, opName);

        operations.push({
          name: opName,
          soapAction,
          style,
          inputMessage: opName,
          outputMessage: `${opName}Response`,
          inputSchema: opObj as Record<string, unknown>,
        });
      }

      // Determine SOAP version and address from binding
      const portInfo = getPortInfo(client, serviceName, portName);

      ports.push({
        name: portName,
        binding: portInfo.binding,
        address: portInfo.address,
        soapVersion: portInfo.soapVersion,
        operations,
      });
    }

    services.push({
      name: serviceName,
      ports,
    });
  }

  return services;
}

// ────────── Helpers ──────────

function getSoapAction(client: soap.Client, serviceName: string, portName: string, opName: string): string {
  try {
    const wsdl = client.wsdl;
    const service = wsdl.definitions?.services?.[serviceName];
    if (!service) return '';

    const port = service.ports?.[portName];
    if (!port) return '';

    const binding = port.binding;
    if (!binding) return '';

    const operation = binding.methods?.[opName];
    if (!operation) return '';

    return operation.soapAction || '';
  } catch {
    return '';
  }
}

function getOperationStyle(client: soap.Client, _serviceName: string, _portName: string, _opName: string): 'document' | 'rpc' {
  try {
    const wsdl = client.wsdl;
    // Default to document style (most common)
    const defs = wsdl.definitions;
    if (defs?.bindings) {
      for (const binding of Object.values(defs.bindings) as Array<{ style?: string }>) {
        if (binding.style === 'rpc') return 'rpc';
      }
    }
    return 'document';
  } catch {
    return 'document';
  }
}

function getPortInfo(client: soap.Client, serviceName: string, portName: string): { binding: string; address: string; soapVersion: '1.1' | '1.2' } {
  try {
    const wsdl = client.wsdl;
    const service = wsdl.definitions?.services?.[serviceName];
    if (!service) return { binding: '', address: '', soapVersion: '1.1' };

    const port = service.ports?.[portName];
    if (!port) return { binding: '', address: '', soapVersion: '1.1' };

    const address = port.location || '';
    const bindingName = port.binding?.$name || '';

    // Detect SOAP 1.2 from binding namespace
    const binding = port.binding;
    let soapVersion: '1.1' | '1.2' = '1.1';
    if ((binding as unknown as Record<string, unknown>)?.['$name']?.toString().includes('Soap12')) {
      soapVersion = '1.2';
    }

    return { binding: bindingName, address, soapVersion };
  } catch {
    return { binding: '', address: '', soapVersion: '1.1' };
  }
}

function extractFilename(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/');
    return parts[parts.length - 1] || 'service.wsdl';
  } catch {
    return 'service.wsdl';
  }
}

// ────────── Type/Field Extraction for Form Editor ──────────

/**
 * Extract form field definitions from describe() operation input schema.
 * Recursively resolves complex types into field trees.
 */
export function extractFieldsFromSchema(inputSchema: Record<string, unknown>): WsdlFieldDef[] {
  const fields: WsdlFieldDef[] = [];

  for (const [key, value] of Object.entries(inputSchema)) {
    if (key.startsWith('target') || key === 'xmlns') continue;
    fields.push(parseField(key, value));
  }

  return fields;
}

function parseField(name: string, value: unknown): WsdlFieldDef {
  if (value === null || value === undefined) {
    return { name, type: 'string', required: false };
  }

  if (typeof value === 'string') {
    // soap package describe() returns type strings like "xs:string", "xs:int", etc.
    const mapped = mapXsdType(value);
    const required = !value.includes('|') && !value.endsWith('?');
    return { name, type: mapped, required };
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    // Complex type — recurse
    const obj = value as Record<string, unknown>;

    // Check for array markers (maxOccurs > 1, or naming convention)
    const isArray = name.endsWith('[]') || obj['[]'] !== undefined;
    const cleanName = name.replace('[]', '');

    const children = extractFieldsFromSchema(obj);
    return {
      name: cleanName,
      type: 'complex',
      required: true,
      children,
      isArray,
    };
  }

  return { name, type: 'string', required: false };
}

function mapXsdType(xsdType: string): string {
  const type = xsdType.replace(/^(xs:|xsd:|s:)/, '').toLowerCase().split('|')[0].trim();
  switch (type) {
    case 'string': case 'normalizedstring': case 'token': return 'string';
    case 'int': case 'integer': case 'long': case 'short': case 'byte': case 'nonpositiveinteger': case 'nonnegativeinteger': case 'positiveinteger': case 'negativeinteger': case 'unsignedint': case 'unsignedlong': case 'unsignedshort': case 'unsignedbyte': return 'int';
    case 'float': case 'double': case 'decimal': return 'float';
    case 'boolean': return 'boolean';
    case 'date': return 'date';
    case 'datetime': return 'dateTime';
    case 'time': return 'time';
    case 'base64binary': case 'hexbinary': return 'binary';
    default: return 'string';
  }
}
