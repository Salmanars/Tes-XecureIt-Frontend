'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { clearSession, getSession } from '@/lib/api';
import { roleLabel } from '@/lib/labels';
import type { DocumentRole } from '@/types/document';

const WELCOME_NOTICE_KEY = 'xecureit-welcome-once';

interface NavbarProps {
  userName?: string;
  userEmail?: string;
  role?: DocumentRole;
  profileRole?: DocumentRole | null;
  view?: 'all' | 'documents' | 'members' | 'shared' | 'history' | 'revisions' | 'verify' | 'audit';
  pageTitle?: string;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

type SidebarIconName = 'dashboard' | 'document' | 'members' | 'invite' | 'history' | 'upload' | 'verify' | 'audit';
interface SidebarLink {
  href: string;
  label: string;
  icon: SidebarIconName;
  active: boolean;
}

function SidebarIcon({ name }: { name: SidebarIconName }) {
  const paths: Record<SidebarIconName, ReactNode> = {
    dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    document: <><path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5a1.5 1.5 0 0 1 1-1.5Z" /><path d="M14 3.5V8h4M9 12h6M9 16h6" /></>,
    members: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1a5.5 5.5 0 0 1 11 0v1" /><path d="M16 5.5a3 3 0 0 1 0 5.5M18 15a4.5 4.5 0 0 1 2.5 4v1" /></>,
    invite: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="m4.5 7 7.5 5.5L19.5 7M12 9v6M9 12h6" /></>,
    history: <><path d="M3.5 11a8.5 8.5 0 1 1 .8 4.5" /><path d="M3.5 5v6h6M12 7v5l3 2" /></>,
    upload: <><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" /><path d="M5 14.5v4A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-4" /></>,
    verify: <><path d="M12 3 5 6v5c0 4.7 2.8 8 7 10 4.2-2 7-5.3 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    audit: <><path d="M8 5h12M8 12h12M8 19h12" /><circle cx="4" cy="5" r=".7" fill="currentColor" /><circle cx="4" cy="12" r=".7" fill="currentColor" /><circle cx="4" cy="19" r=".7" fill="currentColor" /></>,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      {paths[name]}
    </svg>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white p-1.5 shadow-sm">
        <img src="/xecureit.png" alt="XecureIT" className="h-full w-full object-contain" />
      </span>
      <span>
        <span className="block text-base font-bold tracking-tight text-white">XecureIT</span>
        <span className="mt-0.5 block text-[10px] font-medium tracking-wide text-slate-400">Secure Doc &amp; Hash</span>
      </span>
    </Link>
  );
}

export function Navbar({
  userName,
  userEmail,
  role = 'viewer',
  profileRole = role,
  view,
  pageTitle,
  sidebarCollapsed,
  onToggleSidebar,
}: NavbarProps) {
  const router = useRouter();
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(userName || 'Pengguna');
  const [email, setEmail] = useState(userEmail || '');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileMenuPosition, setProfileMenuPosition] = useState<{ left: number; bottom: number } | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [welcomeName, setWelcomeName] = useState<string | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const updateViewport = () => {
      setIsMobileViewport(mediaQuery.matches);
      if (!mediaQuery.matches) setMobileSidebarOpen(false);
    };
    updateViewport();
    mediaQuery.addEventListener('change', updateViewport);
    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    const user = getSession()?.user;
    setName(userName || user?.name || 'Pengguna');
    setEmail(userEmail || user?.email || '');
  }, [userName, userEmail]);

  useEffect(() => {
    if (pageTitle || view !== 'all') return;
    const requestedView = new URLSearchParams(window.location.search).get('view');
    if (requestedView && requestedView !== 'all') return;

    const pendingName = window.sessionStorage.getItem(WELCOME_NOTICE_KEY);
    if (pendingName === null) return;

    window.sessionStorage.removeItem(WELCOME_NOTICE_KEY);
    setWelcomeName(pendingName);
    const timeout = window.setTimeout(() => setWelcomeName(null), 6500);
    return () => window.clearTimeout(timeout);
  }, [pageTitle, view]);

  useEffect(() => {
    if (!profileMenuOpen) return;

    function updateMenuPosition() {
      const anchor = profileMenuRef.current;
      if (!anchor) return;

      const bounds = anchor.getBoundingClientRect();
      const gutter = 16;
      const menuWidth = Math.min(208, window.innerWidth - gutter * 2);
      const preferredLeft = isMobileViewport ? bounds.right - menuWidth : bounds.right + 12;
      const left = Math.max(gutter, Math.min(preferredLeft, window.innerWidth - menuWidth - gutter));
      const bottom = Math.max(gutter, window.innerHeight - bounds.bottom);
      setProfileMenuPosition({ left, bottom });
    }

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isMobileViewport, profileMenuOpen]);

  useEffect(() => {
    if (!profileMenuOpen) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (event.target instanceof Node && !profileMenuRef.current?.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setProfileMenuOpen(false);
    }

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileMenuOpen]);

  function signOut() {
    clearSession();
    router.push('/login');
  }

  function toggleSidebar() {
    if (isMobileViewport) {
      setMobileSidebarOpen((open) => !open);
      return;
    }

    setMobileSidebarOpen(false);
    onToggleSidebar();
  }

  const workspaceLinks: SidebarLink[] = role === 'owner'
    ? [
        { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', active: view === 'all' },
        { href: '/dashboard?view=documents', label: 'Dokumen', icon: 'document', active: view === 'documents' },
        { href: '/dashboard?view=members', label: 'Anggota', icon: 'members', active: view === 'members' },
        { href: '/dashboard?view=shared', label: 'Undangan', icon: 'invite', active: view === 'shared' },
      ]
    : role === 'editor'
      ? [
          { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', active: view === 'all' },
          { href: '/dashboard?view=documents', label: 'Dokumen', icon: 'document', active: view === 'documents' },
          { href: '/dashboard?view=revisions', label: 'Revisi', icon: 'history', active: view === 'revisions' },
          { href: '/dashboard?view=shared', label: 'Undangan', icon: 'invite', active: view === 'shared' },
        ]
      : [
        { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', active: view === 'all' },
        { href: '/dashboard?view=documents', label: 'Dokumen', icon: 'document', active: view === 'documents' },
        { href: '/dashboard?view=history', label: 'Riwayat', icon: 'history', active: view === 'history' },
        ];
  const securityLinks: SidebarLink[] = [
    { href: '/dashboard?view=verify', label: 'Verifikasi SHA-256', icon: 'verify', active: view === 'verify' },
    ...(role === 'owner'
      ? [{ href: '/dashboard?view=audit', label: 'Audit Trail', icon: 'audit' as const, active: view === 'audit' }]
      : []),
  ];
  const activeTitle = pageTitle || (
    view === 'documents'
      ? role === 'owner' ? 'Semua Dokumen' : 'Dokumen'
      : view === 'members'
        ? 'Anggota & Role'
        : view === 'revisions'
          ? 'Riwayat Revisi'
          : view === 'history'
          ? 'Riwayat'
          : view === 'shared'
          ? role === 'owner' ? 'Undangan & Akses' : 'Undangan & Dokumen Dibagikan'
          : view === 'verify'
            ? 'Verifikasi SHA-256'
            : view === 'audit'
              ? role === 'owner' ? 'Audit Trail' : 'Dashboard'
              : view === 'all'
                ? 'Dashboard'
                : 'Detail Dokumen'
  );

  function renderLinks(items: SidebarLink[]) {
    return items.map((link) => (
      <a
        key={link.label}
        href={link.href}
        onClick={() => setMobileSidebarOpen(false)}
        className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
          link.active
            ? 'bg-blue-600 text-white'
            : 'text-slate-300 hover:bg-white/10 hover:text-white'
        }`}
      >
        <span className={`grid h-5 w-5 shrink-0 place-items-center ${link.active ? 'text-white' : 'text-slate-300'}`}>
          <SidebarIcon name={link.icon} />
        </span>
        {link.label}
      </a>
    ));
  }

  return (
    <>
      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Tutup navigasi"
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/55 md:hidden"
        />
      )}
      <aside id="xecureit-sidebar" className={`${mobileSidebarOpen ? 'fixed inset-y-0 left-0 flex' : 'hidden'} ${sidebarCollapsed ? 'md:hidden' : 'md:fixed md:inset-y-0 md:left-0 md:flex'} z-50 w-72 flex-col overflow-y-auto border-r border-white/5 bg-slate-950 px-4 py-5 text-white`}>
        <div className="shrink-0">
          <Brand />
        </div>

        <section className="mt-8 shrink-0">
          <h2 className="px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Workspace</h2>
          <nav aria-label="Ruang kerja" className="mt-3 space-y-1">
            {renderLinks(workspaceLinks)}
          </nav>
        </section>

        <section className="mt-6 shrink-0">
          <h2 className="px-2 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Security</h2>
          <nav aria-label="Keamanan dan audit" className="mt-3 space-y-1">
            {renderLinks(securityLinks)}
          </nav>
        </section>

        <div ref={profileMenuRef} className="relative mt-auto shrink-0 border-t border-white/10 pt-4">
          {profileMenuOpen && profileMenuPosition && (
            <div
              role="menu"
              aria-label="Menu akun"
              style={{ left: profileMenuPosition.left, bottom: profileMenuPosition.bottom }}
              className="fixed z-[60] max-h-[calc(100dvh-2rem)] w-[min(13rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl shadow-slate-950/20"
            >
              <Link
                href="/dashboard/settings"
                role="menuitem"
                onClick={() => setProfileMenuOpen(false)}
                className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-slate-50 hover:text-blue-700"
              >
                Pengaturan
              </Link>
              <div className="my-1 border-t border-slate-100" />
              <button
                type="button"
                role="menuitem"
                onClick={signOut}
                className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50"
              >
                Keluar / Logout
              </button>
            </div>
          )}
          <div className="flex items-center gap-2.5 pt-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-500/20 text-sm font-bold text-blue-200">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5" aria-label={profileRole ? `Role akun ${roleLabel(profileRole)}` : 'Role akun belum tersedia'}>
                <span className="max-w-full truncate text-xs font-semibold text-white">{name}</span>
                <span
                  title={profileRole ? roleLabel(profileRole) : 'Role belum tersedia dari sesi atau API'}
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${
                    profileRole === 'owner' ? 'bg-blue-900 text-blue-200'
                      : profileRole === 'editor' ? 'bg-emerald-900/70 text-emerald-200'
                        : profileRole === 'viewer' ? 'bg-violet-900/70 text-violet-200'
                          : 'bg-amber-500/20 text-amber-200'
                  }`}
                >
                  {profileRole?.toUpperCase() || 'ROLE?'}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-slate-300">{email || 'Akun aktif'}</span>
            </span>
            <button
              type="button"
              aria-label="Buka menu akun"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              onClick={() => setProfileMenuOpen((open) => !open)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-9">
        <button
          type="button"
          aria-label={
            isMobileViewport
              ? mobileSidebarOpen ? 'Tutup navigasi' : 'Buka navigasi'
              : sidebarCollapsed ? 'Buka sidebar' : 'Tutup sidebar'
          }
          aria-controls="xecureit-sidebar"
          aria-expanded={isMobileViewport ? mobileSidebarOpen : !sidebarCollapsed}
          onClick={toggleSidebar}
          className="mr-3 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex items-center gap-2 text-xs">
            <li className="font-semibold text-blue-700">XecureIT</li>
            <li aria-hidden="true" className="text-slate-300">/</li>
            <li className="text-slate-500">Ruang kerja</li>
            <li aria-hidden="true" className="text-slate-300">/</li>
            <li aria-current="page" className="truncate font-semibold text-slate-800">{activeTitle}</li>
          </ol>
        </nav>
      </header>
      {welcomeName !== null && (
        <div role="status" aria-live="polite" className="fixed right-4 top-[4.5rem] z-[60] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg shadow-slate-900/10 sm:right-6 md:right-8">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700" aria-hidden="true">✓</span>
          <span className="flex-1 font-medium">
            {welcomeName ? `Selamat datang kembali, ${welcomeName}!` : 'Selamat datang di XecureIT!'}
          </span>
          <button
            type="button"
            aria-label="Tutup notifikasi"
            onClick={() => setWelcomeName(null)}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
