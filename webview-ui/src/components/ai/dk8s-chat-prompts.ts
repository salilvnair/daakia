/**
 * The prompts behind asking Daakia AI about the pods you are watching.
 *
 * One system prompt, sent with every Daakia AI message while dk8s is on, and a
 * set of starters — the questions people actually ask of a log, with the part
 * only they know left as a `{placeholder}`. Both live in the Prompt Library
 * (Settings → AI → Prompt templates → dk8s · Ask the logs), so a team can
 * reword them; these are the defaults a reset returns to.
 *
 * The system prompt is what makes the conversation a conversation: it tells
 * the model when NOT to search (a greeting, a question about HTTP), how to turn
 * a sentence into a search term, and that a placeholder left in a starter is a
 * question for the user, not a term for the search.
 */

import { useUiStateStore } from '../../store/ui-state-store';

export const DK8S_CHAT_SYSTEM = `You can see the Kubernetes cluster the user is watching in dk8s, and you have two tools for it.

Where you are looking: context {context}, namespace {namespace}.
Pods being watched: {pods}.
Archived logs on volumes: {archive}.

YOUR TOOLS
- dk8s_search — searches the LOGS of the watched pods (and the archive), groups the hits by thread and returns numbered lines. Use it for anything that happened: a request or id that failed, an error, an exception, a timeout, a logger, what a thread did.
- kubectl_run — runs ONE read-only kubectl command in this context and namespace and returns its output. Use it for the state of things: which pods are running or restarting and why, a pod's events and conditions, a deployment's rollout, resource usage (top), services and endpoints, config maps, recent events. The context and namespace are added for you.
- Anything that would CHANGE the cluster (delete, scale, restart, apply, patch, exec…) is never run. If the user asks for one, call kubectl_run with it anyway: they get the exact command on a card to copy and run themselves. Explain what it will do and what to check afterwards. Never say it ran.

WHEN TO USE WHICH
- A question about what happened or why something failed → dk8s_search first. If the lines point at the pod's health (restarts, OOMKilled, probe failures), follow with kubectl_run (describe pod, get events).
- A question about current state → kubectl_run.
- A general question (how does X work, what does this error mean, how do I do Y in Daakia) → just answer. Do not call a tool to answer something you already know.
- If the message still contains an unfilled placeholder in braces such as {requestId} or {api}, ask for that value in one short sentence instead of using a tool.
- You may call tools several times in one answer to follow a lead — at most four calls — but do not repeat a call that already answered.

HOW TO SEARCH THE LOGS
- Search for the most specific literal text the log will contain. An id goes WITH its key, exactly as the user wrote it (requestDataId=4242), never as a bare number: a bare number also matches card digits, tokens and other ids. To catch the same id in a JSON payload too, use /requestDataId[=":]+4242\\b/.
- Other good terms: a thread name like nio-8104-exec-4, an exception class, a logger name, an endpoint path.
- One term per call. Set "failure" when the user says what failing looks like, "around" when they ask for more or fewer lines, "pods" (a glob like zp-backend*) when they name a service.
- For "what happened between", "the minute before" or "what did this thread do around X", set "thread" to the thread's exact name (it matches only lines that thread wrote — never scheduling-10 for scheduling-1) and "from"/"to" (ISO 8601, UTC — take the times from lines you have already seen); "query" can then be left empty. A window returns far more lines, so a busy thread is not cut short. If a result still looks cut short, say where it stops.

HOW TO ANSWER
- Lead with what happened or what the state is, in a few plain sentences. The tools' results are drawn under your answer as cards — log lines with their numbers, command output with links to the pods — so do not paste them back.
- For log lines, cite every factual claim as [n] using the numbers in the search result; never cite a number that is not there. Cite at most six lines — the ones that carry the story — and describe the rest by what they have in common ("the scheduler loop, every 200ms"), never as a run of numbers. Lines without a number are context from the same thread: an error in context naming a different id is somebody else's.
- For command output, quote only the few values that matter (a status, a restart count, an event reason) in backticks.
- End with the next useful step when there is one — a command, a place in dk8s to look, a setting to change.
- If nothing matched, say so plainly and suggest a different term, a wider window, or the archive search.
- Masked values (••••••) stay masked. Never guess them.`;

export interface Dk8sStarter {
  id: string;
  label: string;
  description: string;
  text: string;
}

/** The questions people ask of a log. `{…}` is theirs to fill. */
export const DK8S_CHAT_STARTERS: Dk8sStarter[] = [
  { id: 'trace', label: 'Trace a failed request',
    description: 'Every thread that touched one id, with what happened before and after the failure',
    text: '{requestId} failed calling {api}. Find every thread that touched it and show me what happened before and after the failure.' },
  { id: 'whyFailed', label: 'Why did this API fail?',
    description: 'The latest failure of one API, explained from the lines',
    text: 'Why did the last call to {api} fail? Search the logs and show me the thread that failed.' },
  { id: 'errorsAround', label: 'What failed around a time',
    description: 'Errors in a window, grouped by the thread that raised them',
    text: 'What failed around {time}? Show me the errors from a few minutes before to a few minutes after, and the threads they came from.' },
  { id: 'thread', label: 'Follow a thread',
    description: 'Everything one thread did around a moment',
    text: 'Follow thread {thread} around {time} — what did it do before and after?' },
  { id: 'fiveHundreds', label: 'Which calls returned 5xx',
    description: 'Server errors, and what failed behind each one',
    text: 'Which API calls returned a 5xx in the logs? For each one, find its thread and tell me what failed.' },
  { id: 'timeouts', label: 'Find timeouts',
    description: 'Read timeouts — which downstream, which request, which thread',
    text: 'Find read timeouts. For each one: which downstream was it calling, for which request, and on which thread?' },
  { id: 'exception', label: 'Where is this exception thrown',
    description: 'An exception class, the line that threw it and what led up to it',
    text: 'Find {exception} in the logs. Show me the line that threw it, its top frames, and what that thread did just before.' },
  { id: 'logger', label: 'Lines from a logger',
    description: 'What one logger wrote, and which threads wrote it',
    text: 'Find lines written by the logger {logger} and show me the threads that wrote them.' },
  { id: 'statusTrail', label: 'Status trail of a request',
    description: 'Every status change for one request, in order',
    text: 'Show me every status change for request {requestId}, in order, with the thread that made each one.' },
  { id: 'customer', label: 'Everything for a customer',
    description: 'Requests that mention one customer, and what became of them',
    text: 'Find everything for customer {customer} and walk me through what happened to their requests.' },
  { id: 'compare', label: 'Good request vs failed one',
    description: 'Two ids on the same API — where did they diverge?',
    text: 'Request {goodId} worked and {badId} failed on the same API. Search both and tell me where they diverged.' },
  { id: 'slow', label: 'Slow API calls',
    description: 'Calls over a threshold, and what they were waiting on',
    text: 'Find API calls that took longer than {ms} ms. What were they waiting on?' },
  { id: 'soapFault', label: 'SOAP faults',
    description: 'Faults from a SOAP provider, and the request each belongs to',
    text: 'Find SOAP faults. Which request did each one belong to, and what did the provider say?' },
  { id: 'conflicts', label: '409 conflicts',
    description: 'Requests refused with 409, and what they had just done',
    text: 'Find 409 CONFLICT responses. Which requests hit them, and what had each one just done?' },
  { id: 'pool', label: 'Waiting on the pool',
    description: 'Connection-pool stats with requests waiting, and what was running then',
    text: 'Were requests waiting on the connection pool? Search the pool stats where waiting is above 0 and show me what was happening then.' },
  { id: 'restarts', label: 'What keeps restarting',
    description: 'Pods with restarts, and the reason the last one gave',
    text: 'Which pods have restarted, and why? Check their last state and recent events.' },
  { id: 'notReady', label: 'Why is a pod not ready',
    description: 'Conditions, probes and events for one pod',
    text: 'Why is {pod} not ready? Describe it and tell me what its conditions and events say.' },
  { id: 'warnings', label: 'Recent warnings',
    description: 'Warning events in the namespace, newest first',
    text: 'Show me the recent warning events in this namespace and what each one means.' },
  { id: 'rollout', label: 'How did the rollout go',
    description: "A deployment's rollout status and history",
    text: 'How did the last rollout of {deployment} go? Check its status and history.' },
  { id: 'usage', label: 'Who is using the most',
    description: 'CPU and memory by pod',
    text: 'Which pods are using the most CPU and memory right now?' },
  { id: 'archive', label: 'Search the archive',
    description: 'Older than the live logs — search the rotated files on the volume',
    text: 'Search the archived logs for {term} on {date}. It is older than anything the live logs still hold.' },
  { id: 'onePod', label: 'Search one pod',
    description: 'Only one pod, with the same thread around each hit',
    text: 'Search only {pod} for {term} and show me the surrounding lines of the same thread.' },
  { id: 'newSince', label: 'New failures since a deploy',
    description: 'What started failing after a moment',
    text: 'Since {time}, has anything started failing? Search for ERROR and group what you find by what failed.' },
];

export type Dk8sChatKey =
  | 'dk8s.chat.system'
  | 'dk8s.chat.trace'
  | 'dk8s.chat.whyFailed'
  | 'dk8s.chat.errorsAround'
  | 'dk8s.chat.thread'
  | 'dk8s.chat.fiveHundreds'
  | 'dk8s.chat.timeouts'
  | 'dk8s.chat.exception'
  | 'dk8s.chat.logger'
  | 'dk8s.chat.statusTrail'
  | 'dk8s.chat.customer'
  | 'dk8s.chat.compare'
  | 'dk8s.chat.slow'
  | 'dk8s.chat.soapFault'
  | 'dk8s.chat.conflicts'
  | 'dk8s.chat.pool'
  | 'dk8s.chat.restarts'
  | 'dk8s.chat.notReady'
  | 'dk8s.chat.warnings'
  | 'dk8s.chat.rollout'
  | 'dk8s.chat.usage'
  | 'dk8s.chat.archive'
  | 'dk8s.chat.onePod'
  | 'dk8s.chat.newSince';

export const DK8S_CHAT_KEYS = ['dk8s.chat.system', ...DK8S_CHAT_STARTERS.map(s => `dk8s.chat.${s.id}`)] as const;

/** Defaults, labels, variables and colours, in the shapes the Prompt Library keeps. */
export const DK8S_CHAT_DEFAULTS: Record<string, string> = Object.fromEntries([
  ['dk8s.chat.system', DK8S_CHAT_SYSTEM],
  ...DK8S_CHAT_STARTERS.map(s => [`dk8s.chat.${s.id}`, s.text]),
]);

export const DK8S_CHAT_LABELS: Record<string, { label: string; description: string }> = Object.fromEntries([
  ['dk8s.chat.system', { label: 'Ask the logs — system',
    description: 'Sent with every Daakia AI message while dk8s is on: when to search, how, and how to answer' }],
  ...DK8S_CHAT_STARTERS.map(s => [`dk8s.chat.${s.id}`, { label: s.label, description: s.description }]),
]);

export const DK8S_CHAT_VARIABLES: Record<string, string[]> = Object.fromEntries([
  ['dk8s.chat.system', ['context', 'namespace', 'pods', 'archive']],
  ...DK8S_CHAT_STARTERS.map(s => [`dk8s.chat.${s.id}`, [...s.text.matchAll(/\{(\w+)\}/g)].map(m => m[1])]),
]);

export const DK8S_CHAT_COLORS: Record<string, string> = Object.fromEntries(
  DK8S_CHAT_KEYS.map(k => [k, '#22d3ee']),
);

/**
 * Whether Daakia AI may search dk8s — the chip in its header. On unless turned
 * off; it still only searches when pods are being watched.
 */
export const DK8S_CHAT_PREF = 'ai.dk8s';
export function dk8sChatOn(): boolean {
  return useUiStateStore.getState().prefs[DK8S_CHAT_PREF] !== 'off';
}

/** The system prompt with where-you-are filled in. Unknown values say so. */
export function fillDk8sSystem(template: string, vars: { context?: string; namespace?: string; pods: string[]; archive: boolean }): string {
  const pods = vars.pods.length > 40 ? `${vars.pods.slice(0, 40).join(', ')} and ${vars.pods.length - 40} more` : vars.pods.join(', ');
  const fill: Record<string, string> = {
    context: vars.context || '(none selected)',
    namespace: vars.namespace || '(none selected)',
    pods: pods || '(none)',
    archive: vars.archive ? 'configured — dk8s_search reads them unless archive is false' : 'not configured',
  };
  return template.replace(/\{(context|namespace|pods|archive)\}/g, (_, k: string) => fill[k]);
}
