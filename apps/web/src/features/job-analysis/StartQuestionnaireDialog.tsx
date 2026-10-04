import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Field } from '@/components/Field';
import { FormMessage } from '@/components/FormMessage';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useEmployees } from '@/features/org/api';
import { friendlyError } from '@/lib/errors';
import { JA_FILE_TYPES, JA_MAX_BYTES, useStartSession } from './api';

/** Path B: start a guided questionnaire, answered by HR or a chosen person. */
export function StartQuestionnaireDialog({
  positionId,
  positionTitle,
  onClose,
}: {
  positionId: string;
  positionTitle: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const employees = useEmployees();
  const [respondent, setRespondent] = useState('');
  const [jd, setJd] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const start = useStartSession();

  // Holders of this position first, then anyone else with an account.
  const candidates = useMemo(() => {
    const withAccount = (employees.data ?? []).filter((e) => e.user_id && e.status === 'active');
    return [
      ...withAccount.filter((e) => e.position_id === positionId),
      ...withAccount.filter((e) => e.position_id !== positionId),
    ];
  }, [employees.data, positionId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const sessionId = await start.mutateAsync({
      positionId,
      respondentUserId: respondent || null,
      jdFile: jd ?? undefined,
    });
    onClose();
    navigate(`/app/job-analysis/questionnaire/${sessionId}`);
  }

  return (
    <Dialog open onClose={onClose} title={t('jobAnalysis.startTitle', { position: positionTitle })}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => void onSubmit(e).catch(() => undefined)}
      >
        <p className="text-sm text-muted-foreground">{t('jobAnalysis.startHint')}</p>
        <Field
          id="ja-respondent"
          label={t('jobAnalysis.respondent')}
          hint={t('jobAnalysis.respondentHint')}
        >
          <Select
            id="ja-respondent"
            value={respondent}
            onChange={(e) => setRespondent(e.target.value)}
          >
            <option value="">{t('jobAnalysis.respondentMe')}</option>
            {candidates.map((e) => (
              <option key={e.id} value={e.user_id!}>
                {e.full_name}
                {e.position_id === positionId ? ` · ${t('jobAnalysis.holder')}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="ja-jd" label={t('jobAnalysis.attachJd')} hint={t('jobAnalysis.attachJdHint')}>
          <Input
            id="ja-jd"
            type="file"
            accept={Object.keys(JA_FILE_TYPES).join(',')}
            onChange={(e) => {
              const f = e.target.files?.[0];
              setFileError(null);
              setJd(null);
              if (!f) return;
              if (!JA_FILE_TYPES[f.type]) return setFileError(t('ai.errors.unsupported_type'));
              if (f.size > JA_MAX_BYTES) return setFileError(t('jobAnalysis.tooLarge'));
              setJd(f);
            }}
          />
        </Field>
        <FormMessage
          kind="error"
          text={fileError ?? (start.error ? friendlyError(start.error, t) : null)}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={start.isPending}>
            {t('jobAnalysis.start')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
