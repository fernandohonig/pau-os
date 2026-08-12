import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type SkillProfileItem } from '../api';
import { useSession } from '../session';
import { Button, Card, Container, PageTitle, Spinner } from '../components/ui';
import { MasterySkillMap } from '../charts/MasterySkillMap';

export function Progress() {
  const navigate = useNavigate();
  const { studentId, subject } = useSession();
  const [skills, setSkills] = useState<SkillProfileItem[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    Promise.all([api.getSkills(studentId, subject), api.getSkillCatalog(subject)]).then(([s, cat]) => {
      if (cancelled) return;
      setSkills(s.skills);
      setNames(Object.fromEntries(cat.skills.map((k) => [k.id, k.name.ca])));
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, subject]);

  if (!skills) return <Container><Spinner label="Loading your skill map…" /></Container>;

  return (
    <Container size="lg">
      <PageTitle kicker="Progress" title="Your skill map" />
      {skills.length === 0 ? (
        <Card>
          <p className="text-ink-secondary">
            No skills assessed yet. Take the diagnostic to build your map.
          </p>
          <Button className="mt-4" onClick={() => navigate('/diagnostic')}>
            Start diagnostic
          </Button>
        </Card>
      ) : (
        <Card>
          <MasterySkillMap skills={skills} names={names} />
        </Card>
      )}
      <div className="mt-6">
        <Button size="lg" onClick={() => navigate('/practice')}>
          Train now
        </Button>
      </div>
    </Container>
  );
}
