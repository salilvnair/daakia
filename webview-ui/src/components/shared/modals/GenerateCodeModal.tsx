import { useEffect, useMemo, useState } from 'react';
import hljs from 'highlight.js';
import { generateCode, LANGUAGES, type CodeGenInput } from '../../../utils/code-generator';
import type { RequestTab } from '../../../store/tabs-store';
import { WrapLinesIcon, DownloadIcon } from '../../../icons';
import { IconButtonView, CopyButtonView, SelectInputView, ButtonView, ModalView } from '@salilvnair/dui';

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

  return (
    <ModalView
      open={open}
      onClose={onClose}
      title="Generate code"
      size="lg"
      footerRight={
        <ButtonView size="md" onClick={handleCopy} accentColor="var(--color-primary)">
          Copy
        </ButtonView>
      }
    >
      <div className="space-y-4">
        {/* Language selector */}
        <div className="space-y-1.5">
          <label className="block text-[12px] font-medium text-[var(--color-text-secondary)]">Choose language</label>
          <SelectInputView
            options={LANGUAGES.map(l => ({ value: l.id, label: l.label }))}
            value={language}
            onChange={(v) => setLanguage(v as string)}
            size="md"
          />
        </div>

        {/* Generated code */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-[12px] font-medium text-[var(--color-text-secondary)]">Generated code</label>
            <div className="flex items-center gap-1">
              <IconButtonView
                icon={<WrapLinesIcon size={14} />}
                title="Toggle wrap"
                size="md"
                active={wrap}
                accentColor="var(--color-primary)"
                onClick={() => setWrap(v => !v)}
              />
              <IconButtonView
                icon={<DownloadIcon size={14} />}
                title="Download"
                size="md"
                onClick={handleDownload}
              />
              <CopyButtonView text={code} title="Copy" />
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
    </ModalView>
  );
}

