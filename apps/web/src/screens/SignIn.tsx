import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session';
import { useAction } from '../lib/useAction';
import { useGoogleButton } from '../auth/google';
import { useTheme } from '../lib/useTheme';
import { Button, Card, Container, ErrorBanner } from '../components/ui';

const isDev = import.meta.env.DEV;

export function SignIn() {
  const navigate = useNavigate();
  const { signInWith, setStudentId } = useSession();
  const { busy, error, run } = useAction();
  const { theme } = useTheme();
  const googleRef = useRef<HTMLDivElement>(null);

  const routeAfter = (role: string, studentId: string | null) => {
    if (role === 'admin') navigate('/admin');
    else navigate('/goal');
    if (studentId) setStudentId(studentId);
  };

  const startAnonymous = () =>
    run(async () => {
      const s = await api.createStudent();
      setStudentId(s.id);
      navigate('/goal');
    });

  const { enabled: googleEnabled } = useGoogleButton(
    googleRef,
    (idToken) =>
      void run(async () => {
        const res = await api.googleLogin(idToken);
        signInWith(res);
        routeAfter(res.role, res.studentId);
      }),
    theme,
  );

  const devLogin = (role: 'student' | 'admin') =>
    run(async () => {
      const res = await api.devLogin(role);
      signInWith(res);
      routeAfter(res.role, res.studentId);
    });

  return (
    <Container size="sm">
      <div className="py-6 sm:py-12">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Your academic GPS</p>
        <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
          Where do you want to go?
        </h1>
        <p className="mt-4 max-w-md text-lg text-ink-secondary">
          Pick a degree, take a short diagnostic, and get one clear next step —
          no account needed.
        </p>

        {error ? (
          <div className="mt-6">
            <ErrorBanner message={error} />
          </div>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:max-w-sm">
          <Button size="lg" block disabled={busy} onClick={startAnonymous}>
            Start — no account needed
          </Button>

          {googleEnabled ? (
            <>
              <div className="my-1 flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-line" />
                or
                <span className="h-px flex-1 bg-line" />
              </div>
              <div ref={googleRef} className="flex justify-center" />
            </>
          ) : null}
        </div>

        {isDev ? (
          <Card className="mt-10 sm:max-w-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Dev login</p>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => devLogin('student')}>
                Student
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => devLogin('admin')}>
                Admin
              </Button>
            </div>
          </Card>
        ) : null}

        <p className="mt-8 text-xs text-muted">
          Estimates only — never a promise of a grade or a place.
        </p>
      </div>
    </Container>
  );
}
