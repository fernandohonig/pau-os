import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type PublicQuestion } from '../api';
import { useSession } from '../session';
import { useLang } from '../lang';
import { useAction } from '../lib/useAction';
import { Button, Card, Container, ErrorBanner, PageTitle, ProgressBar } from '../components/ui';

const TARGET_QUESTIONS = 20;

export function Diagnostic() {
  const navigate = useNavigate();
  const { studentId, setResults } = useSession();
  const { t } = useLang();
  const { busy, error, run } = useAction();

  const [phase, setPhase] = useState<'intro' | 'running'>('intro');
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [asked, setAsked] = useState(0);
  const [choice, setChoice] = useState<string | null>(null);

  const begin = () =>
    run(async () => {
      if (!studentId) return;
      const res = await api.startAssessment(studentId);
      setAssessmentId(res.assessmentId);
      setQuestion(res.question);
      setAsked(res.progress.asked);
      setPhase('running');
    });

  const answer = (idk: boolean) =>
    run(async () => {
      if (!assessmentId || !question) return;
      const res = await api.submitResponse(
        assessmentId,
        question.id,
        idk ? undefined : choice ?? undefined,
        idk,
      );
      setChoice(null);
      if (res.done) {
        const results = await api.completeAssessment(assessmentId);
        setResults(results);
        navigate('/results');
      } else {
        setQuestion(res.question);
        setAsked(res.progress.asked);
      }
    });

  if (phase === 'intro') {
    return (
      <Container size="sm">
        <PageTitle kicker="Diagnostic" title="This isn't a test you can fail" />
        <Card>
          <p className="text-ink-secondary">
            We're measuring what you already know so we can tell you what to work on next. It takes
            about <strong className="text-ink">15–20 minutes</strong>. Answer honestly — if you don't
            know, say so; that's useful information, not a mistake.
          </p>
        </Card>
        {error ? <div className="mt-4"><ErrorBanner message={error} /></div> : null}
        <div className="mt-6">
          <Button size="lg" disabled={busy} onClick={begin}>
            Begin diagnostic
          </Button>
        </div>
      </Container>
    );
  }

  return (
    <Container size="sm">
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-sm text-muted">
          <span>Question {asked + 1}</span>
          <span className="tabular-nums">~{TARGET_QUESTIONS} total</span>
        </div>
        <ProgressBar value={(asked + 1) / TARGET_QUESTIONS} />
      </div>

      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}

      {question ? (
        <>
          <h2 className="text-xl font-semibold leading-snug text-ink">{t(question.question)}</h2>
          <ul className="mt-5 space-y-2.5">
            {question.options.map((o) => {
              const active = choice === o.id;
              return (
                <li key={o.id}>
                  <button
                    onClick={() => setChoice(o.id)}
                    className={`flex w-full items-center gap-3 rounded-card border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
                    <span className="text-ink">{t(o)}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 flex items-center gap-3">
            <Button size="lg" disabled={!choice || busy} onClick={() => answer(false)}>
              Continue
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => answer(true)}>
              I don't know
            </Button>
          </div>
        </>
      ) : null}
    </Container>
  );
}
