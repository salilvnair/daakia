import { useMemo } from 'react';
import { cssVariables, type AppSeeds } from '../../../services/theme/palette';
import { PREVIEW_GROUND } from '../../../services/theme/preview-ground';

/**
 * What each kind of theme looks like, while it is being made.
 *
 * Both previews are drawn from the colours themselves rather than from the
 * app's current variables, so a palette being edited shows as itself rather
 * than as the theme you are already wearing.
 */

/**
 * A request, in the palette being built.
 *
 * Rendered through `cssVariables` — the same function that paints the app —
 * so the preview cannot disagree with the result. Drawing it from the seeds
 * by hand would be a second opinion about what a theme means, and the first
 * time the two differed the preview would be the one lying.
 */
export function AppThemePreview({ colours }: { colours: Record<string, string> }) {
  const style = useMemo(
    () => cssVariables(colours as unknown as AppSeeds) as React.CSSProperties,
    [colours],
  );

  return (
    <div
      style={{
        ...style,
        background: 'var(--color-panel)',
        border: '1px solid var(--color-surface-border)',
        borderRadius: 10,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* A tab strip, which is the largest area of ground anybody sees. */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{
          fontSize: 10.5, padding: '3px 9px', borderRadius: 6,
          background: 'var(--color-surface)', color: 'var(--color-text-primary)',
          border: '1px solid var(--color-surface-border)',
        }}>Untitled Request</span>
        <span style={{ fontSize: 10.5, padding: '3px 9px', color: 'var(--color-text-muted)' }}>Settings</span>
      </div>

      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5,
          color: 'var(--color-method-post, #f59e0b)',
          background: 'color-mix(in srgb, var(--color-method-post, #f59e0b) 14%, transparent)',
        }}>POST</span>
        <span style={{
          flex: 1, fontSize: 11, padding: '4px 9px', borderRadius: 6,
          fontFamily: 'var(--font-mono, monospace)',
          background: 'var(--color-input-bg)',
          border: '1px solid var(--color-input-border)',
          color: 'var(--color-input-text, var(--color-text-primary))',
        }}>https://api.example.com/orders</span>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '4px 12px', borderRadius: 6,
          background: 'var(--color-primary)', color: 'var(--color-btn-primary-text)',
        }}>Send</span>
      </div>

      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
        borderRadius: 7, padding: '8px 10px',
        display: 'flex', flexDirection: 'column', gap: 5,
        fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5,
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ color: 'var(--color-text-primary)', width: 100 }}>Authorization</span>
          <span style={{ color: 'var(--color-var-pill-text, #c084fc)' }}>{'{{bearer-token}}'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ color: 'var(--color-text-muted)', width: 100 }}>Content-Type</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>application/json</span>
        </div>
        {/* A hovered row, because hover is derived rather than chosen and is
            the first thing a badly seeded palette gets wrong. */}
        <div style={{
          display: 'flex', gap: 8, margin: '-2px -4px', padding: '2px 4px',
          borderRadius: 4, background: 'var(--color-surface-hover)',
        }}>
          <span style={{ color: 'var(--color-text-muted)', width: 100 }}>X-Request-Id</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>hovered row</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 10.5 }}>
        <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>200 OK</span>
        <span style={{ color: 'var(--color-warning)' }}>404</span>
        <span style={{ color: 'var(--color-error)' }}>500</span>
        <span style={{ color: 'var(--color-info)' }}>info</span>
        <span style={{ marginLeft: 'auto', color: 'var(--color-text-muted)' }}>142 ms · 1.2 KB</span>
      </div>
    </div>
  );
}

/**
 * A shell, in the palette being built.
 *
 * The same sample the terminal settings page shows — a listing, a warning and
 * a stack frame — because those are the three things whose colours anybody
 * actually cares about, and the sixteen ANSI slots are hard to judge as
 * sixteen squares.
 */
export function TerminalThemePreview({ colours }: { colours: Record<string, string> }) {
  const c = (key: string, fallback = 'inherit') => colours[key] ?? fallback;

  return (
    <div
      style={{
        background: c('background', isLight(c('foreground')) ? PREVIEW_GROUND.dark : PREVIEW_GROUND.light),
        border: '1px solid var(--color-surface-border)',
        borderRadius: 10,
        padding: '11px 13px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 11.5,
        lineHeight: 1.65,
        color: c('foreground'),
        whiteSpace: 'pre',
        overflowX: 'auto',
      }}
    >
      <div>
        <span style={{ color: c('brightGreen') }}>ubuntu@zp-config</span>
        <span style={{ color: c('foreground') }}>:</span>
        <span style={{ color: c('brightBlue') }}>/app</span>
        <span style={{ color: c('brightGreen') }}>$ </span>
        <span>ls -la</span>
      </div>
      <div>
        <span>drwxr-xr-x  2 ubuntu 4096 </span>
        <span style={{ color: c('brightBlue') }}>config</span>
      </div>
      <div>
        <span>lrwxrwxrwx  1 root     12 </span>
        <span style={{ color: c('brightCyan') }}>bin</span>
        <span> -&gt; usr/bin</span>
      </div>
      <div>
        <span>-rwxr-xr-x  1 root   5977 </span>
        <span style={{ color: c('green') }}>entrypoint.sh</span>
      </div>
      <div>
        <span style={{ color: c('yellow') }}>WARN </span>
        <span>connection pool at 90%</span>
      </div>
      <div>
        <span style={{ color: c('red') }}>ERROR </span>
        <span>java.net.SocketTimeoutException</span>
      </div>
      <div style={{ color: c('brightBlack') }}>  at com.zp.http.Client.call(Client.java:214)</div>
      <div>
        <span style={{ background: c('selectionBackground'), color: c('foreground') }}>selected text</span>
        <span style={{ background: c('cursor'), color: c('background', '#000'), marginLeft: 6 }}>&nbsp;</span>
      </div>
    </div>
  );
}

/**
 * A rough read on whether a foreground belongs on a light ground.
 *
 * A terminal palette carries no background of its own — it takes the panel's
 * — so the preview has to pick one, and picking the wrong one makes every
 * colour in it look broken.
 */
function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex?.trim() ?? '');
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55;
}
