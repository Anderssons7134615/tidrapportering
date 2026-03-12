import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useOfflineStore } from '../stores/offlineStore';
import {
  Home,
  Clock,
  Calendar,
  CheckSquare,
  Users,
  Building2,
  FolderKanban,
  Tags,
  FileBarChart,
  Settings,
  LogOut,
  Menu,
  X,
  WifiOff,
  Wifi,
  Wrench,
  BarChart2,
} from 'lucide-react';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const navItems = [
  { to: '/', icon: Home, label: 'Översikt', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] },
  { to: '/time-entry', icon: Clock, label: 'Rapportera', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] },
  { to: '/week', icon: Calendar, label: 'Min vecka', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] },
  { to: '/team-week', icon: Users, label: 'Teamvecka', roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/approval', icon: CheckSquare, label: 'Attestera', roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/customers', icon: Building2, label: 'Kunder', roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/projects', icon: FolderKanban, label: 'Projekt', roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/productivity', icon: BarChart2, label: 'Produktivitet', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] },
  { to: '/activities', icon: Tags, label: 'Aktiviteter', roles: ['ADMIN'] },
  { to: '/work-items', icon: Wrench, label: 'Arbetsmoment', roles: ['ADMIN'] },
  { to: '/users', icon: Users, label: 'Användare', roles: ['ADMIN'] },
  { to: '/reports', icon: FileBarChart, label: 'Rapporter', roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/settings', icon: Settings, label: 'Inställningar', roles: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] },
];

const bottomTabs = [
  { to: '/', icon: Home, label: 'Hem' },
  { to: '/time-entry', icon: Clock, label: 'Rapportera' },
  { to: '/week', icon: Calendar, label: 'Vecka' },
  { to: '/settings', icon: Settings, label: 'Mer' },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const { isOnline, pendingEntries } = useOfflineStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const filteredNavItems = navItems.filter((item) => item.roles.includes(user?.role || ''));
  const activeItem =
    filteredNavItems.find((item) => location.pathname === item.to) ||
    filteredNavItems.find((item) => item.to !== '/' && location.pathname.startsWith(item.to));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="safe-top sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:h-[4.5rem] lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-50 lg:hidden"
              aria-label="Meny"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-slate-900 sm:text-lg">TidApp</h1>
                {activeItem && <span className="chip hidden sm:inline-flex">{activeItem.label}</span>}
              </div>
              {user?.companyName && <p className="text-xs text-slate-500">{user.companyName}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${
                isOnline
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
              }`}
            >
              {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
              {pendingEntries.length > 0 && (
                <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
                  {pendingEntries.length}
                </span>
              )}
            </div>
            <span className="hidden text-sm text-slate-700 sm:block">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
              title="Logga ut"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl">
        <aside className="sticky top-[4.5rem] hidden h-[calc(100vh-4.5rem)] w-72 border-r border-slate-200/80 bg-slate-50/65 px-4 py-5 lg:block">
          <div className="mb-4 rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{user?.companyName || 'TidApp'}</p>
            <p className="mt-1 text-sm text-slate-500">
              {user?.role === 'ADMIN' ? 'Adminöversikt' : user?.role === 'SUPERVISOR' ? 'Arbetsledare' : 'Medarbetare'}
            </p>
          </div>
          <nav className="space-y-1.5">
            {filteredNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${
                    isActive
                      ? 'bg-white text-primary-700 shadow-sm ring-1 ring-primary-200/70'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900'
                  }`
                }
              >
                <item.icon size={18} className="text-slate-500 transition group-hover:text-slate-700" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-slate-900/45 lg:hidden"
              onClick={() => setMenuOpen(false)}
            />
          )}
        </AnimatePresence>

        <aside
          className={`fixed left-0 top-0 z-50 h-full w-72 border-r border-slate-200 bg-white p-4 transition-transform duration-200 lg:hidden ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <p className="font-semibold text-slate-900">TidApp</p>
              <p className="text-xs text-slate-500">{user?.companyName || 'Navigation'}</p>
            </div>
            <button onClick={() => setMenuOpen(false)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
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
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-100' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
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
            className="mt-5 flex w-full items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-100"
          >
            <LogOut size={18} />
            <span>Logga ut</span>
          </button>
        </aside>

        <main className="w-full flex-1 px-4 pb-24 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="mx-auto w-full max-w-5xl"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
          {bottomTabs.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex min-w-[72px] flex-col items-center rounded-2xl px-2 py-2 text-[11px] font-medium transition ${
                  isActive ? 'bg-primary-50 text-primary-700 shadow-sm' : 'text-slate-500'
                }`
              }
            >
              <item.icon size={19} />
              <span className="mt-0.5">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
