interface CenterSlotProps {
  html: string;
}

export function CenterSlot({ html }: CenterSlotProps) {
  return (
    <div
      className="flex-1 h-full min-w-0"
      style={{ pointerEvents: 'none', userSelect: 'none' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
