import { ClipboardList, FileUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { QueryState } from '@/components/QueryState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, Td, Th } from '@/components/ui/table';
import { useCan } from '@/features/company/useCan';
import { useDepartments, usePositions } from '@/features/org/api';
import { useLocalizedName } from '@/lib/useDate';
import { useJobAnalysisSummaries, useSessions } from './api';
import { StartQuestionnaireDialog } from './StartQuestionnaireDialog';
import { UploadDialog } from './UploadDialog';

export function JobAnalysisOverview() {
  const { t } = useTranslation();
  const can = useCan();
  const name = useLocalizedName();
  const positions = usePositions();
  const departments = useDepartments();
  const summaries = useJobAnalysisSummaries();
  const sessions = useSessions();
  const [upload, setUpload] = useState<{ id: string; title: string } | null>(null);
  const [start, setStart] = useState<{ id: string; title: string } | null>(null);
  const canWrite = can('job_analysis.write');

  const byPosition = useMemo(() => {
    const map = new Map<
      string,
      { latest?: { version: number; status: string }; approved?: number; openSessions: string[] }
    >();
    for (const s of summaries.data ?? []) {
      const e = map.get(s.position_id) ?? { openSessions: [] };
      if (!e.latest) e.latest = { version: s.version, status: s.status };
      if (s.status === 'approved') e.approved = s.version;
      map.set(s.position_id, e);
    }
    for (const s of sessions.data ?? []) {
      if (s.status !== 'open' && s.status !== 'submitted') continue;
      const e = map.get(s.position_id) ?? { openSessions: [] };
      e.openSessions.push(s.id);
      map.set(s.position_id, e);
    }
    return map;
  }, [summaries.data, sessions.data]);
  const deptById = useMemo(
    () => new Map(departments.data?.map((d) => [d.id, d]) ?? []),
    [departments.data],
  );
  const approvedCount = (positions.data ?? []).filter((p) => byPosition.get(p.id)?.approved).length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {t('jobAnalysis.progress', { approved: approvedCount, total: positions.data?.length ?? 0 })}
      </p>
      <QueryState
        loading={positions.isLoading || summaries.isLoading}
        error={positions.error ?? summaries.error}
      >
        {positions.data?.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('org.position')}</Th>
                <Th>{t('org.department')}</Th>
                <Th>{t('jobAnalysis.status')}</Th>
                <Th>{t('jobAnalysis.questionnaire')}</Th>
                {canWrite && <Th className="w-64" />}
              </tr>
            </thead>
            <tbody>
              {positions.data.map((p) => {
                const s = byPosition.get(p.id);
                const dept = p.department_id ? deptById.get(p.department_id) : undefined;
                const title = name(p.title_en, p.title_ar);
                return (
                  <tr key={p.id}>
                    <Td>
                      <Link
                        className="text-primary hover:underline"
                        to={`/app/job-analysis/${p.id}`}
                      >
                        {title}
                      </Link>
                    </Td>
                    <Td>{dept ? name(dept.name_en, dept.name_ar) : '—'}</Td>
                    <Td className="whitespace-nowrap">
                      {s?.approved ? (
                        <Badge tone="success">
                          {t('jobAnalysis.approvedV', { v: s.approved })}
                        </Badge>
                      ) : null}
                      {s?.latest && s.latest.status === 'draft' ? (
                        <Badge tone="warn" className="ms-1">
                          {t('jobAnalysis.draftV', { v: s.latest.version })}
                        </Badge>
                      ) : null}
                      {!s?.latest && <Badge>{t('jobAnalysis.none')}</Badge>}
                    </Td>
                    <Td>
                      {s?.openSessions.length ? (
                        <Link
                          className="text-primary hover:underline"
                          to={`/app/job-analysis/questionnaire/${s.openSessions[0]}`}
                        >
                          {t('jobAnalysis.openQuestionnaire')}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </Td>
                    {canWrite && (
                      <Td className="whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setUpload({ id: p.id, title })}
                        >
                          <FileUp className="size-4" aria-hidden />
                          {t('jobAnalysis.upload')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setStart({ id: p.id, title })}
                        >
                          <ClipboardList className="size-4" aria-hidden />
                          {t('jobAnalysis.questionnaire')}
                        </Button>
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">{t('org.noPositions')}</p>
        )}
      </QueryState>
      {upload && (
        <UploadDialog
          positionId={upload.id}
          positionTitle={upload.title}
          onClose={() => setUpload(null)}
        />
      )}
      {start && (
        <StartQuestionnaireDialog
          positionId={start.id}
          positionTitle={start.title}
          onClose={() => setStart(null)}
        />
      )}
    </div>
  );
}

export function JobAnalysisListPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={t('nav.jobAnalysis')} description={t('jobAnalysis.description')} />
      <JobAnalysisOverview />
    </div>
  );
}
