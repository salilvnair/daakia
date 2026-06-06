import { useState } from 'react';
import { CopyIcon, CheckIcon } from '../../../icons';

interface CopyButtonProps {
  text: string;
  size?: number;
  title?: string;
  className?: string;
}

/**
 * Copy button with animated checkmark — toggles from CopyIcon to CheckIcon on click.
 */
export function CopyButton({ text, size = 14, title = 'Copy', className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copied!' : title}
      className={`w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors ${
        copied
          ? 'text-[var(--color-success)]'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
      } ${className}`}
    >
      {copied ? <CheckIcon size={size} /> : <CopyIcon size={size} />}
    </button>
  );
}
