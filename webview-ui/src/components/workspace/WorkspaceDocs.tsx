/**
 * The workspace's documentation.
 *
 * A workspace is where somebody new to the project lands, and without this the
 * only thing telling them anything is the collection names.
 *
 * ── One document, two views ──
 *
 * Rich Text and Markdown are the same document rendered differently, stored as
 * Markdown either way. The toggle that quietly loses your formatting when you
 * switch is what makes these untrustworthy elsewhere; here the Markdown view is
 * the source and the rich view is a rendering of it, so there is nothing to
 * lose in either direction.
 *
 * ── Save is a button ──
 *
 * Documentation is prose somebody is part-way through writing. Autosaving a
 * half-finished sentence into what the whole team reads is worse than pressing
 * something.
 */
import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore, type Workspace } from '../../store/workspace-store';
import { MdViewer } from '../shared/display/MdViewer';
import { sendAiRequest } from '../../services/ai/ai-client';
import { isAiFeatureOn } from '../../store/ai-features-store';
import { postMsg } from '../../vscode';
import {
  DocumentIcon, CloseIcon, SparkleIcon, PlusIcon, SpinnerIcon,
} from '../../icons';

type View = 'rich' | 'markdown';

export function WorkspaceDocs({ workspace }: { workspace?: Workspace }) {
  const saveDocs = useWorkspaceStore(s => s.saveDocs);
  const [open, setOpen] = useState(true);
  const [view, setView] = useState<View>('rich');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [proposal, setProposal] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const saved = workspace?.docs ?? '';

  /* A different workspace is a different document. Anything half-typed belongs
     to the workspace it was typed in, so it does not follow you across. */
  useEffect(() => {
    setDraft(saved);
    setDirty(false);
    setEditing(false);
    setProposal(null);
  }, [workspace?.id, saved]);

  if (!open) {
    return (
      <button type="button" className="ws-docs-reopen" onClick={() => setOpen(true)} title="Documentation">
        <DocumentIcon size={14} />
      </button>
    );
  }

  const hasContent = draft.trim().length > 0;

  return (
    <aside className="ws-docs">
      <div className="ws-docs-head">
        <DocumentIcon size={12} />
        Documentation
        {dirty && <span className="ws-docs-dirty" title="Unsaved changes" />}
        {/* dui_modal__close-btn is the app's close button: muted until hover,
            then a red tint and a squeeze on press. Reusing the class rather
            than restyling an X keeps every dismiss in Daakia behaving the
            same. */}
        <button type="button" className="ws-docs-x dui_modal__close-btn"
                onClick={() => setOpen(false)} title="Close">
          ✕
        </button>
      </div>

      {(editing || hasContent) && (
        <div className="ws-docs-tools">
          <div className="ws-docs-seg">
            <button
              type="button"
              className={view === 'rich' ? 'on' : ''}
              onClick={() => setView('rich')}
            >Rich Text</button>
            <button
              type="button"
              className={view === 'markdown' ? 'on' : ''}
              onClick={() => setView('markdown')}
            >Markdown</button>
          </div>
        </div>
      )}

      <div className="ws-docs-body">
        {!editing && !hasContent ? (
          <DocsEmpty
            generating={generating}
            onWrite={() => { setEditing(true); setView('markdown'); }}
            onGenerate={() => runGenerate({ setGenerating, setProposal, setDraft, setEditing, setDirty, setView, hasContent })}
          />
        ) : view === 'markdown' || editing ? (
          <textarea
            ref={areaRef}
            className="ws-docs-editor"
            value={draft}
            placeholder={'# What this project is\n\nSetup, key workflows, anything the next person needs.'}
            onChange={e => { setDraft(e.target.value); setDirty(true); }}
          />
        ) : (
          <div className="ws-docs-rendered" onDoubleClick={() => { setEditing(true); setView('markdown'); }}>
            <MdViewer content={draft} />
          </div>
        )}
      </div>

      {proposal !== null && (
        <DocsProposal
          onAccept={() => { setDraft(proposal); setDirty(true); setEditing(true); setView('markdown'); setProposal(null); }}
          onDiscard={() => setProposal(null)}
        />
      )}

      {(editing || hasContent) && (
        <div className="ws-docs-foot">
          <button
            type="button"
            className="ws-docs-ai"
            disabled={generating}
            title="Draft from what is in this workspace"
            onClick={() => runGenerate({ setGenerating, setProposal, setDraft, setEditing, setDirty, setView, hasContent })}
          >
            {generating ? <SpinnerIcon size={11} /> : <SparkleIcon size={11} />}
            {generating ? 'Drafting' : 'Generate with AI'}
          </button>
          <button
            type="button"
            className="ws-docs-save"
            disabled={!dirty || !workspace}
            onClick={() => { if (workspace) { saveDocs(workspace.id, draft); setDirty(false); setEditing(false); } }}
          >
            Save
          </button>
        </div>
      )}
    </aside>
  );
}

function DocsEmpty({ onWrite, onGenerate, generating }: {
  onWrite: () => void; onGenerate: () => void; generating: boolean;
}) {
  return (
    <div className="ws-docs-empty">
      <DocumentIcon size={28} />
      <p>Say what this project is, so the next person does not have to read the requests to find out.</p>
      <ul className="ws-docs-list">
        <li>Project overview</li>
        <li>Setup instructions</li>
        <li>Key workflows</li>
        <li>Resources &amp; FAQs</li>
      </ul>
      <div className="ws-docs-btns">
        <button type="button" className="ws-docs-btn ws-docs-btn--primary" onClick={onWrite}>
          <PlusIcon size={11} /> Add documentation
        </button>
        <button type="button" className="ws-docs-btn ws-docs-btn--ai" onClick={onGenerate} disabled={generating}>
          {generating ? <SpinnerIcon size={11} /> : <SparkleIcon size={11} />}
          {generating ? 'Drafting' : 'Generate with AI'}
        </button>
      </div>
    </div>
  );
}

/**
 * An AI draft never lands on top of what somebody wrote.
 *
 * A documentation panel that silently replaces the paragraph you just typed is
 * a data-loss bug with a friendly button on it, so a draft arrives as something
 * to accept or throw away.
 */
function DocsProposal({ onAccept, onDiscard }: { onAccept: () => void; onDiscard: () => void }) {
  return (
    <div className="ws-docs-proposal">
      <span>A draft is ready. It replaces what is in the editor.</span>
      <button type="button" onClick={onAccept}>Use it</button>
      <button type="button" className="ws-docs-proposal-no" onClick={onDiscard}>Discard</button>
    </div>
  );
}

// ── Generate with AI ─────────────────────────────────────────────────────────

/**
 * Draft the documentation from what is actually in the workspace.
 *
 * The facts come from the host, which is the side that has the whole tree — the
 * webview only knows what some panel happened to load, so a draft written from
 * here would describe a fraction of the project and say nothing about the rest.
 * The host also enforces the redaction: names of collections, hosts and
 * environment variables, never a value.
 */
function runGenerate(ctx: {
  setGenerating: (v: boolean) => void;
  setProposal: (v: string | null) => void;
  setDraft: (v: string) => void;
  setEditing: (v: boolean) => void;
  setDirty: (v: boolean) => void;
  setView: (v: View) => void;
  hasContent: boolean;
}) {
  if (!isAiFeatureOn('workspaceDocGenerator')) return;
  ctx.setGenerating(true);

  /* Ask the host what is here, then ask the model. One listener for the reply,
     removed either way — a listener left behind would answer the *next*
     generate as well, and write the previous draft over the new one. */
  const onContext = (event: MessageEvent) => {
    const msg = event.data as DocsContext & { type?: string };
    if (msg?.type !== 'workspaceDocsContext') return;
    window.removeEventListener('message', onContext);
    askModel(ctx, msg);
  };
  window.addEventListener('message', onContext);
  postMsg({ type: 'workspaceDocsContext' });

  /* If the host never answers, the button must not spin for ever. */
  window.setTimeout(() => {
    window.removeEventListener('message', onContext);
    ctx.setGenerating(false);
  }, 8000);
}

interface DocsContext {
  workspace?: string;
  collections?: string[];
  hosts?: string[];
  variableNames?: string[];
}

function askModel(ctx: Parameters<typeof runGenerate>[0], facts: DocsContext) {
  let text = '';

  const finish = (ok: boolean) => {
    ctx.setGenerating(false);
    if (!ok || !text.trim()) return;
    if (ctx.hasContent) {
      // Never on top of what somebody wrote.
      ctx.setProposal(text);
    } else {
      ctx.setDraft(text);
      ctx.setDirty(true);
      ctx.setEditing(true);
      ctx.setView('markdown');
    }
  };

  const id = sendAiRequest({
    stage: 'workspace.docs.generate',
    screen: 'Workspace · Overview',
    feature: 'workspaceDocGenerator',
    userPrompt: promptFor(facts),
  });

  const onReply = (event: MessageEvent) => {
    const msg = event.data as { type?: string; tabId?: string; content?: string };
    if (msg?.tabId !== id) return;
    if (msg.type === 'ai:chunk') text += msg.content ?? '';
    if (msg.type === 'ai:done') { window.removeEventListener('message', onReply); finish(true); }
    if (msg.type === 'ai:error') { window.removeEventListener('message', onReply); finish(false); }
  };
  window.addEventListener('message', onReply);
}

function promptFor(f: DocsContext): string {
  const list = (xs?: string[]) => (xs && xs.length ? xs.join(', ') : '(none yet)');
  return [
    `Write the README for an API workspace called "${f.workspace ?? 'this workspace'}", in Markdown.`,
    'Cover what the project is, how to set it up, and the workflows that matter.',
    'Be concrete and brief. Do not invent endpoints, credentials or behaviour that is not implied below;',
    'where something is unknown, say so rather than filling it in.',
    '',
    `Collections and folders: ${list(f.collections)}`,
    `Hosts these requests call: ${list(f.hosts)}`,
    `Environment variables that must be set (names only, values deliberately withheld): ${list(f.variableNames)}`,
  ].join('\n');
}
