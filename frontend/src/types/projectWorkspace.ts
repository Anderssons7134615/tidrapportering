import type { Project, ProjectTask, ProjectUpdate } from './index';

export interface WorkspaceProject {
  id: string;
  code: string;
  name: string;
  site: string | null;
  status: Project['status'];
  active: boolean;
  notes: string | null;
  updatedAt: string;
  customer: { id: string; name: string } | null;
  employeeCanSeeResults: boolean;
  hours: { reported: number | null; approved: number | null };
  tasks: ProjectTask[];
  updates: ProjectUpdate[];
}
