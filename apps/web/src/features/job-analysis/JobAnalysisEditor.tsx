import {
  DUTY_FREQUENCIES,
  KPI_FREQUENCIES,
  TASK_TYPES,
  type Duty,
  type JobAnalysisContent,
  type Kpi,
} from '@figure/shared';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, Td, Th } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { KeywordEditor } from './KeywordEditor';

type ListKey =
  | 'responsibilities'
  | 'decisions_independent'
  | 'decisions_approval'
  | 'direct_reports'
  | 'contacts_internal'
  | 'contacts_external'
  | 'tools'
  | 'certifications'
  | 'skills';

const textArea =
  'min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="border-b pb-1 font-medium">{title}</h3>
      {children}
    </section>
  );
}

/** Structured editor (or read-only view) for a job analysis. */
export function JobAnalysisEditor({
  value,
  onChange,
  readOnly,
}: {
  value: JobAnalysisContent;
  onChange: (next: JobAnalysisContent) => void;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const set = <K extends keyof JobAnalysisContent>(key: K, v: JobAnalysisContent[K]) =>
    onChange({ ...value, [key]: v });
  const setDuty = (i: number, patch: Partial<Duty>) =>
    set(
      'duties',
      value.duties.map((d, j) => (j === i ? { ...d, ...patch } : d)),
    );
  const setKpi = (i: number, patch: Partial<Kpi>) =>
    set(
      'kpis',
      value.kpis.map((k, j) => (j === i ? { ...k, ...patch } : k)),
    );
  const dutyTotal = value.duties.reduce((n, d) => n + d.time_percent, 0);
  const kpiTotal = value.kpis.reduce((n, k) => n + k.weight, 0);

  const listField = (key: ListKey) => (
    <Field
      id={`ja-${key}`}
      label={t(`jobAnalysis.fields.${key}`)}
      hint={readOnly ? undefined : t('jobAnalysis.onePerLine')}
    >
      <textarea
        id={`ja-${key}`}
        dir="auto"
        className={textArea}
        disabled={readOnly}
        value={value[key].join('\n')}
        onChange={(e) =>
          set(
            key,
            e.target.value
              .split('\n')
              .map((s) => s.trimStart())
              .filter((s, i, a) => s || i === a.length - 1),
          )
        }
      />
    </Field>
  );

  const total = (n: number) => (
    <span className={cn('text-xs', Math.round(n) === 100 ? 'text-emerald-400' : 'text-amber-400')}>
      {t('jobAnalysis.total', { n: Math.round(n) })}
    </span>
  );

  return (
    <div className="flex flex-col gap-8">
      {value.review_notes.trim() && (
        <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden />
          <div>
            <p className="font-medium text-amber-300">{t('jobAnalysis.reviewNotes')}</p>
            <p className="mt-1 whitespace-pre-line" dir="auto">
              {value.review_notes}
            </p>
          </div>
        </div>
      )}

      <Section title={t('jobAnalysis.sections.purpose')}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="ja-purpose-en" label={t('jobAnalysis.fields.purpose_en')}>
            <textarea
              id="ja-purpose-en"
              dir="ltr"
              className={textArea}
              disabled={readOnly}
              value={value.purpose_en}
              onChange={(e) => set('purpose_en', e.target.value)}
            />
          </Field>
          <Field id="ja-purpose-ar" label={t('jobAnalysis.fields.purpose_ar')}>
            <textarea
              id="ja-purpose-ar"
              dir="rtl"
              lang="ar"
              className={textArea}
              disabled={readOnly}
              value={value.purpose_ar}
              onChange={(e) => set('purpose_ar', e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section title={t('jobAnalysis.sections.duties')}>
        <div className="flex items-center justify-between">{total(dutyTotal)}</div>
        <Table>
          <thead>
            <tr>
              <Th>{t('jobAnalysis.fields.title_en')}</Th>
              <Th>{t('jobAnalysis.fields.title_ar')}</Th>
              <Th className="w-24">{t('jobAnalysis.fields.time_percent')}</Th>
              <Th className="w-32">{t('jobAnalysis.fields.frequency')}</Th>
              <Th className="w-32">{t('jobAnalysis.fields.type')}</Th>
              {!readOnly && <Th className="w-12" />}
            </tr>
          </thead>
          <tbody>
            {value.duties.map((d, i) => (
              <tr key={i}>
                <Td>
                  <Input
                    aria-label={t('jobAnalysis.fields.title_en')}
                    dir="ltr"
                    disabled={readOnly}
                    value={d.title_en}
                    onChange={(e) => setDuty(i, { title_en: e.target.value })}
                  />
                </Td>
                <Td>
                  <Input
                    aria-label={t('jobAnalysis.fields.title_ar')}
                    dir="rtl"
                    lang="ar"
                    disabled={readOnly}
                    value={d.title_ar}
                    onChange={(e) => setDuty(i, { title_ar: e.target.value })}
                  />
                </Td>
                <Td>
                  <Input
                    aria-label={t('jobAnalysis.fields.time_percent')}
                    type="number"
                    min={0}
                    max={100}
                    disabled={readOnly}
                    value={d.time_percent}
                    onChange={(e) => setDuty(i, { time_percent: Number(e.target.value) })}
                  />
                </Td>
                <Td>
                  <Select
                    aria-label={t('jobAnalysis.fields.frequency')}
                    disabled={readOnly}
                    value={d.frequency}
                    onChange={(e) => setDuty(i, { frequency: e.target.value as Duty['frequency'] })}
                  >
                    {DUTY_FREQUENCIES.map((f) => (
                      <option key={f} value={f}>
                        {t(`jobAnalysis.freq.${f}`)}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td>
                  <Select
                    aria-label={t('jobAnalysis.fields.type')}
                    disabled={readOnly}
                    value={d.type}
                    onChange={(e) => setDuty(i, { type: e.target.value as Duty['type'] })}
                  >
                    {TASK_TYPES.map((x) => (
                      <option key={x} value={x}>
                        {t(`jobAnalysis.taskType.${x}`)}
                      </option>
                    ))}
                  </Select>
                </Td>
                {!readOnly && (
                  <Td>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('common.delete')}
                      onClick={() =>
                        set(
                          'duties',
                          value.duties.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() =>
              set('duties', [
                ...value.duties,
                {
                  title_en: '',
                  title_ar: '',
                  description: '',
                  time_percent: 0,
                  frequency: 'daily',
                  type: 'core',
                },
              ])
            }
          >
            <Plus className="size-4" aria-hidden />
            {t('jobAnalysis.addDuty')}
          </Button>
        )}
      </Section>

      <Section title={t('jobAnalysis.sections.kpis')}>
        <div className="flex items-center justify-between">{total(kpiTotal)}</div>
        <Table>
          <thead>
            <tr>
              <Th>{t('jobAnalysis.fields.name_en')}</Th>
              <Th>{t('jobAnalysis.fields.name_ar')}</Th>
              <Th className="w-24">{t('jobAnalysis.fields.unit')}</Th>
              <Th className="w-28">{t('jobAnalysis.fields.target')}</Th>
              <Th className="w-32">{t('jobAnalysis.fields.frequency')}</Th>
              <Th className="w-24">{t('jobAnalysis.fields.weight')}</Th>
              {!readOnly && <Th className="w-12" />}
            </tr>
          </thead>
          <tbody>
            {value.kpis.map((k, i) => (
              <tr key={i}>
                <Td>
                  <Input
                    aria-label={t('jobAnalysis.fields.name_en')}
                    dir="ltr"
                    disabled={readOnly}
                    value={k.name_en}
                    onChange={(e) => setKpi(i, { name_en: e.target.value })}
                  />
                </Td>
                <Td>
                  <Input
                    aria-label={t('jobAnalysis.fields.name_ar')}
                    dir="rtl"
                    lang="ar"
                    disabled={readOnly}
                    value={k.name_ar}
                    onChange={(e) => setKpi(i, { name_ar: e.target.value })}
                  />
                </Td>
                <Td>
                  <Input
                    aria-label={t('jobAnalysis.fields.unit')}
                    dir="auto"
                    disabled={readOnly}
                    value={k.unit}
                    onChange={(e) => setKpi(i, { unit: e.target.value })}
                  />
                </Td>
                <Td>
                  <Input
                    aria-label={t('jobAnalysis.fields.target')}
                    dir="auto"
                    disabled={readOnly}
                    value={k.target}
                    onChange={(e) => setKpi(i, { target: e.target.value })}
                  />
                </Td>
                <Td>
                  <Select
                    aria-label={t('jobAnalysis.fields.frequency')}
                    disabled={readOnly}
                    value={k.frequency}
                    onChange={(e) => setKpi(i, { frequency: e.target.value as Kpi['frequency'] })}
                  >
                    {KPI_FREQUENCIES.map((f) => (
                      <option key={f} value={f}>
                        {t(`jobAnalysis.freq.${f}`)}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td>
                  <Input
                    aria-label={t('jobAnalysis.fields.weight')}
                    type="number"
                    min={0}
                    max={100}
                    disabled={readOnly}
                    value={k.weight}
                    onChange={(e) => setKpi(i, { weight: Number(e.target.value) })}
                  />
                </Td>
                {!readOnly && (
                  <Td>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('common.delete')}
                      onClick={() =>
                        set(
                          'kpis',
                          value.kpis.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() =>
              set('kpis', [
                ...value.kpis,
                {
                  name_en: '',
                  name_ar: '',
                  description: '',
                  unit: '%',
                  target: '',
                  frequency: 'monthly',
                  weight: 0,
                },
              ])
            }
          >
            <Plus className="size-4" aria-hidden />
            {t('jobAnalysis.addKpi')}
          </Button>
        )}
        {!readOnly && (
          <p className="text-xs text-muted-foreground">{t('jobAnalysis.weightsHint')}</p>
        )}
      </Section>

      <Section title={t('jobAnalysis.sections.keywords')}>
        <p className="text-xs text-muted-foreground">{t('jobAnalysis.keywordsHint')}</p>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="ja-core" label={t('jobAnalysis.fields.core_keywords')}>
            <KeywordEditor
              id="ja-core"
              tone="core"
              readOnly={readOnly}
              value={value.core_keywords}
              onChange={(v) => set('core_keywords', v)}
            />
          </Field>
          <Field id="ja-anc" label={t('jobAnalysis.fields.ancillary_keywords')}>
            <KeywordEditor
              id="ja-anc"
              tone="ancillary"
              readOnly={readOnly}
              value={value.ancillary_keywords}
              onChange={(v) => set('ancillary_keywords', v)}
            />
          </Field>
        </div>
      </Section>

      <Section title={t('jobAnalysis.sections.scope')}>
        <div className="grid gap-4 md:grid-cols-2">
          {listField('responsibilities')}
          {listField('tools')}
          {listField('decisions_independent')}
          {listField('decisions_approval')}
          {listField('contacts_internal')}
          {listField('contacts_external')}
          <Field id="ja-reports-to" label={t('jobAnalysis.fields.reports_to')}>
            <Input
              id="ja-reports-to"
              dir="auto"
              disabled={readOnly}
              value={value.reports_to}
              onChange={(e) => set('reports_to', e.target.value)}
            />
          </Field>
          {listField('direct_reports')}
        </div>
      </Section>

      <Section title={t('jobAnalysis.sections.requirements')}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="ja-education" label={t('jobAnalysis.fields.education')}>
            <Input
              id="ja-education"
              dir="auto"
              disabled={readOnly}
              value={value.education}
              onChange={(e) => set('education', e.target.value)}
            />
          </Field>
          <Field id="ja-experience" label={t('jobAnalysis.fields.experience')}>
            <Input
              id="ja-experience"
              dir="auto"
              disabled={readOnly}
              value={value.experience}
              onChange={(e) => set('experience', e.target.value)}
            />
          </Field>
          {listField('certifications')}
          {listField('skills')}
          <div className="md:col-span-2">
            <Field id="ja-conditions" label={t('jobAnalysis.fields.working_conditions')}>
              <textarea
                id="ja-conditions"
                dir="auto"
                className={textArea}
                disabled={readOnly}
                value={value.working_conditions}
                onChange={(e) => set('working_conditions', e.target.value)}
              />
            </Field>
          </div>
        </div>
      </Section>

      {!readOnly && (
        <Section title={t('jobAnalysis.reviewNotes')}>
          <textarea
            aria-label={t('jobAnalysis.reviewNotes')}
            dir="auto"
            className={textArea}
            value={value.review_notes}
            onChange={(e) => set('review_notes', e.target.value)}
          />
        </Section>
      )}
    </div>
  );
}
