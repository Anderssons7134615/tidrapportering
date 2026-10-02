import { Home, Clock, Calendar, CheckSquare, Users, Building2, FolderKanban, Tags, Package, FileBarChart, Settings, type LucideIcon } from 'lucide-react';

export type NavigationRole = 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE' | 'ACCOUNTANT';
export type NavigationGroup = 'projects' | 'time' | 'management' | 'register' | 'system';
export type NavigationItem = { to: string; icon: LucideIcon; label: string; roles: NavigationRole[]; group: NavigationGroup };

const items: NavigationItem[] = [
  { to: '/projects', icon: FolderKanban, label: 'Projekt', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'], group: 'projects' },
  { to: '/purchases', icon: Package, label: 'Inköp', roles: ['ADMIN', 'SUPERVISOR'], group: 'projects' },
  { to: '/project-economy', icon: FileBarChart, label: 'Ekonomi', roles: ['ADMIN', 'SUPERVISOR', 'ACCOUNTANT'], group: 'projects' },
  { to: '/', icon: Home, label: 'Översikt', roles: ['EMPLOYEE'], group: 'time' },
  { to: '/time-overview', icon: Home, label: 'Min tid', roles: ['ADMIN', 'SUPERVISOR'], group: 'time' },
  { to: '/time-entry', icon: Clock, label: 'Rapportera', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'], group: 'time' },
  { to: '/week', icon: Calendar, label: 'Min vecka', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'], group: 'time' },
  { to: '/team-week', icon: Users, label: 'Teamvecka', roles: ['ADMIN', 'SUPERVISOR'], group: 'management' },
  { to: '/approval', icon: CheckSquare, label: 'Attestera', roles: ['ADMIN', 'SUPERVISOR'], group: 'management' },
  { to: '/reports', icon: FileBarChart, label: 'Rapporter', roles: ['ADMIN', 'SUPERVISOR', 'ACCOUNTANT'], group: 'management' },
  { to: '/customers', icon: Building2, label: 'Kunder', roles: ['ADMIN', 'SUPERVISOR'], group: 'register' },
  { to: '/materials', icon: Package, label: 'Material', roles: ['ADMIN', 'SUPERVISOR'], group: 'register' },
  { to: '/activities', icon: Tags, label: 'Aktiviteter', roles: ['ADMIN'], group: 'register' },
  { to: '/users', icon: Users, label: 'Användare', roles: ['ADMIN'], group: 'register' },
  { to: '/settings', icon: Settings, label: 'Inställningar', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'ACCOUNTANT'], group: 'system' },
];

export const groupLabels: Record<NavigationGroup, string> = { projects: 'Projekt och inköp', time: 'Min tid', management: 'Tid och personal', register: 'Register', system: 'Inställningar' };
const mobilePaths: Record<NavigationRole, string[]> = {
  EMPLOYEE: ['/', '/week', '/time-entry', '/projects', '/settings'],
  SUPERVISOR: ['/projects', '/purchases', '/time-entry', '/approval', '/project-economy'],
  ADMIN: ['/projects', '/purchases', '/time-entry', '/approval', '/project-economy'],
  ACCOUNTANT: ['/reports', '/project-economy', '/settings'],
};
export const roleLabel: Record<NavigationRole, string> = { ADMIN: 'Administratör', SUPERVISOR: 'Arbetsledare', ACCOUNTANT: 'Lön och ekonomi', EMPLOYEE: 'Medarbetare' };

export function navigationFor(role?: NavigationRole) {
  const navigation = items.filter((item) => role && item.roles.includes(role));
  return { navigation, mobile: role ? (mobilePaths[role] ?? []).map((path) => navigation.find((item) => item.to === path)!).filter(Boolean) : [] };
}

export function activeNavigationPath(pathname: string, role?: NavigationRole) {
  const path = pathname.startsWith('/overview/details/') ? role === 'EMPLOYEE' ? '/' : '/time-overview' : pathname;
  return navigationFor(role).navigation.find((item) => path === item.to || (item.to !== '/' && path.startsWith(`${item.to}/`)))?.to;
}
