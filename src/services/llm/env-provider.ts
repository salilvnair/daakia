/**
 * Provider credentials a developer put in the environment.
 *
 * The OS keychain is where Daakia keeps a key somebody typed into Settings,
 * and it stays the first place looked. This is the second: a key already
 * exported in the shell, or in the `.env` the local dev server loads — so a
 * developer running Daakia against their own account does not have to paste
 * the same key into a settings screen every time the database is reset.
 *
 * Values are trimmed. A `.env` edited by hand picks up tabs and trailing
 * spaces, and `\tdeepseek-flash` is not a model any provider has heard of.
 *
 * Nothing here is ever logged or sent to the webview: the key goes from the
 * environment into the request's auth header on the host, and nowhere else.
 */

const VARS: Record<string, { key: string; url?: string; model?: string }> = {
  deepseek: { key: 'DEEPSEEK_API_KEY', url: 'DEEPSEEK_API_URL', model: 'DEEPSEEK_MODEL' },
  openai: { key: 'OPENAI_API_KEY', url: 'OPENAI_API_URL', model: 'OPENAI_MODEL' },
  anthropic: { key: 'ANTHROPIC_API_KEY', model: 'ANTHROPIC_MODEL' },
  google: { key: 'GEMINI_API_KEY', model: 'GEMINI_MODEL' },
  groq: { key: 'GROQ_API_KEY', model: 'GROQ_MODEL' },
  mistral: { key: 'MISTRAL_API_KEY', model: 'MISTRAL_MODEL' },
  together: { key: 'TOGETHER_API_KEY', model: 'TOGETHER_MODEL' },
  xai: { key: 'XAI_API_KEY', model: 'XAI_MODEL' },
};

function read(name: string | undefined, env: NodeJS.ProcessEnv): string | undefined {
  if (!name) return undefined;
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export function envKey(providerId: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return read(VARS[providerId]?.key, env);
}

export function envBaseUrl(providerId: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return read(VARS[providerId]?.url, env)?.replace(/\/+$/, '');
}

export function envModel(providerId: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return read(VARS[providerId]?.model, env);
}

/**
 * Parse a `.env` file's text into variables.
 *
 * `KEY=value`, one per line; `#` comments and blank lines skipped; one layer
 * of matching quotes removed; whitespace around the value trimmed. No
 * interpolation and no multi-line values — a key file does not need them, and
 * a parser that does less has less to get wrong about a secret.
 */
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) out[key] = value;
  }
  return out;
}

/**
 * Load a `.env` into `process.env` without overriding anything already set.
 *
 * What is already in the environment wins: an exported variable is a
 * deliberate choice for this run, and a file on disk should not quietly
 * replace it.
 */
export function loadDotEnv(text: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const loaded: string[] = [];
  for (const [key, value] of Object.entries(parseDotEnv(text))) {
    if (env[key] === undefined) {
      env[key] = value;
      loaded.push(key);
    }
  }
  return loaded;
}
