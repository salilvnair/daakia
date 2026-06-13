import { useCallback, useRef, useState } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { EditorView, IconButtonView, CopyButtonView } from '../../../dui';
import { downloadBlob } from '../../../services/response';
import { WrapLinesIcon, DownloadIcon, SearchIcon, MoreVerticalIcon, CloseCircleIcon } from '../../../icons';
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

  const handleSearch = useCallback(() => {
    const editor = monacoEditorRef.current;
    if (editor) {
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
        <div className="flex items-center gap-0.5">
          <IconButtonView
            icon={<SearchIcon size={14} />}
            size="md"
            tooltip="Search in response (Ctrl+F)"
            onClick={handleSearch}
          />
          <IconButtonView
            icon={<WrapLinesIcon size={14} />}
            size="md"
            tooltip="Wrap lines"
            active={wrapLines}
            onClick={() => setWrapLines(!wrapLines)}
          />
          <IconButtonView
            icon={<DownloadIcon size={14} />}
            size="md"
            tooltip="Download"
            onClick={handleDownload}
          />
          <CopyButtonView text={response.body} size={14} />

          {tabId && (
            <div className="relative" ref={moreMenuRef}>
              <IconButtonView
                icon={<MoreVerticalIcon size={14} />}
                size="md"
                tooltip="More options"
                active={showMoreMenu}
                onClick={() => setShowMoreMenu(p => !p)}
              />
              {showMoreMenu && (
                <div
                  className="absolute top-full right-0 z-50 mt-1 rounded-xl border shadow-2xl overflow-hidden min-w-[190px]"
                  style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}
                >
                  <button
                    type="button"
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[11.5px] cursor-pointer transition-colors text-left"
                    style={{ color: 'var(--color-text-primary)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-error) 8%, transparent)'; e.currentTarget.style.color = 'var(--color-error)'; }}
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

      {/* Raw body */}
      <div className="flex-1 min-h-0">
        <EditorView
          value={response.body}
          language="plaintext"
          readOnly
          height="100%"
          wordWrap={wrapLines}
          onEditorMount={handleEditorMount}
        />
      </div>
    </div>
  );
}
