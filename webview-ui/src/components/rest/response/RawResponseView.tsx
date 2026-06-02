import { useCallback } from 'react';
import { CodeEditor } from '../../shared';
import { downloadBlob } from '../../../services/response';
import { WrapLinesIcon, DownloadIcon, CopyIcon } from '../../../icons';
import { ToolbarBtn } from './ToolbarBtn';

export function RawResponseView({ response, wrapLines, setWrapLines }: { response: { body: string; contentType: string }; wrapLines: boolean; setWrapLines: (v: boolean) => void }) {
  const handleDownload = useCallback(() => {
    downloadBlob(response.body, 'response.txt');
  }, [response.body]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-1.5">
        <span className="text-[12px] text-[var(--color-primary)] font-medium">Raw Response Body</span>
        <div className="flex items-center gap-1">
          <ToolbarBtn title="Wrap lines" active={wrapLines} onClick={() => setWrapLines(!wrapLines)}>
            <WrapLinesIcon size={14} />
          </ToolbarBtn>
          <ToolbarBtn title="Download" onClick={handleDownload}>
            <DownloadIcon size={14} />
          </ToolbarBtn>
          <ToolbarBtn title="Copy" onClick={() => navigator.clipboard.writeText(response.body)}>
            <CopyIcon size={14} />
          </ToolbarBtn>
        </div>
      </div>

      {/* Raw body (unformatted) */}
      <div className="flex-1 min-h-0">
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
