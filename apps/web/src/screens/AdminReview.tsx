import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type AdminQuestion, type ReviewHistoryItem } from '../api';
import { useAction } from '../lib/useAction';
import { useLang } from '../lang';
import { Badge, Button, Card, Container, ErrorBanner, PageTitle, Spinner, type Tone } from '../components/ui';
import { skillLabel } from '../lib/format';

function statusTone(status: string): Tone {
  if (status === 'approved' || status === 'published') return 'good';
  if (status === 'rejected') return 'critical';
  return 'warning';
}

export function AdminReview() {
  const navigate = useNavigate();
  const { t } = useLang();
  const { busy, error, run } = useAction();
  const [reviews, setReviews] = useState<AdminQuestion[] | null>(null);
  const [selected, setSelected] = useState<AdminQuestion | null>(null);
  const [history, setHistory] = useState<ReviewHistoryItem[]>([]);
  const [notes, setNotes] = useState('');

  const loadQueue = useCallback(async () => {
    const { reviews: rs } = await api.adminReviews();
    setReviews(rs);
  }, []);

  useEffect(() => {
    loadQueue().catch(() => setReviews([]));
  }, [loadQueue]);

  const open = (q: AdminQuestion) =>
    run(async () => {
      setNotes('');
      setSelected(q);
      const { history: h } = await api.adminReview(q.id);
      setHistory(h);
    });

  const decide = (action: 'approve' | 'reject') =>
    run(async () => {
      if (!selected) return;
      if (action === 'approve') await api.approveReview(selected.id, notes || undefined);
      else await api.rejectReview(selected.id, notes || undefined);
      setSelected(null);
      await loadQueue();
    });

  if (!reviews) return <Container><Spinner label="Loading review queue…" /></Container>;

  if (selected) {
    const correct = selected.answer?.correct;
    return (
      <Container>
        <PageTitle kicker={`Review · ${selected.id}`} title="Review question" />
        {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}

        <Card>
          <div className="flex flex-wrap gap-2">
            <Badge text={selected.reviewStatus} tone={statusTone(selected.reviewStatus)} />
            <Badge text={selected.source.type} tone="muted" />
          </div>
          <p className="mt-4 text-lg font-medium text-ink">{t(selected.question)}</p>
          <ul className="mt-4 space-y-2">
            {selected.options.map((o) => {
              const isCorrect = Array.isArray(correct) ? correct.includes(o.id) : correct === o.id;
              return (
                <li
                  key={o.id}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
                    isCorrect ? 'border-[color:var(--color-good)]/40 bg-[color:var(--color-good)]/10' : 'border-line'
                  }`}
                >
                  <span className="text-sm text-ink">
                    <span className="font-semibold">{o.id}.</span> {t(o)}
                  </span>
                  {isCorrect ? <Badge text="correct" tone="good" /> : null}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="mt-4">
          <h3 className="font-semibold text-ink">Explanation</h3>
          <p className="mt-2 text-sm text-ink-secondary">{t(selected.explanation) || '—'}</p>
        </Card>

        {history.length ? (
          <Card className="mt-4">
            <h3 className="font-semibold text-ink">History</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3">
                  <Badge text={h.status} tone={statusTone(h.status)} />
                  <span className="truncate text-muted">{h.notes ?? ''}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <div className="mt-4">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="w-full rounded-card border border-line-strong bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button size="lg" disabled={busy} onClick={() => decide('approve')}>
            Approve
          </Button>
          <Button size="lg" variant="danger" disabled={busy} onClick={() => decide('reject')}>
            Reject
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setSelected(null)}>
            Back to queue
          </Button>
        </div>
      </Container>
    );
  }

  return (
    <Container size="lg">
      <div className="mb-6 flex items-center justify-between">
        <PageTitle kicker="Admin" title="Review queue" />
        <Button variant="secondary" onClick={() => navigate('/admin')}>
          ← Metrics
        </Button>
      </div>
      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}

      {reviews.length === 0 ? (
        <Card><p className="text-ink-secondary">Nothing awaiting review.</p></Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {reviews.map((q) => (
            <li key={q.id}>
              <button
                onClick={() => open(q)}
                className="w-full rounded-card border border-line bg-surface p-4 text-left shadow-[var(--shadow-card)] transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex flex-wrap gap-2">
                  <Badge text={q.reviewStatus} tone={statusTone(q.reviewStatus)} />
                  <Badge text={q.source.type} tone="muted" />
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-ink">{t(q.question)}</p>
                <p className="mt-2 text-xs text-muted">
                  {q.skills.map((s) => skillLabel(s)).join(', ')}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
