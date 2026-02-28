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

  const filteredNavItems = navItems.filter((item) =>
    item.roles.includes(user?.role || '')
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white text-slate-900 sticky top-0 z-50 safe-top border-b border-slate-200 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 hover:bg-slate-100 rounded-lg lg:hidden"
            >
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <div>
              <h1 className="text-lg font-bold leading-tight text-primary-700">TidApp</h1>
              {user?.companyName && (
                <p className="text-xs text-slate-500 leading-tight">{user.companyName}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Offline-indikator */}
            <div className="flex items-center gap-1 text-sm">
              {isOnline ? (
                <Wifi size={16} className="text-emerald-600" />
              ) : (
                <>
                  <WifiOff size={16} className="text-amber-500" />
                  {pendingEntries.length > 0 && (
                    <span className="bg-yellow-500 text-xs px-1.5 py-0.5 rounded-full text-black">
                      {pendingEntries.length}
                    </span>
                  )}
                </>
              )}
            </div>
            <span className="text-sm hidden sm:block text-slate-700">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="p-1.5 hover:bg-slate-100 rounded-lg"
              title="Logga ut"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar - Desktop */}
        <aside className="hidden lg:block w-56 bg-white border-r border-slate-200 min-h-[calc(100vh-56px)] sticky top-14">
          <nav className="p-3 space-y-1">
            {filteredNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 border-l-2 transition-colors ${
                    isActive
                      ? 'border-primary-600 bg-primary-50 text-primary-800 font-semibold'
                      : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <item.icon size={20} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Mobile menu overlay */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 z-40 lg:hidden"
              onClick={() => setMenuOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Mobile sidebar */}
        <aside
          className={`fixed top-0 left-0 w-64 h-full bg-white z-50 transform transition-transform lg:hidden ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="p-4 bg-white border-b border-slate-200 text-slate-900 flex items-center justify-between">
            <span className="font-bold text-primary-700">TidApp</span>
            <button onClick={() => setMenuOpen(false)}>
              <X size={24} />
            </button>
          </div>
          <nav className="p-3 space-y-1">
            {filteredNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 border-l-2 transition-colors ${
                    isActive
                      ? 'border-primary-600 bg-primary-50 text-primary-800 font-semibold'
                      : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <item.icon size={20} />
                <span>{item.label}</span>
              </NavLink>
            ))}
            <hr className="my-3 border-slate-200" />
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 text-red-600 hover:bg-red-50 rounded-md w-full"
            >
              <LogOut size={20} />
              <span>Logga ut</span>
            </button>
          </nav>
        </aside>

        {/* Main content with page transitions */}
        <main className="flex-1 p-4 lg:p-6 max-w-5xl mx-auto w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 lg:hidden safe-bottom z-40 shadow-[0_-1px_8px_rgba(15,23,42,0.04)]">
        <div className="flex justify-around py-1 px-2">
          {bottomTabs.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center py-2 px-3 border-t-2 transition-colors ${
                  isActive ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500'
                }`
              }
            >
              <item.icon size={22} />
              <span className="text-xs mt-0.5">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Spacer for bottom nav on mobile */}
      <div className="h-16 lg:hidden" />
    </div>
  );
}
