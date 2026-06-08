/**
 * ClientCertificates — configure mTLS client certificates per domain.
 * Feature 6B.5 — Client certificates (mTLS)
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, PlusIcon, TrashIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';

interface CertEntry {
  id: string;
  domain: string;       // e.g. api.example.com (supports wildcards)
  certPath: string;     // path to .pem/.crt file
  keyPath: string;      // path to .key file
  caPath?: string;      // path to CA certificate (optional)
  passphrase?: string;  // optional passphrase for encrypted key
  enabled: boolean;
  verified?: boolean;
}

interface Props {
  onClose: () => void;
}

const STORAGE_KEY = 'daakia:client-certs';

function loadCerts(): CertEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

export function ClientCertificates({ onClose }: Props) {
  const [certs, setCerts] = useState<CertEntry[]>(loadCerts);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<CertEntry>>({});
  const [addMode, setAddMode] = useState(false);
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'cert:verified') {
        setCerts(prev => prev.map(c => c.id === msg.certId ? { ...c, verified: msg.ok as boolean } : c));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const saveCerts = (updated: CertEntry[]) => {
    setCerts(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    postMsg({ type: 'certs:configure', certs: updated.filter(c => c.enabled) });
  };

  const addCert = () => {
    if (!editing.domain || !editing.certPath || !editing.keyPath) {
      addToast({ type: 'warning', message: 'Domain, certificate, and key are required.' });
      return;
    }
    const cert: CertEntry = {
      id: `cert-${Date.now()}`,
      domain: editing.domain,
      certPath: editing.certPath,
      keyPath: editing.keyPath,
      caPath: editing.caPath,
      passphrase: editing.passphrase,
      enabled: true,
    };
    saveCerts([...certs, cert]);
    setEditing({});
    setAddMode(false);
    postMsg({ type: 'cert:verify', certId: cert.id, certPath: cert.certPath, keyPath: cert.keyPath });
    addToast({ type: 'success', message: `Certificate for ${cert.domain} added` });
  };

  const deleteCert = (id: string) => {
    saveCerts(certs.filter(c => c.id !== id));
    if (selected === id) setSelected(null);
  };

  const toggleCert = (id: string) => {
    saveCerts(certs.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
  };

  const selectedCert = certs.find(c => c.id === selected);

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[720px] max-h-[90vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-surface-bg)', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Client Certificates (mTLS)</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Configure per-domain client certificates for mutual TLS</p>
          </div>
          <button type="button" onClick={() => setAddMode(true)}
            className="flex items-center gap-1 h-[28px] px-2.5 text-[10.5px] rounded-md cursor-pointer text-white"
            style={{ backgroundColor: 'var(--color-success)' }}>
            <PlusIcon size={10} />Add Certificate
          </button>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Cert list */}
          <div className="w-[260px] flex-shrink-0 border-r overflow-y-auto [scrollbar-gutter:stable]"
            style={{ borderColor: 'var(--color-surface-border)' }}>
            {certs.length === 0 && !addMode && (
              <div className="flex flex-col items-center justify-center p-6 gap-2">
                <p className="text-[11px] text-center" style={{ color: 'var(--color-text-muted)' }}>
                  No certificates configured
                </p>
                <button type="button" onClick={() => setAddMode(true)}
                  className="text-[10.5px] px-3 py-1 rounded-md cursor-pointer text-white"
                  style={{ backgroundColor: 'var(--color-success)' }}>
                  Add First Certificate
                </button>
              </div>
            )}
            {certs.map(cert => (
              <button key={cert.id} type="button"
                onClick={() => { setSelected(cert.id); setAddMode(false); }}
                className="w-full text-left flex items-center gap-2 px-3 py-2.5 border-b cursor-pointer"
                style={{
                  borderColor: 'var(--color-surface-border)',
                  backgroundColor: selected === cert.id ? 'color-mix(in srgb, var(--color-info) 10%, transparent)' : 'transparent',
                }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{cert.domain}</span>
                    {cert.verified === true && <CheckIcon size={10} style={{ color: 'var(--color-success)' }} />}
                    {cert.verified === false && <span className="text-[9px]" style={{ color: 'var(--color-error)' }}>✗</span>}
                  </div>
                  <p className="text-[9.5px]" style={{ color: cert.enabled ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                    {cert.enabled ? 'Active' : 'Disabled'}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button type="button" onClick={e => { e.stopPropagation(); toggleCert(cert.id); }}
                    className="text-[9px] px-1.5 py-0.5 rounded border cursor-pointer"
                    style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
                    {cert.enabled ? 'off' : 'on'}
                  </button>
                  <button type="button" onClick={e => { e.stopPropagation(); deleteCert(cert.id); }}
                    className="w-5 h-5 flex items-center justify-center opacity-40 hover:opacity-100 cursor-pointer">
                    <TrashIcon size={10} />
                  </button>
                </div>
              </button>
            ))}
          </div>

          {/* Detail / Add form */}
          <div className="flex-1 p-4 overflow-y-auto">
            {addMode && (
              <div className="flex flex-col gap-3">
                <p className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Add Certificate</p>

                {[
                  { label: 'Domain (supports wildcards)', field: 'domain', placeholder: 'api.example.com or *.example.com' },
                  { label: 'Certificate file path (.pem / .crt)', field: 'certPath', placeholder: '/path/to/client.crt' },
                  { label: 'Private key file path (.key)', field: 'keyPath', placeholder: '/path/to/client.key' },
                  { label: 'CA certificate (optional, for self-signed servers)', field: 'caPath', placeholder: '/path/to/ca.crt' },
                  { label: 'Key passphrase (optional)', field: 'passphrase', placeholder: '(leave empty if key is not encrypted)' },
                ].map(({ label, field, placeholder }) => (
                  <div key={field}>
                    <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>{label}</label>
                    <input
                      value={(editing as Record<string, string>)[field] || ''}
                      onChange={e => setEditing(prev => ({ ...prev, [field]: e.target.value }))}
                      placeholder={placeholder}
                      type={field === 'passphrase' ? 'password' : 'text'}
                      className="w-full px-3 py-1.5 rounded-lg text-[11.5px] outline-none"
                      style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
                    />
                  </div>
                ))}

                <div className="flex gap-2 mt-1">
                  <button type="button" onClick={() => { setAddMode(false); setEditing({}); }}
                    className="h-[30px] px-3 text-[11px] rounded-md cursor-pointer"
                    style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>
                    Cancel
                  </button>
                  <button type="button" onClick={addCert}
                    className="h-[30px] px-3 text-[11px] font-medium rounded-md cursor-pointer text-white"
                    style={{ backgroundColor: 'var(--color-success)' }}>
                    Add Certificate
                  </button>
                </div>
              </div>
            )}

            {!addMode && selectedCert && (
              <div className="flex flex-col gap-3">
                <p className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{selectedCert.domain}</p>

                {[
                  { label: 'Domain', value: selectedCert.domain },
                  { label: 'Certificate', value: selectedCert.certPath },
                  { label: 'Private key', value: selectedCert.keyPath },
                  { label: 'CA certificate', value: selectedCert.caPath || '(not set)' },
                  { label: 'Passphrase', value: selectedCert.passphrase ? '••••••' : '(not set)' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
                    <p className="text-[11.5px] font-mono mt-0.5" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
                  </div>
                ))}

                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10.5px]" style={{ color: selectedCert.enabled ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                    {selectedCert.enabled ? '✓ Active for this domain' : '○ Disabled'}
                  </span>
                  {selectedCert.verified === true && <span className="text-[10px]" style={{ color: 'var(--color-success)' }}>✓ Certificate verified</span>}
                  {selectedCert.verified === false && <span className="text-[10px]" style={{ color: 'var(--color-error)' }}>✗ Verification failed</span>}
                </div>
              </div>
            )}

            {!addMode && !selectedCert && (
              <div className="flex items-center justify-center h-full">
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Select a certificate to view details</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <button type="button" onClick={onClose}
            className="h-[30px] px-4 text-[11px] font-medium rounded-md cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
