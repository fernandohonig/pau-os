import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../lib/useTheme';
import { useSession } from '../session';
import { useLang } from '../lang';
import { Button } from './ui';

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-black text-primary-fg"
      >
        P
      </span>
      <span className="text-lg font-bold tracking-tight text-ink">PAU OS</span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();
  const { lang, toggle: toggleLang } = useLang();
  const { token, role, signOut } = useSession();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="sticky top-0 z-10 border-b border-line bg-[color:var(--color-page)]/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <button
            onClick={() => navigate(token ? '/home' : '/')}
            className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="PAU OS home"
          >
            <Logo />
          </button>
          <div className="flex items-center gap-2">
            {role === 'admin' ? (
              <Button variant="ghost" size="md" onClick={() => navigate('/admin')}>
                Admin
              </Button>
            ) : null}
            <button
              onClick={toggleLang}
              aria-label={`Switch language to ${lang === 'ca' ? 'Castellà' : 'Català'}`}
              title="Català / Castellà"
              className="grid h-9 min-w-9 place-items-center rounded-full border border-line px-2.5 text-xs font-semibold text-ink-secondary transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {lang === 'ca' ? 'CA' : 'ES'}
            </button>
            <button
              onClick={toggle}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="grid h-9 w-9 place-items-center rounded-full border border-line text-ink-secondary transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            {token ? (
              <Button variant="ghost" size="md" onClick={signOut}>
                Sign out
              </Button>
            ) : null}
          </div>
        </div>
      </header>
      <main className="flex-1 py-8 sm:py-10">{children}</main>
      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        PAU OS · Catalunya · Matemàtiques II · estimates, not guarantees
      </footer>
    </div>
  );
}
