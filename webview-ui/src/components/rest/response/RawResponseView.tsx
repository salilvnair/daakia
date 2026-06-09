import { useCallback, useRef, useState } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { CodeEditor, CopyButton } from '../../shared';
import { downloadBlob } from '../../../services/response';
import { WrapLinesIcon, DownloadIcon, SearchIcon, MoreVerticalIcon, CloseCircleIcon } from '../../../icons';
import { ToolbarBtn } from './ToolbarBtn';
import { useClickOutside } from '../../../hooks/useClickOutside';

interface RawViewProps {
  response: { body: string; contentType: string };
  wrapLines: boolean;
  setWrapLines: (v: boolean) => void;
  tabId?: string;
}

export function RawResponseView({ response, wrapLines, setWrapLines, tabId }: RawViewProps) {
  const monacoEditorRef = useRef<any>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useClickOutside(moreMenuRef as React.RefObject<HTMLElement | null>, () => setShowMoreMenu(false), showMoreMenu);

  const handleDownload = useCallback(() => {
    downloadBlob(response.body, 'response.txt');
  }, [response.body]);

  // 5.4.2 — Search button: trigger Monaco's built-in find widget via editor API
  const handleSearch = useCallback(() => {
    const editor = monacoEditorRef.current;
    if (editor) {
      // Focus then trigger find action — most reliable approach
      editor.focus();
      editor.getAction('actions.find')?.run();
    }
  }, []);

  const handleEditorMount = useCallback((editor: any) => {
    monacoEditorRef.current = editor;
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

          {/* ⋮ More menu — Clear Response only */}
          {tabId && (
            <div className="relative" ref={moreMenuRef}>
              <ToolbarBtn title="More options" onClick={() => setShowMoreMenu(!showMoreMenu)}>
                <MoreVerticalIcon size={14} />
              </ToolbarBtn>
              {showMoreMenu && (
                <div
                  className="absolute top-full right-0 z-50 mt-1 rounded-xl border shadow-2xl overflow-hidden min-w-[190px]"
                  style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}
                >
                  <button
                    type="button"
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[11.5px] cursor-pointer transition-colors text-left"
                    style={{ color: 'var(--color-text-primary)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#ef4444'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                    onClick={() => {
                      setShowMoreMenu(false);
                      useTabsStore.getState().updateTab(tabId, { response: null });
                    }}
                  >
                    <CloseCircleIcon size={14} />
                    <span className="whitespace-nowrap">Clear Response</span>
                    <span className="ml-auto text-[10px] text-[var(--color-text-muted)] whitespace-nowrap pl-3">Ctrl Del</span>
                  </button>
                </div>
              )}
            </div>
          )}
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
          onEditorMount={handleEditorMount}
        />
      </div>
    </div>
  );
}
