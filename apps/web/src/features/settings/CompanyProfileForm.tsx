import { companyStoragePath } from '@figure/shared';
import { Upload } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/Field';
import { FormMessage } from '@/components/FormMessage';
import { QueryState } from '@/components/QueryState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useCompany } from '@/features/company/CompanyProvider';
import { orgApi, useCompanyRecord, useOrgMutation, type Company } from '@/features/org/api';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { COUNTRY_CODES, countryName, timeZones } from './options';
import { useLogoUrl } from './useLogoUrl';

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 5 * 1024 * 1024;

export function CompanyProfileForm({
  submitLabel,
  onSaved,
}: {
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const record = useCompanyRecord();
  return (
    <QueryState loading={record.isLoading} error={record.error}>
      {record.data && (
        <ProfileFields
          key={record.data.updated_at}
          company={record.data}
          submitLabel={submitLabel}
          onSaved={onSaved}
        />
      )}
    </QueryState>
  );
}

function ProfileFields({
  company,
  submitLabel,
  onSaved,
}: {
  company: Company;
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { refresh } = useCompany();
  const [nameEn, setNameEn] = useState(company.name_en);
  const [nameAr, setNameAr] = useState(company.name_ar ?? '');
  const [industry, setIndustry] = useState(company.industry ?? '');
  const [country, setCountry] = useState(company.country);
  const [timezone, setTimezone] = useState(company.timezone);
  const [locale, setLocale] = useState(company.default_locale);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const logo = useLogoUrl(company.logo_path);
  const save = useOrgMutation((id, patch: Parameters<typeof orgApi.updateCompany>[1]) =>
    orgApi.updateCompany(id, patch),
  );

  async function onLogo(file: File | undefined) {
    setLogoError(null);
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) return setLogoError(t('settings.logoType'));
    if (file.size > LOGO_MAX_BYTES) return setLogoError(t('settings.logoSize'));
    setUploading(true);
    const ext = file.type.split('/')[1];
    const path = companyStoragePath(company.id, 'logo', `logo-${Date.now()}.${ext}`);
    const { error } = await supabase.storage
      .from('company-assets')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      setUploading(false);
      return setLogoError(friendlyError(error, t));
    }
    const previous = company.logo_path;
    try {
      await save.mutateAsync({ logo_path: path });
      if (previous) await supabase.storage.from('company-assets').remove([previous]);
      await refresh();
    } catch (e) {
      setLogoError(friendlyError(e, t));
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await save.mutateAsync({
      name_en: nameEn.trim(),
      name_ar: nameAr.trim() || null,
      industry: industry.trim() || null,
      country,
      timezone,
      default_locale: locale,
    });
    await refresh();
    onSaved?.();
  }

  const zones = timeZones();

  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={(e) => void onSubmit(e).catch(() => undefined)}
    >
      <div className="flex items-center gap-4 md:col-span-2">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {logo.data ? (
            <img src={logo.data} alt={t('settings.logo')} className="size-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">{t('settings.noLogo')}</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Button asChild variant="outline" size="sm" disabled={uploading}>
            <label className="cursor-pointer">
              <Upload className="size-4" aria-hidden />
              {uploading ? t('common.loading') : t('settings.uploadLogo')}
              <input
                type="file"
                accept={LOGO_TYPES.join(',')}
                className="sr-only"
                onChange={(e) => void onLogo(e.target.files?.[0])}
              />
            </label>
          </Button>
          <p className="text-xs text-muted-foreground">{t('settings.logoHint')}</p>
          <FormMessage kind="error" text={logoError} />
        </div>
      </div>
      <Field id="nameEn" label={t('onboarding.nameEn')}>
        <Input
          id="nameEn"
          dir="ltr"
          required
          maxLength={200}
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
        />
      </Field>
      <Field id="nameAr" label={t('onboarding.nameAr')}>
        <Input
          id="nameAr"
          dir="rtl"
          lang="ar"
          maxLength={200}
          value={nameAr}
          onChange={(e) => setNameAr(e.target.value)}
        />
      </Field>
      <Field id="industry" label={t('settings.industry')}>
        <Input
          id="industry"
          maxLength={120}
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
        />
      </Field>
      <Field id="country" label={t('settings.country')}>
        <Select id="country" value={country} onChange={(e) => setCountry(e.target.value)}>
          {[...new Set([country, ...COUNTRY_CODES])].map((c) => (
            <option key={c} value={c}>
              {countryName(c, i18n.resolvedLanguage ?? 'en')}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="timezone" label={t('settings.timezone')}>
        <Select
          id="timezone"
          dir="ltr"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          {[...new Set([timezone, ...zones])].map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="locale" label={t('settings.defaultLanguage')}>
        <Select id="locale" value={locale} onChange={(e) => setLocale(e.target.value)}>
          <option value="en">English</option>
          <option value="ar">العربية</option>
        </Select>
      </Field>
      <div className="flex flex-col gap-2 md:col-span-2">
        <FormMessage kind="error" text={save.error ? friendlyError(save.error, t) : null} />
        <Button type="submit" className="self-start" disabled={save.isPending || !nameEn.trim()}>
          {submitLabel ?? t('common.save')}
        </Button>
      </div>
    </form>
  );
}
