import { useState, useMemo } from 'react';
import { CopyIcon, CheckIcon } from '../../../icons';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import bash from 'highlight.js/lib/languages/bash';
import yaml from 'highlight.js/lib/languages/yaml';
import python from 'highlight.js/lib/languages/python';
import 'highlight.js/styles/atom-one-dark.css';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);

export interface CodeBlockViewProps {
  code: string;
  language?: string;
  showCopyButton?: boolean;
  showLineNumbers?: boolean;
  maxHeight?: string;
  accentColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function CodeBlockView({
  code,
  language,
  showCopyButton = true,
  showLineNumbers = false,
  maxHeight = '300px',
  accentColor,
  className = '',
  style,
}: CodeBlockViewProps) {
  const [copied, setCopied] = useState(false);
  const accent = accentColor || 'var(--color-primary)';

  const highlighted = useMemo(() => {
    try {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(code, { language });
      }
      return hljs.highlightAuto(code);
    } catch {
      return null;
    }
  }, [code, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const lines = code.split('\n');

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        background: 'color-mix(in srgb, var(--color-text-primary) 3%, transparent)',
        border: '1px solid var(--color-surface-border)',
        borderRadius: '6px',
        ...style,
        overflow: 'hidden',
        fontSize: '12px',
        fontFamily: 'monospace',
      }}
    >
      {/* Top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 10px',
        borderBottom: '1px solid var(--color-surface-border)',
        background: 'color-mix(in srgb, var(--color-text-primary) 4%, transparent)',
      }}>
        {language ? (
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {language}
          </span>
        ) : <span />}
        {showCopyButton && (
          <button
            type="button"
            onClick={handleCopy}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '2px 6px', borderRadius: '4px', border: 'none',
              background: copied ? `color-mix(in srgb, var(--color-success) 12%, transparent)` : 'transparent',
              color: copied ? 'var(--color-success)' : 'var(--color-text-muted)',
              cursor: 'pointer', fontSize: '10px', transition: 'all 120ms',
            }}
          >
            {copied ? <CheckIcon size={10} /> : <CopyIcon size={10} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>

      {/* Code — hljs highlighted, word-wrapped */}
      <div style={{ overflowY: 'auto', maxHeight }}>
        {showLineNumbers ? (
          <pre style={{ margin: 0, padding: '10px 0', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {lines.map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: '0' }}>
                <span style={{
                  color: 'var(--color-text-muted)', userSelect: 'none',
                  minWidth: '3ch', textAlign: 'right', opacity: 0.4,
                  padding: '0 12px 0 0', flexShrink: 0,
                }}>
                  {i + 1}
                </span>
                <code
                  className="hljs"
                  dangerouslySetInnerHTML={{ __html: hljs.highlight(line, { language: language || 'plaintext' }).value }}
                  style={{ background: 'transparent', padding: 0, flex: 1 }}
                />
              </div>
            ))}
          </pre>
        ) : highlighted ? (
          <pre style={{ margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            <code
              className="hljs"
              dangerouslySetInnerHTML={{ __html: highlighted.value }}
              style={{ background: 'transparent', padding: '10px 12px', display: 'block' }}
            />
          </pre>
        ) : (
          <pre style={{ margin: 0, padding: '10px 12px', color: 'var(--color-text-primary)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {code}
          </pre>
        )}
      </div>
    </div>
  );
}
