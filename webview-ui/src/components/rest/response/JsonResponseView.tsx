import { useState, useMemo, useCallback, useRef } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { CodeEditor, CopyButton } from '../../shared';
import { useClickOutside } from '../../../hooks/useClickOutside';
import { applyJqFilter, formatBody, getResponseLanguage, downloadBlob, getExtensionForContentType } from '../../../services/response';
import { WrapLinesIcon, FilterIcon, DownloadIcon, MoreVerticalIcon, SearchIcon, InfoCircleIcon, HelpCircleIcon, SparkleIcon, CloseCircleIcon } from '../../../icons';
import { ToolbarBtn } from './ToolbarBtn';

interface JsonViewProps {
  response: { body: string; contentType: string };
  wrapLines: boolean;
  setWrapLines: (v: boolean) => void;
  showFilter: boolean;
  setShowFilter: (v: boolean) => void;
  filterQuery: string;
  setFilterQuery: (v: string) => void;
  showMoreMenu: boolean;
  setShowMoreMenu: (v: boolean) => void;
  moreMenuRef: React.RefObject<HTMLDivElement | null>;
  tabId: string;
  onShowSchema: () => void;
}

export function JsonResponseView({ response, wrapLines, setWrapLines, showFilter, setShowFilter, filterQuery, setFilterQuery, showMoreMenu, setShowMoreMenu, moreMenuRef, tabId, onShowSchema }: JsonViewProps) {
  const formattedBody = useMemo(() => formatBody(response.body, response.contentType), [response.body, response.contentType]);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [showJqHelp, setShowJqHelp] = useState(false);
  const jqHelpRef = useRef<HTMLDivElement>(null);

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

          {/* More menu */}
          <div className="relative" ref={moreMenuRef}>
            <ToolbarBtn title="More options" onClick={() => setShowMoreMenu(!showMoreMenu)}>
              <MoreVerticalIcon size={14} />
            </ToolbarBtn>
            {showMoreMenu && (
              <div className="absolute top-full right-0 z-50 mt-1 bg-[var(--color-surface)] border border-[var(--color-surface-border)] rounded-md shadow-lg py-1 w-[200px]">
                {isJson && hasBody && (
                  <button
                    type="button"
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
                    onClick={() => { setShowMoreMenu(false); onShowSchema(); }}
                  >
                    <SparkleIcon size={14} />
                    Generate Data Schema
                  </button>
                )}
                <button
                  type="button"
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
                  onClick={() => {
                    setShowMoreMenu(false);
                    useTabsStore.getState().updateTab(tabId, { response: null });
                  }}
                >
                  <CloseCircleIcon size={14} />
                  Clear Response
                  <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">Ctrl Del</span>
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
                  <div className="flex gap-2">
                    <code className="px-1.5 py-0.5 rounded bg-[rgba(99,102,241,0.1)] text-[var(--color-primary)]">.name</code>
                    <span className="text-[var(--color-text-muted)]">Access field "name"</span>
                  </div>
                  <div className="flex gap-2">
                    <code className="px-1.5 py-0.5 rounded bg-[rgba(99,102,241,0.1)] text-[var(--color-primary)]">.data.items</code>
                    <span className="text-[var(--color-text-muted)]">Nested access</span>
                  </div>
                  <div className="flex gap-2">
                    <code className="px-1.5 py-0.5 rounded bg-[rgba(99,102,241,0.1)] text-[var(--color-primary)]">.[0]</code>
                    <span className="text-[var(--color-text-muted)]">First array element</span>
                  </div>
                  <div className="flex gap-2">
                    <code className="px-1.5 py-0.5 rounded bg-[rgba(99,102,241,0.1)] text-[var(--color-primary)]">.[-1]</code>
                    <span className="text-[var(--color-text-muted)]">Last array element</span>
                  </div>
                  <div className="flex gap-2">
                    <code className="px-1.5 py-0.5 rounded bg-[rgba(99,102,241,0.1)] text-[var(--color-primary)]">.[]</code>
                    <span className="text-[var(--color-text-muted)]">Iterate all elements</span>
                  </div>
                  <div className="flex gap-2">
                    <code className="px-1.5 py-0.5 rounded bg-[rgba(99,102,241,0.1)] text-[var(--color-primary)]">.[].name</code>
                    <span className="text-[var(--color-text-muted)]">Get "name" from each item</span>
                  </div>
                  <div className="flex gap-2">
                    <code className="px-1.5 py-0.5 rounded bg-[rgba(99,102,241,0.1)] text-[var(--color-primary)]">.items[].name</code>
                    <span className="text-[var(--color-text-muted)]">Map over nested array</span>
                  </div>
                  <div className="flex gap-2">
                    <code className="px-1.5 py-0.5 rounded bg-[rgba(99,102,241,0.1)] text-[var(--color-primary)]">.[0:3]</code>
                    <span className="text-[var(--color-text-muted)]">Slice first 3 items</span>
                  </div>
                  <div className="flex gap-2">
                    <code className="px-1.5 py-0.5 rounded bg-[rgba(99,102,241,0.1)] text-[var(--color-primary)]">.</code>
                    <span className="text-[var(--color-text-muted)]">Identity (full response)</span>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-[var(--color-surface-border)]">
                  <p className="text-[10px] text-[var(--color-text-muted)]">Example: For [{"{"}"id":1, "name":"..."{"}"}, ...],  use <code className="text-[var(--color-primary)]">.[].name</code> or <code className="text-[var(--color-primary)]">.[0]</code></p>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1">For {"{"}"data": {"{"}"users": [...]{"}"}{"}"},  use <code className="text-[var(--color-primary)]">.data.users</code></p>
                </div>
                <div className="mt-2">
                  <button
                    className="text-[10px] text-[var(--color-primary)] hover:underline cursor-pointer"
                    onClick={() => { /* TODO: open wiki page */ }}
                  >
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
