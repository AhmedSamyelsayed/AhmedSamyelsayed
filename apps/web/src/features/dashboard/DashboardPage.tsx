import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCompany } from '@/features/company/CompanyProvider';
import { useCan } from '@/features/company/useCan';
import { InvitationsList } from '@/features/invitations/InvitationsList';
import { resumeStep } from '@/features/onboarding/steps';
import { useDepartments, useEmployees, usePositions } from '@/features/org/api';
import { useLocalizedName } from '@/lib/useDate';

export function DashboardPage() {
  const { t } = useTranslation();
  const { active, permissions } = useCompany();
  const can = useCan();
  const name = useLocalizedName();
  if (!active) return null;
  const setupPending = active.company.onboarding_step !== 'done' && can('org.manage');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">
        {t('dashboard.welcome', { company: name(active.company.name_en, active.company.name_ar) })}
      </h1>
      <InvitationsList />
      {setupPending && (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle>{t('dashboard.finishSetup')}</CardTitle>
            <CardDescription>{t('dashboard.finishSetupBody')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to={`/onboarding/setup/${resumeStep(active.company.onboarding_step)}`}>
                {t('dashboard.continueSetup')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
      {can('employees.read') && <OrgSummary />}
      <p className="text-sm text-muted-foreground">{t('dashboard.comingSoon')}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>{t('dashboard.role')}</CardDescription>
            <CardTitle>{t(`roles.${active.role}`)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t('dashboard.permissions')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2" dir="ltr">
              {[...permissions].sort().map((p) => (
                <li key={p} className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                  {p}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Headcount tiles; counts respect RLS, so managers see their subtree only. */
function OrgSummary() {
  const { t } = useTranslation();
  const departments = useDepartments();
  const positions = usePositions();
  const employees = useEmployees();
  const tiles = [
    {
      label: t('org.employees'),
      value: employees.data?.filter((e) => e.status === 'active').length,
    },
    { label: t('org.tab.departments'), value: departments.data?.length },
    { label: t('org.tab.positions'), value: positions.data?.length },
  ];
  return (
    <div className="grid grid-cols-3 gap-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardHeader>
            <CardDescription>{tile.label}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{tile.value ?? '—'}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
