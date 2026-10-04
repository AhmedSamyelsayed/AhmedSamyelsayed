import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type AiTask = 'extract_job_analysis' | 'ja_questionnaire_next' | 'generate_job_analysis';

/** Error codes returned by the ai Edge Function, mapped to i18n keys in ai.errors.* */
export class AiCallError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export async function callAi<T>(
  task: AiTask,
  companyId: string,
  locale: string | undefined,
  input: Record<string, string>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('ai', {
    body: { task, companyId, locale: locale === 'ar' ? 'ar' : 'en', input },
  });
  if (error) {
    let code = 'internal_error';
    if (error instanceof FunctionsHttpError) {
      try {
        const body = (await error.context.json()) as { error?: string };
        code = body.error ?? code;
      } catch {
        // non-JSON error body
      }
    } else {
      code = 'network_error';
    }
    throw new AiCallError(code);
  }
  return data as T;
}
