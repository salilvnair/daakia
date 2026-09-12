/**
 * A class name, weighted the way it is read.
 *
 * Every row in a heap view is dominated by its package, and the package is the
 * part nobody reads — `java.util.concurrent` appears on a dozen consecutive
 * lines and carries no information about any of them. The name does. So the
 * package is set small and dim, the name at full contrast, and the eye lands
 * where the meaning is.
 *
 * Arrays get a badge rather than being spelled out inline. `byte[]` and
 * `Object[]` are a different KIND of thing from a class — they hold the memory
 * without being the thing that leaked — and a reader scanning for the culprit
 * benefits from telling those apart at a glance rather than by reading suffixes.
 */
import { decodeClassName, fullClassName } from './class-name';

export function ClassNameView({
  name,
  size = 11.5,
  showPackage = true,
}: {
  name: string;
  size?: number;
  /** Off in tight columns, where the tooltip still carries the whole thing. */
  showPackage?: boolean;
}) {
  const d = decodeClassName(name);

  return (
    <span
      className="inline-flex items-baseline gap-1 min-w-0 font-mono"
      title={fullClassName(name)}
      style={{ fontSize: size }}
    >
      {showPackage && d.packageName && (
        <span
          className="truncate shrink"
          style={{ color: 'var(--color-text-muted)', opacity: 0.7, fontSize: size - 1.5 }}
        >
          {d.packageName}.
        </span>
      )}
      <span
        className="truncate"
        style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}
      >
        {d.simpleName}
      </span>
      {d.arrayDepth > 0 && (
        /*
          The badge says what kind of thing this is, not what it is called —
          the `[]` is already in the name. Primitive arrays are the ones that
          hold bytes without being anyone's object, and they are almost always
          at the top of a heap, so they get their own tone.
        */
        <span
          className="shrink-0 px-1 rounded"
          style={{
            fontSize: 8.5,
            letterSpacing: '.04em',
            textTransform: 'uppercase',
            color: d.primitive ? 'var(--color-warning)' : 'var(--color-dk8s)',
            background: d.primitive
              ? 'color-mix(in srgb, var(--color-warning) 14%, transparent)'
              : 'color-mix(in srgb, var(--color-dk8s) 14%, transparent)',
          }}
        >
          {d.primitive ? 'prim' : 'array'}
        </span>
      )}
    </span>
  );
}
