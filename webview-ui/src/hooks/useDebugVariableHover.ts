import { useRef, useEffect, useCallback } from 'react';
import { useDebugStore } from '../store/debug-store';

/**
 * Custom debug variable hover — shows a styled popup (like InfoPopup) on hover
 * over identifiers during an active debug session. Replaces Monaco's bland markdown hover.
 * Supports property access: `obj.prop.sub`, `arr.length`, etc.
 */
export function useDebugVariableHover() {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<any>(null);
  const disposablesRef = useRef<any[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      popupRef.current?.remove();
      disposablesRef.current.forEach(d => d?.dispose?.());
    };
  }, []);

  const getOrCreatePopup = useCallback(() => {
    if (!popupRef.current) {
      const el = document.createElement('div');
      el.className = 'daakia-debug-hover';
      el.style.display = 'none';
      document.body.appendChild(el);
      // Hide on mouse leave from popup
      el.addEventListener('mouseleave', () => {
        hideTimerRef.current = setTimeout(() => { el.style.display = 'none'; }, 200);
      });
      el.addEventListener('mouseenter', () => {
        if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
      });
      popupRef.current = el;
    }
    return popupRef.current;
  }, []);

  function attach(editor: any, monaco: any) {
    editorRef.current = editor;
    // Dispose previous listeners
    disposablesRef.current.forEach(d => d?.dispose?.());
    disposablesRef.current = [];

    // Also disable Monaco's default hover for our language during debug
    const moveDisposable = editor.onMouseMove((e: any) => {
      const { active, status, variables } = useDebugStore.getState();
      if (!active || status !== 'paused' || variables.length === 0) {
        hidePopup();
        return;
      }

      if (!e.target?.position || e.target.type !== monaco.editor.MouseTargetType.CONTENT_TEXT) {
        hidePopup();
        return;
      }

      const position = e.target.position;
      const model = editor.getModel();
      if (!model) return;

      const wordInfo = model.getWordAtPosition(position);
      if (!wordInfo) { hidePopup(); return; }

      const lineContent = model.getLineContent(position.lineNumber);
      const { expr, startCol, endCol } = getFullExpression(lineContent, wordInfo.startColumn - 1, wordInfo.endColumn - 1);

      const resolved = resolveExpression(expr, variables);
      if (!resolved) { hidePopup(); return; }

      showPopup(editor, position, expr, resolved);
    });

    const leaveDisposable = editor.onMouseLeave(() => {
      hideTimerRef.current = setTimeout(() => hidePopup(), 300);
    });

    disposablesRef.current = [moveDisposable, leaveDisposable];
  }

  function showPopup(editor: any, position: any, expr: string, resolved: { value: unknown; type: string }) {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }

    const popup = getOrCreatePopup();
    const formatted = formatHoverValue(resolved.value, resolved.type);
    const typeColor = getTypeColor(resolved.type);

    popup.innerHTML = `
      <div class="daakia-debug-hover__header">
        <span class="daakia-debug-hover__name">${escapeHtml(expr)}</span>
        <span class="daakia-debug-hover__type" style="background:${typeColor}20;color:${typeColor}">${resolved.type}</span>
      </div>
      <div class="daakia-debug-hover__value">${escapeHtml(formatted)}</div>
    `;

    // Position near the word in the editor
    const coords = editor.getScrolledVisiblePosition(position);
    const editorDom = editor.getDomNode();
    if (coords && editorDom) {
      const editorRect = editorDom.getBoundingClientRect();
      let left = editorRect.left + coords.left;
      let top = editorRect.top + coords.top + coords.height + 4;

      // Keep within viewport
      const popupWidth = 280;
      if (left + popupWidth > window.innerWidth) left = window.innerWidth - popupWidth - 8;
      if (top + 200 > window.innerHeight) top = editorRect.top + coords.top - 200 - 4;

      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
      popup.style.display = 'block';
    }
  }

  function hidePopup() {
    const popup = popupRef.current;
    if (popup) popup.style.display = 'none';
  }

  return { attach };
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'number': return '#4fc3f7';
    case 'string': return '#ce9178';
    case 'boolean': return '#569cd6';
    case 'function': return '#dcdcaa';
    case 'object': return '#9cdcfe';
    case 'null': return '#808080';
    default: return '#c586c0';
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Expand from cursor position to get the full dot-notation expression.
 */
function getFullExpression(line: string, wordStart: number, wordEnd: number): { expr: string; startCol: number; endCol: number } {
  let start = wordStart;
  let end = wordEnd;

  while (start > 0) {
    if (line[start - 1] === '.') {
      let identStart = start - 2;
      while (identStart >= 0 && /[a-zA-Z0-9_$]/.test(line[identStart])) identStart--;
      start = identStart + 1;
    } else break;
  }

  while (end < line.length) {
    if (line[end] === '.') {
      let identEnd = end + 1;
      while (identEnd < line.length && /[a-zA-Z0-9_$]/.test(line[identEnd])) identEnd++;
      if (identEnd > end + 1) end = identEnd;
      else break;
    } else break;
  }

  return { expr: line.slice(start, end), startCol: start, endCol: end };
}

/**
 * Resolve a dot-notation expression against captured debug variables.
 */
function resolveExpression(expr: string, variables: { name: string; value: unknown; type: string }[]): { value: unknown; type: string } | null {
  const parts = expr.split('.');
  if (parts.length === 0) return null;

  const root = variables.find(v => v.name === parts[0]);
  if (!root) return null;

  if (parts.length === 1) return { value: root.value, type: root.type };

  let current: unknown = root.value;
  for (let i = 1; i < parts.length; i++) {
    if (current === null || current === undefined) return null;
    if (typeof current !== 'object') {
      current = resolveBuiltinProp(current, parts[i]);
      if (current === undefined) return null;
    } else {
      current = (current as Record<string, unknown>)[parts[i]];
    }
  }

  if (current === undefined) return null;
  const type = current === null ? 'null' : typeof current;
  return { value: current, type };
}

function resolveBuiltinProp(value: unknown, prop: string): unknown {
  if (prop === 'length') {
    if (typeof value === 'string' || Array.isArray(value)) return (value as any).length;
  }
  return undefined;
}

function formatHoverValue(value: unknown, type: string): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (type === 'string') return `"${value}"`;
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value, null, 2);
      // Truncate long values
      if (json.length > 300) return json.slice(0, 300) + '\n...';
      return json;
    } catch { return String(value); }
  }
  return String(value);
}
