import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Degree } from '../api';
import { useSession } from '../session';
import { useAction } from '../lib/useAction';
import { Button, Card, Container, ErrorBanner, PageTitle, Spinner } from '../components/ui';

const TARGETS = [11, 12, 13, 14];

export function Goal() {
  const navigate = useNavigate();
  const { studentId } = useSession();
  const { busy, error, run } = useAction();
  const [degrees, setDegrees] = useState<Degree[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [target, setTarget] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getDegrees().then((d) => !cancelled && setDegrees(d.degrees));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!degrees) return [];
    const q = query.trim().toLowerCase();
    if (!q) return degrees;
    return degrees.filter(
      (d) => d.name.ca.toLowerCase().includes(q) || d.university.toLowerCase().includes(q),
    );
  }, [degrees, query]);

  const submit = () =>
    run(async () => {
      if (!studentId || !selected) return;
      await api.createGoal(studentId, selected, target ?? undefined);
      navigate('/diagnostic');
    });

  if (!degrees) return <Container><Spinner label="Loading degrees…" /></Container>;

  return (
    <Container>
      <PageTitle kicker="Your goal" title="What do you want to study?" />
      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search degree or university…"
        className="mb-4 w-full rounded-full border border-line-strong bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {filtered.map((d) => {
          const active = selected === d.id;
          return (
            <li key={d.id}>
              <button
                onClick={() => setSelected(d.id)}
                className={`w-full rounded-card border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? 'border-primary bg-accent-soft ring-1 ring-primary'
                    : 'border-line bg-surface hover:bg-surface-2'
                }`}
              >
                <span className="block font-semibold text-ink">{d.name.ca}</span>
                <span className="mt-0.5 block text-sm text-muted">{d.university}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <Card className="mt-6">
        <p className="text-sm font-semibold text-ink">Target score (optional)</p>
        <p className="mt-1 text-sm text-ink-secondary">You can set or change this later.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip label="Skip" active={target === null} onClick={() => setTarget(null)} />
          {TARGETS.map((t) => (
            <Chip key={t} label={`${t}/14`} active={target === t} onClick={() => setTarget(t)} />
          ))}
        </div>
      </Card>

      <div className="mt-6">
        <Button size="lg" disabled={!selected || busy} onClick={submit}>
          Continue to diagnostic
        </Button>
      </div>
    </Container>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active ? 'border-primary bg-accent-soft text-primary' : 'border-line-strong text-ink-secondary hover:bg-surface-2'
      }`}
    >
      {label}
    </button>
  );
}
