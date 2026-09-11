/**
 * An AI call that failed, said out loud.
 *
 * Thirty-seven components listen for `ai:error` and each decides for itself
 * whether to show anything. Which means whether a failure is visible depends
 * on which feature you pressed: the workspace documentation generator showed
 * nothing at all, so "Generate with AI" against a provider that is not signed
 * in looked exactly like "Generate with AI" that worked — and the reason was
 * sitting in the audit the whole time.
 *
 * This is the floor. A component that draws its own inline error still does;
 * this only guarantees that nothing fails in silence.
 *
 * ── Not once per error, once per problem ──
 *
 * A tool-calling run can fail its way through several iterations and emit the
 * same 503 each time, and an agent workflow fans out across features. Five
 * identical toasts say nothing the first one did not, so the same message is
 * collapsed for a few seconds.
 */
import { useToastStore } from '../store/toast-store';

/** How long the same failure stays collapsed. */
export const REPEAT_MS = 6000;

const recent = new Map<string, number>();

/** Exported for the test, and for a screen that wants a clean slate. */
export function resetAiFailures(): void {
  recent.clear();
}

/**
 * What the toast says.
 *
 * The feature first, because the reader pressed a button and wants to know
 * which one broke — a bare "503" beside four AI buttons is a guess. The
 * provider's own words second, trimmed: these can be a paragraph of JSON and a
 * toast is one line.
 */
export function failureMessage(feature: string, message?: unknown, code?: unknown): string {
  const said = typeof message === 'string' ? message.trim() : '';
  const status = typeof code === 'string' || typeof code === 'number' ? String(code) : '';
  const detail = said || (status ? `The provider answered ${status}.` : 'No reason was given.');
  return `${feature} failed — ${trim(detail)}`;
}

function trim(text: string, max = 180): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function showAiFailure(
  feature: string,
  message?: unknown,
  code?: unknown,
  now = Date.now(),
): void {
  const text = failureMessage(feature, message, code);
  const last = recent.get(text);
  if (last !== undefined && now - last < REPEAT_MS) return;
  recent.set(text, now);

  /* Longer than an ordinary toast. This one carries a reason somebody has to
     read and probably act on, and the default four seconds is not enough to
     read a provider's error and reach for the settings. */
  useToastStore.getState().addToast({ type: 'error', message: text, duration: 9000 });
}

/*
  ── The other channels that failed quietly ──

  `ai:error` is not the only one. Four more carry a reason and nobody was
  showing it:

    dk8s:aiError             one listener, no toast
    dk8s:artifactError       one listener, no toast
    soap:wsdlImportError     no listener at all
    ai:conversationSaveError no listener at all

  The last two reached nothing whatsoever — a WSDL that would not import and a
  conversation that would not save both looked like nothing happening.

  Named rather than matched on a `*Error` pattern: a catch-all would also fire
  for the error *fields* on ordinary results, which the screens showing them
  have already explained far better than a toast can.
*/
export const SILENT_ERROR_TYPES: Record<string, string> = {
  'dk8s:aiError': 'Asking about this cluster',
  'dk8s:artifactError': 'Reading that artifact',
  'soap:wsdlImportError': 'Importing that WSDL',
  'ai:conversationSaveError': 'Saving the conversation',
};

/** True when this is one of the message types above, so the caller can pass it on. */
export function isSilentErrorType(type: unknown): type is string {
  return typeof type === 'string' && type in SILENT_ERROR_TYPES;
}

/** Raise the same toast for one of them, using whichever field carries the reason. */
export function showSilentFailure(
  type: string,
  msg: Record<string, unknown>,
  now = Date.now(),
): void {
  const reason = msg.error ?? msg.message;
  showAiFailure(SILENT_ERROR_TYPES[type] ?? type, reason, msg.code, now);
}
