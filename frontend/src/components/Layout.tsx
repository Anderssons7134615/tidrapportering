import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Home, Clock, Calendar, CheckSquare, Users, Building2, FolderKanban, Tags,
  Package, FileBarChart, Settings, LogOut, Menu, X, WifiOff, Wifi, ShieldCheck, type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useOfflineStore } from '../stores/offlineStore';
import { useSync } from '../hooks/useSync';
import { authApi } from '../services/api';

type Role = 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE' | 'ACCOUNTANT';
type NavigationGroup = 'time' | 'management' | 'register' | 'system';
type NavigationItem = {
  to: string;
  icon: LucideIcon;
  label: string;
  roles: Role[];
  group: NavigationGroup;
};

const navItems: NavigationItem[] = [
  { to: '/', icon: Home, label: 'Översikt', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'], group: 'time' },
  { to: '/time-entry', icon: Clock, label: 'Rapportera', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'], group: 'time' },
  { to: '/week', icon: Calendar, label: 'Min vecka', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'], group: 'time' },
  { to: '/team-week', icon: Users, label: 'Teamvecka', roles: ['ADMIN', 'SUPERVISOR'], group: 'management' },
  { to: '/approval', icon: CheckSquare, label: 'Attestera', roles: ['ADMIN', 'SUPERVISOR'], group: 'management' },
  { to: '/projects', icon: FolderKanban, label: 'Projekt', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'], group: 'management' },
  { to: '/reports', icon: FileBarChart, label: 'Rapporter', roles: ['ADMIN', 'SUPERVISOR', 'ACCOUNTANT'], group: 'management' },
  { to: '/customers', icon: Building2, label: 'Kunder', roles: ['ADMIN', 'SUPERVISOR'], group: 'register' },
  { to: '/materials', icon: Package, label: 'Material', roles: ['ADMIN', 'SUPERVISOR'], group: 'register' },
  { to: '/activities', icon: Tags, label: 'Aktiviteter', roles: ['ADMIN'], group: 'register' },
  { to: '/users', icon: Users, label: 'Användare', roles: ['ADMIN'], group: 'register' },
  { to: '/settings', icon: Settings, label: 'Inställningar', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'ACCOUNTANT'], group: 'system' },
];

const groupLabels: Record<NavigationGroup, string> = {
  time: 'Min tid',
  management: 'Ledning',
  register: 'Register',
  system: 'System',
};

const mobileTabsByRole: Record<Role, NavigationItem['to'][]> = {
  EMPLOYEE: ['/', '/week', '/time-entry', '/projects', '/settings'],
  SUPERVISOR: ['/', '/team-week', '/time-entry', '/approval', '/projects'],
  ADMIN: ['/', '/team-week', '/time-entry', '/approval', '/projects'],
  ACCOUNTANT: ['/reports', '/settings'],
};

const roleLabel: Record<Role, string> = {
  ADMIN: 'Administration',
  SUPERVISOR: 'Arbetsledare',
  ACCOUNTANT: 'Lön och ekonomi',
  EMPLOYEE: 'Medarbetare',
};

export default function Layout() {
  useSync();

  const { token, user, setUser, logout } = useAuthStore();
  const { isOnline, pendingEntries } = useOfflineStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: currentUser } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    enabled: Boolean(token),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (currentUser) setUser(currentUser);
  }, [currentUser, setUser]);

  const role = user?.role as Role | undefined;
  const filteredNavItems = navItems.filter((item) => role && item.roles.includes(role));
  const filteredBottomTabs = role
    ? mobileTabsByRole[role].map((path) => filteredNavItems.find((item) => item.to === path)).filter((item): item is NavigationItem => Boolean(item))
    : [];
  const activeItem = filteredNavItems.find((item) => item.to !== '/' && location.pathname.startsWith(item.to))
    || filteredNavItems.find((item) => location.pathname === item.to);
  const pendingEntryCount = pendingEntries.filter((entry) => entry.ownerUserId === user?.id).length;

  const handleLogout = () => {
    queryClient.clear();
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#eef2f1] text-graphite-900">
      <header className="safe-top sticky top-0 z-50 border-b border-graphite-200 bg-[#f8faf9] lg:hidden">
        <div className="mx-auto flex h-16 max-w-[96rem] items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setMenuOpen(!menuOpen)} className="icon-button" aria-label="Meny" aria-expanded={menuOpen}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <BrandMark compact />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-base font-semibold text-graphite-950">TidApp</h1>
                {activeItem && <span className="chip hidden sm:inline-flex">{activeItem.label}</span>}
              </div>
              {user?.companyName && <p className="truncate text-xs text-graphite-500">{user.companyName}</p>}
            </div>
          </div>
          <TopStatus isOnline={isOnline} pendingEntries={pendingEntryCount} userName={user?.name} onLogout={handleLogout} />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[96rem]">
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-white/10 bg-graphite-950 text-white lg:flex">
          <SidebarIdentity companyName={user?.companyName} role={role} />
          <SidebarNavigation items={filteredNavItems} />
          <SidebarFooter isOnline={isOnline} pendingEntryCount={pendingEntryCount} onLogout={handleLogout} />
        </aside>

        {menuOpen && <div className="fixed inset-0 z-40 bg-graphite-950/35 lg:hidden" onClick={() => setMenuOpen(false)} />}

        <aside className={`fixed left-0 top-0 z-50 flex h-full w-72 flex-col border-r border-white/10 bg-graphite-950 text-white shadow-md transition-transform duration-200 lg:hidden ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <BrandMark compact onDark />
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">TidApp</p>
                <p className="truncate text-xs text-white/50">{user?.companyName || 'Navigation'}</p>
              </div>
            </div>
            <button onClick={() => setMenuOpen(false)} className="icon-button-dark" aria-label="Stäng meny"><X size={20} /></button>
          </div>
          <SidebarNavigation items={filteredNavItems} onClick={() => setMenuOpen(false)} />
          <SidebarFooter isOnline={isOnline} pendingEntryCount={pendingEntryCount} onLogout={handleLogout} />
        </aside>

        <main className="min-w-0 w-full flex-1 px-4 pb-32 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10 lg:pt-7">
          <div className="mx-auto min-w-0 w-full max-w-7xl"><Outlet /></div>
        </main>
      </div>

      {filteredBottomTabs.length > 0 && (
        <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-graphite-200 bg-[#f8faf9] text-graphite-600 shadow-sm lg:hidden">
          <div className={`mx-auto grid items-center gap-1 px-2 py-2 ${filteredBottomTabs.length <= 2 ? 'max-w-[14rem] grid-cols-2' : 'max-w-md grid-cols-5'}`}>
            {filteredBottomTabs.map((item) => <MobileNavLink key={item.to} item={item} />)}
          </div>
        </nav>
      )}
    </div>
  );
}

function SidebarIdentity({ companyName, role }: { companyName?: string; role?: Role }) {
  return (
    <div className="border-b border-white/10 px-5 py-5">
      <div className="flex items-center gap-3">
        <BrandMark onDark />
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">TidApp</p><p className="truncate text-xs text-white/50">Tid, vecka och attest</p></div>
      </div>
      <div className="mt-5 flex items-start gap-3 border-t border-white/10 pt-4">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-300" />
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{companyName || 'TidApp'}</p><p className="mt-0.5 text-xs text-white/50">{role ? roleLabel[role] : 'Medarbetare'}</p></div>
      </div>
    </div>
  );
}

function SidebarNavigation({ items, onClick }: { items: NavigationItem[]; onClick?: () => void }) {
  return (
    <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Huvudnavigation">
      {(Object.keys(groupLabels) as NavigationGroup[]).map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        if (!groupItems.length) return null;
        return <div key={group} className="mb-5 last:mb-0"><p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-normal text-white/40">{groupLabels[group]}</p><div className="space-y-1">{groupItems.map((item) => <SideNavLink key={item.to} item={item} onClick={onClick} />)}</div></div>;
      })}
    </nav>
  );
}

function SidebarFooter({ isOnline, pendingEntryCount, onLogout }: { isOnline: boolean; pendingEntryCount: number; onLogout: () => void }) {
  return <div className="border-t border-white/10 p-3"><div className="mb-2 flex items-center justify-between rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white/70"><span className="inline-flex items-center gap-2">{isOnline ? <Wifi className="h-3.5 w-3.5 text-emerald-400" /> : <WifiOff className="h-3.5 w-3.5 text-amber-300" />}{isOnline ? 'Online' : 'Offline'}</span>{pendingEntryCount > 0 && <span className="text-amber-200">{pendingEntryCount} väntar</span>}</div><button onClick={onLogout} className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-white/60 transition hover:bg-rose-500/10 hover:text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"><LogOut size={18} /><span>Logga ut</span></button></div>;
}

function SideNavLink({ item, onClick }: { item: NavigationItem; onClick?: () => void }) {
  return <NavLink to={item.to} end={item.to === '/'} onClick={onClick} className={({ isActive }) => `group flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${isActive ? 'bg-white/[0.12] text-white ring-1 ring-inset ring-primary-300/50' : 'text-white/60 hover:bg-white/[0.07] hover:text-white'}`}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/[0.07] text-current ring-1 ring-white/10 transition group-hover:bg-white/[0.11]"><item.icon size={17} /></span><span>{item.label}</span></NavLink>;
}

function MobileNavLink({ item }: { item: NavigationItem }) {
  const primary = item.to === '/time-entry';
  return <NavLink to={item.to} end={item.to === '/'} className={({ isActive }) => primary ? `flex min-h-[58px] flex-col items-center justify-center rounded-md px-2 py-2 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 ${isActive ? 'bg-primary-800 text-white' : 'bg-primary-700 text-white hover:bg-primary-800'}` : `flex min-h-[56px] flex-col items-center justify-center rounded-md px-1.5 py-2 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 ${isActive ? 'bg-primary-50 text-primary-800' : 'text-graphite-500 hover:bg-graphite-50 hover:text-graphite-950'}`}><item.icon size={primary ? 22 : 20} /><span className="mt-0.5">{item.label}</span></NavLink>;
}

function BrandMark({ compact = false, onDark = false }: { compact?: boolean; onDark?: boolean }) {
  return <div className={`brand-mark flex h-10 shrink-0 items-center justify-center ${onDark ? compact ? 'w-24 px-0 text-white' : 'w-28 px-0 text-white' : `rounded-md border border-graphite-200 bg-white px-2 ${compact ? 'w-24' : 'w-28'}`}`}><img src="/anderssons-logo.svg" alt="Anderssons Isolering" className={`h-7 w-full object-contain ${onDark ? 'brightness-0 invert' : ''}`} /></div>;
}

function TopStatus({ isOnline, pendingEntries, userName, onLogout }: { isOnline: boolean; pendingEntries: number; userName?: string; onLogout: () => void }) {
  return <div className="top-status flex items-center gap-2 sm:gap-3"><div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${isOnline ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}<span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>{pendingEntries > 0 && <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">{pendingEntries}</span>}</div><span className="hidden max-w-32 truncate text-sm font-medium text-graphite-700 sm:block">{userName}</span><button onClick={onLogout} className="icon-button" title="Logga ut" aria-label="Logga ut"><LogOut size={18} /></button></div>;
}
