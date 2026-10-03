import { createCompanySchema } from '@figure/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FormMessage } from '@/components/FormMessage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { useFormStatus } from '@/features/auth/useFormStatus';
import { useCompany } from '@/features/company/CompanyProvider';
import { supabase } from '@/lib/supabase';

/**
 * Onboarding step 1: create the tenant. The create_company RPC makes the
 * caller its company_owner atomically. Remaining wizard steps land in Phase 1.
 */
export function CreateCompanyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refresh, selectCompany } = useCompany();
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [isPersonal, setIsPersonal] = useState(false);
  const { pending, error, run } = useFormStatus();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const input = createCompanySchema.parse({ nameEn, nameAr: nameAr || undefined, isPersonal });
    let companyId: string | null = null;
    const ok = await run(async () => {
      const res = await supabase.rpc('create_company', {
        _name_en: input.nameEn,
        _name_ar: input.nameAr ?? null,
        _is_personal: input.isPersonal,
      });
      companyId = res.data;
      return res;
    });
    if (ok && companyId) {
      selectCompany(companyId);
      await refresh();
      navigate('/app/dashboard', { replace: true });
    }
  }

  return (
    <AuthLayout title={t('onboarding.title')} description={t('onboarding.subtitle')}>
      <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="nameEn">{t('onboarding.nameEn')}</Label>
          <Input
            id="nameEn"
            dir="ltr"
            required
            maxLength={200}
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="nameAr">{t('onboarding.nameAr')}</Label>
          <Input
            id="nameAr"
            dir="rtl"
            lang="ar"
            maxLength={200}
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
          />
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={isPersonal}
            onChange={(e) => setIsPersonal(e.target.checked)}
          />
          <span>
            {t('onboarding.personal')}
            <span className="block text-xs text-muted-foreground">
              {t('onboarding.personalHint')}
            </span>
          </span>
        </label>
        <FormMessage kind="error" text={error} />
        <Button type="submit" disabled={pending || !nameEn.trim()}>
          {t('onboarding.create')}
        </Button>
      </form>
    </AuthLayout>
  );
}
