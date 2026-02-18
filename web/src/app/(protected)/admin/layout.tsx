'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { hasPermission } from '@/lib/permissions';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const base = '/admin';
  const { user } = useAuth();
  const tabs = [
    { href: `${base}/users`, label: 'Users', visible: hasPermission(user, 'admin.users.read') },
    { href: `${base}/audit`, label: 'Audit log', visible: hasPermission(user, 'admin.audit.read') },
    { href: `${base}/reports`, label: 'Reports', visible: hasPermission(user, 'reports.manage') },
  ].filter((tab) => tab.visible);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Admin</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Users, audit and scheduled reports</p>
        </div>
        <nav className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 shadow-card">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                pathname === tab.href
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
