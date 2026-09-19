/**
 * Not calling a template a syntax error.
 *
 * ── The complaint ──
 *
 * `"n": {{randomInt 1 9}}` is a perfectly good Daakia body and is not valid
 * JSON, so Monaco's JSON service underlines it in red. Two markers, and only
 * one of them is where you would expect:
 *
 *   line 4, col 9   Property expected.      ← inside the template
 *   line 5, col 1   End of file expected.   ← the closing brace of the object
 *
 * The second is the interesting one. Once the parse goes off the rails at a
 * template, everything after it is suspect, so filtering markers that overlap
 * a `{{…}}` range — the obvious fix — leaves a red squiggle under a brace
 * that has nothing wrong with it.
 *
 * ── What this does instead ──
 *
 * It asks a different question: *would this be valid JSON if the templates
 * had already been resolved?* Each `{{…}}` is replaced with digits of exactly
 * the same length, which is valid both inside a string (`"{{host}}/a"`) and
 * bare in a value position (`"n": {{randomInt 1 9}}`), and the result is run
 * through `JSON.parse`.
 *
 * If it parses, every error marker is an artifact of the templates and they
 * all go. If it does not, the body has a real problem — a missing comma, an
 * unclosed brace — and the markers are left exactly as the language service
 * reported them, positions and all. Nothing is invented and nothing correct
 * is hidden.
 *
 * Warnings are never touched. A schema complaint is about meaning rather than
 * syntax, and a template is not why it fired.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const VAR = /\{\{[^{}\n]*\}\}/g;
const SEVERITY_ERROR = 8;
const JSON_LANGUAGES = new Set(['json', 'jsonc']);
const INSTALLED = '__daakiaVarMarkerFilter';

/**
 * The same text with every template standing in as a number.
 *
 * Digits rather than a quoted string, and the same length rather than a fixed
 * token. Same length because nothing else has to move; digits because a bare
 * `{{x}}` in a value position has to become something JSON accepts unquoted,
 * and one inside a string has to not close it.
 */
export function sanitiseTemplates(text: string): string {
  return text.replace(VAR, m => '1'.repeat(m.length));
}

/** Would this be valid JSON once the templates were values? */
export function parsesWithoutTemplates(text: string): boolean {
  try {
    JSON.parse(sanitiseTemplates(text));
    return true;
  } catch {
    return false;
  }
}

export function installVarMarkerFilter(monaco: any): void {
  if (!monaco?.editor?.onDidChangeMarkers) return;
  const w = window as any;
  if (w[INSTALLED]) return;
  w[INSTALLED] = true;

  monaco.editor.onDidChangeMarkers((resources: any[]) => {
    for (const resource of resources) {
      const model = monaco.editor.getModel(resource);
      if (!model || !JSON_LANGUAGES.has(model.getLanguageId())) continue;

      const text: string = model.getValue();
      if (!text.includes('{{')) continue;
      if (!parsesWithoutTemplates(text)) continue;

      const markers = monaco.editor.getModelMarkers({ resource });
      const keep = markers.filter((m: any) => m.severity !== SEVERITY_ERROR);
      /*
        Only write when something actually changes. Setting markers fires this
        same event, and a version that always wrote would answer its own
        notification forever.
      */
      if (keep.length === markers.length) continue;

      for (const owner of new Set(markers.map((m: any) => m.owner))) {
        monaco.editor.setModelMarkers(
          model, owner as string, keep.filter((m: any) => m.owner === owner),
        );
      }
    }
  });
}
