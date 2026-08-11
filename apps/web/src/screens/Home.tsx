import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type TargetEstimate } from '../api';
import { useSession } from '../session';
import { Button, Card, Container, PageTitle, Spinner, StatTile } from '../components/ui';
import { LevelGauge } from '../charts/LevelGauge';
import { reasonLabel, round, skillLabel } from '../lib/format';

interface Reco {
  skillId: string;
  reasonCodes: string[];
  explanation: string;
}

export function Home() {
  const navigate = useNavigate();
  const { studentId } = useSession();
  const [target, setTarget] = useState<TargetEstimate | null>(null);
  const [reco, setReco] = useState<Reco | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    Promise.all([api.getTargetEstimate(studentId), api.getRecommendations(studentId)])
      .then(([t, r]) => {
        if (cancelled) return;
        setTarget(t);
        setReco(r.recommendations[0] ?? null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (loading) return <Container><Spinner label="Loading your dashboard…" /></Container>;

  const hasGoal = target && 'goal' in target && target.goal !== null;

  return (
    <Container size="lg">
      <PageTitle kicker="Home" title="What should I do now?" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {reco ? (
          <Card className="bg-accent-soft lg:col-span-2">
            <p className="text-sm font-semibold text-primary">Today's focus</p>
            <h2 className="mt-2 text-2xl font-bold text-ink">{skillLabel(reco.skillId)}</h2>
            <p className="mt-2 text-ink-secondary">{reco.explanation}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {reco.reasonCodes.slice(0, 3).map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-ink-secondary"
                >
                  {reasonLabel(c)}
                </span>
              ))}
            </div>
            <Button className="mt-5" size="lg" onClick={() => navigate('/practice')}>
              Train now
            </Button>
          </Card>
        ) : (
          <Card className="lg:col-span-2">
            <h2 className="text-lg font-bold text-ink">Start with a diagnostic</h2>
            <p className="mt-2 text-ink-secondary">
              Take the short diagnostic so we can find your best next step.
            </p>
            <Button className="mt-4" onClick={() => navigate('/diagnostic')}>
              Start diagnostic
            </Button>
          </Card>
        )}

        {hasGoal && target && 'subjectLevel' in target ? (
          <Card>
            <p className="text-sm font-medium text-ink-secondary">Estimated level</p>
            <div className="mt-3">
              <LevelGauge
                level={target.subjectLevel.level}
                range={target.subjectLevel.range}
                confidence={target.subjectLevel.confidence}
              />
            </div>
          </Card>
        ) : null}
      </div>

      {hasGoal && target && 'contribution' in target ? (
        <Card className="mt-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-ink">Toward {target.degreeName}</h3>
            <Button variant="ghost" onClick={() => navigate('/progress')}>
              See progress →
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {target.contribution ? (
              <>
                <StatTile label="Weighting" value={`×${target.contribution.coefficient}`} />
                <StatTile
                  label="Contributed points"
                  value={`${round(target.contribution.range[0])}–${round(target.contribution.range[1])}`}
                  hint="of the specific phase"
                />
              </>
            ) : null}
            {target.cutoff ? (
              <StatTile
                label={`Cutoff ${target.cutoff.academicYear}`}
                value={round(target.cutoff.score, 2)}
                hint={target.cutoff.sourceType}
              />
            ) : null}
            {target.goal.targetScore != null ? (
              <StatTile label="Your target" value={`${target.goal.targetScore}/14`} />
            ) : null}
          </div>
          <p className="mt-4 text-xs text-muted">{target.disclaimer}</p>
        </Card>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button size="lg" onClick={() => navigate('/practice')}>
          Train now
        </Button>
        <Button size="lg" variant="secondary" onClick={() => navigate('/progress')}>
          See my progress
        </Button>
      </div>
    </Container>
  );
}
