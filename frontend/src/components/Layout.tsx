import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronRight, LogOut, Menu, X, WifiOff, Wifi } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useOfflineStore } from '../stores/offlineStore';
import { useSync } from '../hooks/useSync';
import { authApi } from '../services/api';
import { getFocusTrapAction } from '../utils/frontendGuards';

import { activeNavigationPath, navigationFor, groupLabels, roleLabel, type NavigationItem, type NavigationGroup, type NavigationRole as Role } from '../utils/navigation';

export default function Layout() {
  useSync();

  const { token, user, setUser, logout } = useAuthStore();
  const { isOnline, pendingEntries, retryPendingEntries } = useOfflineStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const mobileHeaderRef = useRef<HTMLElement>(null);
  const syncWarningRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const mobileBottomNavRef = useRef<HTMLElement>(null);
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
  const { navigation: filteredNavItems, mobile: filteredBottomTabs } = navigationFor(role);
  const activePath = activeNavigationPath(location.pathname, role);
  const activeItem = filteredNavItems.find((item) => item.to === activePath);
  const pendingEntryCount = pendingEntries.filter((entry) => entry.ownerUserId === user?.id).length;
  const syncIssues = pendingEntries.filter((entry) => entry.ownerUserId === user?.id && entry.syncError);
  const legacySyncIssues = syncIssues.filter((entry) => entry.syncErrorCode === 'LEGACY_SYNC_REQUIRES_REVIEW');
  const retryableSyncIssues = syncIssues.filter((entry) => entry.syncErrorCode !== 'LEGACY_SYNC_REQUIRES_REVIEW');

  const downloadSavedOfflineEntries = () => {
    const blob = new Blob([JSON.stringify(legacySyncIssues, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sparade-offline-rader.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleLogout = () => {
    queryClient.clear();
    logout();
    navigate('/login');
  };

  useEffect(() => { setMenuOpen(false); }, [location.key]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    closeOnDesktop();
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    const menu = mobileMenuRef.current;
    if (!menu) return;
    const background = [mobileHeaderRef.current, syncWarningRef.current, mainContentRef.current, mobileBottomNavRef.current].filter(Boolean) as HTMLElement[];

    if (!menuOpen) {
      menu.setAttribute('inert', '');
      background.forEach((element) => element.removeAttribute('inert'));
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : menuButtonRef.current;
    menu.removeAttribute('inert');
    background.forEach((element) => element.setAttribute('inert', ''));

    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = () => Array.from(menu.querySelectorAll<HTMLElement>(focusableSelector));
    const focusFrame = window.requestAnimationFrame(() => focusableElements()[0]?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      const elements = focusableElements();
      const activeIndex = elements.indexOf(document.activeElement as HTMLElement);
      const action = getFocusTrapAction(event.key, event.shiftKey, activeIndex, elements.length);

      if (action === 'close') {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (action === 'focus-last') {
        event.preventDefault();
        elements[elements.length - 1]?.focus();
      } else if (action === 'focus-first') {
        event.preventDefault();
        elements[0]?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      background.forEach((element) => element.removeAttribute('inert'));
      document.body.style.overflow = previousOverflow;
      const focusTarget = window.matchMedia('(min-width: 1024px)').matches
        ? mainContentRef.current?.querySelector('main')
        : previousFocus;
      if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
    };
  }, [menuOpen]);

  return (
    <div className="min-h-[100dvh] text-graphite-900">
      <a href="#main-content" className="skip-link">Till innehållet</a>
      <header ref={mobileHeaderRef} className="mobile-header safe-top sticky top-0 z-50 border-b border-graphite-200/80 lg:hidden">
        <div className="flex min-h-16 items-center justify-between gap-2 px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <button ref={menuButtonRef} onClick={() => setMenuOpen(!menuOpen)} className="icon-button" aria-label="Meny" aria-expanded={menuOpen} aria-controls="mobile-navigation">
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <BrandMark compact />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-graphite-950">{user?.companyName || 'Anderssons Isolering'}</p>
              {activeItem && <p className="truncate text-xs text-graphite-500">{activeItem.label}</p>}
            </div>
          </div>
          <TopStatus isOnline={isOnline} pendingEntries={pendingEntryCount} userName={user?.name} onLogout={handleLogout} />
        </div>
      </header>

      {syncIssues.length > 0 && (
        <div ref={syncWarningRef} className="border-b border-amber-200 bg-amber-50 px-4 py-3" role="alert">
          <div className="mx-auto flex max-w-[96rem] flex-col gap-2 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
            <p>
              <span className="font-semibold">{syncIssues.length} offline-rad(er) kräver åtgärd.</span>{' '}
              {legacySyncIssues.length > 0
                ? 'Äldre sparade rader synkas inte automatiskt. Hämta dem först och jämför sedan med rapporterad tid, så att inget dubbleras.'
                : syncIssues[0]?.syncError}
            </p>
            <div className="flex flex-wrap gap-2">
              {legacySyncIssues.length > 0 && (
                <button type="button" className="btn-secondary shrink-0" onClick={downloadSavedOfflineEntries}>
                  Hämta sparade rader
                </button>
              )}
              {retryableSyncIssues.length > 0 && (
                <button type="button" className="btn-secondary shrink-0" onClick={() => retryPendingEntries(retryableSyncIssues.map((entry) => entry.localId))}>
                  Försök synka igen
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="app-frame">
        <aside className="app-sidebar sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col lg:flex">
          <SidebarIdentity companyName={user?.companyName} role={role} />
          <SidebarNavigation activePath={activePath} items={filteredNavItems} />
          <SidebarFooter isOnline={isOnline} pendingEntryCount={pendingEntryCount} onLogout={handleLogout} />
        </aside>

        {menuOpen && <div aria-hidden="true" className="fixed inset-0 z-40 bg-graphite-950/35 lg:hidden" onClick={() => setMenuOpen(false)} />}

        <aside
          ref={mobileMenuRef}
          id="mobile-navigation"
          role="dialog"
          aria-modal="true"
          aria-label="Huvudmeny"
          aria-hidden={!menuOpen}
          className={`app-sidebar fixed left-0 top-0 z-50 flex h-[100dvh] w-[min(20rem,100%)] flex-col shadow-md transition-transform duration-200 motion-reduce:transition-none lg:hidden ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="flex items-center justify-between border-b border-graphite-200 px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <BrandMark compact />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-graphite-950 [overflow-wrap:anywhere]">{user?.companyName || 'Anderssons Isolering'}</p>
                <p className="mt-1 text-xs text-graphite-500">Navigation</p>
              </div>
            </div>
            <button onClick={() => setMenuOpen(false)} className="icon-button" aria-label="Stäng meny"><X size={20} /></button>
          </div>
          <SidebarNavigation activePath={activePath} items={filteredNavItems} onClick={() => setMenuOpen(false)} />
          <SidebarFooter isOnline={isOnline} pendingEntryCount={pendingEntryCount} onLogout={handleLogout} />
        </aside>

        <div ref={mainContentRef} className="min-w-0 flex-1">
          <header className="desktop-header">
            <div className="flex min-w-0 items-center gap-2 text-sm text-graphite-500" aria-label="Du är här">
              <span>{activeItem ? groupLabels[activeItem.group] : 'Anderssons Isolering'}</span>
              {activeItem && <><ChevronRight size={14} aria-hidden="true" /><span className="font-semibold text-graphite-900">{activeItem.label}</span></>}
            </div>
            <TopStatus isOnline={isOnline} pendingEntries={pendingEntryCount} userName={user?.name} onLogout={handleLogout} />
          </header>
          <main id="main-content" tabIndex={-1} className="app-main">
            <div className="route-stage"><Outlet /></div>
          </main>
        </div>
      </div>

      {filteredBottomTabs.length > 0 && (
        <nav aria-label="Snabbnavigation" ref={mobileBottomNavRef} className="mobile-bottom-nav safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-graphite-200 text-graphite-600 lg:hidden">
          <div className={`mobile-nav-items ${filteredBottomTabs.length === 3 ? 'mobile-nav-three' : ''}`}>
            {filteredBottomTabs.map((item) => <MobileNavLink key={item.to} item={item} active={item.to === activePath} />)}
          </div>
        </nav>
      )}
    </div>
  );
}

function SidebarIdentity({ companyName, role }: { companyName?: string; role?: Role }) {
  return <div className="sidebar-identity"><BrandMark /><div className="min-w-0"><p className="text-sm font-bold leading-5 text-graphite-950 [overflow-wrap:anywhere]">{companyName || 'Anderssons Isolering'}</p><p className="mt-1 text-xs text-graphite-500">{role ? roleLabel[role] : 'Medarbetare'}</p></div></div>;
}

function SidebarNavigation({ items, activePath, onClick }: { items: NavigationItem[]; activePath?: string; onClick?: () => void }) {
  return <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-5" aria-label="Huvudnavigation">
    {(Object.keys(groupLabels) as NavigationGroup[]).map((group) => {
      const groupItems = items.filter((item) => item.group === group);
      if (!groupItems.length) return null;
      return <div key={group} className="mb-5 last:mb-0">
        {group !== 'system' && <p className="mb-1 px-3 text-xs font-medium text-graphite-500">{groupLabels[group]}</p>}
        <div className="space-y-0.5">{groupItems.map((item) => <Link key={item.to} to={item.to} onClick={onClick} aria-current={item.to === activePath ? 'page' : undefined} className={`side-nav-link ${item.to === activePath ? 'side-nav-active' : ''}`}><item.icon size={18} strokeWidth={1.7} aria-hidden="true" /><span>{item.label}</span></Link>)}</div>
      </div>;
    })}
  </nav>;
}

function SidebarFooter({ isOnline, pendingEntryCount, onLogout }: { isOnline: boolean; pendingEntryCount: number; onLogout: () => void }) {
  return <div className="border-t border-graphite-200 p-3"><div className="mb-1 flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs text-graphite-600"><span className="inline-flex items-center gap-2">{isOnline ? <Wifi size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}{isOnline ? 'Ansluten' : 'Offline'}</span>{pendingEntryCount > 0 && <span className="text-amber-800">{pendingEntryCount} väntar</span>}</div><button onClick={onLogout} className="side-nav-link w-full hover:text-rose-700"><LogOut size={18} aria-hidden="true" /><span>Logga ut</span></button></div>;
}

function MobileNavLink({ item, active }: { item: NavigationItem; active: boolean }) {
  return <Link to={item.to} aria-current={active ? 'page' : undefined} className={`mobile-nav-link ${active ? 'mobile-nav-active' : ''}`}><item.icon size={21} strokeWidth={active ? 2 : 1.7} aria-hidden="true" /><span>{item.label}</span></Link>;
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return <div aria-hidden="true" className="brand-mark"><Building2 size={compact ? 19 : 22} strokeWidth={1.7} /></div>;
}

function TopStatus({ isOnline, pendingEntries, userName, onLogout }: { isOnline: boolean; pendingEntries: number; userName?: string; onLogout: () => void }) {
  return <div className="top-status flex shrink-0 items-center gap-2 sm:gap-4"><span className={`inline-flex items-center gap-1.5 text-xs font-medium ${isOnline ? 'text-graphite-500' : 'text-amber-800'}`} role="status" aria-label={`${isOnline ? 'Ansluten' : 'Offline'}${pendingEntries ? `, ${pendingEntries} rader väntar på synkning` : ''}`}>
    {isOnline ? <Wifi size={15} aria-hidden="true" /> : <WifiOff size={15} aria-hidden="true" />}<span className="hidden md:inline">{isOnline ? 'Ansluten' : 'Offline'}</span>{pendingEntries > 0 && <span className="font-semibold text-amber-800">{pendingEntries}</span>}
  </span><span className="hidden max-w-40 truncate text-sm font-medium text-graphite-800 lg:block">{userName}</span><button onClick={onLogout} className="icon-button" title="Logga ut" aria-label="Logga ut"><LogOut size={18} aria-hidden="true" /></button></div>;
}
