import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FormMessage } from '@/components/FormMessage';
import { PageHeader } from '@/components/PageHeader';
import { QueryState } from '@/components/QueryState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCan } from '@/features/company/useCan';
import { usePositions } from '@/features/org/api';
import { friendlyError } from '@/lib/errors';
import { useLocalizedName } from '@/lib/useDate';
import { AiBusy } from './AiBusy';
import {
  followUpsOf,
  useAiFollowUps,
  useGenerateFromSession,
  useQuestionTemplates,
  useSaveAnswers,
  useSession,
  type QuestionTemplate,
  type SessionRow,
} from './api';

export function QuestionnairePage() {
  const { sessionId = '' } = useParams();
  const session = useSession(sessionId);
  const templates = useQuestionTemplates();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <QueryState
        loading={session.isLoading || templates.isLoading}
        error={session.error ?? templates.error}
      >
        {session.data && templates.data && (
          <QuestionnaireForm
            key={session.data.updated_at}
            session={session.data}
            templates={templates.data}
          />
        )}
      </QueryState>
    </div>
  );
}

const textArea =
  'min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70';

function QuestionnaireForm({
  session,
  templates,
}: {
  session: SessionRow;
  templates: QuestionTemplate[];
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const can = useCan();
  const name = useLocalizedName();
  const positions = usePositions();
  const ar = i18n.resolvedLanguage === 'ar';
  const initialAnswers = (session.answers ?? {}) as Record<string, string>;
  const initialFollowUps = followUpsOf(session);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [followAnswers, setFollowAnswers] = useState<Record<string, string>>(
    Object.fromEntries(initialFollowUps.map((f) => [f.key, f.answer ?? ''])),
  );
  const [saved, setSaved] = useState(false);
  const save = useSaveAnswers(session.id);
  const followUps = useAiFollowUps(session.id);
  const generate = useGenerateFromSession(session.id);
  const canWrite = can('job_analysis.write');
  const open = session.status === 'open';
  const position = positions.data?.find((p) => p.id === session.position_id);
  const error = save.error ?? followUps.error ?? generate.error;
  const busy = save.isPending || followUps.isPending || generate.isPending;

  const persist = (submit: boolean) =>
    save.mutateAsync({ answers, followups: followAnswers, submit }).then(() => setSaved(true));

  async function askFollowUps() {
    await persist(false);
    await followUps.mutateAsync();
  }

  async function generateAnalysis() {
    if (open) await persist(false);
    const { jobAnalysisId } = await generate.mutateAsync();
    navigate(`/app/job-analysis/${session.position_id}?version=${jobAnalysisId}`);
  }

  const question = (en: string, arText: string) => (ar && arText ? arText : en);

  return (
    <>
      <PageHeader
        title={t('jobAnalysis.questionnaireTitle', {
          position: position ? name(position.title_en, position.title_ar) : '',
        })}
        description={t('jobAnalysis.questionnaireHint')}
      />
      <div className="flex items-center gap-2">
        <Badge tone={open ? 'warn' : 'success'}>
          {t(`jobAnalysis.sessionStatus.${session.status}`)}
        </Badge>
        {canWrite && (
          <Link
            className="text-sm text-primary hover:underline"
            to={`/app/job-analysis/${session.position_id}`}
          >
            {t('jobAnalysis.viewPosition')}
          </Link>
        )}
      </div>
      <Card>
        <CardContent className="flex flex-col gap-6 pt-6">
          {templates.map((q, i) => (
            <div key={q.key} className="flex flex-col gap-2">
              <label htmlFor={`q-${q.key}`} className="text-sm font-medium">
                {i + 1}. {question(q.text_en, q.text_ar)}
              </label>
              {(ar ? q.help_ar : q.help_en) && (
                <p className="text-xs text-muted-foreground">{ar ? q.help_ar : q.help_en}</p>
              )}
              <textarea
                id={`q-${q.key}`}
                dir="auto"
                className={textArea}
                disabled={!open || busy}
                maxLength={4000}
                value={answers[q.key] ?? ''}
                onChange={(e) => {
                  setSaved(false);
                  setAnswers((a) => ({ ...a, [q.key]: e.target.value }));
                }}
              />
            </div>
          ))}
          {initialFollowUps.length > 0 && (
            <div className="flex flex-col gap-6 border-t pt-6">
              <h2 className="flex items-center gap-2 font-medium">
                <Sparkles className="size-4 text-primary" aria-hidden />
                {t('jobAnalysis.followUps')}
              </h2>
              {initialFollowUps.map((f) => (
                <div key={f.key} className="flex flex-col gap-2">
                  <label htmlFor={`f-${f.key}`} className="text-sm font-medium">
                    {question(f.text_en, f.text_ar)}
                  </label>
                  <textarea
                    id={`f-${f.key}`}
                    dir="auto"
                    className={textArea}
                    disabled={!open || busy}
                    maxLength={4000}
                    value={followAnswers[f.key] ?? ''}
                    onChange={(e) => {
                      setSaved(false);
                      setFollowAnswers((a) => ({ ...a, [f.key]: e.target.value }));
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {followUps.data?.done && <FormMessage kind="info" text={t('jobAnalysis.noMoreFollowUps')} />}
      {saved && !busy && <FormMessage kind="info" text={t('jobAnalysis.saved')} />}
      <FormMessage kind="error" text={error ? friendlyError(error, t) : null} />
      {followUps.isPending && <AiBusy label={t('ai.thinkingFollowUps')} />}
      {generate.isPending && <AiBusy />}
      <div className="flex flex-wrap justify-end gap-2">
        {open && (
          <>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void persist(false).catch(() => undefined)}
            >
              {t('common.save')}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void askFollowUps().catch(() => undefined)}
            >
              <Sparkles className="size-4" aria-hidden />
              {t('jobAnalysis.askFollowUps')}
            </Button>
            {!canWrite && (
              <Button
                disabled={busy}
                onClick={() =>
                  window.confirm(t('jobAnalysis.confirmSubmit')) &&
                  void persist(true).catch(() => undefined)
                }
              >
                {t('jobAnalysis.submit')}
              </Button>
            )}
          </>
        )}
        {canWrite && session.status !== 'generated' && session.status !== 'cancelled' && (
          <Button disabled={busy} onClick={() => void generateAnalysis().catch(() => undefined)}>
            <Sparkles className="size-4" aria-hidden />
            {t('jobAnalysis.generate')}
          </Button>
        )}
      </div>
    </>
  );
}
