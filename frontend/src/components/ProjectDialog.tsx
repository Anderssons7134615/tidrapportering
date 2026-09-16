import { useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { customersApi, projectsApi } from '../services/api';
import type { Project } from '../types';
import { Dialog } from './ui/design';
import { parseSwedishNumber } from '../utils/format';
import { refreshProjectQueries } from '../utils/projectQueries';

export function ProjectDialog({ project, onClose, onSaved }: { project?: Project; onClose: () => void; onSaved: () => void }) {
  const client = useQueryClient();
  const [customerId, setCustomerId] = useState(project?.customerId || '');
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const { data: customers, isError: customersFailed, refetch: retryCustomers } = useQuery({ queryKey: ['customers', 'active'], queryFn: () => customersApi.list(true) });
  const { data: nextCode } = useQuery({ queryKey: ['projects', 'next-code'], queryFn: projectsApi.nextCode, enabled: !project });
  const save = useMutation({
    mutationFn: (data: Partial<Project>) => project ? projectsApi.update(project.id, data) : projectsApi.create(data),
    onSuccess: () => {
      void refreshProjectQueries(client);
      toast.success(project ? 'Projektet sparades' : 'Projektet skapades');
      onSaved();
    },
    onError: (cause: Error) => setError(cause.message),
  });
  const close = () => { if (!save.isPending) onClose(); };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (save.isPending) return;
    setError('');
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) || '').trim();
    const number = (key: string) => text(key) ? parseSwedishNumber(text(key)) : null;
    const budgetHours = number('budgetHours');
    const fixedPrice = number('fixedPrice');
    const defaultRate = number('defaultRate');
    if ([budgetHours, fixedPrice, defaultRate].some((value) => value !== null && (!Number.isFinite(value) || value < 0))) {
      setError('Ange budget, timpris och fast pris som tal, minst 0. Decimaler kan skrivas med komma.');
      return;
    }
    const billingModel = text('billingModel') as Project['billingModel'];
    if (billingModel === 'FIXED' && fixedPrice === null) {
      setError('Ange anbud eller fast pris för ett fastprisprojekt.');
      return;
    }
    if (text('name').length < 2 || !text('code')) {
      setError('Ange ett projektnamn med minst två tecken och ett projektnummer.');
      return;
    }
    const data: Partial<Project> = { name: text('name'), code: text('code'), customerId: customerId || null, site: text('site') || null, status: text('status') as Project['status'], budgetHours, billingModel, fixedPrice, defaultRate, notes: text('notes') || null, employeeCanSeeResults: form.get('employeeCanSeeResults') === 'on' };
    // A colleague may have changed another field while this editor was open.
    // Only send values the user changed, preserving those unrelated updates.
    const changes = project ? Object.fromEntries(Object.entries(data).filter(([key, value]) => {
      const previous = key === 'employeeCanSeeResults' ? Boolean(project.employeeCanSeeResults) : project[key as keyof Project] ?? null;
      return value !== previous;
    })) as Partial<Project> : data;
    if (!Object.keys(changes).length) {
      toast.success('Inga ändringar att spara');
      onSaved();
      return;
    }
    save.mutate(changes);
  };

  return (
    <Dialog open onClose={close} title={project ? 'Redigera projekt' : 'Nytt projekt'} description={project ? `${project.code} · ${project.name}` : 'Fyll i projektuppgifter. Ekonomifälten är valfria för löpande projekt.'} footer={
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary" onClick={close} disabled={save.isPending}>Avbryt</button>
        <button type="submit" form="project-form" className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Sparar…' : project ? 'Spara ändringar' : 'Skapa projekt'}</button>
      </div>
    }>
      <form id="project-form" onSubmit={handleSubmit}>
        {error && <p role="alert" className="mb-4 text-sm text-rose-700">{error}</p>}
        <fieldset disabled={save.isPending} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <ProjectField autoFocus name="name" label="Projektnamn" defaultValue={project?.name} minLength={2} required />
          <ProjectField name="code" label="Projektnummer" value={code ?? project?.code ?? nextCode?.code ?? ''} onChange={(event) => setCode(event.target.value)} required />
          <label><span className="label">Kund</span><select name="customerId" className="input" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">Intern</option>
            {project?.customerId && !customers?.some((item) => item.id === project.customerId) && <option value={project.customerId}>{project.customer?.name || 'Nuvarande kund'}</option>}
            {customers?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <ProjectField name="site" label="Arbetsplats" defaultValue={project?.site || ''} />
          {customersFailed && <div className="sm:col-span-2 text-sm text-rose-700" role="alert">Kundlistan kunde inte hämtas. Nuvarande kund behålls. <button type="button" className="min-h-11 px-2 underline" onClick={() => void retryCustomers()}>Försök igen</button></div>}
          <label><span className="label">Status</span><select name="status" className="input" defaultValue={project?.status || 'PLANNED'}><option value="PLANNED">Planerad</option><option value="ONGOING">Pågående</option><option value="COMPLETED">Avslutad</option></select></label>
          <ProjectField name="budgetHours" label="Budget timmar" defaultValue={project?.budgetHours ?? ''} inputMode="decimal" placeholder="Valfritt" />
          <label><span className="label">Debitering</span><select name="billingModel" className="input" defaultValue={project?.billingModel || 'HOURLY'}><option value="HOURLY">Löpande</option><option value="FIXED">Fast pris</option></select></label>
          <ProjectField name="defaultRate" label="Timpris till kund (kr/tim)" defaultValue={project?.defaultRate ?? ''} inputMode="decimal" placeholder="Valfritt" />
          <ProjectField name="fixedPrice" label="Anbud / fast pris (exkl. moms)" defaultValue={project?.fixedPrice ?? ''} inputMode="decimal" placeholder="Valfritt vid löpande" />
          <label className="sm:col-span-2"><span className="label">Anteckningar</span><textarea name="notes" className="input min-h-24" defaultValue={project?.notes || ''} /></label>
          <label className="sm:col-span-2 flex min-h-11 items-center gap-3 border-t border-graphite-200 py-3 text-sm"><input name="employeeCanSeeResults" type="checkbox" defaultChecked={project?.employeeCanSeeResults || false} /><span>Visa attesterade projekttimmar för medarbetare</span></label>
        </fieldset>
      </form>
    </Dialog>
  );
}

function ProjectField({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label><span className="label">{label}</span><input {...props} className="input" /></label>;
}
