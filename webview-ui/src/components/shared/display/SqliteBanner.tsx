import { postMsg } from '../../../vscode';
import { WarningTriangleIcon } from '../../../icons';

interface Props {
  sqliteOk: boolean;
  error?: string;
}

export function SqliteBanner({ sqliteOk, error }: Props) {
  if (sqliteOk) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[var(--color-warning)]/10 border-b border-[var(--color-warning)]/30">
      <WarningTriangleIcon size={16} className="text-[var(--color-warning)] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[var(--color-warning)]">
          SQLite unavailable — history and collections won't persist
        </p>
        {error && (
          <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">
            {error}
          </p>
        )}
      </div>
      <button
        type="button"
        className="px-2 py-1 text-[10px] font-medium rounded bg-[var(--color-warning)] text-black hover:bg-[var(--color-warning)]/80 cursor-pointer flex-shrink-0"
        onClick={() => postMsg({ type: 'rebuildSqlite' })}
      >
        Rebuild SQLite
      </button>
    </div>
  );
}
