import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Page content column — responsive max width, centered, padded. */
export function Container({
  children,
  size = 'md',
  className = '',
}: {
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const max = size === 'sm' ? 'max-w-xl' : size === 'lg' ? 'max-w-6xl' : 'max-w-3xl';
  return <div className={`mx-auto w-full ${max} px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function Card({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'li';
}) {
  return (
    <Tag
      className={`rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6 ${className}`}
    >
      {children}
    </Tag>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
  block?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-[var(--color-page)] disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]';
  const sizes = size === 'lg' ? 'px-6 py-3.5 text-base' : 'px-4 py-2.5 text-sm';
  const variants: Record<string, string> = {
    primary: 'bg-primary text-primary-fg hover:bg-primary-hover',
    secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-2',
    ghost: 'text-ink-secondary hover:bg-surface-2',
    danger: 'border border-[color:var(--color-critical)] text-[color:var(--color-critical)] hover:bg-[color:var(--color-critical)]/10',
  };
  return (
    <button
      className={`${base} ${sizes} ${variants[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export type Tone = 'good' | 'info' | 'serious' | 'critical' | 'warning' | 'muted';

const TONE_COLOR: Record<Tone, string> = {
  good: 'var(--color-good)',
  info: 'var(--color-primary)',
  serious: 'var(--color-serious)',
  critical: 'var(--color-critical)',
  warning: 'var(--color-warning)',
  muted: 'var(--color-muted)',
};

/** Status pill — a colored dot + label so meaning never rests on color alone. */
export function Badge({ text, tone = 'muted' }: { text: string; tone?: Tone }) {
  const color = TONE_COLOR[tone];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-secondary">
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {text}
    </span>
  );
}

export function ProgressBar({ value, tone }: { value: number; tone?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, backgroundColor: tone ?? 'var(--color-primary)' }}
      />
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-secondary">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line-strong border-t-[color:var(--color-primary)]" />
      {label ? <p className="text-sm">{label}</p> : null}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-card border border-[color:var(--color-critical)]/30 bg-[color:var(--color-critical)]/10 px-4 py-3 text-sm text-[color:var(--color-critical)]"
    >
      {message}
    </div>
  );
}

/** Compact KPI tile. */
export function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p
        className="mt-1 text-2xl font-bold tabular-nums text-ink"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-secondary">{hint}</p> : null}
    </div>
  );
}

export function PageTitle({ kicker, title }: { kicker?: string; title: string }) {
  return (
    <header className="mb-6">
      {kicker ? (
        <p className="text-sm font-medium uppercase tracking-wide text-muted">{kicker}</p>
      ) : null}
      <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
    </header>
  );
}
