import { useState, useMemo } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { postMsg } from '../../vscode';
import { ChevronRightIcon, ChevronDownIcon, XmlTagIcon, SchemaIcon, CopyIcon, CheckIcon, ExpandAllIcon, CollapseAllIcon } from '../../icons';
import type { SoapServiceDef, SoapPortDef, SoapOperationDef } from '../../store/tabs-store';

type ViewMode = 'details' | 'xml';

interface SchemaField {
  type?: string;
  properties?: Record<string, SchemaField>;
  items?: SchemaField;
  enum?: string[];
  minOccurs?: number;
  maxOccurs?: number | 'unbounded';
}

export function SoapWsdlBrowser() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('details');
  const [search, setSearch] = useState('');
  const [copiedXml, setCopiedXml] = useState(false);
  const [copiedRowKey, setCopiedRowKey] = useState<string | null>(null);

  if (!activeTab) return null;

  const services: SoapServiceDef[] = activeTab.soapServices || [];
  const rawWsdl = activeTab.soapWsdlRaw || '';

  if (services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <SchemaIcon size={32} className="text-[var(--color-text-muted)] opacity-40 mb-3" />
        <p className="text-[12px] text-[var(--color-text-muted)]">No WSDL loaded</p>
        <p className="text-[10px] text-[var(--color-text-muted)] opacity-60 mt-1">Import a WSDL to browse services, operations, and XSD schemas</p>
      </div>
    );
  }

  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    const all = new Set<string>();
    for (const svc of services) {
      all.add(svc.name);
      for (const port of svc.ports) {
        all.add(`${svc.name}:${port.name}`);
        for (const op of port.operations) {
          all.add(`${svc.name}:${port.name}:${op.name}`);
          all.add(`${svc.name}:${port.name}:${op.name}:input`);
          all.add(`${svc.name}:${port.name}:${op.name}:output`);
        }
      }
    }
    setExpanded(all);
  };

  const collapseAll = () => setExpanded(new Set());

  const selectOperation = (service: SoapServiceDef, port: SoapPortDef, operation: SoapOperationDef) => {
    updateTab(activeTab.id, {
      soapService: service.name,
      soapPort: port.name,
      soapOperation: operation.name,
      soapAction: operation.soapAction,
      dirty: true,
    });
    postMsg({
      type: 'soap:generateEnvelope',
      tabId: activeTab.id,
      serviceName: service.name,
      portName: port.name,
      operationName: operation.name,
      soapVersion: port.soapVersion || '1.1',
      soapAction: operation.soapAction,
      inputSchema: operation.inputSchema,
    });
  };

  const handleCopyXml = () => {
    navigator.clipboard.writeText(rawWsdl);
    setCopiedXml(true);
    setTimeout(() => setCopiedXml(false), 1500);
  };

  const copyRowXml = (key: string, xml: string) => {
    navigator.clipboard.writeText(xml);
    setCopiedRowKey(key);
    setTimeout(() => setCopiedRowKey(null), 1200);
  };

  const filteredServices = useMemo(() => {
    if (!search.trim()) return services;
    const q = search.toLowerCase();
    return services.map(svc => ({
      ...svc,
      ports: svc.ports.map(port => ({
        ...port,
        operations: port.operations.filter(op =>
          op.name.toLowerCase().includes(q) ||
          svc.name.toLowerCase().includes(q) ||
          (op.soapAction || '').toLowerCase().includes(q) ||
          (op.inputMessage || '').toLowerCase().includes(q) ||
          (op.outputMessage || '').toLowerCase().includes(q)
        ),
      })).filter(port => port.operations.length > 0),
    })).filter(svc => svc.ports.length > 0 || svc.name.toLowerCase().includes(q));
  }, [services, search]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar — compact single row */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--color-surface-border)] bg-[rgba(0,0,0,0.15)]">
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="h-[28px] px-3 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-protocol-soap)] flex-1 max-w-[400px]"
        />

        <div className="flex-1" />

        {/* Expand/Collapse */}
        <button onClick={expandAll} className="w-[22px] h-[22px] flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.08)] cursor-pointer transition-colors" title="Expand all">
          <ExpandAllIcon size={13} />
        </button>
        <button onClick={collapseAll} className="w-[22px] h-[22px] flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.08)] cursor-pointer transition-colors" title="Collapse all">
          <CollapseAllIcon size={13} />
        </button>

        <div className="w-px h-[14px] bg-[var(--color-surface-border)]" />

        {/* Details | XML */}
        <div className="flex items-center h-[22px] rounded border border-[var(--color-surface-border)] overflow-hidden">
          <button
            onClick={() => setViewMode('details')}
            className={`px-2 h-full text-[10px] font-medium cursor-pointer transition-colors ${
              viewMode === 'details'
                ? 'bg-[color-mix(in_srgb,var(--color-protocol-soap)_20%,transparent)] text-[var(--color-protocol-soap)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.04)]'
            }`}
          >Details</button>
          <button
            onClick={() => setViewMode('xml')}
            className={`px-2 h-full text-[10px] font-medium cursor-pointer transition-colors border-l border-[var(--color-surface-border)] ${
              viewMode === 'xml'
                ? 'bg-[color-mix(in_srgb,var(--color-protocol-soap)_20%,transparent)] text-[var(--color-protocol-soap)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.04)]'
            }`}
          >XML</button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {viewMode === 'details' ? (
          <DetailsView
            services={filteredServices}
            expanded={expanded}
            toggle={toggle}
            selectOperation={selectOperation}
            activeTab={activeTab}
            rawWsdl={rawWsdl}
            copyRowXml={copyRowXml}
            copiedRowKey={copiedRowKey}
          />
        ) : (
          <XmlView rawWsdl={rawWsdl} onCopy={handleCopyXml} copied={copiedXml} />
        )}
      </div>
    </div>
  );
}

/* ─── Details Tree View ─── */
function DetailsView({
  services, expanded, toggle, selectOperation, activeTab, rawWsdl, copyRowXml, copiedRowKey,
}: {
  services: SoapServiceDef[];
  expanded: Set<string>;
  toggle: (key: string) => void;
  selectOperation: (svc: SoapServiceDef, port: SoapPortDef, op: SoapOperationDef) => void;
  activeTab: { soapOperation?: string; soapPort?: string };
  rawWsdl: string;
  copyRowXml: (key: string, xml: string) => void;
  copiedRowKey: string | null;
}) {
  if (services.length === 0) {
    return <div className="px-3 py-6 text-center text-[11px] text-[var(--color-text-muted)]">No results match your search.</div>;
  }

  return (
    <div className="py-1">
      {services.map(service => {
        const svcKey = service.name;
        const svcExpanded = expanded.has(svcKey);
        const opCount = service.ports.reduce((n, p) => n + p.operations.length, 0);

        return (
          <div key={svcKey}>
            <TreeRow depth={0} expanded={svcExpanded} onToggle={() => toggle(svcKey)}
              icon={<NodeBadge bg="rgba(232,121,249,0.12)"><SchemaIcon size={9} className="text-[var(--color-protocol-soap)]" /></NodeBadge>}
              label={service.name}
              badge={<span className="block text-[8px] px-1.5 py-0.5 rounded-full bg-[rgba(232,121,249,0.1)] text-[var(--color-protocol-soap)]">{opCount}</span>}
              copyXml={() => copyRowXml(svcKey, extractServiceXml(rawWsdl, service.name))}
              copied={copiedRowKey === svcKey}
            />

            {svcExpanded && service.ports.map(port => {
              const portKey = `${svcKey}:${port.name}`;
              const portExpanded = expanded.has(portKey);

              return (
                <div key={portKey}>
                  <TreeRow depth={1} expanded={portExpanded} onToggle={() => toggle(portKey)}
                    icon={<NodeBadge bg="rgba(96,165,250,0.1)"><span className="text-[7px] font-bold text-[#60a5fa]">{port.soapVersion}</span></NodeBadge>}
                    label={port.name}
                    sublabel={port.address}
                    copyXml={() => copyRowXml(portKey, extractPortXml(rawWsdl, port.name))}
                    copied={copiedRowKey === portKey}
                  />

                  {portExpanded && port.operations.map(op => {
                    const opKey = `${portKey}:${op.name}`;
                    const opExpanded = expanded.has(opKey);
                    const isSelected = activeTab.soapOperation === op.name && activeTab.soapPort === port.name;

                    return (
                      <div key={opKey}>
                        <TreeRow depth={2} expanded={opExpanded} onToggle={() => toggle(opKey)}
                          icon={<NodeBadge bg={op.style === 'rpc' ? 'rgba(251,191,36,0.1)' : 'rgba(96,165,250,0.1)'}><XmlTagIcon size={9} className={op.style === 'rpc' ? 'text-[#fbbf24]' : 'text-[#60a5fa]'} /></NodeBadge>}
                          label={op.name}
                          selected={isSelected}
                          onSelect={() => selectOperation(service, port, op)}
                          badge={<StyleBadge style={op.style} />}
                          copyXml={() => copyRowXml(opKey, extractOperationXml(rawWsdl, op.name))}
                          copied={copiedRowKey === opKey}
                        />
                        {opExpanded && <OperationDetail operation={op} port={port} parentKey={opKey} expanded={expanded} toggle={toggle} rawWsdl={rawWsdl} copyRowXml={copyRowXml} copiedRowKey={copiedRowKey} />}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Operation Detail ─── */
function OperationDetail({ operation, port, parentKey, expanded, toggle, rawWsdl, copyRowXml, copiedRowKey }: {
  operation: SoapOperationDef; port: SoapPortDef; parentKey: string; expanded: Set<string>; toggle: (k: string) => void;
  rawWsdl: string; copyRowXml: (key: string, xml: string) => void; copiedRowKey: string | null;
}) {
  const inputKey = `${parentKey}:input`;
  const outputKey = `${parentKey}:output`;
  const inputExpanded = expanded.has(inputKey);
  const outputExpanded = expanded.has(outputKey);
  const schema = operation.inputSchema as Record<string, unknown> | undefined;
  // soap package's describe() puts fields at top level OR under a 'properties' key
  const properties = (schema?.properties as Record<string, SchemaField> | undefined) || extractSchemaProperties(schema);

  return (
    <div className="ml-[44px] mr-3 my-1 rounded border border-[rgba(232,121,249,0.12)] bg-[rgba(0,0,0,0.2)] overflow-hidden">
      {/* Meta */}
      <div className="px-4 py-2 border-b border-[rgba(255,255,255,0.04)] flex flex-col gap-0.5">
        <MetaRow label="SOAPAction" value={operation.soapAction || '(none)'} accent />
        <MetaRow label="Style" value={operation.style === 'rpc' ? 'RPC/Literal' : 'Document/Literal'} />
        <MetaRow label="SOAP" value={port.soapVersion} />
      </div>

      {/* Request */}
      <div className="group border-b border-[rgba(255,255,255,0.04)]">
        <div className="flex items-center gap-1.5 px-4 py-1.5 cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors select-none" onClick={() => toggle(inputKey)}>
          {inputExpanded ? <ChevronDownIcon size={9} className="text-[var(--color-text-muted)]" /> : <ChevronRightIcon size={9} className="text-[var(--color-text-muted)]" />}
          <span className="text-[7px] font-bold px-1 py-[1px] rounded bg-[rgba(74,222,128,0.12)] text-[#4ade80]">REQ</span>
          <span className="text-[10px] font-medium text-[var(--color-text-primary)]">{operation.inputMessage || operation.name}</span>
          <span className="ml-auto">
            <CopyXmlBtn onClick={(e) => { e.stopPropagation(); copyRowXml(inputKey, extractMessageXml(rawWsdl, operation.inputMessage || operation.name)); }} copied={copiedRowKey === inputKey} />
          </span>
        </div>
        {inputExpanded && (
          <div className="px-4 pb-2">
            <SchemaTable properties={properties} parentKey={inputKey} expanded={expanded} toggle={toggle} rawWsdl={rawWsdl} operationName={operation.name} />
          </div>
        )}
      </div>

      {/* Response */}
      <div className="group">
        <div className="flex items-center gap-1.5 px-4 py-1.5 cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors select-none" onClick={() => toggle(outputKey)}>
          {outputExpanded ? <ChevronDownIcon size={9} className="text-[var(--color-text-muted)]" /> : <ChevronRightIcon size={9} className="text-[var(--color-text-muted)]" />}
          <span className="text-[7px] font-bold px-1 py-[1px] rounded bg-[rgba(251,146,60,0.12)] text-[#fb923c]">RES</span>
          <span className="text-[10px] font-medium text-[var(--color-text-primary)]">{operation.outputMessage || `${operation.name}Response`}</span>
          <span className="ml-auto">
            <CopyXmlBtn onClick={(e) => { e.stopPropagation(); copyRowXml(outputKey, extractMessageXml(rawWsdl, operation.outputMessage || `${operation.name}Response`)); }} copied={copiedRowKey === outputKey} />
          </span>
        </div>
        {outputExpanded && (
          <div className="px-4 pb-2">
            <ResponseTable operationName={operation.name} rawWsdl={rawWsdl} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Schema Table (Request fields as a table) ─── */
function SchemaTable({ properties, parentKey, expanded, toggle, rawWsdl, operationName }: {
  properties: Record<string, SchemaField> | undefined; parentKey: string; expanded: Set<string>; toggle: (k: string) => void;
  rawWsdl?: string; operationName?: string;
}) {
  // If no properties from schema, try parsing from WSDL XML
  const parsedFields = useMemo(() => {
    if (properties && Object.keys(properties).length > 0) return null;
    if (!rawWsdl || !operationName) return [];
    return extractRequestFields(rawWsdl, operationName);
  }, [properties, rawWsdl, operationName]);

  if (!properties || Object.keys(properties).length === 0) {
    const fields = parsedFields || [];
    return (
      <div className="rounded border border-[rgba(255,255,255,0.06)] overflow-hidden">
        <table className="w-full text-[10px]">
          <thead><tr className="bg-[rgba(255,255,255,0.03)]">
            <th className="text-left px-2 py-1 font-medium text-[var(--color-text-muted)]">Field</th>
            <th className="text-left px-2 py-1 font-medium text-[var(--color-text-muted)]">Type</th>
          </tr></thead>
          <tbody>
            {fields.length > 0 ? fields.map(f => (
              <tr key={f.name} className="border-t border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)]">
                <td className="px-2 py-[3px] font-mono text-[var(--color-protocol-soap)]">{f.name}</td>
                <td className="px-2 py-[3px]"><TypeBadge type={f.type} /></td>
              </tr>
            )) : (
              <tr><td colSpan={2} className="px-2 py-1.5 text-center text-[9px] text-[var(--color-text-muted)] italic">request : xsd:anyType</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="rounded border border-[rgba(255,255,255,0.06)] overflow-hidden">
      <table className="w-full text-[10px]">
        <thead><tr className="bg-[rgba(255,255,255,0.03)]">
          <th className="text-left px-2 py-1 font-medium text-[var(--color-text-muted)] w-[16px]"></th>
          <th className="text-left px-2 py-1 font-medium text-[var(--color-text-muted)]">Field</th>
          <th className="text-left px-2 py-1 font-medium text-[var(--color-text-muted)]">Type</th>
          <th className="text-left px-2 py-1 font-medium text-[var(--color-text-muted)] w-[42px]">Req</th>
        </tr></thead>
        <tbody>
          {Object.entries(properties).map(([name, field]) => (
            <SchemaRow key={name} name={name} field={field} parentKey={parentKey} expanded={expanded} toggle={toggle} depth={0} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SchemaRow({ name, field, parentKey, expanded, toggle, depth }: {
  name: string; field: SchemaField; parentKey: string; expanded: Set<string>; toggle: (k: string) => void; depth: number;
}) {
  const fieldKey = `${parentKey}:${name}`;
  const hasChildren = field.properties && Object.keys(field.properties).length > 0;
  const isArray = field.type === 'array' || field.maxOccurs === 'unbounded';
  const fieldExpanded = expanded.has(fieldKey);

  return (
    <>
      <tr
        className={`border-t border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] select-none ${hasChildren ? 'cursor-pointer' : ''}`}
        onClick={hasChildren ? () => toggle(fieldKey) : undefined}
      >
        <td className="px-1 py-[3px]" style={{ paddingLeft: `${4 + depth * 10}px` }}>
          {hasChildren ? (
            fieldExpanded ? <ChevronDownIcon size={8} className="text-[var(--color-text-muted)]" /> : <ChevronRightIcon size={8} className="text-[var(--color-text-muted)]" />
          ) : <span className="w-[8px] inline-block" />}
        </td>
        <td className="px-2 py-[3px]">
          <span className="font-mono text-[var(--color-protocol-soap)]">{name}</span>
          {isArray && <span className="text-[8px] ml-1 px-1 rounded bg-[rgba(96,165,250,0.1)] text-[#60a5fa]">[]</span>}
          {field.enum && <span className="text-[8px] ml-1 px-1 rounded bg-[rgba(251,191,36,0.1)] text-[#fbbf24]">enum</span>}
        </td>
        <td className="px-2 py-[3px]"><TypeBadge type={formatType(field)} /></td>
        <td className="px-2 py-[3px] text-[9px] text-[var(--color-text-muted)]">{field.minOccurs === 0 ? '—' : '✓'}</td>
      </tr>
      {field.enum && fieldExpanded && (
        <tr className="border-t border-[rgba(255,255,255,0.02)]"><td></td>
          <td colSpan={3} className="px-2 py-1">
            <div className="flex flex-wrap gap-1">{field.enum.map(v => <span key={v} className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(251,191,36,0.08)] text-[#fbbf24] font-mono">{v}</span>)}</div>
          </td>
        </tr>
      )}
      {hasChildren && fieldExpanded && Object.entries(field.properties!).map(([childName, childField]) => (
        <SchemaRow key={`${fieldKey}:${childName}`} name={childName} field={childField} parentKey={fieldKey} expanded={expanded} toggle={toggle} depth={depth + 1} />
      ))}
    </>
  );
}

/* ─── Response Table ─── */
function ResponseTable({ operationName, rawWsdl }: { operationName: string; rawWsdl: string }) {
  const fields = useMemo(() => extractResponseFields(rawWsdl, operationName), [rawWsdl, operationName]);

  return (
    <div className="rounded border border-[rgba(255,255,255,0.06)] overflow-hidden">
      <table className="w-full text-[10px]">
        <thead><tr className="bg-[rgba(255,255,255,0.03)]">
          <th className="text-left px-2 py-1 font-medium text-[var(--color-text-muted)]">Field</th>
          <th className="text-left px-2 py-1 font-medium text-[var(--color-text-muted)]">Type</th>
        </tr></thead>
        <tbody>
          {fields.length > 0 ? fields.map(f => (
            <tr key={f.name} className="border-t border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)]">
              <td className="px-2 py-[3px] font-mono text-[var(--color-protocol-soap)]">{f.name}</td>
              <td className="px-2 py-[3px]"><TypeBadge type={f.type} /></td>
            </tr>
          )) : (
            <tr><td colSpan={2} className="px-2 py-1.5 text-center text-[9px] text-[var(--color-text-muted)] italic">result : xsd:anyType</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ─── XML View ─── */
function XmlView({ rawWsdl, onCopy, copied }: { rawWsdl: string; onCopy: () => void; copied: boolean }) {
  if (!rawWsdl) {
    return <div className="px-3 py-6 text-center text-[11px] text-[var(--color-text-muted)]">Raw WSDL XML not available.</div>;
  }
  return (
    <div className="relative h-full">
      <button onClick={onCopy} className="absolute top-2 right-3 z-10 flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-[rgba(255,255,255,0.06)] border border-[var(--color-surface-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.1)] cursor-pointer transition-colors" title="Copy WSDL XML">
        {copied ? <CheckIcon size={10} className="text-[var(--color-success)]" /> : <CopyIcon size={10} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="px-3 py-2 pt-10 text-[10px] font-mono leading-[1.6] text-[var(--color-text-primary)] overflow-auto h-full [scrollbar-gutter:stable] whitespace-pre-wrap break-all">
        <XmlHighlight xml={rawWsdl} />
      </pre>
    </div>
  );
}

function XmlHighlight({ xml }: { xml: string }) {
  const parts = useMemo(() => {
    const result: { text: string; cls: string }[] = [];
    const regex = /(<\/?[\w:.-]+)|(\s[\w:.-]+=)|("[^"]*")|(<\?[^?]*\?>)|(<!--[\s\S]*?-->)|([^<]+)|(\/?>)/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(xml)) !== null) {
      if (m[1]) result.push({ text: m[1], cls: 'wsdl-tag' });
      else if (m[2]) result.push({ text: m[2], cls: 'wsdl-attr' });
      else if (m[3]) result.push({ text: m[3], cls: 'wsdl-val' });
      else if (m[4]) result.push({ text: m[4], cls: 'wsdl-proc' });
      else if (m[5]) result.push({ text: m[5], cls: 'wsdl-comment' });
      else if (m[6]) result.push({ text: m[6], cls: 'wsdl-text' });
      else if (m[7]) result.push({ text: m[7], cls: 'wsdl-tag' });
    }
    return result;
  }, [xml]);
  return <>{parts.map((p, i) => <span key={i} className={p.cls}>{p.text}</span>)}</>;
}

/* ─── Reusable Components ─── */
function TreeRow({ depth, expanded, onToggle, icon, label, sublabel, badge, selected, onSelect, copyXml, copied }: {
  depth: number; expanded: boolean; onToggle: () => void; icon: React.ReactNode; label: string;
  sublabel?: string; badge?: React.ReactNode; selected?: boolean; onSelect?: () => void;
  copyXml?: () => void; copied?: boolean;
}) {
  return (
    <div
      className={`group flex items-center gap-1.5 pr-2 py-[4px] cursor-pointer select-none transition-colors ${
        selected ? 'bg-[color-mix(in_srgb,var(--color-protocol-soap)_10%,transparent)]' : 'hover:bg-[rgba(255,255,255,0.03)]'
      }`}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
      onClick={onToggle}
    >
      <span className="w-[12px] h-[12px] flex items-center justify-center shrink-0">
        {expanded ? <ChevronDownIcon size={10} className="text-[var(--color-text-muted)]" /> : <ChevronRightIcon size={10} className="text-[var(--color-text-muted)]" />}
      </span>
      {icon}
      <span
        className={`text-[11px] font-medium truncate ${selected ? 'text-[var(--color-protocol-soap)]' : 'text-[var(--color-text-primary)]'}`}
        onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(); onToggle(); } : undefined}
      >
        {label}
      </span>
      {sublabel && <span className="text-[9px] text-[var(--color-text-muted)] truncate max-w-[140px]">→ {sublabel}</span>}
      {badge && <span className="ml-auto shrink-0">{badge}</span>}
      {copyXml && (
        <button
          onClick={(e) => { e.stopPropagation(); copyXml(); }}
          className={`opacity-0 group-hover:opacity-100 w-[16px] h-[16px] flex items-center justify-center rounded hover:bg-[rgba(255,255,255,0.1)] transition-all cursor-pointer shrink-0 ${badge ? 'ml-1.5' : 'ml-auto'} ${copied ? '!opacity-100' : ''}`}
          title="Copy XML"
        >
          {copied ? <CheckIcon size={8} className="text-[var(--color-success)]" /> : <XmlTagIcon size={8} className="text-[var(--color-text-muted)]" />}
        </button>
      )}
    </div>
  );
}

function CopyXmlBtn({ onClick, copied }: { onClick: (e: React.MouseEvent) => void; copied: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`opacity-0 group-hover:opacity-100 w-[16px] h-[16px] flex items-center justify-center rounded hover:bg-[rgba(255,255,255,0.1)] transition-all cursor-pointer shrink-0 ${copied ? '!opacity-100' : ''}`}
      title="Copy XML"
    >
      {copied ? <CheckIcon size={8} className="text-[var(--color-success)]" /> : <XmlTagIcon size={8} className="text-[var(--color-text-muted)]" />}
    </button>
  );
}

function NodeBadge({ bg, children }: { bg: string; children: React.ReactNode }) {
  return <span className="flex items-center justify-center w-[16px] h-[16px] rounded shrink-0" style={{ backgroundColor: bg }}>{children}</span>;
}

function StyleBadge({ style }: { style: string }) {
  const isRpc = style === 'rpc';
  return (
    <span className={`text-[8px] px-1.5 py-0.5 rounded-full uppercase font-medium ${
      isRpc ? 'bg-[rgba(251,191,36,0.1)] text-[#fbbf24]' : 'bg-[rgba(96,165,250,0.1)] text-[#60a5fa]'
    }`}>{isRpc ? 'RPC/LIT' : 'DOC/LIT'}</span>
  );
}

function TypeBadge({ type }: { type: string }) {
  let color = 'var(--color-text-muted)';
  let bg = 'rgba(255,255,255,0.04)';
  if (type === 'string' || type === 'xsd:string') { color = '#4ade80'; bg = 'rgba(74,222,128,0.08)'; }
  else if (['integer', 'int', 'long', 'short', 'decimal', 'float', 'double', 'number', 'xsd:int', 'xsd:integer', 'xsd:long', 'xsd:decimal'].includes(type)) { color = '#60a5fa'; bg = 'rgba(96,165,250,0.08)'; }
  else if (type === 'boolean' || type === 'xsd:boolean') { color = '#fbbf24'; bg = 'rgba(251,191,36,0.08)'; }
  else if (type === 'complexType' || type === 'object') { color = '#e879f9'; bg = 'rgba(232,121,249,0.08)'; }
  else if (type.includes('date') || type.includes('Date')) { color = '#fb923c'; bg = 'rgba(251,146,60,0.08)'; }
  return <span className="text-[9px] px-1.5 py-[1px] rounded font-mono" style={{ color, backgroundColor: bg }}>{type}</span>;
}

function MetaRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="text-[var(--color-text-muted)] min-w-[62px]">{label}:</span>
      <span className={`font-mono text-[9px] break-all ${accent ? 'text-[var(--color-protocol-soap)]' : 'text-[var(--color-text-primary)]'}`}>{value}</span>
    </div>
  );
}

function formatType(field: SchemaField): string {
  if (field.type === 'array' && field.items?.type) return `${field.items.type}[]`;
  if (field.type === 'object') return 'complexType';
  return field.type || 'anyType';
}

/* ─── XML Extraction Helpers ─── */
function extractServiceXml(wsdl: string, serviceName: string): string {
  const regex = new RegExp(`<(?:\\w+:)?service[^>]*name=["']${esc(serviceName)}["'][\\s\\S]*?<\\/(?:\\w+:)?service>`, 'i');
  return wsdl.match(regex)?.[0] || `<!-- service "${serviceName}" -->`;
}

function extractPortXml(wsdl: string, portName: string): string {
  const regex = new RegExp(`<(?:\\w+:)?port[^>]*name=["']${esc(portName)}["'][\\s\\S]*?<\\/(?:\\w+:)?port>`, 'i');
  return wsdl.match(regex)?.[0] || `<!-- port "${portName}" -->`;
}

function extractOperationXml(wsdl: string, opName: string): string {
  const regex = new RegExp(`<(?:\\w+:)?operation[^>]*name=["']${esc(opName)}["'][\\s\\S]*?<\\/(?:\\w+:)?operation>`, 'i');
  return wsdl.match(regex)?.[0] || `<!-- operation "${opName}" -->`;
}

function extractMessageXml(wsdl: string, msgName: string): string {
  const msgRegex = new RegExp(`<(?:\\w+:)?message[^>]*name=["']${esc(msgName)}["'][\\s\\S]*?<\\/(?:\\w+:)?message>`, 'i');
  const msgMatch = wsdl.match(msgRegex);
  if (msgMatch) return msgMatch[0];
  const elemRegex = new RegExp(`<(?:\\w+:)?element[^>]*name=["']${esc(msgName)}["'][\\s\\S]*?<\\/(?:\\w+:)?element>`, 'i');
  return wsdl.match(elemRegex)?.[0] || `<!-- "${msgName}" -->`;
}

function extractResponseFields(wsdl: string, opName: string): Array<{ name: string; type: string }> {
  const respName = `${opName}Response`;
  const elemRegex = new RegExp(`<(?:\\w+:)?element[^>]*name=["']${esc(respName)}["'][\\s\\S]*?<\\/(?:\\w+:)?element>`, 'i');
  const match = wsdl.match(elemRegex);
  if (!match) return [];
  const fields: Array<{ name: string; type: string }> = [];
  const fieldRegex = /<(?:\w+:)?element[^>]*name=["']([^"']+)["'][^>]*type=["']([^"']+)["']/gi;
  let fm: RegExpExecArray | null;
  while ((fm = fieldRegex.exec(match[0])) !== null) {
    fields.push({ name: fm[1], type: fm[2] });
  }
  return fields;
}

function extractRequestFields(wsdl: string, opName: string): Array<{ name: string; type: string }> {
  // Try to find element matching operation name (e.g., <element name="OperationName">)
  const elemRegex = new RegExp(`<(?:\\w+:)?element[^>]*name=["']${esc(opName)}["'][\\s\\S]*?<\\/(?:\\w+:)?element>`, 'i');
  const match = wsdl.match(elemRegex);
  if (match) {
    const fields: Array<{ name: string; type: string }> = [];
    const fieldRegex = /<(?:\w+:)?element[^>]*name=["']([^"']+)["'][^>]*type=["']([^"']+)["']/gi;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRegex.exec(match[0])) !== null) {
      if (fm[1] !== opName) fields.push({ name: fm[1], type: fm[2] });
    }
    if (fields.length > 0) return fields;
  }
  // Try message-based lookup (e.g., <message name="OperationNameRequest">)
  const msgNames = [`${opName}Request`, `${opName}Input`, `${opName}SoapIn`, opName];
  for (const msgName of msgNames) {
    const msgRegex = new RegExp(`<(?:\\w+:)?message[^>]*name=["']${esc(msgName)}["'][\\s\\S]*?<\\/(?:\\w+:)?message>`, 'i');
    const msgMatch = wsdl.match(msgRegex);
    if (msgMatch) {
      const parts: Array<{ name: string; type: string }> = [];
      const partRegex = /<(?:\w+:)?part[^>]*name=["']([^"']+)["'][^>]*(?:type|element)=["']([^"']+)["']/gi;
      let pm: RegExpExecArray | null;
      while ((pm = partRegex.exec(msgMatch[0])) !== null) {
        parts.push({ name: pm[1], type: pm[2] });
      }
      if (parts.length > 0) return parts;
    }
  }
  return [];
}

/**
 * Extract properties from soap package's describe() output.
 * The soap package puts fields directly at the top level as { fieldName: 'type' } or { fieldName: { ...nested } }
 */
function extractSchemaProperties(schema: Record<string, unknown> | undefined): Record<string, SchemaField> | undefined {
  if (!schema) return undefined;
  const props: Record<string, SchemaField> = {};
  for (const [key, value] of Object.entries(schema)) {
    // Skip metadata keys
    if (key === 'targetNSAlias' || key === 'targetNamespace' || key === 'properties' || key === '$attributes') continue;
    if (typeof value === 'string') {
      // Simple type: { fieldName: 'xsd:string' }
      props[key] = { type: value };
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Complex/nested type from describe()
      const nested = value as Record<string, unknown>;
      if (nested['targetNSAlias'] || nested['targetNamespace']) {
        // This is a complex type — recurse
        const childProps = extractSchemaProperties(nested);
        props[key] = { type: 'object', properties: childProps as Record<string, SchemaField> };
      } else {
        // Might be { type: 'xsd:string', ... } or similar
        props[key] = { type: (nested['type'] as string) || 'complexType', properties: extractSchemaProperties(nested) as Record<string, SchemaField> };
      }
    }
  }
  return Object.keys(props).length > 0 ? props : undefined;
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
