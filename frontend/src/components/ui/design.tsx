import { useId, useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
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
      <p className="text-xs font-semibold uppercase tracking-normal text-graphite-500">{label}</p>
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

export function DataTable({ children }: { children: ReactNode }) {
  return <div className="table-wrap overflow-x-auto">{children}</div>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="empty-state">
      <AlertCircle className="h-5 w-5 text-primary-700" aria-hidden="true" />
      <p className="mt-2 font-semibold text-graphite-950">{title}</p>
      {description && <p className="mt-1 text-sm text-graphite-600">{description}</p>}
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
      {hint && <span className="mt-1 block text-xs text-graphite-600">{hint}</span>}
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
    <div role="tablist" className="flex gap-5 overflow-x-auto border-b border-graphite-200 bg-transparent">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`whitespace-nowrap border-b-2 px-0 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 ${
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
  return <div className="toolbar">{children}</div>;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      const initialFocus = dialog.querySelector<HTMLElement>('[autofocus]')
        ?? dialog.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])')
        ?? dialog.querySelector<HTMLElement>('button:not([disabled])');
      initialFocus?.focus();
    }
    if (!open && dialog.open) {
      dialog.close();
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className="dialog-surface"
    >
      <div className="dialog-header">
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-graphite-950">{title}</h2>
          {description && <p id={descriptionId} className="mt-1 text-sm leading-6 text-graphite-600">{description}</p>}
        </div>
        <button type="button" onClick={onClose} className="icon-button" aria-label="Stäng dialog">
          <X aria-hidden="true" size={18} />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer && <div className="dialog-footer">{footer}</div>}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Bekräfta',
  confirmVariant = 'danger',
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmVariant?: 'danger' | 'success' | 'primary';
  isLoading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">Avbryt</button>
          <button type="button" onClick={onConfirm} disabled={isLoading} className={confirmVariant === 'success' ? 'btn-success' : confirmVariant === 'primary' ? 'btn-primary' : 'btn-danger'}>
            {isLoading && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm leading-6 text-graphite-700">Den här åtgärden går inte att ångra.</p>
    </Dialog>
  );
}
