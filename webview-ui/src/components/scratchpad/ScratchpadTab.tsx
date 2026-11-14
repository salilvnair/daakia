/**
 * One scratchpad, open in a tab: Monaco, the file's place and type above it,
 * and no Save button — what you type is written as you type it.
 */
import { useEffect, useState } from 'react';
import { ButtonView } from '@salilvnair/dui';
import { CodeEditor, type CodeLanguage } from '../shared/editors/CodeEditor';
import { ContextMenu, type ContextMenuItem } from '../shared';
import {
  useScratchpadStore, SCRATCHPAD_TYPES, SCRATCHPAD_TYPE_ORDER, scratchpadFileName, folderPath,
  type ScratchpadType,
} from '../../store/scratchpad-store';
import { useTabsStore, type RequestTab } from '../../store/tabs-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { useToastStore } from '../../store/toast-store';
import { copyText } from '../../utils/clipboard';
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, CopyIcon, WrapLinesIcon, CodeBracketsIcon } from '../../icons';
import { relativeTime, canFormat, formatScratchpad } from './scratchpad-format';
import './scratchpad.css';

const LANGUAGE: Record<ScratchpadType, CodeLanguage> = {
  json: 'json', xml: 'xml', yml: 'yaml', sql: 'sql', txt: 'plaintext',
};

const WRAP_PREF = 'scratchpads.wordWrap';

export function ScratchpadTab({ tab }: { tab: RequestTab }) {
  const pad = useScratchpadStore(s => s.files.find(f => f.id === tab.scratchpadId));
  const folders = useScratchpadStore(s => s.folders);
  const loaded = useScratchpadStore(s => s.loaded);
  const lastDeleted = useScratchpadStore(s => s.lastDeleted);
  const wrap = useUiStateStore(s => s.prefs[WRAP_PREF]) === 'true';
  const [typeMenu, setTypeMenu] = useState<{ x: number; y: number } | null>(null);
  const [, tick] = useState(0);

  useEffect(() => { useScratchpadStore.getState().load(); }, []);
  /* "Saved · 2 min ago" has to move on by itself. */
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!loaded) {
    return <div className="dk-scratch dk-scratch--empty">Opening scratchpad…</div>;
  }

  if (!pad) {
    const canUndo = lastDeleted?.id === tab.scratchpadId;
    return (
      <div className="dk-scratch dk-scratch--empty">
        <div className="dk-scratch__empty-title">This scratchpad was deleted</div>
        <div className="dk-scratch__empty-row">
          {canUndo && <ButtonView size="sm" onClick={() => useScratchpadStore.getState().undoRemove()}>Undo delete</ButtonView>}
          <ButtonView size="sm" variant="ghost" onClick={() => useTabsStore.getState().closeTab(tab.id)}>Close tab</ButtonView>
        </div>
      </div>
    );
  }

  const meta = SCRATCHPAD_TYPES[pad.type];
  const typeItems: ContextMenuItem[] = [
    { id: 'heading', label: 'Change type', heading: true },
    ...SCRATCHPAD_TYPE_ORDER.map(k => ({
      id: k,
      label: SCRATCHPAD_TYPES[k].label,
      icon: <span className="dk-scratch-badge" style={{ color: SCRATCHPAD_TYPES[k].color }}>{SCRATCHPAD_TYPES[k].badge}</span>,
      checked: k === pad.type,
      shortcut: `.${SCRATCHPAD_TYPES[k].ext}`,
    })),
  ];

  const format = () => {
    const out = formatScratchpad(pad.type, pad.content);
    if (out === null) {
      useToastStore.getState().addToast({ type: 'warning', message: `This is not valid ${meta.label}, so it was left as it is.` });
      return;
    }
    useScratchpadStore.getState().setContent(pad.id, out);
  };

  const copy = async () => {
    const ok = await copyText(pad.content);
    useToastStore.getState().addToast(ok
      ? { type: 'success', message: `Copied ${scratchpadFileName(pad)}` }
      : { type: 'error', message: 'The clipboard refused the copy. Select the text and press Ctrl+C.' });
  };

  return (
    <div className="dk-scratch">
      <div className="dk-scratch__bar">
        <div className="dk-scratch__crumb" title={`${folderPath(folders, pad.folderId)} / ${scratchpadFileName(pad)}`}>
          <span className="dk-scratch__crumb-folder">{folderPath(folders, pad.folderId)}</span>
          <ChevronRightIcon size={11} />
          <span className="dk-scratch__crumb-file">{scratchpadFileName(pad)}</span>
        </div>
        <button
          type="button"
          className="dk-scratch__type"
          aria-haspopup="menu"
          title="Change type"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setTypeMenu({ x: r.left, y: r.bottom + 4 });
          }}
        >
          <span className="dk-scratch__dot" style={{ background: meta.color }} />
          {meta.label}
          <ChevronDownIcon size={11} />
        </button>

        <div className="flex-1" />

        <div className="dk-scratch__saved" role="status">
          <CheckIcon size={13} />
          <span className="dk-scratch__saved-word">Saved</span>
          <span>· {relativeTime(pad.updatedAt)}</span>
        </div>
        <span className="dk-scratch__rule" />
        {canFormat(pad.type) && (
          <button type="button" className="dk-scratch__tool" onClick={format} title="Format">
            <CodeBracketsIcon size={13} /> Format
          </button>
        )}
        <button type="button" className="dk-scratch__tool dk-scratch__tool--icon" onClick={copy} title="Copy contents" aria-label="Copy contents">
          <CopyIcon size={13} />
        </button>
        <button
          type="button"
          className={`dk-scratch__tool dk-scratch__tool--icon${wrap ? ' dk-scratch__tool--on' : ''}`}
          onClick={() => useUiStateStore.getState().setPref(WRAP_PREF, wrap ? 'false' : 'true')}
          title={wrap ? 'Word wrap: on' : 'Word wrap: off'}
          aria-label="Toggle word wrap"
          aria-pressed={wrap}
        >
          <WrapLinesIcon size={13} />
        </button>
      </div>

      <div className="dk-scratch__editor">
        <CodeEditor
          key={pad.id}
          value={pad.content}
          onChange={(v) => useScratchpadStore.getState().setContent(pad.id, v)}
          language={LANGUAGE[pad.type]}
          height="100%"
          fontSize={13}
          wordWrap={wrap}
          placeholder="Start typing. Every change saves itself."
          editorOptions={{ minimap: true, lineNumbers: 'on' }}
        />
      </div>

      {typeMenu && (
        <ContextMenu
          items={typeItems}
          position={typeMenu}
          onSelect={(id) => {
            if (id in SCRATCHPAD_TYPES) useScratchpadStore.getState().changeType(pad.id, id as ScratchpadType);
            setTypeMenu(null);
          }}
          onClose={() => setTypeMenu(null)}
        />
      )}
    </div>
  );
}
