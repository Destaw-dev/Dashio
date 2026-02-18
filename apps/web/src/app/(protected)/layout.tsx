'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { hasPermission } from '@/lib/permissions';

const navLinkBase = 'block rounded-lg px-4 py-3 text-sm font-medium transition-colors';

function NavLink({ href, children, admin, onClick }: { href: string; children: React.ReactNode; admin?: boolean; onClick?: () => void }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
  const className = active
    ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
    : admin
      ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/50'
      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100';
  return (
    <Link href={href} onClick={onClick} className={`${navLinkBase} ${className}`}>
      {children}
    </Link>
  );
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => setMobileMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <span className="text-sm text-slate-500 dark:text-slate-400">Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }
  const canViewCustomers = hasPermission(user, 'customers.read');
  const canViewAlerts = hasPermission(user, 'alerts.manage');
  const canViewAdmin =
    hasPermission(user, 'admin.users.read') ||
    hasPermission(user, 'admin.audit.read') ||
    hasPermission(user, 'reports.manage');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-1 min-w-0">
              <Link
                href="/dashboard"
                className="shrink-0 rounded-lg px-2 py-1.5 text-lg font-bold text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Dashio
              </Link>
              <nav className="ml-4 md:ml-6 hidden md:flex items-center gap-0.5">
                <NavLink href="/dashboard">Dashboard</NavLink>
                {canViewCustomers && <NavLink href="/customers">Customers</NavLink>}
                {canViewAlerts && <NavLink href="/alerts">Alerts</NavLink>}
                {canViewAdmin && (
                  <NavLink href="/admin/users" admin>Admin</NavLink>
                )}
              </nav>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={toggleTheme}
                className="rounded-lg p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
                title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
              >
                {theme === 'dark' ? <span className="text-sm">☀</span> : <span className="text-sm">☽</span>}
              </button>
              <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-slate-700" />
              <Link
                href="/settings"
                className="hidden sm:inline-flex rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors"
              >
                Profile
              </Link>
              <span className="hidden lg:block max-w-[140px] truncate rounded-lg px-3 py-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800">
                {user.email}
              </span>
              <button
                type="button"
                onClick={() => logout()}
                className="hidden sm:inline-flex rounded-lg px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30 transition-colors"
              >
                Logout
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen((o) => !o)}
                className="md:hidden -mr-2 rounded-lg p-3 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 touch-manipulation"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen &&
          typeof document !== 'undefined' &&
          createPortal(
            <>
              <div
                className="fixed inset-0 z-[100] bg-black/40 md:hidden"
                onClick={() => setMobileMenuOpen(false)}
                aria-hidden="true"
              />
              <div
                className="fixed inset-y-0 right-0 z-[101] w-full max-w-[min(100%,20rem)] bg-white dark:bg-slate-900 shadow-2xl md:hidden flex flex-col"
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
              >
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400 truncate">{user.email}</span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label="Close menu"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <nav className="flex-1 p-4 space-y-1 overflow-auto">
                <NavLink href="/dashboard" onClick={() => setMobileMenuOpen(false)}>Dashboard</NavLink>
                {canViewCustomers && (
                  <NavLink href="/customers" onClick={() => setMobileMenuOpen(false)}>Customers</NavLink>
                )}
                {canViewAlerts && (
                  <NavLink href="/alerts" onClick={() => setMobileMenuOpen(false)}>Alerts</NavLink>
                )}
                {canViewAdmin && (
                  <NavLink href="/admin/users" admin onClick={() => setMobileMenuOpen(false)}>Admin</NavLink>
                )}
                <NavLink href="/settings" onClick={() => setMobileMenuOpen(false)}>Profile</NavLink>
              </nav>
              <div className="p-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => { setMobileMenuOpen(false); logout(); }}
                  className="w-full rounded-lg px-4 py-3 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30 transition-colors text-left"
                >
                  Logout
                </button>
              </div>
            </div>
          </>,
            document.body
          )}
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
