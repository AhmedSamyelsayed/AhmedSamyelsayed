import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/Field';
import { FormMessage } from '@/components/FormMessage';
import { QueryState } from '@/components/QueryState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';
import {
  orgApi,
  useCompanyRecord,
  useHolidays,
  useOrgMutation,
  type Company,
} from '@/features/org/api';
import { friendlyError } from '@/lib/errors';
import { useFormatDate, useLocalizedName } from '@/lib/useDate';
import { weekdayNames } from './options';

export function WorkingTimeForm({
  submitLabel,
  onSaved,
}: {
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const record = useCompanyRecord();
  return (
    <div className="flex flex-col gap-8">
      <QueryState loading={record.isLoading} error={record.error}>
        {record.data && (
          <HoursFields
            key={record.data.updated_at}
            company={record.data}
            submitLabel={submitLabel}
            onSaved={onSaved}
          />
        )}
      </QueryState>
      <HolidaysEditor />
    </div>
  );
}

function HoursFields({
  company,
  submitLabel,
  onSaved,
}: {
  company: Company;
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [weekend, setWeekend] = useState<number[]>(company.weekend_days);
  const [ft, setFt] = useState(String(company.ft_daily_hours));
  const [pt, setPt] = useState(String(company.pt_daily_hours));
  const [localError, setLocalError] = useState<string | null>(null);
  const save = useOrgMutation((id, patch: Parameters<typeof orgApi.updateCompany>[1]) =>
    orgApi.updateCompany(id, patch),
  );
  const days = weekdayNames(i18n.resolvedLanguage ?? 'en');
  // Show the week starting Sunday, the common MENA working week.
  const order = [0, 1, 2, 3, 4, 5, 6];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ftHours = Number(ft);
    const ptHours = Number(pt);
    if (!(ftHours > 0 && ftHours <= 24 && ptHours > 0 && ptHours <= 24)) {
      return setLocalError(t('settings.hoursRange'));
    }
    if (ptHours > ftHours) return setLocalError(t('settings.ptAboveFt'));
    if (weekend.length > 6) return setLocalError(t('settings.needWorkday'));
    setLocalError(null);
    await save.mutateAsync({
      weekend_days: [...weekend].sort(),
      ft_daily_hours: ftHours,
      pt_daily_hours: ptHours,
    });
    onSaved?.();
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={(e) => void onSubmit(e).catch(() => undefined)}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t('settings.weekend')}</legend>
        <div className="flex flex-wrap gap-2">
          {order.map((d) => {
            const checked = weekend.includes(d);
            return (
              <label
                key={d}
                className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${checked ? 'border-primary bg-primary/15 text-primary' : ''}`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() =>
                    setWeekend((w) => (checked ? w.filter((x) => x !== d) : [...w, d]))
                  }
                />
                {days[d]}
              </label>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{t('settings.weekendHint')}</p>
      </fieldset>
      <div className="grid gap-4 md:grid-cols-2">
        <Field id="ft" label={t('settings.ftHours')}>
          <Input
            id="ft"
            type="number"
            min={0.5}
            max={24}
            step={0.25}
            value={ft}
            onChange={(e) => setFt(e.target.value)}
          />
        </Field>
        <Field id="pt" label={t('settings.ptHours')}>
          <Input
            id="pt"
            type="number"
            min={0.5}
            max={24}
            step={0.25}
            value={pt}
            onChange={(e) => setPt(e.target.value)}
          />
        </Field>
      </div>
      <FormMessage
        kind="error"
        text={localError ?? (save.error ? friendlyError(save.error, t) : null)}
      />
      <Button type="submit" className="self-start" disabled={save.isPending}>
        {submitLabel ?? t('common.save')}
      </Button>
    </form>
  );
}

function HolidaysEditor() {
  const { t } = useTranslation();
  const holidays = useHolidays();
  const formatDate = useFormatDate();
  const localName = useLocalizedName();
  const [date, setDate] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const add = useOrgMutation(
    (id, h: { holiday_date: string; name_en: string; name_ar: string | null }) =>
      orgApi.addHoliday(id, h),
  );
  const remove = useOrgMutation((_id, holidayId: string) =>
    orgApi.deleteRow('company_holidays', holidayId),
  );

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    await add.mutateAsync({
      holiday_date: date,
      name_en: nameEn.trim(),
      name_ar: nameAr.trim() || null,
    });
    setDate('');
    setNameEn('');
    setNameAr('');
  }

  return (
    <section className="flex flex-col gap-4">
      <h3 className="font-medium">{t('settings.holidays')}</h3>
      <form
        className="grid gap-3 md:grid-cols-[10rem_1fr_1fr_auto] md:items-end"
        onSubmit={(e) => void onAdd(e).catch(() => undefined)}
      >
        <Field id="hDate" label={t('settings.date')}>
          <Input
            id="hDate"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field id="hEn" label={t('settings.holidayNameEn')}>
          <Input
            id="hEn"
            dir="ltr"
            required
            maxLength={120}
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
          />
        </Field>
        <Field id="hAr" label={t('settings.holidayNameAr')}>
          <Input
            id="hAr"
            dir="rtl"
            lang="ar"
            maxLength={120}
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="outline" disabled={add.isPending}>
          {t('common.add')}
        </Button>
      </form>
      <FormMessage kind="error" text={add.error ? friendlyError(add.error, t) : null} />
      <QueryState loading={holidays.isLoading} error={holidays.error}>
        {holidays.data?.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('settings.date')}</Th>
                <Th>{t('settings.holiday')}</Th>
                <Th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {holidays.data.map((h) => (
                <tr key={h.id}>
                  <Td>{formatDate(h.holiday_date)}</Td>
                  <Td>{localName(h.name_en, h.name_ar)}</Td>
                  <Td>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('common.delete')}
                      onClick={() => remove.mutate(h.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">{t('settings.noHolidays')}</p>
        )}
      </QueryState>
    </section>
  );
}
