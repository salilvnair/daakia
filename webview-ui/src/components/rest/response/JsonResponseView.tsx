import { useState, useMemo, useCallback, useRef } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { EditorView, IconButtonView, TextInputView, InfoPopupView, CopyButtonView, type EditorLanguage } from '../../../dui';
import { useClickOutside } from '../../../hooks/useClickOutside';
import { applyJqFilter, formatBody, getResponseLanguage, downloadBlob, getExtensionForContentType } from '../../../services/response';
import { WrapLinesIcon, FilterIcon, DownloadIcon, MoreVerticalIcon, SearchIcon, InfoCircleIcon, CloseCircleIcon } from '../../../icons';

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

const JQ_ITEMS = [
  { code: '.name',          description: 'Access field "name"' },
  { code: '.data.items',    description: 'Nested access' },
  { code: '.[0]',           description: 'First array element' },
  { code: '.[-1]',          description: 'Last array element' },
  { code: '.[]',            description: 'Iterate all elements' },
  { code: '.[].name',       description: 'Get "name" from each item' },
  { code: '.items[].name',  description: 'Map over nested array' },
  { code: '.[0:3]',         description: 'Slice first 3 items' },
  { code: '.',              description: 'Identity (full response)' },
];

export function JsonResponseView({ response, wrapLines, setWrapLines, showFilter, setShowFilter, filterQuery, setFilterQuery, tabId, requestMethod: _requestMethod, requestUrl: _requestUrl }: JsonViewProps) {
  const formattedBody = useMemo(() => formatBody(response.body, response.contentType), [response.body, response.contentType]);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [showJqHelp, setShowJqHelp] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const jqHelpAnchorRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useClickOutside(moreMenuRef as React.RefObject<HTMLElement | null>, () => setShowMoreMenu(false), showMoreMenu);

  const isJson = response.contentType.includes('json');
  const hasBody = !!response.body?.trim();

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
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-1.5">
        <span className="text-[12px] text-[var(--color-primary)] font-medium">Response Body</span>
        <div className="flex items-center gap-0.5">
          <IconButtonView
            icon={<WrapLinesIcon size={14} />}
            size="md"
            tooltip="Wrap lines"
            active={wrapLines}
            onClick={() => setWrapLines(!wrapLines)}
          />

          {isJson && hasBody && (
            <IconButtonView
              icon={<FilterIcon size={14} />}
              size="md"
              tooltip="Filter (jq syntax)"
              active={showFilter}
              onClick={() => setShowFilter(!showFilter)}
            />
          )}

          <IconButtonView
            icon={<DownloadIcon size={14} />}
            size="md"
            tooltip="Download file"
            onClick={handleDownload}
          />

          <CopyButtonView text={formattedBody} size={14} title="Copy response" />

          {/* ⋮ More menu */}
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
                className="absolute top-full right-0 z-50 mt-1 rounded-xl border shadow-2xl overflow-hidden min-w-[200px]"
                style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}
              >
                <button type="button"
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
        </div>
      </div>

      {/* Filter bar */}
      {showFilter && (
        <div
          className="flex items-center gap-1 px-3 py-1 border-b"
          style={{ borderColor: filterError ? 'color-mix(in srgb, var(--color-error) 35%, var(--color-surface-border))' : 'var(--color-surface-border)', backgroundColor: filterError ? 'color-mix(in srgb, var(--color-error) 5%, transparent)' : undefined }}
        >
          <TextInputView
            naked
            size="sm"
            error={!!filterError}
            iconLeft={<SearchIcon size={13} style={{ color: 'var(--color-text-muted)' }} />}
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter JSON response body (uses jq syntax)"
            autoFocus
            style={{ flex: 1 }}
          />

          {filterError && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded flex-shrink-0 text-[10px]"
              style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-error) 30%, transparent)', color: 'var(--color-error)', maxWidth: 280 }}
            >
              <InfoCircleIcon size={11} />
              <span className="truncate">{filterError}</span>
            </span>
          )}

          {/* jq help — DUI InfoPopupView anchored to wrapper div */}
          <div ref={jqHelpAnchorRef} style={{ display: 'inline-flex' }}>
            <IconButtonView
              icon={<span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>?</span>}
              size="sm"
              tooltip="jq syntax help"
              active={showJqHelp}
              onClick={() => setShowJqHelp(p => !p)}
            />
          </div>

          <InfoPopupView
            open={showJqHelp}
            onClose={() => setShowJqHelp(false)}
            anchorEl={jqHelpAnchorRef.current}
            title="jq Filter Syntax"
            description="Use dot notation to access nested fields. Supports basic jq-like path expressions."
            items={JQ_ITEMS}
            width={320}
          />
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <EditorView
          value={filteredBody}
          language={(getResponseLanguage(response.contentType) === 'text' ? 'plaintext' : getResponseLanguage(response.contentType)) as EditorLanguage}
          readOnly
          height="100%"
          wordWrap={wrapLines}
        />
      </div>
    </div>
  );
}
