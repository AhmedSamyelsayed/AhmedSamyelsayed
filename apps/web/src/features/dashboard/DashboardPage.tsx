import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCompany } from '@/features/company/CompanyProvider';

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { active, permissions } = useCompany();
  if (!active) return null;
  const name =
    i18n.resolvedLanguage === 'ar' && active.company.name_ar
      ? active.company.name_ar
      : active.company.name_en;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('dashboard.welcome', { company: name })}</h1>
      <p className="text-muted-foreground">{t('dashboard.comingSoon')}</p>
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
