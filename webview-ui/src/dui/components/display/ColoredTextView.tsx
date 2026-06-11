export interface ColorToken {
  text: string;
  color?: string;       // CSS color / variable — default: var(--color-text-primary)
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
  underline?: boolean;
  copyable?: boolean;   // click to copy this token's text
}

export interface ColoredTextViewProps {
  tokens: ColorToken[];
  fontSize?: string;
  lineHeight?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function ColoredTextView({
  tokens,
  fontSize = '12px',
  lineHeight = 1.6,
  className = '',
  style,
}: ColoredTextViewProps) {
  const handleCopy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  };

  return (
    <span className={className} style={{ fontSize, lineHeight, ...style }}>
      {tokens.map((t, i) => (
        <span
          key={i}
          onClick={t.copyable ? () => handleCopy(t.text) : undefined}
          title={t.copyable ? `Click to copy: ${t.text}` : undefined}
          style={{
            color: t.color ?? 'var(--color-text-primary)',
            fontWeight: t.bold ? 700 : undefined,
            fontStyle: t.italic ? 'italic' : undefined,
            fontFamily: t.mono ? 'monospace' : undefined,
            textDecoration: t.underline ? 'underline' : undefined,
            cursor: t.copyable ? 'pointer' : undefined,
          }}
        >
          {t.text}
        </span>
      ))}
    </span>
  );
}

// ─── Convenience: parse simple markup like <tag attr="val">text</tag> ──────────
// Usage: ColoredTextView.fromXml('<soap:Envelope xmlns:soap="...">')
// Returns a token array highlighting tag names, attributes, values differently.

export function parseXmlTokens(xml: string): ColorToken[] {
  const tokens: ColorToken[] = [];
  const re = /(<\/?)([\w:.-]+)((?:\s+[\w:.-]+="[^"]*")*)(\/?>)|([\w:.-]+="[^"]*")|(>)|([^<>"=\s]+)|(\s+)/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] !== undefined) {
      tokens.push({ text: m[1], color: 'var(--color-text-muted)', mono: true });
      tokens.push({ text: m[2], color: 'var(--color-protocol-soap)', mono: true, bold: true });
      if (m[3]) {
        // parse attributes
        m[3].trim().split(/\s+/).forEach(attr => {
          const [k, ...vParts] = attr.split('=');
          tokens.push({ text: ' ' + k, color: 'var(--color-info)', mono: true });
          if (vParts.length) tokens.push({ text: '=' + vParts.join('='), color: 'var(--color-success)', mono: true });
        });
      }
      tokens.push({ text: m[4], color: 'var(--color-text-muted)', mono: true });
    } else if (m[7]) {
      tokens.push({ text: m[7], color: 'var(--color-text-primary)' });
    } else if (m[8]) {
      tokens.push({ text: m[8] });
    }
  }
  return tokens;
}
