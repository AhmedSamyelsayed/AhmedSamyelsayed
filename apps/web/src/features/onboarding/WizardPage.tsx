import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCompany } from '@/features/company/CompanyProvider';
import { useCan } from '@/features/company/useCan';
import { InviteDialog } from '@/features/members/InviteDialog';
import { orgApi, useOrgMutation } from '@/features/org/api';
import { DepartmentsManager } from '@/features/org/DepartmentsManager';
import { EmployeesManager } from '@/features/org/EmployeesManager';
import { PositionsManager } from '@/features/org/PositionsManager';
import { CompanyProfileForm } from '@/features/settings/CompanyProfileForm';
import { WorkingTimeForm } from '@/features/settings/WorkingTimeForm';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { isWizardStep, nextStep, previousStep, WIZARD_STEPS, type WizardStep } from './steps';

export function WizardPage() {
  const { t } = useTranslation();
  const { step } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const { active, refresh } = useCompany();
  const saveStep = useOrgMutation((id, s: WizardStep) =>
    orgApi.updateCompany(id, { onboarding_step: s }),
  );

  if (!isWizardStep(step)) return <Navigate to="/onboarding/setup/profile" replace />;
  if (!can('org.manage')) return <Navigate to="/app/dashboard" replace />;

  async function goTo(target: WizardStep) {
    await saveStep.mutateAsync(target);
    await refresh();
    navigate(
      target === 'done' && step === 'done' ? '/app/dashboard' : `/onboarding/setup/${target}`,
    );
  }

  const next = () => void goTo(nextStep(step)).catch(() => undefined);
  const back = previousStep(step);
  const index = WIZARD_STEPS.indexOf(step);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b p-4">
        <span className="font-bold text-primary">
          {t('app.name')} · <span className="text-foreground">{active?.company.name_en}</span>
        </span>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button variant="ghost" size="sm" onClick={() => navigate('/app/dashboard')}>
            {t('wizard.later')}
          </Button>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 md:p-8">
        <ol className="flex flex-wrap gap-2" aria-label={t('wizard.progress')}>
          {WIZARD_STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={s === step ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1 text-xs',
                s === step && 'border-primary text-primary',
                i < index && 'text-muted-foreground',
              )}
            >
              {i < index ? <Check className="size-3" aria-hidden /> : <span>{i + 1}</span>}
              {t(`wizard.steps.${s}.short`)}
            </li>
          ))}
        </ol>
        <Card>
          <CardHeader>
            <CardTitle>{t(`wizard.steps.${step}.title`)}</CardTitle>
            <CardDescription>{t(`wizard.steps.${step}.body`)}</CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'profile' && (
              <CompanyProfileForm submitLabel={t('wizard.saveContinue')} onSaved={next} />
            )}
            {step === 'working-time' && <WorkingTimeForm submitLabel={t('wizard.saveHours')} />}
            {step === 'structure' && (
              <div className="flex flex-col gap-8">
                <section className="flex flex-col gap-3">
                  <h3 className="font-medium">{t('org.tab.departments')}</h3>
                  <DepartmentsManager />
                </section>
                <section className="flex flex-col gap-3">
                  <h3 className="font-medium">{t('org.tab.positions')}</h3>
                  <PositionsManager />
                </section>
              </div>
            )}
            {step === 'employees' && <EmployeesManager />}
            {step === 'team' && <TeamStep />}
            {step === 'done' && <DoneStep />}
          </CardContent>
        </Card>
        {step !== 'profile' && (
          <div className="flex justify-between">
            <Button
              variant="ghost"
              disabled={!back}
              onClick={() => back && navigate(`/onboarding/setup/${back}`)}
            >
              {t('common.back')}
            </Button>
            <Button disabled={saveStep.isPending} onClick={next}>
              {step === 'done' ? t('wizard.finish') : t('common.continue')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamStep() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm text-muted-foreground">{t('wizard.teamHint')}</p>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t('members.invite')}
      </Button>
      {open && <InviteDialog open defaultRole="hr_admin" onClose={() => setOpen(false)} />}
    </div>
  );
}

function DoneStep() {
  const { t } = useTranslation();
  return (
    <ul className="flex list-disc flex-col gap-2 ps-5 text-sm">
      <li>{t('wizard.doneJobAnalysis')}</li>
      <li>{t('wizard.doneAi')}</li>
      <li>{t('wizard.doneChange')}</li>
    </ul>
  );
}
