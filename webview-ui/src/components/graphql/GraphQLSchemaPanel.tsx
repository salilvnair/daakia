import { useState, useMemo } from 'react';
import { parse, print } from 'graphql';
import { useTabsStore } from '../../store/tabs-store';
import { EditorView, IconButtonView, CopyButtonView } from '@salilvnair/dui';
import { WrapLinesIcon, DownloadIcon } from '../../icons';

/**
 * GraphQL Schema panel — shows the full SDL (Schema Definition Language)
 * in a read-only Monaco editor with graphql syntax highlighting.
 *
 * Rendered inside the Schema Explorer's own "Schema" tab, so it carries no title of its
 * own — the tab already names it — just its action buttons.
 */
export function GraphQLSchemaPanel() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [wordWrap, setWordWrap] = useState(false);

  const rawSdl = activeTab?.authData?.['gql_schema_sdl'] || '';
  // Servers hand back SDL in whatever shape they like — often one long line. Re-print it
  // through graphql-js so it's always properly indented and broken across lines; fall back
  // to the raw text if it doesn't parse (a partial/non-standard SDL is still worth showing).
  const sdl = useMemo(() => {
    if (!rawSdl.trim()) return '';
    try { return print(parse(rawSdl)); } catch { return rawSdl; }
  }, [rawSdl]);

  if (!activeTab?.authData?.['gql_connected']) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] gap-2 px-4">
        <span className="text-[24px] opacity-20">⟨/⟩</span>
        <p className="text-[12px] text-center">Connect to a GraphQL endpoint to view the schema</p>
      </div>
    );
  }

  // `graphql:connected` sets `gql_schema_sdl` alongside `gql_connected`, so once we're
  // connected without SDL it is never arriving — show an empty state rather than a spinner
  // that can only spin forever.
  if (!sdl) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] gap-2 px-4">
        <span className="text-[24px] opacity-20">⟨/⟩</span>
        <p className="text-[12px] text-center">
          No SDL returned for this endpoint — reconnect to fetch the schema again.
        </p>
      </div>
    );
  }

  const handleDownload = () => {
    const blob = new Blob([sdl], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schema.graphql';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Actions only — the enclosing tab already says "Schema". */}
      <div className="px-3 py-1.5 border-b border-[var(--color-surface-border)] flex items-center justify-end">
        <div className="flex items-center gap-0.5">
          <IconButtonView
            icon={<WrapLinesIcon size={14} />}
            title="Toggle word wrap"
            size="md"
            active={wordWrap}
            accentColor="var(--color-protocol-graphql)"
            onClick={() => setWordWrap(w => !w)}
          />
          <IconButtonView
            icon={<DownloadIcon size={14} />}
            title="Download schema"
            size="md"
            onClick={handleDownload}
          />
          <CopyButtonView
            text={sdl}
            title="Copy schema"
            accentColor="var(--color-success)"
          />
        </div>
      </div>

      {/* SDL viewer */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <EditorView
          value={sdl}
          language="graphql"
          height="100%"
          readOnly
          wordWrap={wordWrap}
          fontSize={11}
        />
      </div>
    </div>
  );
}
