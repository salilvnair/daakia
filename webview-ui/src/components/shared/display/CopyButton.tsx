import { copyText } from '../../../utils/clipboard';
import { useCopyTick, CopyGlyph } from '../CopyTick';

interface CopyButtonProps {
  text: string;
  size?: number;
  title?: string;
  className?: string;
}

/**
 * Copy button — its glyph turns into the shared green tick once it has copied.
 */
export function CopyButton({ text, size = 14, title = 'Copy', className = '' }: CopyButtonProps) {
  const { copied, flash } = useCopyTick();

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (await copyText(text)) flash();
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
      <CopyGlyph copied={copied} size={size} />
    </button>
  );
}
