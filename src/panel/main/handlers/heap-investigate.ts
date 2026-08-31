/**
 * The heap investigation loop.
 *
 * Every other AI call in dk8s is one shot: build a pack of evidence, send it,
 * render the answer. That works when the question is "what is wrong here" and
 * fails when it is "what is inside the thing that is wrong", because the pack
 * was decided before the model saw anything and the interesting rows were
 * summarised away to fit.
 *
 * So this one is a conversation. The model reads the pack, asks for a view it
 * wants, gets real numbers back, and asks again — the same shape JProfiler's
 * MCP gets from a second tool call, done over the index we already hold.
 *
 * Two things keep it honest. Every view the model can name is whitelisted in
 * heap-drilldown; there is no path from model output to an arbitrary query.
 * And the rounds are capped, because a loop whose exit condition is a model
 * deciding it is finished is not an exit condition.
 */
import {
  parseDrillRequests, queryFor, formatDrillResult, formatRefusals,
  MAX_ROUNDS, type DrillRequest,
} from '../../../services/heap/heap-drilldown';
import { dk8sPrompt } from '../../chat/dk8s-prompts';
import { handleAiSend } from './ai-handler';
import { heapQueryOnce } from './heap-handler';

type PostMessage = (msg: unknown) => void;

/** The tabId the dk8s AI panel listens on. */
const DK8S_AI_TAB = 'dk8s-ai';

/**
 * Run one exchange and hand back what the model said.
 *
 * `handleAiSend` streams rather than returning, so this wraps it: chunks are
 * accumulated here, and forwarded to the panel only on the last round. An
 * intermediate round is the model thinking out loud in a protocol the reader
 * did not ask to see — the useful part of it is reported separately, as steps.
 */
function runRound(
  args: {
    system: string;
    userPrompt: string;
    conversation: unknown[];
    provider?: unknown;
    model?: unknown;
  },
  postMessage: PostMessage,
  forward: boolean,
): Promise<{ text: string; failed?: string }> {
  return new Promise(resolve => {
    let text = '';
    let settled = false;

    const done = (r: { text: string; failed?: string }) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    const intercept: PostMessage = (raw) => {
      const m = raw as { type?: string; tabId?: string; delta?: string; content?: string; message?: string };

      if (m?.type === 'ai:chunk') {
        text += m.delta ?? m.content ?? '';
        if (forward) postMessage(raw);
        return;
      }
      if (m?.type === 'ai:complete') {
        if (forward) postMessage(raw);
        done({ text });
        return;
      }
      if (m?.type === 'ai:error') {
        // Errors always reach the panel: a silent failure mid-loop would look
        // like the model simply stopped having anything to say.
        postMessage(raw);
        done({ text, failed: m.message ?? 'the model call failed' });
        return;
      }

      // Everything else — tool events, status — passes through untouched.
      postMessage(raw);
    };

    handleAiSend({
      tabId: DK8S_AI_TAB,
      systemPrompts: [args.system],
      userPrompt: args.userPrompt,
      conversation: args.conversation,
      stage: 'dk8s.heap.investigate',
      provider: args.provider,
      model: args.model,
    }, intercept).catch(e => {
      done({ text, failed: e instanceof Error ? e.message : String(e) });
    });
  });
}

/** A short human sentence for a query, for the progress line. */
function describeStep(req: DrillRequest): string {
  switch (req.kind) {
    case 'biggest': return 'looked at the biggest objects';
    case 'children': return `opened object ${req.row}`;
    case 'retained': return `broke down what object ${req.row} retains`;
    case 'classes': return req.filter
      ? `listed classes under ${req.filter}`
      : 'listed the class histogram';
    case 'inspections': return 'ran the inspections';
    case 'path': return `traced object ${req.row} to a GC root`;
  }
}

export async function handleDk8sHeapInvestigate(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const system = dk8sPrompt('dk8s.heap.investigate');
  if (!system) {
    postMessage({ type: 'dk8s:aiError', error: 'Unknown prompt: dk8s.heap.investigate' });
    return;
  }

  let pack: { userMessage?: string };
  try {
    pack = await heapQueryOnce<{ userMessage?: string }>({ type: 'evidence' });
  } catch (e) {
    postMessage({
      type: 'dk8s:aiError',
      error: e instanceof Error ? e.message : 'No heap dump is loaded.',
    });
    return;
  }

  // The pack travels to the panel so "show what was sent" stays true, exactly
  // as the single-shot path does.
  postMessage({ type: 'dk8s:aiEvidence', tabId: DK8S_AI_TAB, evidence: pack.userMessage ?? '' });

  const conversation: unknown[] = [];
  let userPrompt = pack.userMessage ?? '';

  for (let round = 0; ; round++) {
    const last = round >= MAX_ROUNDS;
    const { text, failed } = await runRound(
      { system, userPrompt, conversation, provider: msg.provider, model: msg.model },
      postMessage,
      // The final round is the answer, so it streams. So does a round that
      // turns out to have asked for nothing — see below.
      last,
    );
    if (failed) return;

    const { requests, refused } = parseDrillRequests(text);

    /*
      No queries means this was the answer.

      It was not forwarded, because until it was parsed there was no way to
      know. Sending the accumulated text as one chunk loses the typing effect
      for that round and keeps the alternative — streaming protocol lines the
      reader never asked to see — off the screen.
    */
    if (!requests.length || last) {
      if (!last) {
        postMessage({ type: 'ai:chunk', tabId: DK8S_AI_TAB, delta: text });
        postMessage({ type: 'ai:complete', tabId: DK8S_AI_TAB });
      }
      return;
    }

    postMessage({
      type: 'dk8s:aiSteps',
      tabId: DK8S_AI_TAB,
      round: round + 1,
      steps: requests.map(describeStep),
    });

    const answers: string[] = [];
    for (const req of requests) {
      try {
        const data = await heapQueryOnce(queryFor(req));
        answers.push(formatDrillResult(req, data));
      } catch (e) {
        // A failed view is reported rather than dropped, for the same reason
        // a refusal is: an absent answer reads as an empty one.
        answers.push(`${req.raw} — failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const refusalText = formatRefusals(refused);
    if (refusalText) answers.push(refusalText);

    conversation.push(
      { role: 'assistant', content: text },
      { role: 'user', content: answers.join('\n\n') },
    );
    userPrompt = answers.join('\n\n');
  }
}
