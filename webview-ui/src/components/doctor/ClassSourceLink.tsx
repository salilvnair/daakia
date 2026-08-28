/**
 * ClassSourceLink — a class name that knows whether it exists in your workspace.
 *
 * The whole reason this analyzer belongs in an editor. A leak suspect in MAT is
 * a string in a report; here it is somewhere you can go.
 *
 * Lookup is lazy and cached: resolving on render would fire a workspace file
 * search for every visible row, and a histogram can have hundreds.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { postMsg } from '../../vscode';
import { ExternalLinkIcon } from '../../icons';

interface Located {
  files: { path: string; relative: string }[];
  note?: string;
}

const cache = new Map<string, Located>();
const pending = new Map<string, ((v: Located) => void)[]>();
let seq = 0;
let listening = false;

function ensureListener() {
  if (listening) return;
  listening = true;
  window.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data;
    if (msg?.type !== 'heap:locateResult') return;
    const value: Located = { files: msg.files ?? [], note: msg.note };
    cache.set(msg.className, value);
    pending.get(msg.className)?.forEach(fn => fn(value));
    pending.delete(msg.className);
  });
}

function locate(className: string): Promise<Located> {
  ensureListener();
  const hit = cache.get(className);
  if (hit) return Promise.resolve(hit);
  return new Promise(resolve => {
    const waiting = pending.get(className);
    if (waiting) { waiting.push(resolve); return; }
    pending.set(className, [resolve]);
    postMsg({ type: 'heap:locateClass', requestId: `loc${++seq}`, className });
  });
}

/** Classes that are definitely not in a workspace — never worth a file search. */
function isForeign(className: string): boolean {
  return className.startsWith('[') || /^(java|javax|jdk|sun|com\.sun)\./.test(className);
}

export function ClassSourceLink({ className }: { className: string }) {
  const [located, setLocated] = useState<Located | null>(cache.get(className) ?? null);
  const [hovered, setHovered] = useState(false);
  const asked = useRef(false);

  const foreign = isForeign(className);

  // Resolve on first hover rather than on mount — hundreds of rows would
  // otherwise each trigger a workspace search the user never asked for.
  useEffect(() => {
    if (!hovered || foreign || asked.current) return;
    asked.current = true;
    let live = true;
    locate(className).then(r => { if (live) setLocated(r); });
    return () => { live = false; };
  }, [hovered, foreign, className]);

  const open = useCallback(() => {
    const file = located?.files[0];
    if (!file) return;
    postMsg({ type: 'heap:openSource', path: file.path, className });
  }, [located, className]);

  const found = located?.files.length ? located.files[0] : null;

  if (foreign || (located && !found)) {
    return (
      <span className="truncate text-[var(--color-text-primary)]" title={className}
            onMouseEnter={() => setHovered(true)}>
        {className}
      </span>
    );
  }

  return (
    <span
      className="truncate flex items-center gap-1.5 min-w-0"
      onMouseEnter={() => setHovered(true)}
      title={found ? `Open ${found.relative}` : className}
    >
      <span
        className="truncate"
        style={{
          color: found ? 'var(--color-doctor)' : 'var(--color-text-primary)',
          cursor: found ? 'pointer' : 'default',
          textDecoration: found ? 'underline' : 'none',
          textUnderlineOffset: 3,
          textDecorationStyle: 'dotted',
        }}
        onClick={found ? open : undefined}
      >
        {className}
      </span>
      {found && <ExternalLinkIcon size={11} style={{ color: 'var(--color-doctor)', flexShrink: 0 }} />}
    </span>
  );
}
