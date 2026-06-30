import type { HTMLAttributes, ReactNode } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

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

const toneTextClasses: Record<Tone, string> = {
  blue: 'text-sky-700',
  green: 'text-emerald-700',
  yellow: 'text-amber-800',
  red: 'text-rose-700',
  gray: 'text-graphite-600',
  slate: 'text-graphite-800',
  orange: 'text-primary-800',
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">{title}</h1>
          {description && <p className="app-description">{description}</p>}
        </div>
        {action}
      </div>
    </header>
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
    <div className="relative border-y border-graphite-200 bg-white/70 px-4 py-3 shadow-none">
      <div className={`absolute inset-y-0 left-0 w-0.5 ${toneAccentClasses[tone]}`} />
      <p className="text-[11px] font-semibold uppercase tracking-normal text-graphite-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tracking-normal tabular-nums sm:text-2xl ${toneTextClasses[tone]}`}>{value}</p>
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
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}>{label}</span>;
}

export function DataTable({ children }: { children: ReactNode }) {
  return <div className="table-wrap overflow-x-auto">{children}</div>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border-y border-dashed border-graphite-300 bg-white/60 px-4 py-7 text-left">
      <AlertCircle className="h-5 w-5 text-primary-600" />
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
    <div className="flex gap-5 overflow-x-auto border-b border-graphite-200 bg-transparent">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`whitespace-nowrap border-b-2 px-0 py-2 text-sm font-semibold transition ${
            active === tab.id ? 'border-primary-600 text-primary-800' : 'border-transparent text-graphite-600 hover:border-graphite-300 hover:text-graphite-950'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="work-panel p-3">{children}</div>;
}

export function ConfirmDialog() {
  return null;
}
