/**
 * Settings → Code Scan.
 *
 * ── What belongs on this page ──
 *
 * A scan has one knob that people actually reach for — the cap, when the
 * result says it was hit — and three that answer a question the scan itself
 * cannot: which folders in THIS repository are not worth walking, which
 * parsers to believe, and what the review screen should arrive with ticked.
 * Everything else about a scan is decided per scan, on the screen that runs
 * it, where the answer is in front of you.
 *
 * ── What is here to be read, not set ──
 *
 * The first panel is the read-only guarantee, and it is the most important
 * thing on the page: a scan opens files and nothing else. Somebody pointing
 * this at a repository they have just cloned deserves that in writing, next to
 * the settings rather than buried in a modal they have to open first.
 *
 * The always-skipped list is shown for the same reason — without it, the box
 * below invites people to type `node_modules` into a field that already
 * ignores it, and then to wonder why it made no difference.
 */
import { useEffect, useState } from 'react';
import { useUiStateStore, usePersistedPref } from '../../store/ui-state-store';
import {
  SCAN_MAX_FILES_KEY, SCAN_IGNORE_KEY, SCAN_DETECTORS_KEY,
  SCAN_CREATE_ENV_KEY, SCAN_PICK_INTERNAL_KEY,
  MAX_FILES_CHOICES, DEFAULT_MAX_FILES, DETECTOR_IDS, DETECTOR_LABELS,
  maxFiles, ignoreDirs, detectors, storeDetectors, flag, asFlag,
  type MaxFilesChoice, type DetectorId,
} from '../../services/scan/scan-settings';
import { SKIP_DIRS, DETECTOR_COLORS } from '@daakia/api-detector';
import { useScanStore } from '../../store/scan-store';
import {
  SearchIcon, FolderIcon, ShieldIcon, CodeBracketsIcon, CheckIcon, EyeIcon,
} from '../../icons';

const ACCENT = 'var(--color-sidebar-collections)';

const cardStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-surface-border)',
  maxWidth: '100%',
};

function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
    </div>
  );
}

function Card({ icon, title, children, body }: {
  icon: React.ReactNode;
  title: string;
  /** The explanation, above whatever control the card carries. */
  body: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 rounded-lg" style={cardStyle}>
      <div className="flex items-start gap-3">
        <span style={{ color: ACCENT, marginTop: 2, flexShrink: 0, display: 'inline-flex' }}>{icon}</span>
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            {title}
          </span>
          <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {body}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

function Chip({ on, label, onClick, mono, tone = ACCENT, dot }: {
  on: boolean; label: string; onClick: () => void; mono?: boolean;
  /** The chip's own colour. A list of six in one accent is not a list you can scan. */
  tone?: string;
  dot?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11.5px] px-2.5 py-1 rounded-full cursor-pointer transition-colors inline-flex items-center gap-1.5${mono ? ' tabular-nums' : ''}`}
      style={{
        color: on ? tone : 'var(--color-text-muted)',
        background: on ? `color-mix(in srgb, ${tone} 13%, transparent)` : 'none',
        border: `1px solid ${on ? `color-mix(in srgb, ${tone} 32%, transparent)` : 'var(--color-surface-border)'}`,
      }}
    >
      {dot && (
        <span style={{
          width: 6, height: 6, borderRadius: 999,
          background: on ? tone : 'var(--color-surface-border)',
          boxShadow: on ? `0 0 0 2px color-mix(in srgb, ${tone} 22%, transparent)` : undefined,
        }} />
      )}
      {label}
    </button>
  );
}

function Toggle({ on, onChange, label, description }: {
  on: boolean; onChange: (v: boolean) => void; label: string; description: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 px-4 py-3.5 rounded-lg cursor-pointer" style={cardStyle}>
      <input
        type="checkbox"
        checked={on}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: ACCENT, marginTop: 2, width: 15, height: 15 }}
      />
      <span className="flex flex-col gap-1.5 flex-1 min-w-0">
        <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{label}</span>
        <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {description}
        </span>
      </span>
    </label>
  );
}

export function CodeScanSettings() {
  const prefs = useUiStateStore(s => s.prefs);
  const setPref = useUiStateStore(s => s.setPref);

  const [cap, setCap] = usePersistedPref<MaxFilesChoice>(
    SCAN_MAX_FILES_KEY, String(DEFAULT_MAX_FILES) as MaxFilesChoice, MAX_FILES_CHOICES,
  );

  /*
    The ignore box is free text, so it is edited locally and written on every
    keystroke — `prefs` is the store of record, and a local draft that only
    committed on blur would lose what somebody typed if they navigated away.
  */
  const storedIgnore = prefs[SCAN_IGNORE_KEY] ?? '';
  const [ignoreText, setIgnoreText] = useState(storedIgnore);
  useEffect(() => { setIgnoreText(storedIgnore); }, [storedIgnore]);

  const chosen = detectors(prefs[SCAN_DETECTORS_KEY]);
  const allOn = chosen.length === DETECTOR_IDS.length;

  const toggleDetector = (id: DetectorId) => {
    const next = chosen.includes(id) ? chosen.filter(d => d !== id) : [...chosen, id];
    /* Ordered the way the list reads, so storing and re-reading is stable. */
    setPref(SCAN_DETECTORS_KEY, storeDetectors(DETECTOR_IDS.filter(d => next.includes(d))));
  };

  const parsed = ignoreDirs(ignoreText);
  const alreadySkipped = parsed.filter(d => SKIP_DIRS.includes(d));
  /* What the box actually adds — a name already on the built-in list adds
     nothing, and counting it would contradict the warning right above. */
  const adds = parsed.filter(d => !SKIP_DIRS.includes(d));

  return (
    <div className="flex flex-col gap-6 px-5 py-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[15px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          Code Scan
        </h2>
        <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)', maxWidth: '110ch' }}>
          Reads route declarations out of a repository and builds a collection from them.
          Open it from the Collections panel &mdash; the &#8942; menu, &ldquo;Scan code for
          requests&hellip;&rdquo;. What is here is what a scan cannot work out for itself.
        </p>
      </div>

      {/* The guarantee, first, because it is what somebody wants to know before
          they point this at a repository they did not write. */}
      <div className="flex flex-col gap-3">
        <SectionRule label="what a scan does" />
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-lg" style={cardStyle}>
          <ShieldIcon size={15} style={{ color: 'var(--color-success)', marginTop: 2, flexShrink: 0 }} />
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
              It opens files. That is all it does.
            </span>
            <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              Nothing is written into the repository, no build is run, no dependency is installed,
              and nothing leaves this machine &mdash; the parsing happens here and the result is a
              list you look at before anything is saved. Scanning a repository you have just cloned
              is exactly as safe as reading it.
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <SectionRule label="the walk" />

        <Card
          icon={<SearchIcon size={15} />}
          title="Stop after this many files"
          body={<>
            The usual reason a scan runs long is a folder nobody meant to scan &mdash; a home
            directory, a mono-repo, a <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>node_modules</code> the
            ignore list missed. The cap is a stop, not a guess: the review screen says when it was
            hit, so raise this in answer to that rather than in advance. The walk is breadth-first,
            so what a stopped scan has seen is the top of the tree, where configuration lives.
          </>}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            {MAX_FILES_CHOICES.map(c => (
              <Chip key={c} mono on={c === cap} label={c} onClick={() => setCap(c)} />
            ))}
          </div>
        </Card>

        <Card
          icon={<FolderIcon size={15} />}
          title="Folders to skip in your repositories"
          body={<>
            Directory <em>names</em>, not paths &mdash; the walk compares each folder to its own
            name, so <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>fixtures</code> skips
            every <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>fixtures</code> in the
            tree. Separate them with commas or new lines. This is for generated code and test
            fixtures whose routes are real but are not yours to call.
          </>}
        >
          <textarea
            value={ignoreText}
            onChange={e => { setIgnoreText(e.target.value); setPref(SCAN_IGNORE_KEY, e.target.value); }}
            rows={2}
            spellCheck={false}
            placeholder="fixtures, testdata, generated"
            className="text-[11.5px] px-2.5 py-2 rounded-md w-full resize-y"
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              background: 'var(--color-panel)',
              border: '1px solid var(--color-surface-border)',
              color: 'var(--color-text-primary)',
              outlineColor: ACCENT,
            }}
          />

          <div className="flex flex-col gap-2">
            <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
              Always skipped, whatever is in the box:
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              {SKIP_DIRS.map(d => (
                <span
                  key={d}
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    color: 'var(--color-text-muted)',
                    background: 'color-mix(in srgb, var(--color-text-muted) 9%, transparent)',
                  }}
                >{d}</span>
              ))}
            </div>
            {alreadySkipped.length > 0 && (
              /* Said rather than silently ignored: a name that changes nothing
                 looks like a setting that does not work. */
              <span className="text-[10.5px]" style={{ color: 'var(--color-warning)' }}>
                {alreadySkipped.join(', ')} {alreadySkipped.length === 1 ? 'is' : 'are'} already
                skipped &mdash; leaving {alreadySkipped.length === 1 ? 'it' : 'them'} here changes nothing.
              </span>
            )}
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <SectionRule label="parsers" />
        <Card
          icon={<CodeBracketsIcon size={15} />}
          title="Which frameworks to look for"
          body={<>
            All of them, unless a parser is wrong about a particular repository. This is not a speed
            setting &mdash; a detector that does not recognise a repository costs nothing to leave
            on, because each one checks the manifests before it reads a single source file. Turn
            every one off and the scan runs all of them again: a scan that silently found nothing
            would be worse than one that ignores the instruction.
          </>}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            {DETECTOR_IDS.map(id => (
              <Chip
                key={id}
                dot
                tone={DETECTOR_COLORS[id]}
                on={chosen.includes(id)}
                label={DETECTOR_LABELS[id]}
                onClick={() => toggleDetector(id)}
              />
            ))}
          </div>
          {!allOn && (
            <span className="text-[10.5px] flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
              <CheckIcon size={11} style={{ color: ACCENT }} />
              {chosen.length} of {DETECTOR_IDS.length} will run.
              <button
                type="button"
                onClick={() => setPref(SCAN_DETECTORS_KEY, '')}
                className="cursor-pointer underline"
                style={{ color: ACCENT, background: 'none', border: 'none', padding: 0, font: 'inherit' }}
              >
                Turn all back on
              </button>
            </span>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <SectionRule label="what a scan arrives with" />

        <Toggle
          label="Create an environment for the base URL"
          description={<>
            Every request a scan writes is against <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>{'{{baseUrl}}'}</code>,
            read from the repository&rsquo;s own configuration &mdash; its port and context path. Without
            an environment holding that variable, the collection points at nothing. Ticked here means
            ticked when the destination screen opens; it is still a checkbox there.
          </>}
          on={flag(prefs[SCAN_CREATE_ENV_KEY], true)}
          onChange={v => setPref(SCAN_CREATE_ENV_KEY, asFlag(v))}
        />

        <Toggle
          label="Select internal and actuator endpoints too"
          description={<>
            Paths under <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>/internal</code>,{' '}
            <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>/actuator</code> or{' '}
            <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>/admin</code> are always found and
            always listed &mdash; they are real endpoints. They just arrive unticked, because a
            collection somebody is about to run is usually not what they were looking for. Turn this
            on if they are exactly what you are looking for.
          </>}
          on={flag(prefs[SCAN_PICK_INTERNAL_KEY], false)}
          onChange={v => setPref(SCAN_PICK_INTERNAL_KEY, asFlag(v))}
        />
      </div>

      <div className="flex flex-col gap-3">
        <SectionRule label="try it" />
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-lg" style={cardStyle}>
          <EyeIcon size={15} style={{ color: ACCENT, marginTop: 2, flexShrink: 0 }} />
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              A scan reads {maxFiles(prefs[SCAN_MAX_FILES_KEY]).toLocaleString()} files at most
              {adds.length > 0 ? `, skipping ${adds.length} folder name${adds.length === 1 ? '' : 's'} of yours` : ''}
              {allOn ? ', looking for all six frameworks' : `, looking only for ${chosen.map(id => DETECTOR_LABELS[id]).join(', ')}`}.
            </span>
            <button
              type="button"
              onClick={() => useScanStore.getState().openScan()}
              className="text-[11.5px] px-2.5 py-1 rounded-md cursor-pointer self-start"
              style={{
                color: ACCENT,
                background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)`,
              }}
            >
              Scan a repository&hellip;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
