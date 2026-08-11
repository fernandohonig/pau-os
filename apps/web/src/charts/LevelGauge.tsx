import { round } from '../lib/format';

/**
 * Estimated subject level on a single 0–max scale (spec §13: show the range, not
 * false precision). One axis only — a shaded confidence band with a point
 * estimate. Target uses a different scale (/14 admission) and is shown
 * separately, never overlaid here.
 */
export function LevelGauge({
  level,
  range,
  max = 10,
  confidence,
}: {
  level: number;
  range: [number, number];
  max?: number;
  confidence?: number;
}) {
  const pct = (v: number) => `${(Math.max(0, Math.min(max, v)) / max) * 100}%`;
  const [lo, hi] = range;

  return (
    <figure className="m-0">
      <div className="flex items-end justify-between">
        <div>
          <span className="text-4xl font-bold tabular-nums text-ink sm:text-5xl">
            {round(lo)}–{round(hi)}
          </span>
          <span className="ml-1 text-lg font-semibold text-muted">/ {max}</span>
        </div>
        {confidence != null ? (
          <span className="pb-1 text-xs text-muted">
            confidence {Math.round(confidence * 100)}%
          </span>
        ) : null}
      </div>

      <div className="relative mt-4 h-3 w-full rounded-full bg-surface-2" aria-hidden>
        {/* confidence band */}
        <div
          className="absolute top-0 h-full rounded-full"
          style={{
            left: pct(lo),
            width: `calc(${pct(hi)} - ${pct(lo)})`,
            backgroundColor: 'var(--color-accent-soft)',
            boxShadow: 'inset 0 0 0 1px var(--color-primary)',
          }}
        />
        {/* point estimate */}
        <div
          className="absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: pct(level), backgroundColor: 'var(--color-primary)' }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-muted">
        <span>0</span>
        <span>{max / 2}</span>
        <span>{max}</span>
      </div>
      <figcaption className="sr-only">
        Estimated level {round(level)} out of {max}, likely between {round(lo)} and {round(hi)}.
      </figcaption>
    </figure>
  );
}
