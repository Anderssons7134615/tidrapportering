import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Bot, Check, CheckCircle2, Edit2, ListTodo, MessageSquareText, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { projectsApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { Project, ProjectSummary, ProjectUpdate, ProjectUpdateType, TimeEntry } from '../types';
import { AppShell, Button, DataList, DataRow, DataTable, EmptyState, FormField, PageHeader, StatusBadge, Tabs, TaskSection } from '../components/ui/design';
import { QueryError } from '../components/ui/QueryError';
import { formatCurrency, formatDate, formatHours, formatPercent, toDateInputValue } from '../utils/format';
import { getProjectQueryAccess } from '../utils/frontendGuards';
import { ProjectDialog } from '../components/ProjectDialog';
const tabs = [
  { id: 'overview', label: 'Översikt' },
  { id: 'hours', label: 'Tid' },
  { id: 'summary', label: 'Ekonomi' },
  { id: 'notes', label: 'Dagbok' },
];

type ProjectUpdateForm = {
  type: ProjectUpdateType;
  content: string;
  date: string;
};

const emptyProjectUpdateForm = (): ProjectUpdateForm => ({
  type: 'STATUS',
  content: '',
  date: toDateInputValue(new Date()),
});

export default function ProjectDetail() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const [activeTab, setActiveTab] = useState('overview');
  const [editingProject, setEditingProject] = useState(false);
  const [projectUpdateForm, setProjectUpdateForm] = useState<ProjectUpdateForm>(emptyProjectUpdateForm);

  const { data: project, isLoading, isError: projectFailed, error: projectError, refetch: refetchProject } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id),
    enabled: !!id,
  });
  const returnCustomerId = searchParams.get('customerId');
  const returnToCustomer = Boolean(project?.customer && returnCustomerId === project.customer.id && !searchParams.has('internal'));
  const returnToInternal = Boolean(project && !project.customer && searchParams.get('internal') === '1' && !searchParams.has('customerId'));
  const returnParams = new URLSearchParams(returnToCustomer ? { customerId: returnCustomerId! } : returnToInternal ? { internal: '1' } : {});
  if (searchParams.get('archived') === '1') returnParams.set('archived', '1');
  const returnPath = `/projects${returnParams.size ? `?${returnParams}` : ''}`;

  const { data: summary, isLoading: summaryLoading, isError: summaryFailed, refetch: refetchSummary } = useQuery({
    queryKey: ['project', id, 'summary'],
    queryFn: () => projectsApi.getSummary(id),
    enabled: !!id,
  });

  const { canLoadTimeEntries } = getProjectQueryAccess({
    hasProjectId: Boolean(id),
    isManager,
    hoursVisibleToCurrentUser: project?.hoursVisibleToCurrentUser,
    employeeCanSeeResults: project?.employeeCanSeeResults,
  });

  const { data: timeEntries, isLoading: timeEntriesLoading, isError: timeEntriesFailed, refetch: refetchTimeEntries } = useQuery({
    queryKey: ['project', id, 'time-entries'],
    queryFn: () => projectsApi.listTimeEntries(id),
    enabled: canLoadTimeEntries && activeTab === 'hours',
  });

  const {
    data: projectUpdates,
    isLoading: isLoadingProjectUpdates,
    isError: projectUpdatesFailed,
    refetch: refetchProjectUpdates,
  } = useQuery({
    queryKey: ['project', id, 'updates'],
    queryFn: () => projectsApi.listUpdates(id),
    enabled: !!id && activeTab === 'notes',
  });

  const p = project as Project | undefined;
  const metrics = p?.metrics;
  const entries = (timeEntries || []) as TimeEntry[];
  const projectSummary = summary as ProjectSummary | undefined;
  const updates = (projectUpdates || []) as ProjectUpdate[];
  const canSeeMoney = isAdmin && Boolean(
    p?.financialsVisibleToCurrentUser
      || projectSummary?.financialsVisibleToCurrentUser
  );
  const hoursOnly = Boolean(p?.hoursVisibleToCurrentUser && !canSeeMoney);
  const visibleTabs = tabs.filter(tab => tab.id !== 'summary' || canSeeMoney);

  const createProjectUpdateMutation = useMutation({
    mutationFn: () => projectsApi.createUpdate(id, {
      type: projectUpdateForm.type,
      content: projectUpdateForm.content.trim(),
      occurredAt: new Date(`${projectUpdateForm.date}T12:00:00`).toISOString(),
    }),
    onSuccess: () => {
      toast.success('Projekthändelsen sparades');
      setProjectUpdateForm(emptyProjectUpdateForm());
      queryClient.invalidateQueries({ queryKey: ['project', id, 'updates'] });
      void queryClient.invalidateQueries({ queryKey: ['project-control'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const groupedByPerson = useMemo(() => {
    const rows = new Map<string, { name: string; hours: number }>();
    entries.forEach((entry) => {
      const key = entry.userId;
      const row = rows.get(key) || { name: entry.user?.name || 'Okänd', hours: 0 };
      row.hours += entry.hours;
      rows.set(key, row);
    });
    return Array.from(rows.values()).sort((a, b) => b.hours - a.hours);
  }, [entries]);

  const budgetUsage = metrics?.budgetUsagePercent ?? null;
  const result = projectSummary?.totals.result ?? null;

  if (isLoading) return <TaskSection>Laddar projekt...</TaskSection>;

  if (projectFailed) {
    const status = (projectError as Error & { status?: number } | null)?.status;
    return (
      <AppShell>
        <Link to="/projects" className="btn-secondary inline-flex w-fit"><ArrowLeft className="h-4 w-4" /> Tillbaka</Link>
        {status === 404
          ? <EmptyState title="Projektet hittades inte" description="Projektet kan ha inaktiverats eller länken kan vara fel." />
          : <QueryError title="Projektet kunde inte hämtas" onRetry={() => void refetchProject()} />}
      </AppShell>
    );
  }

  if (!p) {
    return (
      <AppShell>
        <Link to="/projects" className="btn-secondary inline-flex"><ArrowLeft className="h-4 w-4" /> Tillbaka</Link>
        <EmptyState title="Projektet kunde inte hämtas" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link to={returnPath} className="btn-secondary inline-flex w-fit"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> {returnToCustomer || returnToInternal ? 'Tillbaka till kundens projekt' : 'Tillbaka'}</Link>
      <PageHeader
        title={p.name}
        description={`${p.code} · ${p.customer?.name || 'Intern'}${p.site ? ` · ${p.site}` : ''}${metrics?.lastActivityAt ? ` · Senaste aktivitet ${formatDate(metrics.lastActivityAt)}` : ''}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {isManager && <button type="button" className="btn-primary" onClick={() => setEditingProject(true)}><Edit2 className="h-4 w-4" aria-hidden="true" />Redigera projekt</button>}
            {metrics?.status && <StatusBadge label={metrics.status.label} tone={metrics.status.tone} />}
          </div>
        }
      />

      {(summaryFailed || (activeTab === 'hours' && canLoadTimeEntries && timeEntriesFailed)) && (
        <QueryError
          title="Delar av projektet kunde inte hämtas"
          description="Vissa timmar eller ekonomivärden kan saknas. Försök igen innan du använder sammanställningen."
          onRetry={() => {
            void refetchSummary();
            if (activeTab === 'hours' && canLoadTimeEntries) void refetchTimeEntries();
          }}
        />
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-y border-graphite-200 py-3 text-sm text-graphite-600">
        {canSeeMoney && <span><strong className="text-graphite-950">{metrics?.totalHours != null ? formatHours(metrics.totalHours) : '—'}</strong> rapporterat</span>}
        <span><strong className="text-graphite-950">{projectSummary?.totals.totalHours != null ? formatHours(projectSummary.totals.totalHours) : '—'}</strong> attesterat</span>
        {canSeeMoney && <><span>{p.budgetHours != null ? `${formatHours(p.budgetHours)} timbudget` : 'Ingen timbudget'}</span><span>{formatCurrency(projectSummary?.totals.materialCost)} inköp och lageruttag</span><span>{formatCurrency(result)} beräknat resultat</span></>}
      </div>

      <Tabs tabs={visibleTabs} active={activeTab} onChange={setActiveTab} label="Projektinnehåll">

      {(activeTab === 'overview' || activeTab === 'summary') && summaryLoading && <TaskSection><p role="status">Laddar sammanställning…</p></TaskSection>}
      {activeTab === 'overview' && !summaryLoading && !summaryFailed && (
        <div className={`grid grid-cols-1 gap-5 ${canSeeMoney ? 'xl:grid-cols-[1.1fr_0.9fr]' : ''}`}>
          <TaskSection className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="section-title">Projektläge</h2>
                <p className="mt-1 text-sm text-graphite-600">{canSeeMoney ? 'Timmar, budget och underlag att följa upp.' : 'Attesterade projekttimmar för teamet.'}</p>
              </div>
              <StatusBadge label={p.status === 'COMPLETED' ? 'Avslutad' : p.status === 'ONGOING' ? 'Pågående' : 'Planerad'} tone={p.status === 'COMPLETED' ? 'gray' : 'green'} />
            </div>
            {canSeeMoney && <>
              <BudgetPanel budgetHours={p.budgetHours} totalHours={metrics?.totalHours} usage={budgetUsage} />
              <WarningList warnings={projectSummary?.warnings || []} />
            </>}
          </TaskSection>

          {canSeeMoney && <TaskSection title="Ekonomi">
            {
              <div className="space-y-2 text-sm">
                <Line
                  label={p.billingModel === 'FIXED' ? 'Anbud / fast pris' : 'Timpris till kund'}
                  value={
                    p.billingModel === 'FIXED'
                      ? formatCurrency(p.fixedPrice)
                      : (p.defaultRate ?? p.customer?.defaultRate) != null
                        ? `${formatCurrency(p.defaultRate ?? p.customer?.defaultRate)}/tim`
                        : 'Saknas'
                  }
                />
                <Line label="Beräknad intäkt" value={formatCurrency(projectSummary?.totals.revenue)} />
                <Line label="Arbetskostnad" value={formatCurrency(projectSummary?.totals.laborCost)} />
                <Line label="Inköp och lageruttag" value={formatCurrency(projectSummary?.totals.materialCost)} />
                <Line label="Beräknat resultat" value={formatCurrency(result)} strong tone={result != null && result < 0 ? 'red' : 'green'} />
                <p className="pt-2 text-xs text-graphite-600">Attesterad tid, bekräftade projektinköp och lageruttag, exklusive moms. Saknade fakturor och ej attesterad tid ingår inte. {p.billingModel === 'FIXED' ? 'Fastpriset omfattar hela arbetet; återstående kostnader ingår inte.' : 'Fakturerade och betalda belopp visas inte här.'}</p>
              </div>
            }
          </TaskSection>}

          <TaskSection title="Senaste tidrader">
            <SimpleEntries entries={(projectSummary?.recentEntries?.length ? projectSummary.recentEntries : entries).slice(0, 6)} />
          </TaskSection>

          <TaskSection title="Attesterad tid per person">
            {projectSummary?.byUser?.length ? (
              <DataList>
                {projectSummary.byUser.slice(0, 5).map((row) => (
                  <DataRow key={row.userId} className="min-h-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-graphite-950">{row.userName}</span>
                      <span className="text-sm font-semibold">{formatHours(row.hours)}</span>
                    </div>
                  </DataRow>
                ))}
              </DataList>
            ) : (
              <EmptyState title="Ingen attesterad tid att visa" />
            )}
          </TaskSection>
        </div>
      )}

      {activeTab === 'hours' && canLoadTimeEntries && timeEntriesLoading && <TaskSection><p role="status">Laddar tidrader…</p></TaskSection>}
      {activeTab === 'hours' && !canLoadTimeEntries && <EmptyState title="Projekttimmar är dolda" description="Du saknar behörighet att se projektets tidrader." />}
      {activeTab === 'hours' && canLoadTimeEntries && !timeEntriesLoading && !timeEntriesFailed && (
        <TaskSection title={hoursOnly ? 'Attesterade projekttimmar' : 'Tid'}>
          <DataTable label="Projektets tidrader">
            <table className="min-w-full text-sm">
              <thead className="table-head">
                <tr><th className="px-3 py-2">Datum</th><th className="px-3 py-2">Anställd</th><th className="px-3 py-2">Arbetsmoment</th><th className="px-3 py-2">Timmar</th>{!hoursOnly && <><th className="px-3 py-2">Status</th><th className="px-3 py-2">Kommentar</th></>}</tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100">
                    <td className="px-3 py-2">{formatDate(entry.date)}</td>
                    <td className="px-3 py-2">{entry.user?.name}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-900">{entry.activity?.name || 'Saknar aktivitet'}</div>
                      <div className="text-xs text-slate-500">{entry.activity?.code || '-'}</div>
                    </td>
                    <td className="px-3 py-2 font-semibold">{formatHours(entry.hours)}</td>
                    {!hoursOnly && <><td className="px-3 py-2">{{ DRAFT: 'Utkast', SUBMITTED: 'Inskickad', APPROVED: 'Attesterad', REJECTED: 'Behöver rättas' }[entry.status] || entry.status}</td><td className="px-3 py-2">{entry.note || '-'}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
          {!entries.length && <EmptyState title="Inga tidrader att visa" />}
          <div className="mt-4 divide-y divide-graphite-200">
            {groupedByPerson.map((row) => <Line key={row.name} label={row.name} value={formatHours(row.hours)} />)}
          </div>
        </TaskSection>
      )}

      {activeTab === 'summary' && canSeeMoney && !summaryLoading && !summaryFailed && (
        <div>
          <SummaryPanel summary={projectSummary} project={p} canSeeMoney={canSeeMoney} />
        </div>
      )}

      {activeTab === 'notes' && (
        <TaskSection>
          <div className="border-b border-graphite-200 pb-4">
            <h2 className="section-title">Projektdagbok</h2>
            <p className="mt-1 max-w-2xl text-sm text-graphite-500">
              Lägesuppdateringar, risker, beslut och nästa steg i samma kronologiska flöde.
            </p>
          </div>

          {isManager && (
            <form
              className="grid grid-cols-1 gap-3 border-b border-graphite-200 py-5 lg:grid-cols-[minmax(10rem,0.55fr)_minmax(10rem,0.55fr)_minmax(20rem,2fr)_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                createProjectUpdateMutation.mutate();
              }}
            >
              <FormField label="Typ" controlId="project-update-type">
                <select
                  id="project-update-type"
                  className="input"
                  value={projectUpdateForm.type}
                  onChange={(event) => setProjectUpdateForm((current) => ({
                    ...current,
                    type: event.target.value as ProjectUpdateType,
                  }))}
                >
                  <option value="STATUS">Lägesuppdatering</option>
                  <option value="NEXT_STEP">Nästa steg</option>
                  <option value="RISK">Risk</option>
                  <option value="DECISION">Beslut</option>
                  <option value="NOTE">Anteckning</option>
                </select>
              </FormField>
              <FormField label="Datum" controlId="project-update-date">
                <input
                  id="project-update-date"
                  type="date"
                  className="input"
                  value={projectUpdateForm.date}
                  onChange={(event) => setProjectUpdateForm((current) => ({ ...current, date: event.target.value }))}
                  required
                />
              </FormField>
              <FormField label="Vad har hänt?" controlId="project-update-content">
                <textarea
                  id="project-update-content"
                  className="input min-h-[48px] resize-y py-3"
                  rows={1}
                  value={projectUpdateForm.content}
                  onChange={(event) => setProjectUpdateForm((current) => ({ ...current, content: event.target.value }))}
                  placeholder="Skriv kort och konkret..."
                  maxLength={5000}
                  required
                />
              </FormField>
              <div className="flex items-end">
                <Button
                  type="submit"
                  isLoading={createProjectUpdateMutation.isPending}
                  disabledReason={!projectUpdateForm.content.trim() ? 'Skriv vad som har hänt' : null}
                >
                  <Plus className="h-4 w-4" />
                  Lägg till
                </Button>
              </div>
            </form>
          )}

          <ProjectTimeline
            updates={updates}
            legacyNotes={p.notes}
            isLoading={isLoadingProjectUpdates}
            hasError={projectUpdatesFailed}
            onRetry={() => void refetchProjectUpdates()}
          />
        </TaskSection>
      )}
      </Tabs>
      {editingProject && isManager && <ProjectDialog key={id} project={p} onClose={() => setEditingProject(false)} onSaved={() => setEditingProject(false)} />}
    </AppShell>
  );
}

const projectUpdateLabels: Record<ProjectUpdateType, string> = {
  NOTE: 'Anteckning',
  STATUS: 'Lägesuppdatering',
  RISK: 'Risk',
  DECISION: 'Beslut',
  NEXT_STEP: 'Nästa steg',
};

const projectUpdateTextTones: Record<ProjectUpdateType, string> = {
  NOTE: 'text-graphite-600',
  STATUS: 'text-sky-700',
  RISK: 'text-rose-700',
  DECISION: 'text-emerald-700',
  NEXT_STEP: 'text-amber-700',
};

function ProjectTimeline({
  updates,
  legacyNotes,
  isLoading,
  hasError,
  onRetry,
}: {
  updates: ProjectUpdate[];
  legacyNotes?: string | null;
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
}) {
  if (isLoading) {
    return <p className="py-6 text-sm text-graphite-500" role="status">Laddar projektdagboken...</p>;
  }

  if (hasError) {
    return (
      <div className="py-5">
        <QueryError
          title="Projektdagboken kunde inte hämtas"
          description="Kontrollera anslutningen och försök igen. Inget har ändrats."
          onRetry={onRetry}
        />
      </div>
    );
  }

  if (!updates.length && !legacyNotes) {
    return (
      <EmptyState
        title="Projektdagboken är tom"
        description="När något händer i projektet visas det här."
      />
    );
  }

  return (
    <div className="divide-y divide-graphite-200">
      {updates.map((update) => (
        <article key={update.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 py-5 sm:grid-cols-[2rem_minmax(0,1fr)]">
          <ProjectUpdateIcon type={update.type} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={`text-xs font-bold uppercase ${projectUpdateTextTones[update.type]}`}>
                {projectUpdateLabels[update.type]}
              </span>
              <span className="text-xs text-graphite-500">
                {formatDate(update.occurredAt)}
                {update.createdByUser?.name ? ` · ${update.createdByUser.name}` : ''}
              </span>
              {update.source === 'CHATGPT' && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700">
                  <Bot className="h-3.5 w-3.5" />
                  ChatGPT
                </span>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-graphite-800">{update.content}</p>
          </div>
        </article>
      ))}

      {legacyNotes && (
        <article className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 py-5 sm:grid-cols-[2rem_minmax(0,1fr)]">
          <MessageSquareText className="mt-0.5 h-5 w-5 text-graphite-400" />
          <div className="min-w-0">
            <span className="text-xs font-bold uppercase text-graphite-500">Äldre projektanteckning</span>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-graphite-700">{legacyNotes}</p>
          </div>
        </article>
      )}
    </div>
  );
}

function ProjectUpdateIcon({ type }: { type: ProjectUpdateType }) {
  const className = `mt-0.5 h-5 w-5 ${projectUpdateTextTones[type]}`;

  switch (type) {
    case 'RISK':
      return <AlertTriangle className={className} />;
    case 'DECISION':
      return <CheckCircle2 className={className} />;
    case 'NEXT_STEP':
      return <ListTodo className={className} />;
    case 'NOTE':
      return <MessageSquareText className={className} />;
    default:
      return <Check className={className} />;
  }
}

function BudgetPanel({ budgetHours, totalHours, usage }: { budgetHours?: number | null; totalHours?: number | null; usage?: number | null }) {
  const bounded = Math.max(0, Math.min(usage || 0, 100));
  const tone = (usage || 0) >= 100 ? 'bg-rose-500' : (usage || 0) >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="border-y border-graphite-200 bg-graphite-50 px-4 py-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold text-graphite-950">Budgetförbrukning</span>
        <span className="font-semibold">{budgetHours == null ? 'Ingen timbudget' : budgetHours === 0 ? '0 h budget' : formatPercent(usage)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white">
        <div className={`h-full rounded-full ${tone}`} style={{ width: budgetHours != null && budgetHours > 0 ? `${bounded}%` : '0%' }} />
      </div>
      <p className="mt-2 text-xs text-graphite-600">{totalHours == null ? '—' : formatHours(totalHours)} rapporterat {budgetHours != null ? `av ${formatHours(budgetHours)}` : 'utan timbudget'}</p>
    </div>
  );
}

function WarningList({ warnings }: { warnings: string[] }) {
  const uniqueWarnings = Array.from(new Set(warnings.filter(Boolean)));
  if (!uniqueWarnings.length) return <EmptyState title="Inga varningar" description="Projektet har inga markerade avvikelser just nu." />;
  return (
    <div className="space-y-2">
      {uniqueWarnings.map((warning) => (
        <div key={warning} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{warning}</span>
        </div>
      ))}
    </div>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'green' | 'red' }) {
  return (
    <div className="flex justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className={`${strong ? 'font-bold' : 'font-semibold'} ${tone === 'red' ? 'text-rose-700' : tone === 'green' ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

function SimpleEntries({ entries }: { entries: TimeEntry[] }) {
  if (!entries.length) return <EmptyState title="Inga tidrader" />;
  return (
    <DataList>
      {entries.map((entry) => (
        <DataRow key={entry.id} className="min-h-0 text-sm">
          <span>{formatDate(entry.date)} · {entry.user?.name} · {entry.activity?.name || 'Aktivitet saknas'}</span>
          <strong>{formatHours(entry.hours)}</strong>
        </DataRow>
      ))}
    </DataList>
  );
}

function SummaryPanel({ summary, project, canSeeMoney }: { summary?: ProjectSummary; project: Project; canSeeMoney: boolean }) {
  if (!summary?.resultsVisibleToCurrentUser || !canSeeMoney) {
    return <EmptyState title="Sammanfattning är dold" description="Du saknar behörighet att se projektets ekonomi." />;
  }
  const isCompleted = project.status === 'COMPLETED';
  const result = summary.totals.result;
  return (
    <div className="space-y-5">
      <TaskSection>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Beräknad projektekonomi</h2>
            <p className="mt-1 text-sm text-graphite-600">Attesterade timmar, bekräftade projektinköp och lageruttag, exklusive moms. Saknade fakturor och ej attesterad tid ingår inte. {project.billingModel === 'FIXED' ? 'Hela fastpriset ingår, men bara hittills registrerade kostnader.' : 'Beloppen är inte hämtade från kundfakturor.'}</p>
          </div>
          <StatusBadge label={isCompleted ? 'Avslutad' : 'Pågående'} tone={isCompleted ? 'gray' : 'green'} />
        </div>
        <div className="divide-y divide-graphite-200 text-sm">
          <Line label="Beräknad intäkt" value={formatCurrency(summary.totals.revenue)} />
          <Line label="Arbetskostnad" value={formatCurrency(summary.totals.laborCost)} />
          <Line label="Inköp och lageruttag" value={formatCurrency(summary.totals.materialCost)} />
          <Line label="Beräknat resultat" value={result == null ? 'Underlag saknas' : formatCurrency(result)} strong tone={result != null && result < 0 ? 'red' : 'green'} />
          <Line label="Beräknad marginal" value={formatPercent(summary.totals.marginPercent)} />
        </div>
        {summary.warnings.length > 0 && <div className="mt-4"><WarningList warnings={summary.warnings} /></div>}
      </TaskSection>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <TaskSection title="Per person">
          {summary.byUser.length ? (
            <div className="space-y-2">
              {summary.byUser.map((row) => <Line key={row.userId} label={row.userName} value={formatHours(row.hours)} />)}
            </div>
          ) : <EmptyState title="Ingen attesterad tid" />}
        </TaskSection>
        <TaskSection title="Per arbetsmoment">
          {summary.byActivity.length ? (
            <div className="space-y-2">
              {summary.byActivity.map((row) => <Line key={row.activityId} label={row.activityName} value={formatHours(row.hours)} />)}
            </div>
          ) : <EmptyState title="Inga arbetsmoment" />}
        </TaskSection>
      </div>
    </div>
  );
}
