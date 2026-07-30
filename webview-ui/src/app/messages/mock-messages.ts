/** Mock server lifecycle messages (global mirror of MockServerPanel listener). Extracted verbatim from the App message handler. */
import { useDevToolsStore } from '../../store/devtools-store';
import { useMockStore } from '../../store/mock-store';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleMockMessages(msg: any): boolean {
  switch (msg.type as string) {
        case 'mockServer:log': {
          useMockStore.getState().addLog(msg.entry);
          // God-level DevTools logging for mock server traffic
          const entry = msg.entry as {
            direction?: string; protocol?: string; event?: string;
            body?: string; clientId?: string; path?: string;
            method?: string; statusCode?: number; responseTime?: number;
            error?: string; serverId?: string; serverName?: string;
          };
          const dir = entry.direction === 'incoming' ? '⬇' : entry.direction === 'outgoing' ? '⬆' : '↔';
          const proto = (entry.protocol || 'mock').toUpperCase();
          const isError = !!entry.error || (entry.statusCode !== undefined && entry.statusCode >= 400);
          useDevToolsStore.getState().addLog({
            level: isError ? 'error' : 'info',
            args: [
              `[Mock ${proto}] ${dir} ${entry.event || entry.method || ''} ${entry.path || ''}`,
              ...(entry.statusCode !== undefined ? [`→ ${entry.statusCode}`] : []),
              ...(entry.responseTime !== undefined ? [`${entry.responseTime}ms`] : []),
              ...(entry.body ? [entry.body.slice(0, 500)] : []),
              ...(entry.clientId ? [`client:${entry.clientId}`] : []),
              ...(entry.error ? [`ERROR: ${entry.error}`] : []),
            ].filter(Boolean),
            timestamp: Date.now(),
            requestName: entry.serverName ? `Mock/${entry.serverName}` : 'Mock Server',
            scriptPhase: 'mock',
          });
          break;
        }

        // ─── Mock Server Lifecycle (global handler — mirrored from MockServerPanel local listener) ───
        case 'mockServer:started': {
          const { id: startedId, port: startedPort, name: startedName, protocol: startedProto } = msg as { id: string; port: number; name?: string; protocol?: string };
          // Update the store so running count badge is accurate
          useMockStore.getState().updateServer(startedId, { running: true, port: startedPort } as any);
          useDevToolsStore.getState().addLog({
            level: 'info',
            args: [
              `🟢 Mock Server Started`,
              startedName ? `"${startedName}"` : startedId,
              `port ${startedPort}`,
              startedProto ? `protocol: ${startedProto.toUpperCase()}` : '',
            ].filter(Boolean),
            timestamp: Date.now(),
            requestName: `Mock Server`,
            scriptPhase: 'mock',
          });
          break;
        }
        case 'mockServer:stopped': {
          const { id: stoppedId, name: stoppedName } = msg as { id: string; name?: string };
          useMockStore.getState().updateServer(stoppedId, { running: false, port: null } as any);
          useDevToolsStore.getState().addLog({
            level: 'info',
            args: [`🔴 Mock Server Stopped`, stoppedName ? `"${stoppedName}"` : stoppedId],
            timestamp: Date.now(),
            requestName: `Mock Server`,
            scriptPhase: 'mock',
          });
          break;
        }
        case 'mockServer:error': {
          const { id: errId, error: mockErr, name: errName } = msg as { id: string; error: string; name?: string };
          useMockStore.getState().updateServer(errId, { running: false } as any);
          useDevToolsStore.getState().addLog({
            level: 'error',
            args: [
              `🚨 Mock Server Error`,
              errName ? `"${errName}"` : errId,
              mockErr,
            ].filter(Boolean),
            timestamp: Date.now(),
            requestName: `Mock Server`,
            scriptPhase: 'mock',
          });
          break;
        }

    default:
      return false;
  }
  return true;
}
