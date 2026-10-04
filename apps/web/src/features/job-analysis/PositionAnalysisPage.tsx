import { emptyJobAnalysis, type JobAnalysisContent } from '@figure/shared';
import { CheckCircle2, ClipboardList, Copy, FileUp, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { FormMessage } from '@/components/FormMessage';
import { PageHeader } from '@/components/PageHeader';
import { QueryState } from '@/components/QueryState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { useCan } from '@/features/company/useCan';
import { usePositions } from '@/features/org/api';
import { friendlyError } from '@/lib/errors';
import { useFormatDate, useLocalizedName } from '@/lib/useDate';
import {
  readContent,
  useApprove,
  useCreateDraft,
  useDeleteDraft,
  usePositionAnalyses,
  useSaveDraft,
  type JobAnalysisRow,
} from './api';
import { JobAnalysisEditor } from './JobAnalysisEditor';
import { StartQuestionnaireDialog } from './StartQuestionnaireDialog';
import { UploadDialog } from './UploadDialog';

export function PositionAnalysisPage() {
  const { positionId = '' } = useParams();
  const { t } = useTranslation();
  const name = useLocalizedName();
  const can = useCan();
  const positions = usePositions();
  const analyses = usePositionAnalyses(positionId);
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<'upload' | 'start' | null>(null);
  const create = useCreateDraft();

  const position = positions.data?.find((p) => p.id === positionId);
  const title = position ? name(position.title_en, position.title_ar) : '';
  const selected = useMemo(() => {
    const list = analyses.data ?? [];
    return (
      list.find((a) => a.id === params.get('version')) ??
      list.find((a) => a.status === 'draft') ??
      list.find((a) => a.status === 'approved') ??
      list[0]
    );
  }, [analyses.data, params]);
  const canWrite = can('job_analysis.write');

  async function newDraft(from?: JobAnalysisRow) {
    const id = await create.mutateAsync({
      positionId,
      content: from ? readContent(from) : emptyJobAnalysis(),
    });
    setParams({ version: id });
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={title || t('nav.jobAnalysis')}
        description={t('jobAnalysis.positionDescription')}
        actions={
          canWrite && (
            <>
              <Button variant="outline" onClick={() => setDialog('upload')}>
                <FileUp className="size-4" aria-hidden />
                {t('jobAnalysis.upload')}
              </Button>
              <Button variant="outline" onClick={() => setDialog('start')}>
                <ClipboardList className="size-4" aria-hidden />
                {t('jobAnalysis.questionnaire')}
              </Button>
              {!analyses.data?.some((a) => a.status === 'draft') && (
                <Button
                  variant="outline"
                  disabled={create.isPending}
                  onClick={() => void newDraft(selected).catch(() => undefined)}
                >
                  <Copy className="size-4" aria-hidden />
                  {selected ? t('jobAnalysis.newVersion') : t('jobAnalysis.writeManually')}
                </Button>
              )}
            </>
          )
        }
      />
      <Link to="/app/job-analysis" className="text-sm text-primary hover:underline">
        {t('jobAnalysis.backToList')}
      </Link>
      <FormMessage kind="error" text={create.error ? friendlyError(create.error, t) : null} />
      <QueryState loading={analyses.isLoading} error={analyses.error}>
        {selected ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Select
                aria-label={t('jobAnalysis.version')}
                className="w-auto"
                value={selected.id}
                onChange={(e) => setParams({ version: e.target.value })}
              >
                {analyses.data!.map((a) => (
                  <option key={a.id} value={a.id}>
                    {t('jobAnalysis.versionLabel', {
                      v: a.version,
                      status: t(`jobAnalysis.statusName.${a.status}`),
                    })}
                  </option>
                ))}
              </Select>
              <SourceBadge row={selected} />
            </div>
            <AnalysisCard
              key={selected.id + selected.updated_at}
              row={selected}
              canWrite={canWrite}
            />
          </>
        ) : (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              {t('jobAnalysis.emptyPosition')}
            </CardContent>
          </Card>
        )}
      </QueryState>
      {dialog === 'upload' && (
        <UploadDialog
          positionId={positionId}
          positionTitle={title}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'start' && (
        <StartQuestionnaireDialog
          positionId={positionId}
          positionTitle={title}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function SourceBadge({ row }: { row: JobAnalysisRow }) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const gen = row.generation as { model?: string } | null;
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Badge
        tone={row.status === 'approved' ? 'success' : row.status === 'draft' ? 'warn' : 'default'}
      >
        {t(`jobAnalysis.statusName.${row.status}`)}
      </Badge>
      {t(`jobAnalysis.source.${row.source}`)}
      {gen?.model && <span dir="ltr">· {gen.model}</span>}
      <span>· {formatDate(row.approved_at ?? row.updated_at)}</span>
    </span>
  );
}

function AnalysisCard({ row, canWrite }: { row: JobAnalysisRow; canWrite: boolean }) {
  const { t } = useTranslation();
  const [content, setContent] = useState<JobAnalysisContent>(() => readContent(row));
  const [dirty, setDirty] = useState(false);
  const save = useSaveDraft();
  const approve = useApprove();
  const remove = useDeleteDraft();
  const editable = canWrite && row.status === 'draft';
  const error = save.error ?? approve.error ?? remove.error;

  async function onApprove() {
    if (dirty) await save.mutateAsync({ id: row.id, content });
    await approve.mutateAsync(row.id);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 pt-6">
        {editable && (
          <div className="sticky top-0 z-10 -mx-6 -mt-6 flex flex-wrap items-center justify-end gap-2 rounded-t-xl border-b bg-card/95 px-6 py-3 backdrop-blur">
            <span className="me-auto text-xs text-muted-foreground">
              {dirty ? t('jobAnalysis.unsaved') : t('jobAnalysis.draftHint')}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={remove.isPending}
              onClick={() =>
                window.confirm(t('jobAnalysis.confirmDelete')) && remove.mutate(row.id)
              }
            >
              <Trash2 className="size-4" aria-hidden />
              {t('common.delete')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!dirty || save.isPending}
              onClick={() =>
                void save
                  .mutateAsync({ id: row.id, content })
                  .then(() => setDirty(false))
                  .catch(() => undefined)
              }
            >
              <Save className="size-4" aria-hidden />
              {t('common.save')}
            </Button>
            <Button
              size="sm"
              disabled={approve.isPending || save.isPending}
              onClick={() =>
                window.confirm(t('jobAnalysis.confirmApprove')) &&
                void onApprove().catch(() => undefined)
              }
            >
              <CheckCircle2 className="size-4" aria-hidden />
              {t('jobAnalysis.approve')}
            </Button>
          </div>
        )}
        <FormMessage kind="error" text={error ? friendlyError(error, t) : null} />
        <JobAnalysisEditor
          value={content}
          readOnly={!editable}
          onChange={(next) => {
            setContent(next);
            setDirty(true);
          }}
        />
      </CardContent>
    </Card>
  );
}
