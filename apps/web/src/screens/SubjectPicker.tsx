import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type SubjectInfo } from '../api';
import { useSession } from '../session';
import { useLang } from '../lang';
import { Badge, Button, Container, PageTitle, Spinner } from '../components/ui';

export function SubjectPicker() {
  const navigate = useNavigate();
  const { studentId, setSubject } = useSession();
  const { t } = useLang();
  const [subjects, setSubjects] = useState<SubjectInfo[] | null>(null);
  const [weighted, setWeighted] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    Promise.all([api.getSubjects(), api.getTargetEstimate(studentId)]).then(([s, est]) => {
      if (cancelled) return;
      setSubjects(s.subjects);
      if (est && 'subjects' in est) setWeighted(new Set(est.subjects.map((x) => x.subject)));
    });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const choose = (id: string) => {
    setSubject(id);
    navigate('/diagnostic');
  };

  if (!subjects) return <Container><Spinner label="Loading subjects…" /></Container>;

  // Goal-relevant subjects first.
  const ordered = [...subjects].sort(
    (a, b) => Number(weighted.has(b.id)) - Number(weighted.has(a.id)),
  );

  return (
    <Container>
      <PageTitle kicker="Choose a subject" title="What do you want to work on?" />
      <p className="mb-6 text-ink-secondary">
        Each subject has its own diagnostic and skill map. The ones your target degree weights are
        marked.
      </p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ordered.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => choose(s.id)}
              className="w-full rounded-card border border-line bg-surface p-5 text-left shadow-[var(--shadow-card)] transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-lg font-semibold text-ink">{t(s.name)}</span>
                {weighted.has(s.id) ? <Badge text="Counts for your degree" tone="good" /> : null}
              </div>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <Button variant="secondary" onClick={() => navigate('/home')}>
          Back to home
        </Button>
      </div>
    </Container>
  );
}
