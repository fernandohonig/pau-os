import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../session';
import { Badge, Button, Card, Container, PageTitle } from '../components/ui';
import { LevelGauge } from '../charts/LevelGauge';
import { bandLabel, bandTone, skillLabel } from '../lib/format';
import type { ProfileBandItem } from '../api';

export function Results() {
  const navigate = useNavigate();
  const { results } = useSession();

  useEffect(() => {
    if (!results) navigate('/home', { replace: true });
  }, [results, navigate]);
  if (!results) return null;

  const { level, gaps, strengths, recommendation, assessedSkillCount } = results;

  return (
    <Container>
      <PageTitle kicker="Your diagnostic" title="Here's where you stand" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <p className="text-sm font-medium text-ink-secondary">Estimated Matemàtiques II level</p>
          <div className="mt-3">
            <LevelGauge
              level={level.level}
              range={level.range}
              confidence={level.confidence}
            />
          </div>
          <p className="mt-4 text-sm text-muted">
            Based on {assessedSkillCount} skills assessed. This is a range, not a promise — it
            narrows as you practice.
          </p>
        </Card>

        {recommendation ? (
          <Card className="flex flex-col justify-between bg-accent-soft">
            <div>
              <p className="text-sm font-semibold text-primary">Your best next step</p>
              <h2 className="mt-2 text-lg font-bold text-ink">
                {skillLabel(recommendation.skillId)}
              </h2>
              <p className="mt-2 text-sm text-ink-secondary">{recommendation.explanation}</p>
            </div>
            <Button className="mt-4" onClick={() => navigate('/practice')}>
              Start 15-min session
            </Button>
          </Card>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SkillList title="Main gaps" items={gaps} empty="No clear gaps yet." />
        <SkillList title="Strengths" items={strengths} empty="Strengths will show as you practice." />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button size="lg" onClick={() => navigate('/practice')}>
          Start 15-min session
        </Button>
        <Button size="lg" variant="secondary" onClick={() => navigate('/home')}>
          Go to home
        </Button>
      </div>
    </Container>
  );
}

function SkillList({
  title,
  items,
  empty,
}: {
  title: string;
  items: ProfileBandItem[];
  empty: string;
}) {
  return (
    <Card>
      <h3 className="mb-3 font-semibold text-ink">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((s) => (
            <li key={s.skillId} className="flex items-center justify-between gap-2">
              <span className="text-sm text-ink">{skillLabel(s.skillId)}</span>
              <Badge text={bandLabel(s.band)} tone={bandTone(s.band)} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
