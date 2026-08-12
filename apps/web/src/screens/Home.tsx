import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type TargetEstimate } from '../api';
import { useSession } from '../session';
import { useLang } from '../lang';
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
  const { studentId, subject } = useSession();
  const { t } = useLang();
  const [target, setTarget] = useState<TargetEstimate | null>(null);
  const [reco, setReco] = useState<Reco | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    Promise.all([api.getTargetEstimate(studentId), api.getRecommendations(studentId, subject)])
      .then(([tg, r]) => {
        if (cancelled) return;
        setTarget(tg);
        setReco(r.recommendations[0] ?? null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [studentId, subject]);

  if (loading) return <Container><Spinner label="Loading your dashboard…" /></Container>;

  const withGoal = target && 'goal' in target && target.goal !== null ? target : null;
  const active = withGoal?.subjects.find((s) => s.subject === subject) ?? null;
  const activeName = active ? t(active.name) : null;

  return (
    <Container size="lg">
      <div className="mb-6 flex items-center justify-between gap-3">
        <PageTitle kicker="Home" title="What should I do now?" />
        <Button variant="secondary" onClick={() => navigate('/subject')}>
          {activeName ? `Subject: ${activeName}` : 'Choose subject'}
        </Button>
      </div>

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

        {active ? (
          <Card>
            <p className="text-sm font-medium text-ink-secondary">Estimated level · {activeName}</p>
            <div className="mt-3">
              <LevelGauge
                level={active.subjectLevel.level}
                range={active.subjectLevel.range}
                confidence={active.subjectLevel.confidence}
              />
            </div>
          </Card>
        ) : null}
      </div>

      {withGoal ? (
        <Card className="mt-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-ink">Toward {withGoal.degreeName}</h3>
            <Button variant="ghost" onClick={() => navigate('/progress')}>
              See progress →
            </Button>
          </div>

          {withGoal.subjects.length > 0 ? (
            <div className="mt-4 space-y-3">
              {withGoal.subjects.map((s) => (
                <div key={s.subject} className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  <StatTile label="Subject" value={t(s.name)} />
                  {s.contribution ? (
                    <>
                      <StatTile label="Weighting" value={`×${s.contribution.coefficient}`} />
                      <StatTile
                        label="Contributed points"
                        value={`${round(s.contribution.range[0])}–${round(s.contribution.range[1])}`}
                        hint="specific phase"
                      />
                    </>
                  ) : (
                    <StatTile label="Weighting" value="—" hint="not weighted / unknown" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-secondary">
              We don't yet cover a subject this degree weights. Matemàtiques II is available.
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {withGoal.cutoff ? (
              <StatTile
                label={`Cutoff ${withGoal.cutoff.academicYear}`}
                value={round(withGoal.cutoff.score, 2)}
                hint={withGoal.cutoff.sourceType}
              />
            ) : null}
            {withGoal.goal.targetScore != null ? (
              <StatTile label="Your target" value={`${withGoal.goal.targetScore}/14`} />
            ) : null}
          </div>
          <p className="mt-4 text-xs text-muted">{withGoal.disclaimer}</p>
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
