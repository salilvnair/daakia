interface LeftNavSlotProps {
  html: string;
}

export function LeftNavSlot({ html }: LeftNavSlotProps) {
  return (
    <div
      className="flex-shrink-0 h-full"
      style={{ pointerEvents: 'none', userSelect: 'none' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
