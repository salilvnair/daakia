/**
 * SearchInput — URL-bar-style input with optional prefix and suffix icon slots.
 *
 * Usage:
 *   <SearchInput
 *     value={q} onChange={setQ}
 *     placeholder="Search..."
 *     prefix={<SearchIcon size={11} />}
 *     suffix={q ? <button onClick={() => setQ('')}><XIcon size={10} /></button> : null}
 *   />
 */
import type { ReactNode, InputHTMLAttributes } from 'react';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'prefix'> {
  value: string;
  onChange: (value: string) => void;
  /** Icon/node shown at the left end inside the input bar */
  prefix?: ReactNode;
  /** Icon/node shown at the right end inside the input bar */
  suffix?: ReactNode;
  /** Height in px — defaults to 28 */
  height?: number;
}

export function SearchInput({
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  height = 28,
  className,
  ...rest
}: SearchInputProps) {
  return (
    <div
      className={`flex items-center gap-1.5 flex-1 rounded-md border transition-colors ${className ?? ''}`}
      style={{
        height,
        paddingLeft: 8,
        paddingRight: suffix ? 4 : 8,
        background: 'rgba(255,255,255,0.04)',
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    >
      {prefix && (
        <span className="flex items-center shrink-0 text-[var(--color-text-muted)]">
          {prefix}
        </span>
      )}
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent border-none outline-none text-[11px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
        {...rest}
      />
      {suffix && (
        <span className="flex items-center shrink-0 text-[var(--color-text-muted)]">
          {suffix}
        </span>
      )}
    </div>
  );
}
