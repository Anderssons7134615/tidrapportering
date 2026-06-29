import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
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

  const { user, logout } = useAuthStore();
  const { isOnline, pendingEntries } = useOfflineStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const filteredNavItems = navItems.filter((item) => item.roles.includes(user?.role || ''));
  const filteredBottomTabs = bottomTabs.filter((item) => item.roles.includes(user?.role || ''));
  const activeItem =
    filteredNavItems.find((item) => location.pathname === item.to) ||
    filteredNavItems.find((item) => item.to !== '/' && location.pathname.startsWith(item.to));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen text-graphite-900">
      <header className="safe-top sticky top-0 z-50 border-b border-white/70 bg-white/90 shadow-sm ring-1 ring-graphite-200/40 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded-md border border-graphite-200 bg-white p-2 text-graphite-700 transition hover:bg-primary-50 hover:text-primary-800"
              aria-label="Meny"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <BrandMark compact />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-graphite-950 sm:text-lg">Anderssons TidApp</h1>
                {activeItem && <span className="chip hidden sm:inline-flex">{activeItem.label}</span>}
              </div>
              {user?.companyName && <p className="text-xs text-graphite-500">{user.companyName}</p>}
            </div>
          </div>

          <TopStatus isOnline={isOnline} pendingEntries={pendingEntries.length} userName={user?.name} onLogout={handleLogout} />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[96rem]">
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-white/10 bg-[#08090a] px-4 py-5 text-white shadow-premium ring-1 ring-white/5 lg:block">
          <div className="mb-5 flex items-center gap-3 px-1">
            <BrandMark />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">Anderssons TidApp</p>
              <p className="truncate text-xs text-graphite-300">Tid · Vecka · Attest</p>
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.06] p-4 shadow-sm ring-1 ring-primary-300/10">
            <div className="flex items-center gap-2 text-primary-300">
              <ShieldCheck className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-wide">Företag</p>
            </div>
            <p className="mt-2 truncate text-lg font-semibold text-white">{user?.companyName || 'TidApp'}</p>
            <p className="mt-1 text-sm text-graphite-300">{roleLabel[user?.role || ''] || 'Medarbetare'}</p>
          </div>

          <nav className="space-y-1.5">
            {filteredNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 overflow-hidden rounded-md px-3 py-2.5 text-sm font-semibold transition duration-200 ${
                    isActive
                      ? 'active bg-primary-500 text-white shadow-lg shadow-primary-950/35 ring-1 ring-primary-300/35'
                      : 'text-graphite-300 hover:bg-white/[0.08] hover:text-white'
                  }`
                }
              >
                <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-white opacity-0 transition group-[.active]:opacity-100" />
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/[0.08] transition group-hover:bg-white/[0.12] group-[.active]:bg-white/18">
                  <item.icon size={17} />
                </span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        {menuOpen && (
          <div
            className="fixed inset-0 z-40 bg-graphite-950/65 backdrop-blur-sm lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
        )}

        <aside
          className={`fixed left-0 top-0 z-50 h-full w-72 border-r border-white/10 bg-[#08090a] p-4 text-white shadow-premium transition-transform duration-200 lg:hidden ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-3">
              <BrandMark compact />
              <div>
                <p className="font-semibold text-white">TidApp</p>
                <p className="text-xs text-graphite-300">{user?.companyName || 'Navigation'}</p>
              </div>
            </div>
            <button onClick={() => setMenuOpen(false)} className="rounded-lg p-1.5 text-graphite-300 hover:bg-white/10 hover:text-white">
              <X size={20} />
            </button>
          </div>

          <nav className="space-y-1.5">
            {filteredNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                    isActive ? 'bg-primary-500 text-white' : 'text-graphite-300 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <button
            onClick={handleLogout}
            className="mt-5 flex w-full items-center gap-3 rounded-lg border border-rose-300/20 bg-rose-500/10 px-3 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-500/20"
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

      <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#08090a]/96 text-white shadow-premium ring-1 ring-white/10 backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-end gap-1 px-2 pb-2 pt-2">
          {filteredBottomTabs.slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                item.primary
                  ? `-mt-7 flex min-h-[70px] flex-col items-center justify-center rounded-2xl px-2 py-3 text-[11px] font-black transition ${
                      isActive
                        ? 'bg-primary-500 text-white shadow-lg shadow-primary-950/40'
                        : 'bg-primary-500 text-white shadow-lg shadow-primary-950/35'
                    }`
                  : `flex min-h-[56px] flex-col items-center justify-center rounded-xl px-1.5 py-2 text-[11px] font-semibold transition ${
                      isActive ? 'bg-white/12 text-white shadow-sm' : 'text-graphite-300 hover:bg-white/8 hover:text-white'
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

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex h-11 shrink-0 items-center justify-center rounded-xl bg-white px-2.5 shadow-lg shadow-primary-950/35 ring-1 ring-primary-300/35 ${
        compact ? 'w-24' : 'w-32'
      }`}
    >
      <img src="/anderssons-logo.svg" alt="Anderssons Isolering" className="h-8 w-full object-contain" />
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
      <span className="hidden text-sm font-medium text-graphite-700 sm:block">{userName}</span>
      <button
        onClick={onLogout}
        className="rounded-lg border border-graphite-200 bg-white p-2 text-graphite-600 transition hover:bg-primary-50 hover:text-primary-800"
        title="Logga ut"
      >
        <LogOut size={18} />
      </button>
    </div>
  );
}
