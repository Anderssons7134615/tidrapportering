import type { HTMLAttributes, ReactNode } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

type Tone = 'blue' | 'green' | 'yellow' | 'red' | 'gray' | 'slate' | 'orange' | 'dark';

const toneClasses: Record<Tone, string> = {
  blue: 'border-sky-200/80 bg-sky-50/80 text-sky-800',
  green: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-800',
  yellow: 'border-amber-200/80 bg-amber-50/90 text-amber-900',
  red: 'border-rose-200/80 bg-rose-50/90 text-rose-800',
  gray: 'border-graphite-200/80 bg-graphite-100/80 text-graphite-700',
  slate: 'border-graphite-200/80 bg-white/95 text-graphite-800',
  orange: 'border-primary-200/80 bg-primary-50/90 text-primary-900',
  dark: 'border-graphite-800 bg-graphite-950 text-white',
};

const toneAccentClasses: Record<Tone, string> = {
  blue: 'bg-sky-500',
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-rose-500',
  gray: 'bg-graphite-400',
  slate: 'bg-graphite-600',
  orange: 'bg-primary-500',
  dark: 'bg-primary-400',
};

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="space-y-4 sm:space-y-5 lg:space-y-6">{children}</div>;
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
    <div className="relative overflow-hidden rounded-xl border border-white/70 bg-white/90 p-4 shadow-soft ring-1 ring-graphite-200/45 backdrop-blur sm:p-5">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary-500/0 via-primary-500/70 to-emerald-400/0" />
      <div className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-primary-500/80" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-graphite-500">{description}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}

export function Card({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div {...props} className={`card ${className}`}>{children}</div>;
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
    <div className={`group relative overflow-hidden rounded-xl border p-4 shadow-sm ring-1 ring-white/65 transition duration-200 hover:-translate-y-0.5 hover:shadow-soft ${toneClasses[tone]}`}>
      <div className={`absolute left-0 top-0 h-full w-1 ${toneAccentClasses[tone]}`} />
      <div className="absolute inset-x-0 top-0 h-px bg-current opacity-20" />
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs font-medium opacity-75">{hint}</p>}
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
    <div className={className} title={disabledReason || undefined}>
      <button {...props} disabled={disabled} className={`${cls} w-full`}>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
      </button>
      {disabledReason && <p className="mt-1 text-xs font-medium text-amber-700">{disabledReason}</p>}
    </div>
  );
}

export function StatusBadge({ label, tone = 'gray' }: { label: string; tone?: Tone }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm ${toneClasses[tone]}`}>{label}</span>;
}

export function DataTable({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-graphite-200 bg-white shadow-soft ring-1 ring-white/70">{children}</div>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-graphite-300 bg-white/70 px-4 py-8 text-center shadow-sm">
      <AlertCircle className="mx-auto h-5 w-5 text-primary-500" />
      <p className="mt-2 font-semibold text-graphite-950">{title}</p>
      {description && <p className="mt-1 text-sm text-graphite-500">{description}</p>}
    </div>
  );
}

export function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-graphite-200 bg-white/75 p-1 shadow-sm ring-1 ring-white/70">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${
            active === tab.id ? 'bg-graphite-950 text-white shadow-sm' : 'text-graphite-600 hover:bg-white hover:text-graphite-950'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-white/70 bg-white/90 p-3 shadow-soft ring-1 ring-graphite-200/45">{children}</div>;
}

export function ConfirmDialog() {
  return null;
}
