import { useEffect, useState } from 'react';

// ─── Copy Root HTML Button ────────────────────────────────────────────────────
// Wiki capture helper — click to copy outerHTML of #root to clipboard.
// Use this when capturing screens for plan/daakia_live/<protocol>/
// See: plan/daakia_live/rest/v1.md for the capture plan.
//
// Also bound to Ctrl+Shift+1 globally (works even while a ModalView/popup has
// focus, since clicking the button itself isn't possible when a modal's
// backdrop sits on top of it) — see the window keydown listener below.
//
// To disable: comment out the import + <CopyRootHtmlButton /> in AppSidebar.tsx

async function copyRootHtml(): Promise<boolean> {
  const root = document.getElementById('root');
  if (!root) return false;
  // DUI's ModalView (GenerateCodeModal, ImportCurlModal, every other popup)
  // renders via createPortal(..., document.body) — a SIBLING of #root, not a
  // descendant — so a bare #root capture silently drops any modal that's
  // open at capture time. Append every extra direct child of <body> so open
  // modals are captured too — same fix as CaptureBridge.tsx's automated
  // capture.
  const portalHtml = Array.from(document.body.children)
    .filter(el => el.id !== 'root')
    .map(el => el.outerHTML)
    .join('');
  const html = root.outerHTML + portalHtml;
  try {
    await navigator.clipboard.writeText(html);
    return true;
  } catch {
    // fallback for VS Code webview (clipboard API may be restricted)
    const textarea = document.createElement('textarea');
    textarea.value = html;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  }
}

export function CopyRootHtmlButton() {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    const ok = await copyRootHtml();
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Global shortcut — Ctrl+Shift+1 (Cmd+Shift+1 on Mac) — fires regardless of
  // what's focused, so a capture can still be taken while a ModalView/popup
  // is open and visually covering this button.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '1') {
        e.preventDefault();
        handleClick();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <button
      type="button"
      onClick={handleClick}
      data-wiki-capture-tool="true"
      title={copied ? 'Copied! Paste into plan/daakia_live/' : 'Copy root outerHTML (wiki capture) — Ctrl+Shift+1'}
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
        // Sits well above ModalView's own stacking (1000 + layer*50, see
        // dui2 ModalView.tsx) so this button stays clickable even with a
        // popup/modal open on top of it.
        zIndex: 999999,
      }}
      onMouseEnter={e => {
        if (!copied) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'color-mix(in srgb, var(--color-text-primary) 7%, transparent)';
      }}
      onMouseLeave={e => {
        if (!copied) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
      }}
    >
      {copied ? '✅' : '🧢'}
    </button>
  );
}
