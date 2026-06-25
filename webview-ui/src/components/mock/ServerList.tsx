/**
 * ServerList — left panel showing list of mock servers with add/rename/delete actions.
 */
import { useState } from 'react';
import { ContextMenu } from '../shared';
import { MOCK_PROTOCOL_COLORS, getMockProtocolBg } from '../../colors';
import { RenameIcon, PlayIcon, PauseIcon, TrashIcon, ServerIcon, MoreVerticalIcon, PlusIcon } from '../../icons';
import { IconButtonView, TextInputView } from '@salilvnair/dui';
import type { MockServer, MockServerProtocol } from './mock-types';

interface ServerListProps {
  servers: MockServer[];
  activeServerId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, name: string) => void;
  onToggleRunning: (id: string) => void;
  onDelete: (server: MockServer) => void;
  onDeleteAll: () => void;
}

export function ServerList({ servers, activeServerId, onSelect, onNew, onRename, onToggleRunning, onDelete, onDeleteAll }: ServerListProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [entryMenu, setEntryMenu] = useState<{ x: number; y: number; server: MockServer } | null>(null);
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <div className="w-[220px] flex-shrink-0 border-r border-[var(--color-surface-border)] flex flex-col">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--color-surface-border)]">
        <span className="text-[13px] font-medium text-[var(--color-text-primary)] flex items-center gap-2">
          <ServerIcon size={14} />
          Mock Servers
        </span>
        <div className="flex items-center gap-1">
          {servers.length > 0 && (
            <IconButtonView
              size="sm"
              icon={<MoreVerticalIcon size={13} />}
              onClick={(e) => setHeaderMenu({ x: e.clientX, y: e.clientY })}
              tooltip="More options"
            />
          )}
          <IconButtonView
            size="sm"
            icon={<PlusIcon size={13} />}
            onClick={onNew}
            accentColor="var(--color-mock-server)"
            tooltip="New mock server"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1 py-1">
        {servers.map(server => (
          <div
            key={server.id}
            onClick={() => onSelect(server.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setEntryMenu({ x: e.clientX, y: e.clientY, server });
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-left transition-colors text-[12px] group ${
              activeServerId === server.id
                ? 'bg-[rgba(234,179,8,0.12)] text-[var(--color-mock-server)] font-medium'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.04)]'
            }`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${server.running ? 'bg-[var(--color-success)] animate-pulse' : 'bg-[var(--color-muted-fallback)]'}`} />
            {renamingId === server.id ? (
              <TextInputView
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => { onRename(server.id, renameValue.trim() || server.name); setRenamingId(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { onRename(server.id, renameValue.trim() || server.name); setRenamingId(null); }
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                autoFocus
                size="sm"
                accentColor="var(--color-primary)"
                className="flex-1 min-w-0"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate flex-1">{server.name}</span>
            )}
            <span
              className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md tracking-wider shrink-0"
              style={{ color: MOCK_PROTOCOL_COLORS[server.protocol || 'rest'], backgroundColor: getMockProtocolBg(server.protocol || 'rest') }}
            >
              {getProtocolBadge(server.protocol || 'rest')}
            </span>
            <span className="opacity-0 group-hover:opacity-100 transition-all shrink-0">
              <IconButtonView
                size="sm"
                icon={<MoreVerticalIcon size={12} />}
                onClick={(e) => {
                  e.stopPropagation();
                  setEntryMenu({ x: e.clientX, y: e.clientY, server });
                }}
                tooltip="More options"
              />
            </span>
          </div>
        ))}
      </div>

      {/* Entry context menu */}
      {entryMenu && (
        <ContextMenu
          position={{ x: entryMenu.x, y: entryMenu.y }}
          items={[
            { id: 'rename', label: 'Rename', shortcut: 'R', icon: <RenameIcon size={14} />, iconColor: 'var(--color-ctx-rename)' },
            { id: 'toggle', label: entryMenu.server.running ? 'Stop' : 'Start', shortcut: 'S', icon: entryMenu.server.running ? <PauseIcon size={14} /> : <PlayIcon size={14} />, iconColor: entryMenu.server.running ? 'var(--color-warning)' : 'var(--color-success)' },
            { id: 'delete', label: 'Delete', shortcut: 'Del', icon: <TrashIcon size={14} />, iconColor: 'var(--color-error)', danger: true },
          ]}
          onSelect={(id) => {
            const server = entryMenu.server;
            if (id === 'rename') { setRenameValue(server.name); setRenamingId(server.id); }
            else if (id === 'toggle') onToggleRunning(server.id);
            else if (id === 'delete') onDelete(server);
            setEntryMenu(null);
          }}
          onClose={() => setEntryMenu(null)}
        />
      )}

      {/* Header more-options menu */}
      {headerMenu && (
        <ContextMenu
          position={{ x: headerMenu.x, y: headerMenu.y }}
          items={[
            ...(servers.length > 0 ? [
              { id: 'delete-all', label: 'Delete All Mock Servers', shortcut: 'D', icon: <TrashIcon size={14} />, iconColor: 'var(--color-error)', danger: true },
            ] : []),
          ]}
          onSelect={(id) => {
            if (id === 'delete-all') onDeleteAll();
            setHeaderMenu(null);
          }}
          onClose={() => setHeaderMenu(null)}
        />
      )}
    </div>
  );
}

function getProtocolBadge(protocol: MockServerProtocol): string {
  switch (protocol) {
    case 'graphql': return 'GQL';
    case 'websocket': return 'WS';
    case 'sse': return 'SSE';
    case 'socketio': return 'SIO';
    case 'mqtt': return 'MQTT';
    case 'grpc': return 'gRPC';
    case 'soap': return 'SOAP';
    case 'ai': return 'AI';
    case 'mcp': return 'MCP';
    default: return 'REST';
  }
}
