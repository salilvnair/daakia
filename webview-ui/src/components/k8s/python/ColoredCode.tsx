/**
 * Python, coloured the way the editor colours it.
 *
 * Monaco's own `colorize` with the theme already on the page, so a script the
 * model proposes reads exactly as it will once applied — the same keyword
 * purple and string orange — instead of a grey block that has to be imagined
 * in colour. Plain text until Monaco answers, and if it never does.
 */
import { useEffect, useState } from 'react';

export function ColoredCode({ code, language = 'python', maxHeight = 260 }: {
  code: string;
  language?: string;
  maxHeight?: number;
}) {
  const [html, setHtml] = useState<string | undefined>();

  useEffect(() => {
    let live = true;
    const monaco = (window as unknown as { monaco?: { editor?: { colorize?: (t: string, l: string, o: object) => Promise<string> } } }).monaco;
    setHtml(undefined);
    monaco?.editor?.colorize?.(code, language, { tabSize: 4 })
      .then(h => { if (live) setHtml(h); })
      .catch(() => {});
    return () => { live = false; };
  }, [code, language]);

  const style: React.CSSProperties = {
    margin: 0, padding: '10px 12px', maxHeight, overflow: 'auto',
    fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 12, lineHeight: '19px',
    background: 'var(--color-editor-bg, var(--color-bg, var(--color-surface)))',
    color: 'var(--color-text-primary)', whiteSpace: 'pre',
  };

  return html
    ? <div className="monaco-editor" style={style} dangerouslySetInnerHTML={{ __html: html }} />
    : <pre style={style}>{code}</pre>;
}
