/**
 * Screen 17E — copying a field map between repositories.
 *
 * An organisation with twelve product repositories and one template set should
 * configure this once, not twelve times.
 *
 * The dialog does the check before it offers the copy, dimension by dimension,
 * because a map that mostly does not fit is worse than no map: the result looks
 * configured and two of its columns are empty for a reason nobody can see. So
 * it reports "3 of 7 apply" rather than claiming success.
 */
import { useEffect, useState } from 'react';
import { ModalView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { Ico } from './GhIcons';
import { Dk, GhNote } from './GhShell';
import { ACCENT } from './types';
import {
  check, exportable, mapOf, readMapFile, skippedLines, tally,
  type Check, type MapField,
} from './field-map';
import type { ProposedDimension } from './board-types';

interface Source {
  repo: string;
  fields: MapField[];
  error?: string;
}

export function GhCopyMap({ repo, recent, dimensions, project, onCancel, onCopy }: {
  repo: string;
  /** Repositories dkgh already knows about, most recent first. */
  recent: string[];
  /** What this repository declares — the thing being checked against. */
  dimensions: ProposedDimension[];
  /** This repository's Project single-selects, if it has a Project. */
  project: { name: string; options: string[] }[];
  onCancel: () => void;
  /** The fields that fit, applied here. */
  onCopy: (fields: MapField[]) => void;
}) {
  const [from, setFrom] = useState<string>(recent[0] ?? '');
  const [source, setSource] = useState<Source | undefined>();
  const [loading, setLoading] = useState(false);
  const [pasted, setPasted] = useState('');
  const [showPaste, setShowPaste] = useState(false);

  const here = {
    dimensions: mapOf(dimensions, project),
    hasProject: project.length > 0,
  };

  useEffect(() => {
    if (!from) return;
    setLoading(true);
    setSource(undefined);
    const onMsg = (e: MessageEvent) => {
      const msg = e.data as Record<string, unknown>;
      if (msg?.type !== 'dkgh:fieldMap:result' || msg.repo !== from) return;
      setLoading(false);
      setSource({
        repo: from,
        fields: mapOf(
          (msg.dimensions as ProposedDimension[]) ?? [],
          (msg.project as { name: string; options: string[] }[]) ?? [],
        ),
        error: msg.error as string | undefined,
      });
    };
    window.addEventListener('message', onMsg);
    postMsg({ type: 'dkgh:fieldMap', repo: from });
    return () => window.removeEventListener('message', onMsg);
  }, [from]);

  const fileMap = showPaste ? readMapFile(pasted) : undefined;
  const fields = fileMap?.fields ?? source?.fields ?? [];
  const checks: Check[] = fields.length > 0 ? check(fields, here) : [];
  const applying = checks.filter(c => c.applies).map(c => c.field);
  const skipped = skippedLines(checks);

  return (
    <ModalView
      open
      onClose={onCancel}
      size="md"
      headerGradient
      headerColor={ACCENT}
      headerIcon={<Ico name="copy" />}
      title="Copy a field map"
      subtitle={repo}
      footerLeft={
        <Dk><span className="sub">
          {checks.length > 0 ? tally(checks) : 'nothing read yet'}
        </span></Dk>
      }
      footerRight={
        <Dk>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="btn"
              title="Write this repository's own map to a file"
              onClick={() => postMsg({
                type: 'dkgh:export',
                filename: 'field-map.json',
                text: JSON.stringify(exportable(repo, here.dimensions), null, 2),
              })}
            >
              <Ico name="dl" />Export mine
            </button>
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
            <button
              type="button"
              className="btn go"
              disabled={applying.length === 0}
              onClick={() => onCopy(applying)}
            >
              Copy those {applying.length}
            </button>
          </span>
        </Dk>
      }
    >
      <Dk>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13.2 }}>
          <div className="fieldrow">
            <span className="fl">From</span>
            <div className="vlist" style={{ border: '1px solid var(--dk-border)',
                                            borderRadius: 9.6, overflow: 'hidden' }}>
              {recent.map(r => (
                <button
                  key={r}
                  type="button"
                  className="vrow"
                  style={{
                    width: '100%',
                    background: !showPaste && from === r
                      ? 'color-mix(in srgb, var(--dk-gh) 9%, transparent)'
                      : undefined,
                  }}
                  onClick={() => { setShowPaste(false); setFrom(r); }}
                >
                  <Ico name="repo" style={!showPaste && from === r
                    ? { color: 'var(--dk-gh)' } : undefined} />
                  <b>{r}</b>
                  {!showPaste && from === r && source && (
                    <span className="cx">{source.fields.length} dimensions</span>
                  )}
                  <span className="sp" />
                  {!showPaste && from === r && (
                    <span style={{ fontSize: 11.4, color: 'var(--dk-gh)' }}>selected</span>
                  )}
                </button>
              ))}
              <button
                type="button"
                className="vrow"
                style={{
                  width: '100%',
                  background: showPaste
                    ? 'color-mix(in srgb, var(--dk-gh) 9%, transparent)' : undefined,
                }}
                onClick={() => setShowPaste(true)}
              >
                <Ico name="dl" style={showPaste ? { color: 'var(--dk-gh)' } : undefined} />
                A file&hellip;
                <span className="cx">field-map.json</span>
                <span className="sp" />
                {showPaste && (
                  <span style={{ fontSize: 11.4, color: 'var(--dk-gh)' }}>selected</span>
                )}
              </button>
            </div>
          </div>

          {showPaste && (
            <div className="fieldrow">
              <span className="fl">Paste the file</span>
              {/* Pasted rather than picked: a webview has no file dialog, and
                  a button that opens nothing is worse than a box. */}
              <textarea
                className="inp"
                style={{ minHeight: 84, fontFamily: 'var(--mono)', fontSize: 11.4 }}
                value={pasted}
                placeholder='{ "kind": "dkgh-field-map", … }'
                onChange={e => setPasted(e.target.value)}
                aria-label="field-map.json"
              />
              {pasted.trim() && !fileMap && (
                <div style={{ fontSize: 11.4, color: 'var(--dk-red)' }}>
                  That is not a dkgh field map. A JSON file that happens to have a
                  <code> fields</code> array would group this board by whatever keys it
                  contained, so it is refused rather than guessed at.
                </div>
              )}
            </div>
          )}

          {loading && !showPaste && (
            <div className="sub">Reading {from}&hellip;</div>
          )}

          {source?.error && !showPaste && (
            <div style={{ fontSize: 12.6, color: 'var(--dk-amber)' }}>{source.error}</div>
          )}

          {checks.length > 0 && (
            <div className="fieldrow">
              <span className="fl">Checked against this repository</span>
              <div style={{ border: '1px solid var(--dk-border)', borderRadius: 9.6,
                            background: 'var(--dk-panel)', padding: '10.8px 13.2px' }}>
                {checks.filter(c => c.applies).map(c => (
                  <div className="why-row pass" key={c.field.dimension}>
                    <span className="mark">&#10003;</span>
                    <div>
                      <b>{c.field.dimension}</b> &mdash; {c.said}
                      {c.extra.map(v => (
                        <span key={v} className="chip" style={{ marginLeft: 6 }}>{v}</span>
                      ))}
                    </div>
                  </div>
                ))}
                {skipped.map(group => (
                  <div className="why-row fail" key={group.why}>
                    <span className="mark">&times;</span>
                    <div>
                      <b>{group.names.join(', ')}</b> &mdash; {group.why === 'missing'
                        ? `no such field here; skipped`
                        : 'this repository has no Project; skipped'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <GhNote icon="check" style={{ margin: 0, maxWidth: 'none' }}>
            <b>Copied, not linked.</b> A later change to {showPaste ? 'that file' : from || 'the source'}&rsquo;s
            map does not reach here. A shared live map would mean one team&rsquo;s edit
            silently regrouping another team&rsquo;s board.
          </GhNote>

          <GhNote icon="warn" style={{ margin: 0, maxWidth: 'none' }}>
            <b>What cannot be copied is skipped and named.</b> Dropped rather than carried
            over as dimensions that would render as empty columns nobody can explain.
          </GhNote>
        </div>
      </Dk>
    </ModalView>
  );
}
