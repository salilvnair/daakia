/** Smoke tests — extracted extension-message handler modules route/ignore correctly. */
import { describe, it, expect } from 'vitest';
import { handleGrpcMessages } from '../app/messages/grpc-messages';
import { handleSoapMessages } from '../app/messages/soap-messages';
import { handleMockMessages } from '../app/messages/mock-messages';
import { handleAiMessages } from '../app/messages/ai-messages';
import { handleMcpMessages } from '../app/messages/mcp-messages';
import { handleRealtimeMessages } from '../app/messages/realtime-messages';
import { handleDebuggerMessages } from '../app/messages/debugger-messages';
import { useTabsStore } from '../store/tabs-store';

const noopUi = { setSplitPercent: () => {}, setFocusedPanel: () => {}, setSidebarSection: () => {} };

describe('message handler modules', () => {
  it('all handlers return false for unknown message types', () => {
    const msg = { type: 'definitely-not-a-real-type' };
    expect(handleGrpcMessages(msg)).toBe(false);
    expect(handleSoapMessages(msg)).toBe(false);
    expect(handleMockMessages(msg)).toBe(false);
    expect(handleAiMessages(msg)).toBe(false);
    expect(handleMcpMessages(msg)).toBe(false);
    expect(handleRealtimeMessages(msg)).toBe(false);
    expect(handleDebuggerMessages(msg, noopUi)).toBe(false);
  });

  it('grpc:response is claimed and updates the target tab', () => {
    useTabsStore.getState().addTab({ url: 'grpc://localhost:50051' });
    const s = useTabsStore.getState();
    const tab = s.tabs[s.tabs.length - 1];
    const claimed = handleGrpcMessages({ type: 'grpc:response', tabId: tab.id, response: { status: 0, statusText: 'OK', body: '{}' } });
    expect(claimed).toBe(true);
    const updated = useTabsStore.getState().tabs.find(t => t.id === tab.id)!;
    expect(updated.loading).toBeFalsy();
  });

  it('realtime ws:connected is claimed', () => {
    expect(handleRealtimeMessages({ type: 'ws:connected', tabId: 'x', url: 'ws://localhost' })).toBe(true);
  });
});
