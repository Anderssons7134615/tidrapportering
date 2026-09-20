import { useEffect, useId, useLayoutEffect, useRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';

type Tone = 'blue' | 'green' | 'yellow' | 'red' | 'gray' | 'slate' | 'orange' | 'dark';

const toneClasses: Record<Tone, string> = {
  blue: 'border-sky-200 bg-sky-50 text-sky-800',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  yellow: 'border-amber-200 bg-amber-50 text-amber-900',
  red: 'border-rose-200 bg-rose-50 text-rose-800',
  gray: 'border-graphite-200 bg-graphite-100 text-graphite-700',
  slate: 'border-graphite-200 bg-white text-graphite-800',
  orange: 'border-primary-200 bg-primary-50 text-primary-900',
  dark: 'border-graphite-800 bg-graphite-950 text-white',
};

const toneTextClasses: Record<Tone, string> = {
  blue: 'text-sky-800',
  green: 'text-emerald-800',
  yellow: 'text-amber-900',
  red: 'text-rose-800',
  gray: 'text-graphite-700',
  slate: 'text-graphite-950',
  orange: 'text-primary-900',
  dark: 'text-graphite-950',
};

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="app-workspace">{children}</div>;
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="app-header">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">{title}</h1>
          {description && <p className="app-description">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}

export function TaskSection({
  children,
  className = '',
  title,
  action,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  children: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section {...props} className={`task-section ${className}`}>
      {(title || action) && (
        <div className="task-section-header">
          <div className="min-w-0">{typeof title === 'string' ? <h2 className="section-title">{title}</h2> : title}</div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** @deprecated Use TaskSection for new screens. Kept while legacy screens are migrated. */
export function Card({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div {...props} className={`task-section ${className}`}>{children}</div>;
}

export function DataList({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`data-list ${className}`}>{children}</div>;
}

export function DataRow({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div {...props} className={`data-row ${className}`}>{children}</div>;
}

export function Toolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`toolbar ${className}`}>{children}</div>;
}

export function ReviewSummary({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`review-summary ${className}`}>{children}</div>;
}

export function KpiCard({
  label,
  value,
  hint,
  tone = 'slate',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="kpi-summary">
      <p className="text-xs font-bold text-graphite-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${toneTextClasses[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs font-medium text-graphite-500">{hint}</p>}
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  disabledReason,
  isLoading,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  disabledReason?: string | null;
  isLoading?: boolean;
}) {
  const reasonId = useId();
  const cls =
    variant === 'secondary'
      ? 'btn-secondary'
      : variant === 'danger'
        ? 'btn-danger'
        : variant === 'success'
          ? 'btn-success'
          : 'btn-primary';
  const disabled = props.disabled || Boolean(disabledReason) || isLoading;

  return (
    <div className={className}>
      <button
        {...props}
        disabled={disabled}
        aria-describedby={disabledReason ? reasonId : props['aria-describedby']}
        title={disabledReason || props.title}
        className={`${cls} w-full`}
      >
        {isLoading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : children}
      </button>
      {disabledReason && <p id={reasonId} className="mt-1 text-xs font-medium text-amber-800">{disabledReason}</p>}
    </div>
  );
}

export function StatusBadge({ label, tone = 'gray' }: { label: string; tone?: Tone }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}>{label}</span>;
}
