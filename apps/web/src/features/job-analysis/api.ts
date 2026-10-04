import {
  companyStoragePath,
  emptyJobAnalysis,
  jobAnalysisContentSchema,
  normalizeJobAnalysis,
  type FollowUpQuestion,
  type JobAnalysisContent,
} from '@figure/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCompany } from '@/features/company/CompanyProvider';
import { callAi } from '@/lib/ai';
import type { Database, Json } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

type Tables = Database['public']['Tables'];
export type JobAnalysisRow = Tables['job_analyses']['Row'];
export type SessionRow = Tables['ja_sessions']['Row'];
export type QuestionTemplate = Tables['ja_question_templates']['Row'];

export const JA_FILE_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
export const JA_MAX_BYTES = 20 * 1024 * 1024;

function useCompanyId() {
  const { active } = useCompany();
  return active!.company.id;
}

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

/** Parses stored content; missing fields are filled with empty defaults. */
export function readContent(row: Pick<JobAnalysisRow, 'content'>): JobAnalysisContent {
  const merged = { ...emptyJobAnalysis(), ...(row.content as object) };
  const parsed = jobAnalysisContentSchema.safeParse(merged);
  return parsed.success ? parsed.data : emptyJobAnalysis();
}

export const jaKeys = {
  all: (c: string) => ['ja', c] as const,
  list: (c: string) => ['ja', c, 'list'] as const,
  position: (c: string, p: string) => ['ja', c, 'position', p] as const,
  sessions: (c: string) => ['ja', c, 'sessions'] as const,
  session: (c: string, s: string) => ['ja', c, 'session', s] as const,
  templates: (c: string) => ['ja', c, 'templates'] as const,
};

/** Latest version per position (for the overview table). */
export function useJobAnalysisSummaries() {
  const id = useCompanyId();
  return useQuery({
    queryKey: jaKeys.list(id),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('job_analyses')
          .select('id, position_id, version, status, source, updated_at')
          .eq('company_id', id)
          .order('version', { ascending: false }),
      ) as Pick<
        JobAnalysisRow,
        'id' | 'position_id' | 'version' | 'status' | 'source' | 'updated_at'
      >[],
  });
}

export function usePositionAnalyses(positionId: string) {
  const id = useCompanyId();
  return useQuery({
    queryKey: jaKeys.position(id, positionId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('job_analyses')
          .select('*')
          .eq('company_id', id)
          .eq('position_id', positionId)
          .order('version', { ascending: false }),
      ) as JobAnalysisRow[],
  });
}

export function useSessions() {
  const id = useCompanyId();
  return useQuery({
    queryKey: jaKeys.sessions(id),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('ja_sessions')
          .select('*')
          .eq('company_id', id)
          .order('created_at', { ascending: false }),
      ) as SessionRow[],
  });
}

export function useSession(sessionId: string) {
  const id = useCompanyId();
  return useQuery({
    queryKey: jaKeys.session(id, sessionId),
    queryFn: async () =>
      unwrap(
        await supabase.from('ja_sessions').select('*').eq('id', sessionId).single(),
      ) as SessionRow,
  });
}

export function useQuestionTemplates() {
  const id = useCompanyId();
  return useQuery({
    queryKey: jaKeys.templates(id),
    queryFn: async () => {
      const rows = unwrap(
        await supabase
          .from('ja_question_templates')
          .select('*')
          .eq('active', true)
          .or(`company_id.is.null,company_id.eq.${id}`),
      ) as QuestionTemplate[];
      // Company questions override global ones with the same key.
      const byKey = new Map<string, QuestionTemplate>();
      for (const r of [...rows].sort((a, b) => Number(!!a.company_id) - Number(!!b.company_id)))
        byKey.set(r.key, r);
      return [...byKey.values()].sort((a, b) => a.sort_order - b.sort_order);
    },
  });
}

export function followUpsOf(session: Pick<SessionRow, 'followups'>): FollowUpQuestion[] {
  return Array.isArray(session.followups)
    ? (session.followups as unknown as FollowUpQuestion[])
    : [];
}

function useInvalidate() {
  const id = useCompanyId();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: jaKeys.all(id) });
}

/** Upload a JA/JD file, register it, and ask the AI to extract a draft. */
export function useExtractFromUpload() {
  const id = useCompanyId();
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { file: File; positionId: string; type: 'job_analysis' | 'jd' }) => {
      const documentId = await uploadJaDocument(id, user!.id, v.file, v.positionId, v.type);
      return callAi<{ jobAnalysisId: string }>('extract_job_analysis', id, i18n.resolvedLanguage, {
        documentId,
      });
    },
    onSettled: invalidate,
  });
}

export async function uploadJaDocument(
  companyId: string,
  userId: string,
  file: File,
  positionId: string,
  type: 'job_analysis' | 'jd',
): Promise<string> {
  const ext = JA_FILE_TYPES[file.type];
  if (!ext) throw Object.assign(new Error('unsupported_type'), { code: 'unsupported_type' });
  if (file.size > JA_MAX_BYTES) throw Object.assign(new Error('too_large'), { code: 'too_large' });
  const path = companyStoragePath(companyId, 'job-analysis', `${crypto.randomUUID()}.${ext}`);
  const up = await supabase.storage
    .from('documents')
    .upload(path, file, { contentType: file.type });
  if (up.error) throw up.error;
  const row = unwrap(
    await supabase
      .from('documents')
      .insert({
        company_id: companyId,
        uploaded_by: userId,
        type,
        storage_path: path,
        file_name: file.name.slice(0, 255),
        mime_type: file.type,
        size_bytes: file.size,
        position_id: positionId,
      })
      .select('id')
      .single(),
  ) as { id: string };
  return row.id;
}

export function useStartSession() {
  const id = useCompanyId();
  const { user } = useAuth();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: {
      positionId: string;
      respondentUserId: string | null;
      jdFile?: File;
    }) => {
      const jdId = v.jdFile
        ? await uploadJaDocument(id, user!.id, v.jdFile, v.positionId, 'jd')
        : null;
      const row = unwrap(
        await supabase
          .from('ja_sessions')
          .insert({
            company_id: id,
            position_id: v.positionId,
            respondent_user_id: v.respondentUserId,
            jd_document_id: jdId,
          })
          .select('id')
          .single(),
      ) as { id: string };
      return row.id;
    },
    onSuccess: invalidate,
  });
}

export function useSaveAnswers(sessionId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: {
      answers: Record<string, string>;
      followups: Record<string, string>;
      submit: boolean;
    }) =>
      unwrap(
        await supabase.rpc('save_ja_answers', {
          _session_id: sessionId,
          _answers: v.answers,
          _followup_answers: v.followups,
          _submit: v.submit,
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useAiFollowUps(sessionId: string) {
  const id = useCompanyId();
  const { i18n } = useTranslation();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () =>
      callAi<{ done: boolean; followups: FollowUpQuestion[] }>(
        'ja_questionnaire_next',
        id,
        i18n.resolvedLanguage,
        {
          sessionId,
        },
      ),
    onSuccess: invalidate,
  });
}

export function useGenerateFromSession(sessionId: string) {
  const id = useCompanyId();
  const { i18n } = useTranslation();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () =>
      callAi<{ jobAnalysisId: string }>('generate_job_analysis', id, i18n.resolvedLanguage, {
        sessionId,
      }),
    onSettled: invalidate,
  });
}

export function useSaveDraft() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { id: string; content: JobAnalysisContent }) => {
      const content = normalizeJobAnalysis(jobAnalysisContentSchema.parse(v.content));
      return unwrap(
        await supabase
          .from('job_analyses')
          .update({
            content: content as unknown as Json,
            core_keywords: content.core_keywords,
            ancillary_keywords: content.ancillary_keywords,
          })
          .eq('id', v.id),
      );
    },
    onSuccess: invalidate,
  });
}

/** New manual draft, copied from an existing version or empty. */
export function useCreateDraft() {
  const id = useCompanyId();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { positionId: string; content: JobAnalysisContent }) =>
      (
        unwrap(
          await supabase
            .from('job_analyses')
            .insert({
              company_id: id,
              position_id: v.positionId,
              version: 0,
              source: 'manual',
              content: v.content as unknown as Json,
              core_keywords: v.content.core_keywords,
              ancillary_keywords: v.content.ancillary_keywords,
            })
            .select('id')
            .single(),
        ) as { id: string }
      ).id,
    onSuccess: invalidate,
  });
}

export function useApprove() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (jobAnalysisId: string) =>
      unwrap(await supabase.rpc('approve_job_analysis', { _job_analysis_id: jobAnalysisId })),
    onSuccess: invalidate,
  });
}

export function useDeleteDraft() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (jobAnalysisId: string) =>
      unwrap(await supabase.from('job_analyses').delete().eq('id', jobAnalysisId)),
    onSuccess: invalidate,
  });
}
