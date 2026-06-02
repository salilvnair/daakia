import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DropdownArrowIcon } from '../../../icons';
import './StyledDropdown.css';

export interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  color?: string;
  isHeader?: boolean; // renders as non-clickable group header
}

interface Props {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  placeholder?: string;
  accentColor?: string;
}

export function StyledDropdown({ options, value, onChange, className = '', size = 'md', placeholder, accentColor }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);

  // Position menu — flip up if near bottom (portal-based)
  useEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    const position = () => {
      const r = trigger.getBoundingClientRect();
      menu.style.minWidth = r.width + 'px';
      menu.style.left = r.left + 'px';
      const h = menu.offsetHeight || menu.scrollHeight || 200;
      const spaceBelow = window.innerHeight - r.bottom;
      const goUp = spaceBelow < h + 12 && r.top > h + 12;
      if (goUp) {
        menu.style.top = (r.top - h - 4) + 'px';
      } else {
        menu.style.top = (r.bottom + 4) + 'px';
      }
    };
    position();
    const raf = requestAnimationFrame(position);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback((v: string) => {
    onChange(v);
    setOpen(false);
  }, [onChange]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    const idx = options.findIndex(o => o.value === value);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        handleSelect(options[(idx + 1) % options.length].value);
        break;
      case 'ArrowUp':
        e.preventDefault();
        handleSelect(options[(idx - 1 + options.length) % options.length].value);
        break;
      case 'Escape':
        setOpen(false);
        break;
    }
  };

  const sizeClass = size === 'xs' ? 'sd-xs' : size === 'sm' ? 'sd-sm' : '';

  return (
    <div className={`sd-wrap ${sizeClass} ${className}`} onKeyDown={handleKey}>
      <button
        type="button"
        ref={triggerRef}
        className={`sd-trigger${open ? ' open' : ''}`}
        style={open && accentColor ? { borderColor: accentColor, boxShadow: `0 0 0 3px ${accentColor}29` } : undefined}
        onClick={() => setOpen(o => !o)}
      >
        {selected?.icon && <span className="sd-icon">{selected.icon}</span>}
        <span className="sd-val" style={selected?.color ? { color: selected.color } : !selected && placeholder ? { opacity: 0.6 } : undefined}>
          {selected?.label ?? placeholder ?? value}
        </span>
        <DropdownArrowIcon className="sd-arrow" style={open && accentColor ? { color: accentColor } : undefined} />
      </button>
      {open && createPortal(
        <div ref={menuRef} className={`sd-menu sd-menu-portal${size === 'xs' || size === 'sm' ? ' sd-menu-sm' : ''}`} style={accentColor ? { '--sd-accent': accentColor } as React.CSSProperties : undefined}>
          {options.map(opt => opt.isHeader ? (
            <div key={opt.value} className="sd-group-header">{opt.label}</div>
          ) : (
            <div
              key={opt.value}
              className={`sd-item${opt.value === value ? ' selected' : ''}`}
              onClick={() => handleSelect(opt.value)}
              style={opt.color ? { color: opt.color } : undefined}
            >
              {opt.icon && <span className="sd-item-icon">{opt.icon}</span>}
              <span>{opt.label}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
