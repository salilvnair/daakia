import { useState, useRef } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { useToastStore } from '../../../store/toast-store';
import { useAiFeaturesStore } from '../../../store/ai-features-store';
import { FormDataTable, ConfirmDialog, KeyValueTable } from '../../shared';
import { SelectInputView, EditorView, type EditorLanguage } from '../../../dui';
import { TrashIcon, BulkEditIcon, PlusIcon, SparkleIcon, WandIcon, FileUploadIcon, DiceIcon } from '../../../icons';
import { AiBodyGenerate, type AiBodyGenerateHandle } from '../../ai/AiBodyGenerate';
import { AiDataGeneratorModal } from '../../ai/AiDataGeneratorModal';
import { AiRequestFuzzerModal } from '../../ai/AiRequestFuzzerModal';
import { CONTENT_TYPE_MODE, CONTENT_TYPE_LANG, CONTENT_TYPE_PLACEHOLDER, CONTENT_TYPE_OPTIONS } from './bodyContentTypes';

type Tab = ReturnType<typeof useTabsStore.getState>['tabs'][0];

interface BodyEditorProps {
  tab: Tab;
  showFuzzer: boolean;
  onCloseFuzzer: () => void;
}

export function BodyEditor({ tab, showFuzzer, onCloseFuzzer }: BodyEditorProps) {
  const { updateTab } = useTabsStore();
  const { addToast } = useToastStore();
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);
  const [bulkEdit, setBulkEdit] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const bulkTextRef = useRef('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const binaryFileInputRef = useRef<HTMLInputElement>(null);
  const [binaryFileName, setBinaryFileName] = useState('');
  const aiBodyGenerateRef = useRef<AiBodyGenerateHandle>(null);
  const [showDataGenerator, setShowDataGenerator] = useState(false);

  const contentType = tab.bodyContentType || 'application/json';
  const bodyMode = tab.bodyMode;

  const handleContentTypeChange = (ct: string) => {
    const mode = (CONTENT_TYPE_MODE[ct] || 'raw') as typeof tab.bodyMode;
    updateTab(tab.id, { bodyContentType: ct, bodyMode: mode });
    setBulkEdit(false);
  };

  const dropdownValue = contentType === 'application/json' && bodyMode === 'none' ? 'none' : (bodyMode === 'none' ? 'none' : contentType);
  const isTableMode = bodyMode === 'form-data' || bodyMode === 'x-www-form-urlencoded';
  const isCodeMode = bodyMode === 'json' || bodyMode === 'raw';
  const isBinaryMode = bodyMode === 'binary';
  const tableRows = bodyMode === 'form-data' ? tab.bodyFormData : tab.bodyUrlEncoded;
  const hasContent = isTableMode
    ? tableRows.some(r => r.key || r.value)
    : isCodeMode ? tab.bodyRaw.trim().length > 0
    : isBinaryMode ? !!tab.bodyRaw
    : false;

  const editorLanguage = (CONTENT_TYPE_LANG[contentType] || (bodyMode === 'json' ? 'json' : 'plaintext')) as EditorLanguage;

  const handleClearAll = () => {
    if (bodyMode === 'form-data') {
      updateTab(tab.id, { bodyFormData: [{ id: crypto.randomUUID(), key: '', value: '', enabled: true, type: 'text' }] });
    } else if (bodyMode === 'x-www-form-urlencoded') {
      updateTab(tab.id, { bodyUrlEncoded: [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }] });
    } else {
      updateTab(tab.id, { bodyRaw: '' });
      setBinaryFileName('');
    }
    setShowClearConfirm(false);
    setBulkEdit(false);
  };

  const handlePrettify = () => {
    if (tab.bodyMode === 'json') {
      try {
        const formatted = JSON.stringify(JSON.parse(tab.bodyRaw), null, 2);
        updateTab(tab.id, { bodyRaw: formatted });
      } catch { /* ignore invalid JSON */ }
    }
  };

  const toBulkText = () =>
    tableRows
      .filter(r => r.key || r.value)
      .map(r => `${!r.enabled ? '# ' : ''}${r.key}: ${r.value}`)
      .join('\n');

  const fromBulkText = (text: string) => {
    const parsed = text.split('\n').map(line => {
      const disabled = line.startsWith('# ');
      const clean = disabled ? line.slice(2) : line;
      const colonIdx = clean.indexOf(':');
      const key = colonIdx >= 0 ? clean.slice(0, colonIdx).trim() : clean.trim();
      const value = colonIdx >= 0 ? clean.slice(colonIdx + 1).trim() : '';
      return { id: crypto.randomUUID(), key, value, description: '', enabled: !disabled, type: 'text' as const };
    }).filter(r => r.key || r.value);
    const rows = parsed.length === 0
      ? [{ id: crypto.randomUUID(), key: '', value: '', enabled: true, type: 'text' as const }]
      : parsed;
    if (tab.bodyMode === 'form-data') updateTab(tab.id, { bodyFormData: rows });
    else updateTab(tab.id, { bodyUrlEncoded: rows });
  };

  const addRow = () => {
    const newRow = { id: crypto.randomUUID(), key: '', value: '', enabled: true, type: 'text' as const };
    if (tab.bodyMode === 'form-data') updateTab(tab.id, { bodyFormData: [...tab.bodyFormData, newRow] });
    else updateTab(tab.id, { bodyUrlEncoded: [...tab.bodyUrlEncoded, newRow] });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      {/* Content Type row */}
      <div className="flex items-center gap-3 px-1">
        <span className="text-[12px] text-[var(--color-text-muted)]">Content Type</span>
        <SelectInputView
          options={CONTENT_TYPE_OPTIONS}
          value={dropdownValue}
          onChange={handleContentTypeChange}
          size="md"
        />
        {bodyMode !== 'none' && contentType !== 'none' && bodyMode !== 'form-data' && bodyMode !== 'x-www-form-urlencoded' && (
          <span className="text-[12px] text-[var(--color-text-muted)] opacity-60">Override</span>
        )}
      </div>

      {bodyMode === 'none' && (
        <p className="text-xs text-[var(--color-text-muted)] py-4 text-center">
          This request does not have a body.
        </p>
      )}

      {/* Toolbar */}
      {bodyMode !== 'none' && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[12px] text-[var(--color-primary)] font-medium">
            {isBinaryMode ? 'File Upload' : 'Raw Request Body'}
          </span>
          <div className="flex items-center gap-1">
            {hasContent && (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-colors"
                title="Clear all"
              >
                <TrashIcon size={14} />
              </button>
            )}
            {isTableMode && (
              <>
                <button
                  type="button"
                  onClick={() => { if (bulkEdit) fromBulkText(bulkTextRef.current); setBulkEdit(!bulkEdit); }}
                  className={`w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors ${
                    bulkEdit
                      ? 'text-[var(--color-primary)] bg-[rgba(99,102,241,0.12)]'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)]'
                  }`}
                  title="Bulk edit"
                >
                  <BulkEditIcon size={14} />
                </button>
                <button
                  type="button"
                  onClick={addRow}
                  className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[rgba(99,102,241,0.08)] cursor-pointer transition-colors"
                  title="Add new row"
                >
                  <PlusIcon size={14} />
                </button>
              </>
            )}
            {isCodeMode && (
              <>
                {editorLanguage === 'json' && (
                  <button
                    type="button"
                    onClick={handlePrettify}
                    className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)] cursor-pointer transition-colors"
                    title="Prettify"
                  >
                    <WandIcon size={14} />
                  </button>
                )}
                {aiEnabled('bodyGenerator') && (
                  <button
                    type="button"
                    onClick={() => aiBodyGenerateRef.current?.open()}
                    className="w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors"
                    style={{ color: aiBodyGenerateRef.current?.loading ? 'var(--color-protocol-ai)' : 'var(--color-text-muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-protocol-ai)')}
                    onMouseLeave={e => { if (!aiBodyGenerateRef.current?.loading) e.currentTarget.style.color = 'var(--color-text-muted)'; }}
                    title="Generate body with AI"
                  >
                    <SparkleIcon size={14} />
                  </button>
                )}
                {aiEnabled('dataGenerator') && (
                  <button
                    type="button"
                    onClick={() => setShowDataGenerator(true)}
                    className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-info)] hover:bg-[rgba(14,165,233,0.08)] cursor-pointer transition-colors"
                    title="Generate test data with AI"
                  >
                    <DiceIcon size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)] cursor-pointer transition-colors"
                  title="Import from file"
                >
                  <FileUploadIcon size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Binary file picker */}
      {isBinaryMode && (
        <div className="flex items-center gap-3 px-1 py-3">
          <button
            type="button"
            onClick={() => binaryFileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-md bg-[var(--color-input-bg)] border border-[var(--color-surface-border)] text-[12px] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors"
          >
            Choose File
          </button>
          <span className="text-[12px] text-[var(--color-text-muted)]">
            {binaryFileName || 'No file chosen'}
          </span>
        </div>
      )}

      {/* AI Body Generator */}
      {isCodeMode && !bulkEdit && (
        <AiBodyGenerate
          ref={aiBodyGenerateRef}
          tabId={tab.id}
          method={tab.method || 'GET'}
          url={tab.url || ''}
          contentType={contentType}
          onApply={(body) => updateTab(tab.id, { bodyRaw: body })}
        />
      )}

      {/* Code editor */}
      {isCodeMode && !bulkEdit && (
        <div className="flex-1 min-h-0">
          <EditorView
            value={tab.bodyRaw}
            onChange={(val) => updateTab(tab.id, { bodyRaw: val })}
            language={editorLanguage}
            placeholder={CONTENT_TYPE_PLACEHOLDER[contentType] ?? 'Raw Request Body'}
            height="100%"
            bordered
          />
        </div>
      )}

      {tab.bodyMode === 'form-data' && !bulkEdit && (
        <FormDataTable
          rows={tab.bodyFormData}
          onChange={(rows) => updateTab(tab.id, { bodyFormData: rows })}
          hideToolbar
        />
      )}

      {tab.bodyMode === 'x-www-form-urlencoded' && !bulkEdit && (
        <KeyValueTable
          rows={tab.bodyUrlEncoded}
          onChange={(rows) => updateTab(tab.id, { bodyUrlEncoded: rows })}
          placeholder={{ key: 'Field', value: 'Value' }}
          hideToolbar
        />
      )}

      {/* Bulk edit textarea */}
      {isTableMode && bulkEdit && (
        <BodyBulkEditArea defaultValue={toBulkText()} onChangeRef={bulkTextRef} />
      )}

      {showClearConfirm && (
        <ConfirmDialog
          title="Clear All?"
          message="All body content will be permanently deleted. This cannot be undone."
          confirmLabel="Clear All"
          danger
          onConfirm={handleClearAll}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".json,.xml,.txt,.html,.csv,.yaml,.yml"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            updateTab(tab.id, { bodyRaw: reader.result as string });
            addToast({ type: 'success', message: `Imported ${file.name}` });
          };
          reader.readAsText(file);
          e.target.value = '';
        }}
      />
      <input
        ref={binaryFileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1] || '';
            updateTab(tab.id, { bodyRaw: base64 });
            setBinaryFileName(file.name);
            addToast({ type: 'success', message: `Selected ${file.name} (${(file.size / 1024).toFixed(1)} KB)` });
          };
          reader.readAsDataURL(file);
          e.target.value = '';
        }}
      />

      {showDataGenerator && (
        <AiDataGeneratorModal
          tabId={tab.id}
          onApply={(data) => updateTab(tab.id, { bodyRaw: data })}
          onClose={() => setShowDataGenerator(false)}
        />
      )}

      {showFuzzer && <AiRequestFuzzerModal onClose={onCloseFuzzer} />}
    </div>
  );
}

function BodyBulkEditArea({ defaultValue, onChangeRef }: { defaultValue: string; onChangeRef: React.MutableRefObject<string> }) {
  const [text, setText] = useState(defaultValue);
  const [focused, setFocused] = useState(false);
  onChangeRef.current = text;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] text-[var(--color-text-muted)] px-1">
        Entries are separated by newline. Keys and values are separated by <code style={{ color: 'var(--color-primary)' }}>:</code>. Prepend <code style={{ color: 'var(--color-primary)' }}>#</code> to disable a row.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full min-h-[160px] px-3 py-2.5 rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[13px] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none resize-y"
        style={focused ? { borderColor: 'var(--color-primary)' } : undefined}
        placeholder={`field1: value1\nfield2: value2\n# disabled_field: value3`}
        spellCheck={false}
      />
    </div>
  );
}
