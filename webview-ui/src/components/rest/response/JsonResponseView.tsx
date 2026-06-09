import { useState, useMemo, useCallback, useRef } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { CodeEditor, CopyButton } from '../../shared';
import { useClickOutside } from '../../../hooks/useClickOutside';
import { applyJqFilter, formatBody, getResponseLanguage, downloadBlob, getExtensionForContentType } from '../../../services/response';
import { WrapLinesIcon, FilterIcon, DownloadIcon, MoreVerticalIcon, SearchIcon, InfoCircleIcon, HelpCircleIcon, CloseCircleIcon } from '../../../icons';
import { ToolbarBtn } from './ToolbarBtn';

interface JsonViewProps {
  response: { body: string; contentType: string; status?: number };
  wrapLines: boolean;
  setWrapLines: (v: boolean) => void;
  showFilter: boolean;
  setShowFilter: (v: boolean) => void;
  filterQuery: string;
  setFilterQuery: (v: string) => void;
  tabId: string;
  requestMethod?: string;
  requestUrl?: string;
}

export function JsonResponseView({ response, wrapLines, setWrapLines, showFilter, setShowFilter, filterQuery, setFilterQuery, tabId, requestMethod, requestUrl }: JsonViewProps) {
  const formattedBody = useMemo(() => formatBody(response.body, response.contentType), [response.body, response.contentType]);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [showJqHelp, setShowJqHelp] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const jqHelpRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Click-outside for jq help popup
  useClickOutside(jqHelpRef, () => setShowJqHelp(false), showJqHelp);
  // Click-outside for more menu
  useClickOutside(moreMenuRef as React.RefObject<HTMLElement | null>, () => setShowMoreMenu(false), showMoreMenu);

  const isJson = response.contentType.includes('json');
  const hasBody = !!response.body?.trim();

  // Apply jq-like filter
  const filteredBody = useMemo(() => {
    if (!filterQuery.trim()) { setFilterError(null); return formattedBody; }
    try {
      const parsed = JSON.parse(response.body);
      const result = applyJqFilter(parsed, filterQuery.trim());
      setFilterError(null);
      return JSON.stringify(result, null, 2);
    } catch (e: any) {
      setFilterError(e.message || 'Invalid filter');
      return formattedBody;
    }
  }, [filterQuery, response.body, formattedBody]);

  const handleDownload = useCallback(() => {
    const ext = getExtensionForContentType(response.contentType);
    downloadBlob(response.body, `response.${ext}`, response.contentType || 'text/plain');
  }, [response.body, response.contentType]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar: label + icons */}
      <div className="flex items-center justify-between px-4 py-1.5">
        <span className="text-[12px] text-[var(--color-primary)] font-medium">Response Body</span>
        <div className="flex items-center gap-1">
          {/* Wrap lines */}
          <ToolbarBtn title="Wrap lines" active={wrapLines} onClick={() => setWrapLines(!wrapLines)}>
            <WrapLinesIcon size={14} />
          </ToolbarBtn>

          {/* Filter — only for JSON */}
          {isJson && hasBody && (
            <ToolbarBtn title="Filter (jq syntax)" active={showFilter} onClick={() => setShowFilter(!showFilter)}>
              <FilterIcon size={14} />
            </ToolbarBtn>
          )}

          {/* Download */}
          <ToolbarBtn title="Download file" onClick={handleDownload}>
            <DownloadIcon size={14} />
          </ToolbarBtn>

          {/* Copy */}
          <CopyButton text={formattedBody} size={14} title="Copy response" className="w-7 h-7" />

          {/* ⋮ More menu — Clear Response only; AI actions moved to sparkle 3-dot next to Record Baseline */}
          <div className="relative" ref={moreMenuRef}>
            <ToolbarBtn title="More options" onClick={() => setShowMoreMenu(!showMoreMenu)}>
              <MoreVerticalIcon size={14} />
            </ToolbarBtn>
            {showMoreMenu && (
              <div
                className="absolute top-full right-0 z-50 mt-1 rounded-xl border shadow-2xl overflow-hidden min-w-[190px]"
                style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}
              >
                <button type="button"
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
        </div>
      </div>

      {/* Filter bar */}
      {showFilter && (
        <div className={`flex items-center gap-2 px-4 py-1.5 border-b ${filterError ? 'bg-[rgba(239,68,68,0.08)] border-[rgba(239,68,68,0.3)]' : 'border-[var(--color-surface-border)]'}`}>
          <SearchIcon size={14} className="text-[var(--color-text-muted)] flex-shrink-0" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter JSON response body (uses jq syntax)"
            autoFocus
            className="flex-1 h-[26px] px-2 py-1 text-[12px] bg-transparent border-none text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
          />
          {filterError && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-[10px] text-[#ef4444] max-w-[300px] truncate flex-shrink-0">
              <InfoCircleIcon size={12} />
              {filterError}
            </span>
          )}
          <div className="relative" ref={jqHelpRef}>
            <button
              type="button"
              onClick={() => setShowJqHelp(!showJqHelp)}
              className="w-5 h-5 flex items-center justify-center rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)] cursor-pointer"
              title="Help"
            >
              <HelpCircleIcon size={12} />
            </button>
            {showJqHelp && (
              <div className="absolute top-full right-0 z-50 mt-1 w-[320px] bg-[var(--color-surface)] border border-[var(--color-surface-border)] rounded-lg shadow-xl p-4">
                <h4 className="text-[13px] font-semibold text-[var(--color-text-primary)] mb-2">jq Filter Syntax</h4>
                <p className="text-[11px] text-[var(--color-text-muted)] mb-3">Use dot notation to access nested fields. Supports basic jq-like path expressions.</p>
                <div className="space-y-2 text-[11px] font-mono">
                  {[
                    ['.name', 'Access field "name"'],
                    ['.data.items', 'Nested access'],
                    ['.[0]', 'First array element'],
                    ['.[-1]', 'Last array element'],
                    ['.[]', 'Iterate all elements'],
                    ['.[].name', 'Get "name" from each item'],
                    ['.items[].name', 'Map over nested array'],
                    ['.[0:3]', 'Slice first 3 items'],
                    ['.', 'Identity (full response)'],
                  ].map(([code, desc]) => (
                    <div key={code} className="flex gap-2">
                      <code className="px-1.5 py-0.5 rounded bg-[rgba(99,102,241,0.1)] text-[var(--color-primary)]">{code}</code>
                      <span className="text-[var(--color-text-muted)]">{desc}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <button className="text-[10px] text-[var(--color-primary)] hover:underline cursor-pointer" onClick={() => {}}>
                    Open Wiki →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Code editor */}
      <div className="flex-1 min-h-0">
        <CodeEditor
          value={filteredBody}
          language={getResponseLanguage(response.contentType)}
          readOnly
          height="100%"
          wordWrap={wrapLines}
        />
      </div>

    </div>
  );
}
