/**
 * SoapUI Project Importer — parses SoapUI .xml project files and extracts
 * requests, operations, assertions into Daakia-compatible format.
 *
 * SoapUI project XML structure:
 * <con:soapui-project>
 *   <con:interface>
 *     <con:operation>
 *       <con:request>
 *         <con:request> (body XML)
 *       </con:request>
 *     </con:operation>
 *   </con:interface>
 * </con:soapui-project>
 */
import { XMLParser } from 'fast-xml-parser';

export interface SoapUiImportResult {
  projectName: string;
  interfaces: SoapUiInterface[];
}

export interface SoapUiInterface {
  name: string;
  wsdlUrl?: string;
  operations: SoapUiOperation[];
}

export interface SoapUiOperation {
  name: string;
  soapAction?: string;
  requests: SoapUiRequest[];
}

export interface SoapUiRequest {
  name: string;
  endpoint?: string;
  envelope: string;
  encoding?: string;
}

/**
 * Parse a SoapUI project XML file into structured data.
 */
export function parseSoapUiProject(xmlContent: string): SoapUiImportResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    isArray: (name) => ['con:interface', 'con:operation', 'con:request', 'con:assertion'].includes(name),
  });

  const doc = parser.parse(xmlContent);
  const project = doc['con:soapui-project'] || doc['soapui-project'] || doc;

  const projectName = project['@_name'] || 'Imported SoapUI Project';
  const interfaces: SoapUiInterface[] = [];

  const rawInterfaces = project['con:interface'] || project['interface'] || [];
  const ifaceArray = Array.isArray(rawInterfaces) ? rawInterfaces : [rawInterfaces];

  for (const iface of ifaceArray) {
    if (!iface) continue;

    const ifaceName = iface['@_name'] || 'Unknown Interface';
    const wsdlUrl = iface['con:definitionUrl'] || iface['definitionUrl'] || undefined;

    const operations: SoapUiOperation[] = [];
    const rawOps = iface['con:operation'] || iface['operation'] || [];
    const opsArray = Array.isArray(rawOps) ? rawOps : [rawOps];

    for (const op of opsArray) {
      if (!op) continue;

      const opName = op['@_name'] || 'Unknown Operation';
      const soapAction = op['@_action'] || undefined;

      const requests: SoapUiRequest[] = [];
      const rawRequests = op['con:request'] || op['request'] || [];
      const reqArray = Array.isArray(rawRequests) ? rawRequests : [rawRequests];

      for (const req of reqArray) {
        if (!req) continue;

        const reqName = req['@_name'] || 'Request';
        const endpoint = req['con:endpoint'] || req['endpoint'] || undefined;
        const envelope = req['con:request'] || req['request'] || req['#text'] || '';

        requests.push({
          name: reqName,
          endpoint: typeof endpoint === 'string' ? endpoint : undefined,
          envelope: typeof envelope === 'string' ? envelope : '',
          encoding: req['con:encoding'] || 'UTF-8',
        });
      }

      operations.push({ name: opName, soapAction, requests });
    }

    interfaces.push({ name: ifaceName, wsdlUrl, operations });
  }

  return { projectName, interfaces };
}
