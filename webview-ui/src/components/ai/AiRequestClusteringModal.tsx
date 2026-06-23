/**
 * AiRequestClusteringModal — AI groups request history into logical API domains.
 * Task 10.17 — AI Request Clustering · Gate: requestClustering
 */
import { useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView } from '@salilvnair/dui';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

export function AiRequestClusteringModal({ onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const allTabs = useTabsStore(s => s.tabs);
  const [clusters, setClusters] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tabCount, setTabCount] = useState(0);
  const streamRef = useRef('');

  useEffect(() => { generateClusters(); }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setClusters(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setLoading(false); }
      else if (msg?.type === 'aiStream:error') { setError(msg.error || 'Clustering failed'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const generateClusters = () => {
    if (!activeTab || loading) return;
    streamRef.current = ''; setClusters(''); setError(''); setLoading(true);

    const tabs = allTabs.filter(t => t.url && t.url.length > 5);
    setTabCount(tabs.length);

    const tabList = tabs.slice(0, 50).map((t, i) =>
      `${i + 1}. [${(t.protocol || 'rest').toUpperCase()}] ${t.method || 'GET'} ${t.url}${t.name && t.name !== t.url ? ` (${t.name})` : ''}`
    ).join('\n') || '1. [REST] GET https://api.example.com/users\n2. [REST] POST https://api.example.com/auth/login';

    postMsg({
      type: 'aiChat',
      tabId: activeTab.id,
      messages: [{
        role: 'user',
        content: `You are an API organization expert. Analyze the following API requests and group them into logical domain collections.

Requests to cluster:
${tabList}

Instructions:
1. Identify 3-10 logical API domains based on URL patterns, operations, and purposes (e.g., "Authentication", "User Management", "Products", "Orders", "Payments", "Webhooks", "Admin")
2. Assign each request to the most appropriate domain
3. Order requests within each domain logically (list → get → create → update → delete)
4. Suggest a clear collection name and folder structure

Output format:
## Clustering Analysis

### Discovered API Domains
Brief description of what domains you identified and why.

## Proposed Collection Structure

### 📁 [Domain Name] (N requests)
> Brief description of this domain

| # | Method | Endpoint | Suggested Name |
|---|---|---|---|
| 1 | GET | /api/... | ... |

Repeat for each domain.

## Suggested Actions
- How many collections to create
- Naming conventions observed
- Any duplicate/redundant endpoints noticed
- Requests that don't fit a clear category`,
      }],
      stream: true,
    });
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="Request Clustering ✦"
      subtitle={tabCount > 0 ? `${tabCount} request${tabCount !== 1 ? 's' : ''}` : undefined}
      size="xl"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerRight={
        !loading && clusters ? (
          <AIButtonView label="Re-cluster" size="md" accentColor={ACCENT} onClick={generateClusters} />
        ) : undefined
      }
    >
      {error && <p className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>}
      {loading && !clusters && <p className="text-[11px] animate-pulse text-center py-12" style={{ color: ACCENT }}>Clustering {tabCount} API requests into logical domains…</p>}
      {clusters && <MdViewer content={clusters} />}
    </ModalView>
  );
}
