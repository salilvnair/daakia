import { useEffect, useMemo, useState } from 'react';
import hljs from 'highlight.js';
import { generateCode, LANGUAGES, type CodeGenInput } from '../../../utils/code-generator';
import type { RequestTab } from '../../../store/tabs-store';
import { WrapLinesIcon, DownloadIcon } from '../../../icons';
import { createResolver } from '../../../services/resolve/resolve-service';
import { useEffectiveSettings } from '../settings/use-effective-settings';
import type { ExecutionSettings } from '../settings/execution-settings';
import { IconButtonView, CopyButtonView, SelectInputView, ButtonView, ModalView } from '@salilvnair/dui';

const HLJS_LANG_MAP: Record<string, string> = {
  'shell-curl': 'bash',
  'shell-wget': 'bash',
  'powershell': 'powershell',
  'windows-cmd': 'dos',
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

  // What this request would inherit, so the snippet carries the timeout,
  // redirect, certificate and proxy decisions it will actually run with.
  const inherited = useEffectiveSettings(
    'request', { tabId: tab?.id, collectionId: tab?.collectionId }, open,
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const code = useMemo(() => {
    if (!tab) return '';

    /*
      Variables are resolved, not printed.

      The snippet used to come out with `{{backend}}/actuator/health` in it —
      a command that cannot be run and cannot be shared. The same resolver the
      Send button uses expands request, collection and environment layers, so
      what you copy is what Daakia would send.
    */
    const resolve = createResolver(tab);
    const rv = (v: string) => resolve(v ?? '');

    // Resolved settings: what the levels above give, with this request's own
    // overrides on top. Merged here because the host only answers with what is
    // inherited — the request's layer lives in the tab.
    const settings: ExecutionSettings = { ...(inherited.values ?? {}), ...(tab.settings ?? {}) };

    const input: CodeGenInput = {
      method: tab.method,
      url: rv(tab.url),
      headers: (tab.headers || []).filter(h => h.enabled && h.key).map(h => ({ key: rv(h.key), value: rv(h.value) })),
      params: (tab.params || []).filter(p => p.enabled && p.key).map(p => ({ key: rv(p.key), value: rv(p.value) })),
      bodyMode: tab.bodyMode || 'none',
      bodyRaw: rv(tab.bodyRaw || ''),
      bodyFormData: (tab.bodyFormData || []).filter(f => f.enabled && f.key).map(f => ({ key: rv(f.key), value: rv(f.value), type: f.type || 'text' })),
      bodyUrlEncoded: (tab.bodyUrlEncoded || []).filter(u => u.enabled && u.key).map(u => ({ key: rv(u.key), value: rv(u.value) })),
      authType: tab.authType || 'none',
      authData: Object.fromEntries(
        Object.entries(tab.authData || {}).map(([k, v]) => [k, typeof v === 'string' ? rv(v) : v]),
      ) as Record<string, string>,
      settings,
    };
    return generateCode(input, language);
  }, [tab, language, inherited.values]);

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

