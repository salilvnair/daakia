/**
 * A message pattern as a reader sees it: the fixed words, and each hole in
 * the teal the boards give it, written `{orderId}` so it reads as a name
 * rather than as a value somebody logged.
 *
 * Its own file because four screens draw templates — the catalogue, both
 * halves of Add patterns and the Logs tab's marked rail — and a template drawn
 * two ways is two ideas of what a hole is.
 */
import { templateParts } from './logger-pattern';
import { HOLE } from './tone';

export const HOLE_COLOR = HOLE;

export function PatternTemplate({ template, dim }: { template: string; dim?: boolean }) {
  return (
    <>
      {templateParts(template).map((part, i) => (part.hole
        ? <span key={i} style={{ color: HOLE_COLOR }}>{`{${part.text}}`}</span>
        : <span key={i} style={{ color: dim ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}>{part.text}</span>
      ))}
    </>
  );
}
