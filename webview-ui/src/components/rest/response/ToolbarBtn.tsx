export function ToolbarBtn({ children, title, active, onClick }: { children: React.ReactNode; title: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors ${
        active
          ? 'text-[var(--color-primary)] bg-[rgba(99,102,241,0.12)]'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)]'
      }`}
    >
      {children}
    </button>
  );
}
