import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type LocalizedText, type PublicQuestion } from '../api';
import { useSession } from '../session';
import { useAction } from '../lib/useAction';
import { Badge, Button, Card, Container, ErrorBanner, PageTitle, ProgressBar, Spinner } from '../components/ui';
import { skillLabel } from '../lib/format';

interface Feedback {
  correct: boolean;
  explanation: LocalizedText;
}

export function Practice() {
  const navigate = useNavigate();
  const { studentId } = useSession();
  const { busy, error, run } = useAction();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [choice, setChoice] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    api
      .startSession(studentId)
      .then((s) => {
        if (cancelled) return;
        setSessionId(s.sessionId);
        setQuestions(s.questions);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const question = questions[idx];

  const check = () =>
    run(async () => {
      if (!sessionId || !question || !choice) return;
      const res = await api.submitSessionResponse(sessionId, question.id, choice);
      setFeedback({ correct: res.correct, explanation: res.explanation });
    });

  const next = () =>
    run(async () => {
      setFeedback(null);
      setChoice(null);
      if (idx + 1 >= questions.length) {
        if (sessionId) await api.completeSession(sessionId);
        setDone(true);
      } else {
        setIdx((i) => i + 1);
      }
    });

  if (loading) return <Container><Spinner label="Building your session…" /></Container>;

  if (done || !question) {
    return (
      <Container size="sm">
        <PageTitle kicker="Practice" title="Session complete" />
        <Card>
          <p className="text-ink-secondary">Nice work. Your skill map has been updated.</p>
        </Card>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="lg" onClick={() => navigate('/progress')}>See progress</Button>
          <Button size="lg" variant="secondary" onClick={() => navigate('/home')}>Home</Button>
        </div>
      </Container>
    );
  }

  return (
    <Container size="sm">
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-sm text-muted">
          <span>
            Session · {idx + 1} of {questions.length}
          </span>
          <span>{skillLabel(question.skills[0] ?? '')}</span>
        </div>
        <ProgressBar value={(idx + (feedback ? 1 : 0)) / questions.length} />
      </div>

      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}

      <h2 className="text-xl font-semibold leading-snug text-ink">{question.question.ca}</h2>
      <ul className="mt-5 space-y-2.5">
        {question.options.map((o) => {
          const active = choice === o.id;
          const locked = feedback !== null;
          return (
            <li key={o.id}>
              <button
                disabled={locked}
                onClick={() => setChoice(o.id)}
                className={`flex w-full items-center gap-3 rounded-card border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default ${
                  active
                    ? 'border-primary bg-accent-soft ring-1 ring-primary'
                    : 'border-line bg-surface hover:bg-surface-2'
                }`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-semibold ${
                    active ? 'border-primary bg-primary text-primary-fg' : 'border-line-strong text-muted'
                  }`}
                >
                  {o.id}
                </span>
                <span className="text-ink">{o.ca}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {feedback ? (
        <Card className="mt-5">
          <Badge
            text={feedback.correct ? 'Correct' : 'Not quite'}
            tone={feedback.correct ? 'good' : 'serious'}
          />
          <p className="mt-3 text-sm text-ink-secondary">{feedback.explanation.ca}</p>
        </Card>
      ) : null}

      <div className="mt-6">
        {feedback ? (
          <Button size="lg" disabled={busy} onClick={next}>
            {idx + 1 >= questions.length ? 'Finish' : 'Next'}
          </Button>
        ) : (
          <Button size="lg" disabled={!choice || busy} onClick={check}>
            Check
          </Button>
        )}
      </div>
    </Container>
  );
}
