/**
 * Bringing a theme in — from a file, from the clipboard, or from a model.
 *
 * All three land in the same textarea and go through the same parser, and that
 * is the design rather than a shortcut. A theme is thirty-odd colour strings
 * that end up in CSS, and the only safe way to treat one is as text somebody
 * has to look at before it applies. Reading a file straight into the store
 * would skip the looking; so would applying a model's answer because a model
 * produced it.
 *
 * The file is read with `FileReader` in the webview. Nothing is sent to the
 * extension host, so no path crosses that boundary and there is no file API to
 * point at something it should not open — the browser has already decided
 * which file the user picked.
 */
import { useEffect, useState } from 'react';
import {
  ModalView, ButtonView, MultilineInputView, TextInputView,
  IconSize, BadgeChipView,
  parseTerminalThemes, serializeTerminalThemes, terminalThemeTemplate,
} from '@salilvnair/dui';
import { UploadIcon, SparkleIcon, WarningTriangleIcon, CheckCircleIcon } from '../../../icons';
import { useDk8sTerminalStore } from '../../../store/dk8s-terminal-store';
import { useDk8sAiStore } from '../../../store/dk8s-ai-store';
import { softPrimary } from '../../k8s/button-style';
import { ACCENT, AI, BAD, OK, WARN } from '../../k8s/tone';
import { ThemePreview } from './ThemePreview';

/**
 * A ceiling on what will be read out of a dropped file.
 *
 * A theme is a couple of kilobytes. Anything past this is not one, and finding
 * that out by reading a gigabyte into a string is how a tab stops responding.
 */
const MAX_FILE = 2_000_000;

/**
 * Pull the JSON out of an answer that may have prose around it.
 *
 * Models are asked for bare JSON and mostly comply, but "Here is a theme:"
 * followed by a fenced block is common enough that refusing it would be
 * pedantry. Taking the outermost braces is not a parser — whatever comes out
 * still goes through the real one, which is where the actual decision is made.
 */
function jsonIn(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const a = body.indexOf('{');
  const b = body.lastIndexOf('}');
  return a >= 0 && b > a ? body.slice(a, b + 1) : body.trim();
}

export function ThemeImportModal({ onClose }: { onClose: () => void }) {
  const importThemes = useDk8sTerminalStore(s => s.importThemes);
  const ask = useDk8sAiStore(s => s.ask);
  const closeAiPanel = useDk8sAiStore(s => s.closePanel);
  const answers = useDk8sAiStore(s => s.answers);

  const [text, setText] = useState('');
  const [wish, setWish] = useState('');
  const [askedId, setAskedId] = useState<string>();
  const [note, setNote] = useState<{ tone: 'bad' | 'ok'; message: string }>();

  /*
    The generated answer is watched rather than awaited.

    `ask` streams into the AI store and returns nothing; the panel it would
    normally open is closed immediately, because the answer belongs in the box
    below rather than in an overlay on top of this dialog.
  */
  const pending = askedId ? answers.find(a => a.id === askedId) : undefined;
  useEffect(() => {
    if (!pending || pending.streaming) return;
    setAskedId(undefined);
    if (pending.error) { setNote({ tone: 'bad', message: pending.error }); return; }
    setText(jsonIn(pending.text));
    setNote(undefined);
  }, [pending]);

  // Parsed on every keystroke so the preview and the error are both live —
  // the same call the store will make, so what is shown is what will apply.
  const parsed = text.trim() ? parseTerminalThemes(text) : undefined;

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE) {
      setNote({ tone: 'bad', message: `${file.name} is ${Math.round(file.size / 1024)} KB — too large to be a theme.` });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { setText(String(reader.result ?? '')); setNote(undefined); };
    reader.onerror = () => setNote({ tone: 'bad', message: `${file.name} could not be read.` });
    reader.readAsText(file);
  };

  const generate = () => {
    const want = wish.trim();
    if (!want) return;
    setNote(undefined);
    setText('');
    /*
      The template goes with the question.

      Asking for "a terminal theme" gets prose about terminal themes. Asking
      for a filled-in copy of an exact object gets an object, and it is also
      what makes the answer parseable without the model having to be told a
      schema in English.
    */
    ask({
      promptKey: 'dk8s.terminal.theme',
      title: `Terminal theme: ${want}`,
      evidence: serializeTerminalThemes([terminalThemeTemplate('generated-theme', want.slice(0, 40))]),
      evidenceLabel: 'THEME TEMPLATE',
      podContext: {},
      question: want,
    });
    closeAiPanel();
    setAskedId(useDk8sAiStore.getState().activeId);
  };

  const apply = () => {
    const r = importThemes(text);
    if (!r.ok) { setNote({ tone: 'bad', message: r.error ?? 'That theme could not be imported.' }); return; }
    const parts = [
      r.added ? `${r.added} added` : '',
      r.replaced ? `${r.replaced} replaced` : '',
    ].filter(Boolean).join(', ');
    setNote({ tone: 'ok', message: `Imported — ${parts}.` });
    setText('');
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="Import a theme"
      subtitle="Paste it, drop a file, or describe one"
      size="lg"
      headerColor={ACCENT}
      footerRight={
        <div className="flex items-center gap-2">
          <ButtonView label="Close" size="sm" variant="secondary" onClick={onClose} />
          <ButtonView
            label={parsed?.ok
              ? `Import ${parsed.themes.length} theme${parsed.themes.length === 1 ? '' : 's'}`
              : 'Import'}
            size="sm" variant="secondary"
            disabled={!parsed?.ok}
            accentColor={ACCENT}
            color={parsed?.ok ? ACCENT : 'var(--color-text-muted)'}
            onClick={apply}
            style={softPrimary(ACCENT, !!parsed?.ok)}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-3" style={{ minWidth: 520 }}>
        {/* ── Describe one ── */}
        <div className="flex items-end gap-2">
          <div className="flex-1 flex flex-col gap-1.5">
            <span className="text-[9.5px] uppercase tracking-wider text-[var(--color-text-muted)]">
              Generate with AI
            </span>
            <TextInputView
              size="sm"
              accentColor={AI}
              placeholder="warm low-contrast, amber accents, easy at night"
              value={wish}
              onChange={e => setWish(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') generate(); }}
            />
          </div>
          <ButtonView
            label={askedId ? 'Generating…' : 'Generate'}
            size="sm" variant="secondary"
            disabled={!wish.trim() || !!askedId}
            accentColor={AI}
            color={AI}
            onClick={generate}
            style={softPrimary(AI, !!wish.trim() && !askedId)}
            iconLeft={<SparkleIcon size={IconSize.chip} />}
          />
        </div>

        {/* ── Or bring one ── */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[9.5px] uppercase tracking-wider text-[var(--color-text-muted)]">
              Theme JSON
            </span>
            <span className="flex-1" />
            <label
              className="flex items-center gap-1.5 cursor-pointer text-[10.5px]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <UploadIcon size={IconSize.inline} />
              Choose a file
              <input
                type="file" accept="application/json,.json" className="hidden"
                onChange={e => { onFiles(e.target.files); e.target.value = ''; }}
              />
            </label>
          </div>
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
          >
            <MultilineInputView
              size="sm" rows={9} resize="vertical"
              accentColor={ACCENT}
              spellCheck={false}
              placeholder='{ "id": "my-theme", "label": "My Theme", "dark": { … } }'
              value={text}
              error={!!text.trim() && !parsed?.ok}
              onChange={e => { setText(e.target.value); setNote(undefined); }}
              style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 11 }}
            />
          </div>
        </div>

        {/* What the parser made of it, stated the moment it can be. */}
        {text.trim() && parsed && !parsed.ok && (
          <div className="flex items-start gap-2 text-[11px]" style={{ color: BAD }}>
            <WarningTriangleIcon size={IconSize.action} />
            <span>{parsed.error}</span>
          </div>
        )}
        {parsed?.ok && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <CheckCircleIcon size={IconSize.action} color={OK} />
              {parsed.themes.map(t => (
                <BadgeChipView key={t.id} tone={OK} size="xs">{t.label}</BadgeChipView>
              ))}
              {parsed.themes.some(t => t.lightDerived) && (
                <BadgeChipView tone={WARN} size="xs">light auto</BadgeChipView>
              )}
            </div>
            {/* Both halves, side by side.

                A theme is imported once and lived with on whatever ground the
                panel happens to be, so the moment to see the light variant is
                before it applies — especially when it was computed rather than
                authored. */}
            <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] uppercase tracking-wider"
                      style={{ color: 'var(--color-text-muted)' }}>on dark</span>
                <ThemePreview palette={parsed.themes[0]} background="#16161c" rows={6} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] uppercase tracking-wider"
                      style={{ color: 'var(--color-text-muted)' }}>
                  on light{parsed.themes[0].lightDerived ? ' · computed' : ''}
                </span>
                <ThemePreview palette={parsed.themes[0]} background="#f7f7f5" rows={6} />
              </div>
            </div>
          </div>
        )}

        {note && (
          <div className="flex items-center gap-2 text-[11px]"
               style={{ color: note.tone === 'bad' ? BAD : OK }}>
            {note.tone === 'bad'
              ? <WarningTriangleIcon size={IconSize.action} />
              : <CheckCircleIcon size={IconSize.action} />}
            <span>{note.message}</span>
          </div>
        )}
      </div>
    </ModalView>
  );
}
