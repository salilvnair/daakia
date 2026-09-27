/**
 * A row's copy-the-URL button. Each row keeps its own tick, so the row that
 * was pressed is the one that answers.
 */
import { IconButtonView } from '@salilvnair/dui';
import { useCopyTick, CopyGlyph } from '../../shared/CopyTick';

export function CopyUrlButton({ text, title, size = 12 }: { text: string; title: string; size?: number }) {
  const { copied, flash } = useCopyTick();
  return (
    <IconButtonView
      size="sm"
      icon={<CopyGlyph copied={copied} size={size} />}
      onClick={() => { void navigator.clipboard.writeText(text).then(flash); }}
      title={title}
    />
  );
}
