/**
 * Master Agent — intent router for the @daakia chat participant.
 *
 * When the user sends a message without an explicit /command,
 * the MasterAgent classifies their intent and returns the matching
 * command key so the handler can pick the right system prompt.
 *
 * Classification is done via a compact LLM call using the MASTER_AGENT_SYSTEM_PROMPT
 * from prompt-template.ts. Falls back to 'general' on any error.
 */
import * as vscode from 'vscode';
import { MASTER_AGENT_SYSTEM_PROMPT } from './prompt-template';

export type DaakiaCommand =
  | 'request' | 'mock' | 'test' | 'curl' | 'explain' | 'general'
  | 'soap' | 'xsd' | 'graphql' | 'docs' | 'security';

interface ClassificationResult {
  command: DaakiaCommand;
  confidence: number;
}

const COMMAND_HEURISTICS: Array<{ pattern: RegExp; command: DaakiaCommand }> = [
  // cURL
  { pattern: /^curl\s+/i,                                                     command: 'curl'     },
  { pattern: /--data|-X\s+(POST|PUT|PATCH|DELETE)/i,                          command: 'curl'     },
  // SOAP
  { pattern: /\b(soap|wsdl|ws-security|soap envelope|soap fault|soap 1\.[12])\b/i, command: 'soap' },
  // XSD / Schema
  { pattern: /\b(xsd|xml schema|json schema|generate.*from.*schema|sample.*from.*xsd)\b/i, command: 'xsd' },
  // GraphQL
  { pattern: /\b(graphql|gql|query\s*\{|mutation\s*\{|subscription\s*\{|fragment\s+\w+\s+on)\b/i, command: 'graphql' },
  // Security
  { pattern: /\b(security|vulnerability|audit|exposed (key|token|secret)|missing auth|cors (attack|issue)|scan)\b/i, command: 'security' },
  // Docs
  { pattern: /\b(document(ation)?|openapi|swagger|api (guide|reference|docs)|generate docs)\b/i, command: 'docs' },
  // Mock
  { pattern: /\b(mock|stub|fake|create a mock)\b/i,                           command: 'mock'     },
  // Test
  { pattern: /\b(test|assert|expect|dk\.|assertion)\b/i,                      command: 'test'     },
  // Explain
  { pattern: /\b(what is|explain|how does|difference between|why)\b/i,        command: 'explain'  },
  // REST request
  { pattern: /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+[/\w]/i,           command: 'request'  },
  { pattern: /\b(build|make|create|send)\s+.*(request|api|endpoint|call)\b/i, command: 'request'  },
];

/**
 * Classify intent using fast pattern-matching heuristics first.
 * Falls back to LLM classification only when heuristics are ambiguous.
 */
export function classifyIntentFast(text: string): DaakiaCommand | null {
  for (const { pattern, command } of COMMAND_HEURISTICS) {
    if (pattern.test(text)) return command;
  }
  return null;
}

/**
 * Classify intent via LLM (async, uses the same Copilot model as the handler).
 * Returns 'general' on model unavailability or parse errors.
 */
export async function classifyIntentLlm(
  text: string,
  token: vscode.CancellationToken,
): Promise<DaakiaCommand> {
  try {
    const models = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
    const model = models[0];
    if (!model) return 'general';

    const msgs = [
      vscode.LanguageModelChatMessage.User(`System: ${MASTER_AGENT_SYSTEM_PROMPT}`),
      vscode.LanguageModelChatMessage.User(text),
    ];

    const response = await model.sendRequest(msgs, {}, token);
    let raw = '';
    for await (const chunk of response.text) {
      raw += chunk;
      if (raw.length > 500) break; // don't over-read
    }

    const jsonMatch = raw.match(/\{[^}]+\}/);
    if (!jsonMatch) return 'general';

    const parsed = JSON.parse(jsonMatch[0]) as ClassificationResult;
    const validCommands: DaakiaCommand[] = [
      'request', 'mock', 'test', 'curl', 'explain', 'general',
      'soap', 'xsd', 'graphql', 'docs', 'security',
    ];
    if (validCommands.includes(parsed.command)) return parsed.command;

    return 'general';
  } catch {
    return 'general';
  }
}

/**
 * Full intent classification — heuristics first (free), then LLM.
 */
export async function classifyIntent(
  text: string,
  token: vscode.CancellationToken,
): Promise<DaakiaCommand> {
  const fast = classifyIntentFast(text);
  if (fast) return fast;
  return classifyIntentLlm(text, token);
}
