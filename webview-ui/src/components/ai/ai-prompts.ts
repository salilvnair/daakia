/**
 * Every prompt the Daakia AI tab offers, in one list the landing and the
 * `/` palette both read.
 *
 * The dk8s ones come from the Prompt Library (edited copies win over the
 * defaults); the Build ones are the slash commands the assistant already
 * understands. `{placeholder}` marks what only the asker knows.
 */
import { DK8S_CHAT_STARTERS } from './dk8s-chat-prompts';
import type { AiPromptTemplateKey } from '../../store/prompt-template';

export interface AiPrompt {
  id: string;
  group: 'Ask the logs' | 'REST' | 'Mock' | 'Tests';
  label: string;
  description: string;
  text: string;
}

/*
  The API prompts — REST, Mock and Tests — in the order the landing's Build
  pills take them: the first four are those pills, so they stay first. The
  ones that say "the request I have open" lean on the context block the tab
  injects for the request that was open when Daakia AI was.
*/
export const BUILD_PROMPTS: AiPrompt[] = [
  { id: 'request', group: 'REST', label: 'Build a request', description: 'A REST request from a sentence',
    text: '/request GET all users from https://jsonplaceholder.typicode.com/users' },
  { id: 'mock', group: 'Mock', label: 'Create a mock', description: 'A mock endpoint with realistic data',
    text: '/mock Create a mock POST /api/users that returns a created user' },
  { id: 'test', group: 'Tests', label: 'Generate tests', description: 'dk.* assertions for a response',
    text: '/test Write assertions for a 200 response with a users array' },
  { id: 'curl', group: 'REST', label: 'Convert cURL', description: 'A cURL command into a Daakia request',
    text: '/curl curl -X POST https://api.example.com/data -H "Content-Type: application/json" -d \'{"name":"test"}\'' },
  { id: 'explain-response', group: 'REST', label: 'Explain this response', description: 'What the open request got back, part by part',
    text: 'Explain the last response of the request I have open: what each part means, and anything in it that looks wrong.' },
  { id: 'why-failed', group: 'REST', label: 'Why did this request fail', description: 'The likely cause, from status, headers and body',
    text: 'The request I have open failed. From its status, headers and body, tell me the most likely cause and what to change.' },
  { id: 'graphql', group: 'REST', label: 'GraphQL query', description: 'A query for the fields you name',
    text: '/graphql Write a GraphQL query to get all users with their id, name, and email' },
  { id: 'soap', group: 'REST', label: 'SOAP envelope', description: 'A SOAP 1.1 envelope for an operation',
    text: '/soap Generate a SOAP 1.1 envelope for a GetUserById operation with userId parameter' },
  { id: 'security', group: 'REST', label: 'Security scan', description: 'What a request leaks or allows',
    text: '/security Scan this request for security issues: GET http://api.example.com/users?apiKey=sk-abc123' },
  { id: 'docs', group: 'REST', label: 'Document an endpoint', description: 'Reference docs for one endpoint',
    text: '/docs Document the POST /api/users endpoint that creates a new user with name and email' },
  { id: 'mock-from-response', group: 'Mock', label: 'Mock this response', description: 'A mock that answers like the open request did',
    text: '/mock Create a mock that returns the same shape as the last response of the request I have open' },
  { id: 'mock-errors', group: 'Mock', label: 'Mock the error cases', description: '400, 404 and 500 for the open request',
    text: '/mock Create mocks for the 400, 404 and 500 responses of the request I have open, each with a realistic error body' },
  { id: 'tests-for-response', group: 'Tests', label: 'Tests for this response', description: 'Status, required fields and their types',
    text: '/test Write dk.* assertions for the last response of the request I have open: status, required fields and their types' },
  { id: 'negative-tests', group: 'Tests', label: 'Negative tests', description: 'Missing fields, wrong types, bad auth',
    text: '/test Write negative test cases for the request I have open: missing fields, wrong types and bad auth' },
  { id: 'contract', group: 'Tests', label: 'Contract checks', description: 'Assertions that catch a breaking change',
    text: '/test Write assertions that would catch a breaking change in the response of the request I have open' },
];

/** The dk8s starters, with any edits from the Prompt Library applied. */
export function logPrompts(templates: Partial<Record<AiPromptTemplateKey, string>>): AiPrompt[] {
  return DK8S_CHAT_STARTERS.map(s => ({
    id: s.id, group: 'Ask the logs', label: s.label, description: s.description,
    text: templates[`dk8s.chat.${s.id}` as AiPromptTemplateKey] || s.text,
  }));
}

/** Text split into plain runs and `{placeholders}`, for drawing the placeholders as chips. */
export function withPlaceholders(text: string): { text: string; ph: boolean }[] {
  const out: { text: string; ph: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(/\{(\w+)\}/g)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), ph: false });
    out.push({ text: m[1], ph: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), ph: false });
  return out;
}

/**
 * Whether `query` fits `label` letter by letter, and which letters matched.
 * Contiguous matches rank first, then earlier ones — "tr" finds "Trace …"
 * before "Status trail …" before "Follow a thread".
 */
export function fuzzy(label: string, query: string): { score: number; marks: number[] } | undefined {
  const q = query.toLowerCase();
  if (!q) return { score: 0, marks: [] };
  const l = label.toLowerCase();
  const at = l.indexOf(q);
  if (at >= 0) {
    return { score: 1000 - at, marks: Array.from({ length: q.length }, (_, i) => at + i) };
  }
  const marks: number[] = [];
  let from = 0;
  for (const ch of q) {
    const i = l.indexOf(ch, from);
    if (i < 0) return undefined;
    marks.push(i);
    from = i + 1;
  }
  return { score: 500 - marks[marks.length - 1], marks };
}
