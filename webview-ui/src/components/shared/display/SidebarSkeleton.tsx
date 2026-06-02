/**
 * SidebarSkeleton — elegant shimmer loading animation for first-time sidebar data load.
 * Shows subtle animated bars that fade in/out in a wave pattern.
 */

export function SidebarSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 px-3 py-3 animate-[fadeIn_200ms_ease-out]">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          {/* Icon placeholder */}
          <div
            className="w-[16px] h-[16px] rounded bg-[rgba(255,255,255,0.06)] sidebar-shimmer"
            style={{ animationDelay: `${i * 120}ms` }}
          />
          {/* Text placeholder */}
          <div
            className="h-[10px] rounded-sm bg-[rgba(255,255,255,0.06)] sidebar-shimmer"
            style={{
              width: `${45 + Math.sin(i * 1.5) * 25}%`,
              animationDelay: `${i * 120 + 60}ms`,
            }}
          />
        </div>
      ))}
    </div>
  );
}
