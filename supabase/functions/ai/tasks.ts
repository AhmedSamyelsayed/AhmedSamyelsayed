// Task implementations. Every read and write goes through `caller` (the user's
// JWT, so RLS applies). `admin` (service role) is used only for writes the
// caller is not allowed to make directly, after access was proven via caller.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  followUpsSchema,
  type FollowUpQuestion,
  jobAnalysisContentSchema,
  normalizeJobAnalysis,
  toStructuredOutputSchema,
} from '../_shared/generated/job-analysis.ts';
import { documentToPart } from '../_shared/ai/extract.ts';
import {
  extractionContent,
  followUpContent,
  type Locale,
  type PositionContext,
  PROMPT_VERSION,
  questionnaireContent,
  systemForFollowUps,
  systemForJobAnalysis,
} from '../_shared/ai/prompts.ts';
import type { AIProvider, ContentPart } from '../_shared/ai/provider.ts';
import { runStructured, type RunResult } from '../_shared/ai/run.ts';
import {
  hasEnoughAnswers,
  mergeFollowUps,
  type QuestionTemplate,
  questionsAndAnswers,
} from '../_shared/ai/session.ts';

export class TaskError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export interface TaskDeps {
  caller: SupabaseClient;
  admin: SupabaseClient;
  provider: AIProvider;
  userId: string;
  companyId: string;
  locale: Locale;
  /** Receives usage for logging, including on failure paths after a call. */
  onUsage: (r: Pick<RunResult<unknown>, 'usage' | 'model'>) => void;
}

const JA_SCHEMA = toStructuredOutputSchema(jobAnalysisContentSchema);
const FOLLOWUP_SCHEMA = toStructuredOutputSchema(followUpsSchema);

async function must<T>(
  p: PromiseLike<{ data: T | null; error: unknown }>,
  notFound = 'not_found',
): Promise<T> {
  const { data, error } = await p;
  if (error || data === null) throw new TaskError(404, notFound);
  return data;
}

async function assertPermission(deps: TaskDeps, perm: string) {
  const { data } = await deps.caller.rpc('has_permission', {
    _company_id: deps.companyId,
    _perm: perm,
  });
  if (data !== true) throw new TaskError(403, 'forbidden');
}

async function positionContext(deps: TaskDeps, positionId: string): Promise<PositionContext> {
  const company = await must(
    deps.caller
      .from('companies')
      .select('name_en, industry, country')
      .eq('id', deps.companyId)
      .single<{
        name_en: string;
        industry: string | null;
        country: string;
      }>(),
  );
  const position = await must(
    deps.caller
      .from('positions')
      .select('id, title_en, title_ar, department_id, reports_to_position_id')
      .eq('id', positionId)
      .eq('company_id', deps.companyId)
      .single<{
        id: string;
        title_en: string;
        title_ar: string | null;
        department_id: string | null;
        reports_to_position_id: string | null;
      }>(),
    'position_not_found',
  );
  const [dept, parent, children] = await Promise.all([
    position.department_id
      ? deps.caller
          .from('departments')
          .select('name_en')
          .eq('id', position.department_id)
          .maybeSingle<{ name_en: string }>()
      : Promise.resolve({ data: null }),
    position.reports_to_position_id
      ? deps.caller
          .from('positions')
          .select('title_en')
          .eq('id', position.reports_to_position_id)
          .maybeSingle<{ title_en: string }>()
      : Promise.resolve({ data: null }),
    deps.caller
      .from('positions')
      .select('title_en')
      .eq('reports_to_position_id', position.id)
      .returns<{ title_en: string }[]>(),
  ]);
  return {
    companyName: company.name_en,
    industry: company.industry,
    country: company.country,
    titleEn: position.title_en,
    titleAr: position.title_ar,
    department: dept.data?.name_en ?? null,
    reportsTo: parent.data?.title_en ?? null,
    directReports: (children.data ?? []).map((c) => c.title_en),
  };
}

interface DocumentRow {
  id: string;
  type: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  position_id: string | null;
}

async function loadDocument(
  deps: TaskDeps,
  documentId: string,
): Promise<{ row: DocumentRow; part: ContentPart }> {
  const row = await must(
    deps.caller
      .from('documents')
      .select('id, type, storage_path, file_name, mime_type, position_id')
      .eq('id', documentId)
      .eq('company_id', deps.companyId)
      .single<DocumentRow>(),
    'document_not_found',
  );
  if (!['job_analysis', 'jd'].includes(row.type)) throw new TaskError(422, 'wrong_document_type');
  const { data: blob, error } = await deps.caller.storage
    .from('documents')
    .download(row.storage_path);
  if (error || !blob) throw new TaskError(404, 'file_not_found');
  try {
    return {
      row,
      part: await documentToPart(new Uint8Array(await blob.arrayBuffer()), row.mime_type),
    };
  } catch (e) {
    throw new TaskError(422, e instanceof Error ? e.message : 'unreadable_document');
  }
}

async function generateJobAnalysis(deps: TaskDeps, content: ContentPart[]) {
  const result = await runStructured(
    deps.provider,
    {
      system: systemForJobAnalysis(deps.locale),
      content,
      schema: JA_SCHEMA,
      maxTokens: 32_000,
      effort: 'medium',
    },
    jobAnalysisContentSchema,
  );
  deps.onUsage(result);
  return { analysis: normalizeJobAnalysis(result.data), result };
}

function generationMeta(deps: TaskDeps, result: RunResult<unknown>) {
  return {
    provider: deps.provider.name,
    model: result.model,
    prompt_version: PROMPT_VERSION,
    tokens_in: result.usage.tokensIn,
    tokens_out: result.usage.tokensOut,
  };
}

/** Path A: uploaded job analysis / JD -> draft job analysis. */
export async function extractJobAnalysis(deps: TaskDeps, input: { documentId: string }) {
  await assertPermission(deps, 'job_analysis.write');
  const { row, part } = await loadDocument(deps, input.documentId);
  if (!row.position_id) throw new TaskError(422, 'document_has_no_position');
  await deps.caller
    .from('documents')
    .update({ status: 'processing', error: null })
    .eq('id', row.id);
  try {
    const position = await positionContext(deps, row.position_id);
    const { analysis, result } = await generateJobAnalysis(
      deps,
      extractionContent(position, { fileName: row.file_name, part }),
    );
    const inserted = await must(
      deps.caller
        .from('job_analyses')
        .insert({
          company_id: deps.companyId,
          position_id: row.position_id,
          version: 0,
          source: 'upload',
          content: analysis,
          core_keywords: analysis.core_keywords,
          ancillary_keywords: analysis.ancillary_keywords,
          source_document_id: row.id,
          generation: generationMeta(deps, result),
        })
        .select('id')
        .single<{ id: string }>(),
      'save_failed',
    );
    await deps.caller.from('documents').update({ status: 'done' }).eq('id', row.id);
    return { jobAnalysisId: inserted.id };
  } catch (e) {
    await deps.caller
      .from('documents')
      .update({ status: 'failed', error: e instanceof Error ? e.message.slice(0, 200) : 'failed' })
      .eq('id', row.id);
    throw e;
  }
}

interface SessionRow {
  id: string;
  position_id: string;
  status: string;
  answers: Record<string, unknown>;
  followups: FollowUpQuestion[];
  jd_document_id: string | null;
}

async function loadSession(deps: TaskDeps, sessionId: string) {
  const session = await must(
    deps.caller
      .from('ja_sessions')
      .select('id, position_id, status, answers, followups, jd_document_id')
      .eq('id', sessionId)
      .eq('company_id', deps.companyId)
      .single<SessionRow>(),
    'session_not_found',
  );
  const templates = await must(
    deps.caller
      .from('ja_question_templates')
      .select('key, sort_order, text_en, text_ar, company_id')
      .eq('active', true)
      .or(`company_id.is.null,company_id.eq.${deps.companyId}`)
      .returns<QuestionTemplate[]>(),
  );
  return { session, templates };
}

/** Questionnaire: propose follow-up questions (respondent or HR). */
export async function nextQuestions(deps: TaskDeps, input: { sessionId: string }) {
  // Readable only by HR or the assigned respondent (RLS), which is the access check.
  const { session, templates } = await loadSession(deps, input.sessionId);
  if (session.status !== 'open') throw new TaskError(409, 'session_not_open');
  const position = await positionContext(deps, session.position_id).catch(() => {
    throw new TaskError(403, 'forbidden');
  });
  const qa = questionsAndAnswers(templates, session.answers, session.followups, deps.locale);
  const result = await runStructured(
    deps.provider,
    {
      system: systemForFollowUps(deps.locale),
      content: followUpContent(position, qa),
      schema: FOLLOWUP_SCHEMA,
      maxTokens: 4_000,
      effort: 'low',
    },
    followUpsSchema,
  );
  deps.onUsage(result);
  const followups = mergeFollowUps(
    session.followups,
    result.data.questions,
    templates.map((t) => t.key),
  );
  // Respondents cannot update sessions directly; access was proven above.
  const { error } = await deps.admin
    .from('ja_sessions')
    .update({ followups })
    .eq('id', session.id)
    .eq('status', 'open');
  if (error) throw new TaskError(500, 'save_failed');
  return { done: result.data.done || followups.length === session.followups.length, followups };
}

/** Path B: questionnaire answers (+ optional JD) -> draft job analysis. */
export async function generateFromQuestionnaire(deps: TaskDeps, input: { sessionId: string }) {
  await assertPermission(deps, 'job_analysis.write');
  const { session, templates } = await loadSession(deps, input.sessionId);
  if (!['open', 'submitted'].includes(session.status)) throw new TaskError(409, 'session_not_open');
  if (!hasEnoughAnswers(session.answers)) throw new TaskError(422, 'not_enough_answers');
  const position = await positionContext(deps, session.position_id);
  const jd = session.jd_document_id ? await loadDocument(deps, session.jd_document_id) : null;
  const qa = questionsAndAnswers(templates, session.answers, session.followups, deps.locale);
  const { analysis, result } = await generateJobAnalysis(
    deps,
    questionnaireContent(
      position,
      qa,
      jd ? { fileName: jd.row.file_name, part: jd.part } : undefined,
    ),
  );
  const inserted = await must(
    deps.caller
      .from('job_analyses')
      .insert({
        company_id: deps.companyId,
        position_id: session.position_id,
        version: 0,
        source: 'questionnaire',
        content: analysis,
        core_keywords: analysis.core_keywords,
        ancillary_keywords: analysis.ancillary_keywords,
        ja_session_id: session.id,
        source_document_id: session.jd_document_id,
        generation: generationMeta(deps, result),
      })
      .select('id')
      .single<{ id: string }>(),
    'save_failed',
  );
  await deps.caller.from('ja_sessions').update({ status: 'generated' }).eq('id', session.id);
  return { jobAnalysisId: inserted.id };
}
