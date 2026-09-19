/**
 * A theme from the editor you already configured.
 *
 * A webview inherits the host's theme as CSS variables — a few hundred of
 * them, `--vscode-editor-background` and its friends. Daakia reads three
 * today, for fonts and the selection colour, and ignores the rest. Eleven of
 * them are a whole palette, which makes "match my editor" a real theme with
 * nothing typed, for any of the thousands on the marketplace.
 *
 * ── Where it is not available ──
 *
 * The browser dev server has no host, so none of these exist. That is not an
 * error to report — it is a button that should not be offered — so this
 * returns null and the settings page leaves it out rather than showing
 * something that produces a grey nothing when pressed.
 */
import { SEED_KEYS, type AppSeeds } from './palette';
import { parseHex, isDarkColour, mix } from './colour';

/** In order of preference: the first one the host actually defines wins. */
const FROM: Record<keyof AppSeeds, string[]> = {
  ground: ['--vscode-sideBar-background', '--vscode-editorGroupHeader-tabsBackground'],
  surface: ['--vscode-editor-background'],
  border: ['--vscode-panel-border', '--vscode-editorGroup-border', '--vscode-widget-border'],
  text: ['--vscode-foreground', '--vscode-editor-foreground'],
  muted: ['--vscode-descriptionForeground', '--vscode-disabledForeground'],
  inputBg: ['--vscode-input-background'],
  inputBorder: ['--vscode-input-border', '--vscode-dropdown-border'],
  inputText: ['--vscode-input-foreground'],
  accent: ['--vscode-focusBorder', '--vscode-button-background', '--vscode-textLink-foreground'],
  success: ['--vscode-testing-iconPassed', '--vscode-charts-green', '--vscode-terminal-ansiGreen'],
  warning: ['--vscode-editorWarning-foreground', '--vscode-charts-yellow', '--vscode-terminal-ansiYellow'],
  error: ['--vscode-errorForeground', '--vscode-editorError-foreground', '--vscode-terminal-ansiRed'],
  info: ['--vscode-editorInfo-foreground', '--vscode-charts-blue', '--vscode-terminal-ansiBlue'],
};

function read(names: string[], style: CSSStyleDeclaration): string | null {
  for (const name of names) {
    const raw = style.getPropertyValue(name).trim();
    /*
      Hex only, and VS Code hands out eight-digit hex for anything with an
      alpha. The alpha is dropped rather than the value: a seed with
      transparency in it would make every colour derived from it translucent,
      and a theme you can see through is not what anybody meant.
    */
    if (/^#[0-9a-f]{8}$/i.test(raw)) return raw.slice(0, 7).toLowerCase();
    if (parseHex(raw)) return raw.toLowerCase();
  }
  return null;
}

/** Is there a host theme to read at all? */
export function hostThemeAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  const style = getComputedStyle(document.documentElement);
  return !!read(FROM.surface, style) && !!read(FROM.text, style);
}

/**
 * The seeds the host theme implies, or null when there is no host.
 *
 * Anything the host leaves undefined is filled from the two it is required
 * to have — a background and a foreground — rather than from Daakia's own
 * palette, so the result is one coherent theme instead of a blend of two.
 */
export function seedsFromHost(): AppSeeds | null {
  if (typeof document === 'undefined') return null;
  const style = getComputedStyle(document.documentElement);

  const surface = read(FROM.surface, style);
  const text = read(FROM.text, style);
  if (!surface || !text) return null;

  const onDark = isDarkColour(surface);
  const fallback: Record<keyof AppSeeds, string> = {
    ground: mix(surface, text, onDark ? 0.96 : 0.94),
    surface,
    border: mix(text, surface, 0.22),
    text,
    muted: mix(text, surface, 0.55),
    inputBg: mix(surface, text, onDark ? 0.94 : 0.98),
    inputBorder: mix(text, surface, 0.22),
    inputText: text,
    accent: mix(text, surface, 0.7),
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  };

  const seeds = {} as AppSeeds;
  for (const key of SEED_KEYS) {
    seeds[key] = read(FROM[key], style) ?? fallback[key];
  }
  return seeds;
}
