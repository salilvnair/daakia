/**
 * Search every collection, in every protocol, at once.
 *
 * The sidebar panels each filter their own tree by name and URL, which cannot
 * answer "which request sends this header" or "where does this staging host
 * still appear" — the two questions anyone asks before a migration. The
 * answer lives in the request blobs, so the host does the searching and this
 * shows what came back.
 *
 * Rows say WHERE the match was, because "in the body" and "in the URL" send
 * you to different places, and a hit with no field reads as a coincidence.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ModalView, TextInputView, BadgeChipView } from '@salilvnair/dui';
import { postMsg } from '../../../vscode';
import { METHOD_COLORS } from '../../../colors';
import { openCollectionRequest } from '../../../services/collections';

type MatchField = 'name' | 'url' | 'header' | 'param' | 'body' | 'docs' | 'folder';

interface SearchHit {
  id: string;
  kind: 'request' | 'folder';
  name: string;
  method?: string;
  url?: string;
  path: string;
  collectionId: string;
  field: MatchField;
  context: string;
}

/** One tone per place a match can hide, so the eye can group the list. */
const FIELD_TONE: Record<MatchField, string> = {
  name: 'var(--color-text-muted)',
  url: 'var(--color-info)',
  header: 'var(--color-protocol-graphql)',
  param: 'var(--color-warning)',
  body: 'var(--color-success)',
  docs: 'var(--color-primary)',
  folder: 'var(--color-text-muted)',
};

export function SearchCollectionsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'collectionSearchResults') {
        setHits(Array.isArray(msg.hits) ? msg.hits : []);
        setSearched(String(msg.query ?? ''));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [open]);

  /*
    Debounced, because this reads every request's blob out of SQLite: a search
    per keystroke on a four-hundred-request collection is the exact workload
    this feature exists to make bearable.
  */
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) { setHits([]); setSearched(''); return; }
    const t = setTimeout(() => postMsg({ type: 'searchCollections', query: q }), 180);
    return () => clearTimeout(t);
  }, [query, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const grouped = useMemo(() => {
    const out = new Map<string, SearchHit[]>();
    for (const hit of hits) {
      const key = hit.path.split(' / ')[0] || 'Collection';
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(hit);
    }
    return [...out.entries()];
  }, [hits]);

  const openHit = (hit: SearchHit) => {
    if (hit.kind !== 'request') return;
    openCollectionRequest({ id: hit.id, collection_id: hit.collectionId, name: hit.name, method: hit.method, url: hit.url } as never);
    onClose();
  };

  return (
    <ModalView open={open} onClose={onClose} title="Search all collections" size="lg" noPadding>
      <div style={{ padding: 14, borderBottom: '1px solid var(--color-surface-border)' }}>
        <TextInputView
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="A header, a host, anything in a body — or /regex/"
          size="md"
          width="fw"
        />
        <p className="text-[10.5px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
          Names, URLs, headers, params, bodies and docs — across every protocol.
        </p>
      </div>

      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {searched && hits.length === 0 && (
          <div className="flex items-center justify-center py-10 text-[12px]"
               style={{ color: 'var(--color-text-muted)' }}>
            Nothing matches “{searched}”.
          </div>
        )}

        {grouped.map(([collection, rows]) => (
          <div key={collection}>
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider sticky top-0"
                 style={{ color: 'var(--color-text-muted)', background: 'var(--color-panel)' }}>
              {collection} · {rows.length}
            </div>
            {rows.map(hit => (
              <div
                key={`${hit.kind}:${hit.id}:${hit.field}`}
                onClick={() => openHit(hit)}
                className={`px-3 py-1.5 flex flex-col gap-0.5 ${
                  hit.kind === 'request' ? 'cursor-pointer hover:bg-[var(--color-item-hover-bg)]' : ''
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {hit.method && (
                    <span className="text-[9px] font-bold shrink-0 w-[34px]"
                          style={{ color: METHOD_COLORS[hit.method] || 'var(--color-muted-fallback)' }}>
                      {hit.method}
                    </span>
                  )}
                  <span className="text-[11.5px] truncate min-w-0" style={{ color: 'var(--color-text-primary)' }}>
                    {hit.name}
                  </span>
                  <BadgeChipView tone={FIELD_TONE[hit.field]} size="2xs">{hit.field}</BadgeChipView>
                  <span className="text-[9.5px] truncate ml-auto shrink-0 max-w-[45%]"
                        style={{ color: 'var(--color-text-muted)' }}>
                    {hit.path}
                  </span>
                </div>
                {/* The matched text itself: a hit you cannot see the reason
                    for is one you have to open to dismiss. */}
                <span className="text-[10px] font-mono truncate" style={{ color: 'var(--color-text-secondary)' }}>
                  {hit.context}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </ModalView>
  );
}
