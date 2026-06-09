import { useState, useMemo, useCallback } from 'react';
import { useTabsStore, type McpServerConfig } from '../../../store/tabs-store';

const ACCENT = 'var(--color-protocol-mcp)';

interface CatalogEntry {
  name: string;
  description: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  tags: string[];
  author: string;
}

const CATALOG: CatalogEntry[] = [
  { name: 'filesystem', description: 'Read/write files and directories on the local filesystem.', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/your/path'], tags: ['files', 'official'], author: 'Anthropic' },
  { name: 'github', description: 'Search GitHub repos, issues, pull requests, and code.', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], tags: ['git', 'code', 'official'], author: 'Anthropic' },
  { name: 'postgres', description: 'Query PostgreSQL databases with natural language.', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://user:pass@host/db'], tags: ['database', 'sql', 'official'], author: 'Anthropic' },
  { name: 'sqlite', description: 'Interact with SQLite databases — query and analyze local data.', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sqlite', '/path/to/db.sqlite'], tags: ['database', 'sql', 'official'], author: 'Anthropic' },
  { name: 'brave-search', description: 'Web and local search via the Brave Search API.', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'], tags: ['search', 'web', 'official'], author: 'Anthropic' },
  { name: 'google-maps', description: 'Location search, directions, and places using Google Maps.', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-google-maps'], tags: ['maps', 'location', 'official'], author: 'Anthropic' },
  { name: 'slack', description: 'Send messages, read channels, and search Slack workspaces.', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'], tags: ['messaging', 'official'], author: 'Anthropic' },
  { name: 'puppeteer', description: 'Browser automation — take screenshots, fill forms, click elements.', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'], tags: ['browser', 'automation', 'official'], author: 'Anthropic' },
  { name: 'fetch', description: 'Fetch any URL and return the content as text or markdown.', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'], tags: ['http', 'web', 'official'], author: 'Anthropic' },
  { name: 'memory', description: 'Persistent key-value memory store for AI assistants.', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'], tags: ['memory', 'official'], author: 'Anthropic' },
  { name: 'everything', description: 'Reference/demo server with prompts, resources, and tools for testing.', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-everything'], tags: ['demo', 'testing', 'official'], author: 'Anthropic' },
  { name: 'aws-kb-retrieval', description: 'Query AWS Knowledge Base for RAG-powered retrieval.', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-aws-kb-retrieval-server'], tags: ['aws', 'rag', 'official'], author: 'Anthropic' },
  { name: 'everart', description: 'AI image generation via the EverArt API.', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-everart'], tags: ['image', 'ai', 'official'], author: 'Anthropic' },
  { name: 'git', description: 'Git operations — read files, commit history, diffs, and more.', transport: 'stdio', command: 'uvx', args: ['mcp-server-git', '--repository', '/path/to/repo'], tags: ['git', 'vcs'], author: 'Community' },
  { name: 'docker', description: 'Manage Docker containers, images, and volumes.', transport: 'stdio', command: 'npx', args: ['-y', 'mcp-server-docker'], tags: ['docker', 'devops'], author: 'Community' },
  { name: 'kubernetes', description: 'Interact with Kubernetes clusters — pods, deployments, logs.', transport: 'stdio', command: 'npx', args: ['-y', 'mcp-k8s-go'], tags: ['k8s', 'devops'], author: 'Community' },
  { name: 'jira', description: 'Create and search Jira issues, sprints, and boards.', transport: 'stdio', command: 'npx', args: ['-y', 'mcp-atlassian'], tags: ['jira', 'project'], author: 'Community' },
  { name: 'notion', description: 'Read and write Notion pages and databases.', transport: 'stdio', command: 'npx', args: ['-y', '@notionhq/notion-mcp-server'], tags: ['notion', 'notes'], author: 'Notion' },
  { name: 'linear', description: 'Search and manage Linear issues, projects, and teams.', transport: 'stdio', command: 'npx', args: ['-y', 'linear-mcp-server'], tags: ['linear', 'project'], author: 'Community' },
  { name: 'stripe', description: 'Query Stripe customers, payments, and subscriptions.', transport: 'stdio', command: 'npx', args: ['-y', '@stripe/agent-toolkit'], tags: ['payments', 'stripe'], author: 'Stripe' },
];

/**
 * McpCatalogTab — Search and browse the community MCP server catalog.
 * Shows name, description, transport, and "Add to Config" button.
 */
export function McpCatalogTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [query, setQuery] = useState('');
  const [added, setAdded] = useState<Set<string>>(new Set());

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return CATALOG;
    return CATALOG.filter(e =>
      e.name.includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.tags.some(t => t.includes(q)) ||
      e.author.toLowerCase().includes(q)
    );
  }, [query]);

  const handleAdd = useCallback((entry: CatalogEntry) => {
    if (!activeTab) return;
    const existing = activeTab.mcpServerConfigs || [];
    const already = existing.find(s => s.name === entry.name);
    if (already) return;
    const newCfg: McpServerConfig = {
      id: crypto.randomUUID(),
      name: entry.name,
      description: entry.description,
      transport: entry.transport,
      command: entry.command,
      args: entry.args || [],
      url: entry.url,
      envVars: {},
      enabled: true,
    };
    updateTab(activeTab.id, { mcpServerConfigs: [...existing, newCfg], dirty: true });
    setAdded(prev => new Set([...prev, entry.name]));
    setTimeout(() => setAdded(prev => { const next = new Set(prev); next.delete(entry.name); return next; }), 2000);
  }, [activeTab, updateTab]);

  const existing = new Set((activeTab?.mcpServerConfigs || []).map(s => s.name));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search */}
      <div className="px-3 py-2.5 border-b shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search MCP servers (e.g. database, github, browser…)"
          className="w-full h-[28px] px-2.5 rounded-md text-[12px] focus:outline-none"
          style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
        />
        <p className="text-[10px] mt-1 text-[var(--color-text-muted)] opacity-70">
          {results.length} of {CATALOG.length} servers · Click "Add" to add to your MCP config
        </p>
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-auto">
        {results.map((entry) => {
          const isAdded = added.has(entry.name);
          const isExisting = existing.has(entry.name);
          return (
            <div
              key={entry.name}
              className="flex items-start gap-2.5 px-3 py-2.5 border-b last:border-b-0 hover:bg-[var(--color-surface-hover)] transition-colors"
              style={{ borderColor: 'var(--color-surface-border)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <code className="text-[12px] font-semibold" style={{ color: ACCENT }}>
                    {entry.name}
                  </code>
                  <span
                    className="text-[9.5px] px-1 py-0.5 rounded"
                    style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-muted)' }}
                  >
                    {entry.transport.toUpperCase()}
                  </span>
                  <span className="text-[9.5px] text-[var(--color-text-muted)] opacity-70">{entry.author}</span>
                </div>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 line-clamp-2">
                  {entry.description}
                </p>
                <div className="flex gap-1 flex-wrap mt-1">
                  {entry.tags.map(tag => (
                    <span key={tag} className="text-[9px] px-1 py-0.5 rounded"
                      style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 10%, transparent)`, color: ACCENT }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleAdd(entry)}
                disabled={isExisting}
                className="shrink-0 text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-default mt-0.5"
                style={{
                  backgroundColor: isAdded
                    ? 'color-mix(in srgb, var(--color-success) 15%, transparent)'
                    : isExisting
                    ? 'var(--color-surface-hover)'
                    : `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
                  color: isAdded ? 'var(--color-success)' : isExisting ? 'var(--color-text-muted)' : ACCENT,
                }}
              >
                {isAdded ? '✓ Added' : isExisting ? 'Exists' : 'Add'}
              </button>
            </div>
          );
        })}
        {results.length === 0 && (
          <div className="flex items-center justify-center h-[80px]">
            <span className="text-[12px] text-[var(--color-text-muted)]">No servers match "{query}"</span>
          </div>
        )}
      </div>
    </div>
  );
}
