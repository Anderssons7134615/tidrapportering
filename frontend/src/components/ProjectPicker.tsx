import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { ProjectOption } from '../types';

type Props = { id: string; projects: ProjectOption[]; value: string; onChange: (id: string) => void; required: boolean };
const label = (project: ProjectOption) => `${project.code} · ${project.name}${project.customer ? ` (${project.customer.name})` : ''}`;

export function ProjectPicker({ id, projects, value, onChange, required }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const selected = projects.find((project) => project.id === value);
  const terms = query.toLocaleLowerCase('sv').trim().split(/\s+/).filter(Boolean);
  const matches = projects.filter((project) => terms.every((term) => label(project).toLocaleLowerCase('sv').includes(term)));
  const visible = matches.slice(0, 30);
  const activeProject = visible[active];

  useEffect(() => { setQuery(''); setOpen(false); setActive(-1); }, [value]);
  useEffect(() => {
    if (open && activeProject) document.getElementById(`${id}-${activeProject.id}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activeProject, id]);

  const choose = (projectId: string) => {
    onChange(projectId);
    setQuery('');
    setOpen(false);
    setActive(-1);
  };

  return <div onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setOpen(false); setQuery(''); setActive(-1); }
  }}>
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-graphite-500" aria-hidden="true" />
      <input ref={input} id={id} role="combobox" aria-required={required} aria-expanded={open} aria-controls={`${id}-results`}
        aria-autocomplete="list" aria-activedescendant={open && activeProject ? `${id}-${activeProject.id}` : undefined}
        autoComplete="off" className="input pl-10 pr-12" placeholder="Sök projektnamn, nummer eller kund"
        value={open ? query : selected ? label(selected) : ''}
        onFocus={() => { setOpen(true); setActive(-1); }}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActive((current) => !visible.length ? -1 : event.key === 'ArrowDown' ? (current + 1) % visible.length : current <= 0 ? visible.length - 1 : current - 1);
          } else if (event.key === 'Enter' && open) {
            event.preventDefault();
            if (activeProject) choose(activeProject.id);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault(); event.stopPropagation(); setOpen(false); setQuery(''); setActive(-1);
          }
        }} />
      {(value || query) && <button type="button" aria-label="Rensa projektval" className="absolute right-0 top-0 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-graphite-600 hover:bg-graphite-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600"
        onClick={() => { choose(''); input.current?.focus(); }}><X size={18} aria-hidden="true" /></button>}
    </div>
    {open && <div className="mt-1 rounded-lg border border-graphite-300 bg-white">
      <ul id={`${id}-results`} role="listbox" aria-label="Projekt" className="max-h-64 overflow-y-auto">
        {visible.map((project, index) => <li key={project.id} id={`${id}-${project.id}`} role="option" aria-selected={project.id === value}
          className={`min-h-11 cursor-pointer break-words px-3.5 py-3 text-sm ${index === active ? 'bg-primary-50 text-primary-800' : 'text-graphite-950 hover:bg-graphite-50'}`}
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose(project.id)}>{label(project)}</li>)}
      </ul>
      <p role="status" className="border-t border-graphite-200 px-3.5 py-2 text-sm text-graphite-600">
        {!matches.length ? 'Inga projekt matchar sökningen.' : matches.length > 30 ? `Visar 30 av ${matches.length} projekt. Skriv mer för att begränsa sökningen.` : `${matches.length} projekt`}
      </p>
    </div>}
    {selected && open && <p className="mt-1 break-words text-sm text-graphite-600">Valt: {label(selected)}. Välj en träff för att byta.</p>}
    {!required && !value && <p className="mt-1 text-sm text-graphite-600">Inget projekt valt.</p>}
  </div>;
}
