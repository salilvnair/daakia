import { useState } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { EditorView, IconButtonView, CopyButtonView } from '../../dui';
import { WrapLinesIcon, DownloadIcon } from '../../icons';

/**
 * GraphQL Schema panel — shows the full SDL (Schema Definition Language)
 * in a read-only Monaco editor with graphql syntax highlighting.
 */
export function GraphQLSchemaPanel() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [wordWrap, setWordWrap] = useState(false);

  const sdl = activeTab?.authData?.['gql_schema_sdl'] || '';

  if (!activeTab?.authData?.['gql_connected']) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] gap-2 px-4">
        <span className="text-[24px] opacity-20">⟨/⟩</span>
        <p className="text-[12px] text-center">Connect to a GraphQL endpoint to view the schema</p>
      </div>
    );
  }

  if (!sdl) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] gap-2 px-4">
        <div className="w-4 h-4 border-2 border-[var(--color-protocol-graphql)] border-t-transparent rounded-full animate-spin" />
        <p className="text-[12px]">Loading schema...</p>
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
      {/* Header with actions */}
      <div className="px-3 py-2 border-b border-[var(--color-surface-border)] flex items-center justify-between">
        <h3 className="text-[12px] font-bold text-[var(--color-text-primary)] uppercase tracking-wide">Schema</h3>
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
          fontSize={14}
        />
      </div>
    </div>
  );
}
