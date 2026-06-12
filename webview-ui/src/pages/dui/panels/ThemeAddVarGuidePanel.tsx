import { ChipView, CodeBlockView } from '../../../dui';

// ─── Guide step component ─────────────────────────────────────────────────────

interface StepCardProps {
  step: number;
  title: string;
  tag: string;
  tagColor: string;
  children: React.ReactNode;
}

function StepCard({ step, title, tag, tagColor, children }: StepCardProps) {
  return (
    <div style={{
      border: `1px solid color-mix(in srgb, ${tagColor} 25%, var(--color-surface-border))`,
      borderLeft: `3px solid ${tagColor}`,
      borderRadius: 10,
      background: 'var(--color-surface)',
      marginBottom: 20,
      overflow: 'hidden',
    }}>
      {/* Step header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 16px',
        borderBottom: `1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)`,
        background: `color-mix(in srgb, ${tagColor} 5%, transparent)`,
      }}>
        <div style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: tagColor,
          color: 'var(--color-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 800,
          flexShrink: 0,
        }}>
          {step}
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', flex: 1 }}>
          {title}
        </span>
        <ChipView label={tag} color={tagColor} size="xs" active />
      </div>
      {/* Step body */}
      <div style={{ padding: '14px 16px' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: 'var(--color-text-muted)',
      marginBottom: 6,
      marginTop: 14,
    }}>
      {label}
    </div>
  );
}

// ─── Body text ────────────────────────────────────────────────────────────────

function Body({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{
      margin: '0 0 10px',
      fontSize: 12,
      lineHeight: 1.7,
      color: 'var(--color-text-secondary)',
      ...style,
    }}>
      {children}
    </p>
  );
}

// ─── Inline code span ─────────────────────────────────────────────────────────

function Code({ children }: { children: string }) {
  return (
    <code style={{
      fontSize: 11,
      fontFamily: 'monospace',
      background: 'color-mix(in srgb, var(--color-surface-border) 60%, transparent)',
      color: 'var(--color-primary)',
      padding: '1px 5px',
      borderRadius: 4,
    }}>
      {children}
    </code>
  );
}

// ─── Hint box ─────────────────────────────────────────────────────────────────

function HintBox({ color, icon, children }: { color: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      gap: 10,
      padding: '10px 12px',
      background: `color-mix(in srgb, ${color} 8%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 22%, transparent)`,
      borderRadius: 8,
      marginTop: 10,
      marginBottom: 4,
    }}>
      <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1.5 }}>{icon}</span>
      <div style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Color swatch preview ─────────────────────────────────────────────────────

function SwatchRow({ items }: { items: { label: string; color: string; note?: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8, marginBottom: 4 }}>
      {items.map(({ label, color, note }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 20,
            height: 20,
            borderRadius: 5,
            background: color,
            border: '1px solid color-mix(in srgb, var(--color-surface-border) 80%, transparent)',
            flexShrink: 0,
          }} />
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-primary)', fontWeight: 600 }}>{label}</div>
            {note && <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{note}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Code snippets ────────────────────────────────────────────────────────────

const CODE_SCHEMA_INTERFACE = `// webview-ui/src/dui/theme/core.ts

export interface ThemeSchemaEntry {
  group:   string;  // Category in Theme editor (e.g. "brand", "status")
  key:     string;  // YAML export/import key (e.g. "my_highlight")
  cssVar:  string;  // CSS custom property name (e.g. "--color-my-highlight")
  comment: string;  // Tooltip description in the editor
}`;

const CODE_SCHEMA_ADD = `// webview-ui/src/dui/theme/core.ts

export const SCHEMA: ThemeSchemaEntry[] = [
  // ... existing entries ...

  // ✅ Add your new entry at the end of the relevant group:
  {
    group:   'brand',
    key:     'my_highlight',
    cssVar:  '--color-my-highlight',
    comment: 'Custom highlight color for featured elements',
  },
];`;

const CODE_CSS_VAR = `/* webview-ui/src/index.css — inside the @theme block */

@theme {
  /* ... existing vars ... */

  /* ✅ Add your new CSS custom property with a default value: */
  --color-my-highlight: #a78bfa;
}`;

const CODE_LIGHT_DARK_BLOCK = `/* webview-ui/src/index.css — optional light theme override */

[data-theme="light"] {
  /* ✅ Override for light mode (darker shade for contrast): */
  --color-my-highlight: #7c3aed;
}`;

const CODE_PALETTE = `// webview-ui/src/colors/daakia-colors.ts  (optional — for JS usage)

export const palette = {
  // ... existing entries ...

  // ✅ Add a semantic pair for light + dark:
  myHighlight: { light: '#7c3aed', dark: '#a78bfa' },
};

// Then in resolveColors() if you need it in JS:
export function resolveColors() {
  return {
    // ...
    myHighlight: themed(palette.myHighlight),
  };
}`;

const CODE_USE_INLINE = `// Inline style in any .tsx file:
<div style={{ color: 'var(--color-my-highlight)' }}>
  Highlighted text
</div>

// With a DUI chip:
<ChipView
  label="Featured"
  color="var(--color-my-highlight)"
  active
/>

// With ButtonView accentColor:
<ButtonView
  label="Highlight Action"
  accentColor="var(--color-my-highlight)"
  variant="primary"
/>`;

const CODE_USE_CSS = `/* In a .css or .module.css file: */
.my-card {
  border-left: 3px solid var(--color-my-highlight);
  background: color-mix(in srgb, var(--color-my-highlight) 8%, transparent);
}

/* With Tailwind v4 arbitrary values: */
<span className="text-[var(--color-my-highlight)] font-semibold">
  Featured Label
</span>`;

const CODE_LIVE_CUSTOMIZER = `// Wire it into LiveColorCustomizer for on-the-fly editing:
<LiveColorCustomizer
  vars={[
    {
      cssVar:   '--color-my-highlight',
      yamlKey:  'brand.my_highlight',   // must match SCHEMA group.key
      label:    'My Highlight',
    },
  ]}
/>`;

// ─── Main panel ───────────────────────────────────────────────────────────────

export function ThemeAddVarGuidePanel() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '4px 0 40px' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        marginBottom: 28,
        padding: '18px 20px',
        background: 'color-mix(in srgb, var(--color-primary) 6%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-primary) 18%, var(--color-surface-border))',
        borderRadius: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <ChipView label="Guide" color="var(--color-primary)" active size="sm" />
          <ChipView label="Theme System" color="var(--color-info)" size="sm" />
          <ChipView label="4 Steps" color="var(--color-success)" size="sm" />
        </div>
        <h2 style={{
          margin: '0 0 8px',
          fontSize: 18,
          fontWeight: 800,
          color: 'var(--color-text-primary)',
          letterSpacing: '-0.01em',
        }}>
          How to add a new theme variable
        </h2>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.7, color: 'var(--color-text-secondary)' }}>
          Daakia's theme system is built on CSS custom properties (CSS variables). Every color in the UI
          is a <Code>var(--color-*)</Code> token — no hardcoded hex anywhere.
          Adding a new variable takes four steps: register it in the schema, declare its default value,
          use it in a component, and optionally test it in the live editor.
        </p>
      </div>

      {/* ── Flow overview ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        marginBottom: 28,
        flexWrap: 'wrap',
      }}>
        {[
          { n: '1', label: 'Register in SCHEMA',   color: 'var(--color-primary)' },
          { n: '2', label: 'Declare CSS var',       color: 'var(--color-info)' },
          { n: '3', label: 'Use in component',      color: 'var(--color-success)' },
          { n: '4', label: 'Test live',             color: 'var(--color-warning)' },
        ].map((s, i, arr) => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 14px',
              background: `color-mix(in srgb, ${s.color} 10%, var(--color-surface))`,
              border: `1px solid color-mix(in srgb, ${s.color} 28%, var(--color-surface-border))`,
              borderRadius: 8,
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: s.color, color: 'var(--color-surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 800, flexShrink: 0,
              }}>
                {s.n}
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
                {s.label}
              </span>
            </div>
            {i < arr.length - 1 && (
              <div style={{
                width: 24, height: 1,
                background: 'var(--color-surface-border)',
                flexShrink: 0,
              }} />
            )}
          </div>
        ))}
      </div>

      {/* ── Step 1 ─────────────────────────────────────────────────────────── */}
      <StepCard
        step={1}
        title="Register in SCHEMA — theme/core.ts"
        tag="TypeScript"
        tagColor="var(--color-primary)"
      >
        <Body>
          The <Code>SCHEMA</Code> array in <Code>webview-ui/src/dui/theme/core.ts</Code> is the
          registry of every CSS variable that the Theme Customization editor knows about. Each entry
          is a <Code>ThemeSchemaEntry</Code> object with four fields.
        </Body>

        <SectionLabel label="The interface" />
        <CodeBlockView language="typescript" code={CODE_SCHEMA_INTERFACE} showCopy />

        <SectionLabel label="Add your entry" />
        <Body>
          Pick a <Code>group</Code> that matches where your color belongs logically. Existing groups
          include: <Code>brand</Code>, <Code>surface</Code>, <Code>panel</Code>, <Code>text</Code>,{' '}
          <Code>status</Code>, <Code>protocols</Code>, <Code>component_button</Code>, and more.
          Create a new group name if none fits — it becomes its own section header in the editor.
        </Body>
        <CodeBlockView language="typescript" code={CODE_SCHEMA_ADD} showCopy />

        <HintBox color="var(--color-primary)" icon="💡">
          The <strong>key</strong> becomes the YAML path on export (e.g.{' '}
          <Code>brand.my_highlight: "#a78bfa"</Code>). Keep it snake_case, dot-free.
          The <strong>cssVar</strong> must start with <Code>--color-</Code> to match the convention.
        </HintBox>
      </StepCard>

      {/* ── Step 2 ─────────────────────────────────────────────────────────── */}
      <StepCard
        step={2}
        title="Declare the CSS variable — index.css"
        tag="CSS"
        tagColor="var(--color-info)"
      >
        <Body>
          CSS variables in Daakia are declared in <Code>webview-ui/src/index.css</Code> inside the{' '}
          <Code>@theme</Code> block (Tailwind v4 syntax). This sets the default value —
          what every component sees when no runtime theme override is active.
        </Body>

        <SectionLabel label="Add to @theme block" />
        <CodeBlockView language="css" code={CODE_CSS_VAR} showCopy />

        <SectionLabel label="Optional — light mode override" />
        <Body>
          If your variable needs a different shade in light mode, add a{' '}
          <Code>[data-theme="light"]</Code> block below the <Code>@theme</Code> declaration.
        </Body>
        <CodeBlockView language="css" code={CODE_LIGHT_DARK_BLOCK} showCopy />

        <SwatchRow items={[
          { label: 'Dark value',  color: '#a78bfa', note: '--color-my-highlight (dark)' },
          { label: 'Light value', color: '#7c3aed', note: '--color-my-highlight (light)' },
        ]} />

        <SectionLabel label="Optional — JS usage via daakia-colors.ts" />
        <Body>
          If you need the color value in TypeScript (e.g. for canvas drawing or third-party charts
          that don't support CSS vars), add it to the <Code>palette</Code> object too.
          Components that only use inline <Code>style</Code> attributes or CSS files don't need this.
        </Body>
        <CodeBlockView language="typescript" code={CODE_PALETTE} showCopy />

        <HintBox color="var(--color-info)" icon="ℹ️">
          Most DUI components already accept <Code>color</Code> or <Code>accentColor</Code> as a CSS
          variable string like <Code>"var(--color-my-highlight)"</Code> — no JS color resolution needed.
          Only add to <Code>daakia-colors.ts</Code> when you truly need a resolved hex string at runtime.
        </HintBox>
      </StepCard>

      {/* ── Step 3 ─────────────────────────────────────────────────────────── */}
      <StepCard
        step={3}
        title="Use the variable in any DUI component"
        tag="React"
        tagColor="var(--color-success)"
      >
        <Body>
          Once the CSS variable is declared, use it anywhere via the <Code>var(--color-my-highlight)</Code>{' '}
          syntax. No import required — CSS variables cascade to all children automatically.
        </Body>

        <SectionLabel label="Inline styles and DUI component props" />
        <CodeBlockView language="tsx" code={CODE_USE_INLINE} showCopy />

        <SectionLabel label="CSS files and Tailwind arbitrary values" />
        <CodeBlockView language="css" code={CODE_USE_CSS} showCopy />

        <HintBox color="var(--color-error)" icon="🚫">
          <strong>Rule:</strong> NEVER write a hardcoded hex value like <Code>#a78bfa</Code> in a{' '}
          <Code>.tsx</Code> file. Always use <Code>var(--color-my-highlight)</Code> or import from{' '}
          <Code>daakia-colors.ts</Code>. This is enforced by project convention — violations must
          be fixed immediately.
        </HintBox>

        <SectionLabel label="Live example with current theme" />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          <ChipView label="var(--color-primary)"  color="var(--color-primary)"  active size="sm" />
          <ChipView label="var(--color-success)"  color="var(--color-success)"  active size="sm" />
          <ChipView label="var(--color-warning)"  color="var(--color-warning)"  active size="sm" />
          <ChipView label="var(--color-error)"    color="var(--color-error)"    active size="sm" />
          <ChipView label="var(--color-info)"     color="var(--color-info)"     active size="sm" />
          <ChipView label="var(--color-protocol-rest)"    color="var(--color-protocol-rest)"    size="sm" />
          <ChipView label="var(--color-protocol-graphql)" color="var(--color-protocol-graphql)" size="sm" />
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>
          These chips render with the current CSS var values — switch the theme toggle to see them update live.
        </p>
      </StepCard>

      {/* ── Step 4 ─────────────────────────────────────────────────────────── */}
      <StepCard
        step={4}
        title="Test it in the Theme Customization panel"
        tag="Live Preview"
        tagColor="var(--color-warning)"
      >
        <Body>
          Because you registered the variable in <Code>SCHEMA</Code>, it will automatically appear
          in the <strong>Theme Customization</strong> panel (Settings → DUI Showcase → Theme Customization).
          The panel groups entries by their <Code>group</Code> field and shows a clickable color tile
          for each one. Click any tile to open the color picker and test your color live — no rebuild needed.
        </Body>

        <SectionLabel label="What you'll see in the editor" />
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          marginBottom: 12,
        }}>
          {[
            { label: 'Group header',    desc: '"brand" → collapsible section',    color: 'var(--color-primary)' },
            { label: 'Color tile',      desc: 'Click to open color picker',        color: 'var(--color-info)' },
            { label: 'YAML key chip',   desc: 'brand.my_highlight shown below',    color: 'var(--color-success)' },
          ].map(({ label, desc, color }) => (
            <div key={label} style={{
              padding: '10px 12px',
              background: `color-mix(in srgb, ${color} 7%, var(--color-surface))`,
              border: `1px solid color-mix(in srgb, ${color} 20%, var(--color-surface-border))`,
              borderRadius: 8,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>{desc}</div>
            </div>
          ))}
        </div>

        <SectionLabel label="Wire into LiveColorCustomizer (optional)" />
        <Body>
          If you want a focused editing panel for just your new variable (e.g. in a custom settings page),
          use <Code>LiveColorCustomizer</Code> directly. Pass the same <Code>cssVar</Code> and <Code>yamlKey</Code>{' '}
          from your SCHEMA entry.
        </Body>
        <CodeBlockView language="tsx" code={CODE_LIVE_CUSTOMIZER} showCopy />

        <HintBox color="var(--color-warning)" icon="✨">
          Changes made in the Theme editor or LiveColorCustomizer are applied via{' '}
          <Code>document.documentElement.style.setProperty()</Code> and persist for the session.
          Use <strong>Export YAML</strong> to save your theme and <strong>Upload YAML</strong> to restore it.
          The YAML key will be <Code>brand.my_highlight</Code> (matching your group + key from SCHEMA).
        </HintBox>
      </StepCard>

      {/* ── Quick reference ─────────────────────────────────────────────────── */}
      <div style={{
        padding: '16px 18px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
        borderRadius: 10,
      }}>
        <div style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
          marginBottom: 12,
        }}>
          Quick reference — files to touch
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { file: 'webview-ui/src/dui/theme/core.ts',   purpose: 'Register ThemeSchemaEntry in SCHEMA array',        required: true,  color: 'var(--color-primary)' },
            { file: 'webview-ui/src/index.css',            purpose: 'Declare CSS variable in @theme block',              required: true,  color: 'var(--color-info)' },
            { file: 'webview-ui/src/colors/daakia-colors.ts', purpose: 'Add palette pair for JS usage (light/dark hex)',  required: false, color: 'var(--color-text-muted)' },
          ].map(({ file, purpose, required, color }) => (
            <div key={file} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '9px 12px',
              background: 'color-mix(in srgb, var(--color-surface-border) 30%, transparent)',
              borderRadius: 7,
            }}>
              <ChipView
                label={required ? 'Required' : 'Optional'}
                color={required ? 'var(--color-success)' : color}
                size="xs"
                active={required}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-primary)', fontWeight: 600, marginBottom: 2 }}>
                  {file}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{purpose}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
