/**
 * The step bar in an import wizard's header.
 *
 * A step behind you is ticked and can be clicked to go back to; the one you
 * are on is filled. `reachable` says how far forward a click may jump — a
 * wizard decides that, because only it knows what a later step needs.
 */
import { CheckIcon } from '../../../icons';
import './import-wizard.css';

export function WizardSteps({ steps, current, reachable, finished, onStep }: {
  steps: readonly string[];
  current: number;
  /** The furthest step a click may go to. */
  reachable: number;
  /** Everything is behind you — the wizard has done its work. */
  finished?: boolean;
  onStep: (i: number) => void;
}) {
  return (
    <nav className="dk-swi-steps" aria-label="Steps">
      {steps.map((label, i) => {
        const past = finished || i < current;
        return (
          <span key={label} className="dk-swi-steps__item">
            {i > 0 && <span className="dk-swi-steps__sep" />}
            <button
              type="button"
              className={`dk-swi-step${i === current && !finished ? ' is-current' : ''}${past ? ' is-past' : ''}`}
              disabled={finished || i > reachable || i === current}
              aria-current={i === current ? 'step' : undefined}
              onClick={() => onStep(i)}
            >
              <span className="dk-swi-step__n">{past ? <CheckIcon size={11} /> : i + 1}</span>{label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
