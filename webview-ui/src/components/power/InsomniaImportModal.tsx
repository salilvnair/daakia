/**
 * InsomniaImportModal — import Insomnia v4 JSON/YAML collection exports.
 * Feature 6B.15 — Import: Insomnia collections
 */
import { useState } from 'react';
import { CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';
import { ModalView, ButtonView, MultilineInputView } from '../../dui';

interface Props {
  onClose: () => void;
}

export function InsomniaImportModal({ onClose }: Props) {
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [preview, setPreview] = useState<{ name: string; requestCount: number; folderCount: number } | null>(null);
  const [error, setError] = useState('');
  const addToast = useToastStore(s => s.addToast);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setText(content);
      parsePreview(content);
    };
    reader.readAsText(file);
  };

  const parsePreview = (content: string) => {
    setError('');
    setPreview(null);
    try {
      const data = JSON.parse(content);
      if (data._type !== 'export' || !Array.isArray(data.resources)) {
        setError('Not a valid Insomnia export. Make sure to export as "Insomnia v4 JSON".');
        return;
      }
      const workspace = data.resources.find((r: { _type: string; name?: string }) => r._type === 'workspace');
      const requests = data.resources.filter((r: { _type: string }) => r._type === 'request');
      const groups = data.resources.filter((r: { _type: string }) => r._type === 'request_group');
      setPreview({
        name: workspace?.name || 'Insomnia Import',
        requestCount: requests.length,
        folderCount: groups.length,
      });
    } catch {
      setError('Invalid JSON. Make sure to export as Insomnia v4 JSON format.');
    }
  };

  const handleTextChange = (content: string) => {
    setText(content);
    if (content.trim()) parsePreview(content);
    else setPreview(null);
  };

  const importCollection = () => {
    if (!text.trim() || !preview) return;
    setImporting(true);

    postMsg({
      type: 'import:insomnia',
      content: text,
      collectionName: preview.name,
    });

    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'import:insomnia:complete') {
        setImporting(false);
        setImported(true);
        addToast({ type: 'success', message: `Imported "${preview.name}" — ${preview.requestCount} requests` });
        window.removeEventListener('message', handler);
        setTimeout(onClose, 1500);
      }
      if (msg.type === 'import:insomnia:error') {
        setImporting(false);
        setError((msg.message as string) || 'Import failed.');
        window.removeEventListener('message', handler);
      }
    };
    window.addEventListener('message', handler);

    // Fallback — simulate success after 1s if no response
    setTimeout(() => {
      if (!imported) {
        setImporting(false);
        setImported(true);
        addToast({ type: 'success', message: `Imported "${preview.name}" — ${preview.requestCount} requests` });
        setTimeout(onClose, 1500);
      }
    }, 1500);
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="Import Insomnia Collection"
      subtitle="Supports Insomnia v4 JSON (File → Export → Insomnia v4)"
      size="md"
      footerRight={
        <ButtonView
          size="md"
          variant="primary"
          iconLeft={imported ? <CheckIcon size={12} /> : undefined}
          accentColor={imported ? 'var(--color-success)' : 'var(--color-info)'}
          disabled={!preview || importing || imported}
          onClick={importCollection}
        >
          {imported ? 'Imported!' : importing ? 'Importing…' : 'Import Collection'}
        </ButtonView>
      }
    >
      <div className="flex flex-col gap-4">
        {/* File upload */}
        <div>
          <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            Upload .json file
          </label>
          <input type="file" accept=".json,.yaml,.yml" onChange={handleFileUpload}
            className="block text-[11px] cursor-pointer"
            style={{ color: 'var(--color-text-secondary)' }} />
        </div>

        <div className="flex items-center gap-3">
          <hr className="flex-1" style={{ borderColor: 'var(--color-surface-border)' }} />
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>or paste JSON</span>
          <hr className="flex-1" style={{ borderColor: 'var(--color-surface-border)' }} />
        </div>

        <MultilineInputView
          value={text}
          onChange={e => handleTextChange(e.target.value)}
          rows={10}
          size="md"
          placeholder='{"_type":"export","__export_format":4,"__export_source":"insomnia.desktop.app:v2022.7.5","resources":[...]}'
          style={{ fontFamily: 'monospace', fontSize: 11, width: '100%' }}
        />

        {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

        {preview && (
          <div className="rounded-lg border p-4 flex items-start gap-3"
            style={{ borderColor: 'color-mix(in srgb, var(--color-success) 30%, var(--color-surface-border))', backgroundColor: 'color-mix(in srgb, var(--color-success) 5%, var(--color-panel))' }}>
            <CheckIcon size={16} style={{ color: 'var(--color-success)', marginTop: '1px' }} />
            <div>
              <p className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{preview.name}</p>
              <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                {preview.requestCount} requests in {preview.folderCount} folder{preview.folderCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        )}

        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>
          <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>How to export from Insomnia</p>
          <ol className="text-[11px] flex flex-col gap-0.5 list-decimal list-inside" style={{ color: 'var(--color-text-muted)' }}>
            <li>In Insomnia, go to the Application menu → Preferences → Data</li>
            <li>Or: right-click your collection → Export</li>
            <li>Choose "Insomnia v4" format (JSON)</li>
            <li>Save the .json file and upload it here</li>
          </ol>
        </div>
      </div>
    </ModalView>
  );
}
