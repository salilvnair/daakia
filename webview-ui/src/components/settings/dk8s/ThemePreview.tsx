/**
 * A palette shown as the thing it will be, not as a row of squares.
 *
 * Sixteen swatches tell you a theme has a green in it. They do not tell you
 * whether a directory listing is readable, which is the only question anyone
 * actually has — so this draws the listing: the prompt, a command, the colours
 * `ls` reaches for, an error in red, and the muted grey that carries most of a
 * terminal's text.
 *
 * It draws on the panel's own ground for the same reason the terminal does.
 * A preview against the theme's own background would look right and then be
 * wrong in place, which is worse than no preview.
 */
import { resolveTerminalTheme, groundMode, type TerminalPalette } from '@salilvnair/dui';

/**
 * The sample, written once.
 *
 * Real-looking output rather than lorem: the point of a preview is to answer
 * "can I read this", and that needs the mix a listing actually has — long
 * runs of muted text with a few saturated tokens in it.
 */
const LINES: { color: keyof ReturnType<typeof cols>; text: string }[][] = [
  [{ color: 'brightGreen', text: 'ubuntu@zp-config' }, { color: 'foreground', text: ':' },
    { color: 'brightBlue', text: '/app' }, { color: 'foreground', text: '$ ' },
    { color: 'brightWhite', text: 'ls -la' }],
  [{ color: 'foreground', text: 'drwxr-xr-x  2 ubuntu 4096 ' }, { color: 'brightBlue', text: 'config' }],
  [{ color: 'foreground', text: 'lrwxrwxrwx  1 root    12 ' }, { color: 'brightCyan', text: 'bin -> usr/bin' }],
  [{ color: 'foreground', text: '-rwxr-xr-x  1 root  5977 ' }, { color: 'brightGreen', text: 'entrypoint.sh' }],
  [{ color: 'foreground', text: '-rw-r--r--  1 ubuntu  812 ' }, { color: 'white', text: 'application.yml' }],
  [{ color: 'brightYellow', text: 'WARN ' }, { color: 'foreground', text: 'connection pool at 90%' }],
  [{ color: 'brightRed', text: 'ERROR' }, { color: 'foreground', text: ' java.net.SocketTimeoutException' }],
  [{ color: 'brightBlack', text: '  at com.zp.http.Client.call(Client.java:214)' }],
];

function cols(theme: Record<string, string>) { return theme; }

export function ThemePreview({ palette, background, rows = LINES.length, style }: {
  palette: TerminalPalette;
  background: string;
  /** Fewer lines for the inline previews in the list. */
  rows?: number;
  style?: React.CSSProperties;
}) {
  const theme = resolveTerminalTheme(palette, groundMode(background), background);
  return (
    <div
      className="font-mono overflow-hidden"
      style={{
        background: theme.background,
        color: theme.foreground,
        fontSize: 10.5,
        lineHeight: '15px',
        padding: '8px 10px',
        borderRadius: 4,
        border: '1px solid var(--color-surface-border)',
        whiteSpace: 'pre',
        ...style,
      }}
    >
      {LINES.slice(0, rows).map((line, i) => (
        <div key={i}>
          {line.map((run, j) => (
            <span key={j} style={{ color: theme[run.color as string] ?? theme.foreground }}>
              {run.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
