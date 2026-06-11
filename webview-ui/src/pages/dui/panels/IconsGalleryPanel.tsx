import { useState } from 'react';
import * as Icons from '../../../icons/daakia-icons';
import { TextInputView } from '../../../dui';
import { SearchIcon, CopyIcon, CheckIcon } from '../../../icons';

type IconEntry = {
  name: string;
  component: React.ComponentType<{ size?: number }>;
  category: string;
};

const ICON_CATEGORIES: { label: string; names: string[] }[] = [
  {
    label: 'Actions',
    names: [
      'UndoIcon','RedoIcon','CutIcon','PasteIcon','SelectAllIcon','SaveIcon','DownloadIcon',
      'CopyIcon','RefreshIcon','TrashIcon','PlusIcon','RenameIcon','PlayIcon','PauseIcon',
      'CloseIcon','CloseCircleIcon','CloseSquareIcon','CloseAllIcon','SaveCheckIcon',
      'ShareIcon','ExternalLinkIcon','PlusSquareIcon','SearchIcon','FilterIcon',
      'UploadIcon','ExportIcon','DuplicateIcon','WrapLinesIcon','BulkEditIcon',
      'RestartIcon','StopSquareIcon','DiceIcon','ConnectIcon','DisconnectIcon',
      'ClearChatIcon','EraserIcon',
    ],
  },
  {
    label: 'Navigation',
    names: [
      'ChevronDownIcon','ChevronRightIcon','ChevronLeftIcon','ArrowDownIcon','ArrowUpIcon',
      'ArrowToRightIcon','ArrowToLeftIcon','ArrowUpRightIcon','ArrowDownLeftIcon',
      'MoreHorizontalIcon','MoreVerticalIcon','ExpandAllIcon','CollapseAllIcon',
      'PanelRightIcon','PanelMaximizeIcon','PanelMinimizeIcon',
    ],
  },
  {
    label: 'Status',
    names: [
      'CheckIcon','CheckCircleIcon','CheckCircleFilledIcon','XCircleIcon','CloseCircleIcon',
      'SpinnerIcon','DotIcon','StageCheckIcon','StageErrorIcon','StagePendingIcon',
      'StageSpinIcon','StagePulseIcon','InfoCircleIcon','WarningTriangleIcon','HelpCircleIcon',
      'LinkIcon','WifiIcon',
    ],
  },
  {
    label: 'Files & Data',
    names: [
      'FolderIcon','FolderOpenIcon','FolderPlusIcon','FolderExportIcon','FolderImportIcon',
      'FolderTransferIcon','DocumentIcon','FilePlusIcon','FileTextIcon','FileUploadIcon',
      'AttachmentIcon','DragHandleIcon','LayersIcon','CodeIcon','CodeBracketsIcon',
      'XmlTagIcon','SchemaIcon','TypeIcon','VariableIcon','VariablesIcon',
    ],
  },
  {
    label: 'UI Controls',
    names: [
      'PinIcon','UnpinIcon','EyeIcon','EyeOffIcon','SunIcon','LockIcon','KeyIcon',
      'GlobeIcon','CookieIcon','ClockIcon','WandIcon','SparkleIcon','BugIcon',
      'BookOpenIcon','LineNumbersIcon',
    ],
  },
  {
    label: 'Server & DevTools',
    names: [
      'ServerIcon','SettingsIcon','TerminalIcon','NetworkIcon','TimelineIcon',
      'GaugeIcon','MemoryIcon','UptimeIcon','ProcessIcon','OutputIcon',
      'DevToolsIcon','BugIcon','AutoScrollIcon','CpuIcon','RunDebugIcon',
      'MuteBreakpointsIcon','RestartFrameIcon',
    ],
  },
  {
    label: 'Debug',
    names: [
      'DbgContinueIcon','DbgStepOverIcon','DbgStepIntoIcon','DbgStepOutIcon',
      'DbgRestartIcon','DbgStopIcon','StepIntoIcon','StepOutIcon','StepOverIcon',
    ],
  },
  {
    label: 'Protocols',
    names: [
      'RestApiIcon','GraphQLIcon','WebSocketIcon','GrpcIcon','GrpcUnaryIcon',
      'GrpcServerStreamIcon','GrpcClientStreamIcon','GrpcBidiStreamIcon','SoapIcon',
      'RealtimeIcon','SSEIcon','SocketIOIcon','MQTTIcon','McpToolIcon',
      'CollectionsFolderIcon',
    ],
  },
  {
    label: 'Protocol Badges',
    names: [
      'ProtocolRestBadge','ProtocolGraphQLBadge','ProtocolRealtimeBadge',
      'ProtocolGrpcBadge','ProtocolSoapBadge','ProtocolAiBadge','ProtocolMcpBadge',
    ],
  },
  {
    label: 'AI & Agents',
    names: [
      'SparkleIcon','WandIcon','CopilotIcon','CopilotBrandIcon','AgentIcon',
      'RestAgentIcon','CurlAgentIcon','MockServerAgentIcon','TestAgentIcon',
      'KnowledgeAgentIcon','GeneralAssistantIcon',
    ],
  },
  {
    label: 'AI Providers',
    names: [
      'OpenAiProviderIcon','AnthropicProviderIcon','GeminiProviderIcon',
      'DeepSeekProviderIcon','GrokProviderIcon','GroqProviderIcon',
      'TogetherProviderIcon','MistralProviderIcon','OllamaProviderIcon',
      'AzureOpenAiProviderIcon','DaakiaMockProviderIcon',
    ],
  },
  {
    label: 'Misc',
    names: [
      'SendIcon','ReplSendIcon','RadioIcon','RadioSelectIcon','DropdownArrowIcon',
      'BookOpenIcon',
    ],
  },
];

function buildEntries(): IconEntry[] {
  const entries: IconEntry[] = [];
  const seen = new Set<string>();
  for (const cat of ICON_CATEGORIES) {
    for (const name of cat.names) {
      if (seen.has(name)) continue;
      const comp = (Icons as Record<string, unknown>)[name] as React.ComponentType<{ size?: number }> | undefined;
      if (!comp) continue;
      seen.add(name);
      entries.push({ name, component: comp, category: cat.label });
    }
  }
  return entries;
}

const ALL_ENTRIES = buildEntries();

export function IconsGalleryPanel() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [copied, setCopied] = useState<string | null>(null);

  const categories = ['All', ...ICON_CATEGORIES.map(c => c.label)];

  const filtered = ALL_ENTRIES.filter(e => {
    const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase());
    const matchesCat = activeCategory === 'All' || e.category === activeCategory;
    return matchesSearch && matchesCat;
  });

  const copyName = (name: string) => {
    navigator.clipboard?.writeText(name).catch(() => {});
    setCopied(name);
    setTimeout(() => setCopied(null), 1400);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <TextInputView
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search icons…"
          iconLeft={<SearchIcon size={11} />}
          style={{ width: 220 }}
        />
        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
          {filtered.length} / {ALL_ENTRIES.length}
        </span>
      </div>

      {/* Category filter pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {categories.map(cat => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '3px 9px', borderRadius: 99, fontSize: '10px', fontWeight: isActive ? 600 : 400,
                cursor: 'pointer', border: 'none',
                background: isActive ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-text-primary) 8%, transparent)',
                color: isActive ? 'white' : 'var(--color-text-secondary)',
                transition: 'background 100ms',
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Icon grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
        gap: '6px',
      }}>
        {filtered.map(entry => {
          const isCopied = copied === entry.name;
          const IconComp = entry.component;
          return (
            <button
              key={entry.name}
              type="button"
              title={`${entry.name} — click to copy`}
              onClick={() => copyName(entry.name)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 6px',
                borderRadius: '7px',
                border: `1px solid ${isCopied ? 'var(--color-success)' : 'var(--color-surface-border)'}`,
                background: isCopied
                  ? 'color-mix(in srgb, var(--color-success) 10%, var(--color-surface))'
                  : 'var(--color-surface)',
                cursor: 'pointer',
                transition: 'all 120ms',
                position: 'relative',
              }}
              onMouseEnter={e => {
                if (!isCopied) (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-primary)';
              }}
              onMouseLeave={e => {
                if (!isCopied) (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-surface-border)';
              }}
            >
              <div style={{ color: isCopied ? 'var(--color-success)' : 'var(--color-text-secondary)', fontSize: '18px' }}>
                {isCopied ? <CheckIcon size={18} /> : <IconComp size={18} />}
              </div>
              <div style={{
                fontSize: '9px',
                color: isCopied ? 'var(--color-success)' : 'var(--color-text-muted)',
                textAlign: 'center',
                lineHeight: 1.3,
                wordBreak: 'break-all',
                fontFamily: 'monospace',
              }}>
                {isCopied ? 'Copied!' : entry.name.replace('Icon', '')}
              </div>
              {/* Hover copy hint */}
              <div
                className="absolute inset-0 rounded-[7px] flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                style={{ background: 'color-mix(in srgb, var(--color-primary) 8%, transparent)' }}
              >
                <CopyIcon size={12} style={{ color: 'var(--color-primary)' }} />
              </div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)', fontSize: '12px' }}>
          No icons found for "{search}"
        </div>
      )}

      <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
        Click any icon to copy its name. All icons are in <code style={{ fontFamily: 'monospace', background: 'color-mix(in srgb, var(--color-text-primary) 8%, transparent)', padding: '1px 4px', borderRadius: 3 }}>webview-ui/src/icons/daakia-icons.tsx</code>
      </div>
    </div>
  );
}
