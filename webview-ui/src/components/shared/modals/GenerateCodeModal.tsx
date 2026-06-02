import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import hljs from 'highlight.js';
import { generateCode, LANGUAGES, type CodeGenInput } from '../../../utils/code-generator';
import { StyledDropdown } from '../controls/StyledDropdown';
import type { RequestTab } from '../../../store/tabs-store';
import { CloseIcon, WrapLinesIcon, DownloadIcon, CopyIcon } from '../../../icons';

const HLJS_LANG_MAP: Record<string, string> = {
  'shell-curl': 'bash',
  'shell-wget': 'bash',
  'javascript-fetch': 'javascript',
  'javascript-axios': 'javascript',
  'javascript-xhr': 'javascript',
  'python-requests': 'python',
  'python-http': 'python',
  'go-net': 'go',
  'java-okhttp': 'java',
  'csharp-httpclient': 'csharp',
  'php-curl': 'php',
  'ruby-net': 'ruby',
};

interface GenerateCodeModalProps {
  open: boolean;
  tab: RequestTab | null;
  onClose: () => void;
}

export function GenerateCodeModal({ open, tab, onClose }: GenerateCodeModalProps) {
  const [language, setLanguage] = useState('shell-curl');
  const [wrap, setWrap] = useState(true);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const code = useMemo(() => {
    if (!tab) return '';
    const input: CodeGenInput = {
      method: tab.method,
      url: tab.url,
      headers: (tab.headers || []).filter(h => h.enabled && h.key).map(h => ({ key: h.key, value: h.value })),
      params: (tab.params || []).filter(p => p.enabled && p.key).map(p => ({ key: p.key, value: p.value })),
      bodyMode: tab.bodyMode || 'none',
      bodyRaw: tab.bodyRaw || '',
      bodyFormData: (tab.bodyFormData || []).filter(f => f.enabled && f.key).map(f => ({ key: f.key, value: f.value, type: f.type || 'text' })),
      bodyUrlEncoded: (tab.bodyUrlEncoded || []).filter(u => u.enabled && u.key).map(u => ({ key: u.key, value: u.value })),
      authType: tab.authType || 'none',
      authData: tab.authData || {},
    };
    return generateCode(input, language);
  }, [tab, language]);

  const highlightedHtml = useMemo(() => {
    const lang = HLJS_LANG_MAP[language] || 'plaintext';
    try {
      return hljs.highlight(code, { language: lang }).value;
    } catch {
      return code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  }, [code, language]);

  const lines = code.split('\n');
  const highlightedLines = highlightedHtml.split('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
  };

  const handleDownload = () => {
    const langDef = LANGUAGES.find(l => l.id === language);
    const ext = langDef?.extension || 'txt';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `request.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!open || !tab) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50"

    >
      <div className="w-full max-w-[640px] rounded-xl bg-[var(--color-elevated)] border border-[var(--color-elevated-border)] shadow-2xl animate-[fadeSlideIn_150ms_ease-out] flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--color-surface-border)]">
          <h2 className="text-[20px] font-semibold text-[var(--color-text-primary)]">Generate code</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[#ef4444] hover:text-[#dc2626] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-colors"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
          {/* Language selector */}
          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-[var(--color-text-secondary)]">Choose language</label>
            <StyledDropdown
              options={LANGUAGES.map(l => ({ value: l.id, label: l.label }))}
              value={language}
              onChange={(v) => setLanguage(v)}
              size="sm"
            />
          </div>

          {/* Generated code */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-[12px] font-medium text-[var(--color-text-secondary)]">Generated code</label>
              <div className="flex items-center gap-1">
                <MiniBtn title="Toggle wrap" onClick={() => setWrap(v => !v)} active={wrap}>
                  <WrapLinesIcon size={14} />
                </MiniBtn>
                <MiniBtn title="Download" onClick={handleDownload}>
                  <DownloadIcon size={14} />
                </MiniBtn>
                <MiniBtn title="Copy" onClick={handleCopy}>
                  <CopyIcon size={14} />
                </MiniBtn>
              </div>
            </div>
            <div className="rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] overflow-hidden">
              <div className={`min-h-[180px] max-h-[350px] overflow-auto p-3 font-mono text-[12px] leading-[1.6] text-[var(--color-text-primary)] ${wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}>
                {highlightedLines.map((line, i) => (
                  <div key={i} className="flex">
                    <span className="w-8 shrink-0 text-right pr-3 text-[var(--color-text-muted)] select-none">{i + 1}</span>
                    <span className="hljs" style={{ background: 'transparent' }} dangerouslySetInnerHTML={{ __html: line || '&nbsp;' }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-[var(--color-surface-border)]">
          <button
            type="button"
            onClick={handleCopy}
            className="h-[36px] px-4 text-[12.5px] font-medium rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] cursor-pointer transition-colors"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-[36px] px-4 text-[12.5px] font-medium rounded-lg bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] text-[#f87171] hover:bg-[rgba(239,68,68,0.15)] cursor-pointer transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function MiniBtn({ title, onClick, active, children }: { title: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`w-7 h-7 flex items-center justify-center rounded-md cursor-pointer transition-colors ${active ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-icon-hover-bg)]'}`}
    >
      {children}
    </button>
  );
}
