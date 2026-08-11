import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type AdminSummary } from '../api';
import { Button, Card, Container, ErrorBanner, PageTitle, Spinner, StatTile } from '../components/ui';
import { DiagnosticFunnel, EventBars } from '../charts/AdminCharts';
import { round } from '../lib/format';

export function Admin() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .adminSummary()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'error'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Container><Spinner label="Loading pilot metrics…" /></Container>;

  return (
    <Container size="lg">
      <div className="mb-6 flex items-center justify-between">
        <PageTitle kicker="Admin" title="Pilot metrics" />
        <Button onClick={() => navigate('/admin/review')}>Review content</Button>
      </div>

      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Students" value={data.summary.students} />
            <StatTile
              label="Completion rate"
              value={`${Math.round(data.summary.diagnosticCompletionRate * 100)}%`}
              hint={`${data.summary.diagnosticCompleted}/${data.summary.diagnosticStarted} diagnostics`}
            />
            <StatTile label="Avg study minutes" value={data.summary.avgStudyMinutes} />
            <StatTile
              label="Learning gain / hour"
              value={
                data.summary.avgLearningGainPerHour != null
                  ? round(data.summary.avgLearningGainPerHour, 2)
                  : '—'
              }
              hint={`${data.summary.studentsWithGain} students with gain`}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="mb-4 font-semibold text-ink">Diagnostic funnel</h3>
              <DiagnosticFunnel
                started={data.summary.diagnosticStarted}
                completed={data.summary.diagnosticCompleted}
              />
            </Card>
            <Card>
              <h3 className="mb-4 font-semibold text-ink">Events recorded</h3>
              <EventBars counts={data.eventCounts} />
            </Card>
          </div>
        </>
      ) : null}
    </Container>
  );
}
