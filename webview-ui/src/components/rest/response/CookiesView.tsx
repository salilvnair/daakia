import type { ResponseCookie } from '../../../store/tabs-store';

export function CookiesView({ cookies }: { cookies: ResponseCookie[] }) {
  if (cookies.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[13px] text-[var(--color-text-muted)]">No cookies in response</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-[12px] text-[var(--color-primary)] font-medium">Response Cookies</span>
        <span className="text-[11px] text-[var(--color-text-muted)]">{cookies.length} cookie{cookies.length > 1 ? 's' : ''}</span>
      </div>

      <div className="px-4">
        {cookies.map((cookie, idx) => (
          <div key={`${cookie.name}-${idx}`} className="py-2.5 border-b border-[rgba(255,255,255,0.06)]">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{cookie.name}</span>
              <span className="text-[12px] text-[var(--color-text-secondary)] break-all flex-1">{cookie.value}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--color-text-muted)]">
              {cookie.domain && <span>Domain: <span className="text-[var(--color-text-secondary)]">{cookie.domain}</span></span>}
              {cookie.path && <span>Path: <span className="text-[var(--color-text-secondary)]">{cookie.path}</span></span>}
              {cookie.expires && <span>Expires: <span className="text-[var(--color-text-secondary)]">{cookie.expires}</span></span>}
              {cookie.sameSite && <span>SameSite: <span className="text-[var(--color-text-secondary)]">{cookie.sameSite}</span></span>}
              {cookie.httpOnly && <span className="px-1.5 py-0.5 rounded bg-[rgba(234,179,8,0.1)] text-[#eab308]">HttpOnly</span>}
              {cookie.secure && <span className="px-1.5 py-0.5 rounded bg-[rgba(34,197,94,0.1)] text-[#22c55e]">Secure</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
