import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Field } from '@/components/Field';
import { FormMessage } from '@/components/FormMessage';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { friendlyError } from '@/lib/errors';
import { AiBusy } from './AiBusy';
import { JA_FILE_TYPES, JA_MAX_BYTES, useExtractFromUpload } from './api';

/** Path A: upload an existing job analysis or JD and let Claude draft the analysis. */
export function UploadDialog({
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
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<'job_analysis' | 'jd'>('job_analysis');
  const [fileError, setFileError] = useState<string | null>(null);
  const extract = useExtractFromUpload();

  function pick(f: File | undefined) {
    setFileError(null);
    setFile(null);
    if (!f) return;
    if (!JA_FILE_TYPES[f.type]) return setFileError(t('ai.errors.unsupported_type'));
    if (f.size > JA_MAX_BYTES) return setFileError(t('jobAnalysis.tooLarge'));
    setFile(f);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    const { jobAnalysisId } = await extract.mutateAsync({ file, positionId, type });
    onClose();
    navigate(`/app/job-analysis/${positionId}?version=${jobAnalysisId}`);
  }

  return (
    <Dialog
      open
      onClose={extract.isPending ? () => undefined : onClose}
      title={t('jobAnalysis.uploadTitle', { position: positionTitle })}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => void onSubmit(e).catch(() => undefined)}
      >
        <p className="text-sm text-muted-foreground">{t('jobAnalysis.uploadHint')}</p>
        <Field id="ja-doc-type" label={t('jobAnalysis.documentType')}>
          <Select
            id="ja-doc-type"
            value={type}
            disabled={extract.isPending}
            onChange={(e) => setType(e.target.value as 'job_analysis' | 'jd')}
          >
            <option value="job_analysis">{t('jobAnalysis.docJobAnalysis')}</option>
            <option value="jd">{t('jobAnalysis.docJd')}</option>
          </Select>
        </Field>
        <Field id="ja-file" label={t('jobAnalysis.file')} hint={t('jobAnalysis.fileHint')}>
          <Input
            id="ja-file"
            type="file"
            disabled={extract.isPending}
            accept={Object.keys(JA_FILE_TYPES).join(',')}
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </Field>
        <FormMessage
          kind="error"
          text={fileError ?? (extract.error ? friendlyError(extract.error, t) : null)}
        />
        {extract.isPending && <AiBusy />}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={extract.isPending} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!file || extract.isPending}>
            {t('jobAnalysis.analyze')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
