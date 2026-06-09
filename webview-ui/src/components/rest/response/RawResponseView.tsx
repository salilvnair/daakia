import { useCallback, useRef } from 'react';
import { CodeEditor, CopyButton } from '../../shared';
import { downloadBlob } from '../../../services/response';
import { WrapLinesIcon, DownloadIcon, SearchIcon } from '../../../icons';
import { ToolbarBtn } from './ToolbarBtn';

export function RawResponseView({ response, wrapLines, setWrapLines }: { response: { body: string; contentType: string }; wrapLines: boolean; setWrapLines: (v: boolean) => void }) {
  const editorRef = useRef<{ focus?: () => void; triggerFind?: () => void } | null>(null);

  const handleDownload = useCallback(() => {
    downloadBlob(response.body, 'response.txt');
  }, [response.body]);

  // 5.4.2 — Ctrl+F / Search button: focus the Monaco editor and trigger its built-in find
  const handleSearch = useCallback(() => {
    // Focus the Monaco editor area — Monaco intercepts Ctrl+F when focused
    const editorEl = document.querySelector('.raw-response-editor .monaco-editor') as HTMLElement;
    if (editorEl) {
      editorEl.click();
      editorEl.focus();
      // Dispatch synthetic Ctrl+F into Monaco
      editorEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }));
    }
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-1.5">
        <span className="text-[12px] text-[var(--color-primary)] font-medium">Raw Response Body</span>
        <div className="flex items-center gap-1">
          <ToolbarBtn title="Search in response (Ctrl+F)" onClick={handleSearch}>
            <SearchIcon size={14} />
          </ToolbarBtn>
          <ToolbarBtn title="Wrap lines" active={wrapLines} onClick={() => setWrapLines(!wrapLines)}>
            <WrapLinesIcon size={14} />
          </ToolbarBtn>
          <ToolbarBtn title="Download" onClick={handleDownload}>
            <DownloadIcon size={14} />
          </ToolbarBtn>
          <CopyButton text={response.body} size={14} className="w-7 h-7" />
        </div>
      </div>

      {/* Raw body (unformatted) */}
      <div className="flex-1 min-h-0 raw-response-editor">
        <CodeEditor
          value={response.body}
          language="text"
          readOnly
          height="100%"
          wordWrap={wrapLines}
        />
      </div>
    </div>
  );
}
