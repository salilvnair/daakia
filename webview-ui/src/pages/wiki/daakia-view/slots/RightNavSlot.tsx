interface RightNavSlotProps {
  html: string;
}

export function RightNavSlot({ html }: RightNavSlotProps) {
  return (
    <div
      className="flex-shrink-0 h-full"
      style={{ pointerEvents: 'none', userSelect: 'none' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
