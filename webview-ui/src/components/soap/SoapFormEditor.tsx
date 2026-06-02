import { useState, useCallback } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { ChevronRightIcon } from '../../icons';
import type { SoapOperationDef } from '../../store/tabs-store';

const ACCENT = 'var(--color-protocol-soap)';

interface FieldDef {
  name: string;
  type: string;
  required: boolean;
  documentation?: string;
  children?: FieldDef[];
  enumValues?: string[];
  isArray?: boolean;
}

/**
 * SoapFormEditor — schema-driven form generated from WSDL operation inputSchema.
 * Shows typed inputs (string, int, boolean, date, enum, complex type expansion).
 * Syncs form values → raw XML envelope on "Generate XML" click.
 */
export function SoapFormEditor({ onGenerated }: { onGenerated?: () => void }) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  if (!activeTab) return null;

  const services = activeTab.soapServices || [];
  const selectedOp = findSelectedOperation(services, activeTab.soapService, activeTab.soapPort, activeTab.soapOperation);
  const schema = selectedOp?.inputSchema;
  const formData: Record<string, unknown> = activeTab.soapFormData || {};

  const updateFormData = useCallback((path: string, value: unknown) => {
    const newData = { ...formData, [path]: value };
    updateTab(activeTab.id, { soapFormData: newData, dirty: true });
  }, [activeTab.id, formData, updateTab]);

  const generateXml = useCallback(() => {
    if (!selectedOp || !schema) return;

    const soapVersion = activeTab.soapVersion || '1.1';
    const soapNs = soapVersion === '1.2'
      ? 'http://www.w3.org/2003/05/soap-envelope'
      : 'http://schemas.xmlsoap.org/soap/envelope/';

    const bodyXml = buildXmlFromFormData(schema as Record<string, unknown>, formData, selectedOp.name, 'tns');
    const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="${soapNs}"
               xmlns:tns="http://tempuri.org/">
  <soap:Header/>
  <soap:Body>
${bodyXml}
  </soap:Body>
</soap:Envelope>`;

    updateTab(activeTab.id, { soapEnvelope: envelope, dirty: true });
    onGenerated?.();
  }, [activeTab, selectedOp, schema, formData, updateTab, onGenerated]);

  if (!schema || !selectedOp) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)]">
        <p className="text-[11px]">Import a WSDL and select an operation to use the form editor</p>
      </div>
    );
  }

  const fields = schemaToFields(schema as Record<string, unknown>);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-surface-border)]">
        <span className="text-[11px] text-[var(--color-text-muted)]">{selectedOp.name} — Form Mode</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => updateTab(activeTab.id, { soapFormData: {}, dirty: true })}
            className="h-[24px] px-2.5 text-[10px] font-medium rounded cursor-pointer transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)]"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={generateXml}
            className="h-[24px] px-2.5 text-[10px] font-medium rounded cursor-pointer transition-colors"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-soap) 12%, transparent)', color: ACCENT }}
          >
            Generate XML →
          </button>
        </div>
      </div>

      {/* Form fields */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-3">
        <div className="flex flex-col gap-2">
          {fields.map(field => (
            <FormField
              key={field.name}
              field={field}
              path={field.name}
              value={formData[field.name]}
              formData={formData}
              onChange={updateFormData}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ────────── Form Field Component ──────────

function FormField({ field, path, value, formData, onChange }: {
  field: FieldDef;
  path: string;
  value: unknown;
  formData: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  if (field.type === 'complex' && field.children) {
    return (
      <div className="rounded-md border border-[rgba(255,255,255,0.06)] overflow-hidden">
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 bg-[rgba(255,255,255,0.02)] cursor-pointer hover:bg-[rgba(255,255,255,0.04)] transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronRightIcon size={10} className={`text-[var(--color-text-muted)] transition-transform ${expanded ? 'rotate-90' : ''}`} />
          <span className="text-[11px] font-medium text-[var(--color-text-primary)]">{field.name}</span>
          <span className="text-[9px] text-[var(--color-text-muted)]">(complex{field.isArray ? '[]' : ''})</span>
          {field.required && <span className="text-[9px] text-[var(--color-error)]">*</span>}
        </div>
        {expanded && (
          <div className="px-3 py-2 border-t border-[rgba(255,255,255,0.04)] flex flex-col gap-2">
            {field.children.map(child => (
              <FormField
                key={child.name}
                field={child}
                path={`${path}.${child.name}`}
                value={formData[`${path}.${child.name}`]}
                formData={formData}
                onChange={onChange}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Simple field
  return (
    <div className="flex items-center gap-2">
      <label className="w-[130px] text-[11px] text-[var(--color-text-muted)] flex-shrink-0 flex items-center gap-1">
        {field.name}
        {field.required && <span className="text-[var(--color-error)]">*</span>}
      </label>
      {field.type === 'boolean' ? (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(path, e.target.checked)}
          className="accent-[var(--color-protocol-soap)]"
        />
      ) : field.enumValues && field.enumValues.length > 0 ? (
        <select
          value={(value as string) || ''}
          onChange={(e) => onChange(path, e.target.value)}
          className="flex-1 h-[26px] px-2 text-[11px] rounded bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-protocol-soap)]"
        >
          <option value="">-- Select --</option>
          {field.enumValues.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      ) : (
        <input
          type={field.type === 'int' || field.type === 'float' ? 'number' : field.type === 'date' || field.type === 'dateTime' ? 'date' : 'text'}
          value={(value as string) || ''}
          onChange={(e) => onChange(path, e.target.value)}
          placeholder={`(${field.type})`}
          className="flex-1 h-[26px] px-2 text-[11px] rounded bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-protocol-soap)]"
        />
      )}
      {field.documentation && (
        <span className="text-[9px] text-[var(--color-text-muted)] truncate max-w-[100px]" title={field.documentation}>
          {field.documentation}
        </span>
      )}
    </div>
  );
}

// ────────── Helpers ──────────

function findSelectedOperation(
  services: Array<{ name: string; ports: Array<{ name: string; operations: SoapOperationDef[] }> }>,
  serviceName?: string,
  portName?: string,
  opName?: string,
): SoapOperationDef | undefined {
  if (!serviceName || !opName) return undefined;
  for (const svc of services) {
    if (svc.name !== serviceName) continue;
    for (const port of svc.ports) {
      if (portName && port.name !== portName) continue;
      const op = port.operations.find(o => o.name === opName);
      if (op) return op;
    }
  }
  return undefined;
}

function schemaToFields(schema: Record<string, unknown>): FieldDef[] {
  const fields: FieldDef[] = [];
  for (const [key, value] of Object.entries(schema)) {
    if (key.startsWith('target') || key === 'xmlns') continue;
    fields.push(parseFieldDef(key, value));
  }
  return fields;
}

function parseFieldDef(name: string, value: unknown): FieldDef {
  if (typeof value === 'string') {
    const mapped = mapType(value);
    return { name, type: mapped, required: !value.includes('|') };
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const children = schemaToFields(value as Record<string, unknown>);
    return { name, type: 'complex', required: true, children };
  }
  return { name, type: 'string', required: false };
}

function mapType(xsd: string): string {
  const t = xsd.replace(/^(xs:|xsd:|s:)/, '').toLowerCase().split('|')[0].trim();
  if (['int', 'integer', 'long', 'short'].includes(t)) return 'int';
  if (['float', 'double', 'decimal'].includes(t)) return 'float';
  if (t === 'boolean') return 'boolean';
  if (t === 'date' || t === 'datetime') return 'date';
  return 'string';
}

function buildXmlFromFormData(schema: Record<string, unknown>, formData: Record<string, unknown>, opName: string, prefix: string): string {
  const indent = '    ';
  const lines: string[] = [];
  lines.push(`${indent}<${prefix}:${opName}>`);

  for (const [key, typeDef] of Object.entries(schema)) {
    if (key.startsWith('target') || key === 'xmlns') continue;

    if (typeDef && typeof typeDef === 'object' && !Array.isArray(typeDef)) {
      // Complex type
      lines.push(`${indent}  <${prefix}:${key}>`);
      for (const [childKey] of Object.entries(typeDef as Record<string, unknown>)) {
        if (childKey.startsWith('target') || childKey === 'xmlns') continue;
        const val = formData[`${key}.${childKey}`] || '?';
        lines.push(`${indent}    <${prefix}:${childKey}>${escapeXml(String(val))}</${prefix}:${childKey}>`);
      }
      lines.push(`${indent}  </${prefix}:${key}>`);
    } else {
      const val = formData[key] || '?';
      lines.push(`${indent}  <${prefix}:${key}>${escapeXml(String(val))}</${prefix}:${key}>`);
    }
  }

  lines.push(`${indent}</${prefix}:${opName}>`);
  return lines.join('\n');
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
