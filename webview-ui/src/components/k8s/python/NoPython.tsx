/**
 * The Python tab on a container that cannot run a script — the whole tab.
 *
 * No editor, no toolbar, no Run greyed out beside an explanation in a thin
 * red strip: none of it can do anything here, so none of it is drawn. What is
 * left is the reason, as the container's own check gave it, and the two
 * things that can change the answer — another container in the same pod, or
 * checking again after the image changed.
 */
import { ButtonView, IconSize } from '@salilvnair/dui';
import { PythonFileIcon, RefreshIcon } from '../../../icons';
import { MUTED } from '../tone';

const BAD = 'var(--color-error)';

/** "No Python in this container — neither python3 nor…" → a title and a sentence. */
export function splitReason(reason: string): { title: string; body?: string } {
  const at = reason.indexOf(' — ');
  if (at < 0) return { title: 'This container cannot run a script', body: reason };
  const body = reason.slice(at + 3).trim();
  return { title: reason.slice(0, at).trim(), body: body.charAt(0).toUpperCase() + body.slice(1) };
}

export function NoPython({ reason, container, containers, onContainer, onCheck, checking, pods }: {
  reason: string;
  /** On the Scripts screen: the pods that were checked, none of which can run it. */
  pods?: string[];
  container?: string;
  containers: string[];
  onContainer: (c: string) => void;
  onCheck: () => void;
  checking?: boolean;
}) {
  const { title, body } = splitReason(reason);
  const others = containers.filter(c => c !== container);

  return (
    <div className="flex-1 flex items-center justify-center h-full px-8">
      <div className="flex flex-col items-center text-center" style={{ maxWidth: 520, gap: 14 }}>
        {/* The Python mark, and a red exclamation on its corner — the
            language, and that it is missing here. */}
        <div className="relative" style={{ width: 76, height: 76 }}>
          <div className="w-full h-full grid place-items-center"
               style={{
                 borderRadius: 18,
                 background: `color-mix(in srgb, ${BAD} 10%, var(--color-surface))`,
                 border: `1px solid color-mix(in srgb, ${BAD} 38%, transparent)`,
               }}>
            <PythonFileIcon size={36} style={{ opacity: 0.9 }} />
          </div>
          <span className="absolute grid place-items-center font-bold"
                aria-hidden
                style={{
                  right: -7, bottom: -7, width: 28, height: 28, borderRadius: 999,
                  background: BAD, color: 'var(--color-surface-bg, var(--color-bg))',
                  fontSize: 17, lineHeight: 1,
                  boxShadow: `0 0 0 3px var(--color-bg), 0 0 14px color-mix(in srgb, ${BAD} 55%, transparent)`,
                }}>
            !
          </span>
        </div>

        <div className="flex flex-col" style={{ gap: 6, marginTop: 6 }}>
          <span className="text-[15px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</span>
          {body && (
            <span className="text-[12.5px] leading-relaxed" style={{ color: BAD }}>{body}</span>
          )}
        </div>

        <span className="text-[12px] leading-relaxed" style={{ color: MUTED }}>
          A script here runs with the container&rsquo;s own interpreter, environment and network, so the
          container has to bring its own Python 3 — nothing is installed into it.
          {container ? <> This was <span className="font-mono">{container}</span>.</> : null}
          {pods && pods.length > 1 ? <> None of the {pods.length} pods picked has it — pick one that does to run a script.</> : null}
        </span>

        <div className="flex items-center flex-wrap justify-center" style={{ gap: 8, marginTop: 4 }}>
          {others.map(c => (
            <ButtonView key={c} size="sm" variant="secondary" onClick={() => onContainer(c)}
                        title={`Check the ${c} container instead`}>
              Try <span className="font-mono" style={{ marginLeft: 4 }}>{c}</span>
            </ButtonView>
          ))}
          <ButtonView size="sm" variant="secondary" loading={checking} onClick={onCheck}
                      iconLeft={<RefreshIcon size={IconSize.action} />}
                      title="Ask the container again — after a new image is rolled out">
            Check again
          </ButtonView>
        </div>
      </div>
    </div>
  );
}
