import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Home,
  Clock,
  Calendar,
  CheckSquare,
  Users,
  Building2,
  FolderKanban,
  Tags,
  Package,
  FileBarChart,
  Settings,
  LogOut,
  Menu,
  X,
  WifiOff,
  Wifi,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useOfflineStore } from '../stores/offlineStore';
import { useSync } from '../hooks/useSync';
import { authApi } from '../services/api';

const navItems = [
  { to: '/', icon: Home, label: 'Översikt', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] },
  { to: '/time-entry', icon: Clock, label: 'Rapportera', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] },
  { to: '/week', icon: Calendar, label: 'Min vecka', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] },
  { to: '/team-week', icon: Users, label: 'Teamvecka', roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/approval', icon: CheckSquare, label: 'Attestera', roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/customers', icon: Building2, label: 'Kunder', roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/reports', icon: FileBarChart, label: 'Rapporter', roles: ['ADMIN', 'SUPERVISOR', 'ACCOUNTANT'] },
  { to: '/projects', icon: FolderKanban, label: 'Projekt', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] },
  { to: '/materials', icon: Package, label: 'Material', roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/activities', icon: Tags, label: 'Aktiviteter', roles: ['ADMIN'] },
  { to: '/users', icon: Users, label: 'Användare', roles: ['ADMIN'] },
  { to: '/settings', icon: Settings, label: 'Inställningar', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'ACCOUNTANT'] },
];

const bottomTabs = [
  { to: '/', icon: Home, label: 'Hem', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] },
  { to: '/week', icon: Calendar, label: 'Vecka', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] },
  { to: '/time-entry', icon: Clock, label: 'Rapportera', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'], primary: true },
  { to: '/approval', icon: CheckSquare, label: 'Attest', roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/projects', icon: FolderKanban, label: 'Projekt', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] },
  { to: '/reports', icon: FileBarChart, label: 'Rapporter', roles: ['ACCOUNTANT'] },
];

const roleLabel: Record<string, string> = {
  ADMIN: 'Adminöversikt',
  SUPERVISOR: 'Arbetsledare',
  ACCOUNTANT: 'Revisor',
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

  const filteredNavItems = navItems.filter((item) => item.roles.includes(user?.role || ''));
  const filteredBottomTabs = bottomTabs.filter((item) => item.roles.includes(user?.role || ''));
  const activeItem =
    filteredNavItems.find((item) => location.pathname === item.to) ||
    filteredNavItems.find((item) => item.to !== '/' && location.pathname.startsWith(item.to));
  const pendingEntryCount = pendingEntries.filter((entry) => entry.ownerUserId === user?.id).length;

  const handleLogout = () => {
    queryClient.clear();
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#eef2f1] text-graphite-900">
      <header className="safe-top sticky top-0 z-50 border-b border-graphite-200 bg-[#f8faf9]/95 shadow-sm backdrop-blur lg:hidden">
        <div className="mx-auto flex h-16 max-w-[96rem] items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded-md border border-graphite-200 bg-white p-2 text-graphite-700 transition hover:bg-primary-50 hover:text-primary-800"
              aria-label="Meny"
            >
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
          <div className="border-b border-white/10 px-5 py-5">
            <div className="flex items-center gap-3">
              <BrandMark onDark />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">TidApp</p>
                <p className="truncate text-xs text-white/50">Tid, vecka och attest</p>
              </div>
            </div>

            <div className="mt-5 flex items-start gap-3 border-t border-white/10 pt-4">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-300" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{user?.companyName || 'TidApp'}</p>
                <p className="mt-0.5 text-xs text-white/50">{roleLabel[user?.role || ''] || 'Medarbetare'}</p>
              </div>
            </div>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-normal text-white/40">Arbete</p>
            <div className="space-y-1">
              {filteredNavItems.map((item) => (
                <SideNavLink key={item.to} item={item} />
              ))}
            </div>
          </nav>

          <div className="border-t border-white/10 p-3">
            <div className="mb-2 flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white/70">
              <span className="inline-flex items-center gap-2">
                {isOnline ? <Wifi className="h-3.5 w-3.5 text-emerald-600" /> : <WifiOff className="h-3.5 w-3.5 text-amber-600" />}
                {isOnline ? 'Online' : 'Offline'}
              </span>
              {pendingEntryCount > 0 && <span className="text-amber-200">{pendingEntryCount} väntar</span>}
            </div>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-white/60 transition hover:bg-rose-500/10 hover:text-rose-100"
            >
              <LogOut size={18} />
              <span>Logga ut</span>
            </button>
          </div>
        </aside>

        {menuOpen && (
          <div
            className="fixed inset-0 z-40 bg-graphite-950/35 backdrop-blur-sm lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
        )}

        <aside
          className={`fixed left-0 top-0 z-50 h-full w-72 border-r border-white/10 bg-graphite-950 text-white shadow-md transition-transform duration-200 lg:hidden ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <BrandMark compact onDark />
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">TidApp</p>
                <p className="truncate text-xs text-white/50">{user?.companyName || 'Navigation'}</p>
              </div>
            </div>
            <button onClick={() => setMenuOpen(false)} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Stäng meny">
              <X size={20} />
            </button>
          </div>

          <nav className="space-y-1 px-3 py-4">
            {filteredNavItems.map((item) => (
              <SideNavLink key={item.to} item={item} onClick={() => setMenuOpen(false)} />
            ))}
          </nav>

          <button
            onClick={handleLogout}
            className="mx-3 mt-4 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-white/60 hover:bg-rose-500/10 hover:text-rose-100"
          >
            <LogOut size={18} />
            <span>Logga ut</span>
          </button>
        </aside>

        <main className="min-w-0 w-full flex-1 px-4 pb-32 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10 lg:pt-7">
          <div className="mx-auto min-w-0 w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-graphite-200 bg-[#f8faf9]/95 text-graphite-600 shadow-sm backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-center gap-1 px-2 py-2">
          {filteredBottomTabs.slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                item.primary
                  ? `flex min-h-[58px] flex-col items-center justify-center rounded-lg px-2 py-2 text-[11px] font-semibold transition ${
                      isActive
                        ? 'bg-primary-700 text-white shadow-none'
                        : 'bg-primary-700 text-white shadow-none'
                    }`
                  : `flex min-h-[56px] flex-col items-center justify-center rounded-lg px-1.5 py-2 text-[11px] font-semibold transition ${
                      isActive ? 'bg-primary-50 text-primary-800' : 'text-graphite-500 hover:bg-graphite-50 hover:text-graphite-950'
                    }`
              }
            >
              <item.icon size={item.primary ? 22 : 20} />
              <span className="mt-0.5">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function SideNavLink({
  item,
  onClick,
}: {
  item: (typeof navItems)[number];
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={item.to}
      onClick={onClick}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm font-semibold transition ${
          isActive
            ? 'border-primary-300 bg-primary-500/15 text-white'
            : 'border-transparent text-white/60 hover:bg-white/[0.07] hover:text-white'
        }`
      }
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/[0.07] text-current ring-1 ring-white/10 transition group-hover:bg-white/[0.11]">
        <item.icon size={17} />
      </span>
      <span>{item.label}</span>
    </NavLink>
  );
}

function BrandMark({ compact = false, onDark = false }: { compact?: boolean; onDark?: boolean }) {
  return (
    <div
      className={`flex h-10 shrink-0 items-center justify-center ${
        onDark
          ? compact ? 'w-24 px-0 text-white' : 'w-28 px-0 text-white'
          : `rounded-lg border border-graphite-200 bg-white px-2 ${compact ? 'w-24' : 'w-28'}`
      }`}
    >
      <img
        src="/anderssons-logo.svg"
        alt="Anderssons Isolering"
        className={`h-7 w-full object-contain ${onDark ? 'brightness-0 invert' : ''}`}
      />
    </div>
  );
}

function TopStatus({
  isOnline,
  pendingEntries,
  userName,
  onLogout,
}: {
  isOnline: boolean;
  pendingEntries: number;
  userName?: string;
  onLogout: () => void;
}) {
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div
        className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${
          isOnline
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-amber-200 bg-amber-50 text-amber-700'
        }`}
      >
        {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
        <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
        {pendingEntries > 0 && (
          <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
            {pendingEntries}
          </span>
        )}
      </div>
      <span className="hidden max-w-32 truncate text-sm font-medium text-graphite-700 sm:block">{userName}</span>
      <button
        onClick={onLogout}
        className="rounded-md border border-graphite-200 bg-white p-2 text-graphite-600 transition hover:bg-rose-50 hover:text-rose-700"
        title="Logga ut"
      >
        <LogOut size={18} />
      </button>
    </div>
  );
}
