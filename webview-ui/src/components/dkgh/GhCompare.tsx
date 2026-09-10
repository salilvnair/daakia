/**
 * Screen 16B — against the period before.
 *
 * A number on its own is not a finding. "Twelve open" is neither good nor bad
 * until you know it was nine.
 *
 * **Green is not always up.** Closed rising is green; opened rising is red;
 * median age rising is red. Direction is not the same as good, and colouring by
 * direction rather than by meaning is how dashboards start lying cheerfully —
 * so each metric declares which way is better and `deltaTone` reads that, never
 * the sign.
 *
 * **Solid is now, outline is then, on the same axis.** Two charts side by side
 * make the reader do the subtraction and they do it wrong; overlaying them
 * turns a module's tripling into a shape rather than an arithmetic exercise.
 */
import { Ico } from './GhIcons';
import { delta, deltaTone, standout, type Comparison, type Metric } from './insights-model';

const TONE = {
  green: 'var(--dk-green)',
  red: 'var(--dk-red)',
  flat: 'var(--dk-faint)',
} as const;

/** `▲ 5`, `▼ 3`, or `no change`. */
function Delta({ m }: { m: Metric }) {
  const d = delta(m);
  const tone = deltaTone(m);
  if (d === 0) {
    return <span style={{ fontSize: 13.2, color: TONE.flat }}>no change</span>;
  }
  return (
    <span style={{ fontSize: 13.2, color: TONE[tone] }}>
      {d > 0 ? '▲' : '▼'} {Math.abs(d)}{m.unit ?? ''}
    </span>
  );
}

function Tile({ m }: { m: Metric }) {
  const colour = m.tone === 'red' ? 'var(--dk-red)'
    : m.tone === 'amber' ? 'var(--dk-amber)'
    : 'var(--dk-text)';
  return (
    <div className="chartc">
      <div className="cs" style={{ marginBottom: 4.8 }}>{m.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8.4 }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: colour }}>
          {m.now}{m.unit ?? ''}
        </span>
        <Delta m={m} />
      </div>
      <div style={{ fontSize: 10.8, color: 'var(--dk-faint)' }}>
        was {m.was}{m.unit ?? ''}
      </div>
    </div>
  );
}

export function GhCompare({ versus, weeks }: { versus: Comparison; weeks: number }) {
  const { metrics, bars, thisLabel, lastLabel, closedKnown } = versus;
  const finding = standout(bars);
  /* One scale for both periods. Two scales would make a bar that halved look
     the same size as one that doubled. */
  const tallest = Math.max(1, ...bars.map(b => Math.max(b.now, b.was)));

  return (
    <div style={{ padding: '15.6px 19.2px' }}>
      <div className="chiprow" style={{ padding: 0, marginBottom: 13.2, border: 'none',
                                        background: 'transparent' }}>
        <span className="pill on">{thisLabel}</span>
        <span style={{ fontSize: 12, color: 'var(--dk-faint)' }}>compared with</span>
        <span className="pill on">{lastLabel}</span>
      </div>

      {/* `minmax(0, 1fr)`, not `1fr`: a grid item's default minimum is its
          content, so "Median age at close" pushes the track wider than its
          share and the whole panel scrolls sideways. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gap: 10.8, marginBottom: 15.6 }}>
        {metrics.map(m => <Tile key={m.label} m={m} />)}
      </div>

      <div className="chartc">
        <div className="ct">By module</div>
        <div className="cs">{thisLabel} solid, {lastLabel} outlined</div>
        <div style={{ marginTop: 10.8 }}>
          {bars.length === 0 && (
            <div className="cs" style={{ margin: 0 }}>
              Nothing was opened in either period.
            </div>
          )}
          {bars.map(b => (
            <div className="barrow" key={b.label}>
              <span className="bl">{b.label}</span>
              <span className="bt" style={{ background: 'transparent' }}>
                <i style={{ width: `${(b.now / tallest) * 100}%`,
                            background: 'var(--dk-gh)' }} />
                <i style={{ width: `${(b.was / tallest) * 100}%`,
                            border: '1px solid var(--dk-gh)', background: 'transparent' }} />
              </span>
              <span className="bv">
                {b.now}<span style={{ color: 'var(--dk-faint)' }}>/{b.was}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {finding && (
        <div className="note" style={{ maxWidth: 'none', margin: '14.4px 0 0' }}>
          <Ico name="warn" />
          <div>
            <b>{finding}</b> That is the only sentence worth taking out of this screen, and it
            is invisible on a single-period chart where every module reads as an unremarkable
            handful.
          </div>
        </div>
      )}

      <div className="note" style={{ maxWidth: 'none', margin: '9.6px 0 0' }}>
        <Ico name="check" />
        <div>
          <b>Green is not always up.</b> Closed rising is green; opened rising is red; median
          age rising is red. Direction is not the same as good, and colouring by direction
          rather than by meaning is how dashboards start lying cheerfully.
        </div>
      </div>

      {!closedKnown && (
        <div className="note" style={{ maxWidth: 'none', margin: '9.6px 0 0' }}>
          <Ico name="warn" />
          <div>
            <b>No close dates are loaded</b>, so Closed and Median age at close are both
            zero in each period rather than unknown. Show closed issues on the board and
            they fill in &mdash; over {weeks} weeks that is usually the difference between
            this screen being a finding and being a shrug.
          </div>
        </div>
      )}
    </div>
  );
}
