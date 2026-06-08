import { useState } from 'react';

// ─── Copy Root HTML Button ────────────────────────────────────────────────────
// Wiki capture helper — click to copy outerHTML of #root to clipboard.
// Use this when capturing screens for plan/daakia_live/<protocol>/
// See: plan/daakia_live/rest/v1.md for the capture plan.
//
// To disable: comment out the import + <CopyRootHtmlButton /> in AppSidebar.tsx

export function CopyRootHtmlButton() {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    const root = document.getElementById('root');
    if (!root) return;
    try {
      await navigator.clipboard.writeText(root.outerHTML);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for VS Code webview (clipboard API may be restricted)
      const textarea = document.createElement('textarea');
      textarea.value = root.outerHTML;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={copied ? 'Copied! Paste into plan/daakia_live/' : 'Copy root outerHTML (wiki capture)'}
      style={{
        width: 36, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 8, cursor: 'pointer', border: 'none',
        fontSize: 18,
        backgroundColor: copied
          ? 'color-mix(in srgb, var(--color-success) 18%, transparent)'
          : 'transparent',
        transition: 'background-color 0.15s',
        flexShrink: 0,
        position: 'relative',
      }}
      onMouseEnter={e => {
        if (!copied) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.07)';
      }}
      onMouseLeave={e => {
        if (!copied) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
      }}
    >
      {copied ? '✅' : '🧢'}
    </button>
  );
}
