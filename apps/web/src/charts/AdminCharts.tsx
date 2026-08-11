/**
 * Admin dashboard charts. Single-series horizontal bars with direct value
 * labels (a legend is unnecessary for one series — the title names it). Uses the
 * validated sequential blue; funnel stages use one hue, light→dark by depth.
 */

export function EventBars({ counts }: { counts: Record<string, number> }) {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = rows.reduce((m, [, v]) => Math.max(m, v), 0) || 1;
  if (rows.length === 0) return <p className="text-sm text-muted">No events recorded yet.</p>;

  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">Analytics event counts</caption>
      <tbody>
        {rows.map(([name, value]) => (
          <tr key={name}>
            <th
              scope="row"
              className="w-40 py-1.5 pr-3 text-left font-normal text-ink-secondary"
            >
              {name.replace(/_/g, ' ')}
            </th>
            <td className="py-1.5">
              <div className="flex items-center gap-2">
                <div
                  className="h-3 rounded-e-[4px] rounded-s-sm"
                  style={{
                    width: `${(value / max) * 100}%`,
                    minWidth: value > 0 ? 4 : 0,
                    backgroundColor: 'var(--series-1)',
                  }}
                />
                <span className="tabular-nums text-muted">{value}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Diagnostic funnel: started → completed. Ordinal blue, deepening by stage. */
export function DiagnosticFunnel({
  started,
  completed,
}: {
  started: number;
  completed: number;
}) {
  const max = Math.max(started, 1);
  const stages = [
    { label: 'Diagnostics started', value: started, hue: 'var(--series-1)' },
    { label: 'Diagnostics completed', value: completed, hue: 'var(--color-primary-hover)' },
  ];
  return (
    <div className="space-y-3">
      {stages.map((s) => (
        <div key={s.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-ink-secondary">{s.label}</span>
            <span className="tabular-nums font-semibold text-ink">{s.value}</span>
          </div>
          <div className="h-6 w-full overflow-hidden rounded-lg bg-surface-2">
            <div
              className="h-full rounded-lg transition-[width] duration-500"
              style={{ width: `${(s.value / max) * 100}%`, backgroundColor: s.hue }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
