/**
 * Ask AI, in the Scripts tab: describe a script, get it written, inject it.
 *
 * The mock server's Generate dialog in shape — describe, watch the answer
 * arrive, act on what it produced — because that is the dialog people already
 * know for "AI writes something, I add it". Here the something is a script,
 * and each block in the answer says whether it belongs before the request or
 * after the response (see `script-ai-context.ts`).
 *
 * What the model is given: Daakia's script API, the snippet library as worked
 * examples, the Postman and Bruno tables, the request, and both scripts as
 * they are. Variables go by name only — a value is a token as often as not.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EditorView, ModalView } from '@salilvnair/dui';
import {
  CheckIcon, PlusIcon, RefreshIcon, SparkleIcon, KeyIcon, ClockIcon, LockIcon, LinkIcon,
  CheckCircleIcon, TagIcon, RenameIcon,
} from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { useTabsStore, type RequestTab } from '../../store/tabs-store';
import { useEnvStore, GLOBAL_ENV_ID } from '../../store/env-store';
import { sendAiRequest, newAiRequestId } from '../../services/ai/ai-client';
import { SNIPPETS } from '../shared/editors/SnippetsPanel';
import {
  DK_SCRIPT_API, scriptExamples, dialectTables, parseScriptBlocks, proseOf, SCRIPT_TARGET_LABEL,
  type ScriptBlock, type ScriptTarget,
} from '../../services/ai/script-ai-context';
import './ai-script-generator.css';

const STAGE = 'rest.script.generate';

/** Where the script goes: the AI's call, or one the user makes up front. */
type Placement = 'auto' | ScriptTarget;

const PLACEMENTS: { id: Placement; label: string }[] = [
  { id: 'auto', label: 'AI decides' },
  { id: 'pre-request', label: 'Pre-request' },
  { id: 'post-response', label: 'Post-response' },
];

/** What people ask a script for most, one click away — each in the colour of what it is about. */
const IDEAS: { title: string; detail: string; ask: string; icon: ReactNode; color: string }[] = [
  {
    title: 'Azure AD token', detail: 'OAuth2 client credentials, cached until expiry',
    ask: 'Get an OAuth2 token from Azure AD with client credentials before each request, cache it until it expires, and send it as a Bearer header.',
    icon: <KeyIcon size={14} />, color: 'var(--color-info)',
  },
  {
    title: 'Refresh when expired', detail: 'Reuse the token, renew it only when stale',
    ask: 'Refresh the access token with the refresh token only when the stored one has expired, and keep both in the environment.',
    icon: <ClockIcon size={14} />, color: 'var(--color-warning)',
  },
  {
    title: 'HMAC signature', detail: 'Sign method, path, body and timestamp',
    ask: 'Sign the request with HMAC-SHA256 over the method, path, timestamp and body, and send the signature and timestamp as headers.',
    icon: <LockIcon size={14} />, color: 'var(--color-scratchpad)',
  },
  {
    title: 'Chain the next call', detail: 'Save an id from this response',
    ask: 'After the response, save the id from the body into an environment variable so the next request can use it.',
    icon: <LinkIcon size={14} />, color: 'var(--color-success)',
  },
  {
    title: 'Response tests', detail: 'Status, time and required fields',
    ask: 'Test the status code, that the response time is under 1 second, and that the required fields are present with the right types.',
    icon: <CheckCircleIcon size={14} />, color: 'var(--color-protocol-rest, var(--color-success))',
  },
  {
    title: 'Correlation id', detail: 'A fresh id header on every send',
    ask: 'Add an X-Correlation-Id header with a new UUID on every request, and log it.',
    icon: <TagIcon size={14} />, color: 'var(--color-error)',
  },
];

const TARGET_COLOR: Record<ScriptTarget, string> = {
  'pre-request': 'var(--color-info)',
  'post-response': 'var(--color-success)',
};

/** The request as the model needs it: shape, not values. Query values and header values stay here. */
function describeRequest(tab: RequestTab | undefined): string {
  if (!tab) return '(no request)';
  const url = (tab.url || '').split('?')[0] || '(no URL yet)';
  const params = (tab.params ?? []).filter(p => p.enabled && p.key).map(p => p.key);
  const headers = (tab.headers ?? []).filter(h => h.enabled && h.key).map(h => h.key);
  return [
    `${tab.method || 'GET'} ${url}`,
    params.length ? `Query parameters: ${params.join(', ')}` : '',
    headers.length ? `Headers: ${headers.join(', ')}` : '',
    tab.authType && tab.authType !== 'none' ? `Auth tab: ${tab.authType}` : '',
  ].filter(Boolean).join('\n');
}

/** Variable names in reach of this request: the globals and its environment. */
function variableNames(tab: RequestTab | undefined): string[] {
  const { environments, activeEnvId } = useEnvStore.getState();
  const envId = tab?.envId ?? activeEnvId;
  const names = new Set<string>();
  for (const env of environments) {
    if (env.id !== GLOBAL_ENV_ID && env.id !== envId) continue;
    for (const v of env.variables) if (v.key.trim()) names.add(v.key.trim());
  }
  return [...names];
}

/** Tall enough for the code, never taller than the dialog wants to be. */
const editorHeight = (code: string) => Math.min(280, Math.max(60, code.split('\n').length * 19 + 16));

interface Props {
  tabId: string;
  /** The script the user is looking at — where an untagged answer goes. */
  current: ScriptTarget;
  preScript: string;
  postScript: string;
  onInject: (target: ScriptTarget, code: string) => void;
  onClose: () => void;
}

export function AiScriptGenerator({ tabId, current, preScript, postScript, onInject, onClose }: Props) {
  const resolve = useAiPromptTemplatesStore(s => s.resolve);
  const tab = useTabsStore(s => s.tabs.find(t => t.id === tabId));

  const [ask, setAsk] = useState('');
  const [placement, setPlacement] = useState<Placement>('auto');
  const [followUp, setFollowUp] = useState('');
  const [asking, setAsking] = useState(true);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  /** Which block went where — a block can go to both scripts. */
  const [injected, setInjected] = useState<Record<number, ScriptTarget[]>>({});
  const reqId = useRef('');
  const acc = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const askRef = useRef<HTMLTextAreaElement>(null);

  const fallback: ScriptTarget = placement === 'auto' ? current : placement;
  const done = !streaming && !error && !!text;
  const blocks: ScriptBlock[] = done ? parseScriptBlocks(text, fallback) : [];
  const prose = done ? proseOf(text) : text;
  const varNames = variableNames(tab);
  const exampleCount = SNIPPETS.filter(s => s.category !== 'dynamic').length;

  useEffect(() => {
    const onMessage = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || !reqId.current || msg.tabId !== reqId.current) return;
      if (msg.type === 'ai:chunk') {
        acc.current += (msg.delta as string) || (msg.text as string) || '';
        setText(acc.current);
      } else if (msg.type === 'ai:complete') {
        const content = ((msg.message as Record<string, unknown> | undefined)?.content as string) || '';
        setText(acc.current || content);
        setStreaming(false);
      } else if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'The AI request failed.');
        setStreaming(false);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (streaming && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [text, streaming]);

  const run = (what: string) => {
    if (!what.trim()) return;
    acc.current = '';
    setText('');
    setError('');
    setInjected({});
    setAsking(false);
    setStreaming(true);
    reqId.current = newAiRequestId(STAGE);
    /* A placement chosen up front is part of the ask: the model keeps to it. */
    const placed = placement === 'auto' ? what.trim() : `${what.trim()}\n\nPut all of it in the ${SCRIPT_TARGET_LABEL[placement].toLowerCase()} script.`;
    sendAiRequest({
      tabId: reqId.current,
      stage: STAGE,
      screen: 'REST · Scripts',
      systemPrompts: [resolve('rest.script.generate.system')],
      userPrompt: resolve('rest.script.generate', {
        ask: placed,
        target: SCRIPT_TARGET_LABEL[current].toLowerCase(),
        request: describeRequest(tab),
        variables: varNames.length ? varNames.join(', ') : '(none yet)',
        preScript: preScript.trim().slice(0, 4000) || '// empty',
        postScript: postScript.trim().slice(0, 4000) || '// empty',
        dkApi: DK_SCRIPT_API,
        examples: scriptExamples(),
        dialects: dialectTables(),
      }),
      settings: { temperature: 0.3, maxTokens: 2048 },
      context: { envId: tab?.envId },
    });
  };

  const generate = () => run(ask);

  /* A change to the answer, not a new question: the model sees what it wrote. */
  const refine = () => {
    if (!followUp.trim()) return;
    run(`${ask.trim()}\n\nYour previous answer:\n${text}\n\nChange it: ${followUp.trim()}`);
    setFollowUp('');
  };

  const inject = (idx: number, target: ScriptTarget, code: string) => {
    onInject(target, code);
    setInjected(prev => ({ ...prev, [idx]: [...(prev[idx] ?? []), target] }));
  };

  /* One inject per script, its blocks joined: two appends in one go would both
     start from the same script and the second would drop the first. */
  const injectAll = () => {
    const pending = blocks.map((b, i) => ({ ...b, i })).filter(b => !injected[b.i]?.includes(b.target));
    for (const target of ['pre-request', 'post-response'] as ScriptTarget[]) {
      const mine = pending.filter(b => b.target === target);
      if (mine.length) onInject(target, mine.map(b => b.code).join('\n\n'));
    }
    setInjected(prev => {
      const next = { ...prev };
      for (const b of pending) next[b.i] = [...(next[b.i] ?? []), b.target];
      return next;
    });
  };
  const allIn = blocks.length > 0 && blocks.every((b, i) => injected[i]?.includes(b.target));

  const pickIdea = (idea: string) => {
    setAsk(idea);
    requestAnimationFrame(() => {
      const el = askRef.current;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    });
  };

  const headerRight = streaming ? (
    <span className="dk-askai-dots" aria-label="Writing"><i /><i /><i /></span>
  ) : !asking ? (
    <button type="button" className="dk-askai-ghost" onClick={() => setAsking(true)} title="Change what you asked">
      <RenameIcon size={12} /> Edit ask
    </button>
  ) : undefined;

  const footerLeft = !asking && (error || done) ? (
    <button type="button" className="dk-askai-ghost" onClick={generate}>
      <RefreshIcon size={12} /> {error ? 'Retry' : 'Regenerate'}
    </button>
  ) : undefined;

  const footerRight = !asking && blocks.length > 1 ? (
    <button type="button" className={`dk-askai-go${allIn ? ' is-done' : ''}`} disabled={allIn} onClick={injectAll}>
      {allIn ? <><CheckIcon size={13} /> All injected</> : <><PlusIcon size={13} /> Inject all ({blocks.length})</>}
    </button>
  ) : undefined;

  return (
    <ModalView
      open
      onClose={onClose}
      size="xl"
      maxHeight="82vh"
      bodyStyle={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      headerColor="var(--color-scratchpad)"
      headerGradient
      headerIcon={<span className="dk-askai-mark"><SparkleIcon size={15} /></span>}
      title="Ask AI"
      subtitle="Describe a script. It is written with Daakia's script API and goes where it runs."
      headerRight={headerRight}
      footerLeft={footerLeft}
      footerRight={footerRight}
      noPadding
      className="dk-askai-modal"
    >
      <div className="dk-askai">
        {asking && (
          <div className="dk-askai-start">
            <div className="dk-askai-composer">
              <textarea
                ref={askRef}
                autoFocus
                value={ask}
                onChange={e => setAsk(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); } }}
                placeholder={'What should the script do?\n\nGet an Azure AD token before each request and send it as a Bearer header — or paste a Postman or Bruno script to convert it.'}
                rows={5}
                aria-label="What should the script do"
              />
              <div className="dk-askai-composer__bar">
                <div className="dk-askai-seg" role="radiogroup" aria-label="Where it goes">
                  {PLACEMENTS.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={placement === p.id}
                      className={placement === p.id ? 'is-on' : ''}
                      onClick={() => setPlacement(p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <span className="flex-1" />
                <kbd className="dk-askai-kbd">Ctrl Enter</kbd>
                <button type="button" className="dk-askai-go" disabled={!ask.trim()} onClick={generate}>
                  <SparkleIcon size={13} /> Generate
                </button>
              </div>
            </div>

            <div className="dk-askai-label">Start from</div>
            <div className="dk-askai-ideas">
              {IDEAS.map(idea => (
                <button
                  key={idea.title}
                  type="button"
                  className={`dk-askai-idea${ask === idea.ask ? ' is-on' : ''}`}
                  style={{ ['--idea' as string]: idea.color }}
                  onClick={() => pickIdea(idea.ask)}
                >
                  <span className="dk-askai-idea__icon">{idea.icon}</span>
                  <span className="dk-askai-idea__text">
                    <b>{idea.title}</b>
                    <span>{idea.detail}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="dk-askai-sent">
              <span className="dk-askai-sent__lead">Sent with it</span>
              <span className="dk-askai-pill">Script API</span>
              <span className="dk-askai-pill">{exampleCount} snippets</span>
              <span className="dk-askai-pill">Postman and Bruno</span>
              <span className="dk-askai-pill dk-askai-pill--mono">{(tab?.method || 'GET')} {(tab?.url || '').split('?')[0] || 'this request'}</span>
              <span className="dk-askai-pill" title={varNames.join(', ')}>
                {varNames.length} variable name{varNames.length === 1 ? '' : 's'}, no values
              </span>
            </div>
          </div>
        )}

        {!asking && streaming && !text && (
          <div className="dk-askai-wait">
            <span className="dk-askai-dots"><i /><i /><i /></span>
            Writing the script…
          </div>
        )}

        {!asking && error && <div className="dk-askai-error">{error}</div>}

        {!asking && (prose || blocks.length > 0) && (
          <div ref={scrollRef} className="dk-askai-answer">
            {prose && (
              <div className="dk-askai-prose">
                <MdViewer content={prose} />
                {streaming && <span className="dk-askai-caret" />}
              </div>
            )}

            {blocks.map((b, i) => {
              const other: ScriptTarget = b.target === 'pre-request' ? 'post-response' : 'pre-request';
              const went = injected[i] ?? [];
              return (
                <div key={i} className="dk-askai-block" style={{ ['--target' as string]: TARGET_COLOR[b.target] }}>
                  <div className="dk-askai-block__head">
                    <span className="dk-askai-block__tag">{SCRIPT_TARGET_LABEL[b.target]}</span>
                    <span className="dk-askai-block__lines">{b.code.split('\n').length} lines</span>
                    <span className="flex-1" />
                    {/* Where the AI said it goes first, the other script second. */}
                    {[b.target, other].map(t => {
                      const did = went.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          className={t === b.target ? `dk-askai-go dk-askai-go--sm${did ? ' is-done' : ''}` : `dk-askai-ghost${did ? ' is-done' : ''}`}
                          disabled={did}
                          onClick={() => inject(i, t, b.code)}
                          title={`Add this to the end of the ${SCRIPT_TARGET_LABEL[t]} script`}
                        >
                          {did ? <CheckIcon size={11} /> : <PlusIcon size={11} />}
                          {did ? `In ${SCRIPT_TARGET_LABEL[t]}` : `Inject into ${SCRIPT_TARGET_LABEL[t]}`}
                        </button>
                      );
                    })}
                  </div>
                  <EditorView value={b.code} language="javascript" readOnly height={editorHeight(b.code)} />
                </div>
              );
            })}

            {done && blocks.length === 0 && (
              <p className="dk-askai-note">The answer had no script in it. Try asking for the script itself.</p>
            )}
          </div>
        )}

        {done && (
          <div className="dk-askai-refine">
            <input
              value={followUp}
              onChange={e => setFollowUp(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') refine(); }}
              placeholder="Ask for a change: use a certificate, add a retry, log the expiry…"
              aria-label="Ask for a change"
            />
            <button type="button" className="dk-askai-go dk-askai-go--sm" disabled={!followUp.trim()} onClick={refine}>
              <SparkleIcon size={11} /> Update
            </button>
          </div>
        )}
      </div>
    </ModalView>
  );
}
