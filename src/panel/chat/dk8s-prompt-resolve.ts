/**
 * Resolving a dk8s prompt, with the user's edits applied.
 *
 * Separate from `dk8s-prompts.ts` because that file has to stay free of
 * imports: the webview's Prompt Library reads the same module through a Vite
 * alias so the library and the host cannot drift, and the moment it imports
 * anything from `../../storage` that arrangement stops working.
 *
 * So the data lives there and the lookup lives here.
 *
 * Why the lookup needs to exist at all: the Prompt Library lists these under
 * dk8s and lets them be edited, and an edit that the host ignores is worse
 * than not offering the edit. Overrides are stored under the same key the
 * webview sends, so `dk8s.heap.explain` edited in the library is
 * `dk8s.heap.explain` here.
 */
import { DK8S_PROMPTS, DK8S_USER_PROMPTS } from './dk8s-prompts';
import { getAiPromptTemplates } from '../../storage/db';

/**
 * An override only counts when it has content.
 *
 * The library writes back the whole template map, so a cleared editor box
 * arrives as an empty string — which is a box someone emptied, not an
 * instruction to send the model nothing.
 */
function override(key: string): string | undefined {
  const edited = getAiPromptTemplates()[key];
  return typeof edited === 'string' && edited.trim() ? edited : undefined;
}

/**
 * The system prompt — who the model is and how it must answer.
 *
 * Stored under `<key>.system`, matching the convention the Prompt Library uses
 * for every other entry (`askAiWhy` / `askAiWhy.system`). Getting this wrong
 * is not a cosmetic bug: the library showed the system text in its User tab
 * and an empty System tab, so what it displayed was not what was being sent.
 */
export function dk8sPrompt(key: string): string | undefined {
  return override(`${key}.system`) ?? DK8S_PROMPTS[key];
}

/** The user turn — the template the evidence is delivered in. */
export function dk8sUserPrompt(key: string): string | undefined {
  return override(key) ?? DK8S_USER_PROMPTS[key];
}
