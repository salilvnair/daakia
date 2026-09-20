/**
 * The model layer — on top of the filter, never underneath it.
 *
 * ── The rule this file exists to keep ──
 *
 * Everything here improves an answer that already exists. `askForFilter`
 * produces a query the popup could have been clicked into by hand;
 * `askForName` renames a card that already has a name and a folder. Delete this
 * file and the filter and the save suggestion both still work — which is the
 * test for whether the AI is layered on or load-bearing.
 *
 * ── Why the answers are validated rather than trusted ──
 *
 * A model asked for a filter query will occasionally invent a field. Parsing
 * its answer through the same `parseQuery` the paste box uses means an invented
 * token degrades into search text rather than into a filter that silently means
 * something else — and `describeResult` can then say what was actually
 * understood, so nobody is filtering by something they did not ask for.
 */
import { sendAiRequest } from '../ai/ai-client';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { factsOf, type HistoryRowLike } from './history-facts';
import {
  activeCount, formatQuery, parseQuery, type FilterState,
} from './filter-model';
import type { SaveSuggestion } from './repeat-suggest';

/** How much of history is described to the model. Enough to ground it, no more. */
const SAMPLE = 400;

export interface AiFilterRequest {
  question: string;
  rows: readonly HistoryRowLike[];
}

/**
 * Ask for a filter, in the user's own words.
 *
 * The methods and header names actually present are sent along, because a model
 * that knows the history carries `x-tenant-id` writes a condition on it and one
 * that does not guesses `tenant`. Nothing else about the requests goes: no
 * bodies, no tokens, no URLs. The point is grammar, not data.
 */
export function askForFilter({ question, rows }: AiFilterRequest): string {
  const methods = new Set<string>();
  const headers = new Set<string>();
  for (const row of rows.slice(0, SAMPLE)) {
    const facts = factsOf(row);
    methods.add(facts.method);
    for (const h of facts.headers) headers.add(h.key);
  }

  /* Both halves come out of the prompt library, so a user who has edited the
     template in Settings gets their edit rather than a copy of it frozen here. */
  const resolve = useAiPromptTemplatesStore.getState().resolve;
  return sendAiRequest({
    stage: 'history.filter.parse',
    screen: 'History',
    systemPrompts: [resolve('history.filter.parse.system')],
    userPrompt: resolve('history.filter.parse', {
      question,
      methods: [...methods].join(', ') || '(none yet)',
      headers: [...headers].slice(0, 60).join(', ') || '(none yet)',
    }),
    settings: { temperature: 0, maxTokens: 200, stream: false },
  });
}

export interface ParsedAnswer {
  state: FilterState;
  /** The query as the model wrote it, for showing what was asked for. */
  raw: string;
  /** True when some of the answer could not be understood as filter grammar. */
  partial: boolean;
}

/**
 * Turn an answer into a filter, keeping whatever was valid.
 *
 * Fences and prose are stripped because models add them however firmly they are
 * told not to; what survives goes through the ordinary parser. Anything it did
 * not recognise lands in the text box, which is visible and removable rather
 * than silent.
 */
export function readFilterAnswer(answer: string): ParsedAnswer {
  const cleaned = answer
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)[0] ?? '';

  const state = parseQuery(cleaned);
  return {
    state,
    raw: cleaned,
    partial: state.text.trim() !== '' && activeCount(state) > 1,
  };
}

/** What the panel says it understood, so nobody filters by a misreading. */
export function describeResult(parsed: ParsedAnswer): string {
  if (!activeCount(parsed.state)) return 'Nothing in that could be turned into a filter.';
  const query = formatQuery(parsed.state);
  return parsed.partial
    ? `Understood ${query} — the rest became a text search.`
    : `Understood ${query}.`;
}

/**
 * A better name for a card that already has one.
 *
 * This is the Request Namer, asked from History rather than from the Save
 * dialog — the same feature, the same switch, the same prompt. Inventing a
 * second naming feature would have given the user two switches for one
 * behaviour and me two prompts to keep in step.
 */
export function askForName(suggestion: SaveSuggestion, bodyPreview = ''): string {
  const resolve = useAiPromptTemplatesStore.getState().resolve;
  return sendAiRequest({
    stage: 'rest.request.name',
    feature: 'requestNamer',
    screen: 'History',
    systemPrompts: ['You are a concise HTTP request naming assistant. Return only the name — nothing else.'],
    userPrompt: resolve('rest.request.name', {
      method: suggestion.method,
      url: suggestion.endpoint,
      bodyPreview: bodyPreview.slice(0, 500) || '(empty)',
    }),
    settings: { temperature: 0.2, maxTokens: 60, stream: false },
  });
}

/** A name from the model, trimmed to something that fits a sidebar row. */
export function readNameAnswer(answer: string): string {
  return answer
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .split('\n')
    .map(l => l.trim().replace(/^["']|["'.]$/g, ''))
    .find(Boolean)
    ?.slice(0, 60) ?? '';
}
