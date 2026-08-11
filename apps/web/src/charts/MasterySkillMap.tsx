import type { MasteryBand, SkillProfileItem } from '../api';
import { bandLabel, bandVar, skillLabel } from '../lib/format';

const BAND_ORDER: MasteryBand[] = ['weak', 'developing', 'insufficient_evidence', 'mastered'];

/**
 * Mastery skill map: skills grouped by band (a status/ordinal encoding), each
 * with a confidence bar. Band identity is carried by a labeled swatch, never
 * color alone; the underlying list is a semantic table for accessibility.
 */
export function MasterySkillMap({
  skills,
  names,
}: {
  skills: SkillProfileItem[];
  names?: Record<string, string>;
}) {
  const byBand = new Map<MasteryBand, SkillProfileItem[]>();
  for (const s of skills) {
    const arr = byBand.get(s.band) ?? [];
    arr.push(s);
    byBand.set(s.band, arr);
  }

  return (
    <div className="space-y-6">
      {/* Legend */}
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {BAND_ORDER.map((b) => (
          <li key={b} className="flex items-center gap-2 text-xs text-ink-secondary">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: bandVar(b) }}
            />
            {bandLabel(b)}
            <span className="tabular-nums text-muted">({(byBand.get(b) ?? []).length})</span>
          </li>
        ))}
      </ul>

      {BAND_ORDER.filter((b) => (byBand.get(b) ?? []).length > 0).map((band) => (
        <section key={band}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: bandVar(band) }}
            />
            {bandLabel(band)}
          </h3>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(byBand.get(band) ?? []).map((s) => (
              <li
                key={s.skillId}
                className="rounded-xl border border-line bg-surface px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-ink">{skillLabel(s.skillId, names)}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted">
                    {Math.round(s.confidence * 100)}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.round(s.confidence * 100)}%`, backgroundColor: bandVar(band) }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
