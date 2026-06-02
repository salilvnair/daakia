import { useState, useMemo, useRef } from 'react';
import { CodeEditor } from '../../shared';
import type { CodeLanguage } from '../../shared/editors/CodeEditor';
import { useClickOutside } from '../../../hooks/useClickOutside';
import { generateSchema, downloadBlob, type SchemaLang } from '../../../services/response';
import { WrapLinesIcon, DownloadIcon, CopyIcon, CloseIcon, ChevronDownIcon } from '../../../icons';
import { ToolbarBtn } from './ToolbarBtn';

export function DataSchemaModal({ body, onClose }: { body: string; onClose: () => void }) {
  const [lang, setLang] = useState<SchemaLang>('typescript');
  const [langOpen, setLangOpen] = useState(false);

  const schema = useMemo(() => {
    try {
      const parsed = JSON.parse(body);
      return generateSchema(parsed, lang);
    } catch {
      return '// Unable to parse JSON response';
    }
  }, [body, lang]);

  const editorLang: CodeLanguage = lang === 'typescript' ? 'typescript' : lang === 'javascript' ? 'javascript' : lang === 'python' ? 'python' : 'java';

  const langDropdownRef = useRef<HTMLDivElement>(null);
  useClickOutside(langDropdownRef, () => setLangOpen(false), langOpen);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-[var(--color-surface)] border border-[var(--color-surface-border)] rounded-lg shadow-2xl w-[960px] max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-surface-border)]">
          <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)]">Data Schema</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-[#ef4444] hover:text-[#dc2626] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-colors"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Language selector */}
        <div className="px-5 py-3 border-b border-[var(--color-surface-border)]">
          <div className="relative" ref={langDropdownRef}>
            <button
              type="button"
              onClick={() => setLangOpen(!langOpen)}
              className="w-full h-[34px] px-3 text-[13px] rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] flex items-center justify-between cursor-pointer hover:border-[rgba(255,255,255,0.15)]"
            >
              <span>{lang === 'typescript' ? 'TypeScript' : lang === 'javascript' ? 'JavaScript' : lang === 'python' ? 'Python' : 'Java'}</span>
              <ChevronDownIcon size={12} />
            </button>
            {langOpen && (
              <div className="absolute top-full left-0 right-0 z-50 mt-0.5 bg-[var(--color-surface)] border border-[var(--color-surface-border)] rounded-md shadow-lg py-0.5">
                {(['typescript', 'javascript', 'python', 'java'] as SchemaLang[]).map(l => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => { setLang(l); setLangOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-[13px] cursor-pointer transition-colors ${
                      lang === l ? 'bg-[rgba(99,102,241,0.12)] text-[var(--color-primary)]' : 'text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]'
                    }`}
                  >
                    {l === 'typescript' ? 'TypeScript' : l === 'javascript' ? 'JavaScript' : l === 'python' ? 'Python' : 'Java'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Generated code */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between px-5 py-2">
            <span className="text-[11px] text-[var(--color-text-muted)]">Generated code</span>
            <div className="flex items-center gap-1">
              <ToolbarBtn title="Wrap lines" onClick={() => {}}>
                <WrapLinesIcon size={14} />
              </ToolbarBtn>
              <ToolbarBtn title="Download" onClick={() => {
                const ext = lang === 'typescript' ? 'ts' : lang === 'javascript' ? 'js' : lang === 'python' ? 'py' : 'java';
                downloadBlob(schema, `schema.${ext}`);
              }}>
                <DownloadIcon size={14} />
              </ToolbarBtn>
              <ToolbarBtn title="Copy" onClick={() => navigator.clipboard.writeText(schema)}>
                <CopyIcon size={14} />
              </ToolbarBtn>
            </div>
          </div>
          <div className="flex-1 min-h-[400px] max-h-[600px]">
            <CodeEditor
              value={schema}
              language={editorLang}
              readOnly
              height="100%"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
