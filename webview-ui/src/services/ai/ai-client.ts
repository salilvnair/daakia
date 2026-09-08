/**
 * The one door every AI call goes through.
 *
 * ── Why this exists ──
 *
 * There are eighty-odd AI features in this app and each one built its own
 * `postMsg({ type: 'ai:send', … })` by hand. That is how the audit trail came
 * to have no AI in it at all, and how four modals shipped posting `reqId`,
 * `systemPrompt` and `messages` — none of which the host reads — so their
 * buttons spun forever and answered nothing. Fifty copies of a contract, each
 * free to get a field name wrong.
 *
 * A call made through `sendAiRequest` is named, placed, audited and shaped
 * correctly by construction. `guard.test.ts` keeps it that way: nothing but
 * this file may post `ai:send`.
 *
 * ── The rule ──
 *
 * New AI features call `sendAiRequest`. They do not post `ai:send` directly.
 * `stage` names the feature and must exist in the prompt library;
 * `screen` says where the user was standing when they asked for it.
 */
import { postMsg } from '../../vscode';
import type { AiPromptTemplateKey } from '../../store/prompt-template';
import { isAiStageEnabled, isAiFeatureOn } from '../../store/ai-features-store';
import { nameForStage } from '../../store/ai-audit-events';

/** Where the user was when they asked. Shown in the audit beside the feature. */
export type AiScreen =
  | 'REST · Request' | 'REST · Response' | 'REST · Docs' | 'REST · Scripts'
  | 'GraphQL' | 'gRPC' | 'SOAP' | 'WebSocket' | 'MCP'
  | 'Collections' | 'Environments' | 'History' | 'Import'
  | 'Workspace · Overview'
  | 'Mock Server' | 'Daakia AI' | 'Settings'
  | 'dk8s · Pods' | 'dk8s · Logs' | 'dk8s · Terminal' | 'dk8s · Explorer'
  | 'dk8s · Doctor' | 'dk8s · Search';

/** The model knobs. Anything omitted takes the default below. */
export interface AiSettingsOverrides {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  topP?: number;
  stopSequences?: string[];
  responseFormat?: 'text' | 'json_object';
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number | null;
}

export interface AiCallOptions {
  /** The feature, as a prompt-library key — this is what the audit names. */
  stage: AiPromptTemplateKey | string;
  /** The screen it was asked from. */
  screen: AiScreen;
  /**
   * The AI Features flag that governs this call, where the stage alone cannot
   * say. Four per-protocol Explain features share one prompt and one stage, so
   * only the call site knows whether this is Explain on REST or on GraphQL.
   * Omitted, the flag is resolved from the stage.
   */
  feature?: string;

  /** The instruction block. */
  systemPrompts?: string[];
  /** What the user (or the feature, on their behalf) is asking. */
  userPrompt?: string;
  /** Prior turns, for a feature that holds a conversation. */
  conversation?: unknown[];
  /** Tool definitions offered to the model. */
  tools?: unknown[];
  settings?: AiSettingsOverrides;
  /** MCP servers whose tools this call may reach for. */
  mcpServerConfigs?: unknown[];
  /** Images to send alongside the prompt, for the features that read pictures. */
  images?: unknown[];

  /**
   * Provider routing. All three are empty by default, which means "resolve from
   * settings" — the host picks, so no call site has to know what is configured.
   * A feature that lets the user choose a model passes it here.
   */
  provider?: string;
  model?: string;
  baseUrl?: string;

  /**
   * Auth/env context of the tab that asked, where the feature needs it.
   *
   * `envId` is nullable on a tab that follows the active environment rather
   * than pinning one, so it is accepted as null here instead of making every
   * call site coerce it.
   */
  context?: { authType?: string; authData?: unknown; envId?: string | null };
  authType?: string;
  authData?: unknown;
  envId?: string | null;

  /** Supply your own id when you need to correlate before the call returns. */
  requestId?: string;
  /** The same thing under the name the message carries. */
  tabId?: string;
}

const DEFAULT_SETTINGS = {
  temperature: 0.4,
  maxTokens: 1024,
  stream: true,
  topP: 1,
  stopSequences: [] as string[],
  responseFormat: 'text' as const,
  frequencyPenalty: 0,
  presencePenalty: 0,
  seed: null,
};

/**
 * A correlation id that cannot collide.
 *
 * `Date.now()` alone did collide, in the dk8s search: two calls started in the
 * same millisecond and the second one's answer was matched to the first.
 */
export function newAiRequestId(stage: string): string {
  return `${stage}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Send one AI request. Returns the id its `ai:chunk`/`ai:complete`/`ai:error`
 * messages will carry — listen for that id, not for the message type alone.
 */
export function sendAiRequest(options: AiCallOptions): string {
  const { requestId, tabId, context, settings, feature, ...rest } = options;
  const id = requestId || tabId || newAiRequestId(options.stage);

  /*
    The AI Features screen says a disabled feature makes "no LLM calls". That
    was true of six of the eighty-seven switches — the rest hid a button at
    most, and several hid nothing at all. Asking here makes it true of every
    one of them, because every AI call comes through this function.

    The refusal is delivered as an `ai:error` on the feature's own id, so the
    caller's existing error handling shows it. Returning quietly would leave
    the button spinning, which is the failure this file was written to end.
  */
  if (!(feature ? isAiFeatureOn(feature) : isAiStageEnabled(options.stage))) {
    const message = `${nameForStage(options.stage)} is turned off in Settings → AI Features.`;
    queueMicrotask(() => {
      window.postMessage({ type: 'ai:error', tabId: id, stage: options.stage, message }, '*');
    });
    return id;
  }

  postMsg({
    // Empty means "resolve from settings" unless the caller overrode it below.
    provider: '',
    model: '',
    baseUrl: '',
    systemPrompts: [],
    userPrompt: '',
    conversation: [],
    tools: [],
    mcpServerConfigs: [],
    ...rest,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    ...(context
      ? { authType: context.authType, authData: context.authData, envId: context.envId }
      : {}),
    // Last, so no caller can post under a different type or lose its id.
    type: 'ai:send',
    tabId: id,
  });

  return id;
}

/**
 * The same door, for code that prefers an object it can hold.
 *
 * A panel that makes several calls from one screen builds this once and calls
 * `send` for each, rather than repeating the screen at every call site and
 * eventually getting one of them wrong.
 */
export class AiClient {
  constructor(
    private readonly screen: AiScreen,
    private readonly context?: AiCallOptions['context'],
  ) {}

  send(options: Omit<AiCallOptions, 'screen'>): string {
    return sendAiRequest({ context: this.context, ...options, screen: this.screen });
  }
}
