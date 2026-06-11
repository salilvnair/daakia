import { useState } from 'react';
import { ChevronRightIcon, SearchIcon } from '../../../icons';
import { PromptCardView } from './PromptCardView';

export interface PromptLibraryItem {
  id: string;
  title: string;
  description?: string;
  avatarColor?: string;
  protocol?: string;
  protocolColor?: string;
  isCustom?: boolean;
  isModified?: boolean;
}

export interface PromptLibraryCategory {
  id: string;
  title: string;
  items: PromptLibraryItem[];
}

export interface PromptLibrarySection {
  id: string;
  title: string;
  categories: PromptLibraryCategory[];
}

export interface PromptLibraryListViewProps {
  sections: PromptLibrarySection[];
  activeId?: string;
  onSelect?: (id: string) => void;
  search?: string;
  onSearchChange?: (v: string) => void;
  accentColor?: string;
  className?: string;
}

function getInitials(title: string): string {
  const words = title.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return title.slice(0, 2).toUpperCase();
}

export function PromptLibraryListView({
  sections,
  activeId,
  onSelect,
  search = '',
  onSearchChange,
  accentColor,
  className = '',
}: PromptLibraryListViewProps) {
  const accent = accentColor || 'var(--color-protocol-ai)';
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  const toggleSection = (id: string) => setCollapsedSections(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleCat = (id: string) => setCollapsedCats(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const q = search.toLowerCase().trim();

  const filteredSections = sections.map(section => ({
    ...section,
    categories: section.categories.map(cat => ({
      ...cat,
      items: q
        ? cat.items.filter(item =>
            item.title.toLowerCase().includes(q) ||
            (item.description ?? '').toLowerCase().includes(q)
          )
        : cat.items,
    })).filter(cat => cat.items.length > 0),
  })).filter(s => s.categories.length > 0);

  const totalCount = sections.reduce((sum, s) => sum + s.categories.reduce((cs, c) => cs + c.items.length, 0), 0);

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Search bar */}
      <div style={{
        padding: '8px 10px',
        borderBottom: '1px solid var(--color-panel-border)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: 28, background: 'var(--color-input-bg)',
          border: '1px solid var(--color-input-border)',
          borderRadius: 6, padding: '0 8px',
        }}>
          <SearchIcon size={12} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => onSearchChange?.(e.target.value)}
            placeholder="Search prompts..."
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 11, color: 'var(--color-text-primary)', fontFamily: 'inherit',
            }}
          />
          {totalCount > 0 && !search && (
            <span style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 99, flexShrink: 0,
              background: 'color-mix(in srgb, var(--color-text-muted) 15%, transparent)',
              color: 'var(--color-text-muted)', fontWeight: 700,
            }}>{totalCount}</span>
          )}
        </div>
      </div>

      {/* Sections list */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {filteredSections.map(section => {
          const isSectionCollapsed = collapsedSections.has(section.id);
          const sectionTotal = section.categories.reduce((s, c) => s + c.items.length, 0);
          return (
            <div key={section.id}>
              {/* Section header */}
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                  padding: '8px 12px 6px', background: 'transparent', border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <ChevronRightIcon
                  size={9}
                  style={{
                    flexShrink: 0, color: 'var(--color-text-muted)', opacity: 0.5,
                    transform: isSectionCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                    transition: 'transform 140ms ease',
                  }}
                />
                <span style={{
                  flex: 1, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'var(--color-text-muted)',
                }}>
                  {section.title}
                </span>
                <span style={{
                  fontSize: 9, padding: '1px 5px', borderRadius: 99,
                  background: `color-mix(in srgb, ${accent} 15%, transparent)`,
                  color: accent, fontWeight: 700,
                }}>{sectionTotal}</span>
              </button>

              {!isSectionCollapsed && (
                <div>
                  {section.categories.map(cat => {
                    const isCatCollapsed = collapsedCats.has(cat.id);
                    return (
                      <div key={cat.id}>
                        {/* Category header */}
                        <button
                          type="button"
                          onClick={() => toggleCat(cat.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                            padding: '5px 12px 3px 22px', background: 'transparent', border: 'none',
                            cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          <ChevronRightIcon
                            size={8}
                            style={{
                              flexShrink: 0, color: 'var(--color-text-muted)', opacity: 0.4,
                              transform: isCatCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                              transition: 'transform 120ms ease',
                            }}
                          />
                          <span style={{
                            flex: 1, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                            textTransform: 'uppercase', color: 'var(--color-text-muted)', opacity: 0.7,
                          }}>
                            {cat.title}
                          </span>
                          <span style={{ fontSize: 9, color: 'var(--color-text-muted)', opacity: 0.5 }}>
                            {cat.items.length}
                          </span>
                        </button>

                        {!isCatCollapsed && (
                          <div style={{ padding: '2px 6px' }}>
                            {cat.items.map(item => (
                              <PromptCardView
                                key={item.id}
                                id={item.id}
                                title={item.title}
                                description={item.description}
                                content={item.description ?? ''}
                                protocol={item.protocol}
                                protocolColor={item.protocolColor}
                                isCustom={item.isCustom}
                                accentColor={item.avatarColor ?? accent}
                                selected={item.id === activeId}
                                onClick={id => onSelect?.(id)}
                                onUse={id => onSelect?.(id)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
