import type { Permission } from '@figure/shared';
import { hasAll } from '@figure/shared';
import {
  BarChart3,
  ClipboardList,
  FileSearch,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Network,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCompany } from '@/features/company/CompanyProvider';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  ready?: boolean;
}

const NAV: NavItem[] = [
  { to: '/app/dashboard', label: 'nav.dashboard', icon: LayoutDashboard, ready: true },
  {
    to: '/app/timesheets',
    label: 'nav.timesheets',
    icon: ClipboardList,
    permission: 'timesheets.read',
  },
  { to: '/app/documents', label: 'nav.documents', icon: FileText, permission: 'documents.read' },
  { to: '/app/org', label: 'nav.org', icon: Network, permission: 'employees.read', ready: true },
  {
    to: '/app/job-analysis',
    label: 'nav.jobAnalysis',
    icon: FileSearch,
    permission: 'job_analysis.read',
    ready: true,
  },
  { to: '/app/training', label: 'nav.training', icon: GraduationCap, permission: 'training.read' },
  { to: '/app/audit', label: 'nav.audit', icon: ShieldCheck, permission: 'audit.read' },
  { to: '/app/reports', label: 'nav.reports', icon: BarChart3, permission: 'export.data' },
  {
    to: '/app/settings/users',
    label: 'nav.users',
    icon: Users,
    permission: 'users.manage',
    ready: true,
  },
  {
    to: '/app/settings/company',
    label: 'nav.settings',
    icon: Settings,
    permission: 'org.manage',
    ready: true,
  },
];

export function AppLayout() {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const { active, memberships, permissions, selectCompany } = useCompany();
  const items = NAV.filter((item) => !item.permission || hasAll(permissions, item.permission));
  const companyName =
    i18n.resolvedLanguage === 'ar' && active?.company.name_ar
      ? active.company.name_ar
      : active?.company.name_en;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-e bg-card p-4 md:flex">
        <div className="mb-6 text-lg font-bold text-primary">{t('app.name')}</div>
        {memberships.length > 1 ? (
          <select
            className="mb-4 rounded-md border bg-transparent p-2 text-sm"
            value={active?.company.id}
            onChange={(e) => selectCompany(e.target.value)}
          >
            {memberships.map((m) => (
              <option key={m.company.id} value={m.company.id} className="bg-card">
                {m.company.name_en}
              </option>
            ))}
          </select>
        ) : (
          <div className="mb-4 truncate text-sm text-muted-foreground">{companyName}</div>
        )}
        <NavLinks items={items} vertical />
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-2 border-b p-3">
          <span className="me-auto font-bold text-primary md:hidden">{t('app.name')}</span>
          <LanguageSwitcher />
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut className="size-4 rtl:rotate-180" aria-hidden />
            {t('common.signOut')}
          </Button>
        </header>
        <div className="overflow-x-auto border-b px-2 py-1 md:hidden">
          <NavLinks items={items} />
        </div>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavLinks({ items, vertical }: { items: NavItem[]; vertical?: boolean }) {
  const { t } = useTranslation();
  return (
    <nav className={cn('flex gap-1', vertical ? 'flex-col' : 'flex-row')}>
      {items.map(({ to, label, icon: Icon, ready }) => (
        <NavLink
          key={to}
          to={to}
          aria-disabled={!ready}
          title={ready ? undefined : t('nav.comingSoon')}
          onClick={(e) => !ready && e.preventDefault()}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-muted',
              isActive && 'bg-muted text-primary',
              !ready && 'cursor-not-allowed opacity-50',
            )
          }
        >
          <Icon className="size-4" aria-hidden />
          {t(label)}
        </NavLink>
      ))}
    </nav>
  );
}
