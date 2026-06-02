/**
 * DebugPanel — Variables and Console panel shown during debug sessions.
 *
 * Two sub-tabs: Variables (tree of captured vars) and Console (log output).
 */
import { useState } from 'react';
import { useDebugStore, type DebugVariable, type DebugLogEntry } from '../../../store/debug-store';
import { VariablesIcon, OutputIcon } from '../../../icons/daakia-icons';
import './DebugPanel.css';

export function DebugPanel() {
  const { active, variables, logs } = useDebugStore();
  const [activeTab, setActiveTab] = useState<'variables' | 'console'>('variables');

  if (!active) return null;

  return (
    <div className="debug-panel">
      <div className="debug-panel__tabs">
        <button
          className={`debug-panel__tab ${activeTab === 'variables' ? 'debug-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('variables')}
        >
          <VariablesIcon size={12} />
          <span>Variables</span>
          {variables.length > 0 && <span className="debug-panel__badge">{variables.length}</span>}
        </button>
        <button
          className={`debug-panel__tab ${activeTab === 'console' ? 'debug-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('console')}
        >
          <OutputIcon size={12} />
          <span>Console</span>
          {logs.length > 0 && <span className="debug-panel__badge">{logs.length}</span>}
        </button>
      </div>

      <div className="debug-panel__content">
        {activeTab === 'variables' ? (
          <VariablesView variables={variables} />
        ) : (
          <ConsoleView logs={logs} />
        )}
      </div>
    </div>
  );
}

function VariablesView({ variables }: { variables: DebugVariable[] }) {
  if (variables.length === 0) {
    return <div className="debug-panel__empty">No variables captured yet</div>;
  }

  return (
    <div className="debug-panel__vars">
      {variables.map((v) => (
        <div key={v.name} className="debug-panel__var-row">
          <span className="debug-panel__var-name">{v.name}</span>
          <span className={`debug-panel__var-type debug-panel__var-type--${v.type}`}>{v.type}</span>
          <span className="debug-panel__var-value">{formatValue(v.value)}</span>
        </div>
      ))}
    </div>
  );
}

function ConsoleView({ logs }: { logs: DebugLogEntry[] }) {
  if (logs.length === 0) {
    return <div className="debug-panel__empty">No console output yet</div>;
  }

  return (
    <div className="debug-panel__console">
      {logs.map((entry, idx) => (
        <div key={idx} className={`debug-panel__log debug-panel__log--${entry.level}`}>
          <span className="debug-panel__log-level">{entry.level}</span>
          <span className="debug-panel__log-msg">
            {entry.args.map(a => formatValue(a)).join(' ')}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return v.startsWith('<') ? v : `"${v}"`;
  if (typeof v === 'object') {
    try { return JSON.stringify(v, null, 1); } catch { return String(v); }
  }
  return String(v);
}
